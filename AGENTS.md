# Agent instructions: anbudshjalpen

Anbudshjälpen is an AI procurement coach for small businesses, built with Sundsvalls kommun's business-development
unit (näringslivsenheten) and procurement department (inköp). It was called Anbudsklar until decision 0015. The
repository is `anbudshjalpen` (decision 0016), but the other technical names keep the old name: the Python package and
CLI `anbudsklar`, the Compose services, and the Eneo space "Anbudsklar (PoC)" with its MCP server `anbudsklar_poc`. The
repository holds a proof of concept (PoC) under construction: a FastAPI backend with a read-only MCP server, a Vite +
React + Astryx SPA, and an Eneo test instance as the AI engine.

Documentation for people is Swedish and lives in `docs/` (start at `docs/README.md`). This file, `CLAUDE.md`, code and
code comments are English. User-facing text is Swedish.

## How to work here

1. Read `docs/README.md` and the decision log in `docs/decisions/README.md` before proposing a change of direction.
   Do not contradict an accepted decision; write a new decision record that supersedes it instead.
2. Facts about Eneo in `docs/eneo-building-blocks.md` and `docs/eneo-integration.md` are dated. Re-verify them against
   the Eneo repository (`eneo-ai/eneo`) before you rely on them.
3. Doc pages start with three lines: `Syfte:`, `Läs detta när:` and `Hör ihop med:`. Keep that form, and add new pages
   to the table in `docs/README.md`.
4. If a change alters something a doc page states, change that page in the same commit. When an open question is
   settled, record it as a decision and remove it from `docs/open-questions.md`.

## Stack

| Part | Choice |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 async with asyncpg, Alembic, pydantic v2 and pydantic-settings, httpx, APScheduler, uv |
| MCP | `mcp>=1.30,<2` (`mcp.server.fastmcp.FastMCP`, the same major version as Eneo), stateless streamable HTTP on `/mcp` |
| Database | PostgreSQL 16 (`pgvector/pgvector:pg16` image), full-text search with the `swedish` configuration and `pg_trgm` |
| Frontend | Vite 8, React 19, TypeScript 7, Astryx 0.6.3 (exact pin) with the Eneo theme, React Router 8 in library mode, TanStack Query, Vitest, Playwright with axe |
| AI | `AiEngine` with three implementations chosen by `AI_ENGINE`: `eneo` (Eneo assistants over HTTP), `openai` (OpenAI-compatible endpoint) and `heuristic` (offline, no model) |
| Runtime | One image for app and worker, container port 3001, `/health`; Compose locally and on Dokploy |

## Where things live

| Path | What |
|---|---|
| `backend/src/anbudsklar/contracts/` | AI task inputs and output contracts (Pydantic) |
| `backend/src/anbudsklar/ai/` | Engine interface, engines, prompts (`prompts/<task>.md`), Eneo provisioning |
| `backend/src/anbudsklar/documents/` | Text extraction per page, sections, storage, citation verification |
| `backend/src/anbudsklar/cpv.py` | The CPV hierarchy (pure functions) shared by search, matching and the engines; `ai/` never imports `services/` |
| `backend/src/anbudsklar/search/` | Every read query used by the API and the MCP tools |
| `backend/src/anbudsklar/ingest/` | TED, e-Avrop, LOU, CPV and agreement ingestion |
| `backend/src/anbudsklar/services/` | Domain logic behind the API and the jobs |
| `backend/src/anbudsklar/api/` | FastAPI app and routes; `schemas.py` is the REST contract mirrored in `frontend/src/api/types.ts` |
| `backend/src/anbudsklar/mcp/` | MCP server |
| `backend/src/anbudsklar/worker/` | Scheduler and e-mail |
| `backend/src/anbudsklar/eval/` | Quality test for `tolka_underlag` |
| `backend/src/anbudsklar/config.py` | All settings; every variable is listed in `docs/operations.md` |
| `backend/alembic/` | Migrations |
| `backend/tests/` | Tests; recorded HTTP samples in `backend/tests/data/<area>/` |
| `frontend/` | The SPA; UI rules in `frontend/AGENTS.md` |
| `data/` | CPV list and fictitious fixtures |
| `deploy/dokploy/` | Compose files and env templates for Dokploy |
| `.github/workflows/ci.yml` | CI |
| `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md` | Issue forms and the pull request template (Swedish) |
| `docs/CONTRIBUTING.md`, `docs/SECURITY.md` | How to contribute, and how to report a vulnerability (security@sundsvall.se) |
| `LICENSE` | GNU AGPL v3, as Eneo (decision 0008) |

## Checks

Run from the repository root unless stated otherwise.

| Command | What it runs |
|---|---|
| `make services` | Postgres (host port 55432) and Mailpit (8025, 1025); backend tests need it |
| `make check-backend` | `cd backend && uv run ruff check . && uv run ruff format --check .`, the same two for `../data` with `--config pyproject.toml`, then `uv run pyright && uv run pytest -q` |
| `make check-frontend` | `cd frontend && npm run typecheck && npm run test && npm run theme:check && npm run build` |
| `make check` | Both of the above |
| `make gate` | Playwright and axe against a running stack (not run in CI) |
| `docker compose --env-file .env.example config -q` | Compose validation (CI also validates `deploy/dokploy/`) |

Ports: API 8500 and Vite 3502 in development, the Compose app on 3501. Eneo's own dev setup uses 3000, 8123 and 5432.

Tests never use the internet. Mock HTTP with respx and store recorded samples under `backend/tests/data/<area>/`.
Each test session creates its own database (`backend/tests/conftest.py`); use the `db_session` fixture.

## Product rules

- Only public sources and the company's own data. Never add real tender drafts, personal data or confidential contract
  prices to the repository; fixtures are fictitious and marked as such. Do not store contact persons from notices.
- Every claim the coach shows a user must be traceable to a source (document and page, or law chapter and section).
  Our code verifies citations; a model never sets the verification fields (`check`, `found_page`, `draft_check`).
- The AI engine is an Eneo test instance over its HTTP API, behind `AiEngine`, with `openai` and `heuristic` as
  fallbacks (decision 0004). Send documents as text with `[SIDA n]` markers, delete Eneo sessions after each call,
  and keep each task's inputs and JSON contract shaped like an Eneo Flow step.
- Core tasks get the whole document in one call: no RAG and no vector store. Search is Postgres full-text and
  trigram; add pgvector only if the quality test shows the need (decision 0005).
- The MCP server is read-only and exposes public data only: never company profiles, questions, matches or drafts, and
  checklists only once published. Serve `/mcp` and `/mcp/` without redirects. Change tool schemas additively, because
  Eneo needs a re-sync and approval for every change.
- Tender drafts are processed in memory and never stored.
- PoC login is a persona picker (decision 0007). Never build real authentication into the PoC or let it hold real
  company data. The one exception is lab mode (decision 0010): behind `ACCESS_CODE`, which gates the whole service,
  a workshop participant creates a company with only a name and their own description, no personal data, purged
  after `LAB_RETENTION_DAYS`. With `ENVIRONMENT=production` the buyer persona is hidden and refused unless `DEMO_BUYER_ENABLED=true`
  (only behind basic auth or an IP allowlist), because buyer approval gates what companies and Eneo's assistants read
  as reviewed by inköp. Inköp can turn the review off on the settings page (decision 0011); a checklist published
  that way carries `reviewed=false`, and the UI must never call it reviewed.
- Equal treatment: the coach never gives one supplier advice that goes beyond the procurement documents; open
  questions go to the formal question function in e-Avrop.
- The UI is React with Astryx (decision 0002), built with Vite and served by FastAPI (decision 0006).

## Code rules

- Type-annotate everything, keep functions small, and write docstrings that say why, not what.
- Read configuration only through `anbudsklar.config.Settings`. A new variable gets a row in `docs/operations.md` and,
  if operators set it, a line in `.env.example` and `deploy/dokploy/anbudsklar.env.example`, plus an entry in the
  `x-anbudsklar-env` block of `deploy/dokploy/docker-compose.anbudsklar.yml`, which passes on only the variables it
  names.
- Every model change gets an Alembic migration.
- Never commit secrets. `.env` files are ignored by git.

## Commits

- Do not add `Co-Authored-By` trailers.
