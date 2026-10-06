"""Matching: prefilter, verification, reuse of fresh assessments and e-mail notification."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import EngineError, EngineRun
from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.config import Settings
from anbudsklar.contracts import (
    Checklist,
    Citation,
    CompanyProfile,
    MatchAssessment,
    MatchReason,
    NoticeContext,
)
from anbudsklar.models import Company, MatchNotification, MatchRecord, Notice
from anbudsklar.services.access import Viewer
from anbudsklar.services.matching import (
    ASSESSMENT_VERSION,
    count_fitting,
    dismiss_match,
    list_matches,
    match_company,
    notify_matches,
    rematch_company,
)
from anbudsklar.worker.mail import MailError, MailMessage
from api.factories import (
    INSURANCE_SENTENCE,
    PUBLIC_URL,
    RecordingMailer,
    add_company,
    add_cpv_codes,
    add_notice,
    add_user,
    seed_demo,
)


class CountingEngine(HeuristicEngine):
    """The heuristic engine, plus a citation to check verification, and a call counter."""

    def __init__(self, *, fail: bool = False) -> None:
        self.calls = 0
        self.fail = fail

    async def assess_match(
        self, profile: CompanyProfile, notice: NoticeContext, checklist: Checklist | None
    ) -> tuple[MatchAssessment, EngineRun]:
        self.calls += 1
        if self.fail:
            raise EngineError("Språkmodellen svarar inte just nu.")
        return (
            MatchAssessment(
                fit="passar",
                summary="Passar: företaget målar förskolor.",
                reasons=[
                    MatchReason(
                        kind="styrka",
                        text="Har försäkring",
                        citation=Citation(page=2, quote=INSURANCE_SENTENCE),
                    ),
                    MatchReason(
                        kind="oklart",
                        text="Påhittat citat",
                        citation=Citation(page=1, quote="Detta står inte i underlaget."),
                    ),
                ],
            ),
            EngineRun(engine="counting"),
        )


async def test_match_verifies_citations_and_reuses_fresh_assessments(db_session: AsyncSession) -> None:
    demo = await seed_demo(db_session)
    engine = CountingEngine()

    first = await match_company(db_session, engine, demo.company)
    assert (first.candidates, first.assessed, first.unchanged) == (1, 1, 0)
    record = (
        await db_session.scalars(select(MatchRecord).where(MatchRecord.company_id == demo.company.id))
    ).one()
    checks = [reason["citation"]["check"] for reason in record.payload["reasons"]]
    assert checks == ["verified", "unverified"]
    assert record.engine == "counting"
    assert record.prefilter_score == 0.75

    second = await match_company(db_session, engine, demo.company)
    assert (second.assessed, second.unchanged) == (0, 1)
    assert engine.calls == 1

    demo.notice.updated_at = datetime.now(UTC) + timedelta(seconds=1)
    await db_session.flush()
    third = await match_company(db_session, engine, demo.company)
    assert third.assessed == 1
    assert engine.calls == 2


async def test_assessments_made_under_another_version_are_made_again(db_session: AsyncSession) -> None:
    """Changed match rules or prompt reword stored reasons on the next run, with nothing else changed."""

    demo = await seed_demo(db_session)
    engine = CountingEngine()
    await match_company(db_session, engine, demo.company)
    record = (await db_session.scalars(select(MatchRecord))).one()
    assert record.assessment_version == ASSESSMENT_VERSION

    record.assessment_version = None  # as stored before assessments had a version
    await db_session.flush()
    stats = await match_company(db_session, engine, demo.company)
    assert (stats.assessed, stats.unchanged) == (1, 0)
    assert engine.calls == 2
    assert record.assessment_version == ASSESSMENT_VERSION


class ProfileSavedMeanwhile(CountingEngine):
    """Saves the company's profile again while the run is assessing."""

    def __init__(self, company: Company) -> None:
        super().__init__()
        self.company = company

    async def assess_match(
        self, profile: CompanyProfile, notice: NoticeContext, checklist: Checklist | None
    ) -> tuple[MatchAssessment, EngineRun]:
        self.company.updated_at = datetime.now(UTC) + timedelta(seconds=1)
        return await super().assess_match(profile, notice, checklist)


async def test_a_rematch_keeps_nothing_when_the_profile_was_saved_during_it(db_session: AsyncSession) -> None:
    """Otherwise assessments of the old profile would look newer than the new profile, and fresh."""

    demo = await seed_demo(db_session)
    company_id = demo.company.id  # the rollback expires the loaded rows
    await db_session.commit()  # the run's rollback must not take the demo with it

    assert await rematch_company(db_session, ProfileSavedMeanwhile(demo.company), company_id) is False
    assert (await db_session.scalars(select(MatchRecord))).all() == []

    assert await rematch_company(db_session, CountingEngine(), company_id) is True
    assert len((await db_session.scalars(select(MatchRecord))).all()) == 1


async def test_a_quick_rematch_leaves_a_long_candidate_list_for_later(db_session: AsyncSession) -> None:
    demo = await seed_demo(db_session)
    await db_session.commit()
    engine = CountingEngine()
    assert await rematch_company(db_session, engine, demo.company.id, max_candidates=0) is False
    assert engine.calls == 0


async def test_fitting_counts_the_matches_start_shows(db_session: AsyncSession) -> None:
    demo = await seed_demo(db_session)
    now = datetime.now(UTC)
    open_notices = [demo.notice] + [
        await add_notice(db_session, external_id=f"FIT-{index}", deadline_at=now + timedelta(days=5))
        for index in range(4)
    ]
    closed = await add_notice(db_session, external_id="FIT-CLOSED", deadline_at=now - timedelta(days=1))

    def record(notice: Notice, fit: str, **state: bool) -> MatchRecord:
        payload = {"fit": fit, "summary": "Bedömning.", "reasons": []}
        return MatchRecord(
            company_id=demo.company.id,
            notice_id=notice.id,
            fit=fit,
            engine="heuristic",
            payload=payload,
            **state,
        )

    db_session.add_all(
        [
            record(open_notices[0], "passar"),
            record(open_notices[1], "passar_delvis"),
            record(open_notices[2], "passar_inte"),
            record(open_notices[3], "passar", dismissed=True),
            record(open_notices[4], "passar", stale=True),
            record(closed, "passar"),
        ]
    )
    await db_session.flush()
    assert await count_fitting(db_session, demo.company.id, now) == 2
    assert await count_fitting(db_session, demo.other_company.id, now) == 0


async def test_matches_that_no_longer_pass_the_prefilter_are_hidden_but_kept(
    db_session: AsyncSession,
) -> None:
    demo = await seed_demo(db_session)
    engine = CountingEngine()
    await match_company(db_session, engine, demo.company)

    demo.company.cpv_codes = ["30192000"]
    demo.company.description = "Kontorsmaterial."
    await db_session.flush()
    stats = await match_company(db_session, engine, demo.company)
    assert (stats.candidates, stats.removed) == (0, 1)
    record = (await db_session.scalars(select(MatchRecord))).one()
    assert record.stale is True
    assert await list_matches(db_session, Viewer.for_user(demo.company_user)) == []

    again = await match_company(db_session, engine, demo.company)
    assert again.removed == 0  # already hidden


async def test_a_match_that_returns_keeps_its_dismissal_and_is_not_mailed_again(
    db_session: AsyncSession,
) -> None:
    demo = await seed_demo(db_session)
    engine = CountingEngine()
    settings = Settings(public_url=PUBLIC_URL)
    mailer = RecordingMailer()
    viewer = Viewer.for_user(demo.company_user)
    await match_company(db_session, engine, demo.company)
    assert (await notify_matches(db_session, mailer, settings, datetime.now(UTC)))["sent"] == 1
    [match] = await list_matches(db_session, viewer)
    await dismiss_match(db_session, viewer, match.id)

    codes, description = list(demo.company.cpv_codes), demo.company.description
    demo.company.cpv_codes, demo.company.description = ["30192000"], "Kontorsmaterial."
    await db_session.flush()
    assert (await match_company(db_session, engine, demo.company)).removed == 1
    demo.company.cpv_codes, demo.company.description = codes, description
    demo.company.updated_at = datetime.now(UTC) + timedelta(seconds=1)
    await db_session.flush()
    await match_company(db_session, engine, demo.company)

    record = (await db_session.scalars(select(MatchRecord))).one()
    assert (record.stale, record.dismissed) == (False, True)
    assert record.notified_at is not None
    assert await list_matches(db_session, viewer) == []
    assert (await notify_matches(db_session, mailer, settings, datetime.now(UTC)))["sent"] == 0
    assert len(mailer.sent) == 1


async def test_engine_failures_are_counted_not_raised(db_session: AsyncSession) -> None:
    demo = await seed_demo(db_session)
    stats = await match_company(db_session, CountingEngine(fail=True), demo.company)
    assert (stats.assessed, stats.failed) == (0, 1)


async def test_good_matches_are_e_mailed_once(db_session: AsyncSession) -> None:
    demo = await seed_demo(db_session)
    await match_company(db_session, CountingEngine(), demo.company)
    settings = Settings(public_url=PUBLIC_URL)
    mailer = RecordingMailer()
    now = datetime.now(UTC)

    assert await notify_matches(db_session, mailer, settings, now) == {"sent": 1, "failed": 0}
    [message] = mailer.sent
    assert message.to == "anna@example.test"
    assert message.subject == f"Ny träff: {demo.notice.title}"
    assert f"{PUBLIC_URL}/upphandlingar/{demo.notice.id}" in message.text
    assert "verkar passa Målerifirman" in message.text  # the web app's fit words
    assert f"Alla era träffar finns på Start: {PUBLIC_URL}/start" in message.text
    assert "gjord av AI och är inte granskad av inköp" in message.text  # a language model's assessment

    assert await notify_matches(db_session, mailer, settings, now) == {"sent": 0, "failed": 0}
    assert len(mailer.sent) == 1


class RefusingMailer(RecordingMailer):
    """Refuses one address, delivers the rest."""

    def __init__(self, refused: str) -> None:
        super().__init__()
        self.refused = refused

    async def send(self, message: MailMessage) -> None:
        if message.to == self.refused:
            raise MailError("Mottagaren finns inte")
        self.sent.append(message)


async def test_each_user_gets_one_mail_even_when_a_colleague_cannot_be_reached(
    db_session: AsyncSession,
) -> None:
    demo = await seed_demo(db_session)
    await add_user(
        db_session, role="foretagare", email="fel@example.test", name="Per Fel", company=demo.company
    )
    await match_company(db_session, CountingEngine(), demo.company)
    settings = Settings(public_url=PUBLIC_URL)
    mailer = RefusingMailer("fel@example.test")
    for _ in range(3):
        await notify_matches(db_session, mailer, settings, datetime.now(UTC))
    assert [message.to for message in mailer.sent] == ["anna@example.test"]
    record = (await db_session.scalars(select(MatchRecord))).one()
    assert record.notified_at is None  # Per has not been told yet

    working = RecordingMailer()
    assert await notify_matches(db_session, working, settings, datetime.now(UTC)) == {"sent": 1, "failed": 0}
    assert [message.to for message in working.sent] == ["fel@example.test"]
    assert record.notified_at is not None
    notified = (await db_session.scalars(select(MatchNotification.user_id))).all()
    assert len(notified) == 2


async def test_no_mail_once_the_tender_deadline_has_passed(db_session: AsyncSession) -> None:
    demo = await seed_demo(db_session)
    await match_company(db_session, CountingEngine(), demo.company)
    demo.notice.deadline_at = datetime.now(UTC) - timedelta(minutes=1)
    await db_session.flush()
    mailer = RecordingMailer()
    settings = Settings(public_url=PUBLIC_URL)
    assert await notify_matches(db_session, mailer, settings, datetime.now(UTC)) == {"sent": 0, "failed": 0}
    assert await list_matches(db_session, Viewer.for_user(demo.company_user)) == []
    stats = await match_company(db_session, CountingEngine(), demo.company)
    assert (stats.candidates, stats.removed) == (0, 1)


async def test_generic_words_alone_do_not_make_a_candidate(db_session: AsyncSession) -> None:
    company = await add_company(
        db_session,
        name="Bageriet i Matfors AB (fiktivt)",
        description="Vi bakar bröd och tårtor åt kunder i Sundsvall och Timrå.",
        cpv_codes=[],
    )
    await add_notice(
        db_session, title="Skolskjuts i Sundsvalls kommun", cpv_codes=["60130000"], external_id="G-1"
    )
    bread = await add_notice(
        db_session, title="Bröd och tårtor till kommunens kaféer", cpv_codes=["15810000"], external_id="G-2"
    )
    await add_notice(db_session, title="Bröd till skolkök", cpv_codes=["55524000"], external_id="G-3")
    stats = await match_company(db_session, CountingEngine(), company)
    assert stats.candidates == 1
    record = (await db_session.scalars(select(MatchRecord).where(MatchRecord.company_id == company.id))).one()
    assert record.notice_id == bread.id


async def test_a_broad_profile_code_covers_specific_notices(db_session: AsyncSession) -> None:
    company = await add_company(
        db_session, name="Byggbolaget AB (fiktivt)", description="Byggentreprenad.", cpv_codes=["45000000"]
    )
    notice = await add_notice(db_session, cpv_codes=["45442110"], external_id="B-1")
    await add_notice(db_session, title="Städning", cpv_codes=["90911200"], external_id="B-2")
    stats = await match_company(db_session, CountingEngine(), company)
    assert stats.candidates == 1
    record = (await db_session.scalars(select(MatchRecord).where(MatchRecord.company_id == company.id))).one()
    assert record.notice_id == notice.id
    assert record.prefilter_score == 0.375


async def test_failed_notifications_are_retried(db_session: AsyncSession) -> None:
    demo = await seed_demo(db_session)
    await match_company(db_session, CountingEngine(), demo.company)
    settings = Settings(public_url=PUBLIC_URL)
    broken = RecordingMailer(fail=True)
    assert await notify_matches(db_session, broken, settings, datetime.now(UTC)) == {"sent": 0, "failed": 1}
    working = RecordingMailer()
    assert (await notify_matches(db_session, working, settings, datetime.now(UTC)))["sent"] == 1


async def test_assessments_name_the_work_with_the_cpv_list_and_say_which_engine_made_them(
    db_session: AsyncSession,
) -> None:
    demo = await seed_demo(db_session)  # the company's 45442100 covers the notice's 45442110
    await add_cpv_codes(db_session, {"45442100": "Målning", "45442110": "Målning av byggnader"})
    await match_company(db_session, HeuristicEngine(), demo.company)

    [view] = await list_matches(db_session, Viewer.for_user(demo.company_user))
    assert view.engine == "heuristic"
    assert view.assessment.reasons[0].text == "Upphandlingen gäller målning av byggnader – det gör ni."
    assert view.notice.cpv_label == "Målning av byggnader"
