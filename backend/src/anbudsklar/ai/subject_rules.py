"""Rule-based choice of a message's subject in Fråga AI (valj_amne), before any model is asked.

The panel no longer asks the reader whether a question is about the documents, the
rules or the profile (decision 0026): the words usually say. A question that names a
requirement, a page or "the tender" is about the documents; one that names the law,
a term in general or the municipality's steering documents is about the rules; a
statement that the company now has, is or does something is a change to the profile.
A short follow-up without words of its own stays with the subject of the turn before.
Only when the words say nothing, or point two ways, is the model asked (`AiEngine
.choose_subject`), and when it cannot answer the page's own subject wins.
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from anbudsklar.ai.engine import QuestionTurn
from anbudsklar.contracts import Subject, SubjectChoice, SubjectOption

# The page's own subject when nothing else decides: the documents on a notice page.
SUBJECT_ORDER: tuple[Subject, ...] = ("underlag", "regler", "profil")

# Words that place a question in this procurement's documents: the documents and their
# parts, requirement ids ("K3"), pages, the tender, and what "we" must do in it.
_DOCUMENT_WORDS = re.compile(
    r"underlag|kravspec|avtalsvillkor|föreskrift|bilag|anbudet\b|anbuden\b|vårt anbud|anbudsdag|"
    r"frågestopp|sista dag|den här upphandlingen|denna upphandling|i upphandlingen|upphandlingen\b|"
    r"kravet\b|kraven\b|\bK\d{1,3}\b|\bs(?:ida|idan|\.)\s?\d+|står (?:det|där)|krävs|kräver|"
    r"utvärder|viktning|priset\b|uppdraget\b|avtalstid|leverans|option|skall?-?krav|"
    r"\b(?:måste|ska|får|behöver|kan|bör) vi\b|\bvi (?:måste|ska|får|behöver)\b",
    re.IGNORECASE,
)
# Words that place a question in the rules of procurement in general: the law and its
# parts, its terms, the municipality's steering documents and "in general".
_RULE_WORDS = re.compile(
    r"\bLOU\b|\bLUF\b|\blagen\b|lagtext|\d+ kap\b|\bkap\.|§|paragraf|avtalsspärr|direktupphandl|"
    r"tröskelvärde|överprövn|upphandlingsmyndigheten|konkurrensverket|inköpsstrategi|styrdokument|"
    r"riktlinje|\bpolicy|regelhjälpen|\bregler(?:na)?\b|i allmänhet|generellt|rent allmänt|normalt sett|"
    r"brukar|vad (?:är|betyder|innebär|menas med) (?:en|ett|begreppet)\b|offentlig upphandling|"
    r"uteslutning|likabehandling|proportionalitet|sekretess|anbudsöppning|tilldelningsbeslut|"
    r"förhandlat förfarande|öppet förfarande|selektivt förfarande|dynamiskt inköpssystem|"
    r"\bESPD\b|egenförsäkran|\bramavtal\b",
    re.IGNORECASE,
)
# A question, as opposed to a statement about the company.
_QUESTION = re.compile(
    r"\?|^(?:vad|vilka|vilken|vilket|hur|när|var|varför|vem|måste|ska|får|kan|behöver|finns|är|gäller|"
    r"stämmer|räcker|krävs|går)\b",
    re.IGNORECASE,
)
# A statement that changes the profile: the company now has, is or does something, or
# asks for a change outright.
_PROFILE_CHANGE = re.compile(
    r"^(?:lägg till|lägga till|ta bort|ändra|uppdatera|byt|stryk|sätt|skriv)\b|\bprofil|"
    r"\bvi (?:har|är|gör|jobbar|arbetar|utför|erbjuder|omsätter|finns)\b.*?"
    r"(?:numera|\bnu\b|också|även|inte längre|slutat|börjat|blivit|certifier|\bISO\b|anställda|"
    r"medarbetare|omsättning|verksamma|verksamhet i|kontor i)",
    re.IGNORECASE | re.DOTALL,
)

# A question that names the profile is not a change to it, and not a question for the rules either.
_PROFILE_WORD = re.compile(r"\bprofil", re.IGNORECASE)

_REASONS: dict[Subject, str] = {
    "underlag": "Frågan gäller den här upphandlingens underlag.",
    "regler": "Frågan gäller reglerna för upphandling i allmänhet.",
    "profil": "Meddelandet ändrar något i er profil.",
}
_SAME_AS_BEFORE = "En uppföljning av förra frågan, så samma ämne."
_ONLY_ONE = "Det enda ämnet på den här sidan."
_A_QUESTION = "En fråga, och här finns inget underlag: reglerna svarar."


def default_subject(subjects: Sequence[SubjectOption]) -> Subject:
    """The page's own subject: the documents on a notice page, else the rules."""

    offered = {option.subject for option in subjects}
    for subject in SUBJECT_ORDER:
        if subject in offered:
            return subject
    return "regler"


def choose_subject_by_rules(
    question: str, subjects: Sequence[SubjectOption], history: Sequence[QuestionTurn]
) -> SubjectChoice | None:
    """The subject the words settle, or None when a model should decide."""

    offered: list[Subject] = [option.subject for option in subjects]
    if len(offered) == 1:
        return SubjectChoice(subject=offered[0], reason=_ONLY_ONE)
    text = question.strip()
    is_question = _QUESTION.search(text) is not None
    about_documents = "underlag" in offered and _DOCUMENT_WORDS.search(text) is not None
    about_rules = _RULE_WORDS.search(text) is not None
    changes_profile = "profil" in offered and not is_question and _PROFILE_CHANGE.search(text) is not None

    if changes_profile and not about_documents and not about_rules:
        return SubjectChoice(subject="profil", reason=_REASONS["profil"])
    if about_documents and not about_rules:
        return SubjectChoice(subject="underlag", reason=_REASONS["underlag"])
    if about_rules and not about_documents:
        return SubjectChoice(subject="regler", reason=_REASONS["regler"])
    if about_documents and about_rules:
        return None  # the words point two ways: a model reads the question as a whole
    earlier = _last_subject(history, offered)
    if earlier is not None:
        return SubjectChoice(subject=earlier, reason=_SAME_AS_BEFORE)
    asks_about_profile = "profil" in offered and _PROFILE_WORD.search(text) is not None
    if "underlag" not in offered and is_question and not asks_about_profile:
        return SubjectChoice(subject="regler", reason=_A_QUESTION)
    return None


def _last_subject(history: Sequence[QuestionTurn], offered: Sequence[Subject]) -> Subject | None:
    for turn in reversed(history):
        for subject in offered:
            if turn.subject == subject:
                return subject
    return None
