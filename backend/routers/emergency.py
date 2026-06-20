import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ConsentToken, Patient, Provider, AccessLog
from ..schemas import EmergencyAccessRequest

router = APIRouter(prefix="/emergency", tags=["emergency"])


@router.post("/break-glass/{patient_id}")
def break_glass(patient_id: int, body: EmergencyAccessRequest, provider_id: int, db: Session = Depends(get_db)):
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(404, "Provider not found")
    if provider.provider_type != "hospital":
        raise HTTPException(403, "Emergency break-glass access is restricted to hospital providers only")

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")

    reason = body.reason.strip()
    if len(reason) < 10:
        raise HTTPException(400, "A clinical justification of at least 10 characters is required")

    # Return existing active emergency grant rather than creating a duplicate
    existing = db.query(ConsentToken).filter(
        ConsentToken.provider_id == provider_id,
        ConsentToken.patient_id == patient_id,
        ConsentToken.is_emergency == True,
        ConsentToken.granted == True,
        ConsentToken.revoked == False,
    ).first()
    if existing and existing.expires_at and existing.expires_at > datetime.utcnow():
        return {
            "token_id": existing.id,
            "status": "already_active",
            "expires_at": existing.expires_at.isoformat(),
            "message": "Emergency access is already active for this patient",
        }

    ct = ConsentToken(
        patient_id=patient_id,
        provider_id=provider_id,
        token=str(uuid.uuid4()),
        access_scope="emergency",
        granted=True,
        is_emergency=True,
        emergency_reason=reason,
        expires_at=datetime.utcnow() + timedelta(hours=4),
    )
    db.add(ct)
    db.add(AccessLog(
        patient_id=patient_id,
        provider_id=provider_id,
        action="EMERGENCY_ACCESS_INVOKED",
        detail=f"Provider: {provider.name} ({provider.provider_type}) | Reason: {reason}",
    ))
    db.commit()
    db.refresh(ct)

    return {
        "token_id": ct.id,
        "status": "emergency_granted",
        "expires_at": ct.expires_at.isoformat(),
        "message": "Emergency access granted for 4 hours. This event is permanently logged to the patient audit trail.",
    }
