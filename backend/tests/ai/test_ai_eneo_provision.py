"""Provisioning against an in-memory fake of Eneo's admin API."""

from __future__ import annotations

import json
import os
import re
import stat
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from pydantic import SecretStr

from anbudsklar.ai import eneo_provision
from anbudsklar.ai.eneo_provision import (
    KNOWLEDGE_WEBSITES,
    ProvisionError,
    ProvisionResult,
    choose_model,
    main,
    mcp_server_name,
    provision,
    write_env_values,
)
from anbudsklar.ai.prompts import load_prompt
from anbudsklar.config import Settings, get_settings
from anbudsklar.contracts import Task

BASE_URL = "https://eneo.test"
NAME = "Anbudsklar (PoC-test)"
MODELS = [
    {
        "id": "m-small",
        "name": "small",
        "can_access": True,
        "supports_tool_calling": False,
        "is_org_default": True,
    },
    {
        "id": "m-tools",
        "name": "gpt-tools",
        "nickname": "GPT Tools",
        "can_access": True,
        "supports_tool_calling": True,
    },
    {"id": "m-off", "name": "disabled", "can_access": False, "supports_tool_calling": True},
]


def _json(request: httpx.Request) -> dict[str, Any]:
    return json.loads(request.content) if request.content else {}


class FakeEneo:
    """Just enough of Eneo's API for provisioning, with state so re-runs can be checked."""

    def __init__(self) -> None:
        self.spaces: dict[str, dict[str, Any]] = {}
        self.assistants: dict[str, dict[str, Any]] = {}
        self.websites: dict[str, dict[str, Any]] = {}
        self.mcp_servers: dict[str, dict[str, Any]] = {}
        self.keys: dict[str, dict[str, Any]] = {}
        self.space_patches: list[dict[str, Any]] = []
        self.mcp_reachable = True
        self.created: list[str] = []
        self.key_check_status: int | None = None  # forces GET /spaces/{id}/ with a key to answer this
        self.key_check_unreachable = False
        self.key_create_status = 201
        self.key_events: list[str] = []

    def _id(self, prefix: str) -> str:
        self.created.append(prefix)
        return f"{prefix}-{len(self.created)}"

    def install(self, router: respx.MockRouter) -> None:
        def route(method: str, pattern: str, handler: Any) -> None:
            router.route(method=method, path__regex=rf"^{pattern}$").mock(side_effect=handler)

        route("POST", "/api/v1/users/login/token/", self.login)
        route("GET", "/api/v1/sysadmin/users/", self.sysadmin_users)
        route("POST", "/api/v1/sysadmin/users/(?P<user_id>[^/]+)/access-token/", self.mint_token)
        route(
            "GET", "/api/v1/completion-models/", lambda request: httpx.Response(200, json={"items": MODELS})
        )
        route("GET", "/api/v1/mcp-servers/", lambda request: self.listing(self.mcp_servers))
        route("POST", "/api/v1/mcp-servers/", self.create_mcp)
        route("POST", "/api/v1/mcp-servers/[^/]+/(?:tools/sync/|tools/review/approve-all/)", self.ok)
        route("POST", "/api/v1/mcp-servers/(?P<server_id>[^/]+)/", self.update_mcp)
        route("GET", "/api/v1/spaces/", lambda request: self.listing(self.spaces))
        route("POST", "/api/v1/spaces/", self.create_space)
        route("PATCH", "/api/v1/spaces/(?P<space_id>[^/]+)/", self.patch_space)
        route("GET", "/api/v1/spaces/(?P<space_id>[^/]+)/", self.get_space_with_key)
        route("GET", "/api/v1/spaces/(?P<space_id>[^/]+)/knowledge/", self.knowledge)
        route("POST", "/api/v1/spaces/(?P<space_id>[^/]+)/knowledge/websites/", self.create_website)
        route("GET", "/api/v1/spaces/(?P<space_id>[^/]+)/applications/", self.applications)
        route("POST", "/api/v1/spaces/(?P<space_id>[^/]+)/applications/assistants/", self.create_assistant)
        route("POST", "/api/v1/assistants/(?P<assistant_id>[^/]+)/", self.update_assistant)
        route(
            "GET",
            "/api/v1/api-keys/policy-constraints",
            lambda r: httpx.Response(200, json={"max_expiration_days": 30}),
        )
        route("GET", "/api/v1/api-keys", self.list_keys)
        route("POST", "/api/v1/api-keys", self.create_key)
        route("POST", "/api/v1/api-keys/(?P<key_id>[^/]+)/revoke", self.revoke_key)

    @staticmethod
    def ok(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    @staticmethod
    def listing(objects: dict[str, dict[str, Any]]) -> httpx.Response:
        return httpx.Response(200, json={"items": list(objects.values()), "count": len(objects)})

    def login(self, request: httpx.Request) -> httpx.Response:
        if request.content != b"username=admin%40example.test&password=hemligt":
            return httpx.Response(401, json={"message": "Unauthorized"})
        return httpx.Response(200, json={"access_token": "jwt-admin", "token_type": "bearer"})

    def sysadmin_users(self, request: httpx.Request) -> httpx.Response:
        assert request.headers["X-API-Key"] == "super"
        return httpx.Response(200, json={"items": [{"id": "u1", "email": "Admin@example.test"}]})

    def mint_token(self, request: httpx.Request, user_id: str) -> httpx.Response:
        assert user_id == "u1"
        return httpx.Response(200, json="jwt-minted")

    def create_mcp(self, request: httpx.Request) -> httpx.Response:
        if not self.mcp_reachable:
            return httpx.Response(
                400, json={"message": "Could not connect to MCP server", "eneo_error_code": 9007}
            )
        server = {"id": self._id("mcp"), **_json(request)}
        self.mcp_servers[server["id"]] = server
        return httpx.Response(201, json={"server": server, "connection": {"success": True}})

    def update_mcp(self, request: httpx.Request, server_id: str) -> httpx.Response:
        """Eneo tests the connection whenever credentials are sent, also on update."""

        if not self.mcp_reachable:
            return httpx.Response(
                400, json={"message": "Could not connect to MCP server", "eneo_error_code": 9007}
            )
        self.mcp_servers[server_id].update(_json(request))
        return httpx.Response(200, json={"server": self.mcp_servers[server_id]})

    def create_space(self, request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"].startswith("Bearer jwt-")
        space = {"id": self._id("space"), "name": _json(request)["name"], "personal": False}
        self.spaces[space["id"]] = space
        return httpx.Response(201, json=space)

    def patch_space(self, request: httpx.Request, space_id: str) -> httpx.Response:
        self.space_patches.append(_json(request))
        return httpx.Response(200, json=self.spaces[space_id])

    def get_space_with_key(self, request: httpx.Request, space_id: str) -> httpx.Response:
        if self.key_check_unreachable:
            raise httpx.ConnectError("Connection refused", request=request)
        if self.key_check_status is not None:
            return httpx.Response(self.key_check_status, json={"detail": {"code": "rate_limit_exceeded"}})
        secret = request.headers.get("X-API-Key")
        valid = any(key["secret"] == secret and key["state"] == "active" for key in self.keys.values())
        return httpx.Response(200, json=self.spaces[space_id]) if valid else httpx.Response(401, json={})

    def knowledge(self, request: httpx.Request, space_id: str) -> httpx.Response:
        return httpx.Response(200, json={"websites": {"items": list(self.websites.values())}})

    def create_website(self, request: httpx.Request, space_id: str) -> httpx.Response:
        website = {"id": self._id("web"), **_json(request)}
        self.websites[website["id"]] = website
        return httpx.Response(201, json=website)

    def applications(self, request: httpx.Request, space_id: str) -> httpx.Response:
        items = [{"id": key, "name": value["name"]} for key, value in self.assistants.items()]
        return httpx.Response(200, json={"assistants": {"items": items}})

    def create_assistant(self, request: httpx.Request, space_id: str) -> httpx.Response:
        assistant = {"id": self._id("assistant"), "name": _json(request)["name"]}
        self.assistants[assistant["id"]] = assistant
        return httpx.Response(201, json=assistant)

    def update_assistant(self, request: httpx.Request, assistant_id: str) -> httpx.Response:
        self.assistants[assistant_id].update(_json(request))
        return httpx.Response(200, json=self.assistants[assistant_id])

    def list_keys(self, request: httpx.Request) -> httpx.Response:
        assert request.url.params["scope_type"] == "space"
        active = [key for key in self.keys.values() if key["state"] == request.url.params["state"]]
        return httpx.Response(200, json={"items": active})

    def create_key(self, request: httpx.Request) -> httpx.Response:
        if self.key_create_status >= 400:
            return httpx.Response(self.key_create_status, json={"message": "Internal error"})
        body = _json(request)
        key_id = self._id("key")
        self.key_events.append(f"create {key_id}")
        self.keys[key_id] = {
            **body,
            "id": key_id,
            "state": "active",
            "secret": f"sk_{key_id}",
            "key_suffix": key_id,
        }
        return httpx.Response(201, json={"api_key": {"id": key_id}, "secret": f"sk_{key_id}"})

    def revoke_key(self, request: httpx.Request, key_id: str) -> httpx.Response:
        self.key_events.append(f"revoke {key_id}")
        self.keys[key_id]["state"] = "revoked"
        return httpx.Response(200, json=self.keys[key_id])


@pytest.fixture
def eneo() -> Iterator[FakeEneo]:
    fake = FakeEneo()
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        fake.install(router)
        yield fake


def _settings(tmp_path: Path, **overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "ai_engine": "heuristic",
        "eneo_backend_url": BASE_URL,
        "eneo_assistants_file": tmp_path / "eneo-assistants.json",
        **overrides,
    }
    return Settings(_env_file=None, **values)


def _provision(settings: Settings, **kwargs: Any) -> ProvisionResult:
    return provision(settings, email="admin@example.test", password="hemligt", name=NAME, **kwargs)


def test_first_run_creates_space_assistants_knowledge_and_key(eneo: FakeEneo, tmp_path: Path) -> None:
    result = _provision(_settings(tmp_path))

    assert result.model_id == "m-tools"  # tool calling beats the org default
    assert eneo.space_patches[0] == {
        "description": "AI-uppgifter för Anbudshjälpen. Hanteras av `anbudsklar eneo provision`.",
        "completion_models": [{"id": "m-tools"}],
        "mcp_servers": [],
        "data_retention_days": 1,
    }
    assert set(result.assistants) == {task.value for task in Task}
    for task in Task:
        assistant = eneo.assistants[result.assistants[task.value]]
        assert assistant["name"].startswith(f"{NAME} – ")
        assert assistant["prompt"]["text"] == load_prompt(task)
        assert assistant["insight_enabled"] is False
        assert assistant["data_retention_days"] == 1
        assert assistant["completion_model"] == {"id": "m-tools"}
        assert assistant["mcp_servers"] == []
    rules = eneo.assistants[result.assistants["regelhjalpen"]]
    assert len(rules["websites"]) == len(KNOWLEDGE_WEBSITES)
    assert "websites" not in eneo.assistants[result.assistants["tolka_underlag"]]

    key = next(iter(eneo.keys.values()))
    assert (key["ownership"], key["scope_type"], key["permission"], key["key_type"]) == (
        "service",
        "space",
        "admin",
        "sk_",
    )
    assert key["scope_id"] == result.space_id
    assert datetime.fromisoformat(key["expires_at"]) <= datetime.now(UTC) + timedelta(days=30, minutes=1)
    assert isinstance(result.api_key, SecretStr)
    assert result.api_key.get_secret_value() == key["secret"]
    assert key["secret"] not in result.summary()

    written = json.loads((tmp_path / "eneo-assistants.json").read_text(encoding="utf-8"))
    assert written == result.assistants


def test_second_run_updates_in_place_and_keeps_a_working_key(eneo: FakeEneo, tmp_path: Path) -> None:
    first = _provision(_settings(tmp_path))
    created = list(eneo.created)
    assert first.api_key is not None

    second = _provision(_settings(tmp_path, eneo_api_key=first.api_key.get_secret_value()))

    assert eneo.created == created  # nothing new: same space, assistants, websites and key
    assert second.assistants == first.assistants
    assert second.api_key is None
    assert any("Behöll den befintliga környckeln" in action for action in second.actions)


def test_a_stale_key_is_revoked_and_replaced(eneo: FakeEneo, tmp_path: Path) -> None:
    first = _provision(_settings(tmp_path))
    old_id = next(iter(eneo.keys))
    result = _provision(_settings(tmp_path, eneo_api_key="sk_stale"))

    states = sorted(key["state"] for key in eneo.keys.values())
    assert states == ["active", "revoked"]
    assert eneo.keys[old_id]["state"] == "revoked"
    assert result.api_key is not None and result.api_key != first.api_key
    new_id = next(key_id for key_id, key in eneo.keys.items() if key["state"] == "active")
    assert eneo.key_events[-2:] == [f"create {new_id}", f"revoke {old_id}"]  # create first, then revoke
    assert any("Återkallade" in action for action in result.actions)
    assert any("Dokploy" in warning for warning in result.warnings)


def test_rotate_key_replaces_a_working_key_at_once(eneo: FakeEneo, tmp_path: Path) -> None:
    first = _provision(_settings(tmp_path))
    assert first.api_key is not None
    old_id = next(iter(eneo.keys))

    result = _provision(_settings(tmp_path, eneo_api_key=first.api_key.get_secret_value()), rotate_key=True)

    assert eneo.keys[old_id]["state"] == "revoked"
    assert result.api_key is not None and result.api_key != first.api_key
    new_id = next(key_id for key_id, key in eneo.keys.items() if key["state"] == "active")
    assert eneo.key_events[-2:] == [f"create {new_id}", f"revoke {old_id}"]  # create first, then revoke
    assert any("--rotate-key" in action for action in result.actions)


@pytest.mark.parametrize("status", [429, 502, 503])
def test_a_transient_key_check_failure_touches_no_key(eneo: FakeEneo, tmp_path: Path, status: int) -> None:
    first = _provision(_settings(tmp_path))
    assert first.api_key is not None
    (tmp_path / "eneo-assistants.json").unlink()
    eneo.key_check_status = status
    events = list(eneo.key_events)

    with pytest.raises(ProvisionError, match=f"Eneo svarade {status}"):
        _provision(_settings(tmp_path, eneo_api_key=first.api_key.get_secret_value()))

    assert eneo.key_events == events  # nothing created, nothing revoked
    assert all(key["state"] == "active" for key in eneo.keys.values())
    assert (tmp_path / "eneo-assistants.json").exists()  # written before the key step


def test_an_unreachable_key_check_touches_no_key(eneo: FakeEneo, tmp_path: Path) -> None:
    first = _provision(_settings(tmp_path))
    assert first.api_key is not None
    events = list(eneo.key_events)
    eneo.key_check_unreachable = True
    with pytest.raises(ProvisionError, match="svarade inte"):
        _provision(_settings(tmp_path, eneo_api_key=first.api_key.get_secret_value()))
    assert eneo.key_events == events


def test_a_failed_create_leaves_the_old_key_active(eneo: FakeEneo, tmp_path: Path) -> None:
    _provision(_settings(tmp_path))
    eneo.key_create_status = 500
    with pytest.raises(ProvisionError, match="500"):
        _provision(_settings(tmp_path, eneo_api_key="sk_stale"))
    assert [key["state"] for key in eneo.keys.values()] == ["active"]


def test_a_key_that_expires_soon_gets_a_successor_and_keeps_working(eneo: FakeEneo, tmp_path: Path) -> None:
    first = _provision(_settings(tmp_path))
    assert first.api_key is not None
    old = next(iter(eneo.keys.values()))
    old["expires_at"] = (datetime.now(UTC) + timedelta(days=5)).isoformat()

    result = _provision(_settings(tmp_path, eneo_api_key=first.api_key.get_secret_value()))

    assert result.api_key is not None and result.api_key != first.api_key
    assert [key["state"] for key in eneo.keys.values()] == [
        "active",
        "active",
    ]  # the old one runs out by itself
    assert any("går ut" in action for action in result.actions)


def test_unreachable_mcp_server_is_reported_not_fatal(eneo: FakeEneo, tmp_path: Path) -> None:
    eneo.mcp_reachable = False
    settings = _settings(tmp_path, mcp_api_keys=[SecretStr("mcp-key")])
    result = _provision(settings, mcp_url="https://anbudsklar.test/mcp", knowledge=False)

    assert result.mcp_server_id is None
    assert any("https://anbudsklar.test/mcp" in warning for warning in result.warnings)
    assert len(result.assistants) == len(Task)


def test_mcp_server_is_attached_to_the_tool_tasks(eneo: FakeEneo, tmp_path: Path) -> None:
    settings = _settings(tmp_path, mcp_api_keys=[SecretStr("mcp-key")])
    result = _provision(settings, mcp_url="https://anbudsklar.test/mcp", knowledge=False)

    server = eneo.mcp_servers[result.mcp_server_id or ""]
    assert server["name"] == "anbudsklar_poc_test"
    assert (server["http_auth_type"], server["http_auth_config_schema"]) == ("bearer", {"token": "mcp-key"})
    assert eneo.space_patches[0]["mcp_servers"] == [{"id": result.mcp_server_id}]
    with_tools = {task for task in Task if eneo.assistants[result.assistants[task.value]]["mcp_servers"]}
    assert with_tools == {Task.ANSWER_RULES, Task.ANSWER_QUESTION}


def test_mcp_without_keys_is_skipped(eneo: FakeEneo, tmp_path: Path) -> None:
    result = _provision(_settings(tmp_path), mcp_url="https://anbudsklar.test/mcp", knowledge=False)
    assert result.mcp_server_id is None
    assert any("MCP_API_KEYS" in warning for warning in result.warnings)


def _assert_mcp_attached(eneo: FakeEneo, result: ProvisionResult, server_id: str) -> None:
    assert result.mcp_server_id == server_id
    assert eneo.space_patches[-1]["mcp_servers"] == [{"id": server_id}]
    with_tools = {task for task in Task if eneo.assistants[result.assistants[task.value]]["mcp_servers"]}
    assert with_tools == {Task.ANSWER_RULES, Task.ANSWER_QUESTION}


def test_a_failed_mcp_update_keeps_the_registered_server_attached(eneo: FakeEneo, tmp_path: Path) -> None:
    settings = _settings(tmp_path, mcp_api_keys=[SecretStr("mcp-key")])
    first = _provision(settings, mcp_url="https://anbudsklar.test/mcp", knowledge=False)
    server_id = first.mcp_server_id or ""

    eneo.mcp_reachable = False  # Anbudshjälpen is redeploying while provision runs again
    result = _provision(settings, mcp_url="https://anbudsklar.test/mcp", knowledge=False)

    _assert_mcp_attached(eneo, result, server_id)
    assert any("är kvar" in warning for warning in result.warnings)


def test_mcp_without_keys_keeps_the_registered_server_attached(eneo: FakeEneo, tmp_path: Path) -> None:
    first = _provision(
        _settings(tmp_path, mcp_api_keys=[SecretStr("mcp-key")]),
        mcp_url="https://anbudsklar.test/mcp",
        knowledge=False,
    )
    result = _provision(_settings(tmp_path), mcp_url="https://anbudsklar.test/mcp", knowledge=False)

    _assert_mcp_attached(eneo, result, first.mcp_server_id or "")
    assert any("MCP_API_KEYS" in warning for warning in result.warnings)


def test_super_key_mints_a_token_for_the_user(eneo: FakeEneo, tmp_path: Path) -> None:
    result = provision(
        _settings(tmp_path), email="admin@example.test", super_key="super", name=NAME, knowledge=False
    )
    assert result.space_id in eneo.spaces


def test_failed_login_is_a_provision_error(eneo: FakeEneo, tmp_path: Path) -> None:
    with pytest.raises(ProvisionError, match="Inloggningen i Eneo misslyckades"):
        provision(_settings(tmp_path), email="admin@example.test", password="fel", name=NAME)


def test_choose_model() -> None:
    assert choose_model(MODELS, "gpt tools")["id"] == "m-tools"
    assert choose_model(MODELS, None)["id"] == "m-tools"
    with pytest.raises(ProvisionError, match="Tillgängliga: gpt-tools, small"):
        choose_model(MODELS, "disabled")
    with pytest.raises(ProvisionError, match="ingen aktiverad"):
        choose_model([MODELS[2]], None)


def test_mcp_server_name_is_short_ascii() -> None:
    assert mcp_server_name("Anbudsklar (PoC-test)") == "anbudsklar_poc_test"
    assert re.fullmatch(r"[a-z0-9_]+", mcp_server_name("Regelhjälpen Sundsvall"))


def test_write_env_values_updates_in_place(tmp_path: Path) -> None:
    (tmp_path / ".env.example").write_text(
        "# Kommentar\nENEO_BACKEND_URL=\nENEO_API_KEY=\nAI_ENGINE=heuristic\n"
    )
    target = tmp_path / ".env"
    write_env_values(target, {"ENEO_BACKEND_URL": BASE_URL, "ENEO_API_KEY": "sk_x", "NY": "1"})
    assert target.read_text().splitlines() == [
        "# Kommentar",
        f"ENEO_BACKEND_URL={BASE_URL}",
        "ENEO_API_KEY=sk_x",
        "AI_ENGINE=heuristic",
        "NY=1",
    ]
    assert target.stat().st_mode & 0o777 == 0o600
    write_env_values(target, {"ENEO_API_KEY": "sk_y"})
    assert "ENEO_API_KEY=sk_y" in target.read_text().splitlines()


def test_write_env_values_never_exposes_the_secret(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The secret is written to a 0600 file before it gets its final name, whatever the umask."""

    modes: list[int] = []
    replace = os.replace

    def checked_replace(source: str, target: str) -> None:
        modes.append(stat.S_IMODE(os.stat(source).st_mode))
        replace(source, target)

    monkeypatch.setattr(os, "replace", checked_replace)
    old_umask = os.umask(0o022)
    try:
        write_env_values(tmp_path / "eneo.env", {"ENEO_API_KEY": "sk_secret"})
    finally:
        os.umask(old_umask)
    assert modes == [0o600]
    assert stat.S_IMODE((tmp_path / "eneo.env").stat().st_mode) == 0o600
    assert [path.name for path in tmp_path.iterdir()] == ["eneo.env"]  # no temporary file left behind


@pytest.fixture
def provision_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    monkeypatch.setenv("ENEO_BACKEND_URL", BASE_URL)
    monkeypatch.setenv("ENEO_ASSISTANTS_FILE", str(tmp_path / "eneo-assistants.json"))
    monkeypatch.setenv("ENEO_PROVISION_PASSWORD", "hemligt")
    monkeypatch.delenv("ENEO_SUPER_API_KEY", raising=False)
    get_settings.cache_clear()
    yield tmp_path
    get_settings.cache_clear()


def test_main_writes_the_key_to_the_env_file_without_printing_it(
    eneo: FakeEneo, provision_env: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    env_file = provision_env / ".env"
    code = main(
        ["--email", "admin@example.test", "--name", NAME, "--no-knowledge", "--env-file", str(env_file)]
    )
    assert code == 0
    secret = next(iter(eneo.keys.values()))["secret"]
    assert f"ENEO_API_KEY={secret}" in env_file.read_text().splitlines()
    output = capsys.readouterr().out
    assert secret not in output
    assert (
        f"Skrev ENEO_BACKEND_URL, ENEO_API_KEY och ENEO_API_KEY_HEADER_NAME till {env_file.resolve()}"
        in output
    )


def test_main_writes_to_the_repository_env_file_by_default(
    eneo: FakeEneo, provision_env: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The same file whatever directory the command runs from (backend/ or the repository root).
    monkeypatch.setattr(eneo_provision, "REPO_ROOT", provision_env)
    monkeypatch.chdir(provision_env.parent)
    assert main(["--email", "admin@example.test", "--name", NAME, "--no-knowledge"]) == 0
    secret = next(iter(eneo.keys.values()))["secret"]
    assert f"ENEO_API_KEY={secret}" in (provision_env / ".env").read_text().splitlines()
