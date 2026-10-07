"""notice deadline kind: sista anbudsdag or sista dag för anbudsansökan

Revision ID: c3d8f1a6e2b4
Revises: 0a908af70e75
Create Date: 2026-10-07 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d8f1a6e2b4"
down_revision: str | Sequence[str] | None = "0a908af70e75"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# A TED notice whose deadline came from the request date alone: a restricted procedure's
# notice, which gives the last day for anbudsansökan (eForms BT-1311) and no tender deadline.
_MARK_REQUEST_DEADLINES = sa.text(
    "UPDATE notices SET deadline_kind = 'request'"
    " WHERE source = 'ted' AND deadline_at IS NOT NULL"
    " AND coalesce(raw->'deadline-receipt-tender-date-lot', '[]'::jsonb) IN ('[]'::jsonb, 'null'::jsonb)"
    " AND jsonb_typeof(raw->'deadline-receipt-request-date-lot') = 'array'"
    " AND raw->'deadline-receipt-request-date-lot' <> '[]'::jsonb"
)
# Unsent sista anbudsdag reminders that followed such a date now have a kind of their own.
# Where a published checklist names sista anbudsdag, the reminder already followed that
# date, the tender deadline, and stays as it is.
_MOVE_REQUEST_REMINDERS = sa.text(
    "UPDATE reminders SET kind = 'anbudsansokan'"
    " FROM notices"
    " WHERE notices.id = reminders.notice_id AND notices.deadline_kind = 'request'"
    " AND reminders.kind = 'sista_anbudsdag' AND reminders.sent_at IS NULL"
    " AND NOT EXISTS ("
    " SELECT 1 FROM checklists, jsonb_array_elements(checklists.payload->'dates') AS entry"
    " WHERE checklists.notice_id = notices.id AND checklists.status = 'published'"
    " AND entry->>'kind' = 'sista_anbudsdag' AND entry->>'date' IS NOT NULL)"
)


def upgrade() -> None:
    """Record what a notice's deadline is the last day for, so the app names it right.

    Every stored notice gets "tender", the only kind there was. TED notices whose deadline
    came from the request date get "request" here; the next TED ingestion sets it as well.
    """
    op.add_column(
        "notices",
        sa.Column("deadline_kind", sa.String(length=16), server_default="tender", nullable=False),
    )
    op.execute(_MARK_REQUEST_DEADLINES)
    op.execute(_MOVE_REQUEST_REMINDERS)


def downgrade() -> None:
    op.execute("UPDATE reminders SET kind = 'sista_anbudsdag' WHERE kind = 'anbudsansokan'")
    op.drop_column("notices", "deadline_kind")
