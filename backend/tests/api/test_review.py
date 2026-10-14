"""Draft review: companies only, in memory only, and nothing is stored."""

from __future__ import annotations

import tempfile

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.documents.extract import MAX_PAGES
from anbudsklar.models import AiCall, Document, QuestionLog
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


def _several(*files: tuple[str, bytes]) -> list[tuple[str, tuple[str, bytes, str]]]:
    """Several files in the one `file` field, as the web app sends a draft of several files."""

    return [("file", (name, content, "application/octet-stream")) for name, content in files]


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
    # Only that the engine was called is kept, for the statistics on Drift: nothing from the draft.
    [call] = (await db_session.scalars(select(AiCall))).all()
    assert (call.task, call.notice_id, call.input_tokens) == ("granska_utkast", demo.notice.id, None)


async def test_a_draft_of_several_files_is_reviewed_as_one(client: httpx.AsyncClient, demo: Demo) -> None:
    """Decision 0025: the tender and its attachments go in together, and a quote names its file."""

    tender = b"Anbud (fiktivt utkast)\n\nVi har tre referensuppdrag. Prisbilagan bifogas."
    proof = f"Forsakringsbevis\n\n{INSURANCE_SENTENCE}".encode()
    await login(client, "foretagare")
    response = await client.post(
        f"/api/notices/{demo.notice.id}/review",
        files=_several(
            ("anbud.txt", tender), ("forsakringsbevis.txt", proof), ("Prisbilaga.txt", b"Pris: 1 kr")
        ),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    checks = {check["requirement_id"]: check for check in body["result"]["checks"]}
    assert checks["K1"]["draft_document"] == "forsakringsbevis.txt"
    assert checks["K1"]["draft_page"] == 1
    assert checks["K1"]["draft_check"] == "verified"
    assert body["result"]["summary"].endswith("Granskningen läste 3 filer.")


async def test_several_files_share_the_limits(
    client: httpx.AsyncClient, demo: Demo, monkeypatch: pytest.MonkeyPatch
) -> None:
    url = f"/api/notices/{demo.notice.id}/review"
    await login(client, "foretagare")

    # The byte cap is on the files together.
    monkeypatch.setattr(review, "MAX_DRAFT_BYTES", 100)
    together = await client.post(url, files=_several(("a.txt", b"x" * 60), ("b.txt", b"y" * 60)))
    assert together.status_code == 413
    assert "tillsammans" in together.json()["detail"]
    monkeypatch.undo()

    too_many = await client.post(
        url, files=_several(*((f"fil{n}.txt", b"Text.") for n in range(review.MAX_DRAFT_FILES + 1)))
    )
    assert too_many.status_code == 422
    assert str(review.MAX_DRAFT_FILES) in too_many.json()["detail"]

    # One unsupported file refuses the whole draft, and an empty file says which one it is.
    unsupported = await client.post(url, files=_several(("anbud.txt", DRAFT.encode()), ("bild.png", b"PNG")))
    assert unsupported.status_code == 415
    empty = await client.post(url, files=_several(("anbud.txt", DRAFT.encode()), ("tom.txt", b"")))
    assert empty.status_code == 422
    assert "tom.txt" in empty.json()["detail"]

    # Together over what one file may hold is refused, not read in part.
    monkeypatch.setattr(review, "MAX_PAGES", 3)
    two_pages = b"Sida.\fSida."
    too_long = await client.post(url, files=_several(("a.txt", two_pages), ("b.txt", two_pages)))
    assert too_long.status_code == 413
    assert "tillsammans ha högst 3 sidor" in too_long.json()["detail"]


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
