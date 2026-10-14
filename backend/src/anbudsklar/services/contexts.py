"""Build AI task inputs from database rows."""

from __future__ import annotations

from collections.abc import Mapping

from anbudsklar.contracts import CompanyProfile, NoticeContext, deadline_kind
from anbudsklar.models import Company, Notice


def _own_labels(codes: list[str], labels: Mapping[str, str] | None) -> dict[str, str]:
    """The labels of these codes only, so an engine reads the CPV list's words, not just numbers."""

    return {code: labels[code] for code in codes if labels and code in labels}


def unread_filenames(notice: Notice) -> list[str]:
    """The names of the source's files that were not read in, for the engines and the API."""

    return [str(item["filename"]) for item in notice.unread_files or [] if item.get("filename")]


def notice_context(notice: Notice, cpv_labels: Mapping[str, str] | None = None) -> NoticeContext:
    codes = list(notice.cpv_codes or [])
    return NoticeContext(
        notice_id=str(notice.id),
        title=notice.title,
        buyer=notice.buyer,
        description=notice.description,
        cpv_codes=codes,
        cpv_labels=_own_labels(codes, cpv_labels),
        procedure=notice.procedure,
        deadline_at=notice.deadline_at,
        deadline_kind=deadline_kind(notice.deadline_kind),
        question_deadline_at=notice.question_deadline_at,
        url=notice.url,
    )


def company_profile(company: Company, cpv_labels: Mapping[str, str] | None = None) -> CompanyProfile:
    codes = list(company.cpv_codes or [])
    return CompanyProfile(
        name=company.name,
        description=company.description,
        cpv_codes=codes,
        cpv_labels=_own_labels(codes, cpv_labels),
        municipalities=list(company.municipalities or []),
        employees=company.employees,
        annual_turnover_sek=company.annual_turnover_sek,
        certifications=list(company.certifications or []),
        insurance=company.insurance,
        public_references=company.public_references,
    )
