"""e-Avrop's question log: the allowlist, the parser and the mirror into `published_answers`.

The log below is fictitious but shaped exactly like the file e-Avrop wrote on 2026-10-12:
Windows-1252, a header line per block, blank lines and non-breaking spaces as padding, one
answered question, one unanswered and one message to the registered suppliers.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ingest.eavrop_qa import (
    QA_LOG_FILENAME,
    LoggedEntry,
    answer_key,
    decode_log,
    is_log_document_url,
    parse_question_log,
    published_entries,
    question_log_url,
    sync_published_answers,
)
from anbudsklar.ingest.notices import STOCKHOLM
from anbudsklar.models import Notice, PublishedAnswer

API = "https://www.e-avrop.com/api"
LOG_DOCUMENTS_URL = f"{API}/v1/announcements/74000/log-documents"
LOG_URL = f"{LOG_DOCUMENTS_URL}?filename=LoggfilOrginalFragor.txt&foldername="

QUESTION_LOG = (
    "Orginal Fraga 2026-10-05 16:42:46:\n"
    "Ska ställning ingå i priset för fasadmålningen?\n"
    "Besvarad Fraga 2026-10-06 10:38:45:\n"
    "Ska ställning ingå i priset för fasadmålningen? \n"
    "Svar :\n"
    "Ja, ställning ingår i anbudspriset.\xa0\n"
    "\n"
    "\n"
    "Prisbilagan är uppdaterad.\n"
    "\xa0\n"
    "\n"
    "\n"
    "\n"
    "Orginal Fraga 2026-10-07 09:48:37:\n"
    "Får vi lämna anbud tillsammans med ett annat företag?\n"
    "Besvarad Fraga :\n"
    "Får vi lämna anbud tillsammans med ett annat företag?\n"
    "Svar :\n"
    "\n"
    "\n"
    "\n"
    "Meddelande 2026-10-08 07:52:11:\n"
    "Hej,\n"
    "\xa0\n"
    "Kravspecifikationen är nu uppdaterad.\n"
)


def _moment(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=STOCKHOLM)


def _file(filename: str, encoded: str, folder: str) -> dict[str, str]:
    return {"Filename": filename, "Url": f"{LOG_DOCUMENTS_URL}?filename={encoded}&foldername={folder}"}


# --- Finding the log ---------------------------------------------------------------


def test_only_the_question_log_on_the_log_document_address_is_allowed() -> None:
    assert is_log_document_url(LOG_URL, API)
    assert is_log_document_url(LOG_URL, f"{API}/")
    # The e-mail logs share the address and differ only in the filename.
    assert not is_log_document_url(f"{LOG_DOCUMENTS_URL}?filename=fr%C3%A5gor.txt&foldername=QA", API)
    assert not is_log_document_url(f"{LOG_DOCUMENTS_URL}?filename=svar.txt", API)
    assert not is_log_document_url(LOG_DOCUMENTS_URL, API)
    assert not is_log_document_url(f"{API}/v1/announcement-documents/1?filename={QA_LOG_FILENAME}", API)
    assert not is_log_document_url(
        f"https://example.com/v1/announcements/74000/log-documents?filename={QA_LOG_FILENAME}", API
    )


def test_the_question_log_is_picked_out_of_the_announcement_log_files() -> None:
    detail: dict[str, Any] = {
        "AnnouncementLogFiles": [
            _file("Loggfil2026-10-01 10.00.00.txt", "Loggfil2026-10-01+10.00.00.txt", ""),
            _file("frågor.txt", "fr%C3%A5gor.txt", "QA"),
            {"Filename": QA_LOG_FILENAME, "Url": LOG_URL},
            _file("svar.txt", "svar.txt", "QA"),
        ]
    }

    assert question_log_url(detail, API) == LOG_URL
    assert question_log_url({"AnnouncementLogFiles": []}, API) is None
    assert question_log_url({}, API) is None
    # The right name on a foreign address is not followed.
    foreign = {"AnnouncementLogFiles": [{"Filename": QA_LOG_FILENAME, "Url": "https://example.com/x"}]}
    assert question_log_url(foreign, API) is None


# --- Reading the log ---------------------------------------------------------------


def test_the_log_is_windows_1252_but_utf8_is_accepted_too() -> None:
    assert decode_log("Fråga om ställning".encode("cp1252")) == "Fråga om ställning"
    assert decode_log("﻿Fråga om ställning".encode()) == "Fråga om ställning"
    assert decode_log(b"") == ""


def test_parse_reads_every_block_and_only_answered_questions_are_published() -> None:
    entries = parse_question_log(QUESTION_LOG)

    assert [entry.kind for entry in entries] == ["question", "question", "message"]
    answered, unanswered, message = entries
    assert answered == LoggedEntry(
        kind="question",
        asked_at=_moment("2026-10-05 16:42:46"),
        original="Ska ställning ingå i priset för fasadmålningen?",
        question="Ska ställning ingå i priset för fasadmålningen?",
        answered_at=_moment("2026-10-06 10:38:45"),
        answer="Ja, ställning ingår i anbudspriset.\n\nPrisbilagan är uppdaterad.",
    )
    assert unanswered.answered_at is None and unanswered.answer == ""
    assert message.asked_at == _moment("2026-10-08 07:52:11")
    assert message.answer == "Hej,\n\nKravspecifikationen är nu uppdaterad."
    assert [entry.is_published for entry in entries] == [True, False, False]
    assert published_entries(entries) == [answered]


def test_the_published_wording_is_shown_but_the_original_is_the_key() -> None:
    edited = (
        "Orginal Fraga 2026-10-05 16:42:46:\n"
        "ställning???\n"
        "Besvarad Fraga 2026-10-06 10:38:45:\n"
        "Ska ställning ingå i priset?\n"
        "Svar :\n"
        "Ja.\n"
    )
    [entry] = parse_question_log(edited)

    assert entry.original == "ställning???"
    assert entry.question == "Ska ställning ingå i priset?"
    reanswered = parse_question_log(edited.replace("Ja.", "Ja, och även lift."))[0]
    assert answer_key(reanswered) == answer_key(entry)
    other = parse_question_log(edited.replace("16:42:46", "16:42:47"))[0]
    assert answer_key(other) != answer_key(entry)
    assert len(answer_key(entry)) == 64


def test_blocks_outside_a_question_are_dropped_without_failing() -> None:
    stray = "Svar :\nEtt svar utan fråga.\n\nBesvarad Fraga 2026-10-06 10:38:45:\nx\n" + QUESTION_LOG
    entries = parse_question_log(stray)

    assert len(entries) == 3
    assert entries[0].original == "Ska ställning ingå i priset för fasadmålningen?"
    assert parse_question_log("") == []
    assert parse_question_log("Bara text utan rubriker\n") == []


def test_a_header_without_a_readable_time_still_parses() -> None:
    [entry] = parse_question_log("Orginal Fraga 2026-13-45 99:00:00:\nFråga?\nSvar :\nSvar.\n")

    assert entry.asked_at is None
    assert not entry.is_published  # never answered, whatever the answer text says


# --- Storing -----------------------------------------------------------------------


async def test_sync_inserts_updates_and_deletes_to_mirror_the_log(db_session: AsyncSession) -> None:
    notice = Notice(source="eavrop", external_id="900001", title="Fiktiv ommålning", status="open", raw={})
    db_session.add(notice)
    await db_session.flush()
    entries = parse_question_log(QUESTION_LOG)

    first = await sync_published_answers(db_session, notice.id, entries)
    again = await sync_published_answers(db_session, notice.id, entries)

    assert (first.inserted, first.updated, first.deleted) == (1, 0, 0)
    assert (again.inserted, again.updated, again.deleted) == (0, 0, 0)
    [row] = (await db_session.scalars(select(PublishedAnswer))).all()
    assert row.question == "Ska ställning ingå i priset för fasadmålningen?"
    assert row.answered_at == _moment("2026-10-06 10:38:45")
    assert row.source == "eavrop"

    edited = (
        QUESTION_LOG.replace("Prisbilagan är uppdaterad.", "Prisbilagan är uppdaterad 2026-10-06.")
        .replace("Besvarad Fraga :\n", "Besvarad Fraga 2026-10-09 09:03:56:\n")
        .replace("Svar :\n\n\n\nMeddelande", "Svar :\nJa, som ett konsortium.\n\nMeddelande")
    )
    changed = await sync_published_answers(db_session, notice.id, parse_question_log(edited))
    assert (changed.inserted, changed.updated, changed.deleted) == (1, 1, 0)
    rows = (await db_session.scalars(select(PublishedAnswer).order_by(PublishedAnswer.answered_at))).all()
    assert [row.answer for row in rows] == [
        "Ja, ställning ingår i anbudspriset.\n\nPrisbilagan är uppdaterad 2026-10-06.",
        "Ja, som ett konsortium.",
    ]

    withdrawn = await sync_published_answers(db_session, notice.id, [])
    assert (withdrawn.inserted, withdrawn.updated, withdrawn.deleted) == (0, 0, 2)
    assert (await db_session.scalars(select(PublishedAnswer))).all() == []
