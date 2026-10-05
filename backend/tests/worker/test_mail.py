"""E-mail templates and SMTP delivery (aiosmtplib is replaced, no network)."""

from __future__ import annotations

from datetime import date, datetime
from email.message import EmailMessage
from typing import Any

import aiosmtplib
import pytest

from anbudsklar.config import Settings
from anbudsklar.services.dates import STOCKHOLM
from anbudsklar.worker.mail import MailError, SmtpMailer, format_date, match_message, reminder_message


def test_reminder_message_is_swedish_and_escaped() -> None:
    message = reminder_message(
        to="anna@example.test",
        recipient_name="Anna",
        notice_title="Målning <förskola> & skola",
        notice_url="http://anbudsklar.test/upphandlingar/1",
        kind="fragestopp",
        deadline=date(2026, 10, 25),
        note="Fråga om ställning",
        organization="Sundsvalls kommun",
    )
    assert message.subject == "Frågestopp 25 oktober 2026: Målning <förskola> & skola"
    assert "Hej Anna!" in message.text
    assert "Frågestopp: 25 oktober 2026." in message.text
    assert "Din anteckning: Fråga om ställning" in message.text
    assert "e-Avrop" in message.text
    assert "Målning &lt;förskola&gt; &amp; skola" in message.html
    assert "<förskola>" not in message.html
    assert '<html lang="sv">' in message.html


def test_own_reminder_without_deadline() -> None:
    message = reminder_message(
        to="a@example.test",
        recipient_name="Anna",
        notice_title="Städning",
        notice_url="http://anbudsklar.test/upphandlingar/2",
        kind="egen",
        deadline=None,
        note=None,
        organization="Sundsvalls kommun",
    )
    assert message.subject == "Påminnelse: Städning"


def test_match_message_states_that_ai_can_be_wrong() -> None:
    message = match_message(
        to="anna@example.test",
        recipient_name="Anna",
        company_name="Målerifirman",
        notice_title="Ommålning",
        notice_url="http://anbudsklar.test/upphandlingar/3",
        fit="passar_delvis",
        summary="Passar delvis.",
        deadline_at=datetime(2026, 11, 4, 12, 0, tzinfo=STOCKHOLM),
        organization="Sundsvalls kommun",
    )
    assert message.subject == "Ny träff: Ommålning"
    assert "kan passa delvis för Målerifirman" in message.text
    assert "Sista anbudsdag: 4 november 2026 kl. 12:00." in message.text
    assert "AI" in message.text


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
        deadline=date(2026, 11, 4),
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
