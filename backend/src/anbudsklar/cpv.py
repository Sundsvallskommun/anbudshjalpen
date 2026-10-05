"""The CPV code hierarchy, shared by search, matching, upcoming procurements and the engines.

CPV codes are hierarchical by digit: two digits name a division, three a group, four a
class and five a category. Two codes that share at least the first three digits are in
the same group, which is the level at which "this is the kind of work we do" starts to
be meaningful (decision: prefilter at group level, see services.matching).

Trailing zeros are not digits of the hierarchy: 45000000 is the division "45", the parent
of every 45xxxxxx code. Overlaps are therefore measured on the significant digits.

Pure functions without database or service dependencies, so the AI engines (which must
not import the services) read the hierarchy exactly as matching does.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

MIN_GROUP_DIGITS = 3
CPV_DIGITS = 8
CPV_CODE = re.compile(r"^(\d{8})(?:-\d)?$")


def cpv_digits(code: str) -> str:
    """The eight digits of a code; a trailing check digit ("45442110-1") is accepted and dropped."""

    match = CPV_CODE.match(code.strip())
    if match is None:
        raise ValueError(f"Not a CPV code: {code!r}")
    return match[1]


def cpv_prefix(code: str) -> str:
    """The significant digits of a CPV code, which all its descendants share.

    "45442110" gives "4544211" and "45000000" gives "45" (a division keeps two digits).
    """

    return cpv_digits(code).rstrip("0").ljust(2, "0")


def significant_digits(code: str) -> str | None:
    """The code without its trailing zeros (at least two digits), or None for a malformed code."""

    try:
        return cpv_prefix(code)
    except ValueError:
        return None


def common_prefix_length(a: str, b: str) -> int:
    length = 0
    for left, right in zip(a, b, strict=False):
        if left != right:
            break
        length += 1
    return length


def cpv_overlap(own: str, other: str) -> int:
    """How closely `other` matches `own`, in shared significant digits (0 to 8).

    The comparison is directed. When `own` is an ancestor of `other` (a company that
    chose the division 45000000 and a notice for 45442110), `own` covers the other code
    and counts as at least a group-level match. The reverse, a broad code on the notice
    and a specific one on the profile, only counts the digits they share: a notice
    tagged 45000000 says too little about the work to admit every builder.
    """

    mine, theirs = significant_digits(own), significant_digits(other)
    if mine is None or theirs is None:
        return 0
    if mine == theirs:
        return CPV_DIGITS
    if theirs.startswith(mine):
        return max(len(mine), MIN_GROUP_DIGITS)
    return common_prefix_length(mine, theirs)


def best_cpv_overlap(own: Iterable[str], other: Iterable[str]) -> int:
    """The best `cpv_overlap` between any pair of codes (0 when either side is empty)."""

    return closest_cpv_pair(own, other)[0]


def closest_cpv_pair(own: Iterable[str], other: Iterable[str]) -> tuple[int, str, str]:
    """The best `cpv_overlap` with the two codes that give it, or (0, "", "") when none overlap."""

    other_codes = list(other)
    best = (0, "", "")
    for mine in own:
        for theirs in other_codes:
            overlap = cpv_overlap(mine, theirs)
            if overlap > best[0]:
                best = (overlap, mine, theirs)
    return best


def shares_cpv_group(own: Iterable[str], other: Iterable[str]) -> bool:
    """True when the other codes are the kind of work `own` describes (group level or a covered code)."""

    return best_cpv_overlap(own, other) >= MIN_GROUP_DIGITS
