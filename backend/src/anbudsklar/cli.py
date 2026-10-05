"""Command line: `anbudsklar <command>`. Output is Swedish because operators read it."""

from __future__ import annotations

import asyncio
import logging.config
import uuid
from collections.abc import Awaitable, Callable, Mapping
from pathlib import Path
from typing import Annotated, Any

import typer
import uvicorn
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import get_settings
from anbudsklar.db import get_engine, session_scope
from anbudsklar.ingest import load_agreements, load_cpv
from anbudsklar.models import JobRun
from anbudsklar.services.checklists import interpret_notice
from anbudsklar.services.jobs import (
    FAILED,
    JobContext,
    JobFunction,
    agreements_csv_path,
    cpv_csv_path,
    open_job_context,
    run_job,
)

PACKAGE_DIR = Path(__file__).resolve().parent
# Connections and requests the app serves at once before answering 503 (memory bound).
LIMIT_CONCURRENCY = 200

app = typer.Typer(
    help="Anbudsklar PoC: AI-stöd för småföretag i kommunens upphandlingar.", no_args_is_help=True
)
ingest_app = typer.Typer(help="Hämta data från offentliga källor och filer.", no_args_is_help=True)
eneo_app = typer.Typer(help="Koppla Anbudsklar till en Eneo-instans.", no_args_is_help=True)
app.add_typer(ingest_app, name="ingest")
app.add_typer(eneo_app, name="eneo")


def logging_config(level: str) -> dict[str, Any]:
    """Plain stderr logging. httpx logs full URLs at INFO, so it is kept at WARNING."""

    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {"default": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"}},
        "handlers": {
            "default": {
                "class": "logging.StreamHandler",
                "formatter": "default",
                "stream": "ext://sys.stderr",
            }
        },
        "root": {"level": level.upper(), "handlers": ["default"]},
        "loggers": {
            "httpx": {"level": "WARNING"},
            "httpcore": {"level": "WARNING"},
            "apscheduler": {"level": "WARNING"},
        },
    }


@app.callback()
def main() -> None:
    logging.config.dictConfig(logging_config(get_settings().log_level))


# --- Database -----------------------------------------------------------------------


@app.command()
def migrate() -> None:
    """Uppgradera databasen till senaste schemat (Alembic)."""

    from alembic import command
    from alembic.config import Config

    command.upgrade(Config(str(_alembic_ini())), "head")
    typer.echo("Databasen är uppdaterad.")


@app.command()
def seed() -> None:
    """Lägg in fiktiva demodata: upphandlingar, underlag, företag, personer och avtal."""

    from anbudsklar.seed import load_demo_data

    async def load() -> Mapping[str, int]:
        async with session_scope() as session:
            return await load_demo_data(session)

    _print_stats("Demodata inlagda", _run(load))


# --- Jobs ---------------------------------------------------------------------------


@ingest_app.command("ted")
def ingest_ted() -> None:
    """Hämta annonser från TED (EU:s annonsdatabas)."""

    _run_job("ingest_ted")


@ingest_app.command("eavrop")
def ingest_eavrop() -> None:
    """Hämta annonserade och planerade upphandlingar från e-Avrop."""

    _run_job("ingest_eavrop")


@ingest_app.command("lou")
def ingest_lou() -> None:
    """Hämta LOU (SFS 2016:1145) från Riksdagens öppna data."""

    _run_job("ingest_lou")


@ingest_app.command("cpv")
def ingest_cpv(
    path: Annotated[Path | None, typer.Option(help="CSV-fil; standard är data/cpv/cpv_2008_sv.csv")] = None,
) -> None:
    """Läs in CPV-koderna med svenska benämningar."""

    async def load(session: AsyncSession, context: JobContext) -> Mapping[str, int]:
        return {"loaded": await load_cpv(session, path or cpv_csv_path(context.settings))}

    _run_job("load_cpv", load)


@ingest_app.command("agreements")
def ingest_agreements(
    path: Annotated[
        Path | None, typer.Option(help="CSV-fil; standard är data/fixtures/agreements.csv")
    ] = None,
) -> None:
    """Läs in avtalskatalogen från en CSV-fil."""

    async def load(session: AsyncSession, context: JobContext) -> Mapping[str, int]:
        return {"loaded": await load_agreements(session, path or agreements_csv_path(context.settings))}

    _run_job("load_agreements", load)


@app.command()
def interpret(
    notice: Annotated[uuid.UUID | None, typer.Option(help="Tolka alla dokument i en upphandling")] = None,
    pending: Annotated[bool, typer.Option(help="Tolka dokument som saknar checklista")] = False,
) -> None:
    """Tolka förfrågningsunderlag till checklistor (utkast som inköp granskar)."""

    if (notice is None) == (not pending):
        raise typer.BadParameter("Ange antingen --notice <id> eller --pending.")
    if notice is None:
        _run_job("interpret_pending")
        return

    async def interpret_one(session: AsyncSession, context: JobContext) -> Mapping[str, int]:
        return {"interpreted": len(await interpret_notice(session, context.engine, notice))}

    _run_job("interpret_notice", interpret_one)


@app.command()
def match() -> None:
    """Bedöm vilka upphandlingar som passar vilka företag."""

    _run_job("match_all")


# --- Quality test and Eneo ----------------------------------------------------------


# Both tools own their arguments (argparse); the commands hand everything through,
# including --help, so the two stay in step.
PASS_THROUGH = {"allow_extra_args": True, "ignore_unknown_options": True, "help_option_names": []}


@app.command("eval", context_settings=PASS_THROUGH)
def eval_command(ctx: typer.Context) -> None:
    """Kvalitetstest av tolka_underlag mot facit (--engine, --fixtures, --out). Rapporter i reports/."""

    from anbudsklar.eval import main as run_eval_cli

    raise typer.Exit(code=run_eval_cli(ctx.args))


@eneo_app.command("provision", context_settings=PASS_THROUGH)
def eneo_provision(ctx: typer.Context) -> None:
    """Skapa eller uppdatera space, assistenter, MCP-koppling och környckel i Eneo. Går att köra igen."""

    from anbudsklar.ai.eneo_provision import main as run_provision_cli

    raise typer.Exit(code=run_provision_cli(ctx.args))


# --- Processes ----------------------------------------------------------------------


@app.command()
def serve(
    host: Annotated[str, typer.Option(help="Adress att lyssna på")] = "127.0.0.1",
    port: Annotated[int, typer.Option(help="Port")] = 3001,
    reload: Annotated[bool, typer.Option(help="Starta om vid kodändringar (utveckling)")] = False,
) -> None:
    """Kör webbappen: API, MCP och det byggda gränssnittet.

    Alltid en process: inloggningar och gränserna för antal anrop lever i processens
    minne. Ingen åtkomstlogg, så att inga adresser med parametrar hamnar i loggen.
    Besökarens adress tas från X-Forwarded-For: porten nås bara genom den omvända
    proxyn (Traefik i Dokploy, Dockers port på 127.0.0.1 lokalt), som sätter huvudet.
    """

    uvicorn.run(
        "anbudsklar.api.app:create_app",
        factory=True,
        host=host,
        port=port,
        workers=1,
        proxy_headers=True,
        forwarded_allow_ips="*",
        limit_concurrency=LIMIT_CONCURRENCY,
        access_log=False,
        reload=reload,
        reload_dirs=[str(PACKAGE_DIR)] if reload else None,
        log_config=logging_config(get_settings().log_level),
    )


@app.command()
def worker() -> None:
    """Kör schemalagda jobb: insamling, tolkning, matchning, påminnelser och träffar."""

    from anbudsklar.worker.main import run_worker

    _run(lambda: run_worker(get_settings()))


# --- Helpers ------------------------------------------------------------------------


def _run[T](main: Callable[[], Awaitable[T]]) -> T:
    """Run async work and close database connections before the event loop ends."""

    async def wrapper() -> T:
        try:
            return await main()
        finally:
            await get_engine().dispose()

    return asyncio.run(wrapper())


def _run_job(job: str, function: JobFunction | None = None) -> None:
    async def execute() -> JobRun | None:
        async with open_job_context(get_settings()) as context:
            run_id = await run_job(session_scope, job, context, function)
        async with session_scope() as session:
            return await session.get(JobRun, run_id)

    run = _run(execute)
    if run is None:
        raise typer.Exit(code=1)
    if run.status == FAILED:
        typer.echo(f"{job} misslyckades: {run.error}", err=True)
        raise typer.Exit(code=1)
    _print_stats(f"{job} klart", run.stats)


def _print_stats(title: str, stats: Mapping[str, object]) -> None:
    details = ", ".join(f"{key}: {value}" for key, value in stats.items())
    typer.echo(f"{title}. {details}" if details else f"{title}.")


def _alembic_ini() -> Path:
    """alembic.ini sits in the working directory in the image and in backend/ in development."""

    for candidate in (Path.cwd() / "alembic.ini", PACKAGE_DIR.parents[1] / "alembic.ini"):
        if candidate.is_file():
            return candidate
    typer.echo("Hittar inte alembic.ini. Kör kommandot från backend/ eller /app.", err=True)
    raise typer.Exit(code=1)
