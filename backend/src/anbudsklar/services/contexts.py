"""Build AI task inputs from database rows."""

from __future__ import annotations

from anbudsklar.contracts import CompanyProfile, NoticeContext
from anbudsklar.models import Company, Notice


def notice_context(notice: Notice) -> NoticeContext:
    return NoticeContext(
        notice_id=str(notice.id),
        title=notice.title,
        buyer=notice.buyer,
        description=notice.description,
        cpv_codes=list(notice.cpv_codes or []),
        procedure=notice.procedure,
        deadline_at=notice.deadline_at,
        url=notice.url,
    )


def company_profile(company: Company) -> CompanyProfile:
    return CompanyProfile(
        name=company.name,
        description=company.description,
        cpv_codes=list(company.cpv_codes or []),
        municipalities=list(company.municipalities or []),
        employees=company.employees,
        annual_turnover_sek=company.annual_turnover_sek,
        certifications=list(company.certifications or []),
        insurance=company.insurance,
        public_references=company.public_references,
    )
