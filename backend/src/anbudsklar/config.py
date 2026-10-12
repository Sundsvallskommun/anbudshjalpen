"""Application settings, validated at start-up (pydantic-settings).

All configuration comes from environment variables (see `.env.example`). Nothing here
has a production-grade default for secrets: the PoC refuses to start with the
placeholder session secret outside development.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

EngineName = Literal["eneo", "openai", "heuristic"]

_DEV_SESSION_SECRET = "dev-only-change-me-dev-only-change-me"  # noqa: S105 - refused outside development
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    # The repo-root .env is read whatever the working directory; a local .env overrides it.
    # Empty values (e.g. "ENEO_API_KEY=" in .env.example) count as unset.
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", ".env"),
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )

    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"

    # --- Database and storage
    database_url: str = "postgresql+asyncpg://anbudsklar:anbudsklar@localhost:55432/anbudsklar"
    documents_dir: Path = REPO_ROOT / "var" / "documents"
    data_dir: Path = Field(
        default=REPO_ROOT / "data",
        description="CPV list and fictitious fixtures (repo data/ in development, /app/data in the image).",
    )

    # --- Web
    public_url: str = "http://127.0.0.1:3502"  # origin the browser uses; same-origin checks compare with it
    session_secret: SecretStr = SecretStr(_DEV_SESSION_SECRET)
    cookie_secure: bool = False
    frontend_dist: Path | None = Field(
        default=None, description="Built SPA to serve; unset in development (Vite serves it)."
    )
    demo_buyer_enabled: bool | None = Field(
        default=None,
        description=(
            "Offer the buyer persona (inköpare), who publishes checklists to companies and Eneo. "
            "Unset: on everywhere except ENVIRONMENT=production (decision 0007)."
        ),
    )

    # --- AI engine
    ai_engine: EngineName = "heuristic"
    ai_max_retries: int = Field(default=2, ge=0, le=5)
    ai_timeout_seconds: float = 180.0

    # Eneo (AI engine via Eneo's API; see docs/eneo-integration.md)
    eneo_backend_url: str | None = None  # e.g. https://eneo-test.example.se (same name as Eneo modules)
    eneo_api_key: SecretStr | None = None  # service-owned sk_ key, admin on the Anbudshjälpen space
    eneo_api_key_header_name: str = "X-API-Key"
    eneo_assistants_file: Path = REPO_ROOT / "var" / "eneo-assistants.json"  # written by `eneo provision`

    # OpenAI-compatible endpoint (direct fallback adapter)
    openai_base_url: str | None = None
    openai_api_key: SecretStr | None = None
    openai_model: str | None = None

    # --- MCP server (read-only tools for Eneo assistants)
    mcp_enabled: bool = True
    mcp_api_keys: list[SecretStr] = Field(
        default_factory=list, description="Accepted keys (Bearer or X-Api-Key); several allow rotation."
    )
    mcp_allowed_hosts: list[str] = Field(
        default_factory=list,
        description="Extra Host headers accepted by the MCP endpoint (DNS-rebinding protection).",
    )
    mcp_max_output_chars: int = Field(
        default=16_000, description="Eneo truncates tool output at 32 768 chars; stay well below."
    )

    # --- Ingestion
    ted_api_url: str = "https://api.ted.europa.eu/v3/notices/search"
    ted_buyer_names: list[str] = Field(default_factory=lambda: ["Sundsvalls kommun"])
    eavrop_base_url: str = "https://www.e-avrop.com/sundsvall"
    # e-Avrop's Projekt API (decision 0009). The token reads everything in the client's
    # projects, secret parts included, so only the worker's allowlisted ingestion uses it.
    eavrop_api_url: str = "https://www.e-avrop.com/api"
    eavrop_api_token: SecretStr | None = None
    eavrop_client_id: int | None = None
    riksdagen_lou_url: str = "https://data.riksdagen.se/dokument/sfs-2016-1145.text"
    http_user_agent: str = (
        "Anbudshjalpen-PoC/0.1 (Sundsvalls kommun; kontakt via naringslivsenheten)"  # ASCII only
    )
    scheduler_enabled: bool = True
    # False hides the fictitious fixtures (notices, documents, agreements) from every read.
    show_fictitious: bool = True
    # The access code that gates the whole service (decision 0010); unset leaves it open.
    access_code: SecretStr | None = None
    # Lab mode (decision 0010): behind the code, visitors create their own company on the
    # login page. Such companies are deleted after the retention period.
    lab_enabled: bool = False
    lab_retention_days: int = Field(default=30, ge=1, le=365)

    # --- E-mail (Mailpit in development)
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    mail_from: str = "Anbudshjälpen <noreply@anbudsklar.local>"

    # --- Organisation branding (same idea as Eneo modules)
    organization_name: str = "Sundsvalls kommun"
    organization_logo: str | None = None
    organization_logo_dark: str | None = None
    show_organization: bool = True

    @model_validator(mode="after")
    def _check(self) -> Settings:
        if self.environment == "production" and self.session_secret.get_secret_value() == _DEV_SESSION_SECRET:
            raise ValueError("SESSION_SECRET must be set outside development")
        if self.ai_engine == "eneo" and not (self.eneo_backend_url and self.eneo_api_key):
            raise ValueError("AI_ENGINE=eneo requires ENEO_BACKEND_URL and ENEO_API_KEY")
        if self.ai_engine == "openai" and not (
            self.openai_base_url and self.openai_api_key and self.openai_model
        ):
            raise ValueError("AI_ENGINE=openai requires OPENAI_BASE_URL, OPENAI_API_KEY and OPENAI_MODEL")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
