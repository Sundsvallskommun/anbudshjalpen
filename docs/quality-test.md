# Kvalitetstest

Syfte: Beskriva hur vi mäter att uppgiften "tolka underlag" hittar rätt krav och citerar rätt, och hur facit skrivs.

Läs detta när: Du ska jämföra motorer eller modeller, har ändrat en instruktion, lägger till ett underlag med facit
eller ska förklara siffrorna för verksamheten.

Hör ihop med: [AI-uppgifterna](ai-tasks.md), [PoC](poc.md), [Datakällor](data-sources.md)

## Vad testet mäter

Testet kör "tolka underlag" på varje underlag som har ett facit, kontrollerar citaten och jämför de krav som AI:n
hittat med facit.

| Mått | Betyder |
|---|---|
| Täckning (recall) | Andelen krav i facit som AI:n hittade |
| Precision | Andelen krav från AI:n som finns i facit |
| Verifierade citat | Andelen citat som står på den sida AI:n angav |

Ett krav från AI:n räknas som en träff när citatet står på samma sida som facit, eller sidan före eller efter, och
liknar facits citat tillräckligt (rapidfuzz `partial_ratio` minst 80 efter normalisering). Skiljer sig citaten räcker
det att rubrikerna liknar varandra (minst 90). Ett krav från AI:n kan bara räknas som träff för ett krav i facit.
Gränserna står i `backend/src/anbudsklar/eval/scoring.py`. Rapporten har också en tabell som visar varje krav i facit
och vad AI:n gav för det.

## Köra testet

Från `backend/`:

```bash
uv run anbudsklar eval --engine heuristic
uv run anbudsklar eval --engine eneo --fixtures ../data/fixtures
```

| Flagga | Standard |
|---|---|
| `--engine` | `AI_ENGINE` |
| `--fixtures` | `DATA_DIR/fixtures`, alltså `data/fixtures` |
| `--out` | `reports/` i repots rot |

`make eval` i repots rot kör testet med standardvärdena. Resultatet blir `eval-<motor>-<datum>.md` och `.json`.
Katalogen `reports/` checkas inte in. Ett underlag där motorn ger fel räknas som noll hittade krav, så att felet syns
i siffrorna.

Kör `heuristic` först. Den använder ingen språkmodell och ger en undre gräns: en språkmodell som inte slår den gör
ingen nytta.

På de tre påhittade underlagen i `data/fixtures` ger `heuristic` 100 % täckning (111 av 111 krav), 94 % precision (111
av 118 utplockade) och 100 % verifierade citat (2026-10-05). Underlagen är skrivna i samma projekt som reglerna, så
siffrorna säger mer om att reglerna fungerar än om hur motorn klarar riktiga underlag. Testet
`backend/tests/eval/test_eval_fixtures.py` körs med `make check-backend` och kräver minst 90 % täckning, totalt och för
varje underlag, minst 85 % precision och att alla citat är verifierade.

## Facit

Varje underlag med facit ligger i en egen katalog under `data/fixtures/` med filen `facit.json`. Filen är en lista med
ett objekt per krav, och katalogen har då exakt ett underlag (filer med "utkast" i namnet räknas inte):

```json
[
  {
    "id": "K13",
    "kind": "kvalificeringskrav",
    "page": 7,
    "quote_fragment": "Anbudsgivaren ska vara godkänd för F-skatt och ha fullgjort sina skyldigheter att betala skatter och socialförsäkringsavgifter.",
    "title": "Godkänd för F-skatt och inga skatteskulder"
  }
]
```

Har katalogen flera dokument skrivs filen som `{"document": "<filnamn>", "items": [...]}`.

| Fält | Innehåll |
|---|---|
| `id` | Kort id inom filen |
| `kind` | Samma typer som i kontraktet: `skallkrav`, `kvalificeringskrav`, `krav_pa_uppdraget` eller `avtalsvillkor` |
| `page` | Sidan där kravet står, räknat från 1 |
| `quote_fragment` | Ordagrann text från sidan, tillräckligt lång för att vara unik |
| `title` | Kravet i några ord |

Exemplet kommer från det påhittade underlaget om ommålning av Solbackens förskola. Facit finns för alla tre
påhittade underlag.

## Riktiga underlag från inköp

Facit för riktiga underlag skrivs av inköp: inköparen markerar vilka krav som faktiskt finns i underlaget. Riktiga
underlag checkas inte in förrän inköp har bekräftat att de får ligga i ett öppet repo. Lägg dem i en lokal katalog
med samma struktur och peka `--fixtures` dit.

## Läsa resultatet

- Låg täckning är allvarligast. Ett missat skallkrav kan få ett anbud förkastat.
- Låg precision gör checklistan längre än den behöver vara, men inköparen kan ta bort krav före publicering.
- Citat som inte kan kontrolleras visas som okontrollerade i appen. En hög andel tyder på att modellen skriver om
  texten i stället för att citera.

Vilka nivåer som räcker för att checklistorna ska få publiceras avgörs med inköp.
