"""Generates a realistic sample prescription PDF for testing VORTEXA's AI extraction.
Run: python generate_sample_rx.py
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

OUT = "sample_prescription.pdf"

meds = [
    ("Amoxicillin", "500 mg", "Three times daily after meals", "7 days"),
    ("Metformin", "500 mg", "Twice daily with meals", "30 days"),
    ("Atorvastatin", "20 mg", "Once daily at bedtime", "90 days"),
    ("Warfarin", "5 mg", "Once daily in the evening", "30 days"),
    ("Ibuprofen", "400 mg", "As needed for pain (max 3 per day)", "5 days"),
]


def build():
    c = canvas.Canvas(OUT, pagesize=A4)
    w, h = A4
    y = h - 25 * mm

    c.setFont("Helvetica-Bold", 18)
    c.drawString(20 * mm, y, "City General Hospital")
    y -= 7 * mm
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, y, "Department of Internal Medicine  |  123 Care Avenue  |  Tel: +1-555-0100")
    y -= 5 * mm
    c.line(20 * mm, y, w - 20 * mm, y)
    y -= 10 * mm

    c.setFont("Helvetica", 11)
    c.drawString(20 * mm, y, "Patient: Alice Johnson")
    c.drawString(120 * mm, y, "Date: 20 June 2026")
    y -= 6 * mm
    c.drawString(20 * mm, y, "Age: 36    Sex: F    Blood Group: A+")
    y -= 6 * mm
    c.drawString(20 * mm, y, "Prescribing Physician: Dr. Rakesh Menon, MD")
    y -= 12 * mm

    c.setFont("Helvetica-Bold", 14)
    c.drawString(20 * mm, y, "Rx — Prescription")
    y -= 9 * mm

    c.setFont("Helvetica", 11)
    for i, (drug, dose, freq, days) in enumerate(meds, 1):
        c.setFont("Helvetica-Bold", 11)
        c.drawString(22 * mm, y, f"{i}. {drug}  {dose}")
        y -= 5.5 * mm
        c.setFont("Helvetica", 10)
        c.drawString(28 * mm, y, f"Directions: {freq}")
        y -= 5 * mm
        c.drawString(28 * mm, y, f"Duration: {days}")
        y -= 9 * mm

    y -= 6 * mm
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(20 * mm, y, "Note: Take medications as directed. Report any unusual bleeding or bruising immediately.")
    y -= 18 * mm
    c.setFont("Helvetica", 11)
    c.drawString(120 * mm, y, "_____________________")
    y -= 6 * mm
    c.drawString(120 * mm, y, "Dr. Rakesh Menon")

    c.showPage()
    c.save()
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
