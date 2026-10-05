"""Pure helpers behind the MCP tools: budgets, formatting, CPV prefixes, hosts and auth parsing."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import pytest
from mcp.server.fastmcp.exceptions import ToolError
from mcp.server.fastmcp.tools import Tool
from pydantic import ValidationError

from anbudsklar.api.schemas import UpcomingProcurement
from anbudsklar.contracts import Checklist, Citation
from anbudsklar.lou_refs import lou_url
from anbudsklar.mcp.auth import presented_key
from anbudsklar.mcp.guidance import ToolGuidance, recoverable_message
from anbudsklar.mcp.output import (
    HEADER_RESERVE_CHARS,
    cap_utf8,
    citation_text,
    fit_count,
    format_datetime,
    format_sek,
    more_hint,
    shorten,
)
from anbudsklar.mcp.server import allowed_hosts
from anbudsklar.mcp.tools.common import cpv_overlaps, cpv_prefix, trimmed
from anbudsklar.mcp.tools.notices import _upcoming_line as upcoming_line


def test_fit_count_keeps_leading_items_within_the_budget() -> None:
    budget = HEADER_RESERVE_CHARS + 250

    assert fit_count([100, 100, 100], budget) == 2
    assert fit_count([100, 100], budget) == 2
    assert fit_count([], budget) == 0


def test_fit_count_always_makes_progress() -> None:
    assert fit_count([5_000, 10], HEADER_RESERVE_CHARS + 100) == 1


def test_cap_utf8_never_splits_a_character() -> None:
    assert cap_utf8("åäö" * 10, 5) == "åä […]"
    assert cap_utf8("kort", 100) == "kort"


def test_shorten_cuts_at_a_word_and_marks_it() -> None:
    assert shorten("ett  två\ntre fyra", 9) == "ett två […]"
    assert shorten("ett två", 20) == "ett två"


def test_more_hint_names_the_parameter_to_continue_with() -> None:
    assert more_hint("offset", 20) == "… (fler träffar: anropa igen med offset=20)"
    assert more_hint("fran_sida", 6, "sidor") == "… (fler sidor: anropa igen med fran_sida=6)"


@pytest.mark.parametrize(
    ("citation", "expected"),
    [
        (Citation(page=2, quote="minst 5 mnkr", check="verified"), 's. 2 (kontrollerat): "minst 5 mnkr"'),
        (
            Citation(page=2, quote="minst 5 mnkr", check="moved", found_page=4),
            's. 4 (kontrollerat): "minst 5 mnkr"',
        ),
        (
            Citation(page=2, quote="minst 5 mnkr", check="unverified"),
            's. 2 (kunde inte kontrolleras): "minst 5 mnkr"',
        ),
        (Citation(page=2, quote="minst 5 mnkr"), 's. 2 (inte kontrollerat): "minst 5 mnkr"'),
    ],
)
def test_citation_text_cites_the_page_where_the_quote_stands(citation: Citation, expected: str) -> None:
    assert citation_text(citation) == expected


def test_swedish_formats() -> None:
    assert format_sek(1_200_000) == "1 200 000 kr"
    assert format_sek(None) == "uppgift saknas"
    assert format_datetime(datetime(2026, 10, 14, 21, 59, tzinfo=UTC)) == "2026-10-14 kl. 23:59"
    assert format_datetime(datetime(2026, 12, 1, 11, 0, tzinfo=UTC)) == "2026-12-01 kl. 12:00"


@pytest.mark.parametrize(
    ("code", "prefix"),
    [("45440000", "4544"), ("45442100-8", "454421"), ("03000000", "03"), ("45442110", "4544211")],
)
def test_cpv_prefix_follows_the_hierarchy(code: str, prefix: str) -> None:
    assert cpv_prefix(code) == prefix


def test_cpv_overlap_works_in_both_directions_of_the_hierarchy() -> None:
    assert cpv_overlaps(["45442110"], ["4544"])  # narrower code under the filter
    assert cpv_overlaps(["45440000"], ["454421"])  # broader agreement covers the filter
    assert not cpv_overlaps(["03221000"], ["4544"])


def test_allowed_hosts_cover_the_public_host_with_and_without_port() -> None:
    hosts = allowed_hosts("https://anbudsklar.sundsvall.se")

    assert hosts[:2] == ["anbudsklar.sundsvall.se", "anbudsklar.sundsvall.se:*"]
    assert "localhost:*" in hosts and len(hosts) == len(set(hosts))
    assert allowed_hosts("http://[::1]:3502")[:2] == ["[::1]", "[::1]:*"]


def test_allowed_hosts_add_configured_hosts_with_and_without_port() -> None:
    hosts = allowed_hosts(
        "https://anbudsklar.sundsvall.se",
        ["anbudsklar-app", " eneo-proxy:* ", "intern:3001", "[fd00::5]", ""],
    )

    for pattern in (
        "anbudsklar-app",
        "anbudsklar-app:*",
        "eneo-proxy",
        "eneo-proxy:*",
        "[fd00::5]",
        "[fd00::5]:*",
    ):
        assert pattern in hosts
    assert "intern:3001" in hosts and "intern:3001:*" not in hosts  # one named port stays exact
    assert "" not in hosts and len(hosts) == len(set(hosts))


def test_search_text_is_trimmed_at_a_word_boundary() -> None:
    trim = trimmed(12, blank_is_none=True).func

    assert trim("  målning  ") == "målning"
    assert trim("målning förskola") == "målning"  # never a half word, which would match nothing
    assert trim("målning fasad") == "målning"
    assert trim("fasadmålningar") == "fasadmålning"  # one long word is cut hard
    assert trim("   ") is None
    assert trim(None) is None and trim(5) == 5  # left for pydantic to judge


async def _lookup(code: str, limit: int = 5) -> str:
    return code


def test_only_recoverable_mistakes_become_guidance() -> None:
    tool = Tool.from_function(_lookup, name="lookup")
    with pytest.raises(ValidationError) as arguments:
        tool.fn_metadata.arg_model.model_validate({"limit": "många"})
    with pytest.raises(ValidationError) as inside_the_tool:
        Checklist.model_validate({})

    def wrapped(cause: Exception) -> ToolError:
        error = ToolError(f"Error executing tool lookup: {cause}")
        error.__cause__ = cause
        return error

    guidance = recoverable_message(tool, wrapped(arguments.value))
    assert guidance is not None
    assert "- code: saknas men krävs" in guidance and "- limit: måste vara ett heltal" in guidance
    assert recoverable_message(tool, wrapped(ToolGuidance("Välj en sida."))) == "Välj en sida."
    assert recoverable_message(tool, ToolGuidance("Välj en sida.")) == "Välj en sida."
    assert recoverable_message(tool, wrapped(inside_the_tool.value)) is None  # a bug, not a mistake
    assert recoverable_message(tool, wrapped(ToolError("Tekniskt fel"))) is None
    assert recoverable_message(None, ToolError("Unknown tool: radera")) is None


def test_presented_key_prefers_the_api_key_header() -> None:
    assert presented_key([(b"authorization", b"Bearer a"), (b"x-api-key", b"b")]) == b"b"
    assert presented_key([(b"authorization", b"BEARER  a ")]) == b"a"
    assert presented_key([(b"authorization", b"Basic a")]) == b""


def test_lou_links_point_to_the_paragraph_anchor() -> None:
    assert lou_url(4, "1") == "https://data.riksdagen.se/dokument/sfs-2016-1145.html#K4P1"
    assert lou_url("19 a", "3 a") == "https://data.riksdagen.se/dokument/sfs-2016-1145.html#K19aP3a"
    assert lou_url(1, "3 a") == "https://data.riksdagen.se/dokument/sfs-2016-1145.html#K1P3a"


def test_an_overdue_announcement_points_to_the_notices() -> None:
    item = UpcomingProcurement(
        agreement_id=uuid.uuid4(),
        title="Ramavtal måleriarbeten",
        category="Bygg",
        cpv_codes=["45442100"],
        end_date=date(2027, 1, 31),
        max_end_date=None,
        expected_from=date(2026, 4, 30),
        expected_to=date(2026, 7, 31),
        previous_requirements=None,
        is_fictitious=True,
        announcement_overdue=True,
    )
    line = upcoming_line(item)
    assert "borde redan ha annonserats (väntades 2026-04-30 – 2026-07-31)" in line
    assert "sok_upphandlingar" in line
    assert "väntas annonseras" not in line
    assert "ny upphandling väntas annonseras" in upcoming_line(
        item.model_copy(update={"announcement_overdue": False})
    )
