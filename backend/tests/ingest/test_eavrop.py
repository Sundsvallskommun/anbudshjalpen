"""e-Avrop's Projekt API: the allowlist, the public request, documents and the TED twin.

All responses here are synthetic and fictitious. Real responses cannot be recorded: the API is
the municipality's own and a project's response holds tenderers, prices and staff. The
synthetic project below carries such parts on purpose, so the tests can show they never leave
the response.
"""

from __future__ import annotations

import json
import re
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
    parse_deadline,
    parse_moment,
    public_procurement,
)
from anbudsklar.ingest.notices import STOCKHOLM, NoticeValues, eavrop_procurement_id, notices_by_external_id
from anbudsklar.ingest.ted import TedRecord, upsert_ted_notices
from anbudsklar.models import Document, Notice, PublishedAnswer

API = "https://www.e-avrop.com/api"
CLIENT_ID = 4242
LIST_URL = f"{API}/v1.1/clients/{CLIENT_ID}/procurements"
NOW = datetime(2026, 10, 8, 12, 0, tzinfo=UTC)
ANNOUNCEMENT_ID = 74000
LOG_DOCUMENTS_URL = f"{API}/v1/announcements/{ANNOUNCEMENT_ID}/log-documents"

# Words from the secret parts of the synthetic project. None of them may be stored.
SECRET_WORDS = (
    "Fiktiv Anbudsgivare AB",
    "556000-0000",
    "anbud@fiktiv.example",
    "Handläggare Fiktivsson",
    "Utvärderingsprotokoll",
    "kreditupplysning",
    "project-documents",
    "Frågeställare Fiktivsson",
    "fragor@fiktiv.example",
    "intressent@fiktiv.example",
)

# The question log e-Avrop writes next to the announcement (decision 0013): one answered question,
# one not answered yet. Fictitious, in the file's own shape.
QUESTION_LOG = (
    "Orginal Fraga 2026-10-05 16:42:46:\n"
    "Ska ställning ingå i priset?\n"
    "Besvarad Fraga 2026-10-06 10:38:45:\n"
    "Ska ställning ingå i priset?\n"
    "Svar :\n"
    "Ja, ställning ingår i anbudspriset.\n"
    "\n\n"
    "Orginal Fraga 2026-10-07 09:48:37:\n"
    "Får vi lämna anbud tillsammans?\n"
    "Besvarad Fraga :\n"
    "Får vi lämna anbud tillsammans?\n"
    "Svar :\n"
    "\n"
)
# The e-mail logs next to it: who asked and who got the answer. They must never be fetched.
EMAIL_LOG = (
    "**** E-POSTMEDDELANDE SKICKAT 2026-10-05 16:42 ****\n"
    "Frågeställare\nFrågeställare Fiktivsson\nFiktiv Anbudsgivare AB\nfragor@fiktiv.example\n"
    "intressent@fiktiv.example\n"
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


def _log_file(filename: str, encoded: str, folder: str) -> dict[str, str]:
    return {"Url": f"{LOG_DOCUMENTS_URL}?filename={encoded}&foldername={folder}", "Filename": filename}


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
        "AnnouncementLogFiles": [
            _log_file("Loggfil2026-10-01 10.00.00.txt", "Loggfil2026-10-01+10.00.00.txt", ""),
            _log_file("LoggfilOrginalFragor.txt", "LoggfilOrginalFragor.txt", ""),
            _log_file("frågor.txt", "fr%C3%A5gor.txt", "QA"),
            _log_file("svar.txt", "svar.txt", "QA"),
            _log_file("meddelanden.txt", "meddelanden.txt", "QA"),
        ],
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


def _mock_documents(respx_mock: respx.MockRouter, *, question_log: bool = True) -> dict[int, respx.Route]:
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
    if question_log:
        _mock_question_log(respx_mock)
    return routes


def _mock_question_log(
    respx_mock: respx.MockRouter, text: str = QUESTION_LOG
) -> tuple[respx.Route, respx.Route]:
    """The question log, as e-Avrop serves it (Windows-1252), and the e-mail logs beside it."""

    log = respx_mock.get(LOG_DOCUMENTS_URL, params__contains={"filename": "LoggfilOrginalFragor.txt"}).mock(
        return_value=httpx.Response(
            200, content=text.encode("cp1252"), headers={"Content-Type": "application/octet-stream"}
        )
    )
    secret_logs = respx_mock.get(url__regex=rf"{re.escape(LOG_DOCUMENTS_URL)}.*").mock(
        return_value=httpx.Response(200, content=EMAIL_LOG.encode())
    )
    return log, secret_logs


# --- Reading a project ---------------------------------------------------------------


def test_a_deadline_at_midnight_is_the_end_of_that_day() -> None:
    # e-Avrop's notice page shows LastBid "2026-11-06T00:00:00+01:00" as tender deadline 2026-11-06.
    assert parse_deadline("2026-11-06T00:00:00+01:00") == datetime(2026, 11, 6, 23, 59, 59, tzinfo=STOCKHOLM)
    assert parse_deadline("2026-10-30T12:00:00+01:00") == datetime(2026, 10, 30, 12, 0, tzinfo=STOCKHOLM)
    # Summer time ends on 25 October 2026: midnight is +02:00, the end of the day +01:00.
    assert parse_deadline("2026-10-25T00:00:00+02:00") == datetime(2026, 10, 25, 22, 59, 59, tzinfo=UTC)
    assert parse_deadline(None) is None
    assert parse_deadline("inte ett datum") is None


def test_other_moments_are_read_as_they_are() -> None:
    assert parse_moment("2026-10-31T00:00:00+01:00") == datetime(2026, 10, 31, 0, 0, tzinfo=STOCKHOLM)
    assert parse_moment("2026-10-30T12:00:00") == datetime(2026, 10, 30, 12, 0, tzinfo=STOCKHOLM)
    assert parse_moment(None) is None


def test_public_procurement_reads_only_the_allowlist() -> None:
    procurement = public_procurement(_project(), API)

    assert procurement is not None
    assert procurement.procurement_id == "900001"
    assert procurement.stage == "tender"
    assert procurement.deadline == datetime(2026, 10, 28, 23, 59, 59, tzinfo=STOCKHOLM)
    assert procurement.question_deadline == datetime(2026, 10, 20, 23, 59, 59, tzinfo=STOCKHOLM)
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
    assert procurement.deadline == datetime(2026, 10, 22, 23, 59, 59, tzinfo=STOCKHOLM)
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
    documents = _mock_documents(respx_mock, question_log=False)
    question_log, secret_logs = _mock_question_log(respx_mock)
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
        "answers_inserted": 1,
    }
    assert listing.calls.last.request.headers["Authorization"] == "Bearer test-token"
    assert listing.calls.last.request.url.params["from"].startswith("2025-04-")
    assert all(route.called for route in documents.values())
    assert not secret.called
    assert question_log.called and not secret_logs.called  # the e-mail logs name who asked
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
    # Only the answered question is public; the unanswered one is not stored.
    [answer] = (await db_session.scalars(select(PublishedAnswer))).all()
    assert (answer.notice_id, answer.question, answer.answer) == (
        notice.id,
        "Ska ställning ingå i priset?",
        "Ja, ställning ingår i anbudspriset.",
    )
    assert answer.answered_at == datetime(2026, 10, 6, 10, 38, 45, tzinfo=STOCKHOLM)


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
    # The open project is read once more for its question log (decision 0013); its documents are not.
    assert detail.call_count == 2
    assert all(route.call_count == 1 for route in documents.values())


async def test_a_refetch_reads_stored_projects_again(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, api_settings: Settings, db_session: AsyncSession
) -> None:
    respx_mock.get(LIST_URL).mock(return_value=httpx.Response(200, json=[_list_item(900100)]))
    detail = respx_mock.get(f"{API}/v1/procurements/900100").mock(
        return_value=httpx.Response(200, json=_project())
    )
    documents = _mock_documents(respx_mock)
    await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)
    notice = (await notices_by_external_id(db_session, "eavrop", ["900001"]))["900001"]
    # As the earlier reading stored it, a day early.
    notice.deadline_at = datetime(2026, 10, 27, 23, 59, 59, tzinfo=STOCKHOLM)

    second = await ingest_eavrop(db_session, client, api_settings, now=NOW, refetch=True, request_interval=0)

    assert second == {"fetched": 1, "inserted": 0, "updated": 1, "documents_skipped": 1}  # the xlsx
    assert notice.deadline_at == datetime(2026, 10, 28, 23, 59, 59, tzinfo=STOCKHOLM)
    assert detail.call_count == 2  # read once for the project and its question log together
    assert all(route.call_count == 1 for route in documents.values())  # unchanged files are not fetched again


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

    assert stats["linked"] == 1 and stats["answers_inserted"] == 1
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
    assert (await db_session.scalar(select(PublishedAnswer.notice_id))) == twin.id


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


# --- Questions and answers (decision 0013) ------------------------------------------


async def test_answers_are_read_for_open_procurements_the_list_calls_unchanged(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, api_settings: Settings, db_session: AsyncSession
) -> None:
    """A new answer does not change the project's UpdatedDate, so open projects are read anyway."""

    db_session.add(
        Notice(
            source="eavrop",
            external_id="900001",
            title="Fiktiv ommålning",
            status="open",
            raw={"list_url": f"{API}/v1/procurements/900100", "list_updated": "2026-10-01T10:00:00+02:00"},
        )
    )
    await db_session.flush()
    respx_mock.get(LIST_URL).mock(return_value=httpx.Response(200, json=[_list_item(900100)]))
    detail = respx_mock.get(f"{API}/v1/procurements/900100").mock(
        return_value=httpx.Response(200, json=_project())
    )
    documents = _mock_documents(respx_mock, question_log=False)
    question_log, secret_logs = _mock_question_log(respx_mock)

    stats = await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)

    assert stats["unchanged"] == 1 and stats["answers_inserted"] == 1
    assert detail.call_count == 1 and question_log.called and not secret_logs.called
    assert not any(route.called for route in documents.values())  # the answers only, not the documents


async def test_a_ted_twin_gets_its_answers_by_procurement_id(
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
    respx_mock.get(LIST_URL).mock(return_value=httpx.Response(200, json=[]))
    by_id = respx_mock.get(f"{API}/v1/procurements/by-procurement-id/900001").mock(
        return_value=httpx.Response(200, json=_project())
    )
    question_log, secret_logs = _mock_question_log(respx_mock)

    stats = await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)

    assert stats["answers_inserted"] == 1 and by_id.called and question_log.called
    assert not secret_logs.called
    assert (await db_session.scalar(select(PublishedAnswer.notice_id))) == twin.id


async def test_an_open_notice_without_a_project_is_skipped_quietly(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, api_settings: Settings, db_session: AsyncSession
) -> None:
    db_session.add(
        Notice(
            source="ted",
            external_id="900002-2026",
            title="Fiktiv städning (TED)",
            status="open",
            documents_url="https://www.e-avrop.com/sundsvall/e-Upphandling/NoticeLink.aspx?id=900002",
            raw={},
        )
    )
    await db_session.flush()
    respx_mock.get(LIST_URL).mock(return_value=httpx.Response(200, json=[]))
    respx_mock.get(f"{API}/v1/procurements/by-procurement-id/900002").mock(return_value=httpx.Response(404))

    stats = await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)

    assert "answers_inserted" not in stats and "answers_failed" not in stats


async def test_an_edited_or_withdrawn_answer_is_mirrored(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, api_settings: Settings, db_session: AsyncSession
) -> None:
    respx_mock.get(LIST_URL).mock(return_value=httpx.Response(200, json=[_list_item(900100)]))
    respx_mock.get(f"{API}/v1/procurements/900100").mock(return_value=httpx.Response(200, json=_project()))
    _mock_documents(respx_mock, question_log=False)
    question_log, _ = _mock_question_log(respx_mock)

    first = await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)
    edited = QUESTION_LOG.replace("Ja, ställning ingår i anbudspriset.", "Ja, ställning och lift ingår.")
    question_log.mock(return_value=httpx.Response(200, content=edited.encode("cp1252")))
    second = await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)
    question_log.mock(return_value=httpx.Response(200, content=b""))
    third = await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)

    assert first["answers_inserted"] == 1
    assert second["answers_updated"] == 1 and "answers_inserted" not in second
    assert third["answers_deleted"] == 1
    assert (await db_session.scalars(select(PublishedAnswer))).all() == []


async def test_a_question_log_that_cannot_be_read_changes_nothing(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, api_settings: Settings, db_session: AsyncSession
) -> None:
    respx_mock.get(LIST_URL).mock(return_value=httpx.Response(200, json=[_list_item(900100)]))
    respx_mock.get(f"{API}/v1/procurements/900100").mock(return_value=httpx.Response(200, json=_project()))
    _mock_documents(respx_mock, question_log=False)
    question_log, _ = _mock_question_log(respx_mock)

    await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)
    question_log.mock(return_value=httpx.Response(500))
    stats = await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)

    assert stats["answers_failed"] == 1 and "answers_deleted" not in stats
    assert len((await db_session.scalars(select(PublishedAnswer))).all()) == 1


async def test_a_ted_notice_of_another_buyer_in_eavrop_is_not_asked_for(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, api_settings: Settings, db_session: AsyncSession
) -> None:
    """The key reads the municipality's projects only; other buyers' pages in e-Avrop are left alone."""

    db_session.add(
        Notice(
            source="ted",
            external_id="900003-2026",
            title="Fiktiv upphandling hos en annan köpare (TED)",
            status="open",
            documents_url="https://www.e-avrop.com/annankommun/e-Upphandling/NoticeLink.aspx?id=900003",
            raw={},
        )
    )
    await db_session.flush()
    respx_mock.get(LIST_URL).mock(return_value=httpx.Response(200, json=[]))
    other = respx_mock.get(url__regex=rf"{API}/v1/procurements/by-procurement-id/.*").mock(
        return_value=httpx.Response(403)
    )

    stats = await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)

    assert not other.called and "answers_failed" not in stats


async def test_a_refused_project_in_the_answers_pass_does_not_fail_the_run(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, api_settings: Settings, db_session: AsyncSession
) -> None:
    db_session.add(
        Notice(
            source="ted",
            external_id="900004-2026",
            title="Fiktiv upphandling (TED)",
            status="open",
            documents_url="https://www.e-avrop.com/sundsvall/e-Upphandling/NoticeLink.aspx?id=900004",
            raw={},
        )
    )
    await db_session.flush()
    respx_mock.get(LIST_URL).mock(return_value=httpx.Response(200, json=[]))
    respx_mock.get(f"{API}/v1/procurements/by-procurement-id/900004").mock(return_value=httpx.Response(403))

    stats = await ingest_eavrop(db_session, client, api_settings, now=NOW, request_interval=0)

    assert stats["answers_failed"] == 1
