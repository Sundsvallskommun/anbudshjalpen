# Common tasks. Run `make help` for a list.
.PHONY: help setup services dev-api dev-web up down migrate seed ingest-lou ingest-styrdokument ingest-ted check check-backend check-frontend test gate image eval

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-16s %s\n", $$1, $$2}'

setup: ## Install backend and frontend dependencies
	cd backend && uv sync
	cd frontend && npm ci

services: ## Start Postgres and Mailpit for local development
	docker compose up -d db mailpit

dev-api: ## Run the API with reload on :8500 (needs `make services`)
	cd backend && uv run anbudsklar serve --reload --port 8500

dev-web: ## Run the Vite dev server on :3502 (proxies /api to :8500)
	cd frontend && npm run dev

up: ## Build and run the whole stack on http://127.0.0.1:3501
	docker compose up --build -d

down: ## Stop the stack
	docker compose down

migrate: ## Apply database migrations
	cd backend && uv run alembic upgrade head

seed: ## Load fictitious demo data, CPV codes and the municipality's steering documents (LOU: make ingest-lou)
	cd backend && uv run anbudsklar seed

ingest-lou: ## Fetch LOU from Riksdagen's open data (needs internet)
	cd backend && uv run anbudsklar ingest lou

ingest-styrdokument: ## Load the municipality's steering documents from data/styrdokument
	cd backend && uv run anbudsklar ingest styrdokument

ingest-ted: ## Fetch Sundsvall notices from TED (needs internet)
	cd backend && uv run anbudsklar ingest ted

check: check-backend check-frontend ## Lint, type-check and test everything

check-backend: ## Backend: ruff (also data/), pyright, pytest (needs `make services`)
	cd backend && uv run ruff check . && uv run ruff format --check . \
		&& uv run ruff check --config pyproject.toml ../data && uv run ruff format --config pyproject.toml --check ../data \
		&& uv run pyright && uv run pytest -q

check-frontend: ## Frontend: types, unit tests, theme freshness, build
	cd frontend && npm run typecheck && npm run test && npm run theme:check && npm run build

gate: ## Accessibility gate (Playwright + axe) against the running stack
	cd frontend && npm run gate

image: ## Build the container image
	docker build -t anbudsklar:dev .

eval: ## Quality test of tolka_underlag with the configured engine
	cd backend && uv run anbudsklar eval
