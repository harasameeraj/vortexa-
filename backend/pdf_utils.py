import io
from pypdf import PdfReader


def extract_text(pdf_bytes: bytes) -> str:
    """Extract all text from a PDF's pages. Returns '' if nothing extractable."""
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        parts = []
        for page in reader.pages:
            txt = page.extract_text() or ""
            if txt.strip():
                parts.append(txt)
        return "\n".join(parts).strip()
    except Exception:
        return ""
