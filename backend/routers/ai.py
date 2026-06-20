from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import json
from ..database import get_db
from ..models import Patient, Prescription, HealthRecord, AIAlert, Provider, AccessLog
from ..ai_agents import run_clinical_safety, run_fraud_detection, run_fraud_scan

router = APIRouter(prefix="/ai", tags=["ai"])


CONTROLLED_SUBSTANCES = [
    "oxycodone", "oxycontin", "hydrocodone", "vicodin", "fentanyl", "morphine", "codeine",
    "tramadol", "methadone", "hydromorphone", "oxymorphone", "adderall", "amphetamine",
    "methylphenidate", "ritalin", "alprazolam", "xanax", "diazepam", "valium", "lorazepam",
    "ativan", "clonazepam", "klonopin", "zolpidem", "ambien",
]


def _rule_based_flags(history: list[dict]) -> list[dict]:
    """Deterministic, privacy-preserving check: same controlled substance from multiple providers."""
    by_drug = {}
    for h in history:
        name = (h.get("drug_name") or "").strip().lower()
        if not name:
            continue
        if any(c in name for c in CONTROLLED_SUBSTANCES):
            by_drug.setdefault(name, set()).add(h.get("provider_name", "Unknown"))
    flags = []
    for drug, providers in by_drug.items():
        if len(providers) >= 2:
            flags.append({
                "severity": "high",
                "pattern": "Duplicate controlled substance across providers",
                "details": (f"{drug.title()} was prescribed by multiple providers "
                            f"({', '.join(sorted(providers))}). This pattern is consistent with "
                            f"prescription shopping for controlled substances and warrants PDMP review."),
                "risk_score": 9,
            })
    return flags


def _fraud_history(patient_id: int, db: Session) -> list[dict]:
    """Prescription history for fraud analysis — expands PDF-extracted meds into entries."""
    history = []
    for r in db.query(Prescription).filter(Prescription.patient_id == patient_id).all():
        provider = db.query(Provider).filter(Provider.id == r.provider_id).first()
        provider_name = provider.name if provider else ("Uploaded PDF" if r.file_name else "Self")
        date = r.prescribed_date.strftime("%Y-%m-%d") if r.prescribed_date else ""
        if r.extracted_meds:
            try:
                for m in json.loads(r.extracted_meds):
                    history.append({"drug_name": m.get("drug", ""), "dosage": m.get("dosage", ""),
                                    "frequency": m.get("frequency", ""), "provider_name": provider_name, "date": date})
                continue
            except Exception:
                pass
        history.append({"drug_name": r.drug_name, "dosage": r.dosage, "frequency": r.frequency,
                        "provider_name": provider_name, "date": date})
    return history


@router.get("/clinical-alerts/{patient_id}")
def get_clinical_alerts(patient_id: int, db: Session = Depends(get_db)):
    alerts = db.query(AIAlert).filter(
        AIAlert.patient_id == patient_id,
        AIAlert.alert_type == "clinical",
    ).order_by(AIAlert.created_at.desc()).all()
    return [
        {
            "id": a.id,
            "severity": a.severity,
            "drug": a.drug,
            "issue": a.issue,
            "recommendation": a.recommendation,
            "created_at": a.created_at.isoformat(),
        }
        for a in alerts
    ]


@router.get("/fraud-flags/{patient_id}")
def get_fraud_flags(patient_id: int, db: Session = Depends(get_db)):
    flags = db.query(AIAlert).filter(
        AIAlert.patient_id == patient_id,
        AIAlert.alert_type == "fraud",
    ).order_by(AIAlert.created_at.desc()).all()
    return [
        {
            "id": a.id,
            "severity": a.severity,
            "pattern": a.drug,
            "details": a.issue,
            "risk_score": a.recommendation,
            "created_at": a.created_at.isoformat(),
        }
        for a in flags
    ]


@router.post("/fraud-scan/{patient_id}")
def fraud_scan(patient_id: int, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")

    history = _fraud_history(patient_id, db)
    records = [{"record_type": r.record_type, "title": r.title}
               for r in db.query(HealthRecord).filter(HealthRecord.patient_id == patient_id).all()]

    result = run_fraud_scan(history, records)
    ai_flags = result.get("flags", [])

    # Deterministic rules catch the clear-cut cases the small model may miss
    rule_flags = _rule_based_flags(history)
    rule_drugs = {w for f in rule_flags for w in f["details"].lower().split()}
    # Drop AI flags that overlap a rule-detected controlled-substance issue (avoid duplicates)
    filtered_ai = [f for f in ai_flags
                   if not any(c in (str(f.get("pattern", "")) + str(f.get("details", ""))).lower()
                              for c in CONTROLLED_SUBSTANCES if c in rule_drugs)]
    flags = rule_flags + filtered_ai

    # Traffic-light status derived from the strongest flag
    severities = [str(f.get("severity", "low")).lower() for f in flags]
    if "high" in severities:
        status = "red"
    elif "medium" in severities:
        status = "yellow"
    else:
        status = "green"

    if rule_flags:
        # Rule fired — describe the concrete high-risk finding (don't trust an over-reassuring AI summary)
        summary = "High-risk prescription pattern detected. " + " ".join(f["details"] for f in rule_flags)
    else:
        summary = (result.get("summary") or "").strip()
    if not summary:
        if status == "green":
            summary = (f"No suspicious activity detected across {len(history)} prescription record(s) and "
                       f"{len(records)} health record(s). No duplicate controlled substances, no multi-provider "
                       f"overlaps, and no abnormal frequencies or insurance anomalies were found.")
        elif status == "yellow":
            summary = "Some patterns warrant attention. Review the flagged items below."
        else:
            summary = "High-risk patterns detected. Review the flagged items below immediately."

    # Replace previous fraud alerts
    db.query(AIAlert).filter(AIAlert.patient_id == patient_id, AIAlert.alert_type == "fraud").delete()
    for f in flags:
        db.add(AIAlert(patient_id=patient_id, alert_type="fraud", severity=f.get("severity", "low"),
                       drug=f.get("pattern", ""), issue=f.get("details", ""), recommendation=str(f.get("risk_score", ""))))
    db.add(AccessLog(patient_id=patient_id, action="FRAUD_SCAN", detail=f"Status: {status.upper()} · {len(flags)} flag(s)"))
    db.commit()

    return {"status": status, "summary": summary, "flags": [
        {"severity": f.get("severity", "low"), "pattern": f.get("pattern", ""),
         "details": f.get("details", ""), "risk_score": f.get("risk_score", "")} for f in flags
    ], "checked": {"prescriptions": len(history), "records": len(records)}}


@router.post("/run-analysis/{patient_id}")
def run_analysis(patient_id: int, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")

    rxs = db.query(Prescription).filter(Prescription.patient_id == patient_id, Prescription.is_active == True).all()
    allergy_records = db.query(HealthRecord).filter(
        HealthRecord.patient_id == patient_id, HealthRecord.record_type == "allergy"
    ).all()
    allergies = [r.title for r in allergy_records]

    from .prescriptions import _collect_meds
    med_list = _collect_meds(rxs)

    # Build prescription history with provider info for fraud detection
    rx_history = []
    for r in db.query(Prescription).filter(Prescription.patient_id == patient_id).all():
        provider = db.query(Provider).filter(Provider.id == r.provider_id).first()
        rx_history.append({
            "drug_name": r.drug_name,
            "dosage": r.dosage,
            "frequency": r.frequency,
            "provider_name": provider.name if provider else "Unknown",
            "date": r.prescribed_date.strftime("%Y-%m-%d") if r.prescribed_date else "",
        })

    clinical_alerts = run_clinical_safety(med_list, allergies)
    fraud_flags = run_fraud_detection(rx_history)

    # Clear old AI alerts for this patient before saving new ones
    db.query(AIAlert).filter(AIAlert.patient_id == patient_id).delete()

    for alert in clinical_alerts:
        db.add(AIAlert(
            patient_id=patient_id,
            alert_type="clinical",
            severity=alert.get("severity", "low"),
            drug=alert.get("drug", ""),
            issue=alert.get("issue", ""),
            recommendation=alert.get("recommendation", ""),
        ))

    for flag in fraud_flags:
        db.add(AIAlert(
            patient_id=patient_id,
            alert_type="fraud",
            severity=flag.get("severity", "low"),
            drug=flag.get("pattern", ""),
            issue=flag.get("details", ""),
            recommendation=str(flag.get("risk_score", "")),
        ))

    db.commit()
    return {
        "clinical_alerts": len(clinical_alerts),
        "fraud_flags": len(fraud_flags),
        "message": "Analysis complete",
    }
