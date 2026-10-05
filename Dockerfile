# syntax=docker/dockerfile:1
# One image for the app (API + MCP + built SPA) and the worker.
# Same runtime shape as Eneo modules: container port 3001, /health, non-root user.

FROM node:22-bookworm-slim AS web
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS py
COPY --from=ghcr.io/astral-sh/uv:0.9.17 /uv /bin/uv
WORKDIR /build/backend
ENV UV_PROJECT_ENVIRONMENT=/opt/venv UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.12-slim AS runtime
RUN groupadd --system app && useradd --system --gid app --home-dir /app app \
    && mkdir -p /data/documents /app/var && chown -R app:app /data /app
COPY --from=py /opt/venv /opt/venv
COPY --from=py --chown=app:app /build/backend/alembic /app/alembic
COPY --from=py --chown=app:app /build/backend/alembic.ini /app/alembic.ini
COPY --chown=app:app data /app/data
COPY --from=web --chown=app:app /build/frontend/dist /app/frontend/dist
WORKDIR /app
ENV PATH=/opt/venv/bin:$PATH \
    FRONTEND_DIST=/app/frontend/dist \
    DATA_DIR=/app/data \
    DOCUMENTS_DIR=/data/documents \
    ENEO_ASSISTANTS_FILE=/app/var/eneo-assistants.json \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
USER app
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3001/health', timeout=3)"
CMD ["anbudsklar", "serve", "--host", "0.0.0.0", "--port", "3001"]
