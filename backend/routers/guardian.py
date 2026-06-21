import json
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from ..database import get_db, SessionLocal
from ..models import Patient, GuardianReport, AccessLog
from ..guardian_engine import build_report

router = APIRouter(prefix="/guardian", tags=["guardian"])


def _build_and_store(patient_id: int):
    db = SessionLocal()
    try:
        report = build_report(patient_id, db)
        if not report:
            return
        db.query(GuardianReport).filter(GuardianReport.patient_id == patient_id).delete()
        db.add(GuardianReport(
            patient_id=patient_id,
            integrity_score=report["integrity_score"],
            status=report["status"],
            status_label=report["status_label"],
            sections_json=json.dumps(report),
        ))
        db.add(AccessLog(patient_id=patient_id, action="GUARDIAN_RUN",
                         detail=f"Integrity score {report['integrity_score']} ({report['status'].upper()})"))
        db.commit()
    finally:
        db.close()


@router.post("/run/{patient_id}")
def run_guardian(patient_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if not db.query(Patient).filter(Patient.id == patient_id).first():
        raise HTTPException(404, "Patient not found")
    from .prescriptions import _run_clinical_check
    background_tasks.add_task(_run_clinical_check, patient_id)
    return {"status": "running"}


@router.get("/report/{patient_id}")
def get_report(patient_id: int, db: Session = Depends(get_db)):
    row = db.query(GuardianReport).filter(GuardianReport.patient_id == patient_id).order_by(
        GuardianReport.generated_at.desc()).first()
    if not row:
        return None
    return json.loads(row.sections_json)


@router.get("/score/{patient_id}")
def get_score(patient_id: int, db: Session = Depends(get_db)):
    row = db.query(GuardianReport).filter(GuardianReport.patient_id == patient_id).order_by(
        GuardianReport.generated_at.desc()).first()
    if not row:
        return {"integrity_score": None}
    data = json.loads(row.sections_json)
    return {"integrity_score": data["integrity_score"], "status": data["status"],
            "status_label": data["status_label"], "breakdown": data["breakdown"]}
