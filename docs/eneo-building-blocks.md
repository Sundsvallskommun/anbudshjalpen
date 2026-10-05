# Eneos byggstenar

Syfte: Beskriva de delar av Eneo som Anbudsklar kan bygga på: vad de gör, hur färdiga de är och vad de passar till.

Läs detta när: Du ska avgöra om något ska byggas i Eneo eller i det här repot, eller undrar varför arkitekturen ser ut
som den gör.

Hör ihop med: [Arkitektur](architecture.md), [Beslut 0004](decisions/0004-eneo-api-and-own-mcp-server.md),
[Eneo-integration](eneo-integration.md)

> **Daterad 2026-10-05.** Eneo ändras snabbt. Kontrollera status mot `eneo-ai/eneo` innan du förlitar dig på en rad.

## Översikt

| Byggsten | Vad den gör | Status | Passar för |
|---|---|---|---|
| Assistenter och kunskap | Assistenter med kunskapskällor, schemalagd crawling (varje dag eller vecka) och källhänvisningar. Kan anropas via API, en session per fråga | Släppt | Anbudsklars AI-uppgifter i PoC:n och Regelhjälpen |
| MCP-klient | Assistenter anropar externa MCP-servrar (streamable HTTP, bearer eller API-nyckel i header). Verktygen som finns vid registreringen slås på direkt; senare ändringar godkänns av en admin | Ingår i 2.2 | Anbudsklars assistenter mot upphandlingsdatan, och inköparnas assistent |
| API-nycklar v2 | `sk_` för servrar och `pk_` för webbläsare. Nycklarna kan ägas av ett servicekonto och har scope, giltiga ursprung, gränser och rotation | Ingår i 2.2 | Anbudsklars környckel |
| Moduler | En egen webbapp på egen domän. Användaren loggar in med sitt Eneo-konto via en engångsbiljett, och appen använder en servicenyckel. Körs som ett tillägg i Compose | Ingår i 2.2 (Tal till text) | Vyer för medarbetare och driftmönstret |
| Widgets | En assistent publiceras som inbäddad chatt för anonyma besökare. Varje besökare får en egen token, och det finns skydd mot automatiserade anrop (ALTCHA), kostnadstak, lagringstid och AI-märkning | PR [#867](https://github.com/eneo-ai/eneo/pull/867) öppen | Regelhjälpen på sundsvall.se |
| Flows | Versionerade flöden i flera steg. De tar emot uppladdningar, ger JSON med typat kontrakt och citat, kan ha granskningssteg där en människa godkänner, kan göra HTTP-anrop in och ut och kan exporteras som paket. Det finns en AI-byggare | Inte klart att bygga på. Finns på taggen `builder-v1-baseline-2026-09-30` och på `feat/flow-*`-grenarna | Tolka underlag, granska utkast, bedöma matchning och föreslå CPV i produktion |
| eneo-module-kit | Startpaket för moduler: Astryx-UI, FastAPI-backend och en mall | Ej byggt (planen är daterad 2026-10-01) | Grund för UI och backend |
| Marketplace | Dela flöden, assistenter och skills mellan kommuner | Planering | Dela lösningen med andra kommuner |
| Services | Prompt som ger JSON | Vyn tas bort i 2.2 | Bygg inte på detta |

## Begränsningar som styr arkitekturen

- **Ingen identitet för externa användare.** Eneo har inte BankID och inga gästanvändare. Med en `pk_`-nyckel räknas
  alla besökare som samma användare, och en användarägd nyckel agerar som sin ägare.
- **Moduler är till för medarbetare.** Inloggningen kräver ett Eneo-konto. Modulerna sparar inget själva (Tal till text
  har ingen egen databas), och deras nätverk når inte internet. Det säger också ADR:en för widgets.
- **Widgets är anonyma och begränsade.** De tar inte emot uppladdningar och kan inte använda verktyg eller MCP. Att
  skicka med vilken sida besökaren är på ligger först i fas 5.
- **MCP är avstängt i Flows.** Flödena får sina data som indata: formulärfält, filer eller ett HTTP GET-anrop.
- **Sökningen i kunskap är bara vektorbaserad.** Den kan inte filtrera på metadata, och källhänvisningar gäller hela
  dokument utan sidnummer. Extraherad PDF-text får däremot `[PAGE n]`-markörer.
- **Insights låter redaktörer och admins i ett space läsa hela konversationer** för assistenter där insikter är
  påslaget. Anbudsklars assistenter och flöden ska därför ligga i ett eget space där inköpare inte är redaktörer,
  Insights är avstängt och lagringstiden är kort.
- **Inga notiser.** Eneo kan inte skicka mejl eller påminnelser.
- **En servicenyckel kan inte ladda upp filer.** Den kan inte heller skapa spaces, assistenter, MCP-servrar eller
  nycklar, men den kan ställa frågor och radera sina sessioner om den har admin-behörighet. Anbudsklar skickar därför
  underlaget som text i frågan.
- **Verktygsanrop är avslaget som standard** för modeller som läggs till i en tenant. Utan det använder assistenterna
  varken MCP eller kunskap i verktygsläge, och Eneo säger inget om det.
- **MCP-klienten följer inte omdirigeringar.** Se [Öppna frågor](open-questions.md#fel-och-luckor-i-eneo).

## Källor

- Moduler: [MODULES.md](https://github.com/eneo-ai/eneo/blob/develop/docs/deployment/MODULES.md) och sidan "Module
  Authentication" i Eneos dokumentation
- Widgets: [ADR, översikt](https://github.com/eneo-ai/eneo/blob/docs/widgets-plan/docs/adr/embeddable-widgets/00-overview.md)
  och [säkerhet och integritet](https://github.com/eneo-ai/eneo/blob/docs/widgets-plan/docs/adr/embeddable-widgets/03-security-privacy-compliance.md)
- Eneo 2.2: taggen [`v2.2.0-rc.6`](https://github.com/eneo-ai/eneo/tree/v2.2.0-rc.6) (2026-10-02), som
  [Eneo-integration](eneo-integration.md) är kontrollerad mot
- Flows: [Flow Developer Quickstart](https://github.com/eneo-ai/eneo/blob/builder-v1-baseline-2026-09-30/docs/flows/flow-developer-quickstart.md)
- [eneo-module-kit](https://github.com/eneo-ai/eneo-module-kit), [Tal till text](https://github.com/eneo-ai/eneo-mod-speech-to-text),
  [Marketplace](https://github.com/eneo-ai/eneo-marketplace)
