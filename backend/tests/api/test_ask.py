"""Fråga AI's one endpoint: the app picks the subject and answers under it (decision 0026)."""

from __future__ import annotations

import uuid
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import EngineConfigError, EngineRun, QuestionTurn
from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.api.security import RULES_COOKIE
from anbudsklar.contracts import RulesAnswer, SubjectChoice, SubjectOption

from .factories import Demo, add_cpv_codes, add_lou_section, login

ASK = "/api/ask"
PRINCIPLES = (
    "Upphandlande myndigheter ska behandla leverantörer på ett likvärdigt och icke-diskriminerande sätt."
)


async def test_a_question_about_the_tender_is_answered_from_the_documents(
    client: httpx.AsyncClient, demo: Demo
) -> None:
    response = await client.post(
        ASK, json={"question": "Vilken ansvarsförsäkring måste vi ha?", "notice_id": str(demo.notice.id)}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["subject"], body["decided_by"]) == ("underlag", "rule")
    assert body["rules"] is None and body["profile"] is None
    answer = body["answer"]
    assert answer["answer"]["citations"]
    assert answer["document_id"] == str(demo.document.id)
    assert answer["tools"][0] == {
        "name": "valj_amne",
        "label": "Välj ämne",
        "detail": "Underlaget, på frågans ord",
    }


async def test_a_general_question_on_a_notice_page_goes_to_the_rules(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    await add_lou_section(
        db_session, chapter="4", section="1", heading="Principer för offentlig upphandling", text=PRINCIPLES
    )
    response = await client.post(
        ASK, json={"question": "Hur ska leverantörer behandlas enligt LOU?", "notice_id": str(demo.notice.id)}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["subject"], body["decided_by"]) == ("regler", "rule")
    assert body["answer"] is None
    assert [source["reference"] for source in body["rules"]["answer"]["sources"]] == ["LOU 4 kap. 1 §"]
    assert body["rules"]["tools"][0]["detail"] == "Reglerna, på frågans ord"
    # Regelhjälpen's conversation cookie is set here too, so a conversation can continue.
    assert client.cookies.get(RULES_COOKIE)


async def test_without_a_notice_a_question_is_for_the_rules_and_the_profile_is_not_offered(
    client: httpx.AsyncClient, demo: Demo
) -> None:
    response = await client.post(ASK, json={"question": "Vi har numera tolv anställda"})
    assert response.status_code == 200, response.text
    body = response.json()
    # Not signed in: the only subject is the rules, and a statement about a company goes nowhere else.
    assert (body["subject"], body["decided_by"]) == ("regler", "rule")
    assert body["profile"] is None


async def test_a_signed_in_company_changes_its_profile_by_writing_to_the_panel(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    await add_cpv_codes(db_session, {"45442100": "Målning", "45443000": "Fasadarbeten"})
    await login(client, "foretagare")
    response = await client.post(
        ASK, json={"question": "Vi har numera tolv anställda", "notice_id": str(demo.notice.id)}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["subject"], body["decided_by"]) == ("profil", "rule")
    profile = body["profile"]
    assert profile["applied"] is True
    assert profile["profile"]["employees"] == 12
    assert profile["fitting_notices"] == 1  # the matches were re-assessed, as after the form's save
    assert [tool["name"] for tool in profile["tools"]] == [
        "valj_amne",
        "hamta_profil",
        "sok_cpv",
        "tolka_meddelande",
        "spara_profil",
        "bedom_matchning",
    ]


async def test_a_buyer_has_no_profile_to_change(client: httpx.AsyncClient, demo: Demo) -> None:
    await login(client, "inkopare")
    body = (await client.post(ASK, json={"question": "Vi har numera tolv anställda"})).json()
    assert body["subject"] == "regler"


class ChoosingEngine(HeuristicEngine):
    """A model that reads an open question as being about the documents, and records what it was asked."""

    def __init__(self) -> None:
        self.asked: list[tuple[str, list[str], list[QuestionTurn]]] = []

    async def choose_subject(
        self, question: str, subjects: list[SubjectOption], history: list[QuestionTurn]
    ) -> tuple[SubjectChoice, EngineRun]:
        self.asked.append((question, [option.subject for option in subjects], history))
        return SubjectChoice(subject="underlag", reason="Frågan gäller kraven här."), EngineRun("eneo")


@pytest.fixture
def engine() -> ChoosingEngine:
    return ChoosingEngine()


async def test_the_model_decides_when_the_words_do_not_and_each_subject_gets_its_own_history(
    client: httpx.AsyncClient, demo: Demo, engine: ChoosingEngine
) -> None:
    history = [
        {"question": "Hur lång är avtalsspärren?", "answer": "Tio dagar.", "subject": "regler"},
        {
            "question": "Vilka försäkringar måste vi ha?",
            "answer": "En ansvarsförsäkring.",
            "subject": "underlag",
        },
    ]
    response = await client.post(
        ASK,
        json={"question": "Behövs F-skatt?", "notice_id": str(demo.notice.id), "history": history},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    # "Behövs F-skatt?" has no words of its own, so it follows the turn before it: no model needed.
    assert (body["subject"], body["decided_by"]) == ("underlag", "rule")
    assert engine.asked == []
    assert body["answer"]["tools"][0]["detail"] == "Underlaget, på frågans ord"

    # With no earlier turn the words leave it open: the model is asked, with the subjects at hand.
    response = await client.post(ASK, json={"question": "Behövs F-skatt?", "notice_id": str(demo.notice.id)})
    body = response.json()
    assert (body["subject"], body["decided_by"]) == ("underlag", "model")
    assert body["answer"]["tools"][0]["detail"] == "Underlaget, av AI"
    assert engine.asked[-1][1] == ["underlag", "regler"]


async def test_a_missing_model_never_stops_a_question(
    client: httpx.AsyncClient,
    demo: Demo,
    engine: ChoosingEngine,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def missing(*_: Any) -> tuple[SubjectChoice, EngineRun]:
        raise EngineConfigError("Det finns ingen Eneo-assistent för uppgiften valj_amne.")

    monkeypatch.setattr(engine, "choose_subject", missing)
    response = await client.post(ASK, json={"question": "Behövs F-skatt?", "notice_id": str(demo.notice.id)})
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["subject"], body["decided_by"]) == ("underlag", "default")
    assert body["answer"]["tools"][0]["detail"] == "Underlaget, sidans eget ämne"
    assert "valj_amne" in caplog.text


async def test_the_request_is_validated(client: httpx.AsyncClient, demo: Demo) -> None:
    assert (await client.post(ASK, json={"question": "?"})).status_code == 422
    assert (await client.post(ASK, json={"question": "Hej?", "rules_session_id": "x"})).status_code == 422
    missing = await client.post(ASK, json={"question": "Vad gäller?", "notice_id": str(uuid.uuid4())})
    assert missing.status_code == 404


async def test_a_rules_conversation_continues_only_in_the_browser_that_started_it(
    client: httpx.AsyncClient, demo: Demo, engine: ChoosingEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The heuristic answers with a conversation id like Eneo's, and the continued ids are recorded."""

    continued: list[str | None] = []
    answer_rules = engine.answer_rules

    async def with_session(
        question: str, session_id: str | None, context: Any
    ) -> tuple[RulesAnswer, EngineRun]:
        continued.append(session_id)
        answer, run = await answer_rules(question, session_id, context)
        return answer.model_copy(update={"session_id": session_id or str(uuid.uuid4())}), run

    monkeypatch.setattr(engine, "answer_rules", with_session)
    first = (await client.post(ASK, json={"question": "Vad är avtalsspärr?"})).json()
    conversation = first["rules"]["answer"]["session_id"]
    assert conversation and continued == [None]

    again = (await client.post(ASK, json={"question": "Vad?", "rules_session_id": conversation})).json()
    assert again["rules"]["answer"]["session_id"] == conversation
    # An id this browser was never handed starts a new conversation.
    stranger = str(uuid.uuid4())
    other = (await client.post(ASK, json={"question": "Vad?", "rules_session_id": stranger})).json()
    assert other["rules"]["answer"]["session_id"] != conversation
