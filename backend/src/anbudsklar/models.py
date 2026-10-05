"""Database models (SQLAlchemy 2.0, PostgreSQL).

Search uses PostgreSQL itself: generated `tsvector` columns with the Swedish text
search configuration, plus `pg_trgm` for fuzzy matching (see decision 0005). Company
data is kept to a minimum and every company-owned row carries `company_id` so that
queries can be scoped per company.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any, ClassVar

from sqlalchemy import (
    BigInteger,
    Boolean,
    Computed,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    type_annotation_map: ClassVar[dict[Any, Any]] = {dict[str, Any]: JSONB, list[str]: ARRAY(Text)}


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _changed_at() -> Mapped[datetime]:
    """When a row last changed, set by the application clock.

    Freshness checks (e.g. matching) compare these with other application-set times.
    The database clock (`now()` is the transaction start, and Postgres may run on another
    clock) would make such comparisons depend on timing, so it is only the fallback for
    rows inserted outside the ORM.
    """

    return mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, server_default=func.now()
    )


def _created_at() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# --- Procurement data ---------------------------------------------------------------


class Notice(Base):
    """A procurement notice from TED, e-Avrop, the fixtures or manual entry."""

    __tablename__ = "notices"
    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_notices_source_external_id"),
        Index("ix_notices_search", "search", postgresql_using="gin"),
        Index("ix_notices_cpv_codes", "cpv_codes", postgresql_using="gin"),
        Index(
            "ix_notices_title_trgm",
            "title",
            postgresql_using="gin",
            postgresql_ops={"title": "gin_trgm_ops"},
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    source: Mapped[str] = mapped_column(String(32))  # ted | eavrop | fixture | manual
    external_id: Mapped[str] = mapped_column(String(128))
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    buyer: Mapped[str | None] = mapped_column(Text)
    cpv_codes: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    notice_type: Mapped[str | None] = mapped_column(String(64))  # contract | award | planned | ...
    procedure: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="open")  # open | closed | awarded | planned
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    estimated_value_sek: Mapped[int | None] = mapped_column(BigInteger)
    place: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text)
    documents_url: Mapped[str | None] = mapped_column(Text)
    is_fictitious: Mapped[bool] = mapped_column(Boolean, default=False)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    search: Mapped[Any] = mapped_column(
        TSVECTOR,
        Computed(
            "setweight(to_tsvector('swedish', coalesce(title, '')), 'A') || "
            "setweight(to_tsvector('swedish', coalesce(description, '')), 'B') || "
            "setweight(to_tsvector('swedish', coalesce(buyer, '')), 'C')",
            persisted=True,
        ),
    )
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _changed_at()

    documents: Mapped[list[Document]] = relationship(back_populates="notice")
    checklists: Mapped[list[ChecklistRecord]] = relationship(back_populates="notice")


class Document(Base):
    """A procurement document (förfrågningsunderlag) attached to a notice.

    The `interpret_*` columns hold the state of failed interpretations, so that the
    worker backs off instead of resending a failing document every run: no failures
    (attempts 0), waiting for a retry (`interpret_retry_at` set), or given up (attempts
    above 0 and no retry time) until a buyer asks for a new interpretation.
    """

    __tablename__ = "documents"
    __table_args__ = (UniqueConstraint("notice_id", "sha256", name="uq_documents_notice_sha256"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    notice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notices.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(Text)
    mimetype: Mapped[str] = mapped_column(String(128))
    sha256: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(Integer)
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    storage_path: Mapped[str] = mapped_column(Text)
    is_fictitious: Mapped[bool] = mapped_column(Boolean, default=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    interpret_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    interpret_error: Mapped[str | None] = mapped_column(Text)
    interpret_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created_at()

    notice: Mapped[Notice] = relationship(back_populates="documents")
    pages: Mapped[list[DocumentPage]] = relationship(
        back_populates="document", order_by="DocumentPage.page_no", cascade="all, delete-orphan"
    )


class DocumentPage(Base):
    """Extracted text for one page, indexed for full-text and fuzzy search."""

    __tablename__ = "document_pages"
    __table_args__ = (
        Index("ix_document_pages_search", "search", postgresql_using="gin"),
        Index(
            "ix_document_pages_text_trgm",
            "text",
            postgresql_using="gin",
            postgresql_ops={"text": "gin_trgm_ops"},
        ),
    )

    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    page_no: Mapped[int] = mapped_column(Integer, primary_key=True)  # 1-based
    text: Mapped[str] = mapped_column(Text, default="")
    section: Mapped[str | None] = mapped_column(String(64))  # e.g. kvalificering, utvardering
    search: Mapped[Any] = mapped_column(
        TSVECTOR, Computed("to_tsvector('swedish', coalesce(text, ''))", persisted=True)
    )

    document: Mapped[Document] = relationship(back_populates="pages")


class ChecklistRecord(Base):
    """An AI-produced checklist for a notice and its approval state.

    Status moves draft -> approved -> published (or rejected). Only published
    checklists are shown to companies and exposed over MCP. This mirrors the human
    review checkpoint of an Eneo Flow.
    """

    __tablename__ = "checklists"

    id: Mapped[uuid.UUID] = _uuid_pk()
    notice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notices.id", ondelete="CASCADE"))
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(16), default="draft")
    engine: Mapped[str] = mapped_column(String(32))
    model: Mapped[str | None] = mapped_column(Text)
    contract_version: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)  # contracts.Checklist
    verification: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)  # summary counts
    reviewer_note: Mapped[str | None] = mapped_column(Text)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created_at()

    notice: Mapped[Notice] = relationship(back_populates="checklists")


class Agreement(Base):
    """An entry in the procurement department's agreement catalogue (avtalskatalog)."""

    __tablename__ = "agreements"

    id: Mapped[uuid.UUID] = _uuid_pk()
    external_id: Mapped[str] = mapped_column(String(128), unique=True)
    title: Mapped[str] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(Text)
    cpv_codes: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    supplier: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    extension_months: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    max_end_date: Mapped[date | None] = mapped_column(Date)
    previous_requirements: Mapped[str | None] = mapped_column(Text)
    is_fictitious: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _created_at()


class LouSection(Base):
    """One section (paragraf) of LOU (SFS 2016:1145), from Riksdagen's open data."""

    __tablename__ = "lou_sections"
    __table_args__ = (
        UniqueConstraint("chapter", "section", name="uq_lou_sections_chapter_section"),
        Index("ix_lou_sections_search", "search", postgresql_using="gin"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    chapter: Mapped[str] = mapped_column(String(8))  # "4", "19 a" (LOU has lettered chapters)
    chapter_title: Mapped[str | None] = mapped_column(Text)
    section: Mapped[str] = mapped_column(String(16))  # "1", "2 a"
    heading: Mapped[str | None] = mapped_column(Text)
    text: Mapped[str] = mapped_column(Text)
    sort_key: Mapped[int] = mapped_column(Integer, default=0)
    consolidated_through: Mapped[str | None] = mapped_column(String(32))  # e.g. "SFS 2026:880"
    search: Mapped[Any] = mapped_column(
        TSVECTOR,
        Computed(
            "setweight(to_tsvector('swedish', "
            "coalesce(heading, '') || ' ' || coalesce(chapter_title, '')), 'A') || "
            "setweight(to_tsvector('swedish', coalesce(text, '')), 'B')",
            persisted=True,
        ),
    )


class CpvCode(Base):
    """The EU Common Procurement Vocabulary (CPV 2008) with Swedish labels."""

    __tablename__ = "cpv_codes"
    __table_args__ = (
        Index(
            "ix_cpv_codes_label_trgm",
            "label_sv",
            postgresql_using="gin",
            postgresql_ops={"label_sv": "gin_trgm_ops"},
        ),
        Index("ix_cpv_codes_search", "search", postgresql_using="gin"),
    )

    code: Mapped[str] = mapped_column(String(8), primary_key=True)  # without check digit
    label_sv: Mapped[str] = mapped_column(Text)
    parent_code: Mapped[str | None] = mapped_column(String(8))
    level: Mapped[int] = mapped_column(Integer)
    search: Mapped[Any] = mapped_column(
        TSVECTOR, Computed("to_tsvector('swedish', coalesce(label_sv, ''))", persisted=True)
    )


# --- Companies, users and their data ------------------------------------------------


class Company(Base):
    """A company profile. In the PoC all companies are fictitious demo companies."""

    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = _uuid_pk()
    org_number: Mapped[str | None] = mapped_column(String(16), unique=True)
    name: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text, default="")
    cpv_codes: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    municipalities: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    employees: Mapped[int | None] = mapped_column(Integer)
    annual_turnover_sek: Mapped[int | None] = mapped_column(BigInteger)
    certifications: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    insurance: Mapped[str | None] = mapped_column(Text)
    public_references: Mapped[str | None] = mapped_column(Text)
    is_fictitious: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _changed_at()


class User(Base):
    """A demo user. PoC-only: login is a persona picker, not real authentication."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text, unique=True)
    role: Mapped[str] = mapped_column(String(16))  # foretagare | inkopare
    company_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("companies.id"))
    created_at: Mapped[datetime] = _created_at()


class MatchRecord(Base):
    """A fit assessment of one notice for one company (contracts.MatchAssessment).

    A record whose notice no longer passes the prefilter is marked `stale` rather than
    deleted, so that `dismissed` and `notified_at` survive when it passes again.
    """

    __tablename__ = "match_assessments"
    __table_args__ = (UniqueConstraint("company_id", "notice_id", name="uq_match_company_notice"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    notice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notices.id", ondelete="CASCADE"))
    fit: Mapped[str] = mapped_column(String(16))
    prefilter_score: Mapped[float | None] = mapped_column()
    engine: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    stale: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # every user has been told
    created_at: Mapped[datetime] = mapped_column(  # when assessed; compared with _changed_at() values
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False
    )


class MatchNotification(Base):
    """One "Ny träff" e-mail to one user about one notice.

    The unique constraint is the claim: a row is inserted before the mail is sent, so
    each user gets at most one mail per notice even when runs overlap or a run dies.
    """

    __tablename__ = "match_notifications"
    __table_args__ = (UniqueConstraint("user_id", "notice_id", name="uq_match_notifications_user_notice"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    notice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notices.id", ondelete="CASCADE"))
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class QuestionLog(Base):
    """A question asked about a notice, kept for aggregated insights only.

    Insights never expose `company_id`, and are shown to buyers only after the
    tender deadline (see docs/architecture.md, Dataskydd).
    """

    __tablename__ = "question_logs"

    id: Mapped[uuid.UUID] = _uuid_pk()
    notice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notices.id", ondelete="CASCADE"))
    company_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("companies.id", ondelete="SET NULL"))
    question: Mapped[str] = mapped_column(Text)
    found_in_document: Mapped[bool | None] = mapped_column(Boolean)
    suggested_formal_question: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _created_at()


class Reminder(Base):
    """An e-mail reminder for a deadline, sent by the worker."""

    __tablename__ = "reminders"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    notice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notices.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(32))  # fragestopp | sista_anbudsdag | egen
    note: Mapped[str | None] = mapped_column(Text)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created_at()


class JobRun(Base):
    """Bookkeeping for scheduled and manual jobs (ingestion, extraction, matching)."""

    __tablename__ = "job_runs"

    id: Mapped[uuid.UUID] = _uuid_pk()
    job: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="running")  # running | ok | failed
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stats: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    error: Mapped[str | None] = mapped_column(Text)
