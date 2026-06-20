from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class PatientRegister(BaseModel):
    name: str
    email: str
    password: str
    dob: Optional[str] = None


class OnboardRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    contact: Optional[str] = None
    blood_type: Optional[str] = None
    diabetic: Optional[str] = None
    chronic_conditions: Optional[str] = None


class ProviderRegister(BaseModel):
    name: str
    email: str
    password: str
    provider_type: str
    license_number: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str
    role: str  # patient / provider


class PrescriptionCreate(BaseModel):
    drug_name: str
    dosage: str
    frequency: str
    duration: Optional[str] = None
    notes: Optional[str] = None


class VaultUpload(BaseModel):
    record_type: str
    title: str
    content: str


class ConsentRequest(BaseModel):
    patient_id: int
    access_scope: Optional[str] = "prescriptions"


class ConsentSign(BaseModel):
    token_id: int
    signature: str  # base64 RSA signature from client


class ConsentRevoke(BaseModel):
    token_id: int


class EmergencyAccessRequest(BaseModel):
    reason: str
