from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from .database import engine, Base
from . import models  # noqa: ensure models are registered
from .routers import auth, vault, prescriptions, consent, ai, audit, patients, providers, guardian, emergency

Base.metadata.create_all(bind=engine)

app = FastAPI(title="VORTEXA", description="Patient-Sovereign Prescription Intelligence Network", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(vault.router)
app.include_router(prescriptions.router)
app.include_router(consent.router)
app.include_router(ai.router)
app.include_router(audit.router)
app.include_router(patients.router)
app.include_router(providers.router)
app.include_router(guardian.router)
app.include_router(emergency.router)


@app.get("/")
def root():
    return {"message": "VORTEXA API — Patient-Sovereign Prescription Intelligence Network", "status": "operational"}
