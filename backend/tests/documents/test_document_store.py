"""Storing documents end to end: file on disk, pages in Postgres, dedupe and reading back."""

from __future__ import annotations

import hashlib
import uuid
from collections.abc import Callable

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import get_settings
from anbudsklar.documents import extract, store
from anbudsklar.documents.extract import PDF_MIMETYPE, DocumentTooLarge, UnsupportedDocument
from anbudsklar.documents.store import (
    DocumentNotFound,
    load_paged_document,
    read_file,
    safe_filename,
    store_document,
)
from anbudsklar.models import Document, DocumentPage, Notice

MakeFile = Callable[..., bytes]


async def _notice(session: AsyncSession, title: str = "Ommålning av Solbackens förskola") -> Notice:
    notice = Notice(
        source="fixture",
        external_id=f"test-{uuid.uuid4().hex[:8]}",
        title=title,
        is_fictitious=True,
    )
    session.add(notice)
    await session.flush()
    return notice


async def _document_count(session: AsyncSession) -> int:
    return await session.scalar(select(func.count()).select_from(Document)) or 0


async def test_store_pdf_writes_file_and_indexes_pages(
    db_session: AsyncSession, make_pdf: MakeFile, tender_pages: list[str]
) -> None:
    notice = await _notice(db_session)
    data = make_pdf(tender_pages)

    document = await store_document(
        db_session,
        notice_id=notice.id,
        filename="Förfrågningsunderlag Solbacken.pdf",
        mimetype=PDF_MIMETYPE,
        data=data,
        is_fictitious=True,
    )

    digest = hashlib.sha256(data).hexdigest()
    assert document.sha256 == digest
    assert document.storage_path == digest
    assert document.page_count == 4
    assert document.size_bytes == len(data)
    assert document.mimetype == PDF_MIMETYPE
    assert document.is_fictitious
    assert (get_settings().documents_dir / digest).read_bytes() == data

    rows = (
        await db_session.execute(
            select(DocumentPage.page_no, DocumentPage.section, DocumentPage.text)
            .where(DocumentPage.document_id == document.id)
            .order_by(DocumentPage.page_no)
        )
    ).all()
    assert [(page_no, section) for page_no, section, _ in rows] == [
        (1, "administrativa"),
        (2, "kvalificering"),
        (3, "kravspecifikation"),
        (4, "utvardering"),
    ]
    assert "ansvarsförsäkring om minst 5 000 000 kronor" in rows[1].text


async def test_full_text_index_is_filled_for_pages(
    db_session: AsyncSession, make_pdf: MakeFile, tender_pages: list[str]
) -> None:
    notice = await _notice(db_session)
    document = await store_document(
        db_session, notice_id=notice.id, filename="u.pdf", mimetype=PDF_MIMETYPE, data=make_pdf(tender_pages)
    )
    matches = await db_session.scalars(
        select(DocumentPage.page_no).where(
            DocumentPage.document_id == document.id,
            DocumentPage.search.op("@@")(func.websearch_to_tsquery("swedish", "försäkringsbevis")),
        )
    )
    assert list(matches) == [2]


async def test_same_file_twice_for_a_notice_is_stored_once(
    db_session: AsyncSession, make_pdf: MakeFile, tender_pages: list[str]
) -> None:
    notice = await _notice(db_session)
    data = make_pdf(tender_pages)
    first = await store_document(
        db_session, notice_id=notice.id, filename="a.pdf", mimetype=PDF_MIMETYPE, data=data
    )
    again = await store_document(
        db_session, notice_id=notice.id, filename="kopia.pdf", mimetype=PDF_MIMETYPE, data=data
    )
    assert again.id == first.id
    assert await _document_count(db_session) == 1


async def test_same_file_for_another_notice_shares_the_stored_file(
    db_session: AsyncSession, make_pdf: MakeFile, tender_pages: list[str]
) -> None:
    data = make_pdf(tender_pages)
    first_notice, second_notice = await _notice(db_session), await _notice(db_session, "Annan upphandling")
    first = await store_document(
        db_session, notice_id=first_notice.id, filename="a.pdf", mimetype=PDF_MIMETYPE, data=data
    )
    second = await store_document(
        db_session, notice_id=second_notice.id, filename="a.pdf", mimetype=PDF_MIMETYPE, data=data
    )
    assert second.id != first.id
    assert second.storage_path == first.storage_path


async def test_mimetype_is_resolved_from_the_file(db_session: AsyncSession, make_pdf: MakeFile) -> None:
    notice = await _notice(db_session)
    document = await store_document(
        db_session,
        notice_id=notice.id,
        filename="C:\\Users\\inkop\\Underlag.pdf",
        mimetype="application/octet-stream",
        data=make_pdf(["Kort underlag om städning."]),
    )
    assert document.mimetype == PDF_MIMETYPE
    assert document.filename == "Underlag.pdf"


async def test_unsupported_upload_leaves_no_trace(db_session: AsyncSession) -> None:
    notice = await _notice(db_session)
    data = b"\x89PNG\r\n\x1a\n not a document"
    with pytest.raises(UnsupportedDocument):
        await store_document(
            db_session, notice_id=notice.id, filename="bild.png", mimetype="image/png", data=data
        )
    assert await _document_count(db_session) == 0
    assert not (get_settings().documents_dir / hashlib.sha256(data).hexdigest()).exists()


async def test_document_beyond_the_page_limit_leaves_no_trace(
    db_session: AsyncSession, make_pdf: MakeFile, monkeypatch: pytest.MonkeyPatch
) -> None:
    notice = await _notice(db_session)
    data = make_pdf(["Sida ett.", "Sida två."])
    monkeypatch.setattr(extract, "MAX_PAGES", 1)
    with pytest.raises(DocumentTooLarge):
        await store_document(
            db_session, notice_id=notice.id, filename="lang.pdf", mimetype=PDF_MIMETYPE, data=data
        )
    assert await _document_count(db_session) == 0
    assert not (get_settings().documents_dir / hashlib.sha256(data).hexdigest()).exists()


async def test_concurrent_upload_of_the_same_file_returns_the_winner(
    db_session: AsyncSession, make_pdf: MakeFile, monkeypatch: pytest.MonkeyPatch
) -> None:
    notice = await _notice(db_session)
    data = make_pdf(["Underlag som laddas upp två gånger samtidigt."])
    winner = await store_document(
        db_session, notice_id=notice.id, filename="a.pdf", mimetype=PDF_MIMETYPE, data=data
    )
    real_existing = store._existing
    calls = 0

    async def existing_missed_once(
        session: AsyncSession, notice_id: uuid.UUID, digest: str
    ) -> Document | None:
        nonlocal calls
        calls += 1
        return None if calls == 1 else await real_existing(session, notice_id, digest)

    monkeypatch.setattr(store, "_existing", existing_missed_once)
    loser = await store_document(
        db_session, notice_id=notice.id, filename="b.pdf", mimetype=PDF_MIMETYPE, data=data
    )
    assert loser.id == winner.id
    assert await _document_count(db_session) == 1


async def test_load_paged_document_and_read_file(
    db_session: AsyncSession, make_pdf: MakeFile, tender_pages: list[str]
) -> None:
    notice = await _notice(db_session)
    data = make_pdf(tender_pages)
    document = await store_document(
        db_session, notice_id=notice.id, filename="underlag.pdf", mimetype=PDF_MIMETYPE, data=data
    )

    paged = await load_paged_document(db_session, document.id)
    assert paged.document_id == str(document.id)
    assert paged.filename == "underlag.pdf"
    assert paged.page_count == 4
    assert paged.pages[3].startswith("4 Utvärdering")
    assert "[SIDA 2]\n2 Kvalificering" in paged.render()
    assert await read_file(document) == data


async def test_load_paged_document_for_unknown_id(db_session: AsyncSession) -> None:
    with pytest.raises(DocumentNotFound):
        await load_paged_document(db_session, uuid.uuid4())


async def test_read_file_refuses_unexpected_storage_paths() -> None:
    document = Document(id=uuid.uuid4(), storage_path="../../etc/passwd")
    with pytest.raises(ValueError, match="storage path"):
        await read_file(document)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("../../etc/passwd", "passwd"),
        ("C:\\Users\\inkop\\Underlag.pdf", "Underlag.pdf"),
        ("rad\nbrytning\t.pdf", "radbrytning.pdf"),
        ("   ", "dokument"),
        ("/", "dokument"),
    ],
)
def test_safe_filename(raw: str, expected: str) -> None:
    assert safe_filename(raw) == expected


def test_safe_filename_shortens_long_names_but_keeps_the_extension() -> None:
    name = safe_filename("x" * 500 + ".pdf")
    assert len(name) == store.MAX_FILENAME_CHARS
    assert name.endswith(".pdf")


# --- Current documents, superseding and re-extraction -------------------------------------


async def test_store_keeps_the_layout_of_an_eavrop_export(
    db_session: AsyncSession, make_pdf: MakeFile
) -> None:
    footer = (
        "Sundsvalls kommun\nUpphandling\nFiktiv\nDokument\nKrav\n"
        "Diarienummer\nUH-2026-1\nDatum\n2026-10-07\n1"
    )
    notice = await _notice(db_session)
    document = await store_document(
        db_session,
        notice_id=notice.id,
        filename="Krav på Leverantör.pdf",
        mimetype=PDF_MIMETYPE,
        data=make_pdf([f"Leverantören ska ha F-skatt.\n{footer}"]),
    )
    assert document.layout == "eavrop"
    paged = await load_paged_document(db_session, document.id)
    assert paged.layout == "eavrop" and paged.pages == ["Leverantören ska ha F-skatt."]


async def test_store_counts_empty_pages_and_records_the_extraction_version(
    db_session: AsyncSession, make_pdf: MakeFile
) -> None:
    notice = await _notice(db_session)
    document = await store_document(
        db_session,
        notice_id=notice.id,
        filename="skannad.pdf",
        mimetype=PDF_MIMETYPE,
        data=make_pdf(["Sida med text.", "", "Mer text."]),
    )
    assert (document.page_count, document.empty_pages) == (3, 1)
    assert document.extraction_version == extract.EXTRACTION_VERSION


async def test_current_documents_leave_out_replaced_and_empty_files_and_put_the_main_one_first(
    db_session: AsyncSession, make_pdf: MakeFile, tender_pages: list[str]
) -> None:
    notice = await _notice(db_session)

    async def add(filename: str, pages: list[str]) -> Document:
        return await store_document(
            db_session, notice_id=notice.id, filename=filename, mimetype=PDF_MIMETYPE, data=make_pdf(pages)
        )

    old = await add("AF.pdf", tender_pages)
    attachment = await add("Bilaga.pdf", ["Bilagans text."])
    new = await add("AF.pdf", [*tender_pages, "Rättad sida."])
    store.supersede(old, new)
    await db_session.flush()

    current = await store.current_documents(db_session, notice.id)
    assert [document.id for document in current] == [new.id, attachment.id]  # stored together: by name
    first = await store.current_documents(db_session, notice.id, main=attachment)
    assert [document.id for document in first] == [attachment.id, new.id]
    paged = await store.load_paged_documents(db_session, first)
    assert [document.filename for document in paged] == ["Bilaga.pdf", "AF.pdf"]


async def test_reextract_replaces_the_pages_from_the_stored_file(
    db_session: AsyncSession, make_pdf: MakeFile, tender_pages: list[str]
) -> None:
    notice = await _notice(db_session)
    document = await store_document(
        db_session, notice_id=notice.id, filename="u.pdf", mimetype=PDF_MIMETYPE, data=make_pdf(tender_pages)
    )
    # Pages an older extraction left behind: wrong text and an extra page.
    await db_session.execute(
        DocumentPage.__table__.update()
        .where(DocumentPage.document_id == document.id, DocumentPage.page_no == 1)
        .values(text="gammal text")
    )
    db_session.add(DocumentPage(document_id=document.id, page_no=5, text="överbliven sida"))
    document.extraction_version = 1
    await db_session.flush()

    assert await store.reextract_document(db_session, document) == 4

    rows = list(
        await db_session.scalars(
            select(DocumentPage.text)
            .where(DocumentPage.document_id == document.id)
            .order_by(DocumentPage.page_no)
        )
    )
    assert len(rows) == 4 and "Administrativa föreskrifter" in rows[0]
    assert (document.page_count, document.extraction_version) == (4, extract.EXTRACTION_VERSION)
