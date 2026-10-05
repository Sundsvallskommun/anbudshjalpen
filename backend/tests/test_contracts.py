"""Smoke tests for the contracts and the test database fixture."""

from sqlalchemy import text

from anbudsklar.contracts import Checklist, model_output_schema


def test_model_output_schema_hides_verification_keys() -> None:
    schema = model_output_schema(Checklist)
    citation = schema["$defs"]["Citation"]
    assert "check" not in citation["properties"]
    assert "found_page" not in citation["properties"]
    assert set(citation["required"]) == {"page", "quote"}


async def test_database_is_migrated(db_session) -> None:
    result = await db_session.execute(text("SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'"))
    assert result.scalar_one() == "pg_trgm"
