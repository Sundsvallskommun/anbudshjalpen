"""One message to Fråga AI, whichever subject answers it (decision 0026).

The panel used to ask the reader whether a question was about the documents, the
rules or the profile. Now the app decides: `anbudsklar.ai.subject_rules` reads the
words first, the engine's `choose_subject` (task valj_amne) is asked when the words
leave it open, and when that fails too the page's own subject answers. The message
then goes to the same services as before: `questions.ask_question`,
`rules.ask_rules` or `profiles.chat_update`, with the conversation's earlier turns
about that subject as history. The first tool under every answer says which subject
answered and what decided it.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine, EngineError, QuestionTurn
from anbudsklar.ai.subject_rules import choose_subject_by_rules, default_subject
from anbudsklar.api.schemas import (
    AskRequest,
    AskTurnIn,
    AskView,
    DecidedBy,
    ProfileChatRequest,
    QuestionRequest,
    QuestionTurnIn,
)
from anbudsklar.contracts import Subject, SubjectOption, Task
from anbudsklar.models import Notice
from anbudsklar.services import profiles, questions, rules
from anbudsklar.services.access import Viewer
from anbudsklar.services.ai_usage import TokenPrices, record_call
from anbudsklar.services.errors import InvalidInputError
from anbudsklar.services.notices import get_notice
from anbudsklar.services.tools import tool_use

logger = logging.getLogger(__name__)

SUBJECT_LABELS: dict[Subject, str] = {
    "underlag": "Underlaget",
    "regler": "Reglerna",
    "profil": "Profilen",
}
_DECIDED_LABELS: dict[DecidedBy, str] = {
    "rule": "på frågans ord",
    "model": "av AI",
    "default": "sidans eget ämne",
}
_DOCUMENTS_DESCRIPTION = (
    "Förfrågningsunderlaget för upphandlingen ”{title}”: kraven, bilagorna, utvärderingen, datumen, "
    "avtalsvillkoren och vad som står i dokumenten."
)
_RULES_DESCRIPTION = (
    "Reglerna för offentlig upphandling i allmänhet: LOU, begrepp, hur en upphandling går till och "
    "kommunens styrdokument för inköp."
)
_PROFILE_DESCRIPTION = (
    "Företagets egen profil i Anbudshjälpen: ändra beskrivning, CPV-koder, orter, antal anställda, "
    "omsättning, certifieringar, försäkring eller referenser."
)


@dataclass(frozen=True)
class SubjectDecision:
    subject: Subject
    decided_by: DecidedBy
    reason: str


def subject_options(notice: Notice | None, viewer: Viewer) -> list[SubjectOption]:
    """The subjects at hand: the documents on a notice page, the rules always, the profile when signed in."""

    options: list[SubjectOption] = []
    if notice is not None:
        options.append(
            SubjectOption(subject="underlag", description=_DOCUMENTS_DESCRIPTION.format(title=notice.title))
        )
    options.append(SubjectOption(subject="regler", description=_RULES_DESCRIPTION))
    if viewer.company_id is not None and not viewer.is_buyer:
        options.append(SubjectOption(subject="profil", description=_PROFILE_DESCRIPTION))
    return options


def as_turns(history: list[AskTurnIn]) -> list[QuestionTurn]:
    return [QuestionTurn(turn.question, turn.answer, turn.subject) for turn in history]


async def decide_subject(
    session: AsyncSession,
    engine: AiEngine,
    question: str,
    options: list[SubjectOption],
    history: list[QuestionTurn],
) -> SubjectDecision:
    """The words first, then the model, then the page's own subject.

    A failing or missing model (an Eneo assistant not provisioned yet) never stops a
    question: it is logged, and the page's own subject answers.
    """

    offered = {option.subject for option in options}
    choice = choose_subject_by_rules(question, options, history)
    if choice is not None:
        return SubjectDecision(choice.subject, "rule", choice.reason)
    try:
        choice, run = await engine.choose_subject(question, options, history)
    except EngineError as error:
        logger.warning("Could not choose the subject of a question: %s", error)
    else:
        await record_call(session, Task.CHOOSE_SUBJECT, run)
        if choice.subject in offered:
            return SubjectDecision(choice.subject, "model", choice.reason)
        logger.warning("The model chose a subject that is not at hand: %s", choice.subject)
    return SubjectDecision(default_subject(options), "default", "Sidans eget ämne.")


async def ask(
    session: AsyncSession,
    engine: AiEngine,
    request: AskRequest,
    viewer: Viewer,
    *,
    rules_session_id: str | None,
    eavrop_url: str,
    prices: TokenPrices | None = None,
) -> AskView:
    """Answer a message under the subject the app picks for it.

    `rules_session_id` is the conversation in Regelhjälpen to continue, already checked
    by the router to belong to this browser. Each subject's service gets only the earlier
    turns about that subject, in the shape it had before.
    """

    notice = await get_notice(session, request.notice_id) if request.notice_id else None
    options = subject_options(notice, viewer)
    history = as_turns(request.history)
    decision = await decide_subject(session, engine, request.question, options, history)
    detail = f"{SUBJECT_LABELS[decision.subject]}, {_DECIDED_LABELS[decision.decided_by]}"
    chip = tool_use("valj_amne", detail)
    own = [
        QuestionTurnIn(question=turn.question, answer=turn.answer)
        for turn in request.history
        if turn.subject == decision.subject
    ]

    if decision.subject == "underlag":
        if notice is None:  # the rules never offer it without a notice, but the contract allows the value
            raise InvalidInputError("Det finns inget underlag att fråga om på den här sidan.")
        answer = await questions.ask_question(
            session,
            engine,
            notice.id,
            QuestionRequest(question=request.question, history=own),
            viewer,
            eavrop_url=eavrop_url,
            prices=prices,
        )
        return AskView(
            subject="underlag",
            decided_by=decision.decided_by,
            answer=answer.model_copy(update={"tools": [chip, *answer.tools]}),
        )
    if decision.subject == "profil":
        change = await profiles.chat_update(
            session, engine, viewer, ProfileChatRequest(message=request.question, history=own), prices=prices
        )
        return AskView(
            subject="profil",
            decided_by=decision.decided_by,
            profile=change.model_copy(update={"tools": [chip, *change.tools]}),
        )
    view = await rules.ask_rules(session, engine, request.question, rules_session_id, prices=prices)
    return AskView(
        subject="regler",
        decided_by=decision.decided_by,
        rules=view.model_copy(update={"tools": [chip, *view.tools]}),
    )


__all__ = ["SUBJECT_LABELS", "SubjectDecision", "ask", "decide_subject", "subject_options"]
