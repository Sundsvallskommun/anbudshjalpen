"""Eneo engine against a mocked Eneo API (option S: document inside the question)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from anbudsklar.ai.eneo import EneoEngine, clean_answer, load_assistant_ids, rule_sources
from anbudsklar.ai.engine import EngineConfigError, EngineError, EngineOutputError
from anbudsklar.config import Settings
from anbudsklar.contracts import DocumentSet, NoticeContext, PagedDocument, Task

BASE_URL = "https://eneo.test"
ASSISTANT = "a-tolka"
RULES = "a-regler"
SESSIONS = f"/api/v1/assistants/{ASSISTANT}/sessions/"
S1 = "0b9e4f1c-6a5d-4c39-9d0e-1f2a3b4c5d61"
R1 = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e51"
R2 = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e52"
GONE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
NOTICE = NoticeContext(notice_id="n1", title="Ommålning (fiktiv)")
DOCUMENT = PagedDocument(filename="u.pdf", pages=["Leverantören ska ha F-skatt."])
DOCUMENTS = DocumentSet.of([DOCUMENT])
CHECKLIST = {
    "summary": "Kort sammanfattning.",
    "requirements": [
        {
            "id": "K1",
            "kind": "kvalificeringskrav",
            "title": "F-skatt",
            "plain_language": "Företaget ska ha F-skatt.",
            "citation": {"page": 1, "quote": "Leverantören ska ha F-skatt."},
        }
    ],
}


@pytest.fixture
def engine(tmp_path: Path) -> EneoEngine:
    assistants = tmp_path / "eneo-assistants.json"
    assistants.write_text(json.dumps({"tolka_underlag": ASSISTANT, "regelhjalpen": RULES}), encoding="utf-8")
    settings = Settings(
        _env_file=None,
        ai_engine="heuristic",
        eneo_backend_url=BASE_URL,
        eneo_api_key="sk_test",
        eneo_api_key_header_name="X-Test-Key",
        eneo_assistants_file=assistants,
        ai_max_retries=1,
    )
    return EneoEngine(settings)


def _ask(answer: str, session_id: str = S1, **extra: Any) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "session_id": session_id,
            "answer": answer,
            "model": {"name": "gpt-x", "nickname": "GPT X"},
            **extra,
        },
    )


async def test_interpret_sends_document_in_question_and_deletes_session(engine: EneoEngine) -> None:
    fenced = f'```json\n{json.dumps(CHECKLIST, ensure_ascii=False)}\n```<inref id="ab12cd34"/>'
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        ask = router.post(SESSIONS).mock(return_value=_ask(fenced))
        delete = router.delete(f"{SESSIONS}{S1}/").mock(return_value=httpx.Response(200, json={}))
        checklist, run = await engine.interpret_document(NOTICE, DOCUMENTS)
    request = ask.calls[0].request
    body = json.loads(request.content)
    assert request.url.params["version"] == "2"
    assert request.headers["X-Test-Key"] == "sk_test"
    assert body["stream"] is False
    assert "[SIDA 1]\nLeverantören ska ha F-skatt." in body["question"]
    assert "files" not in body
    assert delete.call_count == 1
    assert checklist.requirements[0].id == "K1"
    assert (run.engine, run.model, run.attempts) == ("eneo", "GPT X", 1)


async def test_invalid_json_is_retried_as_a_follow_up(engine: EneoEngine) -> None:
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        router.post(SESSIONS).mock(return_value=_ask("Här kommer listan."))
        follow_up = router.post(f"{SESSIONS}{S1}/").mock(return_value=_ask(json.dumps(CHECKLIST)))
        delete = router.delete(f"{SESSIONS}{S1}/").mock(return_value=httpx.Response(200, json={}))
        _, run = await engine.interpret_document(NOTICE, DOCUMENTS)
    assert run.attempts == 2
    assert json.loads(follow_up.calls[0].request.content)["question"].startswith("Ditt förra svar")
    assert delete.call_count == 1


async def test_session_is_deleted_when_the_output_stays_invalid(engine: EneoEngine) -> None:
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        router.post(SESSIONS).mock(return_value=_ask("{}"))
        router.post(f"{SESSIONS}{S1}/").mock(return_value=_ask("{}"))
        delete = router.delete(f"{SESSIONS}{S1}/").mock(return_value=httpx.Response(500))
        with pytest.raises(EngineOutputError):
            await engine.interpret_document(NOTICE, DOCUMENTS)
    assert delete.call_count == 1  # a failed delete is logged, not raised


@pytest.mark.parametrize(
    ("status", "body", "message", "retryable", "config"),
    [
        (
            400,
            {"message": "The prompt and attachments need ~9000 tokens", "eneo_error_code": 9007},
            "för stort",
            False,
            False,
        ),
        (
            400,
            {"message": "The completion model is not enabled", "eneo_error_code": 9007},
            "inställningar",
            True,
            True,
        ),
        (400, {"message": "rejected", "eneo_error_code": 9041}, "avvisade", False, False),
        (413, {"message": "Request Entity Too Large"}, "för stort", False, False),
        (413, {"message": "too large", "eneo_error_code": 9015}, "för stort", False, False),
        (422, {"detail": [{"msg": "String too long"}]}, "kunde inte ta emot", False, False),
        (503, {"message": "provider down", "eneo_error_code": 9010}, "svarar inte", True, False),
        (403, {"detail": {"code": "forbidden_action"}}, "nekade åtkomst", True, True),
        (404, {"message": "not found", "eneo_error_code": 9000}, "provision", True, True),
        (429, {"detail": {"code": "rate_limit_exceeded"}}, "60 minuter", True, False),
    ],
)
async def test_eneo_errors_become_swedish_engine_errors(
    engine: EneoEngine, status: int, body: dict[str, Any], message: str, retryable: bool, config: bool
) -> None:
    headers = {"Retry-After": "3600"} if status == 429 else {}
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        router.post(SESSIONS).mock(return_value=httpx.Response(status, json=body, headers=headers))
        delete = router.delete(url__regex=r".*/sessions/.*")
        with pytest.raises(EngineError, match=message) as raised:
            await engine.interpret_document(NOTICE, DOCUMENTS)
    assert delete.call_count == 0  # no session was created
    # Permanent errors make the worker give up at once; configuration errors wait for an operator.
    assert raised.value.retryable is retryable
    assert isinstance(raised.value, EngineConfigError) is config


async def test_short_retry_after_is_honoured_once(engine: EneoEngine) -> None:
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        ask = router.post(SESSIONS).mock(
            side_effect=[httpx.Response(429, headers={"Retry-After": "0"}), _ask(json.dumps(CHECKLIST))]
        )
        router.delete(f"{SESSIONS}{S1}/").mock(return_value=httpx.Response(200, json={}))
        await engine.interpret_document(NOTICE, DOCUMENTS)
    assert ask.call_count == 2


async def test_rules_keep_the_session_and_map_references(engine: EneoEngine) -> None:
    answer_text = 'Alla ska behandlas lika <inref id="ab12cd34"/>. Se 4 kap. 1 § LOU <inref id="ef56ab78"/>.'
    response = _ask(
        answer_text,
        session_id=R1,
        references=[
            {"metadata": {"title": "Lämna anbud", "url": "https://www.upphandlingsmyndigheten.se/x/"}}
        ],
        mcp_tool_references=[
            {
                "uri": "https://anbudsklar.test/lou/4/1",
                "meta": {"title": "LOU 4 kap. 1 §", "section": "Principer"},
            },
            {
                "uri": "https://anbudsklar.test/dokument/d1#sida-7",
                "meta": {"title": "underlag.pdf", "section": "kvalificering", "pageRange": "7"},
            },
            {"uri": "eneo://info-blob/1#chunk-2", "meta": {"title": "Kommunens riktlinjer"}},
        ],
    )
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        router.post(f"/api/v1/assistants/{RULES}/sessions/").mock(return_value=response)
        delete = router.delete(url__regex=r".*/sessions/.*")
        answer, _ = await engine.answer_rules("Vad är likabehandling?", None, [])
    assert answer.answer == "Alla ska behandlas lika. Se 4 kap. 1 § LOU."
    assert answer.session_id == R1
    assert [(s.title, s.reference, s.url) for s in answer.sources] == [
        ("Lämna anbud", None, "https://www.upphandlingsmyndigheten.se/x/"),
        ("Principer", "LOU 4 kap. 1 §", "https://anbudsklar.test/lou/4/1"),
        ("underlag.pdf", "sida 7", "https://anbudsklar.test/dokument/d1#sida-7"),
        ("Kommunens riktlinjer", None, None),
    ]
    assert delete.call_count == 0


async def test_expired_rules_session_starts_a_new_one(engine: EneoEngine) -> None:
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        router.post(f"/api/v1/assistants/{RULES}/sessions/{GONE}/").mock(
            return_value=httpx.Response(404, json={})
        )
        fresh = router.post(f"/api/v1/assistants/{RULES}/sessions/").mock(return_value=_ask("Svar.", R2))
        answer, _ = await engine.answer_rules("Följdfråga?", GONE, [])
    assert fresh.call_count == 1
    assert answer.session_id == R2


async def test_missing_assistant_ids_point_to_provisioning(tmp_path: Path) -> None:
    with pytest.raises(EngineError, match="eneo provision") as raised:
        load_assistant_ids(tmp_path / "saknas.json")
    assert str(tmp_path) not in str(raised.value)  # paths stay in the log


async def test_unreachable_eneo_does_not_reveal_its_address(engine: EneoEngine) -> None:
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        router.post(SESSIONS).mock(side_effect=httpx.ConnectError("refused"))
        with pytest.raises(EngineError) as raised:
            await engine.interpret_document(NOTICE, DOCUMENTS)
    assert "eneo.test" not in str(raised.value)


@pytest.mark.parametrize(
    "session_id",
    [
        "../publish/?published=false#",
        "../../other-assistant/sessions/" + GONE,
        "../../../../spaces/x?",
        "..",
        GONE + "/../../publish",
        "a#frag",
    ],
)
async def test_rules_session_id_cannot_steer_the_admin_key_elsewhere(
    engine: EneoEngine, session_id: str
) -> None:
    """Anything but a UUID starts a new conversation; it never reaches the request path."""

    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        fresh = router.post(f"/api/v1/assistants/{RULES}/sessions/").mock(return_value=_ask("Svar.", R1))
        other = router.route(method="POST")
        answer, _ = await engine.answer_rules("Vad gäller?", session_id, [])
    assert fresh.call_count == 1
    assert other.call_count == 0
    request = fresh.calls[0].request
    assert request.url.path == f"/api/v1/assistants/{RULES}/sessions/"
    assert dict(request.url.params) == {"version": "2"}
    assert answer.session_id == R1


async def test_rules_follow_up_uses_the_canonical_uuid(engine: EneoEngine) -> None:
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        follow_up = router.post(f"/api/v1/assistants/{RULES}/sessions/{R1}/").mock(
            return_value=_ask("Svar.", R1)
        )
        answer, _ = await engine.answer_rules("Följdfråga?", R1.upper(), [])
    assert follow_up.call_count == 1
    assert answer.session_id == R1


async def test_assistant_ids_must_be_plain_path_segments(tmp_path: Path) -> None:
    assistants = tmp_path / "eneo-assistants.json"
    assistants.write_text(json.dumps({"regelhjalpen": "../x"}), encoding="utf-8")
    settings = Settings(
        _env_file=None,
        ai_engine="heuristic",
        eneo_backend_url=BASE_URL,
        eneo_api_key="sk_test",
        eneo_assistants_file=assistants,
    )
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        calls = router.route()
        with pytest.raises(EngineError, match="ogiltigt"):
            await EneoEngine(settings).answer_rules("Vad gäller?", None, [])
    assert calls.call_count == 0


async def test_task_without_assistant_is_an_engine_error(engine: EneoEngine) -> None:
    with pytest.raises(EngineError, match="foresla_cpv"):
        await engine.suggest_cpv("Vi målar.", [])


def test_clean_answer_removes_reference_tags() -> None:
    assert clean_answer(' Text <inref id="x"/> slut. ') == "Text slut."


def test_rule_sources_deduplicate_and_fall_back_to_a_title() -> None:
    reference = {"metadata": {"url": "https://www.upphandlingsmyndigheten.se/x/"}}
    sources = rule_sources([reference, reference, {"metadata": {}}], [])
    assert [(source.title, source.url) for source in sources] == [
        ("https://www.upphandlingsmyndigheten.se/x/", "https://www.upphandlingsmyndigheten.se/x/"),
        ("Kunskapskälla i Eneo", None),
    ]


def test_assistant_file_ignores_unknown_keys(tmp_path: Path) -> None:
    path = tmp_path / "eneo-assistants.json"
    path.write_text(json.dumps({"tolka_underlag": "a1", "okand": "x", "regelhjalpen": ""}), encoding="utf-8")
    assert load_assistant_ids(path) == {Task.INTERPRET_DOCUMENT: "a1"}
