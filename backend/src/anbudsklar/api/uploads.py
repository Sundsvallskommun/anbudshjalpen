"""Reading uploaded files into memory, with a hard size cap.

FastAPI's `UploadFile` spools anything above 1 MB to a temporary file on disk. Tender
drafts must never touch the disk, so uploads are parsed here with the same multipart
parser but a spool size above the cap, and the request stream is cut off as soon as
it grows past the cap. A draft may be several files (decision 0025), all in the `file`
field; the cap is on the files together.
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


def upload_openapi(*, several: bool = False) -> dict[str, Any]:
    """OpenAPI description of the multipart body, since the route reads the request itself."""

    binary: dict[str, Any] = {"type": "string", "format": "binary"}
    field = {"type": "array", "items": binary} if several else binary
    return {
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {"type": "object", "required": [FIELD], "properties": {FIELD: field}}
                }
            },
        }
    }


UPLOAD_OPENAPI: dict[str, Any] = upload_openapi()


@dataclass(frozen=True)
class UploadedFile:
    filename: str
    data: bytes


async def read_upload(request: Request, *, max_bytes: int, too_large_message: str) -> UploadedFile:
    """The one `file` field of a multipart request, held in memory only."""

    [upload] = await read_uploads(
        request, max_bytes=max_bytes, max_files=1, too_large_message=too_large_message
    )
    return upload


async def read_uploads(
    request: Request, *, max_bytes: int, max_files: int, too_large_message: str
) -> list[UploadedFile]:
    """The `file` fields of a multipart request, in order, held in memory only.

    `max_bytes` caps the files together, so the memory a request can take is known
    whatever the number of files. Every file must have a name and some content.
    """

    if not request.headers.get("content-type", "").startswith("multipart/form-data"):
        raise InvalidInputError("Skicka filen som multipart/form-data i fältet 'file'.")
    limit = max_bytes + MULTIPART_OVERHEAD_BYTES
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise FileTooLargeError(too_large_message)

    parser = MultiPartParser(
        request.headers,
        _capped(request.stream(), limit, too_large_message),
        max_files=max_files,
        max_fields=5,
    )
    parser.spool_max_size = limit  # keep file parts in memory
    try:
        form = await parser.parse()
    except MultiPartException as exc:
        if "Too many files" in str(exc):
            raise InvalidInputError(f"Ladda upp högst {max_files} filer åt gången.") from exc
        raise InvalidInputError("Filen kunde inte läsas från formuläret.") from exc
    uploads: list[UploadedFile] = []
    try:
        for upload in form.getlist(FIELD):
            if not isinstance(upload, UploadFile) or not upload.filename:
                raise InvalidInputError("Välj en fil att ladda upp.")
            data = await upload.read()
            if not data:
                raise InvalidInputError(f"Filen {_safe_filename(upload.filename)} är tom.")
            uploads.append(UploadedFile(filename=_safe_filename(upload.filename), data=data))
    finally:
        await form.close()
    if not uploads:
        raise InvalidInputError("Välj en fil att ladda upp.")
    if sum(len(upload.data) for upload in uploads) > max_bytes:
        raise FileTooLargeError(too_large_message)
    return uploads


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
