"""Run with: python -m backend.seed"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from passlib.context import CryptContext
from datetime import datetime, timedelta
import uuid

from backend.database import SessionLocal, engine
from backend import models
from backend.crypto import generate_rsa_keypair, encrypt_record
from backend.utils import generate_patient_code

models.Base.metadata.create_all(bind=engine)
db = SessionLocal()
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def seed():
    # Clear existing data
    db.query(models.AIAlert).delete()
    db.query(models.AccessLog).delete()
    db.query(models.ConsentToken).delete()
    db.query(models.HealthRecord).delete()
    db.query(models.Prescription).delete()
    db.query(models.Provider).delete()
    db.query(models.Patient).delete()
    db.commit()

    # Providers
    providers = [
        models.Provider(name="City General Hospital", email="hospital@demo.com", password_hash=pwd.hash("demo123"), provider_type="hospital", license_number="HSP-001"),
        models.Provider(name="MediCare Pharmacy", email="pharmacy@demo.com", password_hash=pwd.hash("demo123"), provider_type="pharmacy", license_number="PHR-002"),
        models.Provider(name="HealthFirst Labs", email="labs@demo.com", password_hash=pwd.hash("demo123"), provider_type="lab", license_number="LAB-003"),
        models.Provider(name="BlueCross Insurance", email="insurance@demo.com", password_hash=pwd.hash("demo123"), provider_type="insurance", license_number="INS-004"),
    ]
    for p in providers:
        db.add(p)
    db.commit()
    hospital, pharmacy, lab, insurance = providers

    # Patients (name, email, blood_type, dob, contact, diabetic, chronic_conditions)
    patients_data = [
        ("Alice Johnson", "alice@demo.com", "A+", "1990-03-15", "+1-555-0101", "diabetic", "Type 2 diabetes, hypertension", "VTX-AABC4D8A"),
        ("Bob Smith", "bob@demo.com", "O-", "1978-07-22", "+1-555-0102", "non-diabetic", "High cholesterol", "VTX-333E72D3"),
        ("Carol White", "carol@demo.com", "B+", "1985-11-08", "+1-555-0103", "non-diabetic", "Hypothyroidism, anxiety", "VTX-0C239F54"),
    ]

    saved_keys = {}
    patient_objs = []
    for name, email, blood_type, dob, contact, diabetic, chronic, pcode in patients_data:
        priv, pub = generate_rsa_keypair()
        p = models.Patient(
            patient_code=pcode,
            name=name, email=email,
            password_hash=pwd.hash("demo123"),
            public_key_pem=pub,
            blood_type=blood_type,
            dob=dob,
            contact=contact,
            diabetic=diabetic,
            chronic_conditions=chronic,
            onboarded=True,
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        saved_keys[p.id] = priv
        patient_objs.append(p)

    alice, bob, carol = patient_objs

    # Prescriptions — Alice has a deliberate drug interaction (Warfarin + Aspirin)
    alice_rxs = [
        models.Prescription(patient_id=alice.id, provider_id=hospital.id, drug_name="Warfarin", dosage="5mg", frequency="Once daily", duration="90 days", notes="Blood thinner — INR monitoring required", prescribed_date=datetime.utcnow() - timedelta(days=30)),
        models.Prescription(patient_id=alice.id, provider_id=pharmacy.id, drug_name="Aspirin", dosage="325mg", frequency="Once daily", duration="30 days", notes="OTC pain relief", prescribed_date=datetime.utcnow() - timedelta(days=5)),
        models.Prescription(patient_id=alice.id, provider_id=hospital.id, drug_name="Lisinopril", dosage="10mg", frequency="Once daily", duration="180 days", prescribed_date=datetime.utcnow() - timedelta(days=60)),
        models.Prescription(patient_id=alice.id, provider_id=hospital.id, drug_name="Metformin", dosage="500mg", frequency="Twice daily", duration="180 days", prescribed_date=datetime.utcnow() - timedelta(days=90)),
        models.Prescription(patient_id=alice.id, provider_id=pharmacy.id, drug_name="Ibuprofen", dosage="400mg", frequency="As needed", duration="14 days", notes="NSAIDs with Warfarin — HIGH RISK", prescribed_date=datetime.utcnow() - timedelta(days=2)),
    ]

    bob_rxs = [
        models.Prescription(patient_id=bob.id, provider_id=hospital.id, drug_name="Atorvastatin", dosage="20mg", frequency="Once daily at bedtime", duration="365 days"),
        models.Prescription(patient_id=bob.id, provider_id=hospital.id, drug_name="Amlodipine", dosage="5mg", frequency="Once daily", duration="180 days"),
        models.Prescription(patient_id=bob.id, provider_id=pharmacy.id, drug_name="Omeprazole", dosage="20mg", frequency="Once daily before meals", duration="30 days"),
        # Fraud: oxycodone from two different providers
        models.Prescription(patient_id=bob.id, provider_id=hospital.id, drug_name="Oxycodone", dosage="10mg", frequency="Every 6 hours", duration="7 days", prescribed_date=datetime.utcnow() - timedelta(days=10)),
        models.Prescription(patient_id=bob.id, provider_id=lab.id, drug_name="Oxycodone", dosage="10mg", frequency="Every 8 hours", duration="7 days", notes="Second prescription same week", prescribed_date=datetime.utcnow() - timedelta(days=3)),
    ]

    carol_rxs = [
        models.Prescription(patient_id=carol.id, provider_id=hospital.id, drug_name="Sertraline", dosage="50mg", frequency="Once daily", duration="90 days"),
        models.Prescription(patient_id=carol.id, provider_id=hospital.id, drug_name="Alprazolam", dosage="0.5mg", frequency="Twice daily as needed", duration="30 days"),
        models.Prescription(patient_id=carol.id, provider_id=pharmacy.id, drug_name="Levothyroxine", dosage="75mcg", frequency="Once daily fasting", duration="365 days"),
    ]

    for rx in alice_rxs + bob_rxs + carol_rxs:
        db.add(rx)
    db.commit()

    # Health records (vault)
    vault_records = [
        (alice.id, "allergy", "Penicillin", "Severe allergic reaction — anaphylaxis history"),
        (alice.id, "allergy", "Sulfa drugs", "Skin rash reaction"),
        (alice.id, "lab_report", "HbA1c Test (March 2026)", "HbA1c: 7.2% — borderline diabetic range. Fasting glucose: 128 mg/dL"),
        (bob.id, "allergy", "Latex", "Contact dermatitis"),
        (bob.id, "lab_report", "Lipid Panel (April 2026)", "Total cholesterol: 245 mg/dL. LDL: 158 mg/dL. HDL: 42 mg/dL"),
        (carol.id, "lab_report", "Thyroid Function (May 2026)", "TSH: 6.8 mIU/L (elevated). Free T4: 0.9 ng/dL"),
    ]
    for patient_id, record_type, title, content in vault_records:
        encrypted, key = encrypt_record(content)
        db.add(models.HealthRecord(patient_id=patient_id, record_type=record_type, title=title, encrypted_data=encrypted, encryption_key=key))
    db.commit()

    # Consent tokens — hospital has pending request for alice, pharmacy has granted for bob
    pending_token = str(uuid.uuid4())
    db.add(models.ConsentToken(
        patient_id=alice.id, provider_id=hospital.id,
        token=pending_token, access_scope="prescriptions,lab_reports",
        granted=False, revoked=False,
        expires_at=datetime.utcnow() + timedelta(hours=24),
    ))

    granted_token = str(uuid.uuid4())
    db.add(models.ConsentToken(
        patient_id=bob.id, provider_id=pharmacy.id,
        token=granted_token, access_scope="prescriptions",
        granted=True, revoked=False,
        expires_at=datetime.utcnow() + timedelta(hours=20),
    ))
    db.commit()

    # Access logs
    logs = [
        models.AccessLog(patient_id=alice.id, action="PRESCRIPTION_ADDED", detail="Drug: Warfarin", timestamp=datetime.utcnow() - timedelta(days=30)),
        models.AccessLog(patient_id=alice.id, action="PRESCRIPTION_ADDED", detail="Drug: Aspirin", timestamp=datetime.utcnow() - timedelta(days=5)),
        models.AccessLog(patient_id=alice.id, action="CONSENT_REQUESTED", detail="Provider: City General Hospital (hospital)", timestamp=datetime.utcnow() - timedelta(hours=2)),
        models.AccessLog(patient_id=bob.id, action="CONSENT_GRANTED", detail="Token signed and verified for MediCare Pharmacy", timestamp=datetime.utcnow() - timedelta(hours=5)),
        models.AccessLog(patient_id=bob.id, action="PROVIDER_ACCESS", detail="Provider 2 accessed records", timestamp=datetime.utcnow() - timedelta(hours=4)),
    ]
    for log in logs:
        db.add(log)
    db.commit()

    # Pre-seeded AI alerts for Alice (clinical) and Bob (fraud)
    db.add(models.AIAlert(
        patient_id=alice.id, alert_type="clinical", severity="high",
        drug="Warfarin + Aspirin + Ibuprofen",
        issue="Critical bleeding risk: Warfarin combined with Aspirin (antiplatelet) and Ibuprofen (NSAID) dramatically increases risk of serious bleeding including GI hemorrhage and intracranial bleeding.",
        recommendation="Discontinue Ibuprofen immediately. Consider acetaminophen for pain relief. Monitor INR closely. Consult prescribing physician before continuing Aspirin.",
    ))
    db.add(models.AIAlert(
        patient_id=alice.id, alert_type="clinical", severity="medium",
        drug="Metformin + Lisinopril",
        issue="ACE inhibitor (Lisinopril) may mask hypoglycemia symptoms in patients on Metformin. Monitor blood glucose regularly.",
        recommendation="Continue current regimen but educate patient on alternative hypoglycemia symptoms. Monitor kidney function (eGFR) quarterly.",
    ))
    db.add(models.AIAlert(
        patient_id=bob.id, alert_type="fraud", severity="high",
        drug="Duplicate Controlled Substance",
        issue="Oxycodone (10mg) prescribed by two different providers within 7 days — City General Hospital (10 days ago) and HealthFirst Labs (3 days ago). This pattern is consistent with prescription shopping for controlled substances.",
        recommendation="Risk Score: 9/10. Flag for pharmacist review. Consider state PDMP (Prescription Drug Monitoring Program) cross-check. Alert prescribing providers.",
    ))
    db.commit()

    print("Seed complete.")
    print("\nDemo credentials:")
    print("  Patients (password: demo123):")
    print(f"    alice@demo.com | bob@demo.com | carol@demo.com")
    print("  Providers (password: demo123):")
    print(f"    hospital@demo.com | pharmacy@demo.com | labs@demo.com | insurance@demo.com")
    print(f"\nPatient IDs: Alice={alice.id}, Bob={bob.id}, Carol={carol.id}")
    print(f"Provider IDs: Hospital={hospital.id}, Pharmacy={pharmacy.id}")
    print("\nPatient unique codes (providers search by these):")
    for p in patient_objs:
        print(f"    {p.name}: {p.patient_code}")
    print("\nPrivate keys saved to: private_keys_DEMO_ONLY.txt")

    with open("private_keys_DEMO_ONLY.txt", "w") as f:
        for pid, key in saved_keys.items():
            patient = db.query(models.Patient).filter(models.Patient.id == pid).first()
            f.write(f"=== Patient: {patient.name} (ID: {pid}) ===\n{key}\n\n")

    db.close()


if __name__ == "__main__":
    seed()
