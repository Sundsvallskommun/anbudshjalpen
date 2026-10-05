"""What a fixture notice consists of: notice metadata, key dates and document content."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from fixturegen.blocks import Block, Cover
from fixturegen.dates import DateBook, KeyDate

BUYER = "Sundsvalls kommun"
BUYER_CONTACT = "Lars Holm, upphandlare, Inköp"
DISCLAIMER = (
    "FIKTIVT UNDERLAG. Det här dokumentet är påhittat och har tagits fram för att demonstrera "
    "tjänsten Anbudsklar. Uppdraget, platserna, personerna och alla uppgifter är fiktiva. Det är "
    "inte en verklig upphandling från Sundsvalls kommun, och det går inte att lämna anbud på den."
)


@dataclass(frozen=True)
class NoticeSpec:
    slug: str  # folder name; the notice's external id is "fixture-<slug>"
    title: str
    reference_number: str
    description: str
    procedure: str
    cpv_codes: tuple[str, ...]  # CPV 2008 codes, 8 digits without check digit
    place: str
    estimated_value_sek: int
    key_dates: tuple[KeyDate, ...]
    published: str  # key date name of the publication day
    deadline: str  # key date name of the tender deadline
    filename: str
    with_toc: bool
    build_cover: Callable[[DateBook], Cover]
    build_blocks: Callable[[DateBook], list[Block]]
    buyer: str = BUYER
    deadline_time: str = "23:59"

    @property
    def external_id(self) -> str:
        return f"fixture-{self.slug}"

    @property
    def header_left(self) -> str:
        return f"{self.buyer} – {self.title}"
