import base64
import json
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db, SessionLocal
from ..models import Prescription, Patient, Provider, AccessLog, AIAlert, HealthRecord
from ..schemas import PrescriptionCreate
from ..ai_agents import run_clinical_safety, parse_prescription
from ..crypto import encrypt_record, decrypt_record
from ..pdf_utils import extract_text

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])


def _collect_meds(rxs) -> list[dict]:
    """Build the medication list for AI analysis from structured rows AND meds parsed from PDFs."""
    med_list = []
    for r in rxs:
        if r.extracted_meds:
            try:
                for m in json.loads(r.extracted_meds):
                    med_list.append({
                        "drug_name": m.get("drug", ""),
                        "dosage": m.get("dosage", ""),
                        "frequency": m.get("frequency", ""),
                    })
                continue
            except Exception:
                pass
        med_list.append({"drug_name": r.drug_name, "dosage": r.dosage, "frequency": r.frequency})
    return med_list


def _parse_pdf_meds(rx_id: int):
    """Background: extract text from the prescription PDF, parse meds, then re-run clinical safety."""
    db = SessionLocal()
    try:
        rx = db.query(Prescription).filter(Prescription.id == rx_id).first()
        if not rx or not rx.encrypted_data:
            return
        pdf_bytes = base64.b64decode(decrypt_record(rx.encrypted_data, rx.encryption_key))
        text = extract_text(pdf_bytes)
        meds = parse_prescription(text)
        rx.extracted_meds = json.dumps(meds)
        db.commit()
        patient_id = rx.patient_id
    finally:
        db.close()
    # Refresh clinical safety now that new meds are known
    _run_clinical_check(patient_id)


def _run_clinical_check(patient_id: int):
    """Runs in the background after a prescription is added so the API responds instantly."""
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return
        rxs = db.query(Prescription).filter(
            Prescription.patient_id == patient_id, Prescription.is_active == True
        ).all()
        med_list = _collect_meds(rxs)

        allergies = [
            rec.title for rec in db.query(HealthRecord).filter(
                HealthRecord.patient_id == patient_id, HealthRecord.record_type == "allergy"
            ).all()
        ]

        alerts = run_clinical_safety(med_list, allergies)

        # Replace previous clinical alerts (avoid duplicates accumulating on every add)
        db.query(AIAlert).filter(
            AIAlert.patient_id == patient_id, AIAlert.alert_type == "clinical"
        ).delete()
        for alert in alerts:
            db.add(AIAlert(
                patient_id=patient_id,
                alert_type="clinical",
                severity=alert.get("severity", "low"),
                drug=alert.get("drug", ""),
                issue=alert.get("issue", ""),
                recommendation=alert.get("recommendation", ""),
            ))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@router.post("/add/{patient_id}")
def add_prescription(patient_id: int, body: PrescriptionCreate, background_tasks: BackgroundTasks,
                     provider_id: int = None, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")

    rx = Prescription(
        patient_id=patient_id,
        provider_id=provider_id,
        drug_name=body.drug_name,
        dosage=body.dosage,
        frequency=body.frequency,
        duration=body.duration,
        notes=body.notes,
    )
    db.add(rx)
    db.add(AccessLog(patient_id=patient_id, action="PRESCRIPTION_ADDED", detail=f"Drug: {body.drug_name}"))
    db.commit()
    db.refresh(rx)

    # Run the AI clinical safety check asynchronously so this request returns immediately
    background_tasks.add_task(_run_clinical_check, patient_id)

    return {"id": rx.id, "drug_name": rx.drug_name, "message": "Prescription added — AI safety check running in background"}


@router.post("/upload-pdf/{patient_id}")
async def upload_prescription_pdf(
    patient_id: int,
    background_tasks: BackgroundTasks,
    drug_name: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")

    raw = await file.read()
    encrypted, key = encrypt_record(base64.b64encode(raw).decode())
    rx = Prescription(
        patient_id=patient_id,
        drug_name=drug_name.strip() or (file.filename or "Prescription Document"),
        notes="Uploaded prescription document",
        file_name=file.filename,
        mime_type=file.content_type or "application/pdf",
        encrypted_data=encrypted,
        encryption_key=key,
    )
    db.add(rx)
    db.add(AccessLog(patient_id=patient_id, action="PRESCRIPTION_PDF_UPLOADED", detail=f"{rx.drug_name} ({file.filename})"))
    db.commit()
    db.refresh(rx)

    # Read the PDF, extract the medications, and re-run clinical safety — all in the background
    background_tasks.add_task(_parse_pdf_meds, rx.id)

    return {"id": rx.id, "drug_name": rx.drug_name, "file_name": rx.file_name, "parsing": True}


@router.get("/{patient_id}/{rx_id}/file")
def get_prescription_file(patient_id: int, rx_id: int, db: Session = Depends(get_db)):
    rx = db.query(Prescription).filter(Prescription.id == rx_id, Prescription.patient_id == patient_id).first()
    if not rx or not rx.file_name:
        raise HTTPException(404, "Prescription file not found")
    db.add(AccessLog(patient_id=patient_id, action="PRESCRIPTION_FILE_VIEW", detail=f"Rx {rx_id}: {rx.file_name}"))
    db.commit()
    raw = base64.b64decode(decrypt_record(rx.encrypted_data, rx.encryption_key))
    return Response(content=raw, media_type=rx.mime_type or "application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{rx.file_name}"'})


@router.get("/list/{patient_id}")
def list_prescriptions(patient_id: int, db: Session = Depends(get_db)):
    rxs = db.query(Prescription).filter(Prescription.patient_id == patient_id).order_by(Prescription.prescribed_date.desc()).all()
    result = []
    for rx in rxs:
        provider_name = db.query(Provider).filter(Provider.id == rx.provider_id).first()
        result.append({
            "id": rx.id,
            "drug_name": rx.drug_name,
            "dosage": rx.dosage,
            "frequency": rx.frequency,
            "duration": rx.duration,
            "notes": rx.notes,
            "is_active": rx.is_active,
            "is_file": bool(rx.file_name),
            "file_name": rx.file_name,
            "extracted_meds": json.loads(rx.extracted_meds) if rx.extracted_meds else None,
            "prescribed_date": rx.prescribed_date.isoformat() if rx.prescribed_date else None,
            "provider_name": provider_name.name if provider_name else "Self",
            "date": rx.prescribed_date.strftime("%Y-%m-%d") if rx.prescribed_date else "",
        })
    return result
