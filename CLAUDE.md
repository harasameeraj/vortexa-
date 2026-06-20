# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
# Start API server (from repo root)
uvicorn backend.main:app --reload --port 8000

# Seed demo data (wipes DB and recreates all demo users + records)
python -m backend.seed

# Generate a sample prescription PDF (creates sample_prescription.pdf)
python generate_sample_rx.py
```

### Frontend
```bash
cd frontend
npm install        # first time
npm run dev        # dev server at http://localhost:5173
npm run build      # production build
```

### Required external service
Ollama must be running locally with the qwen3 model pulled:
```bash
ollama serve
ollama pull qwen3
```

## Architecture

### Stack
- **Backend**: FastAPI + SQLAlchemy + SQLite (`vortexa.db`, auto-created on startup)
- **Frontend**: Vite + React + TailwindCSS v4
- **AI**: Ollama local LLM (qwen3 at `localhost:11434`) — all AI is on-device, no cloud APIs
- **Auth**: JWT via `python-jose`; token stored in `localStorage`
- **i18n**: `frontend/src/i18n.jsx` — React context with 4 languages (EN/ES/FR/HI), persisted in `localStorage` under key `hv_lang`

> The UI brand name is **HealthVault** but the codebase directory, DB file, and Python package are all named `vortexa`. Do not rename the filesystem.

### Backend module layout
```
backend/
├── main.py             # FastAPI app, CORS (allow_origin_regex any localhost port), router registration
├── database.py         # SQLAlchemy engine + SessionLocal + get_db()
├── models.py           # All ORM models (see below)
├── schemas.py          # Pydantic request/response schemas
├── crypto.py           # RSA-2048 key gen/sign/verify + AES-GCM encrypt/decrypt
├── ai_agents.py        # All Ollama calls: _ask_ollama, _extract_json, run_clinical_safety, parse_prescription, run_health_insights, run_fraud_scan
├── guardian_engine.py  # Guardian AI: build_report() — 5-lens unified analysis + deterministic Health Integrity Score
├── pdf_utils.py        # extract_text(pdf_bytes) using pypdf
├── utils.py            # generate_patient_code() → "VTX-XXXXXXXX"
├── seed.py             # Demo data seeder; run with `python -m backend.seed`
└── routers/
    ├── auth.py         # POST /auth/register/patient, /auth/register/provider, /auth/login
    ├── patients.py     # GET /patients/search?code=VTX-..., POST /patients/{id}/onboard
    ├── providers.py    # Provider lookups
    ├── vault.py        # GET/POST /vault/records — AES-encrypted health records
    ├── prescriptions.py# GET/POST prescriptions + PDF upload (BackgroundTasks for AI)
    ├── consent.py      # Full consent lifecycle: request → sign → revoke + provider record access
    ├── emergency.py    # POST /emergency/break-glass/{patient_id}?provider_id=X — hospital-only override
    ├── ai.py           # POST /ai/fraud-scan/{patient_id}, GET /ai/clinical-alerts/{patient_id}
    ├── guardian.py     # POST /guardian/run/{patient_id}, GET /guardian/report/{patient_id}
    └── audit.py        # GET /audit/log/{patient_id}
```

### Frontend page/component layout
```
frontend/src/
├── api.js                      # Axios instance with JWT interceptor; API_BASE = http://localhost:8000
├── i18n.jsx                    # LanguageProvider, useT() hook, all translation strings
├── App.jsx                     # React Router routes — wrapped in <LanguageProvider>
├── pages/
│   ├── Landing.jsx             # Public home — prominent HealthVault hero + language switcher
│   ├── Login.jsx               # Patient and provider login (role toggle + language switcher)
│   ├── Register.jsx            # Patient registration — returns private key once
│   ├── RegisterProvider.jsx    # Provider registration
│   ├── PatientDashboard.jsx    # Main patient view (Guardian / Vault / Consent / Audit tabs)
│   └── ProviderPortal.jsx      # Provider view — VTX-code search + authorized record viewer + break-glass
└── components/
    ├── Sidebar.jsx             # Dark left nav (80px) with globe language toggle at bottom
    ├── GuardianPanel.jsx       # Guardian AI report (score hero + 4 lens cards + recommendations)
    ├── OnboardingModal.jsx     # One-time first-login health profile form
    └── SignatureModal.jsx      # Browser-side RSA signing with node-forge (private key never leaves browser)
```

## Key Design Decisions

### Cryptographic consent flow
1. Patient registers → backend generates RSA-2048 keypair → public key stored in DB, private key returned **once** and must be saved as a `.pem` file.
2. Provider requests access → `ConsentToken` created (status: pending).
3. Patient opens `SignatureModal`, uploads their `.pem`, node-forge signs the token UUID in-browser.
4. Backend verifies signature against stored public key → grants time-limited access (24h).
5. Provider reads decrypted records via `/consent/provider-records/{provider_id}/{patient_id}`.

### Emergency break-glass access
`POST /emergency/break-glass/{patient_id}?provider_id=X` with `{ "reason": "..." }`:
- Restricted to `provider_type == "hospital"` only — returns 403 for all other types.
- Requires a clinical justification of ≥10 characters.
- Immediately creates a `ConsentToken` with `is_emergency=True`, `granted=True`, 4-hour expiry — no patient signature required.
- Stamps `EMERGENCY_ACCESS_INVOKED` permanently into `access_logs` (cannot be deleted).
- `consent.provider_status` returns state `"emergency"` (priority 4, above `"granted": 3`) for these tokens.
- UI: red "Emergency Override — Break Glass" button appears in ProviderPortal **only** for hospital accounts and **only** when the patient is not already authorized.

### AI is always asynchronous
All Ollama calls run in FastAPI `BackgroundTasks` so endpoints return instantly. Qwen3 takes 30–120s. Critical config in `ai_agents.py`:
- `"think": False` + `/no_think` suffix — disables Qwen3 chain-of-thought mode.
- `_extract_json()` strips `<think>...</think>` blocks that Qwen3 may still emit.
- Timeout: 300s. The frontend polls every 5–6s for up to ~2 minutes.

### Guardian AI engine (`guardian_engine.py`)
`build_report(patient_id, db)` runs 5 lenses and stores the result in `guardian_reports` (old row deleted first):
1. **Medication Safety** — LLM (`run_clinical_safety`)
2. **Health Insights** — deterministic `CONDITION_MAP` + LLM narrative + event timeline
3. **Fraud & Abuse** — deterministic `_rule_fraud()` checks `CONTROLLED_SUBSTANCES` for multi-provider duplicates
4. **Consent Intelligence** — deterministic (active / expiring / risky / pending)
5. **Recommendations** — deterministic synthesis, ranked by priority

**Health Integrity Score** (0–100, fully deterministic): medication alerts −25/−10/−3 (cap −50), fraud high −30 / med −12, stale consent −15 each (cap −30), completeness gaps −5 each (cap −15), clean consent hygiene +5.

### Multilingual support (`i18n.jsx`)
- `<LanguageProvider>` wraps the entire app in `App.jsx`.
- `useT()` returns `{ t, lang, setLanguage }` — `t` is the flat translation object for the active language.
- Language preference persisted in `localStorage` key `hv_lang`.
- Language toggle rendered in: Landing header, Login page, Sidebar bottom (globe icon).
- Adding a new language: add an entry to the `translations` object and the `LANGUAGES` array in `i18n.jsx`.

### Patient privacy architecture
- All health record content is AES-GCM encrypted at rest; encryption key stored alongside in the same DB row (acceptable for demo).
- Providers can only find patients by exact `VTX-XXXXXXXX` code — no directory browsing.
- PDFs stored encrypted; served decrypted only through the consent gate or emergency token.

### Encryption helpers (`crypto.py`)
- `encrypt_record(str)` → `(base64_encrypted, base64_key)` — AES-256-GCM, nonce prepended.
- `decrypt_record(base64_encrypted, base64_key)` → `str`
- PDF files are base64-encoded before encrypting, then base64-decoded after decrypting.

## DB Schema Notes
`Base.metadata.create_all()` runs on startup — it creates **missing tables** but does **not** add missing columns to existing tables. When adding columns to an existing model:
```bash
# Option A — fresh DB (wipes all data, re-seeds demo accounts)
del vortexa.db && python -m backend.seed

# Option B — add columns without data loss
python -c "import sqlite3; conn=sqlite3.connect('vortexa.db'); conn.execute('ALTER TABLE <table> ADD COLUMN <col> <type> DEFAULT <val>'); conn.commit()"
```

## Demo Data (after running `python -m backend.seed`)

| Role | Email | Password | Notes |
|---|---|---|---|
| Patient | alice@demo.com | demo123 | Warfarin + Aspirin + Ibuprofen → HIGH drug interaction alert |
| Patient | bob@demo.com | demo123 | Oxycodone from 2 providers → FRAUD alert |
| Patient | carol@demo.com | demo123 | Clean profile with thyroid meds |
| Hospital | hospital@demo.com | demo123 | Only account that can invoke break-glass |
| Pharmacy | pharmacy@demo.com | demo123 | |
| Lab | labs@demo.com | demo123 | |
| Insurance | insurance@demo.com | demo123 | |

VTX codes regenerate on every seed run — read them from console output or `private_keys_DEMO_ONLY.txt`. Private keys in that file are the only valid keys for the current DB; keys from previous seed runs will fail signature verification.

## UI Design System
Light theme throughout. Key Tailwind tokens:
- Background: `bg-gray-50` (pages), `bg-white` (cards)
- Card borders: `border border-gray-200 rounded-xl shadow-sm`
- Primary accent: `emerald-600` (buttons, active states, links)
- Text hierarchy: `text-gray-900` → `text-gray-600` → `text-gray-400`
- Status colors: `emerald` (safe/green), `amber` (warning), `red` (danger/emergency)
- Emergency UI always uses `red-200` borders and `red-600` text to be visually distinct from normal consent flows.
- Layout: `Sidebar` (dark `bg-gray-900`, 80px wide, `sticky top-0 h-screen`) + fluid main content area.
