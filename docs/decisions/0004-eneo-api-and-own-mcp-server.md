# 0004: PoC:n använder Eneo via API och en egen MCP-server

- **Status:** Accepterat
- **Datum:** 2026-10-05
- **Ersätter:** [0001](0001-poc-standalone-production-on-eneo.md)
- **Gäller:** hur PoC:n anropar AI, hur Eneos assistenter når upphandlingsdatan och vägen till produktion

## Sammanhang

Beslut 0001 sa att PoC:n anropar en språkmodell direkt och att MCP inte behövs. Sedan dess har vi gått igenom Eneo 2.2
mot koden (release candidate `v2.2.0-rc.6`, 2026-10-02):

- Assistenter kan anropas över HTTP med en servicenyckel (`sk_`) som bara gäller ett space. Det räcker för
  Anbudsklars uppgifter, och Eneos loggning, modellstyrning och lagringstider gäller då redan i PoC:n.
- En servicenyckel kan inte ladda upp filer. Underlaget måste därför skickas som text i frågan. Det passar oss, eftersom
  vi ändå delar upp texten per sida och kontrollerar citaten mot samma sidor.
- Eneos MCP-klient finns i 2.2. En assistent kan alltså hämta upphandlingar, sidor ur underlag, LOU-paragrafer och
  CPV-koder från en server som vi äger.
- Eneos kunskapssökning hänvisar till hela dokument utan sidnummer och kan inte filtrera på metadata. Regelfrågor
  behöver hänvisa till kapitel och paragraf, och upphandlingsdata behöver filter på CPV, datum och status.
- Flows är fortfarande inte klart att bygga på, och widgets är inte släppta. Se [Eneos byggstenar](../eneo-building-blocks.md).

Att testa mot Eneo redan nu visar om integrationen håller: nycklar, lagringstid, MCP och modellernas förmåga att svara
med JSON. Det är svårt att se med direkta modellanrop.

## Beslut

AI-motorn i PoC:n är en testinstans av Eneo (2.2 eller senare) som anropas via Eneos API.

- `anbudsklar eneo provision` skapar ett space för Anbudsklar med en assistent per AI-uppgift. Instruktionerna kommer
  från textfilerna i repot. Insights är avstängt och lagringstiden är en dag.
- Appen anropar assistenterna med en servicenyckel som bara gäller det spacet. Underlaget skickas som text med
  sidmarkeringen `[SIDA n]`, och sessionen raderas efter varje anrop.
- Appen har en egen MCP-server på `/mcp` som bara läser offentliga data: upphandlingar, sidor ur underlag, publicerade
  checklistor, LOU, CPV-koder och kommande upphandlingar. Företagsdata exponeras aldrig.
- AI-motorn ligger kvar bakom ett gränssnitt med två reservmotorer, som väljs med `AI_ENGINE`: `openai` anropar ett
  OpenAI-kompatibelt API direkt, och `heuristic` fungerar utan språkmodell. Reservmotorerna används i tester, vid demo
  utan Eneo och som jämförelse i kvalitetstestet.
- Varje uppgift har fasta indata och ett typat JSON-svar, i samma form som ett steg i Eneo Flows. Vår egen kod
  kontrollerar citaten.

I produktion flyttas de styrda uppgifterna (tolka underlag, granska utkast, bedöma matchning och föreslå CPV-koder)
till Eneo Flows när Flows är klart, inte nu. Regelhjälpen och frågor om ett underlag kan förbli assistenter. MCP-servern
följer med till produktion.

Det starkaste alternativet var att behålla 0001 och anropa modellen direkt. Det är snabbare att komma igång och
oberoende av Eneo, men testar inte integrationen, ger ingen MCP-åtkomst och gör flytten till Eneo större senare.

Två andra alternativ valdes bort:

- **Bygga på Flows nu.** Arbetet är inte klart.
- **Bygga hela appen som en Eneo-modul.** Moduler kräver ett Eneo-konto, sparar inget själva och når inte internet.

## Konsekvenser

- PoC:n behöver en Eneo-testinstans, som körs i Dokploy ([deploy/dokploy](../../deploy/dokploy/README.md)). Tills den
  finns används `heuristic` eller `openai`.
- Underlag och frågor passerar Eneo. Sessionen raderas direkt, och lagringstiden på en dag är ett skyddsnät. Därför
  kräver servicenyckeln admin-behörighet i spacet och ett utgångsdatum.
- MCP-servern måste nås från Eneo via https utan omdirigering. Ändrar vi ett verktygs beskrivning eller parametrar
  måste en admin i Eneo synka och godkänna verktyget igen.
- Instruktionerna ägs av repot. `anbudsklar eneo provision` skriver över ändringar som gjorts i Eneos gränssnitt.
- Fel som vi hittar i Eneo, till exempel att MCP-klienten inte följer omdirigeringar, skrivs upp i
  [Öppna frågor](../open-questions.md) och rapporteras till Eneo.
- Hur integrationen fungerar står i [Eneo-integration](../eneo-integration.md).
