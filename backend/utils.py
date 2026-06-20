import secrets


def generate_patient_code() -> str:
    """Non-guessable public patient identifier, e.g. VTX-3F9A2B7C."""
    return "VTX-" + secrets.token_hex(4).upper()
