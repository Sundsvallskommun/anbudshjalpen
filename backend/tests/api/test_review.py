"""Draft review: companies only, in memory only, and nothing is stored."""

from __future__ import annotations

import tempfile

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.documents.extract import MAX_PAGES
from anbudsklar.models import Document, QuestionLog
from anbudsklar.services import review

from .factories import (
    INSURANCE_SENTENCE,
    Demo,
    add_checklist,
    add_document,
    add_notice,
    demo_checklist,
    login,
)

DRAFT = (
    "Anbud från Målerifirman i Matfors AB (fiktivt utkast)\n\n"
    f"Vi uppfyller kravet: {INSURANCE_SENTENCE} Försäkringsbevis bifogas inte i detta utkast.\n\n"
    "Pris: 412 000 kronor exklusive moms."
)


def _files(content: bytes = DRAFT.encode(), name: str = "utkast.txt") -> dict[str, tuple[str, bytes, str]]:
    return {"file": (name, content, "application/octet-stream")}


async def test_review_requires_a_company_user(client: httpx.AsyncClient, demo: Demo) -> None:
    url = f"/api/notices/{demo.notice.id}/review"
    assert (await client.post(url, files=_files())).status_code == 401
    await login(client, "inkopare")
    assert (await client.post(url, files=_files())).status_code == 403


async def test_company_gets_a_review_and_nothing_is_stored(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    documents_before = await db_session.scalar(select(func.count()).select_from(Document))
    await login(client, "foretagare")
    response = await client.post(f"/api/notices/{demo.notice.id}/review", files=_files())
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["stored"] is False
    assert body["engine"] == "heuristic"
    assert body["requirement_titles"] == {
        "K1": "Ansvarsförsäkring om minst 5 miljoner kronor",
        "K2": "Två referensuppdrag i offentlig miljö",
    }
    assert {check["requirement_id"] for check in body["result"]["checks"]} <= {"K1", "K2"}
    assert await db_session.scalar(select(func.count()).select_from(Document)) == documents_before
    assert await db_session.scalar(select(func.count()).select_from(QuestionLog)) == 0


async def test_draft_never_spools_to_disk(
    client: httpx.AsyncClient, demo: Demo, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Starlette spools uploads above 1 MB to a temporary file; ours must stay in memory."""

    def refuse_rollover(self: tempfile.SpooledTemporaryFile[bytes]) -> None:
        raise AssertionError("upload was written to disk")

    monkeypatch.setattr(tempfile.SpooledTemporaryFile, "rollover", refuse_rollover)
    filler = ["Utfyllnad. " * 1_000] * 100  # pages split by form feed, within the extraction limits
    large = "\f".join([DRAFT, *filler]).encode()
    assert len(large) > 1024 * 1024
    await login(client, "foretagare")
    response = await client.post(f"/api/notices/{demo.notice.id}/review", files=_files(large))
    assert response.status_code == 200, response.text


async def test_upload_limits_and_types(
    client: httpx.AsyncClient, demo: Demo, monkeypatch: pytest.MonkeyPatch
) -> None:
    url = f"/api/notices/{demo.notice.id}/review"
    await login(client, "foretagare")

    monkeypatch.setattr(review, "MAX_DRAFT_BYTES", 100)
    too_large = await client.post(url, files=_files(b"x" * 101))
    assert too_large.status_code == 413
    assert "20 MB" in too_large.json()["detail"]
    monkeypatch.undo()

    unsupported = await client.post(url, files=_files(b"MZ...", name="utkast.exe"))
    assert unsupported.status_code == 415
    assert "PDF" in unsupported.json()["detail"]

    not_multipart = await client.post(url, content=b"hej", headers={"Content-Type": "text/plain"})
    assert not_multipart.status_code == 422

    empty = await client.post(url, files=_files(b""))
    assert empty.status_code == 422

    # Over the extraction limits is "too large" as well, with the extractor's own explanation.
    too_long = "\f".join(["Vi uppfyller kravet."] * (MAX_PAGES + 1)).encode()
    response = await client.post(url, files=_files(too_long, name="utkast.txt"))
    assert response.status_code == 413
    assert str(MAX_PAGES) in response.json()["detail"]


async def test_review_needs_a_published_checklist(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    notice = await add_notice(db_session, external_id="TEST-R")
    document = await add_document(db_session, notice, ["Kvalificering\nKrav finns."])
    await add_checklist(
        db_session, notice, document, demo_checklist(demo.fragestopp, demo.deadline), status="draft"
    )
    await login(client, "foretagare")
    response = await client.post(f"/api/notices/{notice.id}/review", files=_files())
    assert response.status_code == 409
    assert "publicerad checklista" in response.json()["detail"]
