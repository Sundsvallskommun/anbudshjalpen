"""Possible bidders: the prefilter rules read from the buyer's side, and what the list shows of a company."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.api.schemas import SupplierSearch
from anbudsklar.services.suppliers import (
    cpv_match_kind,
    find_suppliers,
    is_possible_bidder,
    same_word,
    shared_words,
)
from api.factories import add_company, add_cpv_codes


def test_words_match_in_their_different_forms_but_not_on_short_stems() -> None:
    assert same_word("fasader", "fasader")
    assert same_word("glas", "glas")  # equal words match however short
    assert same_word("fasad", "fasader")
    assert same_word("förskolor", "förskola")  # plural in -or
    assert same_word("invändig", "invändigt")
    assert same_word("renoverar", "renovering")
    assert not same_word("stor", "storstädning")  # four letters say too little
    assert not same_word("målar", "målning")
    assert not same_word("kontor", "kontroll")
    assert not same_word("skolor", "förskola")


def test_shared_words_keep_the_companys_order_and_form() -> None:
    company = ["målerifirma", "tapetserar", "fasader", "invändigt"]
    job = ["ommålning", "invändig", "fasad", "korridorer"]
    assert shared_words(company, job) == ["fasader", "invändigt"]


def test_the_rule_is_a_cpv_group_or_enough_words() -> None:
    assert is_possible_bidder(3, 0, 10)
    assert not is_possible_bidder(2, 1, 10)
    assert is_possible_bidder(0, 2, 10)
    assert is_possible_bidder(0, 1, 1)  # a one-word job only needs that word
    assert not is_possible_bidder(0, 0, 0)  # a job without words is matched on codes alone


def test_the_closeness_of_a_cpv_match_in_words() -> None:
    assert cpv_match_kind(8) == "same_code"
    assert cpv_match_kind(5) == "same_category"
    assert cpv_match_kind(3) == "same_group"
    assert cpv_match_kind(2) is None


async def test_find_suppliers_orders_by_closeness_and_shows_only_what_matching_reads(
    db_session: AsyncSession,
) -> None:
    await add_cpv_codes(
        db_session,
        {"45442100": "Målning", "45442110": "Målning av byggnader", "45440000": "Måleri- och glasmästeri"},
    )
    painter = await add_company(
        db_session,
        name="Målerifirman (fiktiv)",
        description="Vi målar invändigt och utvändigt och renoverar fasader.",
        cpv_codes=["45442110"],
    )
    painter.employees = 5
    painter.annual_turnover_sek = 4_800_000
    glazier = await add_company(
        db_session, name="Glasmästaren (fiktiv)", description="Vi byter glas.", cpv_codes=["45441000"]
    )
    cleaner = await add_company(
        db_session,
        name="Städbolaget (fiktiv)",
        description="Vi städar kontor, korridorer och förskolor.",
        cpv_codes=["90911200"],
    )
    # Shares neither a group (60 is transport) nor a word with the job.
    await add_company(db_session, name="Åkeriet (fiktiv)", description="Vi kör grus.", cpv_codes=["60100000"])
    await db_session.flush()

    search = SupplierSearch(
        title="Ommålning av Solbackens förskola",
        description="Invändig målning av korridorer och fasader på en förskola.",
        cpv_codes=["45442110-1"],
    )
    found = await find_suppliers(db_session, search, datetime.now(UTC))

    assert [item.company_id for item in found] == [painter.id, glazier.id, cleaner.id]
    first, second, third = found
    assert first.cpv_match is not None
    assert (first.cpv_match.kind, first.cpv_match.label) == ("same_code", "Målning av byggnader")
    assert first.shared_words == ["invändigt", "fasader"]  # "invändig" in the job, the company's form shown
    assert first.cpv_labels == {"45442110": "Målning av byggnader"}
    assert first.employees == 5
    assert second.cpv_match is not None
    assert (second.cpv_match.kind, second.cpv_match.label) == ("same_group", None)  # 45441000 has no label
    # The cleaner shares no code but two of its words are in the job, which is the prefilter's other way in.
    assert third.cpv_match is None
    assert third.shared_words == ["korridorer", "förskolor"]
    dumped = first.model_dump()
    assert not {"description", "annual_turnover_sek", "insurance", "public_references"} & set(dumped)


async def test_find_suppliers_leaves_out_a_lab_company_past_its_retention(db_session: AsyncSession) -> None:
    now = datetime.now(UTC)
    live = await add_company(db_session, name="Labb Måleri", cpv_codes=["45442100"])
    live.is_lab = True
    live.expires_at = now + timedelta(days=1)
    expired = await add_company(db_session, name="Gammalt labbföretag", cpv_codes=["45442100"])
    expired.is_lab = True
    expired.expires_at = now - timedelta(minutes=1)
    await db_session.flush()

    found = await find_suppliers(db_session, SupplierSearch(cpv_codes=["45442100"]), now)
    assert [item.name for item in found] == ["Labb Måleri"]
    assert found[0].is_lab is True


def test_a_job_without_words_or_codes_is_refused_by_the_contract() -> None:
    with pytest.raises(ValueError, match="Beskriv uppdraget"):
        SupplierSearch(title="  ", description="")


async def test_a_company_without_codes_or_words_in_common_is_not_listed(db_session: AsyncSession) -> None:
    await add_company(db_session, name="Snickaren", description="Vi bygger trappor.", cpv_codes=["45421000"])
    found = await find_suppliers(
        db_session, SupplierSearch(title="Lokalvård i förskolor", cpv_codes=["90911200"]), datetime.now(UTC)
    )
    assert found == []
