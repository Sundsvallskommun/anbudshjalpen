"""Offline, deterministic AI engine without a language model.

It keeps the app and the tests runnable anywhere and gives the quality test a baseline
to beat. Everything it reports is either a verbatim excerpt of the page text (so every
citation verifies) or a plain count, and every summary says that no language model was
used. It never guesses: whatever the rules cannot find is reported as not found.
"""

from __future__ import annotations

import datetime as dt
import re
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

from anbudsklar.ai.engine import EngineRun, QuestionTurn, RuleContext
from anbudsklar.contracts import (
    Answer,
    AttachmentCheck,
    Checklist,
    Citation,
    CompanyProfile,
    CpvCandidate,
    CpvSuggestion,
    CpvSuggestions,
    EvaluationCriterion,
    KeyDate,
    MatchAssessment,
    MatchReason,
    NoticeContext,
    PagedDocument,
    RequiredAttachment,
    Requirement,
    RequirementCheck,
    ReviewResult,
    RulesAnswer,
    RuleSource,
    TermExplanation,
)
from anbudsklar.contracts.tasks import CheckStatus, DateKind, Fit, RequirementKind
from anbudsklar.cpv import MIN_GROUP_DIGITS, closest_cpv_pair

HEURISTIC_PREFIX = "Automatisk sammanställning utan språkmodell:"
_QUOTE_LIMIT = 300
_PLAIN_LIMIT = 600
_TITLE_WORDS = 12

# --- Text utilities -----------------------------------------------------------------

_WHITESPACE = re.compile(r"\s+")
_BULLET = re.compile(r"^(?:[-•–*▪]|\d{1,2}[.)]|[a-z][.)])\s+")
_SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+(?=[A-ZÅÄÖ\"„(])")
_ABBREVIATIONS = frozenset(
    {"t.ex", "bl.a", "m.m", "m.fl", "kap", "ca", "inkl", "exkl", "resp", "nr", "s", "st", "jfr", "dvs", "osv"}
)
_WORD = re.compile(r"[a-zåäöéü0-9]+")
_STOPWORD_TEXT = """
    att och eller i på av för med som är det den de en ett till om från vid ska skall kan får
    inte har hade vara vad vilka vilken vilket hur när var jag vi ni du man sig sin sina så då än
    även också mer mest alla allt efter under över samt enligt detta denna dessa här där kommer
    måste bör skulle finns gäller ingen inga något några min mitt mina vår vårt våra er ert era
"""
_STOPWORDS = frozenset(_STOPWORD_TEXT.split())


@dataclass(frozen=True)
class Sentence:
    """A sentence as it appears on a page, with whitespace collapsed.

    `segment` numbers the paragraph, list item or heading the sentence came from and
    `section` the heading it stands under, so a sentence that only elaborates the one
    before it can be told apart from a new topic.
    """

    page: int
    text: str
    segment: int = 0
    section: int = 0


def _collapse(text: str) -> str:
    return _WHITESPACE.sub(" ", text).strip()


def _excerpt(text: str, limit: int = _QUOTE_LIMIT) -> str:
    """A prefix of `text` cut at a word boundary, so it stays a verbatim substring."""

    if len(text) <= limit:
        return text
    cut = text.rfind(" ", 0, limit)
    return text[: cut if cut > 0 else limit]


def _title(text: str) -> str:
    words = _BULLET.sub("", text).split()
    title = " ".join(words[:_TITLE_WORDS]).rstrip(".,;:")
    return (title + " …" if len(words) > _TITLE_WORDS else title)[:160]


def _stems(text: str) -> set[str]:
    """Crude Swedish stems: content words cut to six letters, enough for overlap scores."""

    return {word[:6] for word in _WORD.findall(text.lower()) if len(word) >= 3 and word not in _STOPWORDS}


def _matching_words(text: str, stems: set[str], limit: int = 5) -> list[str]:
    words: list[str] = []
    for word in _WORD.findall(text.lower()):
        if word[:6] in stems and word not in words and word not in _STOPWORDS:
            words.append(word)
    return words[:limit]


# "2.3 Frågor under anbudstiden", "Bilaga 2 Referensblankett": a numbered heading starts a
# new segment even when the line before it is a table row without punctuation.
_NUMBERED_HEADING = re.compile(r"^(?:\d{1,2}(?:\.\d{1,2})*\.?|[Bb]ilaga\s+\d{1,2})\s+[A-ZÅÄÖ]")
_TOC_ENTRY = re.compile(r"\s\d{1,3}$")
_HEADING_WORDS = 10
_RUNNING_LINE_CANDIDATES = 2
_RUNNING_LINE_MIN_PAGES = 3


def _is_heading(previous: str, line: str) -> bool:
    return bool(_NUMBERED_HEADING.match(line)) or (
        len(previous) <= 60
        and len(previous.split()) <= 8
        and not previous.endswith((".", ",", ";", ":", "!", "?"))
        and line[:1].isupper()
    )


def _looks_like_heading(text: str) -> bool:
    """A numbered heading or a table-of-contents entry, which is never a requirement."""

    if text.endswith((".", "!", "?")) or len(text.split()) > _HEADING_WORDS:
        return False
    return bool(_NUMBERED_HEADING.match(text) or _TOC_ENTRY.search(text))


def _line_key(line: str) -> str:
    return re.sub(r"\d+", "#", _collapse(line)).lower()


def running_lines(pages: Sequence[str]) -> frozenset[str]:
    """Page headers and footers: lines at the top or bottom of most pages.

    They are segment boundaries, so "Sundsvalls kommun – … DEMO-2026-0147" is never glued
    onto the heading or sentence below it. Digits are ignored ("Sida 3 av 17").
    """

    if len(pages) < _RUNNING_LINE_MIN_PAGES:
        return frozenset()
    counts: Counter[str] = Counter()
    for page in pages:
        lines = [line.strip() for line in page.splitlines() if line.strip()]
        edges = lines[:_RUNNING_LINE_CANDIDATES] + lines[-_RUNNING_LINE_CANDIDATES:]
        counts.update({_line_key(line) for line in edges})
    threshold = max(_RUNNING_LINE_MIN_PAGES, (len(pages) + 1) // 2)
    return frozenset(key for key, count in counts.items() if count >= threshold)


def _segments(page_text: str, skip: frozenset[str] = frozenset()) -> list[str]:
    """Paragraphs, list items and headings of a page, joining wrapped lines."""

    segments: list[str] = []
    current: list[str] = []
    for raw in page_text.splitlines():
        line = raw.strip()
        if not line or (skip and _line_key(line) in skip):
            segments.append(" ".join(current))
            current = []
            continue
        if current and (
            _BULLET.match(line)
            or current[-1].endswith((".", "!", "?", ":", ";"))
            or _is_heading(current[-1], line)
        ):
            segments.append(" ".join(current))
            current = []
        current.append(line)
    segments.append(" ".join(current))
    return [segment for segment in segments if segment]


def _segment_sentences(segment: str) -> list[str]:
    text = _collapse(segment)
    sentences: list[str] = []
    start = 0
    for match in _SENTENCE_BREAK.finditer(text):
        last_word = text[start : match.start()].rsplit(" ", 1)[-1].rstrip(".!?").lower()
        if last_word in _ABBREVIATIONS:
            continue
        sentences.append(text[start : match.start()].strip())
        start = match.end()
    sentences.append(text[start:].strip())
    return [sentence for sentence in sentences if sentence]


def split_sentences(page_text: str, skip: frozenset[str] = frozenset()) -> list[str]:
    """Sentences of one page, verbatim apart from collapsed whitespace."""

    return [sentence for segment in _segments(page_text, skip) for sentence in _segment_sentences(segment)]


def _is_heading_segment(segment: str) -> bool:
    text = _collapse(segment)
    return _looks_like_heading(text) or (
        len(text) <= 60
        and len(text.split()) <= 8
        and not text.endswith((".", ",", ";", ":", "!", "?"))
        and text[:1].isupper()
    )


def document_sentences(pages: Sequence[str]) -> list[Sentence]:
    skip = running_lines(pages)
    sentences: list[Sentence] = []
    segment_number = section_number = 0
    for page_number, page in enumerate(pages, start=1):
        for segment in _segments(page, skip):
            segment_number += 1
            if _is_heading_segment(segment):
                section_number += 1
            sentences.extend(
                Sentence(page=page_number, text=text, segment=segment_number, section=section_number)
                for text in _segment_sentences(segment)
            )
    return sentences


def _citation(sentence: Sentence) -> Citation:
    return Citation(page=sentence.page, quote=_excerpt(sentence.text))


def _best_matches(query: set[str], sentences: Iterable[Sentence]) -> list[tuple[float, Sentence]]:
    """Sentences ranked by the share of query stems they contain (best first, stable)."""

    if not query:
        return []
    scored = [(len(query & _stems(sentence.text)) / len(query), sentence) for sentence in sentences]
    return sorted((item for item in scored if item[0] > 0), key=lambda item: -item[0])


# --- tolka_underlag -----------------------------------------------------------------

# Obligations and prohibitions ("får inte", "får … endast", "godtas inte") are both
# requirements. A "får … inte" must not reach into a subordinate clause: in "Anbudet får
# förkastas om anbudsgivaren inte kan förklara", the "inte" belongs to the om-clause.
_OBLIGATION = re.compile(
    r"\b(?:ska|skall|måste)\b(?!-)|\bkrävs\b|\b(?:är|blir)\s+skyldig\w*\b"
    r"|\bfår\b(?:\s+(?!(?:om|att|som|när|eftersom|innan|där|så)\b)\S+){0,5}?\s+(?:inte|endast|enbart)\b"
    r"|\b(?:godtas|accepteras|tillåts)\s+inte\b",
    re.IGNORECASE,
)
# Duties written in the present tense ("Leverantören tillhandahåller en kundtjänst").
_SUPPLIER_DUTY = re.compile(
    r"^(?:leverantören|anbudsgivaren)\s+(?:(?:ansvarar|svarar|står)\s+för|håller\s+med|tillhandahåller|"
    r"redovisar|förbinder\s+sig|åtar\s+sig|åtager\s+sig|byter\s+ut|garanterar)\b",
    re.IGNORECASE,
)
# A sanction is a contract term even without "ska": "Vid försening har kommunen rätt till vite."
_SANCTION = re.compile(r"\bvite\b", re.IGNORECASE)
_SUBORDINATORS = frozenset(
    {"som", "att", "om", "när", "eftersom", "innan", "där", "medan", "tills", "vilka", "vilket", "vilken"}
)
_SUBORDINATE_WINDOW = 3
_INVERTED_SUBJECT = re.compile(
    r"\s+(?:leverantören|anbudsgivaren|anbudet|anbuden|kommunen|beställaren|köparen|den|det|de)\b",
    re.IGNORECASE,
)
_BUYER_SUBJECT = re.compile(
    r"^(?:\S+\s+){0,3}?(?:kommunen|beställaren|köparen|myndigheten|den upphandlande)\b", re.IGNORECASE
)
# "Kommunen kräver att leverantören …" states a requirement although the buyer is the subject.
_BUYER_DEMANDS = re.compile(r"\b(?:kräver|förutsätter|ställer\s+krav)\b", re.IGNORECASE)
_CONTRACT_TERMS = re.compile(
    r"\bvite|faktur|betalning|avtalstid|avtalsperiod|förläng|uppsäg|\boption|prisjuster|garanti|häva",
    re.IGNORECASE,
)
_KIND_CUES: tuple[tuple[RequirementKind, re.Pattern[str]], ...] = (
    (
        "kvalificeringskrav",
        re.compile(
            r"f-skatt|registrera|ekonomisk|omsättning|kreditupplys|\w*försäkring|referens|uteslut|espd|"
            r"sanningsförs|skatter och avgifter|arbetsmiljö|erfarenhet|kapacitet|certifi",
            re.IGNORECASE,
        ),
    ),
    ("avtalsvillkor", _CONTRACT_TERMS),
    ("skallkrav", re.compile(r"\banbud(?:et|en)?\b|prisbilaga|ifylld|på svenska", re.IGNORECASE)),
)
_EVIDENCE_CUE = re.compile(r"bifoga|intyg|bevis|redovisa|lämna in|bilaga|blankett|styrk", re.IGNORECASE)
_EVIDENCE_TERMS = re.compile(
    r"\b(?:försäkringsbevis|referensblankett|prisbilaga|sanningsförsäkran|ESPD|registreringsbevis|intyg|"
    r"certifikat|kreditupplysning|årsredovisning|genomförandebeskrivning|CV|referensuppdrag)\b",
    re.IGNORECASE,
)
_ATTACHMENT_REF = re.compile(
    r"\b[Bb]ilaga\s+(\d{1,2})\b(?:\s*[,–:-]?\s*([A-ZÅÄÖ][\wåäöÅÄÖ-]*(?:\s+[a-zåäö][\wåäö-]*){0,2}))?"
)
_SUBMISSION_CUE = re.compile(r"bifoga|lämna|bilägg|fyll|inkomm|\bska\b|\bskall\b", re.IGNORECASE)


def _requirement_kind(text: str) -> RequirementKind:
    for kind, pattern in _KIND_CUES:
        if pattern.search(text):
            return kind
    return "krav_pa_uppdraget"


def _in_main_clause(text: str, start: int, end: int) -> bool:
    """Whether the cue at text[start:end] belongs to the main clause.

    "Tabellen visar vilka handlingar som ska lämnas" and "Krav som måste vara uppfyllda"
    describe obligations without imposing one, because the verb sits in a subordinate
    clause. Swedish word order gives the main verb away in two common cases: it comes
    straight before the subject after a fronted clause ("Innan arbetet påbörjas ska
    leverantören …"), and it follows a relative clause that has a verb of its own
    ("Varor som kräver kylförvaring ska …", "Brister som förskolan anmäler ska …").
    """

    if _INVERTED_SUBJECT.match(text, end):
        return True
    words = re.split(r"[,;:()]", text[:start])[-1].lower().split()[-_SUBORDINATE_WINDOW:]
    positions = [index for index, word in enumerate(words) if word in _SUBORDINATORS]
    if not positions:
        return True
    last = positions[-1]
    between = words[last + 1 :]
    return words[last] == "som" and any(word.endswith(("r", "s")) and word != "inte" for word in between)


def _has_obligation(text: str) -> bool:
    return any(_in_main_clause(text, match.start(), match.end()) for match in _OBLIGATION.finditer(text))


def _is_requirement(text: str) -> bool:
    if len(text.split()) < 4 or text.endswith("?"):
        return False
    obliged = _has_obligation(text)
    if _looks_like_heading(text) and not obliged:
        return False
    if not (obliged or _SUPPLIER_DUTY.search(text) or _SANCTION.search(text)):
        return False
    buyer_duty = _BUYER_SUBJECT.search(text) and not _BUYER_DEMANDS.search(text)
    return not (buyer_duty and not _CONTRACT_TERMS.search(text))


def _evidence(text: str) -> str | None:
    if not _EVIDENCE_CUE.search(text):
        return None
    found: list[str] = []
    for match in _EVIDENCE_TERMS.finditer(text):
        term = match.group(0)
        if term.lower() not in (item.lower() for item in found):
            found.append(term)
    found.extend(f"Bilaga {number}" for number, _ in _ATTACHMENT_REF.findall(text))
    if not found:
        return None
    joined = ", ".join(dict.fromkeys(found))
    return joined[:1].upper() + joined[1:]


# A sentence that only elaborates the requirement before it in the same paragraph is
# folded into that requirement instead of becoming one of its own: "Försäkringsbevis ska
# bifogas anbudet", "Varje uppdrag ska …", "Uppdragen ska redovisas …", "… på begäran visa".
_FOLLOW_UP_START = re.compile(r"^(?:varje|samma|kravet|kraven|dessa|detta|denna)\b", re.IGNORECASE)
_ON_REQUEST = re.compile(r"\bpå\s+(?:\w+\s+)?begäran\b", re.IGNORECASE)
_EVIDENCE_ONLY = re.compile(
    r"^(?!(?:leverantören|anbudsgivaren|anbudet|anbud)\b)(?:\S+\s+){0,4}?(?:ska|skall)\s+"
    r"(?:bifogas|biläggas|lämnas\s+(?:in|med))\b",
    re.IGNORECASE,
)
_DEFINITE_SUFFIX = re.compile(r"(?:erna|arna|orna|en|et|na|an)$")
_PARTIES = frozenset(
    {
        "leverantören",
        "anbudsgivaren",
        "anbudet",
        "anbuden",
        "kommunen",
        "beställaren",
        "köparen",
        "myndigheten",
        "avtalet",
        "kontraktet",
        "uppdraget",
    }
)
_ANAPHOR_KEY = 6
_DUPLICATE_SIMILARITY = 0.8
_DUPLICATE_MIN_STEMS = 4


@dataclass
class _RequirementDraft:
    sentence: Sentence
    texts: list[str]
    stems: set[str] = field(default_factory=set)

    @property
    def text(self) -> str:
        return " ".join(self.texts)


def _refers_back(text: str, previous: str) -> bool:
    """The sentence opens with a definite noun the previous requirement already introduced.

    "Uppdragen" after "två uppdrag", "Stängslet" after "byggstängsel", "Fakturan" after
    "fakturor". The parties themselves ("Leverantören ska …") always start a new requirement.
    """

    first = _WORD.match(text.lower())
    if first is None:
        return False
    word = first.group(0)
    if word in _PARTIES or len(word) < 5 or not _DEFINITE_SUFFIX.search(word):
        return False
    key = _DEFINITE_SUFFIX.sub("", word)[:_ANAPHOR_KEY]
    return len(key) >= 3 and any(key in other for other in _WORD.findall(previous.lower()))


def _is_follow_up(sentence: Sentence, previous: _RequirementDraft) -> bool:
    """Whether the sentence elaborates `previous` (how to prove it, a detail of it).

    "På begäran visa …" proves the requirement before it anywhere under the same heading;
    the other signals only hold within one paragraph.
    """

    text = sentence.text
    if _ON_REQUEST.search(text):
        return sentence.section == previous.sentence.section
    if sentence.segment != previous.sentence.segment:
        return False
    return bool(
        _FOLLOW_UP_START.search(text) or _EVIDENCE_ONLY.search(text) or _refers_back(text, previous.text)
    )


def _near_duplicate(stems: set[str], drafts: Sequence[_RequirementDraft]) -> bool:
    """The same requirement restated elsewhere, for example in a summary table."""

    if len(stems) < _DUPLICATE_MIN_STEMS:
        return False
    for draft in drafts:
        if len(draft.stems) >= _DUPLICATE_MIN_STEMS:
            overlap = len(stems & draft.stems) / len(stems | draft.stems)
            if overlap >= _DUPLICATE_SIMILARITY:
                return True
    return False


def _requirements(sentences: Sequence[Sentence]) -> list[Requirement]:
    drafts: list[_RequirementDraft] = []
    seen: set[str] = set()
    for sentence in sentences:
        key = sentence.text.lower()
        if key in seen or not _is_requirement(sentence.text):
            continue
        seen.add(key)
        if drafts and _is_follow_up(sentence, drafts[-1]):
            drafts[-1].texts.append(sentence.text)
            continue
        stems = _stems(sentence.text)
        if _near_duplicate(stems, drafts):
            continue
        drafts.append(_RequirementDraft(sentence=sentence, texts=[sentence.text], stems=stems))
    return [
        Requirement(
            id=f"K{number}",
            kind=_requirement_kind(draft.sentence.text),
            title=_title(draft.sentence.text),
            plain_language=_excerpt(draft.text, _PLAIN_LIMIT),
            evidence=_evidence(draft.text),
            citation=_citation(draft.sentence),
        )
        for number, draft in enumerate(drafts, start=1)
    ]


def _attachments(sentences: Sequence[Sentence]) -> list[RequiredAttachment]:
    found: dict[str, RequiredAttachment] = {}
    for sentence in sentences:
        if not _SUBMISSION_CUE.search(sentence.text):
            continue
        for number, label in _ATTACHMENT_REF.findall(sentence.text):
            key = f"bilaga {number}"
            if key not in found or (label and found[key].name == f"Bilaga {number}"):
                name = f"Bilaga {number} {label}".strip()
                found[key] = RequiredAttachment(name=name, citation=_citation(sentence))
        if "bifoga" in sentence.text.lower():
            for match in _EVIDENCE_TERMS.finditer(sentence.text):
                term = match.group(0)
                key = term.lower()
                if key not in found and not any(key in item.name.lower() for item in found.values()):
                    found[key] = RequiredAttachment(
                        name=term[:1].upper() + term[1:], citation=_citation(sentence)
                    )
    return list(found.values())


_WEIGHT = re.compile(r"(\d{1,3}(?:[,.]\d+)?)\s*(?:%|procent)")
_EVALUATION_CONTEXT = re.compile(r"utvärder|vikt|tilldel|poäng|bedöm", re.IGNORECASE)
_WEIGHT_FILLERS = frozenset(
    {
        "viktas",
        "vikt",
        "vikten",
        "med",
        "till",
        "av",
        "om",
        "är",
        "och",
        "utgör",
        "motsvarar",
        "på",
        "ges",
        "sker",
    }
)


def _criterion_name(text_before: str) -> str | None:
    for word in reversed(re.findall(r"[A-Za-zÅÄÖåäöé-]+", text_before)[-4:]):
        if word.lower() not in _WEIGHT_FILLERS:
            return word[:1].upper() + word[1:]
    return None


def _evaluation(sentences: Sequence[Sentence]) -> list[EvaluationCriterion]:
    criteria: dict[str, EvaluationCriterion] = {}
    for sentence in sentences:
        for match in _WEIGHT.finditer(sentence.text):
            name = _criterion_name(sentence.text[: match.start()])
            if name is None:
                continue
            weight = float(match.group(1).replace(",", "."))
            plausible = _EVALUATION_CONTEXT.search(sentence.text) or name.lower() in {"pris", "kvalitet"}
            if weight > 100 or not plausible or name.lower() in criteria:
                continue
            criteria[name.lower()] = EvaluationCriterion(
                name=name,
                weight_percent=weight,
                how_assessed=_excerpt(sentence.text),
                citation=_citation(sentence),
            )
    return list(criteria.values())


_MONTH_NAMES = "januari februari mars april maj juni juli augusti september oktober november december"
_MONTHS = {name: number for number, name in enumerate(_MONTH_NAMES.split(), start=1)}
_ISO_DATE = re.compile(r"\b(20\d{2})-(\d{2})-(\d{2})\b")
_SWEDISH_DATE = re.compile(rf"\b(\d{{1,2}})\s+({'|'.join(_MONTHS)})\s+(20\d{{2}})\b", re.IGNORECASE)
_PERIOD = re.compile(r"\b\d+\s+(?:dagar|månader)\b", re.IGNORECASE)
# Each date takes its kind from the words just before it (a table row's label, or the
# clause since the previous date), so "från den 1 februari 2027 till och med den 31
# januari 2029" gives one contract start and one other date. The first pattern that
# matches wins: the buyer's own steps and the site visit come first, so "Sista dag för
# kommunens svar på frågor" and "Anmälan görs via frågefunktionen … senast" are not the
# question deadline.
_DATE_KINDS: tuple[tuple[DateKind, re.Pattern[str]], ...] = (
    (
        "annat",
        re.compile(
            r"\bsvar\w*\s+på\s+frågor|\bbesvara\w*|\bpublicera\w*|\banmäl\w*|platsbesök", re.IGNORECASE
        ),
    ),
    (
        "fragestopp",
        re.compile(
            r"frågestopp|sista\s+(?:dag|dagen|datum)\s+för\s+(?:att\s+ställa\s+)?frågor"
            r"|\bfrågor\b.{0,60}?\bsenast\b|\bsenast\b.{0,40}?\bställ\w*\s+frågor",
            re.IGNORECASE,
        ),
    ),
    ("anbudets_giltighet", re.compile(r"giltig|bunden|bindande", re.IGNORECASE)),
    ("tilldelning", re.compile(r"tilldelning", re.IGNORECASE)),
    (
        "avtalsstart",
        re.compile(
            r"avtalsstart|startdatum"
            r"|(?:avtal|kontrakt)\w*\s+(?:börjar|startar|träder\s+i\s+kraft|gäller\s+från|löper\s+från)"
            r"|(?:avtal|kontrakt|leverans)\w*\s+(?:påbörjas|inleds)",
            re.IGNORECASE,
        ),
    ),
    (
        "sista_anbudsdag",
        re.compile(
            r"sista\s+anbudsdag|\banbud\w*\b.{0,60}?\b(?:senast|inkomm\w*|kommit\s+in|lämnas)"
            r"|\b(?:senast|sista)\b.{0,30}?\banbud",
            re.IGNORECASE,
        ),
    ),
)
# A procurement has one deadline of each of these kinds. A second, different date of the
# same kind is kept as "annat", so the checklist never shows two question deadlines.
_SINGLE_DATE_KINDS: frozenset[DateKind] = frozenset(
    {"fragestopp", "sista_anbudsdag", "anbudets_giltighet", "tilldelning", "avtalsstart"}
)


def _date_spans(text: str) -> list[tuple[int, int, dt.date]]:
    """Valid dates in the text with their positions, in reading order."""

    found: list[tuple[int, int, dt.date]] = []
    for match in _ISO_DATE.finditer(text):
        year, month, day = (int(group) for group in match.groups())
        found.extend(_valid(match, year, month, day))
    for match in _SWEDISH_DATE.finditer(text):
        day, month_name, year = match.groups()
        found.extend(_valid(match, int(year), _MONTHS[month_name.lower()], int(day)))
    return sorted(found, key=lambda item: item[0])


def _valid(match: re.Match[str], year: int, month: int, day: int) -> list[tuple[int, int, dt.date]]:
    try:
        return [(match.start(), match.end(), dt.date(year, month, day))]
    except ValueError:
        return []


def _match_kind(text: str) -> DateKind | None:
    for kind, pattern in _DATE_KINDS:
        if pattern.search(text):
            return kind
    return None


def _date_kind(text: str) -> DateKind:
    return _match_kind(text) or "annat"


def _kinds_in(text: str) -> list[tuple[DateKind, dt.date | None]]:
    """Each date with the kind its own label gives it.

    The label is the text between the previous date (or the start) and the date. Only
    when that says nothing is the text after the date, up to the next one, consulted:
    "Den 30 oktober 2026 är sista dagen för frågor."
    """

    spans = _date_spans(text)
    if not spans:
        kind = _date_kind(text)
        return [(kind, None)] if kind == "anbudets_giltighet" and _PERIOD.search(text) else []
    result: list[tuple[DateKind, dt.date | None]] = []
    for index, (start, end, date) in enumerate(spans):
        label_start = spans[index - 1][1] if index else 0
        after_end = spans[index + 1][0] if index + 1 < len(spans) else len(text)
        kind = _match_kind(text[label_start:start]) or _match_kind(text[end:after_end]) or "annat"
        result.append((kind, date))
    return result


def _dates(sentences: Sequence[Sentence]) -> list[KeyDate]:
    dates: list[KeyDate] = []
    seen: set[tuple[str, dt.date | None]] = set()
    single: dict[str, dt.date | None] = {}
    for sentence in sentences:
        for found_kind, date in _kinds_in(sentence.text):
            kind = found_kind
            if kind in _SINGLE_DATE_KINDS and single.setdefault(kind, date) != date:
                kind = "annat"
            if (kind, date) in seen:
                continue
            seen.add((kind, date))
            dates.append(
                KeyDate(
                    kind=kind,
                    date=date,
                    description=_excerpt(sentence.text, 200),
                    citation=_citation(sentence),
                )
            )
    return dates


_GLOSSARY: dict[str, str] = {
    "avtalsspärr": "En period efter tilldelningsbeslutet då köparen inte får skriva avtal, så att "
    "leverantörer hinner begära överprövning.",
    "ESPD": "Europeiskt enhetligt upphandlingsdokument: en standardiserad egen försäkran om att företaget "
    "uppfyller kvalificeringskraven.",
    "sanningsförsäkran": "En skriftlig försäkran om att uppgifterna i anbudet stämmer och att det inte finns "
    "skäl att utesluta företaget.",
    "förenklat förfarande": "Ett äldre namn som togs bort ur LOU den 1 februari 2022. I dag gäller "
    "19 kap. LOU för upphandlingar under EU:s tröskelvärden, och köparen beskriver i underlaget hur "
    "upphandlingen går till.",
    "urvalsförfarande": "Ett äldre namn som togs bort ur LOU den 1 februari 2022. Det betydde att köparen "
    "först valde ut vilka leverantörer som fick lämna anbud.",
    "ramavtal": "Ett avtal som anger villkoren för framtida beställningar under avtalstiden.",
    "frågestopp": "Sista dagen att ställa frågor om underlaget. Frågor ställs i e-Avrop så att svaren når "
    "alla.",
    "F-skatt": "Ett godkännande från Skatteverket som visar att företaget själv betalar sina skatter och "
    "avgifter.",
    "vite": "Ett belopp som leverantören ska betala om avtalet inte följs, till exempel vid försening.",
    "dynamiskt inköpssystem": "En elektronisk process för inköp där leverantörer kan ansluta sig under hela "
    "systemets löptid.",
    "tilldelningsbeslut": "Köparens beslut om vilken eller vilka leverantörer som ska få avtalet.",
    "underleverantör": "Ett annat företag som utför en del av uppdraget åt leverantören.",
    "skallkrav": "Ett krav som måste uppfyllas. Uppfylls det inte går anbudet inte vidare.",
}
_MAX_TERMS = 6


def _terms(sentences: Sequence[Sentence]) -> list[TermExplanation]:
    terms: list[TermExplanation] = []
    for term, explanation in _GLOSSARY.items():
        pattern = re.compile(rf"\b{re.escape(term)}", re.IGNORECASE)
        sentence = next((item for item in sentences if pattern.search(item.text)), None)
        if sentence is not None:
            terms.append(TermExplanation(term=term, explanation=explanation, citation=_citation(sentence)))
    terms.sort(key=lambda item: item.citation.page if item.citation else 0)
    return terms[:_MAX_TERMS]


# Procedures by their current names in LOU. "Förenklat förfarande" and
# "urvalsförfarande" left the law on 1 February 2022, so they are never reported as the
# procedure; a document that still uses them is an under-threshold procurement (19 kap.).
_PROCEDURE = re.compile(
    r"öppet förfarande|selektivt förfarande|förhandlat förfarande(?: (?:med|utan) föregående annonsering)?"
    r"|konkurrenspräglad dialog|innovationspartnerskap|direktupphandling|dynamiskt inköpssystem"
    r"|annonserad upphandling under tröskelvärdena",
    re.IGNORECASE,
)
_UNDER_THRESHOLD = re.compile(
    r"förenklat förfarande|urvalsförfarande|under\s+tröskelvärde|\b19\s+kap\.", re.IGNORECASE
)
_UNDER_THRESHOLD_PROCEDURE = "Upphandling under tröskelvärdena (19 kap. LOU)"


def _procedure(sentences: Sequence[Sentence]) -> str | None:
    for sentence in sentences:
        match = _PROCEDURE.search(sentence.text)
        if match:
            text = match.group(0).lower()
            return text[:1].upper() + text[1:]
    if any(_UNDER_THRESHOLD.search(sentence.text) for sentence in sentences):
        return _UNDER_THRESHOLD_PROCEDURE
    return None


def _open_questions(dates: Sequence[KeyDate], evaluation: Sequence[EvaluationCriterion]) -> list[str]:
    kinds = {item.kind for item in dates if item.date}
    questions = []
    if "sista_anbudsdag" not in kinds:
        questions.append("Sista anbudsdag hittades inte automatiskt. Kontrollera annonsen i e-Avrop.")
    if "fragestopp" not in kinds:
        questions.append("Frågestopp hittades inte automatiskt. Kontrollera underlaget.")
    if not evaluation:
        questions.append("Hur anbuden utvärderas hittades inte automatiskt. Kontrollera underlaget.")
    return questions


# --- bedom_matchning ----------------------------------------------------------------


_PROFILE_CHECKS: tuple[tuple[re.Pattern[str], str, str], ...] = (
    (re.compile(r"försäkring", re.IGNORECASE), "insurance", "försäkring"),
    (re.compile(r"referens", re.IGNORECASE), "public_references", "referensuppdrag"),
    (re.compile(r"omsättning|ekonomisk", re.IGNORECASE), "annual_turnover_sek", "omsättning"),
    (re.compile(r"certifi|\biso\b", re.IGNORECASE), "certifications", "certifiering"),
)


def _requirement_reasons(profile: CompanyProfile, checklist: Checklist | None) -> list[MatchReason]:
    if checklist is None:
        return []
    reasons: list[MatchReason] = []
    covered: set[str] = set()
    for requirement in checklist.requirements:
        text = f"{requirement.title} {requirement.citation.quote}"
        for pattern, attribute, label in _PROFILE_CHECKS:
            if label in covered or not pattern.search(text):
                continue
            covered.add(label)
            citation = Citation(page=requirement.citation.page, quote=requirement.citation.quote)
            if getattr(profile, attribute):
                text_out = f"Profilen nämner {label}. Kontrollera att det räcker för kravet."
                reasons.append(
                    MatchReason(
                        kind="styrka", text=text_out, requirement_id=requirement.id, citation=citation
                    )
                )
            else:
                text_out = f"Underlaget ställer krav på {label}, men profilen säger inget om det."
                reasons.append(
                    MatchReason(
                        kind="oklart", text=text_out, requirement_id=requirement.id, citation=citation
                    )
                )
    return reasons


_FIT_TEXT: dict[Fit, str] = {
    "passar": "Upphandlingen verkar passa företaget",
    "passar_delvis": "Upphandlingen passar företaget delvis eller med reservationer",
    "passar_inte": "Upphandlingen verkar inte passa företaget",
}

# Words that every notice and profile share and that say nothing about what is bought:
# procurement vocabulary, the kinds of buyer and company, numbers, and the places of the
# region (TED notices list every participating municipality). The profile's own
# municipalities and the notice's buyer are removed as well.
_GENERIC_MATCH_TEXT = """
    upphandling upphandlingen upphandlingar upphandlande upphandlar upphandla offentlig offentliga
    anbud anbudet anbuden anbudsgivare leverantör leverantören leverantörer avtal avtalet ramavtal
    ramavtalet avtalsperiod
    tjänst tjänster kommun kommunen kommuner kommunerna kommunal kommunala kommunens region regionen län länet
    företag företaget firma aktiebolag organisation verksamhet verksamheter uppdrag uppdraget kund kunder
    beställare beställaren behov behovet avser omfattar inbegriper gällande tidigare lämnat lämna lämnar
    gemensam samverkan bolag bolagen inköp inköpen sverige olika många samtliga
    använda använder används utföra utför utförs erbjuda erbjuder arbeta arbetar arbete arbeten
    två tre fyra fem sex sju åtta nio tio
    sundsvall timrå ånge härnösand kramfors sollefteå örnsköldsvik västernorrland matfors njurunda
    kvissleby stöde alnö indal liden kovland
"""
_GENERIC_MATCH_WORDS = frozenset(_GENERIC_MATCH_TEXT.split())
# A sentence that says what the company does not do must not count as what it does:
# "Vi har inte lämnat anbud i en offentlig upphandling tidigare."
_NEGATION = re.compile(r"\b(?:inte|ej|aldrig|inga|ingen)\b(?!\s+(?:bara|enbart|minst)\b)", re.IGNORECASE)
_SAME_CPV_GROUP = MIN_GROUP_DIGITS  # the level matching's prefilter uses
_SAME_CPV_CLASS = 4
_STRONG_WORD_OVERLAP = 3
_SHARED_WORD_STEM = 5


def _profile_text(description: str) -> str:
    return " ".join(sentence for sentence in split_sentences(description) if not _NEGATION.search(sentence))


def _content_words(text: str, exclude: set[str]) -> list[str]:
    """Distinct meaningful words in order, without generic words, places and stopwords."""

    words: list[str] = []
    for word in _WORD.findall(text.lower()):
        if (
            len(word) >= 3
            and not word.isdigit()
            and word not in _STOPWORDS
            and word not in _GENERIC_MATCH_WORDS
            and word[:6] not in exclude
            and word not in words
        ):
            words.append(word)
    return words


def _same_word(left: str, right: str) -> bool:
    """Crude Swedish inflection: "fasad" ~ "fasader", "målning" ~ "målningen"."""

    if left[:6] == right[:6]:
        return True
    short, long = sorted((left, right), key=len)
    return len(short) >= _SHARED_WORD_STEM and long.startswith(short)


def _shared_words(profile: CompanyProfile, notice: NoticeContext) -> list[str]:
    """Notice words that also describe the company, as they are written in the notice."""

    places = " ".join([*profile.municipalities, notice.buyer or ""])
    exclude = {word[:6] for word in _WORD.findall(places.lower())}
    own = _content_words(_profile_text(profile.description), exclude)
    theirs = _content_words(f"{notice.title} {notice.description or ''}", exclude)
    return [word for word in theirs if any(_same_word(word, other) for other in own)]


def _match_fit(cpv_length: int, cpv_conflict: bool, shared: int) -> Fit:
    """The fit the CPV codes and shared words support, before the checklist is considered.

    Only a CPV class (four digits), or a CPV group together with several shared words, is
    enough for "passar". Shared words alone give at most "passar_delvis", and when the CPV
    codes point elsewhere it takes at least two of them.
    """

    if cpv_length >= _SAME_CPV_CLASS or (cpv_length >= _SAME_CPV_GROUP and shared >= _STRONG_WORD_OVERLAP):
        return "passar"
    if cpv_length >= _SAME_CPV_GROUP:
        return "passar_delvis"
    if shared >= (2 if cpv_conflict else 1):
        return "passar_delvis"
    return "passar_inte"


# --- granska_utkast -----------------------------------------------------------------

_PROOF_IN_DRAFT = re.compile(r"bifoga|bilaga|intyg|bevis|se bilaga", re.IGNORECASE)
_REVIEW_COMMENTS: dict[CheckStatus, str] = {
    "uppfyllt": "Utkastet tar upp kravet. Kontrollera att allt som efterfrågas finns med.",
    "obevisat": "Utkastet nämner kravet men det syns inte att beviset bifogas. Kontrollera vad som ska "
    "lämnas in.",
    "oklart": "Utkastet nämner delvis samma sak. Kontrollera själv om kravet är besvarat.",
    "saknas": "Hittade inget i utkastet som svarar mot kravet.",
}


def _check_requirement(requirement: Requirement, sentences: Sequence[Sentence]) -> RequirementCheck:
    query = _stems(f"{requirement.title} {requirement.evidence or ''}")
    ranked = _best_matches(query, sentences)
    score, best = ranked[0] if ranked else (0.0, None)
    status: CheckStatus
    if best is None or score < 0.25:
        status = "saknas"
    elif score < 0.5:
        status = "oklart"
    elif requirement.evidence and not _PROOF_IN_DRAFT.search(best.text):
        status = "obevisat"
    else:
        status = "uppfyllt"
    found = best if status != "saknas" else None
    return RequirementCheck(
        requirement_id=requirement.id,
        status=status,
        comment=_REVIEW_COMMENTS[status],
        draft_quote=_excerpt(found.text) if found else None,
        draft_page=found.page if found else None,
    )


def _check_attachment(attachment: RequiredAttachment, draft_text: str) -> AttachmentCheck:
    stems = _stems(re.sub(r"\b[Bb]ilaga\s+\d+\b", "", attachment.name)) or _stems(attachment.name)
    if stems and stems <= _stems(draft_text):
        comment = "Utkastet nämner bilagan, men det går inte att se automatiskt att den är bifogad."
        return AttachmentCheck(name=attachment.name, status="oklart", comment=comment)
    return AttachmentCheck(name=attachment.name, status="saknas", comment="Utkastet nämner inte bilagan.")


# --- The engine ---------------------------------------------------------------------


class HeuristicEngine:
    """Rule-based implementation of `AiEngine`. Deterministic and offline."""

    name = "heuristic"

    def _run(self) -> EngineRun:
        return EngineRun(engine=self.name, notes=["Automatisk sammanställning utan språkmodell."])

    async def interpret_document(
        self, notice: NoticeContext, document: PagedDocument
    ) -> tuple[Checklist, EngineRun]:
        sentences = document_sentences(document.pages)
        requirements = _requirements(sentences)
        attachments = _attachments(sentences)
        evaluation = _evaluation(sentences)
        dates = _dates(sentences)
        summary = (
            f"{HEURISTIC_PREFIX} underlaget har {document.page_count} sidor. "
            f"Hittade {len(requirements)} krav, {len(attachments)} bilagor, "
            f"{len(evaluation)} utvärderingskriterier och {len(dates)} datum. "
            "Allt är utdrag ur texten. Kontrollera mot underlaget innan du använder listan."
        )
        checklist = Checklist(
            summary=summary,
            procedure=_procedure(sentences),
            requirements=requirements,
            attachments=attachments,
            evaluation=evaluation,
            dates=dates,
            terms=_terms(sentences),
            open_questions=_open_questions(dates, evaluation),
        )
        return checklist, self._run()

    async def assess_match(
        self, profile: CompanyProfile, notice: NoticeContext, checklist: Checklist | None
    ) -> tuple[MatchAssessment, EngineRun]:
        # The same reading of the CPV hierarchy as matching's prefilter (anbudsklar.cpv).
        cpv_length, own, theirs = closest_cpv_pair(profile.cpv_codes, notice.cpv_codes)
        cpv_conflict = bool(profile.cpv_codes and notice.cpv_codes) and cpv_length < _SAME_CPV_GROUP
        shared = _shared_words(profile, notice)
        reasons: list[MatchReason] = []
        if cpv_length >= _SAME_CPV_GROUP:
            reasons.append(
                MatchReason(kind="styrka", text=f"Profilens CPV-kod {own} ligger nära annonsens {theirs}.")
            )
        elif cpv_conflict:
            reasons.append(
                MatchReason(kind="hinder", text="Ingen av profilens CPV-koder ligger nära annonsens.")
            )
        if shared:
            reasons.append(
                MatchReason(
                    kind="styrka", text=f"Profilen och annonsen har gemensamma ord: {', '.join(shared[:5])}."
                )
            )
        fit = _match_fit(cpv_length, cpv_conflict, len(shared))
        if fit == "passar_inte" and not any(reason.kind == "hinder" for reason in reasons):
            reasons.insert(
                0,
                MatchReason(
                    kind="hinder", text="Profilen och annonsen har inga gemensamma CPV-koder eller sakord."
                ),
            )
        if fit != "passar_inte":
            requirement_reasons = _requirement_reasons(profile, checklist)
            if fit == "passar" and any(reason.kind == "oklart" for reason in requirement_reasons):
                fit = "passar_delvis"
            reasons.extend(requirement_reasons)
        summary = (
            f"{HEURISTIC_PREFIX} {_FIT_TEXT[fit]}. Bedömningen bygger bara på CPV-koder och sakord i "
            "profilen och annonsen; allmänna ord om upphandling och ortnamn räknas inte."
        )
        return MatchAssessment(fit=fit, summary=summary, reasons=reasons[:6]), self._run()

    async def review_draft(
        self, checklist: Checklist, draft: PagedDocument
    ) -> tuple[ReviewResult, EngineRun]:
        sentences = document_sentences(draft.pages)
        checks = [_check_requirement(requirement, sentences) for requirement in checklist.requirements]
        draft_text = "\n".join(draft.pages)
        attachments = [_check_attachment(attachment, draft_text) for attachment in checklist.attachments]
        counts = {status: sum(check.status == status for check in checks) for status in _REVIEW_COMMENTS}
        summary = (
            f"{HEURISTIC_PREFIX} {counts['uppfyllt']} av {len(checks)} krav verkar besvarade i utkastet, "
            f"{counts['obevisat']} saknar synligt bevis, {counts['oklart']} är oklara och {counts['saknas']} "
            "hittades inte. Kontrollera själv innan du lämnar anbudet."
        )
        return ReviewResult(summary=summary, checks=checks, attachments=attachments), self._run()

    async def answer_question(
        self,
        notice: NoticeContext,
        document: PagedDocument,
        question: str,
        history: list[QuestionTurn],
    ) -> tuple[Answer, EngineRun]:
        sentences = document_sentences(document.pages)
        # Question words the document never uses ("hur stor", "krävs") cannot match anything,
        # so only the words the document shares count towards the score.
        vocabulary = set().union(*(_stems(sentence.text) for sentence in sentences))
        ranked = _best_matches(_stems(question) & vocabulary, sentences)
        best = [sentence for score, sentence in ranked[:3] if score >= 0.5]
        if not best:
            answer = Answer(
                answer=(
                    f"{HEURISTIC_PREFIX} hittade inget i underlaget som besvarar frågan. Ställ frågan i "
                    "frågefunktionen i e-Avrop före frågestoppet, så att svaret når alla leverantörer."
                ),
                found_in_document=False,
                suggest_formal_question=True,
            )
            return answer, self._run()
        lines = "\n".join(f"– {_excerpt(sentence.text)} (sida {sentence.page})" for sentence in best)
        answer = Answer(
            answer=f"{HEURISTIC_PREFIX} det här står i underlaget om din fråga:\n{lines}",
            found_in_document=True,
            citations=[_citation(sentence) for sentence in best],
            suggest_formal_question=False,
        )
        return answer, self._run()

    async def suggest_cpv(
        self, description: str, candidates: list[CpvCandidate]
    ) -> tuple[CpvSuggestions, EngineRun]:
        wanted = _stems(description)
        scored: list[tuple[int, CpvCandidate, list[str]]] = []
        for candidate in candidates:
            code = re.sub(r"\D", "", candidate.code)[:8]
            shared = wanted & _stems(candidate.label)
            if len(code) == 8 and shared:
                scored.append((len(shared), candidate, _matching_words(candidate.label, shared)))
        scored.sort(key=lambda item: -item[0])
        suggestions = [
            CpvSuggestion(
                code=re.sub(r"\D", "", candidate.code)[:8],
                label=candidate.label,
                reason=f"Automatisk matchning utan språkmodell: beskrivningen nämner {', '.join(words)}.",
            )
            for _, candidate, words in scored[:5]
        ]
        return CpvSuggestions(suggestions=suggestions), self._run()

    async def answer_rules(
        self, question: str, session_id: str | None, context: list[RuleContext]
    ) -> tuple[RulesAnswer, EngineRun]:
        if not context:
            text = (
                f"{HEURISTIC_PREFIX} hittade ingen regeltext som passar frågan. Fråga gärna "
                "Upphandlingsmyndighetens frågeportal eller kommunens inköpsavdelning."
            )
            return RulesAnswer(answer=text), self._run()
        selected = context[:3]
        excerpts = "\n\n".join(
            f"{item.reference} – {item.title}: {_excerpt(_collapse(item.text), 400)}" for item in selected
        )
        text = f"{HEURISTIC_PREFIX} det här säger regeltexterna som hittades:\n\n{excerpts}"
        sources = [RuleSource(title=item.title, reference=item.reference, url=item.url) for item in selected]
        return RulesAnswer(answer=text, sources=sources), self._run()

    async def aclose(self) -> None:
        return None
