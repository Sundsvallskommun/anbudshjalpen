"""Every MCP tool through the official SDK client (streamable HTTP) against seeded rows."""

from __future__ import annotations

import json
import uuid
from datetime import datetime

from mcp.types import CallToolResult
from mcp_harness import (
    COMPANY_SECRET,
    DRAFT_SECRET,
    PAGES,
    PUBLIC_URL,
    STRATEGY_URL,
    Seeded,
    everything,
    mcp_client,
    resources,
    texts,
)
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.mcp.output import STOCKHOLM
from anbudsklar.services.dates import add_months
from anbudsklar.services.upcoming import announcement_window

EXPECTED_TOOLS = {
    "sok_upphandlingar",
    "hamta_upphandling",
    "sok_i_underlag",
    "lasa_sidor",
    "kontrollera_citat",
    "hamta_checklista",
    "hamta_fragor_svar",
    "hamta_paragraf",
    "sok_lou",
    "hamta_avsnitt",
    "sok_styrdokument",
    "sla_upp_cpv",
    "kommande_upphandlingar",
}
FILENAME = "Förfrågningsunderlag Solbacken.pdf"


def wire_size(result: CallToolResult) -> int:
    """The size Eneo measures before it truncates a tool result (its cap is 32 768)."""

    content = [block.model_dump(mode="json", by_alias=True, exclude_none=True) for block in result.content]
    return len(json.dumps({"content": content, "is_error": result.isError}, ensure_ascii=False))


async def test_lists_read_only_tools_with_swedish_guidance(db_session: AsyncSession) -> None:
    async with mcp_client(db_session) as client:
        tools = {tool.name: tool for tool in (await client.list_tools()).tools}

    assert set(tools) == EXPECTED_TOOLS
    for tool in tools.values():
        assert tool.title and tool.description
        assert tool.name.isascii() and len(f"anbudsklar__{tool.name}") <= 64
        assert tool.annotations is not None and tool.annotations.readOnlyHint is True
        assert tool.outputSchema is None  # Eneo ignores structured output
        schema = json.dumps(tool.inputSchema)
        assert "$defs" not in schema and "$ref" not in schema
        assert all("description" in spec for spec in tool.inputSchema["properties"].values())
        assert len(tool.description) <= 700  # the whole catalogue is sent on every chat turn
    for name in ("sok_i_underlag", "lasa_sidor"):
        assert "Citera ordagrant och ange dokument och sidnummer" in (tools[name].description or "")
    for name in ("hamta_paragraf", "sok_lou"):
        assert "ange kapitel och paragraf" in (tools[name].description or "")
    for name in ("hamta_avsnitt", "sok_styrdokument"):
        description = tools[name].description or ""
        assert "ange dokument och avsnitt" in description
        assert "binder kommunens egna beställare, inte leverantören" in description


async def test_search_filters_notices_and_points_to_the_next_page(
    db_session: AsyncSession, seeded: Seeded
) -> None:
    async with mcp_client(db_session) as client:
        by_text = await client.call_tool("sok_upphandlingar", {"fritext": "målning"})
        by_cpv = await client.call_tool("sok_upphandlingar", {"cpv": ["45440000"], "status": "alla"})
        first_page = await client.call_tool("sok_upphandlingar", {"status": "alla", "limit": 1})
        closed = await client.call_tool("sok_upphandlingar", {"status": "avslutad"})
        nothing = await client.call_tool("sok_upphandlingar", {"fritext": "xylofonstämning"})

    assert not by_text.isError
    assert f"upphandling_id: {seeded.notice.id}" in texts(by_text) and "FIKTIV" in texts(by_text)
    assert str(seeded.notice.id) in texts(by_cpv) and str(seeded.draft_only.id) not in texts(by_cpv)
    assert texts(first_page).startswith("Träff 1–1 av 3.")
    assert "… (fler träffar: anropa igen med offset=1)" in texts(first_page)
    assert str(seeded.closed.id) in texts(closed) and str(seeded.notice.id) not in texts(closed)
    assert not nothing.isError and "Inga upphandlingar matchar" in texts(nothing)


async def test_notice_details_list_documents_and_published_checklist(
    db_session: AsyncSession, seeded: Seeded
) -> None:
    seeded.notice.reference_number = "DEMO-2026-0147"
    seeded.notice.unread_files = [{"filename": "Ritningar.zip", "reason": "Filformatet .zip stöds inte"}]
    seeded.document.empty_pages = 1
    await db_session.flush()
    async with mcp_client(db_session) as client:
        details = await client.call_tool("hamta_upphandling", {"upphandling_id": str(seeded.notice.id)})
        draft_only = await client.call_tool(
            "hamta_upphandling", {"upphandling_id": str(seeded.draft_only.id)}
        )
        unknown = await client.call_tool("hamta_upphandling", {"upphandling_id": str(uuid.uuid4())})
        malformed = await client.call_tool("hamta_upphandling", {"upphandling_id": "inte-ett-id"})

    text = texts(details)
    assert f"- dokument_id: {seeded.document.id} | {FILENAME} | 6 sidor | 1 sidor utan läsbar text" in text
    assert "- Ritningar.zip (Filformatet .zip stöds inte)" in text  # what the tools cannot see
    assert "45442100 Målning" in text and "FIKTIV UPPHANDLING" in text
    assert "Referensnummer: DEMO-2026-0147" in text
    assert "Referensnummer" not in texts(draft_only)  # no line for a notice without one
    assert "Inköp har publicerat en checklista" in text
    assert "Inga dokument är inlästa" in texts(draft_only) and "Ingen publicerad checklista" in texts(
        draft_only
    )
    # Mistakes the model can fix are guidance, not errors: Eneo's circuit breaker counts errors.
    assert not unknown.isError and "Sök fram rätt id med sok_upphandlingar" in texts(unknown)
    assert not malformed.isError and "inte ett giltigt upphandling_id" in texts(malformed)


async def test_document_search_returns_citable_page_excerpts(
    db_session: AsyncSession, seeded: Seeded
) -> None:
    notice_id = str(seeded.notice.id)
    async with mcp_client(db_session) as client:
        found = await client.call_tool(
            "sok_i_underlag", {"upphandling_id": notice_id, "fraga": "ansvarsförsäkring"}
        )
        other_part = await client.call_tool(
            "sok_i_underlag",
            {"upphandling_id": notice_id, "fraga": "ansvarsförsäkring", "avsnitt": "utvardering"},
        )
        nothing = await client.call_tool(
            "sok_i_underlag", {"upphandling_id": notice_id, "fraga": "xylofonstämning"}
        )

    assert not found.isError
    first = resources(found)[0]
    assert str(first.uri) == f"{PUBLIC_URL}/api/documents/{seeded.document.id}/file#page=2"
    assert first.meta == {"title": FILENAME, "pageRange": "2", "section": "kvalificering"}
    assert f"Dokument: {FILENAME}" in first.text and "Sida: 2" in first.text
    assert "Citera ordagrant och ange dokument och sidnummer" in texts(found)
    assert resources(other_part) == []
    assert not nothing.isError and "Inga träffar" in texts(nothing)


async def test_reading_pages_caps_the_range_and_points_to_the_next(
    db_session: AsyncSession, seeded: Seeded
) -> None:
    notice_id = str(seeded.notice.id)
    async with mcp_client(db_session) as client:
        result = await client.call_tool(
            "lasa_sidor", {"upphandling_id": notice_id, "fran_sida": 1, "till_sida": 9}
        )
        beyond = await client.call_tool("lasa_sidor", {"upphandling_id": notice_id, "fran_sida": 7})
        backwards = await client.call_tool(
            "lasa_sidor", {"upphandling_id": notice_id, "fran_sida": 3, "till_sida": 2}
        )
        no_documents = await client.call_tool(
            "lasa_sidor", {"upphandling_id": str(seeded.draft_only.id), "fran_sida": 1}
        )

    pages = resources(result)
    assert [page.meta and page.meta["pageRange"] for page in pages] == ["1", "2", "3", "4", "5"]
    assert PAGES[1] in pages[1].text and "Sida: 2 av 6" in pages[1].text
    assert "… (fler sidor: anropa igen med fran_sida=6)" in texts(result)
    assert wire_size(result) <= 16_000
    assert not beyond.isError and resources(beyond) == []
    assert "har 6 sidor, så sida 7 finns inte. Välj fran_sida mellan 1 och 6." in texts(beyond)
    assert not backwards.isError  # a reversed range reads the same pages
    assert [page.meta and page.meta["pageRange"] for page in resources(backwards)] == ["2", "3"]
    assert not no_documents.isError and "inga inlästa dokument" in texts(no_documents)


async def test_reading_pages_stays_within_a_small_output_budget(
    db_session: AsyncSession, seeded: Seeded
) -> None:
    arguments = {"upphandling_id": str(seeded.notice.id), "fran_sida": 2, "till_sida": 4}
    async with mcp_client(db_session, mcp_max_output_chars=1_600) as client:
        result = await client.call_tool("lasa_sidor", arguments)

    assert len(resources(result)) == 1
    assert "… (fler sidor: anropa igen med fran_sida=3)" in texts(result)
    assert wire_size(result) <= 1_600


async def test_quote_check_reports_the_page_where_the_quote_stands(
    db_session: AsyncSession, seeded: Seeded
) -> None:
    quote = "ansvarsförsäkring om minst 5 miljoner kronor"
    notice_id = str(seeded.notice.id)
    async with mcp_client(db_session) as client:
        right = await client.call_tool(
            "kontrollera_citat", {"upphandling_id": notice_id, "citat": quote, "sida": 2}
        )
        wrong = await client.call_tool(
            "kontrollera_citat", {"upphandling_id": notice_id, "citat": quote, "sida": 4}
        )
        missing = await client.call_tool(
            "kontrollera_citat",
            {"upphandling_id": notice_id, "citat": "Leverantören ska vara certifierad enligt ISO 14001."},
        )

    assert "står ordagrant på sida 2" in texts(right)
    assert [page.meta and page.meta["pageRange"] for page in resources(right)] == ["2"]
    assert "står inte på sida 4 utan på sida 2" in texts(wrong)
    assert "hittades inte" in texts(missing) and resources(missing) == []


async def test_checklist_shows_only_the_published_version(db_session: AsyncSession, seeded: Seeded) -> None:
    notice_id = str(seeded.notice.id)
    async with mcp_client(db_session) as client:
        published = await client.call_tool("hamta_checklista", {"upphandling_id": notice_id})
        dates = await client.call_tool("hamta_checklista", {"upphandling_id": notice_id, "avsnitt": "datum"})
        later = await client.call_tool("hamta_checklista", {"upphandling_id": notice_id, "offset": 2})
        draft_only = await client.call_tool("hamta_checklista", {"upphandling_id": str(seeded.draft_only.id)})

    text = texts(published)
    assert "Sammanfattning: Ommålning av en förskola." in text
    assert "- K1 (skallkrav) Ansvarsförsäkring:" in text
    assert 's. 2 (kontrollerat): "ansvarsförsäkring om minst 5 miljoner kronor"' in text
    assert 's. 3 (kontrollerat): "två referensuppdrag i offentlig miljö"' in text  # moved: cite where found
    assert 's. 6 (kunde inte kontrolleras): "referensblankett"' in text
    assert "- Pris (70 %):" in text and "## Oklart i underlaget" in text
    assert DRAFT_SECRET not in text
    assert "## Viktiga datum" in texts(dates) and "K1" not in texts(dates)
    assert "Punkt 3–" in texts(later) and "Sammanfattning" not in texts(later)
    assert "ingen publicerad checklista" in texts(draft_only) and DRAFT_SECRET not in texts(draft_only)


async def test_law_tools_return_citable_paragraphs(db_session: AsyncSession, seeded: Seeded) -> None:
    async with mcp_client(db_session) as client:
        paragraph = await client.call_tool("hamta_paragraf", {"referens": "4 kap. 1 §"})
        short_form = await client.call_tool("hamta_paragraf", {"referens": "20:1"})
        unparsable = await client.call_tool("hamta_paragraf", {"referens": "paragrafen om pris"})
        missing = await client.call_tool("hamta_paragraf", {"referens": "4 kap. 99 §"})
        search = await client.call_tool("sok_lou", {"fraga": "avtalsspärr"})

    [section] = resources(paragraph)
    assert str(section.uri) == "https://data.riksdagen.se/dokument/sfs-2016-1145.html#K4P1"
    assert section.text.startswith("LOU 4 kap. 1 §") and "likvärdigt" in section.text
    assert section.meta == {"title": "LOU 4 kap. 1 §", "section": "Principer för offentlig upphandling"}
    assert resources(short_form)[0].text.startswith("LOU 20 kap. 1 §")
    assert not unparsable.isError and "Kunde inte tolka" in texts(unparsable)
    assert not missing.isError and "LOU 4 kap. 99 § finns inte" in texts(missing)
    assert resources(unparsable) == [] and resources(missing) == []
    assert [found.meta and found.meta["title"] for found in resources(search)] == ["LOU 20 kap. 1 §"]


async def test_steering_document_tools_return_citable_sections_labelled_as_such(
    db_session: AsyncSession, seeded: Seeded
) -> None:
    async with mcp_client(db_session) as client:
        section = await client.call_tool("hamta_avsnitt", {"referens": "Inköpsstrategin 5.2"})
        bare_number = await client.call_tool("hamta_avsnitt", {"referens": "5.3"})
        own_words = await client.call_tool(
            "hamta_avsnitt", {"referens": "kommunens inköpsstrategi, avsnitt 5.3"}
        )
        unknown_document = await client.call_tool("hamta_avsnitt", {"referens": "Miljöpolicyn 2"})
        missing = await client.call_tool("hamta_avsnitt", {"referens": "Inköpsstrategin 9.9"})
        law = await client.call_tool("hamta_avsnitt", {"referens": "4 kap. 1 §"})
        search = await client.call_tool("sok_styrdokument", {"fraga": "småföretag"})
        nothing = await client.call_tool("sok_styrdokument", {"fraga": "xylofonstämning"})

    [found] = resources(section)
    assert str(found.uri) == f"{STRATEGY_URL}#page=8"
    assert found.text.startswith(
        "Inköpsstrategin 5.2, Inköpsstrategi för Sundsvalls kommun\nAvsnitt 5.2: Hållbara inköp"
    )
    assert "Sidorna 8–9 i dokumentet" in found.text
    assert "Fastställt av Kommunfullmäktige 2023-09-25" in found.text
    assert "binder kommunens egna beställare, inte leverantören" in found.text
    assert "underleverantörer i obegränsat antal led" in found.text
    # No pageRange: Eneo's reference chip must say the section, not "sida 8".
    assert found.meta == {"title": "Inköpsstrategin 5.2", "section": "Hållbara inköp"}
    assert resources(bare_number)[0].meta == {
        "title": "Inköpsstrategin 5.3",
        "section": "Konkurrensinriktade inköp",
    }
    assert resources(own_words)[0].meta["title"] == "Inköpsstrategin 5.3"
    assert not unknown_document.isError
    assert "Hittar inget styrdokument som heter 'Miljöpolicyn'" in texts(unknown_document)
    assert "Kända dokument: 'Inköpsstrategin'" in texts(unknown_document)
    assert not missing.isError and "Avsnitt 9.9 finns inte" in texts(missing)
    assert not law.isError and "Kunde inte tolka '4 kap. 1 §' som ett avsnitt" in texts(law)
    assert resources(unknown_document) == resources(missing) == resources(law) == []
    assert [hit.meta and hit.meta["title"] for hit in resources(search)] == ["Inköpsstrategin 5.3"]
    assert texts(search).startswith("1 avsnitt i kommunens styrdokument om 'småföretag'.")
    assert not nothing.isError and "Inga avsnitt i kommunens styrdokument matchar" in texts(nothing)


async def test_cpv_lookup_shows_codes_with_their_broader_levels(
    db_session: AsyncSession, seeded: Seeded
) -> None:
    async with mcp_client(db_session) as client:
        result = await client.call_tool("sla_upp_cpv", {"beskrivning": "målning"})

    line = next(line for line in texts(result).splitlines() if line.startswith("- 45442100 "))
    assert line.startswith("- 45442100 Målning (under: 45000000 Anläggningsarbete")
    assert "45442000 Påstrykning av skyddsöverdrag" in line


async def test_upcoming_procurements_are_a_labelled_forecast(
    db_session: AsyncSession, seeded: Seeded
) -> None:
    async with mcp_client(db_session) as client:
        upcoming = await client.call_tool("kommande_upphandlingar", {})
        painting = await client.call_tool("kommande_upphandlingar", {"cpv": ["4544"]})

    text = texts(upcoming)
    assert "Ramavtal måleriarbeten" in text and "Livsmedel frukt och grönt" in text
    assert "Fordonsleasing" not in text and "Avslutat avtal" not in text
    assert (
        text.startswith("Prognos från avtalskatalogen, inte beslut: 2 avtal väntas upphandlas på nytt")
        and "FIKTIVT AVTAL" in text
    )
    earliest, latest = announcement_window(add_months(datetime.now(STOCKHOLM).date(), 14))
    assert f"ny upphandling väntas annonseras {earliest.isoformat()} – {latest.isoformat()}" in text
    assert "Ramavtal måleriarbeten" in texts(painting) and "Livsmedel" not in texts(painting)


async def test_no_tool_shows_company_data_or_unpublished_drafts(
    db_session: AsyncSession, seeded: Seeded
) -> None:
    notice_id = str(seeded.notice.id)
    calls: list[tuple[str, dict[str, object]]] = [
        ("sok_upphandlingar", {"status": "alla"}),
        ("hamta_upphandling", {"upphandling_id": notice_id}),
        ("hamta_upphandling", {"upphandling_id": str(seeded.draft_only.id)}),
        ("sok_i_underlag", {"upphandling_id": notice_id, "fraga": "anbud"}),
        ("lasa_sidor", {"upphandling_id": notice_id, "fran_sida": 1, "till_sida": 5}),
        ("hamta_checklista", {"upphandling_id": notice_id}),
        ("hamta_checklista", {"upphandling_id": str(seeded.draft_only.id)}),
        ("hamta_fragor_svar", {"upphandling_id": notice_id}),
        ("kommande_upphandlingar", {"manader": 36}),
    ]
    async with mcp_client(db_session) as client:
        outputs = [everything(await client.call_tool(name, arguments)) for name, arguments in calls]

    for output in outputs:
        assert COMPANY_SECRET not in output and DRAFT_SECRET not in output


async def test_published_answers_are_listed_oldest_first_and_the_notice_counts_them(
    db_session: AsyncSession, seeded: Seeded
) -> None:
    notice_id = str(seeded.notice.id)
    async with mcp_client(db_session) as client:
        answers = await client.call_tool("hamta_fragor_svar", {"upphandling_id": notice_id})
        later = await client.call_tool("hamta_fragor_svar", {"upphandling_id": notice_id, "offset": 1})
        none = await client.call_tool("hamta_fragor_svar", {"upphandling_id": str(seeded.draft_only.id)})
        notice = await client.call_tool("hamta_upphandling", {"upphandling_id": notice_id})

    text = texts(answers)
    assert "Svar 1–2 av 2" in text and "vem som frågade visas inte" in text
    assert text.index("Ska ställning ingå i priset?") < text.index("F-skatt")
    assert "## Fråga 1 (besvarad" in text and "Svar: Ja, ställning ingår i anbudspriset." in text
    assert "Svar 2–2 av 2" in texts(later) and "Ska ställning" not in texts(later)
    assert "Inga publicerade frågor och svar" in texts(none)
    assert "Inköp har publicerat 2 svar" in texts(notice)
    assert "hamta_fragor_svar" in texts(notice)
