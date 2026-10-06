"""assessment version and no engine prefix in reviewed texts

Revision ID: 0a908af70e75
Revises: 16f1b9bddd87
Create Date: 2026-10-05 23:31:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0a908af70e75"
down_revision: str | Sequence[str] | None = "16f1b9bddd87"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The lead-in the heuristic engine used to put before its texts. How a text was made is now
# carried by the engine name beside it, so the texts read the same whichever engine wrote them.
_PREFIX = r"^\s*Automatisk sammanställning utan språkmodell:\s*"

# Drop the lead-in from payload.summary and capitalise what follows ("underlaget har …").
_STRIP_CHECKLIST_SUMMARIES = sa.text(
    "WITH cleaned AS ("
    " SELECT id, regexp_replace(payload->>'summary', :prefix, '', 'i') AS rest FROM checklists"
    " WHERE status IN ('approved', 'published') AND payload->>'summary' ~* :prefix)"
    " UPDATE checklists AS target"
    " SET payload = jsonb_set(target.payload, '{summary}',"
    " to_jsonb(upper(left(cleaned.rest, 1)) || substr(cleaned.rest, 2)))"
    " FROM cleaned WHERE target.id = cleaned.id"
)
_STRIP_MATCH_SUMMARIES = sa.text(
    "WITH cleaned AS ("
    " SELECT id, regexp_replace(payload->>'summary', :prefix, '', 'i') AS rest FROM match_assessments"
    " WHERE payload->>'summary' ~* :prefix)"
    " UPDATE match_assessments AS target"
    " SET payload = jsonb_set(target.payload, '{summary}',"
    " to_jsonb(upper(left(cleaned.rest, 1)) || substr(cleaned.rest, 2)))"
    " FROM cleaned WHERE target.id = cleaned.id"
)


def upgrade() -> None:
    """Re-assess matches made before the wording changed and drop the lead-in where inköp has approved.

    Assessments get the version they were made under. Stored ones have none, so the next
    match run makes them again: their reasons then name CPV codes in words. Until then, and
    for those no run reaches (closed notices), their summary loses the lead-in here.
    Approved and published checklists, which inköp has reviewed and which MCP and Eneo's
    assistants read, lose it from their summary too. Drafts and rejected checklists keep it:
    the buyer's review flags it as engine text to rewrite.
    """
    op.add_column("match_assessments", sa.Column("assessment_version", sa.String(length=32), nullable=True))
    op.execute(_STRIP_CHECKLIST_SUMMARIES.bindparams(prefix=_PREFIX))
    op.execute(_STRIP_MATCH_SUMMARIES.bindparams(prefix=_PREFIX))


def downgrade() -> None:
    """The version goes; the lead-in is not put back (the texts read the same without it)."""
    op.drop_column("match_assessments", "assessment_version")
