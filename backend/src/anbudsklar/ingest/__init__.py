"""Ingestion of public procurement data: TED, e-Avrop, LOU, CPV and the agreement catalogue.

Each job takes a session and leaves committing to the caller (the worker and the CLI use
`anbudsklar.db.session_scope()`), so a failed run stores nothing.
"""

from anbudsklar.ingest.agreements import load_agreements
from anbudsklar.ingest.common import IngestError
from anbudsklar.ingest.cpv import load_cpv
from anbudsklar.ingest.eavrop import ingest_eavrop
from anbudsklar.ingest.lou import LouRow, consolidated_through, ingest_lou, parse_lou_text
from anbudsklar.ingest.ted import ingest_ted

__all__ = [
    "IngestError",
    "LouRow",
    "consolidated_through",
    "ingest_eavrop",
    "ingest_lou",
    "ingest_ted",
    "load_agreements",
    "load_cpv",
    "parse_lou_text",
]
