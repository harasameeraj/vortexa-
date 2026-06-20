import base64
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ConsentToken, Patient, Provider, AccessLog, Prescription, HealthRecord
from ..schemas import ConsentRequest, ConsentSign, ConsentRevoke
from ..crypto import verify_signature, decrypt_record

router = APIRouter(prefix="/consent", tags=["consent"])


def _valid_consent(provider_id: int, patient_id: int, db: Session):
    """Returns the active granted consent token or raises 403."""
    ct = db.query(ConsentToken).filter(
        ConsentToken.provider_id == provider_id,
        ConsentToken.patient_id == patient_id,
        ConsentToken.granted == True,
        ConsentToken.revoked == False,
    ).first()
    if not ct:
        raise HTTPException(403, "No valid consent token — patient authorization required")
    if ct.expires_at and ct.expires_at < datetime.utcnow():
        raise HTTPException(403, "Consent token expired")
    return ct


@router.post("/request")
def request_access(body: ConsentRequest, provider_id: int, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == body.patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(404, "Provider not found")

    # Don't create duplicate requests — reuse an existing active grant or pending request
    active = db.query(ConsentToken).filter(
        ConsentToken.patient_id == body.patient_id,
        ConsentToken.provider_id == provider_id,
        ConsentToken.granted == True,
        ConsentToken.revoked == False,
    ).first()
    if active and (not active.expires_at or active.expires_at > datetime.utcnow()):
        return {"token_id": active.id, "token": active.token, "provider_name": provider.name,
                "access_scope": active.access_scope, "status": "already_granted"}

    pending = db.query(ConsentToken).filter(
        ConsentToken.patient_id == body.patient_id,
        ConsentToken.provider_id == provider_id,
        ConsentToken.granted == False,
        ConsentToken.revoked == False,
    ).first()
    if pending:
        return {"token_id": pending.id, "token": pending.token, "provider_name": provider.name,
                "access_scope": pending.access_scope, "status": "already_pending"}

    token_str = str(uuid.uuid4())
    ct = ConsentToken(
        patient_id=body.patient_id,
        provider_id=provider_id,
        token=token_str,
        access_scope=body.access_scope,
        expires_at=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(ct)
    db.add(AccessLog(patient_id=body.patient_id, action="CONSENT_REQUESTED", detail=f"Provider: {provider.name} ({provider.provider_type})"))
    db.commit()
    db.refresh(ct)
    return {"token_id": ct.id, "token": token_str, "provider_name": provider.name,
            "access_scope": ct.access_scope, "status": "requested"}


@router.get("/provider-status/{provider_id}")
def provider_status(provider_id: int, db: Session = Depends(get_db)):
    """Returns the consent state for each patient this provider has interacted with."""
    tokens = db.query(ConsentToken).filter(ConsentToken.provider_id == provider_id).all()
    status = {}
    for t in tokens:
        if t.revoked:
            state = "revoked"
        elif t.granted and t.is_emergency and (not t.expires_at or t.expires_at > datetime.utcnow()):
            state = "emergency"
        elif t.granted and (not t.expires_at or t.expires_at > datetime.utcnow()):
            state = "granted"
        elif t.granted:
            state = "expired"
        else:
            state = "pending"
        # Prefer the strongest active state if multiple tokens exist
        priority = {"emergency": 4, "granted": 3, "pending": 2, "expired": 1, "revoked": 0}
        if t.patient_id not in status or priority[state] > priority[status[t.patient_id]]:
            status[t.patient_id] = state
    return status


@router.get("/pending/{patient_id}")
def get_pending(patient_id: int, db: Session = Depends(get_db)):
    tokens = db.query(ConsentToken).filter(
        ConsentToken.patient_id == patient_id,
        ConsentToken.granted == False,
        ConsentToken.revoked == False,
    ).all()
    result = []
    for t in tokens:
        provider = db.query(Provider).filter(Provider.id == t.provider_id).first()
        result.append({
            "token_id": t.id,
            "token": t.token,
            "provider_name": provider.name if provider else "Unknown",
            "provider_type": provider.provider_type if provider else "",
            "access_scope": t.access_scope,
            "requested_at": t.created_at.isoformat(),
        })
    return result


@router.get("/radar/{patient_id}")
def consent_radar(patient_id: int, db: Session = Depends(get_db)):
    """Active / expiring / risky access for the Consent Radar."""
    now = datetime.utcnow()
    grants = db.query(ConsentToken).filter(
        ConsentToken.patient_id == patient_id, ConsentToken.granted == True, ConsentToken.revoked == False
    ).all()
    active, expiring, risky = [], [], []
    for t in grants:
        provider = db.query(Provider).filter(Provider.id == t.provider_id).first()
        entry = {"token_id": t.id, "provider": provider.name if provider else "Unknown",
                 "provider_type": provider.provider_type if provider else "",
                 "scope": t.access_scope, "expires_at": t.expires_at.isoformat() if t.expires_at else None}
        if t.expires_at and t.expires_at < now:
            risky.append(entry)
        elif t.expires_at and (t.expires_at - now) <= timedelta(hours=6):
            entry["in_minutes"] = max(int((t.expires_at - now).total_seconds() // 60), 0)
            expiring.append(entry)
        else:
            active.append(entry)
    return {"active": active, "expiring": expiring, "risky": risky}


@router.get("/granted/{patient_id}")
def get_granted(patient_id: int, db: Session = Depends(get_db)):
    tokens = db.query(ConsentToken).filter(
        ConsentToken.patient_id == patient_id,
        ConsentToken.granted == True,
        ConsentToken.revoked == False,
    ).all()
    result = []
    for t in tokens:
        provider = db.query(Provider).filter(Provider.id == t.provider_id).first()
        result.append({
            "token_id": t.id,
            "provider_name": provider.name if provider else "Unknown",
            "provider_type": provider.provider_type if provider else "",
            "access_scope": t.access_scope,
            "expires_at": t.expires_at.isoformat() if t.expires_at else None,
            "granted_at": t.created_at.isoformat(),
        })
    return result


@router.post("/sign")
def sign_consent(body: ConsentSign, db: Session = Depends(get_db)):
    ct = db.query(ConsentToken).filter(ConsentToken.id == body.token_id).first()
    if not ct:
        raise HTTPException(404, "Token not found")
    if ct.granted:
        raise HTTPException(400, "Already granted")
    if ct.revoked:
        raise HTTPException(400, "Token revoked")

    patient = db.query(Patient).filter(Patient.id == ct.patient_id).first()
    valid = verify_signature(patient.public_key_pem, ct.token, body.signature)
    if not valid:
        raise HTTPException(403, "Invalid signature — authorization denied")

    ct.signature = body.signature
    ct.granted = True
    ct.expires_at = datetime.utcnow() + timedelta(hours=24)
    db.add(AccessLog(
        patient_id=ct.patient_id,
        action="CONSENT_GRANTED",
        detail=f"Token {ct.id} signed and verified",
    ))
    db.commit()
    return {"message": "Consent granted and signature verified", "token_id": ct.id, "expires_at": ct.expires_at.isoformat()}


@router.post("/revoke")
def revoke_consent(body: ConsentRevoke, db: Session = Depends(get_db)):
    ct = db.query(ConsentToken).filter(ConsentToken.id == body.token_id).first()
    if not ct:
        raise HTTPException(404, "Token not found")
    ct.revoked = True
    db.add(AccessLog(patient_id=ct.patient_id, action="CONSENT_REVOKED", detail=f"Token {ct.id} revoked"))
    db.commit()
    return {"message": "Consent revoked"}


@router.get("/provider-records/{provider_id}/{patient_id}")
def get_authorized_records(provider_id: int, patient_id: int, db: Session = Depends(get_db)):
    _valid_consent(provider_id, patient_id, db)

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    rxs = db.query(Prescription).filter(Prescription.patient_id == patient_id).all()
    records = db.query(HealthRecord).filter(HealthRecord.patient_id == patient_id).all()
    db.add(AccessLog(patient_id=patient_id, action="PROVIDER_ACCESS", detail=f"Provider {provider_id} accessed records"))
    db.commit()

    health_records = []
    for r in records:
        is_file = bool(r.file_name)
        # Authorized providers see decrypted text for note records inline; files are fetched on demand
        text_content = None
        if not is_file:
            try:
                text_content = decrypt_record(r.encrypted_data, r.encryption_key)
            except Exception:
                text_content = None
        health_records.append({
            "id": r.id,
            "title": r.title,
            "record_type": r.record_type,
            "is_file": is_file,
            "file_name": r.file_name,
            "content": text_content,
        })

    return {
        "patient_name": patient.name,
        "blood_type": patient.blood_type,
        "prescriptions": [
            {
                "drug_name": r.drug_name,
                "dosage": r.dosage,
                "frequency": r.frequency,
                "prescribed_date": r.prescribed_date.isoformat() if r.prescribed_date else None,
            }
            for r in rxs
        ],
        "health_records": health_records,
    }


@router.get("/provider-file/{provider_id}/{patient_id}/{record_id}")
def get_authorized_file(provider_id: int, patient_id: int, record_id: int, db: Session = Depends(get_db)):
    _valid_consent(provider_id, patient_id, db)
    record = db.query(HealthRecord).filter(
        HealthRecord.id == record_id, HealthRecord.patient_id == patient_id
    ).first()
    if not record or not record.file_name:
        raise HTTPException(404, "File record not found")
    db.add(AccessLog(patient_id=patient_id, action="PROVIDER_FILE_VIEW", detail=f"Provider {provider_id} viewed {record.file_name}"))
    db.commit()
    b64 = decrypt_record(record.encrypted_data, record.encryption_key)
    raw = base64.b64decode(b64)
    return Response(
        content=raw,
        media_type=record.mime_type or "application/pdf",
        headers={"Content-Disposition": f'inline; filename="{record.file_name}"'},
    )
