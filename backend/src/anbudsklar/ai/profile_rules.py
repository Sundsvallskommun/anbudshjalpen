"""Rule-based reading of a profile change (uppdatera_profil), for the heuristic engine.

Every change comes from a plain pattern in the message: a number of employees, a
turnover with its unit, an ISO certificate, municipalities after "i", a sentence about
insurance or references, a new description after "beskrivning:", and CPV candidates
whose labels share words with the message. What no pattern catches is answered with a
question and nothing is changed, so the engine never guesses what a company meant.
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from anbudsklar.contracts import CompanyProfile, CpvCandidate, ProfileChange

_NUMBER_WORDS = {
    "en": 1, "ett": 1, "två": 2, "tre": 3, "fyra": 4, "fem": 5, "sex": 6, "sju": 7, "åtta": 8,
    "nio": 9, "tio": 10, "elva": 11, "tolv": 12, "tretton": 13, "fjorton": 14, "femton": 15,
    "sexton": 16, "sjutton": 17, "arton": 18, "nitton": 19, "tjugo": 20, "trettio": 30,
    "fyrtio": 40, "femtio": 50, "sextio": 60, "sjuttio": 70, "åttio": 80, "nittio": 90, "hundra": 100,
}  # fmt: skip
_COUNT = r"(\d{1,5}|" + "|".join(_NUMBER_WORDS) + r")"
_EMPLOYEES = re.compile(_COUNT + r"\s*(?:st\.?\s*)?(?:anställda|medarbetare|personer)", re.IGNORECASE)
_TURNOVER = re.compile(
    r"omsätt\w*\D{0,40}?(\d[\d ]*(?:[.,]\d+)?)\s*(mnkr|mkr|miljoner|miljon|milj\.?|tkr|kkr|tusen|kronor|kr)?",
    re.IGNORECASE,
)
_MILLION, _THOUSAND = 1e6, 1e3
_UNIT_FACTORS = {
    "mnkr": _MILLION,
    "mkr": _MILLION,
    "miljoner": _MILLION,
    "miljon": _MILLION,
    "milj": _MILLION,
    "milj.": _MILLION,
    "tkr": _THOUSAND,
    "kkr": _THOUSAND,
    "tusen": _THOUSAND,
}
_ISO = re.compile(r"\bISO[\s-]?(\d{4,5}(?::\d{4})?)", re.IGNORECASE)
_REMOVAL = re.compile(r"\b(?:ta bort|tar bort|inte längre|slutat|stryk|stryker)\b", re.IGNORECASE)
# Places after "i": "i Härnösand och Örnsköldsvik", "i Sundsvalls kommun" (without the genitive s).
_PLACE_RUN = re.compile(
    r"\bi ((?:[A-ZÅÄÖ][a-zåäöé-]+?)(?:(?:,\s*| och | samt )[A-ZÅÄÖ][a-zåäöé-]+?)*)(?=s kommun|[^a-zåäöé-]|$)"
)
_PLACE_SPLIT = re.compile(r",\s*| och | samt ")
_DESCRIPTION = re.compile(
    r"beskrivning\w*\s*(?:till|ska vara|ska lyda|lyder)?\s*[:\"”]\s*(.+)$", re.IGNORECASE | re.DOTALL
)
_INSURANCE = re.compile(r"försäkring", re.IGNORECASE)
_REFERENCES = re.compile(r"referensuppdrag|uppdrag (?:åt|för)", re.IGNORECASE)
_WORK_HINT = re.compile(
    r"\b(?:utför|erbjuder|börjat|även|också|numera|lägg till|lägga till|jobbar med|arbetar med|gör|cpv)\b",
    re.IGNORECASE,
)
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
_WORD = re.compile(r"[a-zåäöé]+")
_STOPWORDS = frozenset(
    [
        "och",
        "eller",
        "med",
        "utan",
        "för",
        "till",
        "från",
        "att",
        "som",
        "den",
        "det",
        "vi",
        "har",
        "är",
        "inte",
    ]
)
MAX_CPV_ADDED = 3

CLARIFICATION = (
    "Jag förstod inte vad som ska ändras i profilen. Skriv till exempel ”Vi har numera tolv anställda”, "
    "”Vi är ISO 14001-certifierade”, ”Vi är också verksamma i Härnösand” eller ”Lägg till fasadmålning”."
)
_LABELS = {
    "description": "beskrivningen",
    "cpv": "CPV-koderna",
    "municipalities": "verksamhetsorterna",
    "employees": "antal anställda",
    "annual_turnover_sek": "årsomsättningen",
    "certifications": "certifieringarna",
    "insurance": "försäkringen",
    "public_references": "uppdragen för offentliga köpare",
}


def _count(raw: str) -> int:
    return int(raw) if raw.isdigit() else _NUMBER_WORDS[raw.lower()]


def _turnover(amount: str, unit: str | None) -> int:
    """Whole kronor: "4,8 miljoner" is 4 800 000, and a bare number below 10 000 counts as millions."""

    value = float(amount.replace(" ", "").replace(",", "."))
    if unit:
        value *= _UNIT_FACTORS.get(unit.lower(), 1)
    elif value < 10_000:
        value *= 1e6
    return round(value)


def _stems(text: str) -> set[str]:
    return {word[:6] for word in _WORD.findall(text.lower()) if len(word) >= 3 and word not in _STOPWORDS}


def _sentences(message: str) -> list[str]:
    return [part.strip() for part in _SENTENCE_END.split(message.strip()) if part.strip()]


def _listing(words: Sequence[str]) -> str:
    if len(words) <= 1:
        return "".join(words)
    return f"{', '.join(words[:-1])} och {words[-1]}"


def _matching_codes(message: str, codes: Sequence[tuple[str, str]], limit: int) -> list[str]:
    """Codes whose label shares a word with the message, best overlap first."""

    wanted = _stems(message)
    scored = [(len(wanted & _stems(label)), code) for code, label in codes]
    return [code for score, code in sorted(scored, key=lambda item: -item[0]) if score > 0][:limit]


def _named_codes(message: str, codes: Sequence[tuple[str, str]]) -> list[str]:
    """Codes whose whole label the message names, else the one whose label it comes closest to.

    "Målning av byggnader" names that code and not "Målning", whose words it also contains.
    """

    text = message.lower()
    named = sorted(
        ((label.lower(), code) for code, label in codes if label and label.lower() in text), reverse=True
    )
    kept: list[tuple[str, str]] = []
    for label, code in named:  # longest first: "målning" is part of "målning av byggnader", not named by it
        if not any(label in longer for longer, _ in kept):
            kept.append((label, code))
    return [code for _, code in kept] or _matching_codes(message, codes, 1)


def read_profile_change(
    profile: CompanyProfile, candidates: Sequence[CpvCandidate], message: str
) -> ProfileChange:
    """What the message changes, by the patterns above; a question when none applies."""

    changed: list[str] = []
    change: dict[str, object] = {}
    removing = _REMOVAL.search(message) is not None

    if (found := _DESCRIPTION.search(message)) is not None:
        change["description"] = found.group(1).strip().strip('"”“')
        changed.append("description")
    if (found := _EMPLOYEES.search(message)) is not None:
        change["employees"] = _count(found.group(1))
        changed.append("employees")
    if (found := _TURNOVER.search(message)) is not None:
        change["annual_turnover_sek"] = _turnover(found.group(1), found.group(2))
        changed.append("annual_turnover_sek")

    certificates = [f"ISO {number}" for number in _ISO.findall(message)]
    if certificates:
        current = list(profile.certifications)
        if removing:
            kept = [item for item in current if item.upper().replace("-", " ") not in certificates]
        else:
            kept = current + [item for item in certificates if item not in current]
        if kept != current:
            change["certifications"] = kept
            changed.append("certifications")

    places = [
        place.strip()
        for run in _PLACE_RUN.findall(message)
        for place in _PLACE_SPLIT.split(run)
        if place.strip()
    ]
    if places:
        current = list(profile.municipalities)
        if removing:
            kept = [item for item in current if item not in places]
        else:
            kept = current + [place for place in places if place not in current]
        if kept != current:
            change["municipalities"] = kept
            changed.append("municipalities")

    for sentence in _sentences(message):
        if _INSURANCE.search(sentence) and "insurance" not in changed:
            change["insurance"] = "" if removing else sentence
            changed.append("insurance")
        elif _REFERENCES.search(sentence) and "public_references" not in changed:
            earlier = profile.public_references or ""
            change["public_references"] = "" if removing else (f"{earlier} {sentence}".strip())
            changed.append("public_references")

    if candidates and _WORK_HINT.search(message) and "description" not in changed:
        if removing:
            owned = [(code, profile.cpv_labels.get(code, "")) for code in profile.cpv_codes]
            remove = _named_codes(message, owned)
            if remove:
                change["cpv_remove"] = remove
                changed.append("cpv")
        else:
            new = [(item.code, item.label) for item in candidates if item.code not in profile.cpv_codes]
            add = _matching_codes(message, new, MAX_CPV_ADDED)
            if add:
                change["cpv_add"] = add
                changed.append("cpv")

    if not changed:
        return ProfileChange(reply=CLARIFICATION, needs_clarification=True)
    reply = f"Jag uppdaterar {_listing([_LABELS[name] for name in changed])} i er profil."
    return ProfileChange.model_validate({"reply": reply, **change})
