"""The fictitious agreement catalogue (avtalskatalog) written to agreements.csv.

Dates are written for the base reference date 2026-10-05 and shifted by the same number
of days when the fixtures are built for another reference date. Several agreements end
6–18 months after the reference date, so that "kommande upphandlingar" has content:
among them "Ramavtal måleriarbeten" (about 14 months) and a food agreement ending in the
third quarter of 2027. Suppliers are invented and marked "(fiktiv)".
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

BASE_REFERENCE = date(2026, 10, 5)
CSV_COLUMNS = (
    "external_id",
    "title",
    "category",
    "cpv_codes",
    "supplier",
    "start_date",
    "end_date",
    "extension_months",
    "max_end_date",
    "previous_requirements",
)


@dataclass(frozen=True)
class Agreement:
    number: int
    title: str
    category: str
    cpv_codes: tuple[str, ...]
    supplier: str
    start: date
    end: date
    extension_months: tuple[int, ...]  # remaining extension options
    max_end: date
    previous_requirements: str


AGREEMENTS = (
    Agreement(
        1,
        "Ramavtal måleriarbeten",
        "Bygg och fastighet",
        ("45442100", "45442110", "45442180"),
        "Norrskens Måleri AB (fiktiv)",
        date(2023, 12, 1),
        date(2027, 11, 30),
        (),
        date(2027, 11, 30),
        "Ansvarsförsäkring minst 5 miljoner kronor, två referensuppdrag i offentlig miljö, F-skatt och "
        "villkor enligt centralt kollektivavtal. Utvärdering: pris 70 %, kvalitet 30 %.",
    ),
    Agreement(
        2,
        "Livsmedel – kolonial, mejeri och djupfryst",
        "Livsmedel",
        ("15800000", "15500000", "15890000"),
        "Matgrossisten Mitt AB (fiktiv)",
        date(2023, 10, 1),
        date(2027, 9, 30),
        (),
        date(2027, 9, 30),
        "Registrerad livsmedelsföretagare, egenkontroll enligt HACCP, leverans två gånger per vecka, "
        "kylkedja högst 8 °C. Utvärdering: lägsta pris för en varukorg.",
    ),
    Agreement(
        3,
        "Livsmedel – frukt och grönt",
        "Livsmedel",
        ("03221000", "03222000", "15300000"),
        "Grönt och Gott i Norr AB (fiktiv)",
        date(2023, 4, 1),
        date(2027, 3, 31),
        (),
        date(2027, 3, 31),
        "Klass I enligt EU:s handelsnormer, ursprungsmärkning, ekologiska alternativ och leverans före "
        "klockan 10.00. Utvärdering: lägsta pris för en varukorg.",
    ),
    Agreement(
        4,
        "Lokalvård förskolor",
        "Städ och lokalvård",
        ("90911200", "90919300"),
        "Städservice Norrland AB (fiktiv)",
        date(2022, 2, 1),
        date(2027, 1, 31),
        (),
        date(2027, 1, 31),
        "Kvalitetsnivå enligt INSTA 800, miljömärkta rengöringsmedel, två referensuppdrag i förskola "
        "eller skola. Utvärdering: pris 60 %, kvalitet 40 %.",
    ),
    Agreement(
        5,
        "Fönsterputs kommunala lokaler",
        "Städ och lokalvård",
        ("90911300",),
        "Klarsikt Fönsterputs AB (fiktiv)",
        date(2024, 6, 1),
        date(2027, 5, 31),
        (12,),
        date(2028, 5, 31),
        "Ansvarsförsäkring minst 5 miljoner kronor, arbete på höjd enligt skriftliga rutiner. "
        "Utvärdering: lägsta pris.",
    ),
    Agreement(
        6,
        "Snöröjning och halkbekämpning, Matfors och Stöde",
        "Gata och park",
        ("90620000",),
        "Vinterväg Mitt AB (fiktiv)",
        date(2022, 11, 1),
        date(2027, 4, 30),
        (),
        date(2027, 4, 30),
        "Beredskap dygnet runt under vintersäsong, utryckning inom två timmar, fordon lägst Euro 6.",
    ),
    Agreement(
        7,
        "Parkskötsel och grönytor",
        "Gata och park",
        ("77311000", "77313000"),
        "Grönytepartner Sundsvall AB (fiktiv)",
        date(2024, 4, 1),
        date(2028, 3, 31),
        (12,),
        date(2029, 3, 31),
        "Två referensuppdrag med parkskötsel, kemikaliefri ogräsbekämpning. Utvärdering: pris 70 %, "
        "kvalitet 30 %.",
    ),
    Agreement(
        8,
        "Ramavtal elinstallationer",
        "Bygg och fastighet",
        ("45310000", "45311000"),
        "Elkraft Västernorrland AB (fiktiv)",
        date(2023, 9, 1),
        date(2027, 8, 31),
        (),
        date(2027, 8, 31),
        "Auktorisation för elinstallation, ansvarsförsäkring minst 10 miljoner kronor, jour vardagar.",
    ),
    Agreement(
        9,
        "Ramavtal VVS-arbeten",
        "Bygg och fastighet",
        ("45330000", "45331000"),
        "Rörteknik i Mitt AB (fiktiv)",
        date(2024, 1, 1),
        date(2027, 12, 31),
        (12,),
        date(2028, 12, 31),
        "Behörighet för arbete med tappvatten, referensuppdrag i offentliga lokaler, timpris och "
        "materialpåslag i utvärderingen.",
    ),
    Agreement(
        10,
        "Ramavtal snickeriarbeten",
        "Bygg och fastighet",
        ("45421000",),
        "Bygg och Snickeri Alnö AB (fiktiv)",
        date(2025, 3, 1),
        date(2028, 2, 29),
        (12,),
        date(2029, 2, 28),
        "Två referensuppdrag, ansvarsförsäkring minst 5 miljoner kronor, arbetsledare med minst fem års "
        "erfarenhet.",
    ),
    Agreement(
        11,
        "Takarbeten och takunderhåll",
        "Bygg och fastighet",
        ("45261000",),
        "Takmästarna Norr AB (fiktiv)",
        date(2025, 9, 1),
        date(2029, 8, 31),
        (12, 12),
        date(2031, 8, 31),
        "Säkerhetsutrustning för arbete på tak, garanti fem år, ansvarsförsäkring minst 10 miljoner kronor.",
    ),
    Agreement(
        12,
        "Kontorsmaterial",
        "Kontor",
        ("30192000", "30197000"),
        "Kontorsbolaget Mitt AB (fiktiv)",
        date(2024, 2, 1),
        date(2028, 1, 31),
        (12,),
        date(2029, 1, 31),
        "E-handel via webbutik, leverans inom tre arbetsdagar, miljömärkta alternativ.",
    ),
    Agreement(
        13,
        "Förskolemöbler",
        "Möbler och inredning",
        ("39161000", "39160000"),
        "Barnrum Inredning AB (fiktiv)",
        date(2023, 6, 1),
        date(2027, 5, 31),
        (),
        date(2027, 5, 31),
        "Möbler provade enligt gällande standarder för barnmöbler, garanti fem år, montering ingår.",
    ),
    Agreement(
        14,
        "Datorer och skärmar",
        "IT",
        ("30213100", "30231000"),
        "Datadepån Norr AB (fiktiv)",
        date(2025, 1, 1),
        date(2027, 12, 31),
        (12,),
        date(2028, 12, 31),
        "Tillgänglighetskrav, TCO-certifierade produkter eller motsvarande, återtag av uttjänt utrustning.",
    ),
    Agreement(
        15,
        "Skolskjuts och särskild kollektivtrafik",
        "Transporter",
        ("60130000", "60140000"),
        "Mittbuss Trafik AB (fiktiv)",
        date(2021, 7, 1),
        date(2027, 6, 30),
        (),
        date(2027, 6, 30),
        "Trafiktillstånd, förare med utbildning i bemötande, fordon med förnybart drivmedel.",
    ),
    Agreement(
        16,
        "Avfallshämtning kommunala verksamheter",
        "Avfall",
        ("90511000", "90512000"),
        "Kretslopp Mitt AB (fiktiv)",
        date(2024, 10, 1),
        date(2028, 9, 30),
        (24,),
        date(2030, 9, 30),
        "Tillstånd för avfallstransport, sortering i minst sju fraktioner, kvartalsvis statistik.",
    ),
    Agreement(
        17,
        "Personbilar, leasing",
        "Fordon",
        ("34110000", "34144900"),
        "Bilpartner Västernorrland AB (fiktiv)",
        date(2025, 5, 1),
        date(2029, 4, 30),
        (12,),
        date(2030, 4, 30),
        "Elbilar i första hand, service ingår, utvärdering på totalkostnad under leasingperioden.",
    ),
    Agreement(
        18,
        "Fordonsservice och reparationer",
        "Fordon",
        ("50112000",),
        "Verkstadshuset Sundsvall AB (fiktiv)",
        date(2024, 3, 1),
        date(2027, 2, 28),
        (12,),
        date(2028, 2, 29),
        "Auktoriserad verkstad eller motsvarande, lånebil vid reparation, timpris i utvärderingen.",
    ),
    Agreement(
        19,
        "Tryckeritjänster",
        "Kommunikation",
        ("79810000", "79823000"),
        "Tryckeriet i Mitt AB (fiktiv)",
        date(2023, 11, 1),
        date(2027, 10, 31),
        (),
        date(2027, 10, 31),
        "Miljömärkt tryckeri eller motsvarande, leverans inom fem arbetsdagar.",
    ),
    Agreement(
        20,
        "Tolktjänster",
        "Konsulttjänster",
        ("79540000",),
        "Tolkcentralen Norr AB (fiktiv)",
        date(2024, 9, 1),
        date(2026, 12, 31),
        (),
        date(2026, 12, 31),
        "Auktoriserade tolkar i första hand, bokning dygnet runt, sekretess.",
    ),
    Agreement(
        21,
        "Bevakning och väktartjänster",
        "Säkerhet",
        ("79713000", "79714000"),
        "Trygghetsbolaget Mitt AB (fiktiv)",
        date(2025, 2, 1),
        date(2029, 1, 31),
        (12, 12),
        date(2031, 1, 31),
        "Auktorisation för bevakningsföretag, utbildade väktare, larmcentral.",
    ),
    Agreement(
        22,
        "Arbetskläder och skyddsskor",
        "Kläder",
        ("18100000", "18830000"),
        "Arbetsklädsel Norr AB (fiktiv)",
        date(2024, 5, 1),
        date(2028, 4, 30),
        (12,),
        date(2029, 4, 30),
        "Skyddsskor enligt gällande standard, uppföljning av hållbarhet i leverantörskedjan.",
    ),
    Agreement(
        23,
        "Hygien- och sanitetspapper",
        "Förbrukningsmaterial",
        ("33760000", "33770000"),
        "Hygienlagret AB (fiktiv)",
        date(2023, 5, 1),
        date(2027, 4, 30),
        (),
        date(2027, 4, 30),
        "Miljömärkta produkter, leverans till cirka 200 adresser, e-handel.",
    ),
    Agreement(
        24,
        "Rengöringsmedel och städmateriel",
        "Förbrukningsmaterial",
        ("39831200",),
        "Rent och Klart Grossist AB (fiktiv)",
        date(2024, 8, 1),
        date(2027, 7, 31),
        (12,),
        date(2028, 7, 31),
        "Svanen eller EU Ecolabel eller motsvarande, doseringssystem, utbildning för personal.",
    ),
    Agreement(
        25,
        "Lekplatsutrustning och besiktning",
        "Gata och park",
        ("37535200",),
        "Lekmiljö Norrland AB (fiktiv)",
        date(2025, 6, 1),
        date(2028, 5, 31),
        (12,),
        date(2029, 5, 31),
        "Utrustning enligt gällande säkerhetsstandard för lekplatser, årlig besiktning och reservdelar "
        "i tio år.",
    ),
    Agreement(
        26,
        "Elektricitet",
        "Energi",
        ("09310000",),
        "Kraftbolaget Mitt AB (fiktiv)",
        date(2024, 1, 1),
        date(2027, 12, 31),
        (),
        date(2027, 12, 31),
        "El från förnybara källor med ursprungsgarantier, rörligt pris med fast påslag.",
    ),
)


def write_agreements_csv(path: Path, reference: date) -> int:
    """Write the catalogue with dates shifted from BASE_REFERENCE to `reference`."""

    shift = reference - BASE_REFERENCE
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(CSV_COLUMNS)
        for agreement in AGREEMENTS:
            writer.writerow(_row(agreement, shift))
    return len(AGREEMENTS)


def _row(agreement: Agreement, shift: timedelta) -> tuple[str, ...]:
    return (
        f"DEMO-AVTAL-{agreement.number:03d}",
        agreement.title,
        agreement.category,
        ";".join(agreement.cpv_codes),
        agreement.supplier,
        (agreement.start + shift).isoformat(),
        (agreement.end + shift).isoformat(),
        ";".join(str(months) for months in agreement.extension_months),
        (agreement.max_end + shift).isoformat(),
        agreement.previous_requirements,
    )
