"""Domain errors raised by the services.

Services stay independent of HTTP: the API maps each error class to a status code in
one place (`anbudsklar.api.app`). Messages are Swedish because they reach the user.
"""

from __future__ import annotations


class ServiceError(Exception):
    """Base class. `message` is shown to the user as is."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(ServiceError):
    """The object does not exist, or the caller may not see it (never reveal which)."""


class ConflictError(ServiceError):
    """The object is in a state that does not allow the operation."""


class InvalidInputError(ServiceError):
    """The input is well-formed but not acceptable."""


class UnsupportedFileError(ServiceError):
    """An uploaded file has a type we cannot read."""


class FileTooLargeError(ServiceError):
    """An uploaded file is larger than allowed."""
