# Öppna frågor

Syfte: Samla det som återstår att avgöra, med vem som behöver svara.

Läs detta när: Du förbereder ett möte, ska fatta ett beslut eller undrar varför något inte är bestämt.

Hör ihop med: [Beslut](decisions/README.md), [PoC](poc.md), [Arkitektur](architecture.md)

När en fråga är avgjord flyttas svaret till ett beslut i [decisions/](decisions/README.md) och raden tas bort här.

## Teknik

| Fråga | Läge |
|---|---|
| Vilken modell ska Eneo-testinstansen använda? | Den behöver klara svenska, långa dokument, JSON-svar och verktygsanrop. Samma leverantör som kommunens Eneo är mest likt produktion. Kvalitetstestet jämför kandidaterna |
| Vilken server och vilka domäner får testmiljön i Dokploy? | Anbudsklar och Eneo-testinstansen behöver var sin domän med https. Se [deploy/dokploy](../deploy/dokploy/README.md) |
| Ska inköparens vy bli en Eneo-modul i produktion? | I PoC:n ligger den i appen. En modul fungerar för medarbetare, men mycket kan också visas direkt i Eneo |
| Hur loggar företagare in i produktion, och hur kontrolleras behörigheten? | PoC:n använder demopersoner ([beslut 0007](decisions/0007-poc-login-persona-picker.md)). Produktion behöver kommunens lösning för e-legitimation och en kontroll av att personen får företräda företaget |
| När är Eneo Flows klart att bygga på? | Avgör när de styrda uppgifterna flyttar från assistenter till flöden ([beslut 0004](decisions/0004-eneo-api-and-own-mcp-server.md)) |

## Fel och luckor i Eneo

| Fel eller lucka | Läge |
|---|---|
| MCP-klienten kan inte följa omdirigeringar | En omdirigering (till exempel `/mcp/` till `/mcp`, eller http till https) får anslutningen att misslyckas, eftersom `_json_rpc_request_payload` i `mcp_client.py` anropar `json.loads(request.content)` på den omdirigerade requesten och får `httpx.RequestNotRead`. Vi registrerar den exakta adressen. Ska rapporteras till Eneo |
| Imagen för Eneos frontend saknas för 2.2.0-rc.5 och rc.6 | Den 2026-10-05 fanns backendimagen för rc.6 men frontend bara till och med rc.4. Testinstansen kör därför frontend rc.4. Byt när 2.2.0 är släppt |
| Verktygsanrop är avslaget som standard för nya modeller | Utan `supports_tool_calling` använder assistenterna inte MCP, och Eneo säger inget om det |

## Verksamhet

| Fråga | Vem |
|---|---|
| Ska vi avgränsa till kommunens och de kommunala bolagens upphandlingar, eller ta med TED? | Näringslivsenheten och inköp |
| Kan inköp ta fram 3–5 avslutade upphandlingar inom pilotens verksamhet och markera vilka skallkrav som finns i dem? Får de ligga i ett öppet repo? | Inköp |
| Vilken träffsäkerhet krävs för att en checklista ska få publiceras? | Inköp |
| Ligger avtalskatalogen i e-Avrops avtalsdatabas? e-Avrop har ett Avtals-API som kan läsas med samma nyckel | Inköp |
| Får underlagen från e-Avrops API visas och citeras publikt i Anbudsklar och via MCP till Eneo? Kan vi få en nyckel som bara läser publicerade uppgifter? Se [e-Avrops API](eavrop.md#det-som-saknas) | Inköp och Antirio |
| Ska inköparen godkänna checklistorna innan de publiceras? Det kostar tid per upphandling och gör checklistan till kommunens sammanfattning. Båda sätten går att pröva: inställningen finns under Inköp › Inställningar ([beslut 0011](decisions/0011-installningar-granskning-valfri.md)) | Inköp |
| Vilken verksamhet ska piloten gälla? | Näringslivsenheten och inköp |

## Juridik

| Fråga | Vem |
|---|---|
| Blir profiler, frågor och anbudsutkast allmänna handlingar? | Jurist |
| Hur ser DPIA och personuppgiftsbiträdesfrågan ut? | Dataskydd |
| Vad får inköp se av företagens frågor under anbudstiden? | Jurist och inköp |
