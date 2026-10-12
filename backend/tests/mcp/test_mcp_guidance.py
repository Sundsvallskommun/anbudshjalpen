"""Mistakes the model can fix come back as guidance; only real failures are errors.

Eneo 2.2 counts every result marked isError toward a circuit breaker that turns the whole
MCP server off for 60 seconds after five in a row, for every user, and it runs a turn's
tool calls in parallel. So a wrong page, id or argument must never be marked as an error.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from mcp.types import CallToolResult
from mcp_harness import Seeded, mcp_client, resources, texts
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.models import Document, DocumentPage


def page_numbers(result: CallToolResult) -> list[str]:
    return [str(page.meta.get("pageRange")) for page in resources(result) if page.meta]


async def test_argument_mistakes_are_guidance_that_names_the_fix(
    db_session: AsyncSession, seeded: Seeded
) -> None:
    notice_id = str(seeded.notice.id)
    calls: list[tuple[str, dict[str, object], str]] = [
        ("sok_upphandlingar", {"fritext": "x"}, "- fritext: måste ha minst 2 tecken"),
        (
            "sok_upphandlingar",
            {"status": "öppen"},
            "- status: måste vara 'oppen', 'planerad', 'avslutad', 'tilldelad' eller 'alla'",
        ),
        (
            "sok_upphandlingar",
            {"sista_anbudsdag_efter": "i morgon"},
            "- sista_anbudsdag_efter: måste vara ett datum i formen ÅÅÅÅ-MM-DD",
        ),
        ("sok_upphandlingar", {"cpv": ["måleri"]}, "- cpv[0]: har fel format"),
        ("sok_upphandlingar", {"limit": "många"}, "- limit: måste vara ett heltal"),
        ("lasa_sidor", {"upphandling_id": notice_id}, "- fran_sida: saknas men krävs"),
        (
            "kontrollera_citat",
            {"upphandling_id": notice_id, "citat": "pris"},
            "- citat: måste ha minst 5 tecken",
        ),
        ("hamta_paragraf", {"referens": "§"}, "- referens: måste ha minst 3 tecken"),
    ]
    async with mcp_client(db_session) as client:
        results = [
            (name, expected, await client.call_tool(name, arguments)) for name, arguments, expected in calls
        ]

    for name, expected, result in results:
        text = texts(result)
        assert not result.isError, text
        assert text.startswith(f"Fel i argumenten till {name}, så inget hämtades:\n"), text
        assert expected in text, text
        assert text.endswith(f"Rätta argumenten och anropa {name} igen.\n"), text


async def test_values_outside_the_limits_are_brought_inside(db_session: AsyncSession, seeded: Seeded) -> None:
    notice_id = str(seeded.notice.id)
    async with mcp_client(db_session) as client:
        many = await client.call_tool("sok_upphandlingar", {"status": "alla", "limit": 500})
        far = await client.call_tool("sok_upphandlingar", {"status": "alla", "offset": 10**9})
        blank = await client.call_tool("sok_upphandlingar", {"status": "alla", "fritext": "   "})
        long_text = await client.call_tool("sok_upphandlingar", {"fritext": "målning förskola " * 30})
        bare_code = await client.call_tool("sok_upphandlingar", {"status": "alla", "cpv": "45440000"})
        page_zero = await client.call_tool("lasa_sidor", {"upphandling_id": notice_id, "fran_sida": 0})
        reversed_filter = await client.call_tool(
            "sok_i_underlag",
            {"upphandling_id": notice_id, "fraga": "ansvarsförsäkring", "fran_sida": 4, "till_sida": 1},
        )
        years = await client.call_tool("kommande_upphandlingar", {"manader": 120})
        laws = await client.call_tool("sok_lou", {"fraga": "avtalsspärr", "limit": 99})
        no_codes = await client.call_tool("sla_upp_cpv", {"beskrivning": "målning", "limit": 0})
        long_reference = await client.call_tool(
            "hamta_paragraf", {"referens": "LOU 20 kap. 1 § om avtalsspärr och överprövning"}
        )

    results = [many, far, blank, long_text, bare_code, page_zero, reversed_filter, years, laws, no_codes]
    assert not any(result.isError for result in [*results, long_reference])
    assert texts(many).startswith("Träff 1–3 av 3.")
    assert "Det finns bara 3 träffar" in texts(far)
    assert texts(blank).startswith("Träff 1–3 av 3.")
    assert str(seeded.notice.id) in texts(long_text)
    assert str(seeded.notice.id) in texts(bare_code) and str(seeded.closed.id) not in texts(bare_code)
    assert page_numbers(page_zero) == ["1"]
    assert page_numbers(reversed_filter) == ["2"]
    assert "inom 36 månader" in texts(years)
    assert [found.meta and found.meta["title"] for found in resources(laws)] == ["LOU 20 kap. 1 §"]
    assert "(1 st)" in texts(no_codes)
    assert resources(long_reference)[0].text.startswith("LOU 20 kap. 1 §")


async def test_choosing_among_several_documents_is_guidance(db_session: AsyncSession, seeded: Seeded) -> None:
    def document(filename: str, page_count: int) -> Document:
        return Document(
            notice_id=seeded.notice.id,
            filename=filename,
            mimetype="application/pdf",
            sha256=uuid.uuid4().hex * 2,
            size_bytes=100,
            page_count=page_count,
            storage_path="/dev/null",
            is_fictitious=True,
        )

    price_list = document("Bilaga prislista.pdf", 1)
    not_read_yet = document("Bilaga ritningar.pdf", 3)
    db_session.add_all([price_list, not_read_yet])
    await db_session.flush()
    db_session.add(DocumentPage(document_id=price_list.id, page_no=1, text="Prislista för målning."))
    await db_session.flush()

    notice_id = str(seeded.notice.id)
    other_notice_document = str(uuid.uuid4())
    async with mcp_client(db_session) as client:
        unnamed = await client.call_tool("lasa_sidor", {"upphandling_id": notice_id, "fran_sida": 1})
        foreign = await client.call_tool(
            "lasa_sidor", {"upphandling_id": notice_id, "fran_sida": 1, "dokument_id": other_notice_document}
        )
        malformed = await client.call_tool(
            "lasa_sidor", {"upphandling_id": notice_id, "fran_sida": 1, "dokument_id": "bilaga 2"}
        )
        no_text = await client.call_tool(
            "lasa_sidor", {"upphandling_id": notice_id, "fran_sida": 1, "dokument_id": str(not_read_yet.id)}
        )
        chosen = await client.call_tool(
            "lasa_sidor", {"upphandling_id": notice_id, "fran_sida": 1, "dokument_id": str(price_list.id)}
        )

    assert not any(result.isError for result in [unnamed, foreign, malformed, no_text, chosen])
    assert "Upphandlingen har flera dokument. Ange dokument_id" in texts(unnamed)
    for document_id in (seeded.document.id, price_list.id, not_read_yet.id):
        assert f"- dokument_id: {document_id} |" in texts(unnamed)
    assert f"dokument_id {other_notice_document} hör inte till upphandlingen" in texts(foreign)
    assert "'bilaga 2' är inte ett giltigt dokument_id" in texts(malformed)
    assert "Texten i Bilaga ritningar.pdf är inte inläst ännu" in texts(no_text)
    assert resources(unnamed) == resources(foreign) == resources(no_text) == []
    assert "Prislista för målning." in resources(chosen)[0].text


async def test_real_failures_stay_errors_without_internals() -> None:
    @asynccontextmanager
    async def unreachable_database() -> AsyncIterator[AsyncSession]:
        raise ConnectionRefusedError("connect to 10.0.0.5:5432 refused")
        yield  # pragma: no cover - makes this an async generator

    async with mcp_client(None, sessions=unreachable_database) as client:
        failed = await client.call_tool("hamta_upphandling", {"upphandling_id": str(uuid.uuid4())})
        unknown_tool = await client.call_tool("radera_upphandling", {})

    assert failed.isError and "Tekniskt fel i Anbudshjälpen" in texts(failed)
    assert "10.0.0.5" not in texts(failed)
    assert unknown_tool.isError
