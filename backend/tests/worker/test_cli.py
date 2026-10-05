"""The command line: commands exist, arguments are checked, serve uses the fixed runtime shape."""

from __future__ import annotations

import logging.config
from typing import Any

import pytest
from typer.testing import CliRunner

from anbudsklar import cli

runner = CliRunner()


@pytest.fixture(autouse=True)
def keep_test_logging(monkeypatch: pytest.MonkeyPatch) -> None:
    """The CLI configures logging for the whole process; tests keep pytest's handlers."""

    monkeypatch.setattr(logging.config, "dictConfig", lambda config: None)


def test_all_commands_are_available() -> None:
    result = runner.invoke(cli.app, ["--help"])
    assert result.exit_code == 0
    for command in ("migrate", "seed", "ingest", "interpret", "match", "eval", "eneo", "serve", "worker"):
        assert command in result.output
    ingest = runner.invoke(cli.app, ["ingest", "--help"])
    for source in ("ted", "eavrop", "lou", "cpv", "agreements"):
        assert source in ingest.output
    assert "provision" in runner.invoke(cli.app, ["eneo", "--help"]).output


def test_interpret_needs_exactly_one_target() -> None:
    assert runner.invoke(cli.app, ["interpret"]).exit_code != 0
    both = runner.invoke(
        cli.app, ["interpret", "--pending", "--notice", "8f1c2d4e-0000-4000-8000-000000000000"]
    )
    assert both.exit_code != 0


def test_serve_runs_one_worker_without_access_log(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, dict[str, Any]]] = []
    monkeypatch.setattr(cli.uvicorn, "run", lambda target, **options: calls.append((target, options)))
    result = runner.invoke(cli.app, ["serve", "--port", "8500", "--reload"])
    assert result.exit_code == 0, result.output
    [(target, options)] = calls
    assert target == "anbudsklar.api.app:create_app"
    assert options["factory"] is True
    assert options["workers"] == 1
    assert options["access_log"] is False
    assert options["proxy_headers"] is True  # rate limits key on the visitor behind Traefik
    assert options["limit_concurrency"] == cli.LIMIT_CONCURRENCY
    assert options["reload"] is True
    assert options["port"] == 8500
    assert options["log_config"]["loggers"]["httpx"]["level"] == "WARNING"


def test_logging_keeps_url_logging_libraries_quiet() -> None:
    config = cli.logging_config("info")
    assert config["root"]["level"] == "INFO"
    assert config["loggers"]["httpcore"]["level"] == "WARNING"
