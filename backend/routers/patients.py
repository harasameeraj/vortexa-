from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Patient, AccessLog
from ..schemas import OnboardRequest

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("/search")
def search_patient(code: str, db: Session = Depends(get_db)):
    """Providers locate a patient ONLY by their exact unique code — no directory listing."""
    code = (code or "").strip().upper()
    if not code:
        raise HTTPException(400, "Patient code required")
    p = db.query(Patient).filter(Patient.patient_code == code).first()
    if not p:
        raise HTTPException(404, "No patient found with that ID")
    # Minimal identity info only — no medical data until consent is granted
    return {"id": p.id, "name": p.name, "patient_code": p.patient_code}


@router.get("/{patient_id}")
def get_patient(patient_id: int, db: Session = Depends(get_db)):
    p = db.query(Patient).filter(Patient.id == patient_id).first()
    if not p:
        raise HTTPException(404, "Patient not found")
    return {
        "id": p.id,
        "patient_code": p.patient_code,
        "name": p.name,
        "email": p.email,
        "blood_type": p.blood_type,
        "dob": p.dob,
        "contact": p.contact,
        "diabetic": p.diabetic,
        "chronic_conditions": p.chronic_conditions,
        "onboarded": p.onboarded,
    }


@router.post("/{patient_id}/onboard")
def onboard_patient(patient_id: int, body: OnboardRequest, db: Session = Depends(get_db)):
    p = db.query(Patient).filter(Patient.id == patient_id).first()
    if not p:
        raise HTTPException(404, "Patient not found")
    if body.name:
        p.name = body.name
    if body.email:
        p.email = body.email
    p.contact = body.contact
    p.blood_type = body.blood_type
    p.diabetic = body.diabetic
    p.chronic_conditions = body.chronic_conditions
    p.onboarded = True
    db.add(AccessLog(patient_id=patient_id, action="ONBOARDING_COMPLETED", detail="Patient profile completed"))
    db.commit()
    return {"message": "Onboarding complete", "onboarded": True}
