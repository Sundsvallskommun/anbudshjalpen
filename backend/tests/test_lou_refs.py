"""Excerpts of LOU sections: whole sentences, never half of one."""

from __future__ import annotations

from anbudsklar.lou_refs import lou_excerpt

FIRST = "En upphandlande myndighet ska behandla leverantörer på ett likvärdigt sätt."
SECOND = "Upphandlingar ska genomföras på ett öppet sätt enligt 13 kap. 1 § och 4 kap. 1 §."
THIRD = "Myndigheten ska iaktta principerna om ömsesidigt erkännande och proportionalitet."


def test_a_short_text_is_kept_whole_with_its_whitespace_collapsed() -> None:
    assert lou_excerpt(f"{FIRST}\n  {SECOND}") == f"{FIRST} {SECOND}"


def test_a_long_text_is_cut_after_the_last_whole_sentence_that_fits() -> None:
    text = f"{FIRST} {SECOND} {THIRD}"
    limit = len(f"{FIRST} {SECOND}") + 5
    # "13 kap. 1 §" is no sentence end: the second sentence stays whole.
    assert lou_excerpt(text, limit) == f"{FIRST} {SECOND} …"


def test_a_first_sentence_longer_than_the_limit_is_cut_at_a_word() -> None:
    excerpt = lou_excerpt(f"{FIRST} {SECOND}", 30)
    assert excerpt == "En upphandlande myndighet ska …"
    assert len(excerpt) <= 32
