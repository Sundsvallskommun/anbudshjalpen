"""Small text helpers for keyword-based prefilters (CPV candidates, matching)."""

from __future__ import annotations

import re

# Words that say nothing about what a company does: common Swedish words, the places
# every local notice and profile mention, and the vocabulary of procurement itself. A
# notice that shares only such words with a profile is not a candidate (services.matching).
_STOPWORD_TEXT = """
    alla allt andra annat arbete arbetar arbeten bland både denna detta deras dessa dessutom eller
    erbjuder finns flera främst genom hela huvudsakligen inom inte mellan många mycket några något
    också olika samt samtliga sedan sina sitt själva stora under utan utför varje vilka vilket våra
    vårt även egen egna eget efter över blir vara gäller omfattar avser ingår exempel inklusive
    till från enligt kommer måste skulle ingen inga vilken skall vill bara redan alltid fler mest
    själv ännu dock vars sådan sådana dels ofta gärna
    företag företaget företagets kunder kund kunden tjänst tjänster uppdrag uppdraget projekt
    kvalitet erfarenhet service hjälp behov personal anställda anställd lokala lokalt mindre större
    medelstora privata privatpersoner tidigare lämnat lämnar lämna anbud anbudet anbudsgivare
    upphandling upphandlingen upphandlingar upphandlande avtal avtalet avtalstid ramavtal
    ramavtalet leverans leveranser leverera levererar leverantör leverantören leverantörer
    offentlig offentliga offentligt myndighet myndigheter verksamhet verksamheter
    kommun kommunen kommunens kommuner kommunala region regionen sverige svenska
    sundsvall sundsvalls timrå härnösand matfors kramfors sollefteå örnsköldsvik ånge
    västernorrland norrland
"""
_STOPWORDS = frozenset(_STOPWORD_TEXT.split())
_WORD = re.compile(r"[a-zåäöéü]{4,}", re.IGNORECASE)


def keywords(text: str, *, limit: int = 12) -> list[str]:
    """Distinct lower-case words of four letters or more, in order of first appearance.

    Only letters survive, so the result is safe to join into a `websearch_to_tsquery`
    expression without quoting.
    """

    found: dict[str, None] = {}
    for match in _WORD.finditer(text):
        word = match.group(0).lower()
        if word not in _STOPWORDS:
            found.setdefault(word, None)
        if len(found) >= limit:
            break
    return list(found)
