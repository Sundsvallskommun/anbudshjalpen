"""E-mail templates and SMTP delivery (aiosmtplib is replaced, no network)."""

from __future__ import annotations

from datetime import date, datetime
from email.message import EmailMessage
from typing import Any

import aiosmtplib
import pytest

from anbudsklar.config import Settings
from anbudsklar.services.dates import STOCKHOLM, end_of_local_day
from anbudsklar.worker.mail import MailError, SmtpMailer, format_date, match_message, reminder_message


def test_reminder_message_is_swedish_and_escaped() -> None:
    message = reminder_message(
        to="anna@example.test",
        recipient_name="Anna",
        notice_title="Målning <förskola> & skola",
        notice_url="http://anbudsklar.test/upphandlingar/1",
        kind="fragestopp",
        deadline_at=end_of_local_day(date(2026, 10, 25)),
        note="Fråga om ställning",
        organization="Sundsvalls kommun",
        reminders_url="http://anbudsklar.test/paminnelser",
    )
    # The web app's words: the deadline is "Sista dag för frågor", named by its date.
    assert message.subject == "Sista dag för frågor 25 oktober 2026: Målning <förskola> & skola"
    assert "Hej Anna!" in message.text
    assert "Sista dag för frågor: 25 oktober 2026." in message.text  # a date, without a time of day
    assert "så får alla leverantörer samma svar" in message.text
    assert "Din anteckning: Fråga om ställning" in message.text
    assert "Ändra eller ta bort dina påminnelser: http://anbudsklar.test/paminnelser" in message.text
    assert "e-Avrop" in message.text
    assert "Målning &lt;förskola&gt; &amp; skola" in message.html
    assert '<a href="http://anbudsklar.test/paminnelser">' in message.html
    assert "<förskola>" not in message.html
    assert '<html lang="sv">' in message.html


def test_a_tender_deadline_reminder_names_the_deadline_with_its_time() -> None:
    message = reminder_message(
        to="anna@example.test",
        recipient_name="Anna",
        notice_title="Ommålning",
        notice_url="http://anbudsklar.test/upphandlingar/1",
        kind="sista_anbudsdag",
        deadline_at=datetime(2026, 11, 9, 23, 59, tzinfo=STOCKHOLM),
        note=None,
        organization="Sundsvalls kommun",
    )
    assert message.subject == "Sista anbudsdag 9 november 2026: Ommålning"
    assert "Sista anbudsdag: 9 november 2026 kl. 23:59." in message.text
    assert "Ändra eller ta bort" not in message.text  # no link without the page's address


def test_own_reminder_without_deadline() -> None:
    message = reminder_message(
        to="a@example.test",
        recipient_name="Anna",
        notice_title="Städning",
        notice_url="http://anbudsklar.test/upphandlingar/2",
        kind="egen",
        deadline_at=None,
        note=None,
        organization="Sundsvalls kommun",
    )
    assert message.subject == "Påminnelse: Städning"
    assert "samma svar" not in message.text


def test_match_message_uses_the_fit_words_and_says_who_assessed() -> None:
    message = match_message(
        to="anna@example.test",
        recipient_name="Anna",
        company_name="Målerifirman",
        notice_title="Ommålning",
        notice_url="http://anbudsklar.test/upphandlingar/3",
        fit="passar_delvis",
        summary="Upphandlingen passar er delvis.",
        deadline_at=datetime(2026, 11, 4, 12, 0, tzinfo=STOCKHOLM),
        organization="Sundsvalls kommun",
        engine="eneo",
        start_url="http://anbudsklar.test/start",
    )
    assert message.subject == "Ny träff: Ommålning"
    assert 'som passar Målerifirman delvis: "Ommålning".' in message.text
    assert "Bedömning: Upphandlingen passar er delvis." in message.text
    assert "Sista anbudsdag: 4 november 2026 kl. 12:00." in message.text
    assert "gjord av AI och är inte granskad av inköp. Den kan vara fel" in message.text
    assert "Se upphandlingen i Anbudsklar: http://anbudsklar.test/upphandlingar/3" in message.text
    assert "Alla era träffar finns på Start: http://anbudsklar.test/start" in message.text
    assert "/bevakning" not in message.text


def test_match_message_from_the_rule_based_engine_does_not_claim_ai() -> None:
    message = match_message(
        to="anna@example.test",
        recipient_name="Anna",
        company_name="Målerifirman",
        notice_title="Ommålning",
        notice_url="http://anbudsklar.test/upphandlingar/3",
        fit="passar",
        summary="Upphandlingen verkar passa er.",
        deadline_at=None,
        organization="Sundsvalls kommun",
    )
    assert 'som verkar passa Målerifirman: "Ommålning".' in message.text
    assert "gjord automatiskt med fasta regler" in message.text
    assert "AI" not in message.text
    assert "Sista anbudsdag" not in message.text


def test_dates_use_swedish_month_names() -> None:
    assert format_date(date(2027, 1, 9)) == "9 januari 2027"


async def test_smtp_mailer_sends_text_and_html(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[tuple[EmailMessage, dict[str, Any]]] = []

    async def fake_send(message: EmailMessage, **options: Any) -> None:
        sent.append((message, options))

    monkeypatch.setattr(aiosmtplib, "send", fake_send)
    settings = Settings(
        smtp_host="mailpit", smtp_port=1025, mail_from="Anbudsklar <noreply@anbudsklar.local>"
    )
    message = reminder_message(
        to="anna@example.test",
        recipient_name="Anna",
        notice_title="Ommålning",
        notice_url="http://anbudsklar.test/upphandlingar/1",
        kind="sista_anbudsdag",
        deadline_at=datetime(2026, 11, 4, 12, 0, tzinfo=STOCKHOLM),
        note=None,
        organization="Sundsvalls kommun",
    )
    await SmtpMailer(settings).send(message)

    [(email, options)] = sent
    assert options["hostname"] == "mailpit"
    assert options["port"] == 1025
    assert email["To"] == "anna@example.test"
    assert email["Subject"] == message.subject
    assert [part.get_content_type() for part in email.iter_parts()] == ["text/plain", "text/html"]


async def test_smtp_errors_become_mail_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    async def refuse(message: EmailMessage, **options: Any) -> None:
        raise aiosmtplib.SMTPConnectError("connection refused")

    monkeypatch.setattr(aiosmtplib, "send", refuse)
    with pytest.raises(MailError):
        await SmtpMailer(Settings()).send(
            match_message(
                to="a@example.test",
                recipient_name="A",
                company_name="B",
                notice_title="C",
                notice_url="http://anbudsklar.test/x",
                fit="passar",
                summary="D",
                deadline_at=None,
                organization="E",
            )
        )
