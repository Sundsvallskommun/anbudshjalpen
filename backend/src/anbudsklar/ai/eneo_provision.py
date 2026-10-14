"""Set up Anbudshjälpen's space, assistants and runtime key in an Eneo instance.

`anbudsklar eneo provision` (and `python -m anbudsklar.ai.eneo_provision`) runs this
once per Eneo instance and again whenever a prompt changes. It is idempotent: objects
are found by name and updated, never duplicated. What it does, in order:

1. Gets a user token: password login, or the deployment's super key minting a token
   for the given user (Eneo's API cannot provision with a service key).
2. Picks a completion model, preferring one that supports tool calling (MCP tools are
   silently ignored otherwise).
3. Registers our MCP server when a URL is given. Eneo connects to it before saving, so
   an unreachable server is reported and skipped, not treated as fatal; a server that
   was registered before stays attached to the space and the assistants.
4. Creates the space with one-day data retention and only the chosen model.
5. Creates or updates one assistant per task with the prompt file as instructions,
   insights off and one-day retention; Regelhjälpen also gets public guidance websites.
6. Writes the {task: assistant_id} file the Eneo engine reads.
7. Keeps a working runtime key. A key that Eneo rejects (401/403) is replaced: a new
   space-scoped service key (`sk_`, admin so the engine can delete sessions, with an
   expiry date) is created first and the old ones are revoked after. A key that expires
   within two weeks gets a successor and keeps working until it expires. When Eneo
   cannot answer the check (rate limit, restart) the run stops and touches no key.
   `--rotate-key` replaces a working key at once, for example after a leak.

Secrets are never printed. The new key is returned as a `SecretStr`; the command line
writes it to the dotenv file.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import sys
import tempfile
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
from pydantic import SecretStr

from anbudsklar.ai.prompts import load_prompt
from anbudsklar.config import REPO_ROOT, Settings, get_settings
from anbudsklar.contracts import Task

DEFAULT_NAME = "Anbudsklar (PoC)"
RETENTION_DAYS = 1
KEY_LIFETIME_DAYS = 90
KEY_ROTATE_WITHIN_DAYS = 14
_KEY_REJECTED = frozenset({401, 403})

TASK_TITLES: dict[Task, str] = {
    Task.INTERPRET_DOCUMENT: "Tolka underlag",
    Task.ASSESS_MATCH: "Bedöm matchning",
    Task.REVIEW_DRAFT: "Granska anbudsutkast",
    Task.ANSWER_QUESTION: "Besvara fråga om underlaget",
    Task.SUGGEST_CPV: "Föreslå CPV-koder",
    Task.ANSWER_RULES: "Regelhjälpen",
    Task.UPDATE_PROFILE: "Uppdatera profilen",
    Task.CHOOSE_SUBJECT: "Välj ämne",
}
TASK_DESCRIPTIONS: dict[Task, str] = {
    Task.INTERPRET_DOCUMENT: "Gör om ett förfrågningsunderlag till en checklista med citat och sidnummer.",
    Task.ASSESS_MATCH: "Bedömer om en upphandling passar ett företags profil.",
    Task.REVIEW_DRAFT: "Granskar ett anbudsutkast mot checklistan. Utkastet sparas inte.",
    Task.ANSWER_QUESTION: "Svarar på frågor om ett förfrågningsunderlag med citat.",
    Task.SUGGEST_CPV: "Föreslår CPV-koder utifrån ett företags beskrivning.",
    Task.ANSWER_RULES: "Svarar på allmänna frågor om upphandlingsregler med källor.",
    Task.UPDATE_PROFILE: "Läser vad ett företag vill ändra i sin profil i Fråga AI. Appen sparar ändringen.",
    Task.CHOOSE_SUBJECT: "Avgör om ett meddelande i Fråga AI gäller underlaget, reglerna eller profilen.",
}
MCP_TASKS: frozenset[Task] = frozenset({Task.ANSWER_RULES, Task.ANSWER_QUESTION})
KNOWLEDGE_WEBSITES: tuple[tuple[str, str], ...] = (
    (
        "Upphandlingsmyndigheten: Göra affärer med offentlig sektor",
        "https://www.upphandlingsmyndigheten.se/gora-affarer-med-offentlig-sektor/",
    ),
    (
        "Sundsvalls kommun: Upphandling och inköp",
        "https://sundsvall.se/kommun/jobb-och-foretagande/upphandling-och-inkop",
    ),
)
_PROMPT_NOTE = (
    "Hanteras av `anbudsklar eneo provision`. Ändra prompten i Anbudshjälpens repo; "
    "ändringar här skrivs över."
)


class ProvisionError(RuntimeError):
    """Provisioning cannot continue. The message is Swedish and safe to print."""


@dataclass
class ProvisionResult:
    """What provisioning found, created and changed."""

    base_url: str
    space_name: str
    space_id: str = ""
    model_id: str = ""
    model_name: str = ""
    model_supports_tools: bool = False
    assistants: dict[str, str] = field(default_factory=dict)
    mcp_server_id: str | None = None
    website_ids: list[str] = field(default_factory=list)
    api_key: SecretStr | None = None
    api_key_expires_at: datetime | None = None
    assistants_file: Path | None = None
    actions: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def summary(self) -> str:
        """A Swedish report of the run, without secrets."""

        tools = "ja" if self.model_supports_tools else "nej"
        lines = [
            f"Eneo: {self.base_url}",
            f"Space: {self.space_name} ({self.space_id})",
            f"Modell: {self.model_name} (verktygsanrop: {tools})",
            "Assistenter:",
            *(f"  {task}: {assistant_id}" for task, assistant_id in self.assistants.items()),
            f"MCP-server: {self.mcp_server_id or 'inte registrerad'}",
            "",
            "Gjort:",
            *(f"- {action}" for action in self.actions),
        ]
        if self.warnings:
            lines += ["", "Att åtgärda:", *(f"- {warning}" for warning in self.warnings)]
        return "\n".join(lines)


class _EneoAdmin:
    """Thin JSON client for Eneo's admin API with a user token."""

    def __init__(self, client: httpx.Client, token: str) -> None:
        self._client = client
        self._headers = {"Authorization": f"Bearer {token}"}

    def request(self, method: str, path: str, **kwargs: Any) -> Any:
        try:
            response = self._client.request(method, path, headers=self._headers, **kwargs)
        except httpx.HTTPError as error:
            raise ProvisionError(f"Det gick inte att nå Eneo ({method} {path}): {error}") from error
        if response.is_error:
            raise ProvisionError(
                f"Eneo svarade {response.status_code} på {method} {path}: {_eneo_message(response)}"
            )
        return response.json() if response.content else None

    def get(self, path: str, **params: Any) -> Any:
        return self.request("GET", path, params=params or None)

    def post(self, path: str, body: dict[str, Any] | None = None) -> Any:
        return self.request("POST", path, json=body)

    def patch(self, path: str, body: dict[str, Any]) -> Any:
        return self.request("PATCH", path, json=body)


def _eneo_message(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:300]
    if isinstance(body, dict):
        detail = body.get("detail")
        if isinstance(detail, dict):
            return str(detail.get("message") or detail.get("code") or detail)
        return str(body.get("message") or detail or body)[:300]
    return str(body)[:300]


def _items(payload: Any) -> list[dict[str, Any]]:
    return list(payload.get("items") or []) if isinstance(payload, dict) else []


# --- 1. Token -----------------------------------------------------------------------


def _login(client: httpx.Client, email: str, password: str) -> str:
    response = client.post("/api/v1/users/login/token/", data={"username": email, "password": password})
    if response.status_code == 429:
        raise ProvisionError("För många inloggningsförsök i Eneo. Vänta tio minuter och försök igen.")
    if response.is_error:
        raise ProvisionError(
            f"Inloggningen i Eneo misslyckades ({response.status_code}). Kontrollera e-post och lösenord."
        )
    return str(response.json()["access_token"])


def _token_with_super_key(client: httpx.Client, email: str, super_key: str, header_name: str) -> str:
    """Mint a token for `email` with the super key.

    Eneo reads the super key from its configured API key header (API_KEY_HEADER_NAME),
    the same header as ordinary keys, so we use ENEO_API_KEY_HEADER_NAME here too.
    """

    headers = {header_name: super_key}
    response = client.get("/api/v1/sysadmin/users/", headers=headers)
    if response.is_error:
        raise ProvisionError(f"Superadmin-nyckeln godtogs inte av Eneo ({response.status_code}).")
    user = next(
        (item for item in _items(response.json()) if item.get("email", "").lower() == email.lower()), None
    )
    if user is None:
        raise ProvisionError(f"Hittar ingen användare med e-postadressen {email} i Eneo.")
    response = client.post(f"/api/v1/sysadmin/users/{user['id']}/access-token/", headers=headers)
    if response.is_error:
        raise ProvisionError(f"Eneo gav ingen token för {email} ({response.status_code}).")
    return str(response.json())


# --- 2. Model -----------------------------------------------------------------------


def choose_model(models: list[dict[str, Any]], model_name: str | None) -> dict[str, Any]:
    """The requested model, or the best usable one: tool calling, then default, then context size."""

    usable = [model for model in models if model.get("can_access")]
    if model_name:
        wanted = model_name.lower()
        for model in usable:
            if wanted in {str(model.get("name", "")).lower(), str(model.get("nickname") or "").lower()}:
                return model
        names = ", ".join(sorted(str(model.get("name")) for model in usable)) or "inga"
        raise ProvisionError(
            f"Modellen {model_name} finns inte eller är inte aktiverad. Tillgängliga: {names}."
        )
    if not usable:
        raise ProvisionError(
            "Eneo har ingen aktiverad språkmodell. Aktivera en modell under Admin > Modeller."
        )
    return max(
        usable,
        key=lambda model: (
            bool(model.get("supports_tool_calling")),
            bool(model.get("is_org_default")),
            int(model.get("max_input_tokens") or 0),
        ),
    )


# --- 3. MCP server ------------------------------------------------------------------


def mcp_server_name(name: str) -> str:
    """Eneo prefixes tool names with the server name, so keep it short and ASCII."""

    ascii_name = name.lower().translate(str.maketrans("åäöé", "aaoe"))
    words = "".join(char if char.isalnum() else " " for char in ascii_name).split()
    return "_".join(words) or "anbudsklar"


def _ensure_mcp_server(
    api: _EneoAdmin, settings: Settings, name: str, mcp_url: str | None, result: ProvisionResult
) -> None:
    server_name = mcp_server_name(name)
    existing = next(
        (item for item in _items(api.get("/api/v1/mcp-servers/")) if item.get("name") == server_name), None
    )
    # The space and assistant updates replace their MCP lists, so a server that exists must
    # stay attached even when this run cannot update it: a failed update keeps the old one.
    if existing:
        result.mcp_server_id = str(existing["id"])
    if mcp_url is None:
        if existing:
            result.actions.append(
                f"Behöll den registrerade MCP-servern {server_name} (ingen ny adress angavs)."
            )
        else:
            result.actions.append("Registrerade ingen MCP-server: ingen adress angavs (--mcp-url).")
        return
    if not settings.mcp_api_keys:
        kept = f" Den registrerade servern {server_name} är kvar oförändrad." if existing else ""
        result.warnings.append(
            f"MCP-servern registrerades inte: MCP_API_KEYS är tom, så servern skulle neka Eneo.{kept}"
        )
        return
    body: dict[str, Any] = {
        "http_url": mcp_url,
        "http_auth_type": "bearer",
        "http_auth_config_schema": {"token": settings.mcp_api_keys[0].get_secret_value()},
        "description": (
            "Anbudshjälpen: upphandlingsdata, publicerade checklistor, LOU och CPV (bara läsning)."
        ),
        "forward_identity": False,
    }
    try:
        if existing:
            server_id = str(existing["id"])
            api.post(f"/api/v1/mcp-servers/{server_id}/", body)
            api.post(f"/api/v1/mcp-servers/{server_id}/tools/sync/")
            api.post(f"/api/v1/mcp-servers/{server_id}/tools/review/approve-all/")
            result.actions.append(f"Uppdaterade MCP-servern {server_name}, synkade och godkände verktygen.")
        else:
            created = api.post("/api/v1/mcp-servers/", {"name": server_name, "tags": ["anbudsklar"], **body})
            server_id = str(created["server"]["id"])
            result.actions.append(f"Registrerade MCP-servern {server_name} ({mcp_url}).")
    except ProvisionError as error:
        kept = (
            f" Den tidigare registreringen av {server_name} är kvar och fortsätter att användas."
            if existing
            else ""
        )
        result.warnings.append(
            f"MCP-servern kunde inte registreras. Eneo måste nå {mcp_url}; kör igen när servern är igång. "
            f"({error}){kept}"
        )
        return
    result.mcp_server_id = server_id


# --- 4. Space -----------------------------------------------------------------------


def _ensure_space(api: _EneoAdmin, name: str, result: ProvisionResult) -> None:
    spaces = _items(api.get("/api/v1/spaces/"))
    space = next((item for item in spaces if item.get("name") == name and not item.get("personal")), None)
    if space is None:
        space = api.post("/api/v1/spaces/", {"name": name})
        result.actions.append(f"Skapade spacet {name}.")
    else:
        result.actions.append(f"Hittade spacet {name}.")
    result.space_id = str(space["id"])
    api.patch(
        f"/api/v1/spaces/{result.space_id}/",
        {
            "description": "AI-uppgifter för Anbudshjälpen. Hanteras av `anbudsklar eneo provision`.",
            "completion_models": [{"id": result.model_id}],
            "mcp_servers": [{"id": result.mcp_server_id}] if result.mcp_server_id else [],
            "data_retention_days": RETENTION_DAYS,
        },
    )
    result.actions.append(f"Satte modell, MCP-server och lagringstid ({RETENTION_DAYS} dag) på spacet.")


# --- 5. Knowledge and assistants ----------------------------------------------------


def _ensure_websites(api: _EneoAdmin, result: ProvisionResult) -> None:
    try:
        knowledge = api.get(f"/api/v1/spaces/{result.space_id}/knowledge/")
        existing = {
            str(item.get("url", "")).rstrip("/"): str(item["id"])
            for item in _items((knowledge or {}).get("websites"))
        }
        for title, url in KNOWLEDGE_WEBSITES:
            website_id = existing.get(url.rstrip("/"))
            if website_id is None:
                body = {"name": title, "url": url, "crawl_type": "crawl", "download_files": False}
                created = api.post(
                    f"/api/v1/spaces/{result.space_id}/knowledge/websites/",
                    {**body, "update_interval": "weekly"},
                )
                website_id = str(created["id"])
                result.actions.append(f"Lade till webbplatsen {url} som kunskap (genomsöks varje vecka).")
            result.website_ids.append(website_id)
    except ProvisionError as error:
        result.website_ids.clear()
        result.warnings.append(f"Regelhjälpen fick ingen webbkunskap: {error}")


def _assistant_body(task: Task, name: str, result: ProvisionResult, knowledge: bool) -> dict[str, Any]:
    use_mcp = task in MCP_TASKS and result.mcp_server_id is not None and result.model_supports_tools
    body: dict[str, Any] = {
        "name": f"{name} – {TASK_TITLES[task]}",
        "description": TASK_DESCRIPTIONS[task],
        "prompt": {"text": load_prompt(task), "description": _PROMPT_NOTE},
        "completion_model": {"id": result.model_id},
        "insight_enabled": False,
        "data_retention_days": RETENTION_DAYS,
        "mcp_servers": [{"id": result.mcp_server_id}] if use_mcp else [],
    }
    if task is Task.ANSWER_RULES and knowledge:
        body["websites"] = [{"id": website_id} for website_id in result.website_ids]
    return body


def _ensure_assistants(api: _EneoAdmin, name: str, knowledge: bool, result: ProvisionResult) -> None:
    applications = api.get(f"/api/v1/spaces/{result.space_id}/applications/")
    existing = {
        str(item.get("name")): str(item["id"]) for item in _items((applications or {}).get("assistants"))
    }
    for task in Task:
        body = _assistant_body(task, name, result, knowledge)
        assistant_id = existing.get(body["name"])
        if assistant_id is None:
            created = api.post(
                f"/api/v1/spaces/{result.space_id}/applications/assistants/", {"name": body["name"]}
            )
            assistant_id = str(created["id"])
            verb = "Skapade"
        else:
            verb = "Uppdaterade"
        api.post(f"/api/v1/assistants/{assistant_id}/", body)
        result.assistants[task.value] = assistant_id
        result.actions.append(f"{verb} assistenten {body['name']}.")
    if result.mcp_server_id and not result.model_supports_tools:
        result.warnings.append(
            f"Modellen {result.model_name} har inte verktygsanrop påslaget i Eneo, "
            "så MCP-verktygen används inte."
        )


# --- 7. Runtime key -----------------------------------------------------------------


def _key_works(client: httpx.Client, settings: Settings, space_id: str) -> bool:
    """Whether ENEO_API_KEY can read the space.

    Only 401 and 403 mean that it cannot. A rate limit (429), Eneo restarting (5xx) or a
    network error says nothing about the key, and guessing "broken" there would revoke
    the key the running app uses, so the run stops instead.
    """

    if settings.eneo_api_key is None:
        return False
    headers = {settings.eneo_api_key_header_name: settings.eneo_api_key.get_secret_value()}
    untouched = "Den befintliga környckeln lämnades orörd; kör igen när Eneo svarar."
    try:
        status = client.get(f"/api/v1/spaces/{space_id}/", headers=headers).status_code
    except httpx.HTTPError as error:
        raise ProvisionError(f"Kunde inte kontrollera környckeln: Eneo svarade inte. {untouched}") from error
    if status == 200:
        return True
    if status in _KEY_REJECTED:
        return False
    raise ProvisionError(f"Kunde inte kontrollera környckeln (Eneo svarade {status}). {untouched}")


def _key_lifetime_days(api: _EneoAdmin) -> int:
    try:
        constraints = api.get("/api/v1/api-keys/policy-constraints") or {}
    except ProvisionError:
        return KEY_LIFETIME_DAYS
    limit = constraints.get("max_expiration_days")
    return min(KEY_LIFETIME_DAYS, int(limit)) if limit else KEY_LIFETIME_DAYS


def _active_keys(api: _EneoAdmin, space_id: str, key_name: str) -> list[dict[str, Any]]:
    keys = _items(api.get("/api/v1/api-keys", scope_type="space", scope_id=space_id, state="active"))
    return [key for key in keys if key.get("name") == key_name]


def _expires_soon(keys: list[dict[str, Any]], secret: str) -> datetime | None:
    """The expiry of the current key when it falls within KEY_ROTATE_WITHIN_DAYS."""

    for key in keys:
        suffix = str(key.get("key_suffix") or "")
        if not suffix or not secret.endswith(suffix) or not key.get("expires_at"):
            continue
        try:
            expires_at = datetime.fromisoformat(str(key["expires_at"]).replace("Z", "+00:00"))
        except ValueError:
            return None
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        remaining = expires_at - datetime.now(UTC)
        return expires_at if remaining <= timedelta(days=KEY_ROTATE_WITHIN_DAYS) else None
    return None


def _create_runtime_key(api: _EneoAdmin, key_name: str, result: ProvisionResult) -> str:
    expires_at = datetime.now(UTC) + timedelta(days=_key_lifetime_days(api))
    created = api.post(
        "/api/v1/api-keys",
        {
            "name": key_name,
            "description": "Anbudshjälpens környckel: frågar assistenterna och raderar sessionerna.",
            "key_type": "sk_",
            "ownership": "service",
            "scope_type": "space",
            "scope_id": result.space_id,
            "permission": "admin",
            "expires_at": expires_at.isoformat(),
        },
    )
    result.api_key = SecretStr(str(created["secret"]))
    result.api_key_expires_at = expires_at
    result.actions.append(
        f"Skapade en ny környckel (servicenyckel för spacet), giltig till {expires_at:%Y-%m-%d}."
    )
    result.warnings.append(
        "Sätt den nya ENEO_API_KEY i driftmiljön (till exempel Environment i Dokploy) och starta om appen. "
        "En miljövariabel går före .env-filen."
    )
    api_key = created.get("api_key")
    return str(api_key.get("id") or "") if isinstance(api_key, dict) else ""


def _ensure_runtime_key(
    api: _EneoAdmin,
    client: httpx.Client,
    settings: Settings,
    name: str,
    result: ProvisionResult,
    *,
    rotate: bool = False,
) -> None:
    """Keep a working key, or replace it. `rotate` replaces it now, for example after a leak."""

    key_name = f"{name} környckel"
    if rotate:
        result.actions.append("Byter környckeln på begäran (--rotate-key).")
    elif _key_works(client, settings, result.space_id):
        secret = settings.eneo_api_key.get_secret_value() if settings.eneo_api_key else ""
        try:
            expires_at = _expires_soon(_active_keys(api, result.space_id, key_name), secret)
        except ProvisionError as error:
            result.warnings.append(f"Kunde inte läsa när környckeln går ut: {error}")
            expires_at = None
        if expires_at is None:
            result.actions.append("Behöll den befintliga környckeln (ENEO_API_KEY), som fungerar för spacet.")
            return
        _create_runtime_key(api, key_name, result)
        result.actions.append(
            f"Den befintliga környckeln går ut {expires_at:%Y-%m-%d} och fungerar till dess; "
            "byt till den nya innan dess."
        )
        return
    # Create first, then revoke: a failed create must not leave the space without a key.
    new_id = _create_runtime_key(api, key_name, result)
    for key in _active_keys(api, result.space_id, key_name):
        if str(key.get("id")) == new_id:
            continue
        api.post(
            f"/api/v1/api-keys/{key['id']}/revoke", {"reason_text": "Ersatt av anbudsklar eneo provision"}
        )
        result.actions.append(f"Återkallade den gamla környckeln som slutar på {key.get('key_suffix', '?')}.")


# --- 6. Assistants file and entry point ---------------------------------------------


def _write_assistants_file(path: Path, result: ProvisionResult) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result.assistants, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    result.assistants_file = path
    result.actions.append(f"Sparade assistenternas id i {path}.")


def provision(
    settings: Settings,
    *,
    email: str,
    password: str | None = None,
    super_key: str | None = None,
    mcp_url: str | None = None,
    model_name: str | None = None,
    name: str = DEFAULT_NAME,
    knowledge: bool = True,
    rotate_key: bool = False,
    client: httpx.Client | None = None,
) -> ProvisionResult:
    """Create or update everything Anbudshjälpen needs in Eneo. Safe to run again.

    Give either `password` (login as `email`) or `super_key` (mint a token for `email`).
    `knowledge=False` skips the website crawls for Regelhjälpen. `rotate_key=True`
    creates a new runtime key and revokes the old ones even if the current key works.
    """

    if not settings.eneo_backend_url:
        raise ProvisionError("ENEO_BACKEND_URL är inte satt.")
    if not (password or super_key):
        raise ProvisionError("Ange lösenord eller superadmin-nyckel för Eneo.")
    base_url = settings.eneo_backend_url.rstrip("/")
    own_client = client is None
    http = client or httpx.Client(base_url=base_url, timeout=60.0)
    result = ProvisionResult(base_url=base_url, space_name=name)
    try:
        token = (
            _login(http, email, password)
            if password
            else _token_with_super_key(http, email, super_key or "", settings.eneo_api_key_header_name)
        )
        api = _EneoAdmin(http, token)
        model = choose_model(_items(api.get("/api/v1/completion-models/")), model_name)
        result.model_id = str(model["id"])
        result.model_name = str(model.get("nickname") or model.get("name"))
        result.model_supports_tools = bool(model.get("supports_tool_calling"))
        result.actions.append(f"Valde modellen {result.model_name}.")
        _ensure_mcp_server(api, settings, name, mcp_url, result)
        _ensure_space(api, name, result)
        if knowledge:
            _ensure_websites(api, result)
        _ensure_assistants(api, name, knowledge, result)
        _write_assistants_file(settings.eneo_assistants_file, result)
        _ensure_runtime_key(api, http, settings, name, result, rotate=rotate_key)
    finally:
        if own_client:
            http.close()
    return result


def write_env_values(path: Path, values: dict[str, str]) -> None:
    """Set KEY=value lines in a dotenv file and keep everything else.

    A missing file starts from the `.env.example` next to it. The file is made readable
    by its owner only, because it holds the runtime key.
    """

    if path.exists():
        lines = path.read_text(encoding="utf-8").splitlines()
    else:
        example = path.with_name(".env.example")
        lines = example.read_text(encoding="utf-8").splitlines() if example.exists() else []
    remaining = dict(values)
    output: list[str] = []
    for line in lines:
        key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("#") else ""
        output.append(f"{key}={remaining.pop(key)}" if key in remaining else line)
    output.extend(f"{key}={value}" for key, value in remaining.items())
    _write_private(path, "\n".join(output) + "\n")


def _write_private(path: Path, text: str) -> None:
    """Write via a 0600 temporary file in the same directory, so the secret is never world-readable."""

    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.replace(temporary, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(temporary)
        raise


def main(argv: list[str] | None = None) -> int:
    """Command line entry point. Credentials come from the environment, never from arguments."""

    parser = argparse.ArgumentParser(
        prog="python -m anbudsklar.ai.eneo_provision",
        description=(
            "Skapar eller uppdaterar Anbudshjälpens space, assistenter och környckel i Eneo "
            "(ENEO_BACKEND_URL). Lösenordet läses från ENEO_PROVISION_PASSWORD eller superadmin-nyckeln från "
            "ENEO_SUPER_API_KEY."
        ),
    )
    parser.add_argument(
        "--email", default=os.environ.get("ENEO_PROVISION_EMAIL"), help="Eneo-användare (admin)."
    )
    parser.add_argument(
        "--mcp-url", help="Adress som Eneo når Anbudshjälpens MCP-server på, t.ex. https://…/mcp."
    )
    parser.add_argument(
        "--model", help="Språkmodell i Eneo (namn eller smeknamn). Standard: bästa tillgängliga."
    )
    parser.add_argument("--name", default=DEFAULT_NAME, help=f"Namn på spacet (standard: {DEFAULT_NAME}).")
    parser.add_argument(
        "--no-knowledge", action="store_true", help="Lägg inte till webbkunskap för Regelhjälpen."
    )
    parser.add_argument(
        "--rotate-key",
        action="store_true",
        help="Skapa en ny környckel och återkalla de gamla direkt, även om den nuvarande fungerar.",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=REPO_ROOT / ".env",
        help="Dotenv-fil för en ny környckel (standard: repots .env).",
    )
    args = parser.parse_args(argv)
    if not args.email:
        parser.error("ange --email eller ENEO_PROVISION_EMAIL")
    settings = get_settings()
    try:
        result = provision(
            settings,
            email=args.email,
            password=os.environ.get("ENEO_PROVISION_PASSWORD"),
            super_key=os.environ.get("ENEO_SUPER_API_KEY"),
            mcp_url=args.mcp_url,
            model_name=args.model,
            name=args.name,
            knowledge=not args.no_knowledge,
            rotate_key=args.rotate_key,
        )
    except ProvisionError as error:
        print(f"Fel: {error}", file=sys.stderr)
        return 1
    if result.api_key is not None:
        write_env_values(
            args.env_file,
            {
                "ENEO_BACKEND_URL": result.base_url,
                "ENEO_API_KEY": result.api_key.get_secret_value(),
                "ENEO_API_KEY_HEADER_NAME": settings.eneo_api_key_header_name,
            },
        )
        result.actions.append(
            "Skrev ENEO_BACKEND_URL, ENEO_API_KEY och ENEO_API_KEY_HEADER_NAME till "
            f"{args.env_file.resolve()}."
        )
    print(result.summary())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
