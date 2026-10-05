"""File types we accept for uploads (procurement documents and tender drafts)."""

from __future__ import annotations

from pathlib import PurePosixPath

from anbudsklar.documents.extract import DocumentError, DocumentTooLarge, UnsupportedDocument
from anbudsklar.services.errors import (
    FileTooLargeError,
    InvalidInputError,
    ServiceError,
    UnsupportedFileError,
)

DOCX_MIMETYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
MIMETYPES = {".pdf": "application/pdf", ".docx": DOCX_MIMETYPE, ".txt": "text/plain"}
UNSUPPORTED_MESSAGE = "Filtypen stöds inte. Ladda upp en PDF, ett Word-dokument (DOCX) eller en textfil."


def mimetype_for(filename: str) -> str:
    """The type is taken from the file name: browsers often send DOCX as application/octet-stream."""

    mimetype = MIMETYPES.get(PurePosixPath(filename).suffix.lower())
    if mimetype is None:
        raise UnsupportedFileError(UNSUPPORTED_MESSAGE)
    return mimetype


def as_service_error(error: DocumentError) -> ServiceError:
    """Extraction errors carry a Swedish message that is safe to show.

    A document over the extraction limits (pages, text, unpacked size) answers 413 like
    an upload over the byte limit, so the client shows "too large" rather than "invalid".
    """

    if isinstance(error, UnsupportedDocument):
        return UnsupportedFileError(str(error) or UNSUPPORTED_MESSAGE)
    if isinstance(error, DocumentTooLarge):
        return FileTooLargeError(str(error))
    return InvalidInputError(str(error))
