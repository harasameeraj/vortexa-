from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class Patient(Base):
    __tablename__ = "patients"
    id = Column(Integer, primary_key=True, index=True)
    patient_code = Column(String, unique=True, index=True)  # public searchable ID e.g. VTX-3F9A2B7C
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    public_key_pem = Column(Text, nullable=False)
    dob = Column(String)
    blood_type = Column(String)
    contact = Column(String)
    diabetic = Column(String)              # 'diabetic' | 'non-diabetic'
    chronic_conditions = Column(Text)
    onboarded = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    prescriptions = relationship("Prescription", back_populates="patient")
    health_records = relationship("HealthRecord", back_populates="patient")
    consent_tokens = relationship("ConsentToken", back_populates="patient")
    access_logs = relationship("AccessLog", back_populates="patient")
    ai_alerts = relationship("AIAlert", back_populates="patient")


class Provider(Base):
    __tablename__ = "providers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    provider_type = Column(String, nullable=False)  # hospital/pharmacy/lab/insurance
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    license_number = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    prescriptions = relationship("Prescription", back_populates="provider")
    consent_tokens = relationship("ConsentToken", back_populates="provider")


class Prescription(Base):
    __tablename__ = "prescriptions"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    provider_id = Column(Integer, ForeignKey("providers.id"))
    drug_name = Column(String, nullable=False)
    dosage = Column(String)
    frequency = Column(String)
    duration = Column(String)
    notes = Column(Text)
    prescribed_date = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    # Optional encrypted PDF attachment for the prescription
    file_name = Column(String, nullable=True)
    mime_type = Column(String, nullable=True)
    encrypted_data = Column(Text, nullable=True)
    encryption_key = Column(Text, nullable=True)
    extracted_meds = Column(Text, nullable=True)  # JSON list of meds parsed from an uploaded PDF

    patient = relationship("Patient", back_populates="prescriptions")
    provider = relationship("Provider", back_populates="prescriptions")


class HealthRecord(Base):
    __tablename__ = "health_records"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    record_type = Column(String, nullable=False)  # allergy/lab_report/prescription/note
    title = Column(String)
    encrypted_data = Column(Text, nullable=False)
    encryption_key = Column(Text, nullable=False)  # stored separately in prod; fine for demo
    file_name = Column(String, nullable=True)      # set when the record is an uploaded file (PDF)
    mime_type = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="health_records")


class ConsentToken(Base):
    __tablename__ = "consent_tokens"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    provider_id = Column(Integer, ForeignKey("providers.id"), nullable=False)
    token = Column(String, unique=True, nullable=False)
    signature = Column(Text)
    access_scope = Column(String, default="prescriptions")
    granted = Column(Boolean, default=False)
    revoked = Column(Boolean, default=False)
    is_emergency = Column(Boolean, default=False)
    emergency_reason = Column(Text, nullable=True)
    expires_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="consent_tokens")
    provider = relationship("Provider", back_populates="consent_tokens")


class AccessLog(Base):
    __tablename__ = "access_logs"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    provider_id = Column(Integer, ForeignKey("providers.id"))
    action = Column(String, nullable=False)
    detail = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="access_logs")


class GuardianReport(Base):
    __tablename__ = "guardian_reports"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    integrity_score = Column(Integer, default=0)
    status = Column(String)            # green / yellow / red
    status_label = Column(String)
    sections_json = Column(Text)       # full report payload (5 lenses + breakdown)
    generated_at = Column(DateTime, default=datetime.utcnow)


class AIAlert(Base):
    __tablename__ = "ai_alerts"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    alert_type = Column(String, nullable=False)  # clinical/fraud
    severity = Column(String)  # high/medium/low
    drug = Column(String)
    issue = Column(Text)
    recommendation = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="ai_alerts")
