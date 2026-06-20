import json
import re
import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "qwen3"


def _ask_ollama(prompt: str) -> str:
    response = requests.post(
        OLLAMA_URL,
        # /no_think disables Qwen3's slow chain-of-thought so it returns clean JSON fast
        json={
            "model": MODEL,
            "prompt": prompt + "\n\n/no_think",
            "stream": False,
            "think": False,
            "options": {"temperature": 0.1},
        },
        timeout=300,
    )
    response.raise_for_status()
    return response.json()["response"]


def _extract_json(text: str) -> dict:
    # Drop any <think>…</think> reasoning blocks the model may still emit
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = re.sub(r"</?think>", "", text)
    # Strip markdown code fences if model wraps output in ```json ... ```
    text = re.sub(r"```(?:json)?", "", text).strip().rstrip("`").strip()
    # Grab the first balanced { ... } object
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            return {}
    return {}


def run_clinical_safety(medications: list[dict], allergies: list[str]) -> list[dict]:
    if not medications:
        return []

    med_text = "\n".join([f"- {m['drug_name']} {m.get('dosage','')} {m.get('frequency','')}" for m in medications])
    allergy_text = ", ".join(allergies) if allergies else "None reported"

    prompt = f"""You are a clinical pharmacist AI. Analyze this patient's medication profile for safety issues.

Medications:
{med_text}

Known allergies: {allergy_text}

Identify any: drug-drug interactions, allergy conflicts, duplicate medications, dangerous combinations.

Respond with ONLY a JSON object — no explanation, no markdown:
{{"alerts": [{{"severity": "high", "drug": "drug name(s)", "issue": "description", "recommendation": "action to take"}}]}}

Use severity "high" for life-threatening issues, "medium" for significant concerns, "low" for minor notes.
If no issues found, return: {{"alerts": []}}"""

    try:
        raw = _ask_ollama(prompt)
        result = _extract_json(raw)
        return result.get("alerts", [])
    except Exception as e:
        return [{"severity": "low", "drug": "N/A", "issue": f"AI analysis unavailable: {e}", "recommendation": "Run analysis again"}]


def parse_prescription(text: str) -> list[dict]:
    """Extract structured medication data from raw prescription text (on-device)."""
    if not text or not text.strip():
        return []

    prompt = f"""You are a medical prescription parser. Read the prescription text below and extract every medication.

Prescription text:
\"\"\"
{text}
\"\"\"

For each medication identify:
- drug: the drug name
- dosage: strength/amount (e.g. 500mg)
- frequency: how/when to take it (e.g. "Twice daily after meals")
- days: number of days the course lasts (just the number, e.g. 30)

Respond with ONLY a JSON object — no explanation, no markdown:
{{"meds": [{{"drug": "name", "dosage": "500mg", "frequency": "Twice daily", "days": "30"}}]}}

If nothing can be parsed, return {{"meds": []}}"""

    try:
        raw = _ask_ollama(prompt)
        result = _extract_json(raw)
        return result.get("meds", [])
    except Exception:
        return []


def run_health_insights(profile: dict, medications: list[dict], labs: list[dict]) -> dict:
    """On-device health narrative: history summary + lab-trend interpretation."""
    med_text = "\n".join(f"- {m.get('drug_name','')} {m.get('dosage','')} {m.get('frequency','')}" for m in medications) or "(none)"
    lab_text = "\n".join(f"- {l.get('title','')}: {l.get('content','')}" for l in labs) or "(none on file)"
    prof = (f"Blood group {profile.get('blood_type','?')}, "
            f"{profile.get('diabetic','status unknown')}, "
            f"known conditions: {profile.get('chronic_conditions') or 'none recorded'}.")

    prompt = f"""You are a clinical summarization AI. Write a brief, factual health overview for THIS patient only.

Profile: {prof}

Current medications:
{med_text}

Lab reports on file:
{lab_text}

Respond with ONLY JSON — no markdown:
{{"summary": "2-3 sentence plain-English overview of this patient's health picture",
  "lab_trends": [{{"name": "test name", "reading": "value", "direction": "up|down|stable", "note": "what it suggests"}}]}}

Only include lab_trends you can support from the lab text. If none, use an empty array."""

    try:
        result = _extract_json(_ask_ollama(prompt))
        return {"summary": result.get("summary", ""), "lab_trends": result.get("lab_trends", [])}
    except Exception:
        return {"summary": "", "lab_trends": []}


def run_fraud_scan(prescriptions: list[dict], health_records: list[dict]) -> dict:
    """Privacy-preserving fraud/anomaly scan over prescriptions AND health records.
    Returns {"summary": str, "flags": [...]}."""
    if not prescriptions and not health_records:
        return {"summary": "No prescriptions or records to analyze yet.", "flags": []}

    rx_lines = [
        f"- {p.get('drug_name','')} | {p.get('dosage','')} | {p.get('frequency','')} | "
        f"Provider: {p.get('provider_name','Unknown')} | Date: {p.get('date','')}"
        for p in prescriptions
    ] or ["(none)"]
    rec_lines = [f"- {r.get('record_type','')}: {r.get('title','')}" for r in health_records] or ["(none)"]

    prompt = f"""You are a healthcare fraud analyst AI running a privacy-preserving anomaly scan.

Prescription history:
{chr(10).join(rx_lines)}

Health records on file:
{chr(10).join(rec_lines)}

Scoring rules (follow strictly):
- NORMAL, do NOT flag: multiple different medications from the SAME provider, ongoing meds for chronic
  conditions (diabetes, cholesterol, thyroid, blood pressure), or a single course of a normal drug.
- HIGH severity: the SAME controlled substance (e.g. oxycodone, alprazolam, adderall, fentanyl) prescribed
  by DIFFERENT providers, or overlapping/early refills of a controlled substance. This is doctor-shopping.
- MEDIUM severity: unusually high frequency/quantity of any drug, or the same drug class from different
  providers at the same time.
- LOW severity: minor notes only.
- Only flag GENUINELY suspicious patterns. Do not invent concerns. Routine care = no flags.

Respond with ONLY a JSON object — no markdown:
{{"summary": "one short paragraph plain-English overall assessment of the patient's fraud/anomaly risk",
  "flags": [{{"severity": "high|medium|low", "pattern": "short name", "details": "what is suspicious and why", "risk_score": 1}}]}}

If nothing is suspicious, return an empty flags array and a reassuring summary explaining what was checked."""

    try:
        raw = _ask_ollama(prompt)
        result = _extract_json(raw)
        return {"summary": result.get("summary", ""), "flags": result.get("flags", [])}
    except Exception as e:
        return {"summary": f"Analysis unavailable: {e}", "flags": []}


def run_fraud_detection(prescriptions: list[dict]) -> list[dict]:
    if not prescriptions:
        return []

    lines = [
        f"- {p['drug_name']} | {p.get('dosage','')} | {p.get('frequency','')} | "
        f"Provider: {p.get('provider_name','Unknown')} | Date: {p.get('date','')}"
        for p in prescriptions
    ]
    history_text = "\n".join(lines)

    prompt = f"""You are a healthcare fraud analyst AI. Analyze this prescription history for suspicious patterns.

Prescription history:
{history_text}

Look for: duplicate controlled substances from multiple providers, overlapping prescriptions for the same drug, unusually high frequencies, prescription shopping patterns.

Respond with ONLY a JSON object — no explanation, no markdown:
{{"flags": [{{"severity": "high", "pattern": "pattern name", "details": "description", "risk_score": 8}}]}}

Use severity "high" for strong fraud indicators, "medium" for suspicious, "low" for minor anomalies.
risk_score should be an integer from 1-10.
If no suspicious patterns, return: {{"flags": []}}"""

    try:
        raw = _ask_ollama(prompt)
        result = _extract_json(raw)
        return result.get("flags", [])
    except Exception as e:
        return [{"severity": "low", "pattern": "Analysis error", "details": f"AI unavailable: {e}", "risk_score": 0}]
