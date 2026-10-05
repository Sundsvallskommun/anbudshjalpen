"""PDF layout for the fixture documents (fpdf2 with an embedded DejaVu font).

Every page carries the footer "FIKTIVT UNDERLAG – endast för demonstration". Requirement
paragraphs are never split across pages, so the page recorded for a facit item is the
page where its whole text, including the quote fragment, can be found.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import MethodReturnValue, XPos, YPos
from fpdf.fonts import FontFace
from fpdf.outline import OutlineSection

from fixturegen.blocks import (
    Block,
    Bullets,
    Chapter,
    Cover,
    Heading,
    Notice,
    PageBreak,
    Para,
    Req,
    Signature,
    Table,
    Tracked,
)

FONT_DIR = Path(__file__).resolve().parents[1] / "fonts"
FONT = "DejaVu"
FOOTER_TEXT = "FIKTIVT UNDERLAG – endast för demonstration"
PRODUCER = "Anbudsklar fixture builder (fpdf2)"

BODY_SIZE = 10
TABLE_SIZE = 9
LINE = 4.9
KEEP_TOGETHER_MAX_LINES = 10
COVER_LABEL_WIDTH = 56
INK = (25, 25, 25)
MUTED = (95, 95, 95)
ACCENT = (150, 20, 30)
NOTE_FILL = (246, 238, 228)
RULE = (150, 150, 150)


@dataclass(frozen=True)
class FacitItem:
    id: str
    kind: str
    page: int
    quote_fragment: str
    title: str

    def to_json(self) -> dict[str, object]:
        return {
            "id": self.id,
            "kind": self.kind,
            "page": self.page,
            "quote_fragment": self.quote_fragment,
            "title": self.title,
        }


@dataclass
class Rendered:
    data: bytes
    page_count: int
    facit: list[FacitItem] = field(default_factory=list)
    facit_ids_by_key: dict[str, str] = field(default_factory=dict)
    tracked_pages: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class DocumentMeta:
    title: str
    header_left: str
    header_right: str
    created: datetime
    with_toc: bool = True


class FixturePdf(FPDF):
    """A4 page with a running header (from page 2) and the fictitious-data footer."""

    def __init__(self, meta: DocumentMeta) -> None:
        super().__init__(orientation="portrait", unit="mm", format="A4")
        self.meta = meta
        self.set_margins(left=22, top=22, right=22)
        self.set_auto_page_break(auto=True, margin=24)
        self.add_font(FONT, "", str(FONT_DIR / "DejaVuSansCondensed.ttf"))
        self.add_font(FONT, "B", str(FONT_DIR / "DejaVuSansCondensed-Bold.ttf"))
        self.add_font(FONT, "I", str(FONT_DIR / "DejaVuSansCondensed-Oblique.ttf"))
        self.set_creation_date(meta.created)
        self.set_producer(PRODUCER)
        self.set_creator(PRODUCER)
        self.set_title(meta.title)
        self.set_author("Anbudsklar – fiktiva testdata")
        self.set_subject(FOOTER_TEXT)
        self.set_keywords("fiktivt demonstration upphandling")
        self.set_lang("sv-SE")

    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font(FONT, "", 8)
        self.set_text_color(*MUTED)
        self.set_y(12)
        self.cell(w=self.epw * 0.7, h=5, text=self.meta.header_left)
        self.cell(w=self.epw * 0.3, h=5, text=self.meta.header_right, align="R")
        self.set_draw_color(*MUTED)
        self.line(self.l_margin, 18, self.w - self.r_margin, 18)
        self.set_y(self.t_margin)
        self.set_text_color(*INK)

    def footer(self) -> None:
        self.set_y(-16)
        self.set_font(FONT, "B", 8.5)
        self.set_text_color(*ACCENT)
        self.cell(w=self.epw, h=5, text=FOOTER_TEXT, align="C")
        self.set_y(-16)
        self.set_font(FONT, "", 8.5)
        self.set_text_color(*MUTED)
        self.cell(w=self.epw, h=5, text=f"Sida {self.page_no()} av {{nb}}", align="R")
        self.set_text_color(*INK)


def render(meta: DocumentMeta, cover: Cover, blocks: Sequence[Block]) -> Rendered:
    """Render a document and collect facit items and tracked pages."""

    renderer = _Renderer(FixturePdf(meta))
    renderer.cover(cover)
    renderer.start_body(with_toc=meta.with_toc)
    for block in blocks:
        renderer.block(block)
    data = bytes(renderer.pdf.output())
    renderer.result.data = data
    renderer.result.page_count = renderer.pdf.pages_count
    return renderer.result


def _render_toc(pdf: FPDF, outline: list[OutlineSection]) -> None:
    pdf.set_x(pdf.l_margin)
    pdf.set_font(FONT, "B", 16)
    pdf.cell(text="Innehåll", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(6)
    pdf.set_font(FONT, "", BODY_SIZE + 0.5)
    for section in outline:
        if section.level > 0:
            continue
        pdf.cell(w=pdf.epw - 15, h=7.5, text=section.name)
        pdf.cell(w=15, h=7.5, text=str(section.page_number), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)


class _Renderer:
    def __init__(self, pdf: FixturePdf) -> None:
        self.pdf = pdf
        self.result = Rendered(data=b"", page_count=0)
        self._at_page_top = True

    # --- cover --------------------------------------------------------------------

    def cover(self, cover: Cover) -> None:
        pdf = self.pdf
        pdf.add_page()
        pdf.set_y(40)
        pdf.set_font(FONT, "B", 11)
        pdf.set_text_color(*MUTED)
        pdf.cell(text=cover.kicker.upper(), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(4)
        pdf.set_font(FONT, "B", 24)
        pdf.set_text_color(*INK)
        pdf.multi_cell(w=pdf.epw, h=11, text=cover.title, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(10)
        pdf.set_font(FONT, "", BODY_SIZE + 0.5)
        for label, value in cover.facts:
            pdf.set_font(FONT, "B", BODY_SIZE + 0.5)
            pdf.cell(w=COVER_LABEL_WIDTH, h=7, text=label)
            pdf.set_font(FONT, "", BODY_SIZE + 0.5)
            pdf.multi_cell(
                w=pdf.epw - COVER_LABEL_WIDTH, h=7, text=value, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT
            )
        pdf.set_y(-95)
        self._notice(cover.disclaimer)

    def start_body(self, *, with_toc: bool) -> None:
        self.pdf.add_page()
        if with_toc:
            self.pdf.insert_toc_placeholder(_render_toc)  # reserves this page, continues on the next
        self._at_page_top = True

    # --- blocks -------------------------------------------------------------------

    def block(self, block: Block) -> None:
        match block:
            case Chapter():
                self._chapter(block)
            case Heading():
                self._heading(block.text)
            case Para():
                self._paragraph(block.text)
            case Req():
                self._requirement(block)
            case Tracked():
                self.result.tracked_pages[block.key] = self._paragraph(block.text, keep_together=True)
            case Bullets():
                self._bullets(block.items)
            case Table():
                self._table(block)
            case Notice():
                self._notice(block.text)
            case Signature():
                self._signature(block.labels)
            case PageBreak():
                self.pdf.add_page()
                self._at_page_top = True

    def _chapter(self, chapter: Chapter) -> None:
        pdf = self.pdf
        if (chapter.new_page and not self._at_page_top) or pdf.will_page_break(30):
            pdf.add_page()
        elif not self._at_page_top:
            pdf.ln(4)
        pdf.start_section(chapter.text, level=0)
        pdf.set_font(FONT, "B", 15)
        pdf.multi_cell(w=pdf.epw, h=8, text=chapter.text, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(3)
        self._at_page_top = False

    def _heading(self, text: str) -> None:
        pdf = self.pdf
        if pdf.will_page_break(7 + 4 * LINE):
            pdf.add_page()
        else:
            pdf.ln(2)
        pdf.set_font(FONT, "B", 11.5)
        pdf.multi_cell(w=pdf.epw, h=6.5, text=text, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(1)
        self._at_page_top = False

    def _paragraph(self, text: str, *, keep_together: bool = False) -> int:
        pdf = self.pdf
        pdf.set_font(FONT, "", BODY_SIZE)
        lines = pdf.multi_cell(w=pdf.epw, h=LINE, text=text, dry_run=True, output=MethodReturnValue.LINES)
        assert isinstance(lines, list)
        if (keep_together or len(lines) <= KEEP_TOGETHER_MAX_LINES) and pdf.will_page_break(
            len(lines) * LINE
        ):
            pdf.add_page()
        page = pdf.page_no()
        pdf.multi_cell(w=pdf.epw, h=LINE, text=text, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(2.2)
        self._at_page_top = False
        return page

    def _requirement(self, req: Req) -> None:
        if "- " in req.quote_fragment:
            # Text extraction may join a hyphen at a line end with the next line.
            raise ValueError(f"Quote fragment must not contain '- ': {req.quote_fragment!r}")
        page = self._paragraph(req.text, keep_together=True)
        item = FacitItem(
            id=f"K{len(self.result.facit) + 1:02d}",
            kind=req.kind,
            page=page,
            quote_fragment=req.quote_fragment,
            title=req.title,
        )
        self.result.facit.append(item)
        if req.key is not None:
            if req.key in self.result.facit_ids_by_key:
                raise ValueError(f"Duplicate requirement key: {req.key}")
            self.result.facit_ids_by_key[req.key] = item.id

    def _bullets(self, items: Sequence[str]) -> None:
        pdf = self.pdf
        pdf.set_font(FONT, "", BODY_SIZE)
        indent = 5.0
        for item in items:
            lines = pdf.multi_cell(
                w=pdf.epw - indent, h=LINE, text=item, dry_run=True, output=MethodReturnValue.LINES
            )
            assert isinstance(lines, list)
            if pdf.will_page_break(len(lines) * LINE):
                pdf.add_page()
            pdf.set_x(pdf.l_margin)
            pdf.cell(w=indent, h=LINE, text="•")
            pdf.multi_cell(
                w=pdf.epw - indent, h=LINE, text=item, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT
            )
            pdf.ln(0.8)
        pdf.ln(1.6)
        self._at_page_top = False

    def _table(self, table: Table) -> None:
        pdf = self.pdf
        pdf.set_font(FONT, "", TABLE_SIZE)
        pdf.set_draw_color(*RULE)
        pdf.set_fill_color(255, 255, 255)
        if pdf.will_page_break(3 * LINE * 2):
            pdf.add_page()
        with pdf.table(
            col_widths=table.widths,
            text_align="LEFT",
            first_row_as_headings=table.header,
            headings_style=FontFace(emphasis="BOLD", fill_color=(232, 232, 232)),
            line_height=LINE,
            padding=1.6,
        ) as pdf_table:
            for row in table.rows:
                pdf_row = pdf_table.row()
                for cell in row:
                    pdf_row.cell(cell)
        pdf.ln(3)
        self._at_page_top = False

    def _notice(self, text: str) -> None:
        pdf = self.pdf
        pdf.set_font(FONT, "B", BODY_SIZE)
        pdf.set_fill_color(*NOTE_FILL)
        pdf.set_draw_color(*ACCENT)
        pdf.multi_cell(
            w=pdf.epw,
            h=LINE + 0.4,
            text=text,
            border=1,
            fill=True,
            align="L",
            padding=4,
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        pdf.ln(4)
        self._at_page_top = False

    def _signature(self, labels: Sequence[str]) -> None:
        pdf = self.pdf
        pdf.set_font(FONT, "", BODY_SIZE)
        if pdf.will_page_break(len(labels) * 12):
            pdf.add_page()
        for label in labels:
            pdf.ln(5)
            pdf.cell(w=45, h=LINE, text=f"{label}:")
            y = pdf.get_y() + LINE
            pdf.line(pdf.l_margin + 45, y, pdf.l_margin + 140, y)
            pdf.ln(LINE + 2)
        pdf.ln(2)
        self._at_page_top = False
