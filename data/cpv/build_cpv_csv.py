# /// script
# requires-python = ">=3.12"
# dependencies = ["openpyxl>=3.1,<4"]
# ///
"""Build cpv_2008_sv.csv from the official CPV 2008 workbook published on TED.

Run from the repository root:

    uv run data/cpv/build_cpv_csv.py                 # downloads the official zip
    uv run data/cpv/build_cpv_csv.py --zip cpv.zip   # uses a zip you already have

The output has one row per CPV code: the code without its check digit (TED and e-Avrop
return codes that way), the Swedish label, the nearest existing parent code and the level
in the hierarchy (1 = division). See data/cpv/README.md for source and licence.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import sys
import urllib.request
import zipfile
from pathlib import Path

import openpyxl

SOURCE_URL = "https://ted.europa.eu/documents/d/ted/cpv_2008_xls"
SHEET_NAME = "CPV codes"
USER_AGENT = "Anbudshjalpen-PoC/0.1 (Sundsvalls kommun; build_cpv_csv.py)"
DEFAULT_OUT = Path(__file__).resolve().parent / "cpv_2008_sv.csv"
HEADER = ("code", "label_sv", "parent_code", "level")


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})  # noqa: S310 - fixed https URL
    with urllib.request.urlopen(request, timeout=120) as response:  # noqa: S310
        return response.read()


def read_labels(zip_bytes: bytes) -> dict[str, str]:
    """Return {code: Swedish label} from the "CPV codes" sheet of the zipped workbook."""

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        workbook_name = next(name for name in archive.namelist() if name.lower().endswith(".xlsx"))
        workbook = openpyxl.load_workbook(io.BytesIO(archive.read(workbook_name)), read_only=True)
    rows = workbook[SHEET_NAME].iter_rows(values_only=True)
    header = [str(cell).strip() if cell is not None else "" for cell in next(rows)]
    code_index, label_index = header.index("CODE"), header.index("SV")
    labels: dict[str, str] = {}
    for row in rows:
        if not row or row[code_index] is None:
            continue
        code = str(row[code_index]).strip().split("-")[0]  # "45442100-5" -> "45442100"
        label = " ".join(str(row[label_index] or "").split())
        if len(code) != 8 or not code.isdigit() or not label:
            raise ValueError(f"Unexpected CPV row: {row[code_index]!r} {row[label_index]!r}")
        if code in labels:
            raise ValueError(f"Duplicate CPV code {code}")
        labels[code] = label
    return labels


def significant_digits(code: str) -> str:
    """The code without trailing zeros, but never shorter than the two-digit division."""

    stripped = code.rstrip("0")
    return stripped if len(stripped) >= 2 else code[:2]


def level_of(code: str) -> int:
    """1 for a division (XX000000), 2 for a group (XXX00000), and so on down to 7."""

    return len(significant_digits(code)) - 1


def parent_of(code: str, known: set[str]) -> str | None:
    """The nearest existing ancestor, found by dropping one significant digit at a time."""

    digits = significant_digits(code)
    while len(digits) > 2:
        digits = digits[:-1]
        candidate = digits.ljust(8, "0")
        if candidate in known:
            return candidate
    return None


def write_csv(labels: dict[str, str], out: Path) -> None:
    known = set(labels)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(HEADER)
        for code in sorted(labels):
            writer.writerow((code, labels[code], parent_of(code, known) or "", level_of(code)))


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--zip", type=Path, help="local copy of cpv_2008_xls.zip (default: download it)")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output CSV path")
    args = parser.parse_args()

    zip_bytes = args.zip.read_bytes() if args.zip else download(SOURCE_URL)
    labels = read_labels(zip_bytes)
    write_csv(labels, args.out)
    digest = hashlib.sha256(args.out.read_bytes()).hexdigest()
    print(f"Wrote {len(labels)} CPV codes to {args.out} (sha256 {digest})", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
