"""Zip archives among a procurement's files: drawings, earlier rounds of questions, photos.

e-Avrop announces archives as files like "11.4 Ritningar.zip". The readable members
(PDF, Word, Excel, text) become documents of their own, named "11.4 Ritningar.zip › plan.pdf"
so the reader sees where they came from, and the rest are reported as unread. The archive
is read in memory, one member at a time, with the same kind of guards as the Office
readers: a member count, a size per member and a compression ratio, so that a small file
can never unpack into gigabytes.
"""

from __future__ import annotations

import io
import zipfile
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import PurePosixPath

from anbudsklar.documents.extract import SUPPORTED_SUFFIXES, DocumentError

ZIP_MAX_MEMBERS = 500
"""Most files in an archive; a set of drawings is a few dozen."""
ZIP_MAX_MEMBER_BYTES = 50 * 1024 * 1024
"""Largest member read, the same as the largest document fetched."""
ZIP_MAX_COMPRESSION_RATIO = 100
"""Highest unpacked/packed ratio for a large member; documents pack about 2-20x."""
ZIP_RATIO_MIN_BYTES = 1024 * 1024
MEMBER_SEPARATOR = " › "
"""Between the archive's name and the member's path in a stored document's file name."""
# Housekeeping files operating systems add to archives, never documents.
_IGNORED_PARTS = frozenset({"__MACOSX", ".DS_Store", "Thumbs.db", "desktop.ini"})


class ArchiveError(DocumentError):
    """The archive cannot be read. The message is Swedish and safe to show."""


@dataclass(frozen=True)
class ArchiveMember:
    """One file in an archive."""

    path: str  # inside the archive, with "/" between folders
    size: int  # unpacked

    @property
    def suffix(self) -> str:
        return PurePosixPath(self.path).suffix.lower()

    @property
    def readable(self) -> bool:
        return self.suffix in SUPPORTED_SUFFIXES

    def document_name(self, archive: str) -> str:
        """The stored file name: the archive, then the member's folders and name."""

        parts = [part for part in self.path.split("/") if part]
        return MEMBER_SEPARATOR.join([archive, *parts])


def member_prefix(archive: str) -> str:
    """What the names of an archive's documents start with."""

    return archive + MEMBER_SEPARATOR


def _open(data: bytes) -> zipfile.ZipFile:
    try:
        return zipfile.ZipFile(io.BytesIO(data))
    except Exception as exc:  # BadZipFile, or a damaged central directory
        raise ArchiveError("Arkivet kunde inte packas upp. Det kan vara skadat.") from exc


def list_members(data: bytes) -> list[ArchiveMember]:
    """The archive's files, folders and housekeeping files left out.

    Raises `ArchiveError` for a damaged archive or one with too many files.
    """

    with _open(data) as archive:
        infos = [info for info in archive.infolist() if not info.is_dir()]
    if len(infos) > ZIP_MAX_MEMBERS:
        raise ArchiveError(f"Arkivet innehåller fler än {ZIP_MAX_MEMBERS} filer och läses inte.")
    members = []
    for info in infos:
        parts = info.filename.replace("\\", "/").split("/")
        if any(part in _IGNORED_PARTS for part in parts) or not parts[-1]:
            continue
        members.append(ArchiveMember(path="/".join(part for part in parts if part), size=info.file_size))
    return members


def read_member(data: bytes, member: ArchiveMember) -> bytes:
    """The member's bytes. Raises `ArchiveError` when it is too large or packed suspiciously."""

    if member.size > ZIP_MAX_MEMBER_BYTES:
        raise ArchiveError(f"Filen är större än {ZIP_MAX_MEMBER_BYTES // (1024 * 1024)} MB.")
    with _open(data) as archive:
        info = next(
            (
                candidate
                for candidate in archive.infolist()
                if candidate.filename.replace("\\", "/").strip("/") == member.path
            ),
            None,
        )
        if info is None:
            raise ArchiveError("Filen finns inte i arkivet.")
        ratio = info.file_size / max(info.compress_size, 1)
        if info.file_size >= ZIP_RATIO_MIN_BYTES and ratio > ZIP_MAX_COMPRESSION_RATIO:
            raise ArchiveError("Filen är packad på ett sätt som inte går att lita på.")
        try:
            with archive.open(info) as stream:
                return stream.read(ZIP_MAX_MEMBER_BYTES + 1)[:ZIP_MAX_MEMBER_BYTES]
        except Exception as exc:  # bad CRC, encrypted member, unsupported compression
            raise ArchiveError("Filen i arkivet kunde inte läsas.") from exc


def readable_members(members: list[ArchiveMember]) -> Iterator[ArchiveMember]:
    return (member for member in members if member.readable)


def unread_summary(members: list[ArchiveMember], failed: int = 0) -> str | None:
    """One Swedish line about what in the archive was not read, or None when everything was.

    Drawings come as dozens of CAD files; one line per archive says so without listing them.
    """

    skipped = [member for member in members if not member.readable]
    if not skipped and not failed:
        return None
    suffixes = ", ".join(sorted({member.suffix or "utan filändelse" for member in skipped}))
    if not any(member.readable for member in members):
        return f"Arkivet innehåller inga filer som går att läsa ({suffixes})"
    parts = []
    if skipped:
        parts.append(f"{len(skipped)} filer i arkivet kunde inte läsas ({suffixes})")
    if failed:
        parts.append(f"{failed} filer i arkivet gick inte att läsa")
    return "; ".join(parts)
