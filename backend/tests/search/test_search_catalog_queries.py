"""Searching notices, CPV codes and LOU sections."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.models import LouSection, Notice, PolicySection
from anbudsklar.search.queries import (
    count_notices_by_status,
    cpv_labels,
    cpv_prefix,
    cpv_with_ancestors,
    get_lou_section,
    get_policy_section,
    parse_lou_reference,
    search_cpv,
    search_lou,
    search_notices,
    search_policy_sections,
    search_rule_texts,
)


def _ids(rows: list[Notice], notices: dict[str, Notice]) -> set[str]:
    by_id = {notice.id: key for key, notice in notices.items()}
    return {by_id[row.id] for row in rows}


# --- pure helpers ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        ("45442110", ["45442110", "45442100", "45442000", "45440000", "45400000", "45000000"]),
        ("03221111", ["03221111", "03221110", "03221100", "03221000", "03220000", "03200000", "03000000"]),
        ("45442110-1", ["45442110", "45442100", "45442000", "45440000", "45400000", "45000000"]),
        ("10100000", ["10100000", "10000000"]),
        ("45000000", ["45000000"]),
    ],
)
def test_cpv_with_ancestors(code: str, expected: list[str]) -> None:
    assert cpv_with_ancestors(code) == expected


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        ("45442110", "4544211"),
        ("45000000", "45"),
        ("03000000", "03"),
        ("10000000", "10"),
        ("45440000-3", "4544"),
    ],
)
def test_cpv_prefix(code: str, expected: str) -> None:
    assert cpv_prefix(code) == expected


@pytest.mark.parametrize("code", ["4544211", "4544211x", "", "45442110-12"])
def test_invalid_cpv_codes_are_rejected(code: str) -> None:
    with pytest.raises(ValueError, match="CPV"):
        cpv_with_ancestors(code)


@pytest.mark.parametrize(
    ("reference", "expected"),
    [
        ("4 kap. 1 §", ("4", "1")),
        ("4 kap 1§", ("4", "1")),
        ("LOU 20 kap. 1 §", ("20", "1")),
        ("Vad säger 12 kap. 12 § om underrättelse?", ("12", "12")),
        ("1 kap. 3 a §", ("1", "3 a")),
        ("1 kap. 3a §", ("1", "3 a")),
        ("1 KAP. 3 A §", ("1", "3 a")),
        ("20:1", ("20", "1")),
        ("LOU 4:2a", ("4", "2 a")),
        (" 4 : 2 ", ("4", "2")),
        ("19 a kap. 2 §", ("19 a", "2")),
        ("LOU 19 A kap. 3a §", ("19 a", "3 a")),
        ("4 kap.", None),
        ("klockan 10:30 i morgon", None),
        ("avtalsspärr", None),
    ],
)
def test_parse_lou_reference(reference: str, expected: tuple[str, str] | None) -> None:
    assert parse_lou_reference(reference) == expected


# --- notices --------------------------------------------------------------------------


async def test_notices_without_text_come_newest_first(
    db_session: AsyncSession, notices: dict[str, Notice]
) -> None:
    rows, total = await search_notices(db_session)
    assert total == 5
    assert [row.id for row in rows] == [
        notices[key].id for key in ("stad", "malning", "frukt", "snorojning", "tak")
    ]


async def test_notices_paginate_with_a_stable_total(
    db_session: AsyncSession, notices: dict[str, Notice]
) -> None:
    first, total = await search_notices(db_session, limit=2)
    second, _ = await search_notices(db_session, limit=2, offset=2)
    beyond, total_beyond = await search_notices(db_session, limit=2, offset=10)
    assert total == total_beyond == 5
    assert len(first) == len(second) == 2
    assert not {row.id for row in first} & {row.id for row in second}
    assert beyond == []


async def test_full_text_matches_title_and_description(
    db_session: AsyncSession, notices: dict[str, Notice]
) -> None:
    rows, total = await search_notices(db_session, text="förskola")
    assert (total, _ids(rows, notices)) == (2, {"malning", "stad"})
    rows, total = await search_notices(db_session, text="målning")
    assert (total, _ids(rows, notices)) == (1, {"malning"})


async def test_full_text_accepts_web_search_syntax(
    db_session: AsyncSession, notices: dict[str, Notice]
) -> None:
    rows, _ = await search_notices(db_session, text="förskola -städtjänster")
    assert _ids(rows, notices) == {"malning"}
    rows, _ = await search_notices(db_session, text='"frukt och grönt" or snöröjning')
    assert _ids(rows, notices) == {"frukt", "snorojning"}


async def test_trigram_fallback_finds_compound_words(
    db_session: AsyncSession, notices: dict[str, Notice]
) -> None:
    rows, total = await search_notices(db_session, text="målningsarbete")
    assert (total, _ids(rows, notices)) == (1, {"malning"})


async def test_no_match_at_all(db_session: AsyncSession, notices: dict[str, Notice]) -> None:
    assert await search_notices(db_session, text="kärnkraftverk") == ([], 0)


@pytest.mark.parametrize(
    ("prefixes", "expected"),
    [
        (["45"], {"malning", "tak"}),
        (["4544"], {"malning"}),
        (["45440000"], {"malning"}),
        (["45442110-1"], {"malning"}),
        (["0322", "9062"], {"frukt", "snorojning"}),
        (["9"], {"stad", "snorojning"}),
        (["abc"], set()),
        ([], {"malning", "stad", "frukt", "snorojning", "tak"}),
    ],
)
async def test_cpv_prefix_filter(
    db_session: AsyncSession, notices: dict[str, Notice], prefixes: list[str], expected: set[str]
) -> None:
    rows, total = await search_notices(db_session, cpv_prefixes=prefixes)
    assert _ids(rows, notices) == expected
    assert total == len(expected)


async def test_status_source_and_deadline_filters(
    db_session: AsyncSession, notices: dict[str, Notice]
) -> None:
    rows, _ = await search_notices(db_session, status="open")
    assert _ids(rows, notices) == {"malning", "stad"}
    rows, _ = await search_notices(db_session, source="ted")
    assert _ids(rows, notices) == {"frukt", "snorojning"}
    rows, _ = await search_notices(db_session, deadline_after=datetime.now(UTC).date())
    assert _ids(rows, notices) == {"malning", "stad"}
    rows, _ = await search_notices(db_session, deadline_after=datetime.now(UTC) + timedelta(days=25))
    assert _ids(rows, notices) == {"stad"}


async def test_text_and_filters_combine(db_session: AsyncSession, notices: dict[str, Notice]) -> None:
    rows, total = await search_notices(db_session, text="förskola", cpv_prefixes=["90"], status="open")
    assert (total, _ids(rows, notices)) == (1, {"stad"})


async def test_notices_by_deadline_put_the_soonest_first_and_undated_last(
    db_session: AsyncSession, notices: dict[str, Notice]
) -> None:
    rows, _ = await search_notices(db_session, order="deadline")
    keys = {notice.id: key for key, notice in notices.items()}
    assert [keys[row.id] for row in rows] == ["frukt", "malning", "stad", "snorojning", "tak"]
    rows, _ = await search_notices(db_session, text="förskola", order="deadline")
    assert [keys[row.id] for row in rows] == ["malning", "stad"]
    rows, _ = await search_notices(db_session, text="förskola", order="published")
    assert [keys[row.id] for row in rows] == ["stad", "malning"]


async def test_notice_counts_per_status(db_session: AsyncSession, notices: dict[str, Notice]) -> None:
    assert await count_notices_by_status(db_session, ("open", "planned")) == ({"open": 2, "planned": 1}, 5)
    assert await count_notices_by_status(db_session, ("open",), source="ted") == ({"open": 0}, 2)


@pytest.mark.parametrize("text", ["förskola", "målning", "målningsarbete", "takrenovering", "kärnkraftverk"])
async def test_notice_counts_match_what_each_status_lists(
    db_session: AsyncSession, notices: dict[str, Notice], text: str
) -> None:
    """Full text first and similar titles when it finds nothing, for each status on its own."""

    statuses = ("open", "planned", "closed", "awarded")
    per_status, total = await count_notices_by_status(db_session, statuses, text=text)
    for status in statuses:
        assert per_status[status] == (await search_notices(db_session, text=text, status=status))[1], status
    assert total == (await search_notices(db_session, text=text))[1]


async def test_cpv_labels_by_code_as_given(db_session: AsyncSession, cpv_codes: None) -> None:
    labels = await cpv_labels(db_session, ["45442110-1", "45442100", "99999999", "inte en kod"])
    assert labels == {"45442110-1": "Målning av byggnader", "45442100": "Målning"}
    assert await cpv_labels(db_session, []) == {}


# --- CPV ------------------------------------------------------------------------------


async def test_cpv_by_code_prefix(db_session: AsyncSession, cpv_codes: None) -> None:
    rows = await search_cpv(db_session, "4544")
    assert [row.code for row in rows] == ["45440000", "45442000", "45442100", "45442110", "45442120"]


async def test_cpv_by_full_code_includes_descendants(db_session: AsyncSession, cpv_codes: None) -> None:
    assert [row.code for row in await search_cpv(db_session, "45442100-8")] == [
        "45442100",
        "45442110",
        "45442120",
    ]
    assert [row.code for row in await search_cpv(db_session, "45442110")] == ["45442110"]


async def test_cpv_by_word(db_session: AsyncSession, cpv_codes: None) -> None:
    codes = [row.code for row in await search_cpv(db_session, "målning")]
    assert codes[0] == "45442100"
    assert {"45442110", "45442120", "45440000"} <= set(codes)
    assert "90911200" not in codes


async def test_cpv_compound_labels_via_trigrams(db_session: AsyncSession, cpv_codes: None) -> None:
    codes = {row.code for row in await search_cpv(db_session, "städning")}
    assert {"90911200", "90919200"} <= codes


async def test_cpv_from_a_description_ranks_codes_matching_several_words_first(
    db_session: AsyncSession, cpv_codes: None
) -> None:
    rows = await search_cpv(db_session, "Vi utför målning och städning av byggnader")
    codes = [row.code for row in rows]
    assert codes[0] == "45442110"
    assert {"45442100", "90911200", "90911000"} <= set(codes)


async def test_cpv_ignores_stop_words_and_respects_limit(db_session: AsyncSession, cpv_codes: None) -> None:
    assert await search_cpv(db_session, "och av för") == []
    assert await search_cpv(db_session, "   ") == []
    assert len(await search_cpv(db_session, "45", limit=3)) == 3


# --- LOU ------------------------------------------------------------------------------


async def test_lou_reference_returns_that_section(
    db_session: AsyncSession, lou_sections: dict[str, LouSection]
) -> None:
    assert await search_lou(db_session, "20 kap. 1 §") == [lou_sections["20:1"]]
    assert await search_lou(db_session, "1:3a") == [lou_sections["1:3 a"]]


async def test_lou_full_text_search(db_session: AsyncSession, lou_sections: dict[str, LouSection]) -> None:
    assert (await search_lou(db_session, "likvärdigt"))[0] == lou_sections["4:1"]


async def test_lou_question_falls_back_to_any_word(
    db_session: AsyncSession, lou_sections: dict[str, LouSection]
) -> None:
    sections = await search_lou(db_session, "hur länge gäller avtalsspärren")
    assert sections[0] == lou_sections["20:1"]


async def test_lou_trigram_fallback_for_misspellings(
    db_session: AsyncSession, lou_sections: dict[str, LouSection]
) -> None:
    assert (await search_lou(db_session, "proportionalitetsprincip"))[0] == lou_sections["4:1"]


async def test_lou_unknown_reference_falls_back_to_search(
    db_session: AsyncSession, lou_sections: dict[str, LouSection]
) -> None:
    assert await search_lou(db_session, "21 kap. 9 §") == []


async def test_get_lou_section_normalises_the_section(
    db_session: AsyncSession, lou_sections: dict[str, LouSection]
) -> None:
    assert await get_lou_section(db_session, 1, "3a") == lou_sections["1:3 a"]
    assert await get_lou_section(db_session, 1, "3 A §") == lou_sections["1:3 a"]
    assert await get_lou_section(db_session, 4, "1") == lou_sections["4:1"]
    assert await get_lou_section(db_session, 4, "99") is None
    assert await get_lou_section(db_session, 4, "inte en paragraf") is None


# --- The municipality's steering documents (decision 0022) ----------------------------------


async def test_policy_reference_returns_that_section(
    db_session: AsyncSession, policy_sections: dict[str, PolicySection]
) -> None:
    assert await search_policy_sections(db_session, "Inköpsstrategin 5.2") == [policy_sections["5.2"]]
    assert await search_policy_sections(db_session, "avsnitt 5.3") == [policy_sections["5.3"]]
    assert await search_policy_sections(db_session, "5.2") == [policy_sections["5.2"]]
    strategy = "inköpsstrategin för Sundsvalls kommun"
    assert await get_policy_section(db_session, "5.2.", strategy) == policy_sections["5.2"]
    assert await get_policy_section(db_session, "5.2", "strategin") == policy_sections["5.2"]
    assert await get_policy_section(db_session, "9.9") is None
    assert await get_policy_section(db_session, "5.2", "Miljöpolicyn") is None


async def test_policy_full_text_search_and_fallbacks(
    db_session: AsyncSession, policy_sections: dict[str, PolicySection]
) -> None:
    assert (await search_policy_sections(db_session, "småföretag"))[0] == policy_sections["5.3"]
    hits = await search_policy_sections(db_session, "kollektivavtal för underleverantörer")
    assert hits[0] == policy_sections["5.2"]
    hits = await search_policy_sections(db_session, "varför vill kommunen prata med marknaden")
    assert hits[0] == policy_sections["5.3"]
    assert (await search_policy_sections(db_session, "kolektivavtal"))[0] == policy_sections["5.2"]  # trigram
    assert await search_policy_sections(db_session, "xylofonstämning") == []
    assert await search_policy_sections(db_session, "   ") == []


async def test_rule_texts_are_ranked_together(
    db_session: AsyncSession,
    lou_sections: dict[str, LouSection],
    policy_sections: dict[str, PolicySection],
) -> None:
    assert await search_rule_texts(db_session, "20 kap. 1 §") == [lou_sections["20:1"]]
    assert await search_rule_texts(db_session, "Inköpsstrategin 5.3") == [policy_sections["5.3"]]
    both = await search_rule_texts(db_session, "kollektivavtal lön semester arbetstid underleverantörer")
    assert {type(row) for row in both} == {LouSection, PolicySection}
    assert await search_rule_texts(db_session, "xylofonstämning") == []


def _label(row: LouSection | PolicySection) -> str:
    return row.number if isinstance(row, PolicySection) else f"{row.chapter}:{row.section}"


# Questions a company asks, and whether the law or the strategy should answer first. The whole
# committed strategy is loaded, against a few sections of the law.
ROUTING: tuple[tuple[str, type[LouSection] | type[PolicySection]], ...] = (
    ("Hur lång är avtalsspärren?", LouSection),
    ("Får förvaltningslagen tillämpas i ett ärende om upphandling?", LouSection),
    ("Måste myndigheten skicka en underrättelse om tilldelningsbeslut?", LouSection),
    ("Ska leverantörer behandlas likvärdigt och icke-diskriminerande?", LouSection),
    ("Vilka villkor om lön, semester och arbetstid kan krävas i kontraktet?", LouSection),
    ("Vilka hållbarhetskrav ställer kommunen?", PolicySection),
    ("Ställer kommunen krav på sommarjobb och praktikplatser?", PolicySection),
    ("Hur ser kommunen på småföretag och nystartade företag?", PolicySection),
    ("Varför vill kommunen prata med marknaden före en upphandling?", PolicySection),
    ("Upphandlar Sundsvall åt Timrå kommun?", PolicySection),
    ("Vad är målet med kommunens inköp?", PolicySection),
    ("Vilka kemikalier vill kommunen fasa ut?", PolicySection),
    ("Hur motverkar kommunen jäv och korruption vid inköp?", PolicySection),
    ("Ska behov mötas genom återbruk innan kommunen köper på avtal?", PolicySection),
)


@pytest.mark.parametrize(("question", "expected"), ROUTING, ids=[question for question, _ in ROUTING])
async def test_the_question_decides_which_source_answers_first(
    db_session: AsyncSession,
    lou_sections: dict[str, LouSection],
    whole_strategy: None,
    question: str,
    expected: type[LouSection] | type[PolicySection],
) -> None:
    rows = await search_rule_texts(db_session, question, limit=3)
    assert rows and isinstance(rows[0], expected), [_label(row) for row in rows]
