"""Questions and answers from e-Avrop's announcement question log (decision 0013).

e-Avrop's Projekt API has no field for the questions suppliers ask and the answers the buyer
publishes: the documented part stops at the flag `IsQuestionsOnline`. But a project's
`AnnouncementLogFiles` lists the files e-Avrop writes while the buyer handles questions, and
one of them, `LoggfilOrginalFragor.txt`, is the question log: each question as asked, as
published and the buyer's answer, with timestamps and nothing about who asked. Checked
against two notices' public pages in e-Avrop on 2026-10-12: the answered entries are
exactly what the page shows to anyone, and the unanswered ones are not shown there.

The other files in that list (`frågor.txt`, `svar.txt`, `meddelanden.txt`, `Loggfil<datum>.txt`)
are e-mail logs and snapshots with the askers' names, companies and addresses, the recipient
lists and the case officer's address. They are never read: who asks a question during the
tender period is covered by procurement secrecy. The allowlist below is by exact filename on
the log-document address, and the ingestion tests show that nothing else is fetched.

This is not a documented part of the API. The file is a log written for people, so the parser
is deliberately forgiving: an entry it cannot read is dropped and logged, never stored
half-read. What we could not verify is marked UNCERTAIN in the code; it is listed for the
conversation with Antirio in docs/eavrop.md.
"""

from __future__ import annotations

import hashlib
import logging
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal
from urllib.parse import parse_qs, urlsplit

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ingest.common import assign_changed
from anbudsklar.ingest.notices import STOCKHOLM
from anbudsklar.models import PublishedAnswer

log = logging.getLogger(__name__)

SOURCE = "eavrop"
# The one log file we read. The name is e-Avrop's own spelling, misspelling included.
QA_LOG_FILENAME = "LoggfilOrginalFragor.txt"
# Where the log files live below `EAVROP_API_URL`: /v1/announcements/{id}/log-documents?filename=…
LOG_DOCUMENT_PATH = "/v1/announcements/"
LOG_DOCUMENT_SUFFIX = "/log-documents"
# A log of a few questions is a few kilobytes; far more than this is not the file we expect.
MAX_LOG_BYTES = 2 * 1024 * 1024

# One block header per line: the kind, an optional local timestamp and a colon. e-Avrop writes
# "Orginal Fraga 2026-10-05 16:42:46:", "Besvarad Fraga :" (no timestamp until answered),
# "Svar :" and "Meddelande 2026-09-15 10:52:11:". UNCERTAIN: whether "Svar" ever carries a
# timestamp of its own; the pattern allows one so that it would still parse.
_HEADER = re.compile(
    r"^(?P<kind>Orginal Fraga|Besvarad Fraga|Svar|Meddelande)"
    r"(?:\s+(?P<moment>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}))?\s*:\s*$"
)
_BLANK_RUN = re.compile(r"\n{3,}")

Kind = Literal["question", "message"]


@dataclass(frozen=True)
class LoggedEntry:
    """One block of the question log, as parsed."""

    kind: Kind
    # When the question was asked, or the message sent, in e-Avrop's local time.
    asked_at: datetime | None
    # The question as the supplier wrote it. The buyer may edit it before publishing it,
    # so the published wording (`question`) is what suppliers see, and this is the key.
    original: str
    question: str
    answered_at: datetime | None
    answer: str

    @property
    def is_published(self) -> bool:
        """An answered question: what e-Avrop shows on the notice's public page.

        A question without an answer time has not been answered yet, and the page does not
        show it. Messages ("Meddelande") go to the suppliers who registered for the notice;
        UNCERTAIN whether the public page shows them too, so they are kept out for now.
        """

        return self.kind == "question" and self.answered_at is not None and bool(self.answer)


@dataclass(frozen=True)
class AnswerSync:
    inserted: int = 0
    updated: int = 0
    deleted: int = 0


# --- Finding the log ----------------------------------------------------------------


def is_log_document_url(url: str, api_url: str) -> bool:
    """Whether `url` is the question log's address below the API, and nothing else.

    The announcement's other log files share the address and differ only in the `filename`
    parameter, so the parameter is checked, decoded, against the one allowed name.
    """

    base = api_url.rstrip("/")
    if not url.startswith(f"{base}{LOG_DOCUMENT_PATH}"):
        return False
    parts = urlsplit(url)
    if not parts.path.endswith(LOG_DOCUMENT_SUFFIX):
        return False
    return parse_qs(parts.query).get("filename") == [QA_LOG_FILENAME]


def question_log_url(detail: Mapping[str, Any], api_url: str) -> str | None:
    """The question log's address in a project's `AnnouncementLogFiles`, if it has one.

    A project gets the file when its first question arrives, so None is the normal case for
    a notice nobody has asked about. Every other file in the list is left alone on purpose.
    """

    for item in detail.get("AnnouncementLogFiles") or []:
        if not isinstance(item, Mapping) or item.get("Filename") != QA_LOG_FILENAME:
            continue
        url = item.get("Url")
        if isinstance(url, str) and is_log_document_url(url, api_url):
            return url
        log.warning("e-Avrop: the question log's address is outside the log-document address; skipped")
    return None


# --- Reading the log ----------------------------------------------------------------


def decode_log(data: bytes) -> str:
    """The log as text. e-Avrop wrote it in Windows-1252 on 2026-10-12, unlike its e-mail logs.

    UTF-8 is tried first in case that changes; a UTF-8 file never decodes as something else
    by accident, while most Windows-1252 bytes fail UTF-8 at the first Swedish letter.
    """

    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1252", errors="replace")


def parse_question_log(text: str) -> list[LoggedEntry]:
    """Every block of the log, in file order. Blocks the log does not open properly are dropped.

    The file is a sequence of headers (see `_HEADER`), each followed by its text until the
    next header. An "Orginal Fraga" opens a question; "Besvarad Fraga" and "Svar" belong to
    the question opened last. Text that would itself look like a header, say a supplier who
    writes "Svar:" on a line of its own, is read as a header: UNCERTAIN whether e-Avrop
    escapes such lines, so the parser accepts the ambiguity rather than guessing.
    """

    entries: list[LoggedEntry] = []
    current: _Block | None = None
    section: str | None = None
    for raw_line in text.splitlines():
        line = raw_line.replace("\xa0", " ").rstrip()
        header = _HEADER.match(line)
        if header is None:
            if current is not None and section is not None:
                current.parts[section].append(line)
            continue
        kind, moment = header.group("kind"), _parse_moment(header.group("moment"))
        if kind in ("Orginal Fraga", "Meddelande"):
            if current is not None:
                entries.append(current.entry())
            current = _Block("question" if kind == "Orginal Fraga" else "message", moment)
            section = "original" if kind == "Orginal Fraga" else "answer"
        elif current is None or current.kind != "question":
            log.warning("e-Avrop question log: %r outside a question; skipped", kind)
            section = None
        elif kind == "Besvarad Fraga":
            current.answered_at = moment
            section = "question"
        else:
            section = "answer"
    if current is not None:
        entries.append(current.entry())
    return entries


def published_entries(entries: Sequence[LoggedEntry]) -> list[LoggedEntry]:
    return [entry for entry in entries if entry.is_published]


def answer_key(entry: LoggedEntry) -> str:
    """What identifies a question across reads: when it was asked and what was asked.

    The log has no ids. The buyer may edit the published wording and the answer, so those
    cannot be the key; the original question and its time do not change.
    """

    asked = entry.asked_at.isoformat() if entry.asked_at else ""
    return hashlib.sha256(f"{asked}\n{entry.original}".encode()).hexdigest()


@dataclass
class _Block:
    kind: Kind
    asked_at: datetime | None
    answered_at: datetime | None = None

    def __post_init__(self) -> None:
        self.parts: dict[str, list[str]] = {"original": [], "question": [], "answer": []}

    def entry(self) -> LoggedEntry:
        original = _clean("\n".join(self.parts["original"]))
        published = _clean("\n".join(self.parts["question"]))
        return LoggedEntry(
            kind=self.kind,
            asked_at=self.asked_at,
            original=original,
            question=published or original,
            answered_at=self.answered_at,
            answer=_clean("\n".join(self.parts["answer"])),
        )


def _parse_moment(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=STOCKHOLM)
    except ValueError:
        return None


def _clean(text: str) -> str:
    """Trim the block: e-Avrop pads answers with blank lines and non-breaking spaces."""

    lines = [line.rstrip() for line in text.splitlines()]
    return _BLANK_RUN.sub("\n\n", "\n".join(lines)).strip()


# --- Storing ------------------------------------------------------------------------


async def sync_published_answers(
    session: AsyncSession, notice_id: Any, entries: Sequence[LoggedEntry], *, source: str = SOURCE
) -> AnswerSync:
    """Make the notice's stored answers mirror the log: insert, update and delete by key.

    The log is the source of truth. An answer the buyer edits is updated, and one that is no
    longer in the log is deleted, so that the app never shows an answer e-Avrop has withdrawn.
    A log we could not fetch never reaches this function, so a failed read deletes nothing.
    """

    wanted = {answer_key(entry): entry for entry in published_entries(entries)}
    rows = await session.scalars(
        select(PublishedAnswer).where(
            PublishedAnswer.notice_id == notice_id, PublishedAnswer.source == source
        )
    )
    by_key = {row.external_key: row for row in rows}
    inserted = updated = deleted = 0
    for key, entry in wanted.items():
        values = {
            "question": entry.question,
            "answer": entry.answer,
            "asked_at": entry.asked_at,
            "answered_at": entry.answered_at,
        }
        row = by_key.get(key)
        if row is None:
            session.add(PublishedAnswer(notice_id=notice_id, source=source, external_key=key, **values))
            inserted += 1
        elif assign_changed(row, values):
            updated += 1
    for key, row in by_key.items():
        if key not in wanted:
            await session.delete(row)
            deleted += 1
    await session.flush()
    return AnswerSync(inserted=inserted, updated=updated, deleted=deleted)
