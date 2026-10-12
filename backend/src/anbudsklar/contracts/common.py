"""Shared building blocks for the AI task contracts.

Every AI task has typed inputs and one typed JSON output, the same shape as an Eneo
Flow step (form fields and files in, an output contract out). That keeps the engine
swappable: the PoC can call Eneo assistants, an OpenAI-compatible endpoint or the
offline heuristic engine, and production can move each task into an Eneo Flow
without changing anything that consumes the result.

Fields that our own verification fills in (citation checks) are part of the stored
model but are stripped from the JSON schema the language model sees, so a model can
never claim that its own citation is verified.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# Keys that only our code may set. They are removed from the schema shown to models.
VERIFICATION_KEYS: frozenset[str] = frozenset(
    {"check", "found_page", "draft_check", "document_id", "found_answer", "answer_key"}
)

CitationCheck = Literal["verified", "moved", "unverified"]


class ContractModel(BaseModel):
    """Base for all contract models.

    Unknown keys are ignored rather than rejected: models occasionally add harmless
    extra fields, and a retry for that would cost more than it protects.
    """

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


class Citation(ContractModel):
    """A verbatim quote from a document page that supports a claim."""

    page: int = Field(ge=1, description="1-based page number taken from the [SIDA n] marker.")
    quote: str = Field(
        min_length=3,
        max_length=400,
        description="Exact text copied from that page, at most a sentence or two.",
    )
    check: CitationCheck | None = Field(
        default=None,
        description="Set by citation verification: verified, moved (found on another page) or unverified.",
    )
    found_page: int | None = Field(
        default=None, description="Page where verification found the quote, when it differs."
    )
    document: str | None = Field(
        default=None,
        description="The document's name from its DOKUMENT: line, when the material has several documents.",
    )
    document_id: str | None = Field(
        default=None, description="Set by citation verification: the document where the quote was found."
    )


# Citation verification finds the quote among the answers and sets `answer_key`, the answer's
# stable key, so the web app links to the right entry even if the numbering moves. That is said
# here and not in the docstring, which becomes the schema description the model reads.
class AnswerCitation(ContractModel):
    """A verbatim quote from one of the buyer's published answers in e-Avrop (decision 0018).

    The answers belong to the procurement documents and reach every supplier, so a claim may
    rest on one.
    """

    answer: int = Field(ge=1, description="The answer's number from its [SVAR n] marker.")
    quote: str = Field(
        min_length=2,
        max_length=400,
        description="Exact text copied from the buyer's answer (or the question it answers), "
        "at most a sentence or two.",
    )
    check: CitationCheck | None = Field(
        default=None,
        description="Set by citation verification: verified, moved (found in another answer) or unverified.",
    )
    found_answer: int | None = Field(
        default=None,
        description="Set by citation verification: the answer that holds the quote, when it differs.",
    )
    answer_key: str | None = Field(
        default=None,
        description="Set by citation verification: the stable key of the answer that holds the quote.",
    )


def model_output_schema(model: type[BaseModel]) -> dict[str, Any]:
    """JSON schema for a contract as the language model should see it.

    Verification-only keys are removed recursively, including from `required`.
    """

    schema = model.model_json_schema()

    def strip(node: Any) -> Any:
        if isinstance(node, dict):
            properties = node.get("properties")
            if isinstance(properties, dict):
                for key in VERIFICATION_KEYS & properties.keys():
                    del properties[key]
                required = node.get("required")
                if isinstance(required, list):
                    node["required"] = [key for key in required if key not in VERIFICATION_KEYS]
            for value in node.values():
                strip(value)
        elif isinstance(node, list):
            for item in node:
                strip(item)
        return node

    return strip(schema)
