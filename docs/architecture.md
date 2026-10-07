# Arkitektur

Syfte: Beskriva hur PoC:n är uppbyggd, målbilden för produktion och vad som byts på vägen dit.

Läs detta när: Du ska föreslå teknik, bygga en del eller förklara lösningen för någon annan.

Hör ihop med: [Beslut](decisions/README.md), [Eneo-integration](eneo-integration.md), [AI-uppgifterna](ai-tasks.md),
[Drift](operations.md)

## PoC

```
Anbudsklar (det här repot, en image)
├─ app         FastAPI på port 3001
│  ├─ /        webbappen: Vite, React och Astryx som statiska filer
│  ├─ /api     REST-API för webbappen, med inloggning via demoperson
│  └─ /mcp     MCP-server som bara läser, för Eneos assistenter
├─ worker      schemalagda jobb: hämta annonser och LOU, stänga passerade
│              annonser, tolka underlag, matcha företag, skicka påminnelser
│              och träffar
├─ Postgres    upphandlingar, underlag per sida, checklistor, LOU, CPV-koder,
│              avtal, demoföretag och deras data; sökning med fulltext och trigram
└─ Mailpit     mejlkorg som fångar alla utskick

Eneo-testinstans (2.2, egen Compose i Dokploy)
├─ Space för Anbudsklar: en assistent per AI-uppgift, Insights av, lagring en dag
├─ Regelhjälpen: kunskap från Upphandlingsmyndigheten och sundsvall.se
└─ MCP-klient som anropar Anbudsklars /mcp
```

Beslut: [0004](decisions/0004-eneo-api-and-own-mcp-server.md) (Eneo och MCP),
[0005](decisions/0005-domain-search-in-postgres.md) (sökning), [0006](decisions/0006-vite-spa-served-by-fastapi.md)
(webbapp och backend) och [0007](decisions/0007-poc-login-persona-picker.md) (inloggning).

### Så blir ett underlag en checklista

1. Inköparen laddar upp ett underlag till en annons. Appen tar ut texten sida för sida, gissar vilket avsnitt varje
   sida hör till och sparar sidorna i Postgres.
2. Appen skickar underlaget till uppgiften "tolka underlag" direkt efter uppladdningen, och jobbet
   `interpret_pending` tar det som inte blivit klart. Med Eneo som motor går texten med sidmarkeringen `[SIDA n]` i en
   fråga till assistenten för uppgiften, och sessionen raderas efteråt. Ett misslyckat försök görs om med allt längre
   paus, och efter fem försök ger jobbet upp. Det ger upp direkt när samma underlag inte kan lyckas, till exempel när
   det är för stort för modellen. Inköparen ser underlagen som saknar checklista under Inköp › Att granska och kan
   tolka dem igen ([Drift](operations.md#schemalagda-jobb)).
3. Svaret valideras mot uppgiftens JSON-kontrakt. Är det fel ber motorn modellen rätta det.
4. Appen kontrollerar varje citat mot sidtexten: verifierat, på annan sida eller kunde inte kontrolleras. Ett datum
   eller en vikt i checklistan måste dessutom stå i sitt citat.
5. Checklistan sparas som utkast. Inköparen granskar, rättar, godkänner och publicerar den. Först då ser företagen den,
   och först då kan MCP-verktygen lämna ut den.
6. Visar sig en publicerad checklista vara fel kan inköparen dra tillbaka den med en motivering. Den blir avvisad,
   företagen ser den förra publicerade checklistan om det finns någon, matchningarna bedöms om, och checklistan kan
   rättas och publiceras igen. Inköparen gör det med knappen "Dra tillbaka" på checklistans sida
   (`POST /api/admin/checklists/{id}/withdraw`). En avvisad eller tillbakadragen checklista öppnas som utkast igen med
   "Öppna som utkast igen" (`POST /api/admin/checklists/{id}/reopen`). Bara ett utkast kan godkännas.

### AI-motorn

All kod pratar med gränssnittet `AiEngine` i `backend/src/anbudsklar/ai/engine.py`. Motorn väljs med `AI_ENGINE`.

| Motor | Vad den gör | Används när |
|---|---|---|
| `eneo` | Anropar Eneos assistenter med en servicenyckel | Den riktiga vägen i PoC:n |
| `openai` | Anropar ett OpenAI-kompatibelt API direkt | Det finns ingen Eneo-instans till hands |
| `heuristic` | Plockar ut krav och datum med regler, utan språkmodell | Tester, demo utan nätverk och som jämförelse i kvalitetstestet |

API:t ger varje resultat med motorns namn i fältet `engine`, och checklistor och matchningar sparas med det. Texterna
har inget prefix om hur de togs fram. Webbappen namnger motorn en gång per automatiskt block, i ursprungsraden:
regelbaserat för `heuristic` och AI via Eneo för `eneo` ([Design](design.md#delade-komponenter)).

### Delarna i koden

| Katalog | Ansvar |
|---|---|
| `backend/src/anbudsklar/contracts/` | Indata och JSON-kontrakt för AI-uppgifterna |
| `backend/src/anbudsklar/ai/` | Motorgränssnittet, de tre motorerna, instruktionerna och uppsättningen i Eneo |
| `backend/src/anbudsklar/documents/` | Textuttag per sida, avsnitt, lagring och citatkontroll |
| `backend/src/anbudsklar/cpv.py` | CPV-hierarkin, som sökningen, matchningen och den regelbaserade motorn läser på samma sätt |
| `backend/src/anbudsklar/search/` | Alla sökfrågor, för både API:t och MCP-verktygen |
| `backend/src/anbudsklar/ingest/` | Hämtning från TED, e-Avrop och Riksdagen, och inläsning av CPV och avtal |
| `backend/src/anbudsklar/services/` | Logiken bakom API:t och jobben |
| `backend/src/anbudsklar/api/` | FastAPI-appen, rutterna och REST-kontraktet (`schemas.py`) |
| `backend/src/anbudsklar/mcp/` | MCP-servern |
| `backend/src/anbudsklar/worker/` | Schemaläggaren och mejlen |
| `backend/src/anbudsklar/eval/` | Kvalitetstestet |
| `frontend/` | Webbappen. Sidorna, de delade komponenterna och reglerna för text står i [Design](design.md) |
| `data/` | CPV-listan och påhittade underlag, företag och avtal |
| `deploy/dokploy/` | Compose-filer för Dokploy |

## Målbild i produktion

```
Eneo (kommunens produktionsinstans)
├─ Flows:        tolka underlag · granska utkast · bedöma matchning · föreslå CPV
│                (samma JSON-kontrakt som i PoC:n; granskningssteg för inköparen)
├─ Assistenter:  Regelhjälpen, som widget på sundsvall.se när widgets är släppta;
│                frågor om ett underlag; inköparnas assistent
└─ MCP-klient som anropar Anbudsklars MCP-server

Anbudsklar
├─ Upphandlingsdata, sökning och MCP-server som i PoC:n
├─ Företagarappen med e-legitimation och kontroll av behörighet
├─ Worker: insamling, påminnelser och notiser
└─ Postgres
```

Det som byts är hur motorn `eneo` anropar Eneo: från assistenter till flöden, när Flows är klart. Appen,
upphandlingsdatan, MCP-servern och databasen följer med.

## Varför de egna delarna finns

De egna delarna finns för det som Eneo saknar eller inte ska äga.

| Behov | Varför inte i Eneo |
|---|---|
| Företagsidentitet (e-legitimation och behörighet att företräda företaget) | Eneo har inga externa användare. Widgets är anonyma, och moduler kräver ett Eneo-konto |
| Profiler, bevakningar, frister och påminnelser | Eneo har ingen sådan datamodell och kan inte skicka notiser |
| Insamling från TED, e-Avrop och avtalskatalogen | Det kräver schemaläggning, internetåtkomst och strukturerad lagring av upphandlingsdata |
| Sökning med filter och sidhänvisning | Eneos kunskapssökning är bara vektorbaserad, kan inte filtrera på metadata och hänvisar till hela dokument |

## AI-uppgifterna

| Uppgift | Indata | Svar |
|---|---|---|
| Tolka underlag | Underlaget med text per sida | Checklista med krav, bilagor, utvärdering och datum, var och en med citat och sida |
| Bedöma matchning | Företagsprofil, annons och checklista | Passar, passar delvis eller passar inte, med skäl och citat. Webbappen säger Verkar passa, Passar delvis och Verkar inte passa |
| Granska utkast | Utkastet och checklistan | Krav för krav: uppfyllt, obevisat, saknas eller oklart. Webbappen säger Ser bra ut, Bevis saknas, Hittades inte och Kontrollera själv |
| Besvara fråga | Underlaget, frågan och tidigare frågor | Svar med citat, eller att det inte står i underlaget och bör frågas formellt |
| Föreslå CPV | Företagets beskrivning och kandidater ur CPV-listan | Högst åtta koder med motivering |
| Regelhjälpen | En allmän fråga om upphandlingsregler | Svar med källor: LOU-paragrafer och vägledningar |

Indata, kontrakt och kontroller för varje uppgift står i [AI-uppgifterna](ai-tasks.md).

## Var tekniken gör nytta

| Funktion | Teknik | Varför |
|---|---|---|
| Checklista och frågor | Hela underlaget i ett anrop, utan RAG | RAG hämtar bara de mest relevanta styckena och tappar krav när frågan är "lista alla skallkrav". 40–60 sidor får plats i kontexten |
| Citat | Vår egen kontroll mot sidtexten | Modellen kan inte själv markera ett citat som kontrollerat |
| Matchning (företagarens Start) | Först fasta regler (CPV-prefix och nyckelord), sedan bedömer modellen mot kraven som plockats ut | Går att förklara och testa |
| Prediktion | Datumräkning på avtalskatalogen. Modellen sammanfattar bara förra gångens krav | Mest unikt värde, minst AI |
| Regelfrågor | En assistent i Eneo. Vägledningar ligger som kunskap, och LOU hämtas paragraf för paragraf via MCP | Hänvisningen blir kapitel och paragraf, inte ett helt dokument |
| Sökning | Fulltext på svenska och trigram i Postgres | Filter, exakta termer och sidträffar utan en extra tjänst |

MCP-servern ger Eneos assistenter läsåtkomst till offentliga upphandlingsdata. Kärnuppgifterna får hela underlaget i
frågan och behöver inte MCP. Företagsdata exponeras aldrig via MCP, och checklistor lämnas bara ut när de är
publicerade.

## Dataskydd i designen

- Ett företag kommer bara åt sina egna profiler, träffar, påminnelser och svar.
- Anbudsutkast sparas inte. Utkastet hanteras i minnet, skickas till motorn och slängs efter granskningen.
- Frågor om ett underlag sparas för inköparens sammanställning, som aldrig visar vilket företag som frågade. Exempel på
  frågor visas först efter sista anbudsdag. Frågor som ställs efter sista anbudsdag sparas inte, och inte heller
  inköparens egna provfrågor. I ett selektivt förfarande pågår anbudstiden efter sista dag för anbudsansökan, så där
  gäller den publicerade checklistans sista anbudsdag, och utan den visas inga frågor.
- Anbudsklars assistenter ligger i ett eget space i Eneo, med Insights avstängt och lagringstiden en dag. Appen
  använder en `sk_`-nyckel som ägs av ett servicekonto och bara gäller det spacet, och raderar varje session efter
  anropet.
- MCP-servern lämnar bara ut offentliga data och publicerade checklistor.
- PoC:n innehåller bara påhittade företag och personer ([beslut 0007](decisions/0007-poc-login-persona-picker.md)).

## Säkerhet i webbappen

- Strikt Content Security Policy utan `unsafe-inline`, och appen får inte visas i en ram.
- Varje ändrande anrop måste komma från appens eget ursprung (`PUBLIC_URL`).
- Sessionscookien är `HttpOnly` och `SameSite=Lax`, och `Secure` när `COOKIE_SECURE=true`.
- MCP-servern kräver en nyckel. Utan konfigurerade nycklar svarar den 503.
- Anrop som kostar AI har gränser per IP-adress, och högst fyra AI-anrop från webbappen körs samtidigt. Gränserna står
  i [Drift](operations.md#gränser).
- Ett samtal i Regelhjälpen fortsätter bara i webbläsaren som startade det. Appen minns vilket samtal den gav vilken
  webbläsare, med en egen `HttpOnly`-cookie som bara skickas till `/api/rules`, så ett samtals-id från någon annan
  startar ett nytt samtal ([Eneo-integration](eneo-integration.md#så-anropar-appen-en-assistent)).
- Fel från AI-motorn visas med motorns egen text på svenska, som aldrig innehåller adresser eller nycklar. Ett
  inställningsfel visas för besökare som ett allmänt fel, och detaljerna skrivs i serverns logg.
- I en delad miljö (`ENVIRONMENT=production`) döljs och nekas inköparens demoperson, eftersom inköparens godkännande
  styr vad företagen och Eneos assistenter läser som granskat av inköp
  ([beslut 0007](decisions/0007-poc-login-persona-picker.md)). En operatör kan slå på den med `DEMO_BUYER_ENABLED=true`,
  men bara bakom grundläggande autentisering eller en IP-spärr.
- Servern loggar inte varje anrop, så att inga adresser med parametrar hamnar i loggen.
