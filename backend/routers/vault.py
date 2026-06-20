import base64
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import HealthRecord, AccessLog
from ..schemas import VaultUpload
from ..crypto import encrypt_record, decrypt_record

router = APIRouter(prefix="/vault", tags=["vault"])


@router.post("/upload/{patient_id}")
def upload_record(patient_id: int, body: VaultUpload, db: Session = Depends(get_db)):
    encrypted, key = encrypt_record(body.content)
    record = HealthRecord(
        patient_id=patient_id,
        record_type=body.record_type,
        title=body.title,
        encrypted_data=encrypted,
        encryption_key=key,
    )
    db.add(record)
    db.add(AccessLog(patient_id=patient_id, action="VAULT_UPLOAD", detail=f"{body.record_type}: {body.title}"))
    db.commit()
    db.refresh(record)
    return {"id": record.id, "title": record.title, "record_type": record.record_type, "created_at": record.created_at.isoformat()}


@router.post("/upload-file/{patient_id}")
async def upload_file(
    patient_id: int,
    record_type: str = Form(...),
    title: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    raw = await file.read()
    # Encode the binary file as base64 text, then encrypt that string (AES-GCM)
    b64 = base64.b64encode(raw).decode()
    encrypted, key = encrypt_record(b64)
    record = HealthRecord(
        patient_id=patient_id,
        record_type=record_type,
        title=title,
        encrypted_data=encrypted,
        encryption_key=key,
        file_name=file.filename,
        mime_type=file.content_type or "application/pdf",
    )
    db.add(record)
    db.add(AccessLog(patient_id=patient_id, action="VAULT_UPLOAD_FILE", detail=f"{record_type}: {title} ({file.filename})"))
    db.commit()
    db.refresh(record)
    return {
        "id": record.id,
        "title": record.title,
        "record_type": record.record_type,
        "file_name": record.file_name,
        "created_at": record.created_at.isoformat(),
    }


@router.get("/records/{patient_id}")
def get_records(patient_id: int, db: Session = Depends(get_db)):
    records = db.query(HealthRecord).filter(HealthRecord.patient_id == patient_id).order_by(HealthRecord.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "record_type": r.record_type,
            "title": r.title,
            "is_file": bool(r.file_name),
            "file_name": r.file_name,
            "mime_type": r.mime_type,
            "created_at": r.created_at.isoformat(),
        }
        for r in records
    ]


@router.get("/records/{patient_id}/{record_id}/decrypt")
def decrypt_record_endpoint(patient_id: int, record_id: int, db: Session = Depends(get_db)):
    record = db.query(HealthRecord).filter(HealthRecord.id == record_id, HealthRecord.patient_id == patient_id).first()
    if not record:
        raise HTTPException(404, "Record not found")
    if record.file_name:
        raise HTTPException(400, "This record is a file — use the /file endpoint")
    db.add(AccessLog(patient_id=patient_id, action="VAULT_DECRYPT", detail=f"Record {record_id}: {record.title}"))
    db.commit()
    content = decrypt_record(record.encrypted_data, record.encryption_key)
    return {"id": record.id, "title": record.title, "record_type": record.record_type, "content": content}


@router.get("/records/{patient_id}/{record_id}/file")
def get_file(patient_id: int, record_id: int, db: Session = Depends(get_db)):
    record = db.query(HealthRecord).filter(HealthRecord.id == record_id, HealthRecord.patient_id == patient_id).first()
    if not record or not record.file_name:
        raise HTTPException(404, "File record not found")
    db.add(AccessLog(patient_id=patient_id, action="VAULT_FILE_VIEW", detail=f"Record {record_id}: {record.file_name}"))
    db.commit()
    b64 = decrypt_record(record.encrypted_data, record.encryption_key)
    raw = base64.b64decode(b64)
    return Response(
        content=raw,
        media_type=record.mime_type or "application/pdf",
        headers={"Content-Disposition": f'inline; filename="{record.file_name}"'},
    )
