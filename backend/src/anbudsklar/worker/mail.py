"""E-mail: SMTP delivery (Mailpit in development) and the Swedish message templates."""

from __future__ import annotations

import html
import logging
from collections.abc import Sequence
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
# The same words as the web app: "frågestopp" is a term to explain, not a label.
REMINDER_LABELS = {
    "fragestopp": "Sista dag för frågor",
    "sista_anbudsdag": "Sista anbudsdag",
    "egen": "Påminnelse",
}
# The fit words of the web app ("Verkar passa", "Passar delvis"): the assessment compares
# CPV codes and words, so it never promises more than that.
FIT_SENTENCES = {
    "passar": 'Anbudsklar har hittat en upphandling som verkar passa {company}: "{title}".',
    "passar_delvis": 'Anbudsklar har hittat en upphandling som passar {company} delvis: "{title}".',
}
OTHER_FIT_SENTENCE = 'Anbudsklar har hittat en upphandling som kan vara intressant för {company}: "{title}".'
FAIR_QUESTIONS = "Är något oklart i underlaget? Ställ frågan i e-Avrop, så får alla leverantörer samma svar."
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


def format_deadline(kind: str, deadline_at: datetime) -> str:
    """Sista anbudsdag has a time of day; frågestopp is the last day for questions, a date."""

    if kind == "sista_anbudsdag":
        return format_datetime(deadline_at)
    return format_date(deadline_at.astimezone(STOCKHOLM).date())


def reminder_message(
    *,
    to: str,
    recipient_name: str,
    notice_title: str,
    notice_url: str,
    kind: str,
    deadline_at: datetime | None,
    note: str | None,
    organization: str,
    reminders_url: str | None = None,
) -> MailMessage:
    """The reminder names the deadline itself, never the moment the mail was planned for."""

    label = REMINDER_LABELS.get(kind, REMINDER_LABELS["egen"])
    deadline_day = format_date(deadline_at.astimezone(STOCKHOLM).date()) if deadline_at else None
    subject = (
        f"{label}: {notice_title}" if deadline_day is None else f"{label} {deadline_day}: {notice_title}"
    )
    lines = [f'Det här är din påminnelse för upphandlingen "{notice_title}".']
    if deadline_at is not None:
        lines.append(f"{label}: {format_deadline(kind, deadline_at)}.")
    if kind == "fragestopp":
        lines.append(FAIR_QUESTIONS)
    if note:
        lines.append(f"Din anteckning: {note}")
    return _compose(
        to=to,
        subject=subject,
        greeting=f"Hej {recipient_name}!",
        paragraphs=lines,
        link_text="Öppna upphandlingen i Anbudsklar",
        link_url=notice_url,
        more_links=[("Ändra eller ta bort dina påminnelser", reminders_url)] if reminders_url else [],
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
    engine: str = "heuristic",
    start_url: str | None = None,
) -> MailMessage:
    """The "Ny träff" mail: the fit in the web app's words, and who made the assessment."""

    sentence = FIT_SENTENCES.get(fit, OTHER_FIT_SENTENCE)
    lines = [sentence.format(company=company_name, title=notice_title), f"Bedömning: {summary}"]
    if deadline_at is not None:
        lines.append(f"Sista anbudsdag: {format_datetime(deadline_at)}.")
    made_by = "automatiskt med fasta regler" if engine == "heuristic" else "av AI"
    lines.append(
        f"Bedömningen är gjord {made_by} och är inte granskad av inköp. Den kan vara fel, "
        "så läs underlaget innan du bestämmer dig."
    )
    return _compose(
        to=to,
        subject=f"Ny träff: {notice_title}",
        greeting=f"Hej {recipient_name}!",
        paragraphs=lines,
        link_text="Se upphandlingen i Anbudsklar",
        link_url=notice_url,
        more_links=[("Alla era träffar finns på Start", start_url)] if start_url else [],
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
    more_links: Sequence[tuple[str, str]] = (),
) -> MailMessage:
    signature = f"Vänliga hälsningar\nAnbudsklar, {organization}"
    links = [(link_text, link_url), *more_links]
    text = (
        "\n\n".join([greeting, *paragraphs, *(f"{label}: {url}" for label, url in links), FOOTER, signature])
        + "\n"
    )
    body = "".join(f"<p>{html.escape(paragraph)}</p>" for paragraph in [greeting, *paragraphs])
    link = "".join(
        f'<p><a href="{html.escape(url, quote=True)}">{html.escape(label)}</a></p>' for label, url in links
    )
    footer = f"<p><small>{html.escape(FOOTER)}</small></p>"
    closing = "<p>" + html.escape(signature).replace("\n", "<br>") + "</p>"
    document = (
        f'<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>{html.escape(subject)}</title>'
        f"</head><body>{body}{link}{footer}{closing}</body></html>"
    )
    return MailMessage(to=to, subject=subject, text=text, html=document)
