"""Guard: the MCP package never reads company-owned tables.

Company profiles, questions, matches and reminders belong to one company each, and MCP
callers are assistants that serve anyone. Checking imports keeps that boundary visible
in review instead of relying on each tool's discipline.
"""

from __future__ import annotations

import ast
from pathlib import Path

import anbudsklar.mcp

COMPANY_OWNED_MODELS = {"Company", "User", "MatchRecord", "QuestionLog", "Reminder"}
PACKAGE_DIR = Path(anbudsklar.mcp.__file__).parent


def model_references(source: str) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.ImportFrom) and node.module == "anbudsklar.models":
            names |= {alias.name for alias in node.names}
        elif isinstance(node, ast.Import) and any(alias.name == "anbudsklar.models" for alias in node.names):
            names.add("<whole module>")
    return names


def test_mcp_package_never_imports_company_owned_models() -> None:
    sources = sorted(PACKAGE_DIR.rglob("*.py"))

    assert sources, "MCP package not found"
    for path in sources:
        referenced = model_references(path.read_text(encoding="utf-8"))
        assert "<whole module>" not in referenced, f"{path.name}: import model classes by name"
        assert not referenced & COMPANY_OWNED_MODELS, (
            f"{path.name} imports {referenced & COMPANY_OWNED_MODELS}"
        )
