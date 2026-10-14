"""The rule-based reading of a profile change (uppdatera_profil) in the heuristic engine."""

from __future__ import annotations

import pytest

from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.ai.profile_rules import CLARIFICATION, read_profile_change
from anbudsklar.contracts import CompanyProfile, CpvCandidate

PROFILE = CompanyProfile(
    name="Målerifirman i Matfors AB",
    description="Vi målar invändigt och utvändigt.",
    cpv_codes=["45442100", "45442110"],
    cpv_labels={"45442100": "Målning", "45442110": "Målning av byggnader"},
    municipalities=["Sundsvall", "Timrå"],
    employees=5,
    annual_turnover_sek=4_800_000,
    certifications=[],
    insurance="Ansvarsförsäkring 5 miljoner kronor",
    public_references=None,
)
CANDIDATES = [
    CpvCandidate(code="45442180", label="Ommålning"),
    CpvCandidate(code="45443000", label="Fasadarbeten"),
    CpvCandidate(code="90911200", label="Byggnadsrengöring"),
]


def test_numbers_and_certificates_are_read_from_plain_sentences() -> None:
    message = "Vi har numera tolv anställda, omsätter 6,5 miljoner och är ISO 14001-certifierade."
    change = read_profile_change(PROFILE, CANDIDATES, message)
    assert change.needs_clarification is False
    assert (change.employees, change.annual_turnover_sek) == (12, 6_500_000)
    assert change.certifications == ["ISO 14001"]
    assert change.description is None and change.cpv_add == [] and change.municipalities is None
    assert change.reply == "Jag uppdaterar antal anställda, årsomsättningen och certifieringarna i er profil."


@pytest.mark.parametrize(
    ("message", "turnover"),
    [
        ("Omsättningen är 12 mnkr.", 12_000_000),
        ("Vi omsätter cirka 850 tkr per år.", 850_000),
        ("Årsomsättning: 4 800 000 kr", 4_800_000),
        ("Omsättning 5", 5_000_000),  # a bare small number is read as millions
    ],
)
def test_turnover_units(message: str, turnover: int) -> None:
    assert read_profile_change(PROFILE, [], message).annual_turnover_sek == turnover


def test_municipalities_are_added_after_i_and_removed_on_request() -> None:
    added = read_profile_change(PROFILE, [], "Vi är också verksamma i Härnösand och Örnsköldsvik.")
    assert added.municipalities == ["Sundsvall", "Timrå", "Härnösand", "Örnsköldsvik"]
    removed = read_profile_change(PROFILE, [], "Ta bort att vi jobbar i Timrå.")
    assert removed.municipalities == ["Sundsvall"]
    # "Sundsvalls kommun" names the municipality the profile already has: nothing changes.
    assert read_profile_change(PROFILE, [], "Vi jobbar i Sundsvalls kommun.").needs_clarification is True


def test_cpv_codes_come_only_from_the_candidates_and_match_the_messages_words() -> None:
    change = read_profile_change(PROFILE, CANDIDATES, "Lägg till att vi även gör fasadarbeten och ommålning.")
    assert sorted(change.cpv_add) == ["45442180", "45443000"]
    assert change.cpv_remove == []
    removed = read_profile_change(PROFILE, CANDIDATES, "Vi gör inte längre målning av byggnader.")
    assert removed.cpv_remove == ["45442110"]
    assert removed.cpv_add == []


def test_description_insurance_and_references_take_whole_sentences() -> None:
    change = read_profile_change(
        PROFILE,
        [],
        "Ändra beskrivningen till: Vi är ett måleri i Matfors som målar skolor och förskolor.",
    )
    assert change.description == "Vi är ett måleri i Matfors som målar skolor och förskolor."
    change = read_profile_change(PROFILE, [], "Vi har en ansvarsförsäkring på 10 miljoner kronor.")
    assert change.insurance == "Vi har en ansvarsförsäkring på 10 miljoner kronor."
    change = read_profile_change(PROFILE, [], "Vi hade ett referensuppdrag för Timrå kommun 2025.")
    assert change.public_references == "Vi hade ett referensuppdrag för Timrå kommun 2025."


def test_an_unclear_message_changes_nothing_and_asks() -> None:
    change = read_profile_change(PROFILE, CANDIDATES, "Hej, kan ni hjälpa oss?")
    assert change.needs_clarification is True
    assert change.reply == CLARIFICATION
    assert change.model_dump(exclude={"reply", "needs_clarification"}) == {
        "description": None,
        "cpv_add": [],
        "cpv_remove": [],
        "municipalities": None,
        "employees": None,
        "annual_turnover_sek": None,
        "certifications": None,
        "insurance": None,
        "public_references": None,
    }


async def test_the_engine_reports_no_tools_and_no_model() -> None:
    change, run = await HeuristicEngine().update_profile(PROFILE, CANDIDATES, [], "Vi har åtta anställda.")
    assert change.employees == 8
    assert (run.engine, run.model, run.tools) == ("heuristic", None, [])
