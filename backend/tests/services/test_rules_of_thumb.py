"""Pure helpers: CPV codes, dates, prefilter, keywords, reminder times, announcement windows."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta

import pytest

from anbudsklar.ai.engine import EngineConfigError, EngineError, EngineOutputError
from anbudsklar.api.schemas import QuestionTurnIn
from anbudsklar.cpv import best_cpv_overlap, shares_cpv_group
from anbudsklar.documents.extract import DocumentTooLarge, UnreadableDocument, UnsupportedDocument
from anbudsklar.services.checklists import is_permanent_failure, retry_delay
from anbudsklar.services.cpv import normalize_cpv_code, normalize_cpv_codes, normalize_cpv_prefixes
from anbudsklar.services.dates import STOCKHOLM, add_months, end_of_local_day, local_datetime
from anbudsklar.services.errors import FileTooLargeError, InvalidInputError, UnsupportedFileError
from anbudsklar.services.files import DOCX_MIMETYPE, as_service_error, mimetype_for
from anbudsklar.services.matching import prefilter_score
from anbudsklar.services.questions import MAX_HISTORY_CHARS, bounded_history
from anbudsklar.services.reminders import derived_due_at
from anbudsklar.services.text import keywords
from anbudsklar.services.upcoming import announcement_window


def test_cpv_codes_are_normalised() -> None:
    assert normalize_cpv_code(" 45442110-1 ") == "45442110"
    assert normalize_cpv_codes(["45442110-1", "45442110", "", "90911200"]) == ["45442110", "90911200"]
    for bad in ("4544211", "45442110-12", "abc"):
        with pytest.raises(InvalidInputError):
            normalize_cpv_code(bad)


def test_cpv_prefixes_accept_lists_and_commas() -> None:
    assert normalize_cpv_prefixes(["45, 4544", "90911200-3"]) == ["45", "4544", "90911200"]
    with pytest.raises(InvalidInputError):
        normalize_cpv_prefixes(["4"])


def test_cpv_overlap_is_measured_at_group_level() -> None:
    assert best_cpv_overlap(["45442100"], ["45442110", "90911200"]) == 6
    assert best_cpv_overlap(["45442110"], ["45442110"]) == 8
    assert shares_cpv_group(["45442100"], ["45111000"]) is False  # same division only
    assert shares_cpv_group(["45442100"], ["45400000"]) is True
    assert shares_cpv_group([], ["45442100"]) is False
    assert best_cpv_overlap(["inte-en-kod"], ["45442100"]) == 0


def test_trailing_zeros_are_not_digits_of_the_hierarchy() -> None:
    # A profile with a division code covers every specific code under it.
    assert best_cpv_overlap(["45000000"], ["45442110"]) == 3
    assert shares_cpv_group(["45000000"], ["45442110"]) is True
    assert shares_cpv_group(["15000000"], ["15800000"]) is True
    assert shares_cpv_group(["45000000"], ["90911200"]) is False
    # A notice tagged only with the division says too little to admit a specific profile.
    assert shares_cpv_group(["45442100"], ["45000000"]) is False
    # Zeros in the same place used to count as shared digits.
    assert best_cpv_overlap(["45400000"], ["45401000"]) == 3


def test_prefilter_combines_cpv_and_keywords() -> None:
    assert prefilter_score(["45442100"], ["45442110"], None) == 0.75
    assert prefilter_score(["45000000"], ["45442110"], None) == 0.375
    assert prefilter_score(["45442100"], ["90911200"], None) is None
    assert prefilter_score(["45442100"], ["90911200"], 0.2) == 0.2
    assert prefilter_score([], [], 3.0) == 1.0


def test_keywords_drop_short_common_and_generic_words() -> None:
    text = "Vi erbjuder målning, MÅLNING och fasadtvätt för skolor i Sundsvall och Timrå."
    assert keywords(text) == ["målning", "fasadtvätt", "skolor"]
    assert keywords(text, limit=2) == ["målning", "fasadtvätt"]
    generic = "Företaget har lång erfarenhet av offentlig upphandling och leverans till kommunen."
    assert keywords(generic) == ["lång"]
    assert all(word.isalpha() for word in keywords("SQL'); DROP TABLE -- notices"))


def test_months_are_shifted_with_clamping() -> None:
    assert add_months(date(2026, 8, 31), -6) == date(2026, 2, 28)
    assert add_months(date(2027, 12, 5), 1) == date(2028, 1, 5)
    assert add_months(date(2028, 5, 31), -3) == date(2028, 2, 29)


def test_announcement_window_is_nine_to_six_months_before_the_end() -> None:
    assert announcement_window(date(2027, 12, 5)) == (date(2027, 3, 5), date(2027, 6, 5))


def test_reminders_fire_two_days_before_at_eight_stockholm_time() -> None:
    now = datetime(2026, 10, 5, 10, 0, tzinfo=UTC)
    due = derived_due_at(date(2026, 10, 30), now)
    assert due == datetime(2026, 10, 28, 8, 0, tzinfo=STOCKHOLM)
    assert due.utcoffset() is not None and due.astimezone(UTC).time() == time(7, 0)  # winter time
    assert derived_due_at(date(2026, 10, 6), now) == now  # too late for the lead time: send now


def test_local_datetimes_follow_stockholm_time() -> None:
    assert local_datetime(date(2026, 7, 1)).isoformat() == "2026-07-01T00:00:00+02:00"


def test_a_last_day_lasts_until_the_end_of_that_day() -> None:
    assert end_of_local_day(date(2026, 10, 30)).isoformat() == "2026-10-30T23:59:59+01:00"
    assert end_of_local_day(date(2026, 7, 1)).isoformat() == "2026-07-01T23:59:59+02:00"


def test_question_history_keeps_the_latest_turns_within_the_budget() -> None:
    turns = [QuestionTurnIn(question=f"Fråga {index}", answer="x" * 5_000) for index in range(10)]
    kept = bounded_history(turns)
    assert [turn.question for turn in kept] == ["Fråga 8", "Fråga 9"]
    assert sum(len(turn.question) + len(turn.answer) for turn in kept) <= MAX_HISTORY_CHARS
    short = [QuestionTurnIn(question="Vilka krav?", answer="Två krav.")]
    assert [turn.answer for turn in bounded_history(short)] == ["Två krav."]


def test_interpretation_retries_back_off_and_permanent_failures_stop() -> None:
    assert [retry_delay(attempt) for attempt in (1, 2, 3)] == [
        timedelta(minutes=15),
        timedelta(minutes=30),
        timedelta(hours=1),
    ]
    assert retry_delay(20) == timedelta(hours=6)
    assert is_permanent_failure(EngineOutputError("ogiltig JSON")) is True
    assert is_permanent_failure(InvalidInputError("ingen text")) is True
    assert is_permanent_failure(EngineError("Eneo svarar inte")) is False
    assert EngineError("Eneo svarar inte").retryable is True
    assert is_permanent_failure(EngineError("Underlaget är för stort.", retryable=False)) is True
    assert is_permanent_failure(EngineConfigError("Kör `anbudsklar eneo provision`.")) is False
    assert is_permanent_failure(ValueError("okänt")) is False


def test_upload_types_come_from_the_file_name() -> None:
    assert mimetype_for("Anbud.PDF") == "application/pdf"
    assert mimetype_for("anbud.docx") == DOCX_MIMETYPE
    assert mimetype_for("anbud.txt") == "text/plain"
    with pytest.raises(UnsupportedFileError):
        mimetype_for("anbud.zip")


def test_extraction_errors_map_to_the_matching_http_error() -> None:
    too_large = as_service_error(DocumentTooLarge("Dokumentet har för många sidor."))
    assert isinstance(too_large, FileTooLargeError)
    assert too_large.message == "Dokumentet har för många sidor."
    assert isinstance(as_service_error(UnreadableDocument("Trasig PDF.")), InvalidInputError)
    assert isinstance(as_service_error(UnsupportedDocument("")), UnsupportedFileError)
