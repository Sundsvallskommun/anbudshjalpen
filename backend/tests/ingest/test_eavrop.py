"""e-Avrop's Projekt API: the allowlist, the public request, documents and the TED twin.

All responses here are synthetic and fictitious. Real responses cannot be recorded: the API is
the municipality's own and a project's response holds tenderers, prices and staff. The
synthetic project below carries such parts on purpose, so the tests can show they never leave
the response.
"""

from __future__ import annotations

import json
from copy import deepcopy
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
import respx
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import Settings
from anbudsklar.ingest.common import IngestError
from anbudsklar.ingest.eavrop import (
    PublicDocument,
    ingest_eavrop,
    main_document,
    map_procurement,
    parse_moment,
    public_procurement,
)
from anbudsklar.ingest.notices import STOCKHOLM, NoticeValues, eavrop_procurement_id
from anbudsklar.ingest.ted import TedRecord, upsert_ted_notices
from anbudsklar.models import Document, Notice

API = "https://www.e-avrop.com/api"
CLIENT_ID = 4242
LIST_URL = f"{API}/v1.1/clients/{CLIENT_ID}/procurements"
NOW = datetime(2026, 10, 8, 12, 0, tzinfo=UTC)

# Words from the secret parts of the synthetic project. None of them may be stored.
SECRET_WORDS = (
    "Fiktiv Anbudsgivare AB",
    "556000-0000",
    "anbud@fiktiv.example",
    "Handläggare Fiktivsson",
    "Utvärderingsprotokoll",
    "kreditupplysning",
    "project-documents",
)


def _document(doc_id: int, filename: str, updated: str | None = None) -> dict[str, Any]:
    document: dict[str, Any] = {
        "Url": f"{API}/v1/announcement-documents/{doc_id}",
        "Filename": filename,
        "Description": "",
    }
    if updated:
        document["UpdatedDate"] = updated
    return document


def _project(**changes: Any) -> dict[str, Any]:
    """A fictitious, announced one-step procurement with secret parts, as the API returns it."""

    project: dict[str, Any] = {
        "Type": "ProcurementProject",
        "ProjectId": 900100,
        "ProcurementId": 900001,
        "Category": "Fiktiv kategori",
        "AgreementType": "Contract",
        "Members": [{"Name": "Handläggare Fiktivsson", "Email": "handlaggare@fiktiv.example"}],
        "AgreementOwner": {"Name": "Handläggare Fiktivsson", "Email": "handlaggare@fiktiv.example"},
        "QualityResponsible": {"Name": "Handläggare Fiktivsson", "Email": "handlaggare@fiktiv.example"},
        "Title": "Fiktiv ommålning av förskola",
        "DiaryNumber": "UH-2026-9999",
        "Description": "Fiktiv upphandling för test. Målning av fasad.",
        "Value": {"Value": 1234567, "Currency": "SEK"},
        "CpvCodes": [{"Code": "45442110", "Description": "Målning av byggnader"}],
        "ProcurementType": "NationalOneStep",
        "HasLots": False,
        "TimeTable": {
            "LastQuestion": "2026-10-20T00:00:00+02:00",
            "LastBid": "2026-10-28T00:00:00+01:00",
        },
        "Events": [{"Event": "Created", "Date": "2026-09-01T09:00:00+02:00"}, {"Event": "Announced"}],
        "Documents": [
            {
                "Url": f"{API}/v1/project-documents/1",
                "Filename": "Utvärderingsprotokoll UH-2026-9999.xlsx",
                "IsClassified": False,
            },
            {
                "Url": f"{API}/v1/project-documents/2",
                "Filename": "kreditupplysning-fiktiv-anbudsgivare-ab.pdf",
                "IsClassified": False,
            },
        ],
        "Suppliers": [
            {
                "Company": "Fiktiv Anbudsgivare AB",
                "OrganizationNumber": "556000-0000",
                "Email": "anbud@fiktiv.example",
                "Bid": {"Price": 999000},
            }
        ],
        "Reports": [{"Url": f"{API}/v1/project-documents/3", "Filename": "Utvärderingsprotokoll.pdf"}],
        "LogFiles": [{"Url": f"{API}/v1/project-documents/4", "Filename": "logg.txt"}],
        "RequestForTender": {
            "AnnouncementDate": "2026-10-01T10:00:00+02:00",
            "UpdatedDate": "2026-10-01T10:00:00+02:00",
            "Documents": [
                _document(11, "Bilaga 1 Prisbilaga.xlsx"),
                _document(12, "Kravspecifikation fiktiv.txt"),
                _document(13, "Administrativa föreskrifter fiktiv.txt"),
            ],
        },
        "RequestForApplications": {},
    }
    project.update(changes)
    return project


def _list_item(project_id: int, updated: str = "2026-10-01T10:00:00+02:00") -> dict[str, str]:
    return {
        "Url": f"{API}/v1/procurements/{project_id}",
        "CreatedDate": "2026-09-01T09:00:00+02:00",
        "UpdatedDate": updated,
    }


@pytest.fixture
def api_settings(settings: Settings) -> Settings:
    return settings.model_copy(
        update={
            "eavrop_api_url": API,
            "eavrop_api_token": SecretStr("test-token"),
            "eavrop_client_id": CLIENT_ID,
            "eavrop_base_url": "https://www.e-avrop.com/sundsvall",
        }
    )


def _mock_documents(respx_mock: respx.MockRouter) -> dict[int, respx.Route]:
    routes = {}
    for doc_id, text in (
        (12, "Kravspecifikation. Leverantören ska måla fasaden."),
        (13, "Anbud ska lämnas på svenska."),
    ):
        routes[doc_id] = respx_mock.get(f"{API}/v1/announcement-documents/{doc_id}").mock(
            return_value=httpx.Response(
                200, content=text.encode(), headers={"Content-Type": "application/octet-stream"}
            )
        )
    return routes


# --- Reading a project ---------------------------------------------------------------


def test_midnight_is_the_end_of_the_day_before() -> None:
    assert parse_moment("2026-10-31T00:00:00+01:00") == datetime(2026, 10, 30, 23, 59, 59, tzinfo=STOCKHOLM)
    assert parse_moment("2026-10-30T12:00:00+01:00") == datetime(2026, 10, 30, 12, 0, tzinfo=STOCKHOLM)
    assert parse_moment(None) is None
    assert parse_moment("inte ett datum") is None


def test_public_procurement_reads_only_the_allowlist() -> None:
    procurement = public_procurement(_project(), API)

    assert procurement is not None
    assert procurement.procurement_id == "900001"
    assert procurement.stage == "tender"
    assert procurement.deadline == datetime(2026, 10, 27, 23, 59, 59, tzinfo=STOCKHOLM)
    assert procurement.question_deadline == datetime(2026, 10, 19, 23, 59, 59, tzinfo=STOCKHOLM)
    assert [document.filename for document in procurement.documents] == [
        "Bilaga 1 Prisbilaga.xlsx",
        "Kravspecifikation fiktiv.txt",
        "Administrativa föreskrifter fiktiv.txt",
    ]
    stored = json.dumps(map_procurement(procurement, Settings(), now=NOW).columns(), default=str)
    for word in SECRET_WORDS:
        assert word not in stored
    assert "1234567" not in stored  # the project's value may be an internal estimate


def test_an_unannounced_project_is_not_public() -> None:
    assert public_procurement(_project(Events=[{"Event": "Created"}]), API) is None


def test_an_invitation_to_chosen_suppliers_is_not_public() -> None:
    invited = {"InvitationDate": "2026-10-01T10:00:00+02:00", "Documents": [_document(11, "Steg 2.pdf")]}

    assert public_procurement(_project(RequestForTender=invited), API) is None


def test_the_first_stage_of_a_two_step_procedure_is_public() -> None:
    project = _project(
        ProcurementType="NationalTwoStep",
        TimeTable={
            "LastQuestionApplication": "2026-10-15T00:00:00+02:00",
            "LastApplication": "2026-10-22T00:00:00+02:00",
            "LastBid": "2026-12-01T00:00:00+01:00",
        },
        RequestForTender={
            "InvitationDate": "2026-11-01T10:00:00+01:00",
            "Documents": [_document(20, "Steg 2.pdf")],
        },
        RequestForApplications={
            "AnnouncementDate": "2026-10-01T10:00:00+02:00",
            "Documents": [_document(21, "Steg 1.pdf")],
        },
    )

    procurement = public_procurement(project, API)

    assert procurement is not None
    assert procurement.stage == "application"
    assert procurement.deadline == datetime(2026, 10, 21, 23, 59, 59, tzinfo=STOCKHOLM)
    assert [document.filename for document in procurement.documents] == ["Steg 1.pdf"]


def test_a_document_outside_the_announcement_address_is_skipped() -> None:
    request = deepcopy(_project()["RequestForTender"])
    request["Documents"].append({"Url": f"{API}/v1/project-documents/1", "Filename": "Intern.pdf"})
    request["Documents"].append(
        {"Url": "https://example.com/v1/announcement-documents/5", "Filename": "Annan.pdf"}
    )

    procurement = public_procurement(_project(RequestForTender=request), API)

    assert procurement is not None
    assert "Intern.pdf" not in [document.filename for document in procurement.documents]
    assert "Annan.pdf" not in [document.filename for document in procurement.documents]


@pytest.mark.parametrize(
    ("filenames", "expected"),
    [
        (
            ["Bilaga.pdf", "6.1 Administrativa föreskrifter.docx", "6.1 Administrativa föreskrifter.pdf"],
            "6.1 Administrativa föreskrifter.pdf",
        ),
        (["Kravspecifikation.pdf", "Upphandlinsförfrågan 2026.docx"], "Upphandlinsförfrågan 2026.docx"),
        (["Avtalsvillkor.pdf", "Krav på Leverantör.pdf", "Kravspecifikation.pdf"], "Krav på Leverantör.pdf"),
        (["Prisbilaga.xlsx", "Inbjudan till utbildning.pdf"], "Inbjudan till utbildning.pdf"),
        (["Prisbilaga.xlsx", "Uppdraget.pdf"], "Uppdraget.pdf"),  # the only readable file
        (["Avtalsvillkor.pdf", "Utvärderingsmodell.pdf"], None),
    ],
)
def test_main_document(filenames: list[str], expected: str | None) -> None:
    documents = [
        PublicDocument(name, f"{API}/v1/announcement-documents/{index}", None)
        for index, name in enumerate(filenames)
    ]

    assert main_document(documents) == expected


def test_eavrop_procurement_id_from_a_notice_link() -> None:
    assert (
        eavrop_procurement_id("https://www.e-avrop.com/sundsvall/e-Upphandling/NoticeLink.aspx?id=121907")
        == "121907"
    )
    assert eavrop_procurement_id("https://ted.europa.eu/sv/notice/-/detail/1-2026") is None
    assert eavrop_procurement_id(None) is None


# --- Ingestion -----------------------------------------------------------------------


async def test_ingest_stores_the_notice_and_only_the_public_documents(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, api_settings: Settings, db_session: AsyncSession
) -> None:
    unannounced = _project(ProjectId=900200, ProcurementId=900002, Events=[{"Event": "Created"}])
    listing = respx_mock.get(LIST_URL).mock(
        return_value=httpx.Response(200, json=[_list_item(900100), _list_item(900200)])
    )
    respx_mock.get(f"{API}/v1/procurements/900100").mock(return_value=httpx.Response(200, json=_project()))
    respx_mock.get(f"{API}/v1/procurements/900200").mock(return_value=httpx.Response(200, json=unannounced))
    documents = _mock_documents(respx_mock)
    secret = respx_mock.get(url__regex=rf"{API}/v1/project-documents/.*").mock(
        return_value=httpx.Response(200)
    )

    stats = await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)

    assert stats == {
        "fetched": 2,
        "inserted": 1,
        "updated": 0,
        "not_public": 1,
        "documents_stored": 2,
        "documents_skipped": 1,
    }
    assert listing.calls.last.request.headers["Authorization"] == "Bearer test-token"
    assert listing.calls.last.request.url.params["from"].startswith("2025-04-")
    assert all(route.called for route in documents.values())
    assert not secret.called
    notice = await db_session.scalar(select(Notice).where(Notice.source == "eavrop"))
    assert notice is not None
    assert (notice.external_id, notice.status, notice.reference_number) == ("900001", "open", "UH-2026-9999")
    assert notice.procedure == "Upphandling under tröskelvärdena (19 kap. LOU)"
    assert notice.url == "https://www.e-avrop.com/sundsvall/e-Upphandling/NoticeLink.aspx?id=900001"
    assert notice.estimated_value_sek is None
    stored_text = json.dumps({"raw": notice.raw, "description": notice.description}, ensure_ascii=False)
    for word in SECRET_WORDS:
        assert word not in stored_text
    stored = list(
        await db_session.scalars(
            select(Document).where(Document.notice_id == notice.id).order_by(Document.created_at)
        )
    )
    assert [(document.filename, document.auto_interpret) for document in stored] == [
        ("Administrativa föreskrifter fiktiv.txt", True),
        ("Kravspecifikation fiktiv.txt", False),
    ]


async def test_a_rerun_skips_unchanged_projects_and_documents(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, api_settings: Settings, db_session: AsyncSession
) -> None:
    respx_mock.get(LIST_URL).mock(return_value=httpx.Response(200, json=[_list_item(900100)]))
    detail = respx_mock.get(f"{API}/v1/procurements/900100").mock(
        return_value=httpx.Response(200, json=_project())
    )
    documents = _mock_documents(respx_mock)

    await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)
    second = await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)

    assert second == {"fetched": 1, "inserted": 0, "updated": 0, "unchanged": 1}
    assert detail.call_count == 1
    assert all(route.call_count == 1 for route in documents.values())


async def test_projects_unchanged_since_the_last_run_are_not_fetched(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, api_settings: Settings, db_session: AsyncSession
) -> None:
    respx_mock.get(LIST_URL).mock(
        return_value=httpx.Response(200, json=[_list_item(900200, "2026-09-01T09:00:00+02:00")])
    )
    detail = respx_mock.get(f"{API}/v1/procurements/900200").mock(return_value=httpx.Response(200, json={}))

    stats = await ingest_eavrop(
        db_session, client, api_settings, now=NOW, changed_since=NOW, request_interval=0
    )

    assert stats["unchanged"] == 1
    assert not detail.called


async def test_documents_go_to_the_ted_notice_of_the_same_procurement(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, api_settings: Settings, db_session: AsyncSession
) -> None:
    twin = Notice(
        source="ted",
        external_id="900001-2026",
        title="Fiktiv ommålning (TED)",
        status="open",
        documents_url="https://www.e-avrop.com/sundsvall/e-Upphandling/NoticeLink.aspx?id=900001",
        raw={},
    )
    db_session.add(twin)
    await db_session.flush()
    respx_mock.get(LIST_URL).mock(return_value=httpx.Response(200, json=[_list_item(900100)]))
    respx_mock.get(f"{API}/v1/procurements/900100").mock(return_value=httpx.Response(200, json=_project()))
    _mock_documents(respx_mock)

    stats = await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)

    assert stats["linked"] == 1
    assert (
        await db_session.scalar(select(func.count()).select_from(Notice).where(Notice.source == "eavrop"))
        == 0
    )
    assert (
        await db_session.scalar(
            select(func.count()).select_from(Document).where(Document.notice_id == twin.id)
        )
        == 2
    )


async def test_ted_does_not_add_a_procurement_already_stored_from_eavrop(db_session: AsyncSession) -> None:
    db_session.add(
        Notice(source="eavrop", external_id="900001", title="Fiktiv ommålning", status="open", raw={})
    )
    await db_session.flush()
    values = NoticeValues(
        source="ted",
        external_id="900001-2026",
        title="Fiktiv ommålning (TED)",
        notice_type="contract",
        status="open",
        raw={},
        documents_url="https://www.e-avrop.com/sundsvall/e-Upphandling/NoticeLink.aspx?id=900001",
    )

    stats = await upsert_ted_notices(
        db_session, [TedRecord(values=values, notice_identifier=None, version=1)]
    )

    assert stats.skipped == 1
    assert (
        await db_session.scalar(select(func.count()).select_from(Notice).where(Notice.source == "ted")) == 0
    )


async def test_without_token_the_job_does_nothing(
    client: httpx.AsyncClient, settings: Settings, db_session: AsyncSession
) -> None:
    unconfigured = settings.model_copy(update={"eavrop_api_token": None, "eavrop_client_id": None})

    assert await ingest_eavrop(db_session, client, unconfigured, now=NOW) == {
        "fetched": 0,
        "inserted": 0,
        "updated": 0,
        "not_configured": 1,
    }


async def test_a_refused_token_fails_the_run(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, api_settings: Settings, db_session: AsyncSession
) -> None:
    respx_mock.get(LIST_URL).mock(return_value=httpx.Response(401))

    with pytest.raises(IngestError, match="EAVROP_API_TOKEN"):
        await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)


async def test_a_list_item_outside_the_api_is_not_fetched(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, api_settings: Settings, db_session: AsyncSession
) -> None:
    respx_mock.get(LIST_URL).mock(
        return_value=httpx.Response(
            200,
            json=[
                {"Url": "https://example.com/v1/procurements/1", "UpdatedDate": "2026-10-01T10:00:00+02:00"}
            ],
        )
    )

    stats = await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)

    assert stats["skipped"] == 1
