from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AccessLog, Provider

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/log/{patient_id}")
def get_audit_log(patient_id: int, db: Session = Depends(get_db)):
    logs = db.query(AccessLog).filter(AccessLog.patient_id == patient_id).order_by(AccessLog.timestamp.desc()).limit(100).all()
    result = []
    for log in logs:
        provider = db.query(Provider).filter(Provider.id == log.provider_id).first() if log.provider_id else None
        result.append({
            "id": log.id,
            "action": log.action,
            "detail": log.detail,
            "provider_name": provider.name if provider else None,
            "timestamp": log.timestamp.isoformat(),
        })
    return result
