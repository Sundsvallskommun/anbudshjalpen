"""Regelhjälpen with our own LOU search as context, and conversations bound to one browser."""

from __future__ import annotations

import uuid

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import (
    AiEngine,
    EngineConfigError,
    EngineError,
    EngineOutputError,
    EngineRun,
    RuleContext,
)
from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.api.app import ENGINE_CONFIG_MESSAGE, ENGINE_OUTPUT_MESSAGE
from anbudsklar.api.security import RULES_COOKIE
from anbudsklar.contracts import RulesAnswer, RuleSource
from anbudsklar.services.rules import ask_rules

from .factories import PUBLIC_URL, STRATEGY_URL, add_lou_section, add_policy_section

PRINCIPLES = (
    "Upphandlande myndigheter ska behandla leverantörer på ett likvärdigt och icke-diskriminerande sätt "
    "samt genomföra upphandlingar på ett öppet sätt."
)
COMPETITION = (
    "Sundsvalls kommuns inköp ska tillvarata och vårda konkurrensen på de olika marknaderna. "
    "Tillvarata småföretagens konkurrenskraft, t.ex. genom att undanröja hinder såsom oproportionerliga krav."
)
POLICY_NOTE = "Kommunens styrdokument, fastställt av kommunfullmäktige 2023-09-25."


class ConversationEngine(HeuristicEngine):
    """The heuristic answers, plus a conversation id like Eneo's; records the ids it is asked to continue."""

    def __init__(self) -> None:
        self.continued: list[str | None] = []

    async def answer_rules(
        self, question: str, session_id: str | None, context: list[RuleContext]
    ) -> tuple[RulesAnswer, EngineRun]:
        self.continued.append(session_id)
        answer, run = await super().answer_rules(question, session_id, context)
        return answer.model_copy(update={"session_id": session_id or str(uuid.uuid4())}), run


@pytest.fixture
def engine() -> AiEngine:
    return ConversationEngine()


async def ask(client: httpx.AsyncClient, session_id: str | None = None) -> str:
    response = await client.post(
        "/api/rules/ask", json={"question": "Vad är avtalsspärr?", "session_id": session_id}
    )
    assert response.status_code == 200, response.text
    return response.json()["answer"]["session_id"]


async def test_rules_question_is_answered_from_lou(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    await add_lou_section(
        db_session, chapter="4", section="1", heading="Principer för offentlig upphandling", text=PRINCIPLES
    )
    response = await client.post("/api/rules/ask", json={"question": "Hur ska leverantörer behandlas?"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["engine"] == "heuristic"
    assert body["answer"]["answer"]
    references = [source["reference"] for source in body["answer"]["sources"]]
    assert "LOU 4 kap. 1 §" in references
    urls = [source["url"] for source in body["answer"]["sources"] if source["reference"] == "LOU 4 kap. 1 §"]
    assert urls == ["https://data.riksdagen.se/dokument/sfs-2016-1145.html#K4P1"]
    # The law's own words for the card, and no word about how the answer was made.
    [law] = [s for s in body["answer"]["sources"] if s["reference"] == "LOU 4 kap. 1 §"]
    assert law["excerpt"] == PRINCIPLES
    assert law["kind"] == "law" and law["note"] is None
    assert "språkmodell" not in body["answer"]["answer"]


async def test_a_question_about_the_municipality_is_answered_from_its_strategy(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    """Our search ranks the law and the steering documents together (decision 0022)."""

    await add_lou_section(
        db_session, chapter="4", section="1", heading="Principer för offentlig upphandling", text=PRINCIPLES
    )
    await add_policy_section(
        db_session, number="5.3", heading="Konkurrensinriktade inköp", text=COMPETITION, page=9
    )
    response = await client.post("/api/rules/ask", json={"question": "Hur ser kommunen på småföretag?"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["answer"]["answer"].startswith("Paragrafer och avsnitt som kan handla om din fråga:")
    [strategy] = body["answer"]["sources"]
    assert strategy["reference"] == "Inköpsstrategin 5.3"
    assert strategy["title"] == "Konkurrensinriktade inköp"
    assert strategy["kind"] == "policy"
    assert strategy["note"] == POLICY_NOTE
    assert strategy["url"] == f"{STRATEGY_URL}#page=9"
    assert strategy["excerpt"] == COMPETITION


class NamingEngine(HeuristicEngine):
    """Names sources like Eneo does: references only, no excerpts."""

    async def answer_rules(
        self, question: str, session_id: str | None, context: list[RuleContext]
    ) -> tuple[RulesAnswer, EngineRun]:
        sources = [
            RuleSource(title="Principer", reference="LOU 4 kap. 1 §"),
            RuleSource(title="Avtalsspärr", reference="LOU 20 kap. 1 §"),  # not in our copy
            RuleSource(title="Lämna anbud", url="https://www.upphandlingsmyndigheten.se/"),
            RuleSource(title="Annan lag", reference="LUF 4 kap. 1 §"),
            RuleSource(title="Konkurrensinriktade inköp", reference="Inköpsstrategin 5.3"),
            RuleSource(title="Okänt avsnitt", reference="Inköpsstrategin 9.9"),
        ]
        return RulesAnswer(answer="Behandla alla lika (LOU 4 kap. 1 §).", sources=sources), EngineRun("eneo")


async def test_sources_get_their_words_kind_and_note_from_our_own_copies(db_session: AsyncSession) -> None:
    await add_lou_section(
        db_session, chapter="4", section="1", heading="Principer för offentlig upphandling", text=PRINCIPLES
    )
    await add_policy_section(
        db_session, number="5.3", heading="Konkurrensinriktade inköp", text=COMPETITION, page=9
    )
    view = await ask_rules(db_session, NamingEngine(), "Hur ska leverantörer behandlas?", None)
    sources = view.answer.sources
    assert [source.excerpt for source in sources] == [PRINCIPLES, None, None, None, COMPETITION, None]
    assert [source.kind for source in sources] == ["law", "law", None, None, "policy", None]
    assert [source.note for source in sources] == [None, None, None, None, POLICY_NOTE, None]
    assert sources[4].url == f"{STRATEGY_URL}#page=9"


async def test_rules_question_is_validated(client: httpx.AsyncClient) -> None:
    assert (await client.post("/api/rules/ask", json={"question": "?"})).status_code == 422


async def test_a_conversation_continues_only_in_the_browser_that_started_it(
    app: FastAPI, client: httpx.AsyncClient, engine: ConversationEngine
) -> None:
    conversation = await ask(client)
    assert engine.continued == [None]
    assert client.cookies.get(RULES_COOKIE)

    assert await ask(client, conversation) == conversation
    assert engine.continued[-1] == conversation

    # Another browser that has learnt the id gets a conversation of its own.
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=PUBLIC_URL, headers={"Origin": PUBLIC_URL}
    ) as other:
        assert await ask(other, conversation) != conversation
    assert engine.continued[-1] is None

    # So does an id this app never handed out, even in the first browser.
    await ask(client, str(uuid.uuid4()))
    assert engine.continued[-1] is None


async def test_the_conversation_cookie_is_scoped_to_the_api(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/rules/ask", json={"question": "Vad är avtalsspärr?"})
    header = response.headers["set-cookie"]
    assert header.startswith(f"{RULES_COOKIE}=")
    assert "Path=/api;" in header or header.endswith("Path=/api")  # Regelhjälpen and /api/ask (decision 0026)
    assert "HttpOnly" in header
    assert "SameSite=lax" in header


async def test_engine_failures_reach_visitors_without_operator_details(
    client: httpx.AsyncClient,
    engine: ConversationEngine,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def misconfigured(*_: object) -> tuple[RulesAnswer, EngineRun]:
        raise EngineConfigError("Det finns ingen Eneo-assistent. Kör `anbudsklar eneo provision`.")

    monkeypatch.setattr(engine, "answer_rules", misconfigured)
    response = await client.post("/api/rules/ask", json={"question": "Vad är avtalsspärr?"})
    assert response.status_code == 502
    assert response.json()["detail"] == ENGINE_CONFIG_MESSAGE
    assert "anbudsklar eneo provision" in caplog.text  # the detail is logged for the operator

    async def busy(*_: object) -> tuple[RulesAnswer, EngineRun]:
        raise EngineError("Eneo tar inte emot fler anrop från Anbudshjälpen just nu. Försök igen senare.")

    monkeypatch.setattr(engine, "answer_rules", busy)
    response = await client.post("/api/rules/ask", json={"question": "Vad är avtalsspärr?"})
    assert response.json()["detail"].startswith("Eneo tar inte emot fler anrop")

    async def broken_contract(*_: object) -> tuple[RulesAnswer, EngineRun]:
        raise EngineOutputError("Språkmodellen gav inget svar som följer svarsformatet (answer: saknas).")

    monkeypatch.setattr(engine, "answer_rules", broken_contract)
    response = await client.post("/api/rules/ask", json={"question": "Vad är avtalsspärr?"})
    assert response.json()["detail"] == ENGINE_OUTPUT_MESSAGE
