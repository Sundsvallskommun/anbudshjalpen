"""Normalising the CPV codes and filters that users and buyers type in.

The hierarchy itself (overlaps, groups, significant digits) lives in `anbudsklar.cpv`,
which the AI engines share with matching.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

from anbudsklar.cpv import CPV_CODE
from anbudsklar.services.errors import InvalidInputError

_PREFIX = re.compile(r"^\d{2,8}$")


def normalize_cpv_code(raw: str) -> str:
    """Return the 8-digit code, accepting the official form with check digit ("45442110-1")."""

    match = CPV_CODE.match(raw.strip())
    if match is None:
        raise InvalidInputError(
            f"Ogiltig CPV-kod: {raw.strip()!r}. Ange åtta siffror, till exempel 45442110."
        )
    return match.group(1)


def normalize_cpv_codes(raw_codes: Iterable[str]) -> list[str]:
    """Normalise and de-duplicate, keeping the caller's order."""

    seen: dict[str, None] = {}
    for raw in raw_codes:
        if raw.strip():
            seen.setdefault(normalize_cpv_code(raw), None)
    return list(seen)


def normalize_cpv_prefixes(raw_values: Iterable[str]) -> list[str]:
    """Search filters: comma-separated or repeated values of 2 to 8 digits."""

    prefixes: list[str] = []
    for raw in raw_values:
        for part in raw.split(","):
            value = part.strip().split("-", 1)[0]
            if not value:
                continue
            if not _PREFIX.match(value):
                raise InvalidInputError(f"Ogiltigt CPV-filter: {part.strip()!r}. Ange 2–8 siffror.")
            prefixes.append(value)
    return prefixes
