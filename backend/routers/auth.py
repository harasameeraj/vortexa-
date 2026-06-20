from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta
import os

from ..database import get_db
from ..models import Patient, Provider
from ..schemas import PatientRegister, ProviderRegister, LoginRequest
from ..crypto import generate_rsa_keypair
from ..utils import generate_patient_code

router = APIRouter(prefix="/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("SECRET_KEY", "vortexa-dev-secret-change-in-prod")
ALGORITHM = "HS256"


def create_token(data: dict, expires_hours: int = 24) -> str:
    payload = {**data, "exp": datetime.utcnow() + timedelta(hours=expires_hours)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


@router.post("/register/patient")
def register_patient(body: PatientRegister, db: Session = Depends(get_db)):
    if db.query(Patient).filter(Patient.email == body.email).first():
        raise HTTPException(400, "Email already registered")
    private_pem, public_pem = generate_rsa_keypair()
    patient = Patient(
        patient_code=generate_patient_code(),
        name=body.name,
        email=body.email,
        password_hash=pwd_context.hash(body.password),
        public_key_pem=public_pem,
        dob=body.dob,
        onboarded=False,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    token = create_token({"sub": str(patient.id), "role": "patient", "email": patient.email})
    return {
        "token": token,
        "patient_id": patient.id,
        "patient_code": patient.patient_code,
        "name": patient.name,
        "private_key_pem": private_pem,  # returned ONCE — patient must save this
        "public_key_pem": public_pem,
    }


@router.post("/register/provider")
def register_provider(body: ProviderRegister, db: Session = Depends(get_db)):
    if db.query(Provider).filter(Provider.email == body.email).first():
        raise HTTPException(400, "Email already registered")
    provider = Provider(
        name=body.name,
        email=body.email,
        password_hash=pwd_context.hash(body.password),
        provider_type=body.provider_type,
        license_number=body.license_number,
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    token = create_token({"sub": str(provider.id), "role": "provider", "email": provider.email})
    return {"token": token, "provider_id": provider.id, "name": provider.name, "provider_type": provider.provider_type}


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    if body.role == "patient":
        user = db.query(Patient).filter(Patient.email == body.email).first()
        if not user or not pwd_context.verify(body.password, user.password_hash):
            raise HTTPException(401, "Invalid credentials")
        token = create_token({"sub": str(user.id), "role": "patient", "email": user.email})
        return {"token": token, "id": user.id, "name": user.name, "role": "patient",
                "patient_code": user.patient_code, "onboarded": user.onboarded,
                "blood_type": user.blood_type, "dob": user.dob}
    else:
        user = db.query(Provider).filter(Provider.email == body.email).first()
        if not user or not pwd_context.verify(body.password, user.password_hash):
            raise HTTPException(401, "Invalid credentials")
        token = create_token({"sub": str(user.id), "role": "provider", "email": user.email})
        return {"token": token, "id": user.id, "name": user.name, "role": "provider", "provider_type": user.provider_type}
