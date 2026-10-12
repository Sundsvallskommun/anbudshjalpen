"""Notices and their published documents from e-Avrop's Projekt API (decision 0009).

The API is the buyer's own: the municipality's token reads every procurement project of the
client, including what must never leave e-Avrop. That covers who tendered and at what price, the
evaluation, the project's working files, unannounced projects and the staff on them. This
module therefore reads by allowlist:

- only projects with the event `Announced` and a request (`RequestForTender` or, in the first
  stage of a two-step procedure, `RequestForApplications`) that has an `AnnouncementDate`.
  An invitation sent only to chosen suppliers is not public and is skipped;
- only the fields in `PublicProcurement`. The response is never stored as a whole, and
  `Suppliers`, `Members`, `AgreementOwner`, `QualityResponsible`, `Reports`, `LogFiles`,
  `Assignment` and the project's own `Documents` are never read. `IsClassified` on the
  project's documents cannot be trusted: evaluation protocols and credit checks of tenderers
  carry False;
- only documents attached to the public request, and only from the announcement-document
  address. A document address outside it is skipped;
- of the announcement's log files only the question log, by exact filename, for the
  questions suppliers asked and the answers the buyer published (decision 0013, see
  `anbudsklar.ingest.eavrop_qa`). The log files next to it hold who asked and are never read.

A procurement that e-Avrop also sent to TED is the same procurement: its documents are added
to the TED notice instead of creating a second notice. The other way round, the TED job does
not create a notice for a procurement already stored from e-Avrop.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from pathlib import PurePosixPath
from typing import Any, Literal

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import Settings
from anbudsklar.documents.extract import DocumentError
from anbudsklar.documents.store import safe_filename, store_document
from anbudsklar.ingest.common import IngestError, IngestStats
from anbudsklar.ingest.eavrop_qa import (
    MAX_LOG_BYTES,
    decode_log,
    parse_question_log,
    question_log_url,
    sync_published_answers,
)
from anbudsklar.ingest.http import ensure_ok, send
from anbudsklar.ingest.notices import (
    STOCKHOLM,
    NoticeStatus,
    NoticeValues,
    eavrop_procurement_id,
    notices_by_external_id,
    save_notice,
    start_of_day,
    status_from_deadline,
    unique,
)
from anbudsklar.ingest.ted import LOOKBACK_MONTHS, months_before
from anbudsklar.models import Document, Notice

log = logging.getLogger(__name__)

SOURCE = "eavrop"
# Pause between calls: about 300 projects a run, which a buyer's API handles without strain.
REQUEST_INTERVAL_SECONDS = 0.5
MAX_DOCUMENT_BYTES = 50 * 1024 * 1024
# Formats the document extraction reads; other files (xlsx, images, video) are not fetched.
SUPPORTED_SUFFIXES = frozenset({".pdf", ".docx", ".txt", ".md"})
# The only API paths a token is sent to, below `EAVROP_API_URL`.
DETAIL_PATHS = ("/v1/procurements/", "/v1/simple-procurements/")
DOCUMENT_PATH = "/v1/announcement-documents/"
# Words that mark the document a supplier reads first. The first word that matches any file
# wins, and a PDF beats a Word file with the same words. A notice with a single readable file
# has that as its main document. Otherwise, without a match, nothing is interpreted on its
# own: a wrong guess costs a model call and a draft for inköp to reject.
MAIN_DOCUMENT_WORDS = (
    "administrativa föreskrifter",
    "upphandlingsföreskrifter",
    "förfrågningsunderlag",
    "upphandlingsdokument",
    "anbudsförfrågan",
    "förfrågan",
    "inbjudan",
    "krav på leverantör",
    "kravspecifikation",
)
# How far before the last successful run a project's change is still fetched again, for
# clocks that differ and changes made while that run was going.
CHANGE_MARGIN = timedelta(days=1)
AWARDED_EVENTS = frozenset({"Assigned", "ContractAssigned"})

# e-Avrop's procedure types, in LOU's words. The national procedures are those under the
# EU thresholds (19 kap. LOU), which LOU since 2022 no longer calls "förenklat förfarande".
PROCEDURE_LABELS: dict[str, str] = {
    "Open": "Öppet förfarande",
    "Selective": "Selektivt förfarande",
    "Negotiated": "Förhandlat förfarande med föregående annonsering",
    "CompetitiveDialog": "Konkurrenspräglad dialog",
    "InnovationPartnership": "Innovationspartnerskap",
    "NationalOneStep": "Upphandling under tröskelvärdena (19 kap. LOU)",
    "NationalTwoStep": "Upphandling under tröskelvärdena (19 kap. LOU), med ansökan först",
    "Simplified": "Upphandling under tröskelvärdena (19 kap. LOU)",
    "Selection": "Upphandling under tröskelvärdena (19 kap. LOU), med ansökan först",
    "DirectPublic": "Annonserad direktupphandling",
    "NewCompetition": "Förnyad konkurrensutsättning",
    "Lov": "Valfrihetssystem (LOV)",
    "LovAdvanced": "Valfrihetssystem (LOV)",
    "DynamicPurchasingSystem": "Dynamiskt inköpssystem",
}

Stage = Literal["tender", "application"]


@dataclass(frozen=True)
class PublicDocument:
    filename: str
    url: str
    updated: datetime | None


@dataclass(frozen=True)
class PublicProcurement:
    """Everything this module reads from a project. Nothing else leaves the response."""

    procurement_id: str
    title: str
    description: str | None
    diary_number: str | None
    cpv_codes: tuple[str, ...]
    procedure_type: str | None
    events: tuple[str, ...]
    stage: Stage
    announced_at: datetime
    request_updated: datetime | None
    deadline: datetime | None
    question_deadline: datetime | None
    documents: tuple[PublicDocument, ...]


# --- Reading a project ------------------------------------------------------------------


def parse_moment(value: Any) -> datetime | None:
    """A moment from the API, in Stockholm time when the API gives no offset."""

    if not isinstance(value, str) or not value:
        return None
    try:
        moment = datetime.fromisoformat(value)
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=STOCKHOLM)
    return moment


def parse_deadline(value: Any) -> datetime | None:
    """A deadline from the time table. Midnight means the end of that same day.

    The time table holds dates as midnight at the start of the last day: `LastBid`
    "2026-11-06T00:00:00+01:00" is shown as tender deadline 2026-11-06 on e-Avrop's notice
    page (checked 2026-10-12). Read as a moment it would end the day before, so it is stored
    as 23:59:59 on that day, as `anbudsklar.ingest.ted.parse_deadline` stores TED's dates.
    The end of the day takes Stockholm's offset at that hour, not midnight's: on the day
    summer time ends the two differ.
    """

    moment = parse_moment(value)
    if moment is not None and moment.time() == time.min:
        moment = datetime.combine(moment.date(), time(23, 59, 59), STOCKHOLM)
    return moment


def _text(value: Any) -> str | None:
    return (value.strip() or None) if isinstance(value, str) else None


def _public_request(detail: Mapping[str, Any]) -> tuple[Stage, Mapping[str, Any]] | None:
    """The request suppliers can read: the tender request, or the first stage's request."""

    stages: tuple[tuple[Stage, str], ...] = (
        ("tender", "RequestForTender"),
        ("application", "RequestForApplications"),
    )
    for stage, key in stages:
        request = detail.get(key)
        if isinstance(request, Mapping) and request.get("AnnouncementDate"):
            return stage, request
    return None


def _public_documents(request: Mapping[str, Any], api_url: str) -> tuple[PublicDocument, ...]:
    documents = []
    for item in request.get("Documents") or []:
        if not isinstance(item, Mapping):
            continue
        filename, url = _text(item.get("Filename")), _text(item.get("Url"))
        if filename is None or url is None or not _is_document_url(url, api_url):
            log.warning("e-Avrop: skipped a document outside the announcement-document address")
            continue
        documents.append(PublicDocument(filename, url, parse_moment(item.get("UpdatedDate"))))
    return tuple(documents)


def public_procurement(detail: Mapping[str, Any], api_url: str) -> PublicProcurement | None:
    """The public part of an announced project, or None when nothing of it is public."""

    events = tuple(str(item.get("Event")) for item in detail.get("Events") or [] if isinstance(item, Mapping))
    title = _text(detail.get("Title"))
    procurement_id = detail.get("ProcurementId")
    if "Announced" not in events or title is None or not isinstance(procurement_id, int):
        return None
    public = _public_request(detail)
    if public is None:
        return None
    stage, request = public
    announced_at = parse_moment(request.get("AnnouncementDate"))
    if announced_at is None:
        return None
    raw_time_table = detail.get("TimeTable")
    time_table: Mapping[str, Any] = raw_time_table if isinstance(raw_time_table, Mapping) else {}
    deadline_key, question_key = (
        ("LastApplication", "LastQuestionApplication")
        if stage == "application"
        else ("LastBid", "LastQuestion")
    )
    return PublicProcurement(
        procurement_id=str(procurement_id),
        title=title,
        description=_text(detail.get("Description")),
        diary_number=_text(detail.get("DiaryNumber")),
        cpv_codes=tuple(
            unique(
                str(item.get("Code") or "")[:8]
                for item in detail.get("CpvCodes") or []
                if isinstance(item, Mapping)
            )
        ),
        procedure_type=_text(detail.get("ProcurementType")),
        events=events,
        stage=stage,
        announced_at=announced_at,
        request_updated=parse_moment(request.get("UpdatedDate")),
        deadline=parse_deadline(time_table.get(deadline_key)),
        question_deadline=parse_deadline(time_table.get(question_key)),
        documents=_public_documents(request, api_url),
    )


def _status(procurement: PublicProcurement, now: datetime) -> NoticeStatus:
    if "Aborted" in procurement.events:
        return "closed"
    if AWARDED_EVENTS.intersection(procurement.events):
        return "awarded"
    return status_from_deadline(procurement.deadline, now)


def notice_url(settings: Settings, procurement_id: str) -> str:
    """The public notice page in e-Avrop, the same link TED gives for the procurement."""

    return f"{settings.eavrop_base_url.rstrip('/')}/e-Upphandling/NoticeLink.aspx?id={procurement_id}"


def _iso(moment: datetime | None) -> str | None:
    return moment.isoformat() if moment else None


def map_procurement(
    procurement: PublicProcurement,
    settings: Settings,
    *,
    now: datetime,
    list_url: str | None = None,
    list_updated: str | None = None,
) -> NoticeValues:
    """The notice columns. `raw` holds only the public facts the columns do not."""

    url = notice_url(settings, procurement.procurement_id)
    return NoticeValues(
        source=SOURCE,
        external_id=procurement.procurement_id,
        title=procurement.title,
        notice_type="contract",
        status=_status(procurement, now),
        raw={
            "procurement_id": procurement.procurement_id,
            "list_url": list_url,
            "list_updated": list_updated,
            "stage": procurement.stage,
            "procedure_type": procurement.procedure_type,
            "events": list(procurement.events),
            "question_deadline": _iso(procurement.question_deadline),
            "request_updated": _iso(procurement.request_updated),
            "documents": [document.filename for document in procurement.documents],
        },
        description=procurement.description,
        # The API names no buyer. The client is the municipality's procurement unit, which
        # also buys for others; TED names those buyers when the procurement is there too.
        buyer=settings.organization_name,
        reference_number=procurement.diary_number,
        cpv_codes=list(procurement.cpv_codes),
        procedure=PROCEDURE_LABELS.get(procurement.procedure_type or ""),
        published_at=procurement.announced_at,
        deadline_at=procurement.deadline,
        # The first stage of a two-step procedure closes with requests to participate, not tenders.
        deadline_kind="request" if procurement.stage == "application" else "tender",
        url=url,
        documents_url=url,
    )


def main_document(documents: Sequence[PublicDocument]) -> str | None:
    """The filename of the document to interpret on its own, if one is clearly the main one."""

    candidates = [
        document.filename for document in documents if _suffix(document.filename) in SUPPORTED_SUFFIXES
    ]
    if len(candidates) == 1:
        return candidates[0]
    for word in MAIN_DOCUMENT_WORDS:
        matches = [name for name in candidates if word in name.lower()]
        if matches:
            return min(matches, key=lambda name: (_suffix(name) != ".pdf", candidates.index(name)))
    return None


def _suffix(filename: str) -> str:
    return PurePosixPath(filename.replace("\\", "/")).suffix.lower()


# --- Fetching ---------------------------------------------------------------------------


@dataclass
class _Api:
    client: httpx.AsyncClient
    settings: Settings
    interval: float
    _last: float | None = None

    @property
    def base(self) -> str:
        return self.settings.eavrop_api_url.rstrip("/")

    def _headers(self) -> dict[str, str]:
        token = self.settings.eavrop_api_token
        assert token is not None
        return {"Accept": "application/json", "Authorization": f"Bearer {token.get_secret_value()}"}

    async def _pace(self) -> None:
        loop = asyncio.get_running_loop()
        if self._last is not None:
            remaining = self.interval - (loop.time() - self._last)
            if remaining > 0:
                await asyncio.sleep(remaining)
        self._last = loop.time()

    async def get(self, url: str, params: Mapping[str, str] | None = None) -> httpx.Response:
        await self._pace()
        response = await send(
            self.client, "GET", url, settings=self.settings, params=params, headers=self._headers()
        )
        if response.status_code in (401, 403):
            raise IngestError("e-Avrop nekade åtkomst. Kontrollera EAVROP_API_TOKEN och EAVROP_CLIENT_ID.")
        return response

    async def download(self, url: str, *, max_bytes: int = MAX_DOCUMENT_BYTES) -> tuple[bytes, str]:
        """The file's bytes and content type, refusing files larger than `max_bytes`."""

        await self._pace()
        request = self.client.build_request("GET", url, headers=self._headers())
        response = await self.client.send(request, stream=True)
        try:
            ensure_ok(response, "e-Avrop")
            chunks, size = [], 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > max_bytes:
                    raise DocumentError(f"Filen är större än {max_bytes // (1024 * 1024)} MB.")
                chunks.append(chunk)
            return b"".join(chunks), response.headers.get("Content-Type", "application/octet-stream")
        finally:
            await response.aclose()


def _is_detail_url(url: str, api_url: str) -> bool:
    base = api_url.rstrip("/")
    return any(url.startswith(f"{base}{path}") for path in DETAIL_PATHS)


def _is_document_url(url: str, api_url: str) -> bool:
    return url.startswith(f"{api_url.rstrip('/')}{DOCUMENT_PATH}")


async def _list(api: _Api, client_id: int, since: datetime) -> list[Mapping[str, Any]]:
    url = f"{api.base}/v1.1/clients/{client_id}/procurements"
    response = ensure_ok(await api.get(url, {"from": since.strftime("%Y-%m-%dT%H:%M:%SZ")}), "e-Avrop")
    items = response.json()
    if not isinstance(items, list):
        raise IngestError("e-Avrop svarade inte med en lista över upphandlingar.")
    return [item for item in items if isinstance(item, Mapping)]


# --- Storing ----------------------------------------------------------------------------


@dataclass
class EavropStats(IngestStats):
    not_public: int = 0  # projects that are not announced, or only sent to invited suppliers
    linked: int = 0  # procurements stored as a TED notice, which got the documents
    documents_stored: int = 0
    documents_skipped: int = 0  # formats we cannot read, too large or unreadable
    # Published questions and answers from the question log (decision 0013).
    answers_inserted: int = 0
    answers_updated: int = 0
    answers_deleted: int = 0
    answers_failed: int = 0  # question logs we could not fetch or read; nothing changed for them

    def as_dict(self) -> dict[str, int]:
        extra = {
            "not_public": self.not_public,
            "linked": self.linked,
            "documents_stored": self.documents_stored,
            "documents_skipped": self.documents_skipped,
            "answers_inserted": self.answers_inserted,
            "answers_updated": self.answers_updated,
            "answers_deleted": self.answers_deleted,
            "answers_failed": self.answers_failed,
        }
        return super().as_dict() | {key: value for key, value in extra.items() if value}


async def _ted_twins(session: AsyncSession) -> dict[str, Notice]:
    """TED notices by the e-Avrop procurement id in their document link."""

    rows = await session.scalars(
        select(Notice).where(Notice.source == "ted", Notice.documents_url.is_not(None))
    )
    twins: dict[str, Notice] = {}
    for notice in rows:
        procurement_id = eavrop_procurement_id(notice.documents_url)
        if procurement_id is not None:
            twins.setdefault(procurement_id, notice)
    return twins


def _needs_download(
    document: PublicDocument, stored: Document | None, request_updated: datetime | None
) -> bool:
    """Whether a file may have changed since we stored it under the same name.

    Most announcement documents have no date of their own, so the request's update time
    stands in for them. A file with unchanged content is not stored again (same sha256).
    """

    if stored is None:
        return True
    changed = document.updated or request_updated
    return changed is not None and changed > stored.created_at


async def _sync_documents(
    session: AsyncSession, api: _Api, notice: Notice, procurement: PublicProcurement, stats: EavropStats
) -> None:
    existing = await session.scalars(
        select(Document).where(Document.notice_id == notice.id).order_by(Document.created_at.desc())
    )
    by_name: dict[str, Document] = {}
    for document in existing:
        by_name.setdefault(document.filename, document)
    main = main_document(procurement.documents)
    # The main document first, so that it is the notice's first document (questions use it).
    ordered = sorted(procurement.documents, key=lambda document: document.filename != main)
    for document in ordered:
        if _suffix(document.filename) not in SUPPORTED_SUFFIXES:
            stats.documents_skipped += 1
            continue
        if not _needs_download(
            document, by_name.get(safe_filename(document.filename)), procurement.request_updated
        ):
            continue
        try:
            data, content_type = await api.download(document.url)
            await store_document(
                session,
                notice_id=notice.id,
                filename=document.filename,
                mimetype=content_type,
                data=data,
                auto_interpret=document.filename == main,
            )
        except DocumentError as error:
            log.warning("e-Avrop document %r for %s skipped: %s", document.filename, notice.id, error)
            stats.documents_skipped += 1
            continue
        stats.documents_stored += 1


async def _sync_answers(
    session: AsyncSession, api: _Api, notice: Notice, detail: Mapping[str, Any], stats: EavropStats
) -> None:
    """Mirror the published questions and answers of an announced project onto its notice.

    The log is small and has no change date of its own, so it is fetched whenever the
    project is read; the sync then changes only what differs. A log that cannot be fetched
    or read leaves the stored answers as they are and is counted, never deleted.
    """

    url = question_log_url(detail, api.settings.eavrop_api_url)
    if url is None:
        return  # nobody has asked a question yet, which is the common case
    try:
        data, _ = await api.download(url, max_bytes=MAX_LOG_BYTES)
        entries = parse_question_log(decode_log(data))
    except (DocumentError, IngestError) as error:
        log.warning("e-Avrop question log for %s skipped: %s", notice.id, error)
        stats.answers_failed += 1
        return
    result = await sync_published_answers(session, notice.id, entries)
    stats.answers_inserted += result.inserted
    stats.answers_updated += result.updated
    stats.answers_deleted += result.deleted


async def _open_eavrop_notices(session: AsyncSession, settings: Settings) -> list[tuple[Notice, str]]:
    """Open notices that live in the municipality's e-Avrop, with their procurement id.

    Our own notices, and TED notices whose document link is the municipality's page in
    e-Avrop (`EAVROP_BASE_URL`). Other buyers announce in e-Avrop too, and TED links to
    their pages the same way, but the key reads only the municipality's projects: asking
    for theirs is refused, so they are not asked for.
    """

    own_pages = settings.eavrop_base_url.rstrip("/") + "/"
    rows = await session.scalars(
        select(Notice).where(
            Notice.status == "open",
            or_(
                Notice.source == SOURCE, (Notice.source == "ted") & Notice.documents_url.like(f"{own_pages}%")
            ),
        )
    )
    found = []
    for notice in rows:
        procurement_id = (
            notice.external_id if notice.source == SOURCE else eavrop_procurement_id(notice.documents_url)
        )
        if procurement_id is not None:
            found.append((notice, procurement_id))
    return found


async def _refresh_open_answers(
    session: AsyncSession, api: _Api, settings: Settings, synced: set[str], stats: EavropStats
) -> None:
    """Read the question log of every open procurement the main loop did not fetch.

    Answering a question does not change the project's `UpdatedDate` in the list (seen on
    2026-10-12: answers two days after the list's date), so the change check that keeps the
    daily run short would miss every new answer. Open procurements are few, and a detail
    call each is cheap next to the documents.

    UNCERTAIN: a TED twin is fetched by procurement id on the documented address
    `/v1/procurements/by-procurement-id/{id}`, which the documentation describes for projects
    only, not for "enskilda annonser" (`SimpleProcurementProject`). A 404 is skipped quietly.
    """

    for notice, procurement_id in await _open_eavrop_notices(session, settings):
        if procurement_id in synced:
            continue
        list_url = notice.raw.get("list_url") if notice.source == SOURCE else None
        url = (
            list_url
            if isinstance(list_url, str) and _is_detail_url(list_url, settings.eavrop_api_url)
            else f"{api.base}/v1/procurements/by-procurement-id/{procurement_id}"
        )
        try:
            response = await api.get(url)
            if response.status_code == 404:
                log.info("e-Avrop: no project found for open notice %s (%s)", notice.id, procurement_id)
                continue
            detail = ensure_ok(response, "e-Avrop").json()
        except IngestError as error:
            # The list call has already shown that the token works, so a refusal here is about
            # this one project (seen 2026-10-12 for a procurement outside the client). One
            # notice without answers must not fail the whole run.
            log.warning("e-Avrop: question log of open notice %s not read: %s", notice.id, error)
            stats.answers_failed += 1
            continue
        # Only an announced project is public; anything else is left alone, answers included.
        if not isinstance(detail, Mapping) or public_procurement(detail, settings.eavrop_api_url) is None:
            continue
        synced.add(procurement_id)
        await _sync_answers(session, api, notice, detail, stats)


async def ingest_eavrop(
    session: AsyncSession,
    client: httpx.AsyncClient,
    settings: Settings,
    *,
    now: datetime | None = None,
    changed_since: datetime | None = None,
    refetch: bool = False,
    request_interval: float = REQUEST_INTERVAL_SECONDS,
) -> dict[str, int]:
    """Upsert the announced procurements of the last 18 months and the open ones' documents.

    `changed_since` is when the last successful run started. A project e-Avrop has not
    changed since then is not fetched again: announcing it, correcting its documents and
    awarding it all change its `UpdatedDate`. About two thirds of the projects are never
    public, and fetching each one takes a few seconds, so this keeps a daily run short.
    Answering a question does not change it, so the open procurements' question logs are
    read on every run regardless (`_refresh_open_answers`).

    `refetch` fetches every project again, stored ones included, so that a change to how
    the ingestion reads a project reaches the notices already stored.

    Without `EAVROP_API_TOKEN` and `EAVROP_CLIENT_ID` the job does nothing: e-Avrop is then
    simply not a source, as in every environment without the municipality's token.
    """

    now = now or datetime.now(UTC)
    stats = EavropStats()
    if settings.eavrop_api_token is None or settings.eavrop_client_id is None:
        log.info("e-Avrop ingestion skipped: EAVROP_API_TOKEN and EAVROP_CLIENT_ID are not set")
        return stats.as_dict() | {"not_configured": 1}

    api = _Api(client, settings, request_interval)
    since = start_of_day(months_before(now.astimezone(STOCKHOLM).date(), LOOKBACK_MONTHS))
    items = await _list(api, settings.eavrop_client_id, since)
    stats.fetched = len(items)
    twins = await _ted_twins(session)
    ours = list(await session.scalars(select(Notice).where(Notice.source == SOURCE)))
    by_procurement = {notice.external_id: notice for notice in ours}
    # The list gives the project's address, whose id is not the procurement id.
    by_list_url = {notice.raw.get("list_url"): notice for notice in ours if notice.raw.get("list_url")}
    # Procurements whose question log this run has read, so the pass below skips them.
    synced_answers: set[str] = set()

    for item in items:
        url = str(item.get("Url") or "")
        if not _is_detail_url(url, settings.eavrop_api_url):
            log.warning("e-Avrop: skipped a list item outside the API's procurement addresses")
            stats.skipped += 1
            continue
        list_updated = _text(item.get("UpdatedDate"))
        known = by_list_url.get(url)
        if not refetch and (
            (known is not None and known.raw.get("list_updated") == list_updated)
            or _unchanged_since(list_updated, changed_since)
        ):
            stats.record("unchanged")  # nothing changed in e-Avrop since the last run
            continue
        response = await api.get(url)
        if response.status_code == 404:
            stats.skipped += 1
            continue
        detail = ensure_ok(response, "e-Avrop").json()
        procurement = (
            public_procurement(detail, settings.eavrop_api_url) if isinstance(detail, Mapping) else None
        )
        if procurement is None:
            stats.not_public += 1
            continue
        notice = await _store_procurement(
            session, procurement, settings, now, url, list_updated, twins, by_procurement, stats
        )
        if _status(procurement, now) == "open":
            await _sync_documents(session, api, notice, procurement, stats)
            await _sync_answers(session, api, notice, detail, stats)
            synced_answers.add(procurement.procurement_id)
    await _refresh_open_answers(session, api, settings, synced_answers, stats)
    await session.flush()
    log.info("e-Avrop ingestion: %s", stats.as_dict())
    return stats.as_dict()


async def _store_procurement(
    session: AsyncSession,
    procurement: PublicProcurement,
    settings: Settings,
    now: datetime,
    list_url: str,
    list_updated: str | None,
    twins: Mapping[str, Notice],
    by_procurement: dict[str, Notice],
    stats: EavropStats,
) -> Notice:
    """The notice the procurement's documents belong to: its TED twin, or our own row."""

    existing = by_procurement.get(procurement.procurement_id)
    twin = twins.get(procurement.procurement_id)
    if existing is None and twin is not None:
        stats.linked += 1
        return twin
    values = map_procurement(procurement, settings, now=now, list_url=list_url, list_updated=list_updated)
    stats.record(save_notice(session, existing, values))
    await session.flush()
    if existing is None:
        existing = (await notices_by_external_id(session, SOURCE, [values.external_id]))[values.external_id]
        by_procurement[values.external_id] = existing
    return existing


def _unchanged_since(list_updated: str | None, changed_since: datetime | None) -> bool:
    updated = parse_moment(list_updated)
    return changed_since is not None and updated is not None and updated < changed_since - CHANGE_MARGIN
