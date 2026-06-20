from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Provider

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("/list")
def list_providers(db: Session = Depends(get_db)):
    providers = db.query(Provider).all()
    return [{"id": p.id, "name": p.name, "provider_type": p.provider_type, "email": p.email} for p in providers]
