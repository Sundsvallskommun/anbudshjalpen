"""Reading a single uploaded file into memory, with a hard size cap.

FastAPI's `UploadFile` spools anything above 1 MB to a temporary file on disk. Tender
drafts must never touch the disk, so uploads are parsed here with the same multipart
parser but a spool size above the cap, and the request stream is cut off as soon as
it grows past the cap.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any

from fastapi import Request
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from anbudsklar.services.errors import FileTooLargeError, InvalidInputError

FIELD = "file"
MULTIPART_OVERHEAD_BYTES = 64 * 1024
MAX_FILENAME_CHARS = 255

# OpenAPI description of the multipart body, since the route reads the request itself.
UPLOAD_OPENAPI: dict[str, Any] = {
    "requestBody": {
        "required": True,
        "content": {
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "required": [FIELD],
                    "properties": {FIELD: {"type": "string", "format": "binary"}},
                }
            }
        },
    }
}


@dataclass(frozen=True)
class UploadedFile:
    filename: str
    data: bytes


async def read_upload(request: Request, *, max_bytes: int, too_large_message: str) -> UploadedFile:
    """The `file` field of a multipart request, held in memory only."""

    if not request.headers.get("content-type", "").startswith("multipart/form-data"):
        raise InvalidInputError("Skicka filen som multipart/form-data i fältet 'file'.")
    limit = max_bytes + MULTIPART_OVERHEAD_BYTES
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise FileTooLargeError(too_large_message)

    parser = MultiPartParser(
        request.headers, _capped(request.stream(), limit, too_large_message), max_files=1, max_fields=5
    )
    parser.spool_max_size = limit  # keep file parts in memory
    try:
        form = await parser.parse()
    except MultiPartException as exc:
        raise InvalidInputError("Filen kunde inte läsas från formuläret.") from exc
    try:
        upload = form.get(FIELD)
        if not isinstance(upload, UploadFile) or not upload.filename:
            raise InvalidInputError("Välj en fil att ladda upp.")
        data = await upload.read()
    finally:
        await form.close()
    if len(data) > max_bytes:
        raise FileTooLargeError(too_large_message)
    if not data:
        raise InvalidInputError("Filen är tom.")
    return UploadedFile(filename=_safe_filename(upload.filename), data=data)


async def _capped(
    stream: AsyncGenerator[bytes, None], limit: int, message: str
) -> AsyncGenerator[bytes, None]:
    received = 0
    async for chunk in stream:
        received += len(chunk)
        if received > limit:
            raise FileTooLargeError(message)
        yield chunk


def _safe_filename(raw: str) -> str:
    """Only the last path segment, whichever separator the client's system uses."""

    name = raw.replace("\\", "/").rsplit("/", 1)[-1].strip()
    return name[-MAX_FILENAME_CHARS:] or "fil"
