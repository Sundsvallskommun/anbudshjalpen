"""E-mail: SMTP delivery (Mailpit in development) and the Swedish message templates."""

from __future__ import annotations

import html
import logging
from dataclasses import dataclass
from datetime import date, datetime
from email.message import EmailMessage
from typing import Protocol

import aiosmtplib

from anbudsklar.config import Settings
from anbudsklar.services.dates import STOCKHOLM

logger = logging.getLogger(__name__)

SMTP_TIMEOUT_SECONDS = 15.0
_MONTHS = (
    "januari",
    "februari",
    "mars",
    "april",
    "maj",
    "juni",
    "juli",
    "augusti",
    "september",
    "oktober",
    "november",
    "december",
)
REMINDER_LABELS = {
    "fragestopp": "Frågestopp",
    "sista_anbudsdag": "Sista anbudsdag",
    "egen": "Påminnelse",
}
FIT_PHRASES = {"passar": "passar", "passar_delvis": "kan passa delvis"}
FOOTER = (
    "Anbudet lämnas som vanligt i e-Avrop. Det är alltid förfrågningsunderlaget som gäller, "
    "så kontrollera datum och krav där."
)


class MailError(RuntimeError):
    """The message could not be delivered."""


@dataclass(frozen=True)
class MailMessage:
    to: str
    subject: str
    text: str
    html: str


class Mailer(Protocol):
    async def send(self, message: MailMessage) -> None: ...


class SmtpMailer:
    """Plain SMTP with STARTTLS when the server offers it (Mailpit does not)."""

    def __init__(self, settings: Settings) -> None:
        self._host = settings.smtp_host
        self._port = settings.smtp_port
        self._sender = settings.mail_from

    async def send(self, message: MailMessage) -> None:
        email = EmailMessage()
        email["From"] = self._sender
        email["To"] = message.to
        email["Subject"] = message.subject
        email.set_content(message.text)
        email.add_alternative(message.html, subtype="html")
        try:
            await aiosmtplib.send(email, hostname=self._host, port=self._port, timeout=SMTP_TIMEOUT_SECONDS)
        except (aiosmtplib.SMTPException, OSError) as exc:
            raise MailError(f"Could not send e-mail via {self._host}:{self._port}: {exc}") from exc


def format_date(day: date) -> str:
    return f"{day.day} {_MONTHS[day.month - 1]} {day.year}"


def format_datetime(moment: datetime) -> str:
    local = moment.astimezone(STOCKHOLM)
    return f"{format_date(local.date())} kl. {local:%H:%M}"


def reminder_message(
    *,
    to: str,
    recipient_name: str,
    notice_title: str,
    notice_url: str,
    kind: str,
    deadline: date | None,
    note: str | None,
    organization: str,
) -> MailMessage:
    label = REMINDER_LABELS.get(kind, REMINDER_LABELS["egen"])
    subject = (
        f"{label}: {notice_title}" if deadline is None else f"{label} {format_date(deadline)}: {notice_title}"
    )
    lines = [f'Det här är din påminnelse för upphandlingen "{notice_title}".']
    if deadline is not None:
        lines.append(f"{label}: {format_date(deadline)}.")
    if note:
        lines.append(f"Din anteckning: {note}")
    return _compose(
        to=to,
        subject=subject,
        greeting=f"Hej {recipient_name}!",
        paragraphs=lines,
        link_text="Öppna upphandlingen i Anbudsklar",
        link_url=notice_url,
        organization=organization,
    )


def match_message(
    *,
    to: str,
    recipient_name: str,
    company_name: str,
    notice_title: str,
    notice_url: str,
    fit: str,
    summary: str,
    deadline_at: datetime | None,
    organization: str,
) -> MailMessage:
    phrase = FIT_PHRASES.get(fit, "kan vara intressant")
    lines = [
        f'Anbudsklar har hittat en upphandling som {phrase} för {company_name}: "{notice_title}".',
        f"Bedömning: {summary}",
    ]
    if deadline_at is not None:
        lines.append(f"Sista anbudsdag: {format_datetime(deadline_at)}.")
    lines.append("Bedömningen är gjord av AI och kan vara fel. Läs underlaget innan du bestämmer dig.")
    return _compose(
        to=to,
        subject=f"Ny träff: {notice_title}",
        greeting=f"Hej {recipient_name}!",
        paragraphs=lines,
        link_text="Se träffen i Anbudsklar",
        link_url=notice_url,
        organization=organization,
    )


def _compose(
    *,
    to: str,
    subject: str,
    greeting: str,
    paragraphs: list[str],
    link_text: str,
    link_url: str,
    organization: str,
) -> MailMessage:
    signature = f"Vänliga hälsningar\nAnbudsklar, {organization}"
    text = "\n\n".join([greeting, *paragraphs, f"{link_text}: {link_url}", FOOTER, signature]) + "\n"
    body = "".join(f"<p>{html.escape(paragraph)}</p>" for paragraph in [greeting, *paragraphs])
    link = f'<p><a href="{html.escape(link_url, quote=True)}">{html.escape(link_text)}</a></p>'
    footer = f"<p><small>{html.escape(FOOTER)}</small></p>"
    closing = "<p>" + html.escape(signature).replace("\n", "<br>") + "</p>"
    document = (
        f'<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>{html.escape(subject)}</title>'
        f"</head><body>{body}{link}{footer}{closing}</body></html>"
    )
    return MailMessage(to=to, subject=subject, text=text, html=document)
