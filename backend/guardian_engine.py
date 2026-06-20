"""VORTEXA Guardian — one on-device engine, five lenses, one Health Integrity Score.
Deterministic where it matters (score, fraud rule, consent, completeness); LLM only writes explanations.
"""
import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from .models import Patient, Prescription, HealthRecord, ConsentToken, Provider, AccessLog
from .crypto import decrypt_record
from .ai_agents import run_clinical_safety, run_health_insights

CONTROLLED_SUBSTANCES = [
    "oxycodone", "oxycontin", "hydrocodone", "vicodin", "fentanyl", "morphine", "codeine",
    "tramadol", "methadone", "hydromorphone", "oxymorphone", "adderall", "amphetamine",
    "methylphenidate", "ritalin", "alprazolam", "xanax", "diazepam", "valium", "lorazepam",
    "ativan", "clonazepam", "klonopin", "zolpidem", "ambien",
]

# drug -> chronic condition (deterministic "condition detection from medications")
CONDITION_MAP = {
    "metformin": "Type 2 diabetes", "insulin": "Diabetes", "glipizide": "Type 2 diabetes",
    "atorvastatin": "High cholesterol", "simvastatin": "High cholesterol", "rosuvastatin": "High cholesterol",
    "lisinopril": "Hypertension", "amlodipine": "Hypertension", "losartan": "Hypertension",
    "levothyroxine": "Hypothyroidism", "warfarin": "Anticoagulation therapy",
    "sertraline": "Depression / anxiety", "escitalopram": "Depression", "alprazolam": "Anxiety",
    "albuterol": "Asthma", "omeprazole": "Acid reflux / GERD",
}


def _collect_meds(rxs) -> list[dict]:
    meds = []
    for r in rxs:
        if r.extracted_meds:
            try:
                for m in json.loads(r.extracted_meds):
                    meds.append({"drug_name": m.get("drug", ""), "dosage": m.get("dosage", ""), "frequency": m.get("frequency", "")})
                continue
            except Exception:
                pass
        meds.append({"drug_name": r.drug_name, "dosage": r.dosage, "frequency": r.frequency})
    return meds


def _med_history(patient_id, db):
    history = []
    for r in db.query(Prescription).filter(Prescription.patient_id == patient_id).all():
        provider = db.query(Provider).filter(Provider.id == r.provider_id).first()
        pname = provider.name if provider else ("Uploaded PDF" if r.file_name else "Self")
        date = r.prescribed_date.strftime("%Y-%m-%d") if r.prescribed_date else ""
        if r.extracted_meds:
            try:
                for m in json.loads(r.extracted_meds):
                    history.append({"drug_name": m.get("drug", ""), "provider_name": pname, "date": date})
                continue
            except Exception:
                pass
        history.append({"drug_name": r.drug_name, "provider_name": pname, "date": date})
    return history


def _rule_fraud(history) -> list[dict]:
    by_drug = {}
    for h in history:
        name = (h.get("drug_name") or "").strip().lower()
        if name and any(c in name for c in CONTROLLED_SUBSTANCES):
            by_drug.setdefault(name, set()).add(h.get("provider_name", "Unknown"))
    flags = []
    for drug, providers in by_drug.items():
        if len(providers) >= 2:
            flags.append({
                "severity": "high",
                "pattern": "Duplicate controlled substance across providers",
                "details": (f"{drug.title()} was prescribed by multiple providers "
                            f"({', '.join(sorted(providers))}) — consistent with prescription shopping. "
                            f"Recommend PDMP cross-check."),
                "risk_score": 9,
            })
    return flags


def _detect_conditions(meds, profile) -> list[str]:
    found = []
    for m in meds:
        name = (m.get("drug_name") or "").lower()
        for drug, cond in CONDITION_MAP.items():
            if drug in name and cond not in found:
                found.append(cond)
    # honor explicit profile
    if str(profile.get("diabetic", "")).lower() == "diabetic" and "Type 2 diabetes" not in found:
        found.append("Type 2 diabetes")
    return found


def _consent_lens(patient_id, db) -> dict:
    now = datetime.utcnow()
    grants = db.query(ConsentToken).filter(
        ConsentToken.patient_id == patient_id, ConsentToken.granted == True, ConsentToken.revoked == False
    ).all()
    active, expiring, risky = [], [], []
    for t in grants:
        provider = db.query(Provider).filter(Provider.id == t.provider_id).first()
        entry = {"provider": provider.name if provider else "Unknown",
                 "provider_type": provider.provider_type if provider else "",
                 "scope": t.access_scope,
                 "expires_at": t.expires_at.isoformat() if t.expires_at else None}
        if t.expires_at and t.expires_at < now:
            risky.append({**entry, "reason": "Access is still active past its expiry window"})
        elif t.expires_at and (t.expires_at - now) <= timedelta(hours=6):
            mins = int((t.expires_at - now).total_seconds() // 60)
            expiring.append({**entry, "in_minutes": max(mins, 0)})
        else:
            active.append(entry)
    pending = db.query(ConsentToken).filter(
        ConsentToken.patient_id == patient_id, ConsentToken.granted == False, ConsentToken.revoked == False
    ).count()
    return {"active": active, "expiring": expiring, "risky": risky, "pending_count": pending}


def _timeline(patient_id, db) -> list[dict]:
    events = []
    for r in db.query(Prescription).filter(Prescription.patient_id == patient_id).all():
        if r.prescribed_date:
            events.append({"date": r.prescribed_date.isoformat(), "event": f"Prescription: {r.drug_name}", "kind": "rx"})
    for rec in db.query(HealthRecord).filter(HealthRecord.patient_id == patient_id).all():
        events.append({"date": rec.created_at.isoformat(), "event": f"Record added: {rec.title}", "kind": "record"})
    for log in db.query(AccessLog).filter(AccessLog.patient_id == patient_id,
                                          AccessLog.action.in_(["CONSENT_GRANTED", "CONSENT_REVOKED"])).all():
        events.append({"date": log.timestamp.isoformat(), "event": log.action.replace("_", " ").title(), "kind": "consent"})
    events.sort(key=lambda e: e["date"], reverse=True)
    return events[:8]


def _score(med_alerts, fraud_flags, consent, completeness_gaps) -> dict:
    score = 100
    breakdown = []

    med_pen = 0
    for a in med_alerts:
        sev = str(a.get("severity", "low")).lower()
        med_pen += 25 if sev == "high" else 10 if sev == "medium" else 3
    med_pen = min(med_pen, 50)
    if med_pen:
        score -= med_pen
        breakdown.append({"label": f"{len(med_alerts)} medication risk(s)", "delta": -med_pen})

    fraud_high = any(str(f.get("severity")).lower() == "high" for f in fraud_flags)
    fraud_med = any(str(f.get("severity")).lower() == "medium" for f in fraud_flags)
    if fraud_high:
        score -= 30; breakdown.append({"label": "High-risk fraud pattern", "delta": -30})
    elif fraud_med:
        score -= 12; breakdown.append({"label": "Suspicious activity", "delta": -12})

    risky_consent = len(consent["risky"])
    if risky_consent:
        pen = min(risky_consent * 15, 30)
        score -= pen; breakdown.append({"label": f"{risky_consent} stale access grant(s)", "delta": -pen})

    gap_pen = min(len(completeness_gaps) * 5, 15)
    if gap_pen:
        score -= gap_pen; breakdown.append({"label": "Incomplete record", "delta": -gap_pen})

    if not consent["risky"] and (consent["active"] or consent["expiring"]):
        score += 5; breakdown.append({"label": "Consents in good standing", "delta": +5})

    score = max(0, min(100, score))
    if score >= 80:
        status, label = "green", "Strong"
    elif score >= 50:
        status, label = "yellow", "Needs attention"
    else:
        status, label = "red", "At risk"
    return {"score": score, "status": status, "status_label": label, "breakdown": breakdown}


def build_report(patient_id: int, db: Session) -> dict:
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        return {}

    rxs = db.query(Prescription).filter(Prescription.patient_id == patient_id, Prescription.is_active == True).all()
    meds = _collect_meds(rxs)
    allergy_records = db.query(HealthRecord).filter(
        HealthRecord.patient_id == patient_id, HealthRecord.record_type == "allergy").all()
    allergies = [r.title for r in allergy_records]
    lab_records = db.query(HealthRecord).filter(
        HealthRecord.patient_id == patient_id, HealthRecord.record_type == "lab_report").all()
    labs = []
    for r in lab_records:
        try:
            labs.append({"title": r.title, "content": decrypt_record(r.encrypted_data, r.encryption_key)})
        except Exception:
            labs.append({"title": r.title, "content": ""})

    profile = {"blood_type": patient.blood_type, "diabetic": patient.diabetic,
               "chronic_conditions": patient.chronic_conditions}

    # Lens 1 — Medication safety (LLM)
    med_alerts = run_clinical_safety(meds, allergies) if meds else []

    # Lens 2 — Health insights (deterministic conditions + LLM narrative + deterministic timeline)
    conditions = _detect_conditions(meds, profile)
    insights = run_health_insights(profile, meds, labs)
    timeline = _timeline(patient_id, db)

    # Lens 3 — Fraud & abuse (deterministic rule)
    history = _med_history(patient_id, db)
    fraud_flags = _rule_fraud(history)
    fraud_status = "red" if any(str(f["severity"]).lower() == "high" for f in fraud_flags) else \
                   "yellow" if fraud_flags else "green"

    # Lens 4 — Consent intelligence (deterministic)
    consent = _consent_lens(patient_id, db)

    # Completeness gaps
    gaps = []
    if not lab_records: gaps.append("No lab reports on file")
    if not allergy_records: gaps.append("No allergies recorded")
    if not rxs: gaps.append("No active prescriptions")

    # Score
    score = _score(med_alerts, fraud_flags, consent, gaps)

    # Lens 5 — Recommendations (deterministic synthesis, ranked)
    recs = []
    for a in med_alerts:
        if str(a.get("severity")).lower() == "high":
            recs.append({"type": "health", "priority": "high",
                         "text": f"Discuss {a.get('drug','this combination')} with your doctor — {a.get('recommendation','review urgently')}"})
    if fraud_status == "red":
        recs.append({"type": "security", "priority": "high",
                     "text": "Flag the duplicate controlled-substance pattern with your pharmacist and prescribers."})
    for e in consent["expiring"]:
        recs.append({"type": "security", "priority": "medium",
                     "text": f"Access for {e['provider']} expires in {e['in_minutes']} min — renew or let it lapse."})
    for r in consent["risky"]:
        recs.append({"type": "security", "priority": "high",
                     "text": f"{r['provider']} still has access past expiry — revoke it in Consent."})
    for g in gaps:
        recs.append({"type": "completeness", "priority": "low", "text": f"{g} — add it so Guardian can analyze it."})
    if not recs:
        recs.append({"type": "health", "priority": "low", "text": "No action needed. Your vault is in good standing."})

    return {
        "integrity_score": score["score"],
        "status": score["status"],
        "status_label": score["status_label"],
        "breakdown": score["breakdown"],
        "generated_at": datetime.utcnow().isoformat(),
        "checked": {"prescriptions": len(history), "records": len(lab_records) + len(allergy_records), "meds": len(meds)},
        "sections": {
            "medication": {
                "status": "red" if any(str(a.get("severity")).lower() == "high" for a in med_alerts)
                          else "yellow" if med_alerts else "green",
                "alerts": med_alerts,
            },
            "health": {
                "summary": insights.get("summary", ""),
                "chronic_conditions": conditions,
                "lab_trends": insights.get("lab_trends", []),
                "timeline": timeline,
            },
            "fraud": {"status": fraud_status, "flags": fraud_flags},
            "consent": consent,
            "recommendations": recs,
        },
    }
