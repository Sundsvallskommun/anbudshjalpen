"""The words that place a message in Fråga AI under a subject, before any model is asked (decision 0026)."""

from __future__ import annotations

import pytest

from anbudsklar.ai.engine import QuestionTurn
from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.ai.subject_rules import choose_subject_by_rules, default_subject
from anbudsklar.contracts import SubjectOption

DOCUMENTS = SubjectOption(subject="underlag", description="Underlaget för Ommålning av förskola.")
RULES = SubjectOption(subject="regler", description="Reglerna.")
PROFILE = SubjectOption(subject="profil", description="Profilen.")
ON_A_NOTICE = [DOCUMENTS, RULES, PROFILE]
ELSEWHERE = [RULES, PROFILE]


@pytest.mark.parametrize(
    "question",
    [
        "Vilka försäkringar måste vi ha?",
        "Vilka bilagor ska vara med i anbudet?",
        "Hur viktigt är priset?",
        "Får vi anlita underleverantörer?",
        "Vad betyder K3?",
        "Vad står det på sida 4 om referenser?",
        "Hur många referensuppdrag krävs?",
        "Hur bedöms anbuden?",
    ],
)
def test_questions_about_this_procurement_go_to_the_documents(question: str) -> None:
    choice = choose_subject_by_rules(question, ON_A_NOTICE, [])
    assert choice is not None and choice.subject == "underlag"


@pytest.mark.parametrize(
    "question",
    [
        "Hur lång är avtalsspärren?",
        "Vad är en direktupphandling?",
        "Vad är ett kvalificeringskrav?",
        "Hur begär vi överprövning?",
        "Vad säger LOU om likabehandling?",
        "Vad står i 4 kap. 1 §?",
        "Vad vill kommunen med sin inköpsstrategi?",
        "Hur går en offentlig upphandling till i allmänhet?",
    ],
)
def test_general_questions_go_to_the_rules_even_on_a_notice_page(question: str) -> None:
    choice = choose_subject_by_rules(question, ON_A_NOTICE, [])
    assert choice is not None and choice.subject == "regler"


@pytest.mark.parametrize(
    "message",
    [
        "Vi har numera tolv anställda",
        "Vi är ISO 14001-certifierade",
        "Vi är också verksamma i Härnösand",
        "Lägg till att vi gör fasadarbeten",
        "Ta bort Timrå från vår profil",
    ],
)
def test_statements_about_the_company_go_to_the_profile(message: str) -> None:
    choice = choose_subject_by_rules(message, ON_A_NOTICE, [])
    assert choice is not None and choice.subject == "profil"
    elsewhere = choose_subject_by_rules(message, ELSEWHERE, [])
    assert elsewhere is not None and elsewhere.subject == "profil"


def test_a_question_about_the_company_is_not_a_change_to_the_profile() -> None:
    # "Vi" asking what "we" must have is about the documents; without them it is a question for the rules.
    choice = choose_subject_by_rules("Måste vi ha en ansvarsförsäkring?", ON_A_NOTICE, [])
    assert choice is not None and choice.subject == "underlag"
    elsewhere = choose_subject_by_rules("Vad står i vår profil?", ELSEWHERE, [])
    assert elsewhere is None  # mentions the profile but asks: the model reads it
    elsewhere = choose_subject_by_rules("Hur många anställda måste man ha?", ELSEWHERE, [])
    assert elsewhere is not None and elsewhere.subject == "regler"


def test_the_profile_is_never_chosen_when_it_is_not_at_hand() -> None:
    choice = choose_subject_by_rules("Vi har numera tolv anställda", [DOCUMENTS, RULES], [])
    assert choice is None  # a statement without words for the documents or the rules: the model decides


def test_a_follow_up_stays_with_the_subject_before_it() -> None:
    earlier = [QuestionTurn("Hur lång är avtalsspärren?", "Tio dagar.", "regler")]
    choice = choose_subject_by_rules("Och om det skickas med post?", ON_A_NOTICE, earlier)
    assert choice is not None and choice.subject == "regler"
    earlier = [QuestionTurn("Vilka försäkringar måste vi ha?", "En ansvarsförsäkring.", "underlag")]
    choice = choose_subject_by_rules("Hur stor ska den vara?", ON_A_NOTICE, earlier)
    assert choice is not None and choice.subject == "underlag"
    # A subject no longer at hand (another page) is not continued.
    choice = choose_subject_by_rules("Hur stor ska den vara?", ELSEWHERE, earlier)
    assert choice is not None and choice.subject == "regler"


def test_words_that_point_two_ways_or_nowhere_leave_the_choice_to_the_model() -> None:
    assert choose_subject_by_rules("Vad säger LOU om kravet K3?", ON_A_NOTICE, []) is None
    assert choose_subject_by_rules("Hur många referenser behövs?", ON_A_NOTICE, []) is None
    only_rules = choose_subject_by_rules("Hur många referenser behövs?", [RULES], [])
    assert only_rules is not None and only_rules.subject == "regler"


def test_the_pages_own_subject_is_the_documents_then_the_rules() -> None:
    assert default_subject(ON_A_NOTICE) == "underlag"
    assert default_subject(ELSEWHERE) == "regler"
    assert default_subject([]) == "regler"


async def test_the_heuristic_engine_answers_with_the_rules_and_the_pages_subject() -> None:
    choice, run = await HeuristicEngine().choose_subject("Hur många referenser behövs?", ON_A_NOTICE, [])
    assert (choice.subject, run.engine) == ("underlag", "heuristic")
    choice, _ = await HeuristicEngine().choose_subject("Vad är en direktupphandling?", ON_A_NOTICE, [])
    assert choice.subject == "regler"
