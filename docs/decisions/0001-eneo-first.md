# 0001: Eneo först

- **Status:** Föreslaget
- **Datum:** 2026-10-05
- **Gäller:** vad som byggs i Eneo och vad som byggs i det här repot

## Sammanhang

Underlaget beskriver en fristående tjänst med eget AI-lager. Sundsvalls publika tjänster når i dag Eneo via proxyer,
men de finns för att nyckelhanteringen i Eneo tidigare var svag. Proxyerna ska avvecklas så att apparna anropar Eneo
direkt.

Eneo har eller får byggstenar som täcker det mesta av AI-delen: assistenter med kunskap, MCP, API-nycklar för
servicekonton, widgets för anonyma besökare och Flows med typade svar och granskningssteg. Se
[Eneos byggstenar](../eneo-building-blocks.md).

Eneo saknar tre saker:

- identitet för externa användare
- notiser
- en datamodell för upphandlingar, profiler och bevakningar

## Beslut

Allt generellt ligger i Eneo:

- regelfrågor som en widget
- tolkning, granskning och matchning som Flows
- inköparnas assistent med MCP

Det här repot bygger bara det som är upphandlingsspecifikt eller kräver företagsidentitet:

- insamling och lagring av upphandlingsdata, exponerad via API och MCP
- företagarappen med inloggning, profil, bevakning och påminnelser

Appen anropar Eneo direkt med en `sk_`-nyckel som ägs av ett servicekonto. Det finns ingen generell proxy.

Det starkaste alternativet var en helt fristående tjänst med egna anrop till en språkmodell. Den vore snabbare att komma
igång med och oberoende av Eneos tidplan. Nackdelen är att den skapar en ny AI-plattform att förvalta, dubblerar
modellstyrning och loggning, och tar ifrån verksamheten möjligheten att själv justera instruktioner och flöden i Eneo.

En Eneo-modul för hela lösningen valdes bort. Moduler kräver ett Eneo-konto, sparar inget själva och når inte internet.

## Konsekvenser

- Verksamheten kan äga instruktioner, källor och flöden i Eneos gränssnitt. Flöden kan senare delas med andra kommuner
  som paket.
- PoC:n beror på att Flows och widgets är klara. Ligger de långt bort måste PoC:n börja med assistenter och byta senare.
- Anbudsklars assistenter och flöden behöver ett eget space med Insights avstängt och kort lagringstid.
- Behov som Eneo saknar men som fler kan ha nytta av, till exempel att skicka med sidans sammanhang i widgets eller
  filtrera på metadata vid sökning, föreslås till Eneo i stället för att lösas här.
