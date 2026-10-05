# 0005: Sökning i upphandlingsdatan görs i Postgres

- **Status:** Accepterat
- **Datum:** 2026-10-05
- **Gäller:** sökning i annonser, sidor ur underlag, LOU och CPV-koder, i appen och i MCP-verktygen

## Sammanhang

Appen och MCP-verktygen behöver söka i fyra slags data: annonser, sidor ur underlag, paragrafer i LOU och CPV-koder.
Sökningen behöver:

- filter på metadata, till exempel CPV-prefix, status, sista anbudsdag, avsnitt i underlaget och sidintervall
- träffar på en bestämd sida, så att ett citat kan kontrolleras och hänvisa till rätt sida
- exakta termer, eftersom användarna söker på koder som `45442100`, ord som "ansvarsförsäkring" och hänvisningar som
  "4 kap. 1 §"

Eneos kunskapssökning är bara vektorbaserad, kan inte filtrera på metadata och hänvisar till hela dokument. Beslut 0003
säger att databasen är Postgres och att pgvector används i samma databas om vektorsökning behövs.

## Beslut

Sökningen görs i Anbudsklars egen Postgres:

- **Fulltext på svenska.** Annonser, sidor, LOU-paragrafer och CPV-benämningar har genererade `tsvector`-kolumner med
  konfigurationen `swedish` och GIN-index. Frågor tolkas med `websearch_to_tsquery`, och utdrag tas fram med
  `ts_headline`.
- **Trigram för ungefärliga träffar.** Tillägget `pg_trgm` fångar stavfel och delar av ord i titlar, sidtext och
  CPV-benämningar.
- **CPV-koder som prefix.** En sökning på `454` träffar alla koder under den grenen.

Vi bygger ingen vektorsökning nu. pgvector finns redan i databasens image och används först om kvalitetstestet visar
att sökningen missar relevanta träffar som bara går att hitta på betydelse. AI-uppgifterna får fortfarande hela
underlaget i ett anrop och använder inte sökningen för att plocka ut stycken.

Det starkaste alternativet var vektorsökning från början, med pgvector eller i Eneo. Det kräver en embeddingmodell, är
svårare att förklara och testa, och ger inte filter och exakta sidträffar utan extra arbete.

En separat sökmotor som OpenSearch valdes bort. Den blir ännu en tjänst att drifta, och datamängden är liten.

## Konsekvenser

- Allt ligger i en databas, och sökfrågorna samlas i `backend/src/anbudsklar/search/`. Testerna kör mot en riktig
  Postgres, inte mot en attrapp.
- Den svenska ordstammen delar inte upp sammansatta ord. "Försäkring" hittar inte alltid "ansvarsförsäkring" via
  fulltext. Trigram täcker en del av det, och kvalitetstestet visar om det räcker.
- Migrationen slår på `pg_trgm`. Den som byter databasimage måste se till att tillägget finns.
