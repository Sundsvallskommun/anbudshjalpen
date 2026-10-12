"""CPV suggestions: the engine picks areas first, then exact codes, and never invents a code."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import EngineRun
from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.contracts import CpvCandidate, CpvSuggestion, CpvSuggestions
from anbudsklar.services.profiles import suggest_cpv
from anbudsklar.services.text import keywords
from api.factories import add_cpv_codes

# Fictitious labels in the shape of the real list: two divisions, a group, and codes below.
CPV = {
    "45000000": "Anläggningsarbete",
    "45400000": "Färdigställande byggnadsarbeten",
    "45430000": "Golv- och väggbeläggning",
    "45431000": "Plattsättning",
    "45442100": "Målning",
    "90000000": "Avlopps- och avfallshantering, sanering och miljötjänster",
    "90910000": "Städning",
}
AREAS = ["45000000", "45400000", "90000000"]


class ScriptedEngine(HeuristicEngine):
    """Answers each call with the next scripted pick and records what it was offered."""

    def __init__(self, picks: list[list[str]]) -> None:
        super().__init__()
        self.picks = list(picks)
        self.offered: list[list[str]] = []

    async def suggest_cpv(
        self, description: str, candidates: list[CpvCandidate]
    ) -> tuple[CpvSuggestions, EngineRun]:
        self.offered.append([candidate.code for candidate in candidates])
        labels = {candidate.code: candidate.label for candidate in candidates}
        picked = [
            CpvSuggestion(code=code, label=labels.get(code, "?"), reason="test") for code in self.picks.pop(0)
        ]
        return CpvSuggestions(suggestions=picked), EngineRun(engine="scripted")


async def test_areas_first_then_the_codes_under_them(db_session: AsyncSession) -> None:
    await add_cpv_codes(db_session, CPV)
    engine = ScriptedEngine([["45400000"], ["45431000", "45442100"]])

    view = await suggest_cpv(db_session, engine, "Vi renoverar badrum.")

    assert engine.offered[0] == AREAS  # the whole list of areas, nothing narrower
    assert set(engine.offered[1]) == {"45400000", "45430000", "45431000", "45442100"}  # under the area
    assert [(item.code, item.label) for item in view.suggestions.suggestions] == [
        ("45431000", "Plattsättning"),
        ("45442100", "Målning"),
    ]


async def test_invented_codes_are_dropped_and_the_keyword_search_still_helps(
    db_session: AsyncSession,
) -> None:
    await add_cpv_codes(db_session, CPV)
    engine = ScriptedEngine([["12345678"], ["99999999", "45442100"]])

    view = await suggest_cpv(db_session, engine, "Vi är ett familjeföretag som utför målning.")

    assert "12345678" not in engine.offered[1] and "99999999" not in engine.offered[1]
    assert "45442100" in engine.offered[1]  # found by the keyword search, no area chosen
    assert [item.code for item in view.suggestions.suggestions] == ["45442100"]


def test_keywords_keep_the_last_words_too() -> None:
    text = (
        "Vi är ett litet familjeföretag i Matfors som sedan 2005 målar fasader, tapetserar och sätter kakel."
    )

    assert keywords(text)[-3:] == ["tapetserar", "sätter", "kakel"]
    assert keywords(text, limit=2) == ["litet", "familjeföretag"]
