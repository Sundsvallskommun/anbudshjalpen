"""Content blocks that the fixture documents are written in.

Documents are plain lists of blocks so that the Swedish text reads top to bottom in
the content modules, while layout and page tracking live in `pdf.py`. A `Req` block is
a paragraph that holds exactly one true requirement; the renderer records the page it
lands on and turns it into a facit item for the quality test.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from anbudsklar.contracts.tasks import RequirementKind

MAX_QUOTE_CHARS = 160
# A sentence ends at ".", "!" or "?" before a capital or digit, except after "kap." and "kl."
# ("enligt 15 kap. 1 § LOU", "kl. 23.59").
_SENTENCE_END = re.compile(r"(?<!\bkap\.)(?<!\bkl\.)(?<=[.!?])\s+(?=[A-ZÅÄÖ0-9])")


@dataclass(frozen=True)
class Chapter:
    """A numbered main chapter. It starts on a new page and appears in the table of contents."""

    text: str
    new_page: bool = True


@dataclass(frozen=True)
class Heading:
    """A sub-heading, kept on the same page as the start of the following block."""

    text: str


@dataclass(frozen=True)
class Para:
    text: str


@dataclass(frozen=True)
class Req:
    """A paragraph with one requirement that the supplier or the tender must meet."""

    text: str
    kind: RequirementKind
    title: str
    quote: str | None = None
    key: str | None = None  # stable handle for cross-references (expected review results)

    @property
    def quote_fragment(self) -> str:
        """Verbatim fragment used in the facit: the given quote or the first sentence."""

        if self.quote is not None:
            if self.quote not in self.text:
                raise ValueError(f"Quote is not part of the requirement text: {self.quote!r}")
            return self.quote
        first_sentence = _SENTENCE_END.split(self.text, maxsplit=1)[0]
        if len(first_sentence) <= MAX_QUOTE_CHARS:
            return first_sentence
        fragment = first_sentence[:MAX_QUOTE_CHARS].rsplit(" ", 1)[0]
        if fragment.count("(") > fragment.count(")"):
            fragment = fragment[: fragment.rfind("(")]  # never end inside a parenthesis
        return fragment.rstrip(" ,;:")


@dataclass(frozen=True)
class Tracked:
    """A paragraph whose page is recorded under `key` (used for tender-draft answers)."""

    key: str
    text: str


@dataclass(frozen=True)
class Bullets:
    items: tuple[str, ...]


@dataclass(frozen=True)
class Table:
    rows: tuple[tuple[str, ...], ...]
    widths: tuple[float, ...]
    header: bool = True


@dataclass(frozen=True)
class Notice:
    """A framed note, used for the fictitious-data disclaimer."""

    text: str


@dataclass(frozen=True)
class Signature:
    """Blank lines for place, date, signature and name."""

    labels: tuple[str, ...] = ("Ort och datum", "Underskrift", "Namnförtydligande", "Befattning")


@dataclass(frozen=True)
class PageBreak:
    pass


Block = Chapter | Heading | Para | Req | Tracked | Bullets | Table | Notice | Signature | PageBreak


@dataclass(frozen=True)
class Cover:
    """The first page of a document."""

    kicker: str  # e.g. "Förfrågningsunderlag"
    title: str
    facts: tuple[tuple[str, str], ...]  # label, value
    disclaimer: str
