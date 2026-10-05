"""Which part of a procurement document a page belongs to.

Swedish procurement documents follow a well-known structure (administrativa
föreskrifter, kvalificering, kravspecifikation, utvärdering, avtalsvillkor, bilagor).
Knowing the part lets search and MCP tools narrow a question ("sök bara i
kvalificeringen") without any AI. The heuristics are deliberately simple and
explainable: a section heading decides, a page without one continues the section of
the page before it, and typical vocabulary is the last resort.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

Section = Literal[
    "administrativa",
    "kvalificering",
    "kravspecifikation",
    "utvardering",
    "avtalsvillkor",
    "bilagor",
    "prisbilaga",
]

SECTIONS: tuple[Section, ...] = (
    "administrativa",
    "kvalificering",
    "kravspecifikation",
    "utvardering",
    "avtalsvillkor",
    "bilagor",
    "prisbilaga",
)

# Heading phrases, matched at the start of a word. Order matters within a heading:
# the more specific sections (prisbilaga before bilagor) are listed first.
_HEADING_PHRASES: dict[Section, tuple[str, ...]] = {
    "prisbilaga": ("prisbilaga", "prisformulär", "prisblankett", "prisuppgifter", "prislista"),
    "administrativa": (
        "administrativa föreskrifter",
        "administrativa bestämmelser",
        "administrativa villkor",
        "upphandlingsföreskrifter",
        "allmän information",
        "information om upphandlingen",
        "upphandlingens genomförande",
        "anbudets utformning",
        "anbudsinlämning",
        "anbudsgivning",
        "tidsplan",
        "inledning",
    ),
    "kvalificering": (
        "kvalificering",
        "krav på leverantör",
        "krav på anbudsgivare",
        "leverantörskrav",
        "lämplighetskrav",
        "uteslutning",
    ),
    "kravspecifikation": (
        "kravspecifikation",
        "teknisk specifikation",
        "teknisk beskrivning",
        "tjänstebeskrivning",
        "uppdragsbeskrivning",
        "objektsbeskrivning",
        "beskrivning av uppdraget",
        "uppdragets omfattning",
        "krav på uppdraget",
        "krav på tjänsten",
        "krav på varor",
        "krav på varan",
    ),
    "utvardering": (
        "utvärdering",
        "anbudsutvärdering",
        "tilldelningsgrund",
        "tilldelningskriteri",
        "grund för tilldelning",
    ),
    "avtalsvillkor": (
        "avtalsvillkor",
        "kommersiella villkor",
        "allmänna villkor",
        "särskilda villkor",
        "avtalsbestämmelser",
        "kontraktsvillkor",
        "ramavtalsvillkor",
        "avtalsutkast",
    ),
    "bilagor": ("bilagor", "bilageförteckning", "förteckning över bilagor", "bifogade handlingar"),
}

# Vocabulary typical of each section's body text.
_BODY_TERMS: dict[Section, tuple[str, ...]] = {
    "administrativa": (
        "sista anbudsdag",
        "frågestopp",
        "frågor under anbudstiden",
        "anbudets giltighet",
        "giltighetstid",
        "avtalsspärr",
        "tilldelningsbeslut",
        "annonserad upphandling",
        "förenklat förfarande",  # the name before 1 February 2022; older documents still use it
        "öppet förfarande",
        "e-avrop",
        "anbudsöppning",
    ),
    "kvalificering": (
        "f-skatt",
        "registrerad",
        "ekonomisk stabilitet",
        "ekonomisk ställning",
        "kreditupplysning",
        "rating",
        "omsättning",
        "ansvarsförsäkring",
        "referensuppdrag",
        "sanningsförsäkran",
        "espd",
        "teknisk förmåga",
        "yrkesmässig kapacitet",
        "uteslut",
    ),
    "kravspecifikation": (
        "ska utföras",
        "utförande",
        "material",
        "arbetsmiljö",
        "kvalitetskrav",
        "miljökrav",
        "skyddsåtgärd",
        "bemanning",
        "ska levereras",
        "leveranstid",
        "ama ",
    ),
    "utvardering": (
        "utvärderas",
        "viktning",
        "poäng",
        "mervärde",
        "jämförelsepris",
        "utvärderingspris",
        "fiktivt avdrag",
        "bästa förhållandet mellan pris och kvalitet",
        "lägsta pris",
    ),
    "avtalsvillkor": (
        "avtalsperiod",
        "avtalstid",
        "förlängning",
        "option",
        "fakturering",
        "betalningsvillkor",
        "vite",
        "hävning",
        "häva avtalet",
        "uppsägning",
        "prisjustering",
        "ab 04",
        "abt 06",
        "garantitid",
        "underleverantör",
    ),
    "bilagor": ("bilaga", "blankett", "bifogas"),
    "prisbilaga": (
        "timpris",
        "à-pris",
        "a-pris",
        "enhetspris",
        "totalpris",
        "fast pris",
        "exkl. moms",
        "exklusive moms",
        "kr/tim",
        "kronor per",
    ),
}

HEADING_LINES = 3
"""The first non-empty lines of a page are treated as possible headings."""

MIN_BODY_SCORE = 4
"""Minimum vocabulary score for a page that has neither a heading nor a previous section."""

_MAX_HITS_PER_TERM = 3
_MAX_HEADING_CHARS = 80
_MAX_PHRASE_OFFSET = 32  # a heading phrase must open the heading, not end a wrapped sentence
_NUMBERING = re.compile(r"^(?:\d+(?:\.\d+)*\.?|[A-ZÅÄÖ]{1,3}\.?\d+(?:\.\d+)*\.?)\s+(?=\S)")
_ANNEX_HEADING = re.compile(r"^bilaga\s+\d+\b")
_TABLE_OF_CONTENTS = re.compile(r"^innehåll(?:sförteckning)?\b")

_HEADING_PATTERNS: dict[Section, re.Pattern[str]] = {
    section: re.compile(r"\b(?:" + "|".join(re.escape(p) for p in phrases) + ")")
    for section, phrases in _HEADING_PHRASES.items()
}


@dataclass(frozen=True, slots=True)
class _PageSignal:
    headings: list[Section]  # sections named by headings, in page order
    is_contents: bool
    vocabulary: Section | None


def _heading_lines(text: str) -> list[str]:
    """Heading-like lines, lower-cased and without numbering.

    Candidates are the first few lines and any numbered line, as long as they are short
    and do not end like a sentence.
    """

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    headings: list[str] = []
    for position, line in enumerate(lines):
        if len(line) > _MAX_HEADING_CHARS or line.endswith((".", ",", ";", ":")):
            continue
        numbering = _NUMBERING.match(line)
        if position < HEADING_LINES or numbering:
            headings.append(line[numbering.end() if numbering else 0 :].lower())
    return headings


def _section_of_heading(line: str) -> Section | None:
    for section, pattern in _HEADING_PATTERNS.items():
        match = pattern.search(line)
        if match is not None and match.start() <= _MAX_PHRASE_OFFSET:
            return section
    return "bilagor" if _ANNEX_HEADING.match(line) else None


def _vocabulary_section(text: str) -> Section | None:
    lowered = text.lower()
    scores = {
        section: sum(min(lowered.count(term), _MAX_HITS_PER_TERM) for term in terms)
        for section, terms in _BODY_TERMS.items()
    }
    best = max(SECTIONS, key=lambda section: scores[section])
    return best if scores[best] >= MIN_BODY_SCORE else None


def _signal(text: str) -> _PageSignal:
    lines = _heading_lines(text)
    if any(_TABLE_OF_CONTENTS.match(line) for line in lines[:HEADING_LINES]):
        return _PageSignal(headings=[], is_contents=True, vocabulary=None)
    headings: list[Section] = [s for line in lines if (s := _section_of_heading(line)) is not None]
    return _PageSignal(headings=headings, is_contents=False, vocabulary=_vocabulary_section(text))


def classify_section(text: str) -> Section | None:
    """The section of a single page: its first section heading, else its vocabulary.

    Returns None for a table of contents and for pages without a clear signal.
    """

    signal = _signal(text)
    return signal.headings[0] if signal.headings else signal.vocabulary


def classify_pages(pages: Sequence[str]) -> list[Section | None]:
    """Classify a document's pages in order.

    A page without a section heading continues the section that was running at the end
    of the previous page (its last heading); vocabulary decides only when nothing runs.
    A table of contents gets no section and interrupts nothing after it.
    """

    labels: list[Section | None] = []
    running: Section | None = None
    for text in pages:
        signal = _signal(text)
        if signal.is_contents:
            label = None
        elif signal.headings:
            label = signal.headings[0]
        else:
            label = running or signal.vocabulary
        labels.append(label)
        running = signal.headings[-1] if signal.headings else label
    return labels
