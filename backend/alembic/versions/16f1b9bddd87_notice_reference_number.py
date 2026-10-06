"""notice reference number

Revision ID: 16f1b9bddd87
Revises: b7e4c2a91d35
Create Date: 2026-10-05 23:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "16f1b9bddd87"
down_revision: str | Sequence[str] | None = "b7e4c2a91d35"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """The reference people quote for a procurement ("Sundsvalls kommun · DEMO-2026-0147").

    Stored rows get it from what they already hold: the fixture's number, which the seed kept
    in `raw`, and e-Avrop's id for notices from its advertised list. TED notices get theirs
    (eForms BT-22) when the next ingestion asks TED for the field.
    """
    op.add_column("notices", sa.Column("reference_number", sa.Text(), nullable=True))
    op.execute(
        "UPDATE notices SET reference_number = NULLIF(btrim(raw->>'reference_number'), '') "
        "WHERE source = 'fixture' AND raw->>'reference_number' IS NOT NULL"
    )
    op.execute(
        "UPDATE notices SET reference_number = raw->>'eavrop_id' "
        "WHERE source = 'eavrop' AND raw->>'list' = 'advertised' AND raw->>'eavrop_id' IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column("notices", "reference_number")
