# Kommunens styrdokument för inköp

Här ligger de styrdokument för inköp som Regelhjälpen använder som källa vid sidan av LOU
([beslut 0022](../../docs/decisions/0022-kommunens-styrdokument-som-kalla.md)). Anbudshjälpen läser in filerna i
tabellerna `policy_documents` och `policy_sections` med `anbudsklar ingest styrdokument` (koden finns i
`backend/src/anbudsklar/ingest/policies.py`). Worker läser in dem varje gång den startar, så en ändrad fil följer med
nästa driftsättning.

Ett styrdokument binder kommunens egna beställare, inte leverantören. Webbappen och MCP-verktygen märker därför
källan "Kommunens styrdokument" och aldrig som lag.

## Innehåll

| Fil | Dokument | Fastställt | Sidor i PDF:en |
|---|---|---|---|
| `inkopsstrategi.md` | Inköpsstrategi för Sundsvalls kommun (KSK-2023-00196) | Kommunfullmäktige 2023-09-25, gäller tills vidare med en första översyn i september 2025 | 13 |

## Källa och villkor

- Inköpsstrategin är hämtad 2026-10-14 från
  <https://sundsvall.se/download/18.4e5393d518baba17dbc64c8/1699606464094/Ink%C3%B6psstrategi_Sundsvalls_Kommun_2023-09-25.pdf>,
  länkad från kommunens sida om upphandling och inköp på sundsvall.se.
- Strategin är fastställd genom beslut av kommunfullmäktige. Beslut av myndigheter omfattas inte av upphovsrätt
  (1 kap. 9 § upphovsrättslagen), och dokumentet är dessutom kommunens eget.
- Inköp har bekräftat 2026-10-14 att versionen från 2023 gäller.

## Filens form

Varje fil är ett dokument. Den börjar med ett block mellan två rader `---` med en uppgift per rad, `nyckel: värde`:

| Nyckel | Innehåll | Krävs |
|---|---|---|
| `slug` | Dokumentets id i databasen, samma som filnamnet utan `.md` | Ja |
| `title` | Dokumentets fullständiga titel | Ja |
| `short_title` | Namnet i hänvisningar, till exempel `Inköpsstrategin` i "Inköpsstrategin 5.2" | Ja |
| `source_url` | Den publika adressen till PDF:en. Källkorten länkar till den med `#page=N` | Ja |
| `decided_by`, `decided_on` | Vem som fastställde dokumentet och när (ÅÅÅÅ-MM-DD). Står på källkortet | Nej |
| `diarienummer`, `validity`, `retrieved_on` | Diarienummer, giltighet med dokumentets egna ord, och dagen PDF:en hämtades | Nej |

Därefter kommer ett avsnitt per rubrik `## <nummer> <rubrik> (s. N)` eller `(s. N–M)`, där sidorna är PDF-läsarens
sidnummer (inköpsstrategins egen numrering börjar först på fjärde sidan). Avsnitt utan egen text, som "2 Inledning",
utelämnas. Varje stycke står på en rad, punktlistor skrivs med `- ` först på raden, och tomma rader skiljer styckena.

## Så återges texten

Texten är kommunens egen, återgiven ordagrant så att citat ur den går att kontrollera. Det här är ändrat jämfört med
PDF:ens textlager, som delar ord på fel ställen:

- radbrytningar inuti meningar är borttagna och ord som delats ("trösk lar", "Su ndsvall") är hopfogade
- punktlistor skrivs med `- ` i stället för PDF:ens punkter
- tabellen med måldefinitionerna i avsnitt 3 skrivs som "Term: text"
- fotnoten på sidan 4 står sist i avsnitt 1 och börjar med "Fotnot 1:"
- figurtexten på sidan 6 står som ett stycke i avsnitt 4

Stavfel och saknade skiljetecken i originalet är inte rättade.

## Uppdatera eller lägga till ett dokument

1. Hämta PDF:en från sundsvall.se och ta ut texten sida för sida, till exempel med `pypdf` som redan finns i
   backend: `cd backend && uv run python -c "from pypdf import PdfReader; ..."`.
2. Skriv eller uppdatera filen enligt formen ovan. Foga ihop delade ord mot PDF:en, men ändra inte orden.
3. Uppdatera tabellen Innehåll och källuppgifterna här, och raden i [Datakällor](../../docs/data-sources.md).
4. Kör `cd backend && uv run anbudsklar ingest styrdokument` och testerna i `backend/tests/ingest/test_policies.py`,
   som räknar avsnitten och kontrollerar kända texter. Ändras antalet avsnitt ändras testet i samma commit.
5. Låt inköp läsa igenom ändringen i pull requesten: det är kommunens text som visas för företagen.

Ett dokument som tas bort ur mappen tas bort ur databasen vid nästa inläsning.
