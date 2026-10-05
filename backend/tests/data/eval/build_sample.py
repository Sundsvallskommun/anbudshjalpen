"""Build the fictitious three-page procurement document used by the eval tests.

Run from backend/: `uv run python tests/data/eval/build_sample.py`. The output PDF is
committed so the tests need neither fonts nor network; facit.json is written by hand
to match it. Core PDF fonts cover Latin-1, which is enough for å, ä and ö.
"""

from __future__ import annotations

from pathlib import Path

from fpdf import FPDF

PAGES: list[list[str]] = [
    [
        "Administrativa föreskrifter",
        "Upphandlingen genomförs med förenklat förfarande enligt 19 kap. LOU.",
        "Sista dag för frågor är 2026-10-20.",
        "Anbud ska ha kommit in senast den 2 november 2026.",
        "Anbudet ska vara skrivet på svenska.",
    ],
    [
        "Kvalificering",
        "Leverantören ska vara registrerad för F-skatt.",
        "Leverantören ska ha en giltig ansvarsförsäkring om minst 5 000 000 kronor. "
        "Försäkringsbevis ska bifogas anbudet.",
        "Leverantören ska redovisa två referensuppdrag från offentlig verksamhet under de senaste tre åren "
        "på bilaga 3 Referensblankett.",
    ],
    [
        "Utvärdering",
        "Utvärderingen görs med pris 70 % och kvalitet 30 %.",
        "Avtalsvillkor",
        "Vid försenad leverans har kommunen rätt till vite.",
        "Avtalet gäller från 2027-01-01.",
    ],
]
FOOTER = "FIKTIVT UNDERLAG - endast för test"


def build(path: Path) -> None:
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=False)
    for paragraphs in PAGES:
        pdf.add_page()
        pdf.set_font("Helvetica", size=11)
        for paragraph in paragraphs:
            pdf.multi_cell(0, 6, paragraph, new_x="LMARGIN", new_y="NEXT")
            pdf.ln(3)
        pdf.set_y(-20)
        pdf.set_font("Helvetica", size=8)
        pdf.cell(0, 6, FOOTER)
    pdf.output(str(path))


if __name__ == "__main__":
    build(Path(__file__).with_name("forfragningsunderlag.pdf"))
