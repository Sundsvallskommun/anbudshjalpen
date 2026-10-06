# Drift

Syfte: Samla det en operatör behöver: imagen, miljövariablerna, gränserna, schemalagda jobb, hälsokontroller,
säkerhetskopiering, uppdatering och felsökning.

Läs detta när: Du driftsätter eller uppdaterar Anbudsklar, lägger till en miljövariabel eller felsöker en körande
miljö.

Hör ihop med: [Utveckling](development.md), [Eneo-integration](eneo-integration.md), [Dokploy](../deploy/dokploy/README.md),
[Arkitektur](architecture.md)

## Två sätt att köra

| | Lokalt med Compose | Testmiljö i Dokploy |
|---|---|---|
| Fil | `docker-compose.yml` | `deploy/dokploy/docker-compose.anbudsklar.yml` |
| Tjänster | `app`, `worker`, `migrate`, `db`, `mailpit` | `anbudsklar-app`, `anbudsklar-worker`, `anbudsklar-migrate`, `anbudsklar-db`, `anbudsklar-mail` |
| Adress | `http://127.0.0.1:3501` | Domänen som läggs till i Dokploy |
| Miljövariabler | `.env` (kopia av `.env.example`) | Fliken Environment i Dokploy (mall: `deploy/dokploy/anbudsklar.env.example`) |

Eneo-testinstansen har en egen Compose-fil: `deploy/dokploy/docker-compose.eneo-test.yml`.

## Imagen

En image (`Dockerfile` i roten) kör både app och worker.

| Egenskap | Värde |
|---|---|
| Port | 3001 |
| Start | `anbudsklar serve --host 0.0.0.0 --port 3001`: en process, utan åtkomstlogg |
| Worker | Samma image med kommandot `anbudsklar worker` |
| Migreringar | `alembic upgrade head` i `/app` (eller `anbudsklar migrate`) |
| Hälsa | `GET /health` och `GET /api/healthz` svarar `{"ok": true}` utan att fråga databasen. `GET /api/health` kontrollerar även databasen och svarar 503 om den inte nås |
| Användare | `app`, inte root |
| Kataloger | `/app/frontend/dist` (webbappen), `/app/data` (CPV och fixturer), `/data/documents` (uppladdade underlag), `/app/var` (`eneo-assistants.json`) |

Imagens `HEALTHCHECK` anropar `/health` på port 3001. Worker lyssnar inte på någon port, så Dokploy-filen stänger av
hälsokontrollen för worker.

## Miljövariabler

Alla inställningar läses av `backend/src/anbudsklar/config.py` vid start. Listor anges som JSON, till exempel
`MCP_API_KEYS=["nyckel-1","nyckel-2"]`. Värden med ett lösenord eller en nyckel är hemliga och checkas aldrig in.

| Namn | Standard | Syfte |
|---|---|---|
| `ENVIRONMENT` | `development` | `development`, `test` eller `production`. I `production` vägrar appen starta med utvecklingsvärdet för `SESSION_SECRET`, och inköparens demoperson döljs och nekas om inte `DEMO_BUYER_ENABLED=true`. Dokploy-filen sätter `production` |
| `LOG_LEVEL` | `INFO` | Loggnivå |
| `DATABASE_URL` | `postgresql+asyncpg://anbudsklar:anbudsklar@localhost:55432/anbudsklar` | Anslutning till Postgres (asyncpg) |
| `DOCUMENTS_DIR` | `var/documents` i repots rot (`/data/documents` i imagen) | Var uppladdade underlag sparas, ett filnamn per sha256. En relativ sökväg utgår från katalogen kommandot körs i, för `make`-målen `backend/` |
| `DATA_DIR` | Repots `data/` (`/app/data` i imagen) | CPV-listan och påhittade fixturer |
| `PUBLIC_URL` | `http://127.0.0.1:3502` | Adressen webbläsaren använder. Ursprungskontrollen och MCP-serverns tillåtna värdnamn utgår från den |
| `SESSION_SECRET` | Ett utvecklingsvärde | Hemlig. Signerar sessionen. Minst 32 slumpade tecken utanför utveckling: `openssl rand -hex 32` |
| `COOKIE_SECURE` | `false` | `true` när appen körs över https |
| `DEMO_BUYER_ENABLED` | Inget | Om inköparens demoperson går att välja. Inget värde betyder på, utom med `ENVIRONMENT=production`. `true` slår på den även där, men bara bakom grundläggande autentisering eller en IP-spärr i Traefik, eftersom inköparen publicerar det som företagen och Eneos assistenter läser som granskat av inköp ([beslut 0007](decisions/0007-poc-login-persona-picker.md)). `false` stänger av den överallt |
| `FRONTEND_DIST` | Inget (`/app/frontend/dist` i imagen) | Den byggda webbappen. Tomt under utveckling, då Vite serverar den |
| `AI_ENGINE` | `heuristic` | `eneo`, `openai` eller `heuristic` |
| `AI_MAX_RETRIES` | `2` | Nya försök när ett svar inte följer kontraktet (0–5) |
| `AI_TIMEOUT_SECONDS` | `180` | Tidsgräns för ett anrop till motorn |
| `ENEO_BACKEND_URL` | Inget | Eneo-instansens adress, till exempel `https://eneo-test.example.se`. Krävs med `AI_ENGINE=eneo`. Ett Eneo på värddatorn nås från Compose-stacken som `http://host.docker.internal:8123`, inte `localhost` |
| `ENEO_API_KEY` | Inget | Hemlig. Servicenyckeln (`sk_`) för Anbudsklars space. Krävs med `AI_ENGINE=eneo` |
| `ENEO_API_KEY_HEADER_NAME` | `X-API-Key` | Header för nyckeln, samma som Eneos `API_KEY_HEADER_NAME` |
| `ENEO_ASSISTANTS_FILE` | `var/eneo-assistants.json` i repots rot (`/app/var/eneo-assistants.json` i imagen) | Assistenternas id per uppgift, skrivs av `anbudsklar eneo provision` |
| `OPENAI_BASE_URL` | Inget | OpenAI-kompatibelt API. Krävs med `AI_ENGINE=openai` |
| `OPENAI_API_KEY` | Inget | Hemlig. Nyckel till det API:t. Krävs med `AI_ENGINE=openai` |
| `OPENAI_MODEL` | Inget | Modellens namn. Krävs med `AI_ENGINE=openai` |
| `MCP_ENABLED` | `true` | Om MCP-servern på `/mcp` är på |
| `MCP_API_KEYS` | `[]` | Hemlig. Nycklar som Eneo får använda mot `/mcp`, som `Authorization: Bearer` eller `X-Api-Key`. Tom lista ger 503 |
| `MCP_ALLOWED_HOSTS` | `[]` | Fler värdnamn som `/mcp` tar emot, utöver värdnamnet i `PUBLIC_URL` och de fasta lokala namnen. Ett namn utan port, eller med `:*`, gäller med och utan port, till exempel `["anbudsklar-app"]`. `namn:3001` gäller bara den porten. Andra värdnamn får 421 |
| `MCP_MAX_OUTPUT_CHARS` | `16000` | Högsta längd på ett verktygssvar. Eneo kortar av vid 32 768 tecken |
| `TED_API_URL` | `https://api.ted.europa.eu/v3/notices/search` | TED:s sök-API |
| `TED_BUYER_NAMES` | `["Sundsvalls kommun"]` | Köparnamn som söks i TED, utöver bolagen som finns i koden |
| `EAVROP_BASE_URL` | `https://www.e-avrop.com/sundsvall` | e-Avrops sidor för Sundsvall |
| `RIKSDAGEN_LOU_URL` | `https://data.riksdagen.se/dokument/sfs-2016-1145.text` | LOU som text från Riksdagen |
| `HTTP_USER_AGENT` | `Anbudsklar-PoC/0.1 (Sundsvalls kommun; kontakt via naringslivsenheten)` | Hur insamlaren presenterar sig |
| `SCHEDULER_ENABLED` | `true` | Läses bara av worker. Med `false` avslutas worker direkt. Appen kör aldrig schemalagda jobb |
| `SMTP_HOST` | `localhost` | SMTP-server. Mailpit i PoC:n |
| `SMTP_PORT` | `1025` | SMTP-port |
| `MAIL_FROM` | `Anbudsklar <noreply@anbudsklar.local>` | Avsändare på mejlen |
| `ORGANIZATION_NAME` | `Sundsvalls kommun` | Organisationens namn i sidhuvudet |
| `ORGANIZATION_LOGO` | Inget | Sökväg i containern till en logga |
| `ORGANIZATION_LOGO_DARK` | Inget | Logga för mörkt läge |
| `SHOW_ORGANIZATION` | `true` | Om organisationen visas i sidhuvudet |
| `TEST_DATABASE_ADMIN_URL` | `postgresql+asyncpg://anbudsklar:anbudsklar@localhost:55432/postgres` | Bara tester. Databasen där testerna skapar och tar bort sin egen testdatabas |

Appen stoppar vid start om `AI_ENGINE=eneo` saknar `ENEO_BACKEND_URL` eller `ENEO_API_KEY`, eller om
`AI_ENGINE=openai` saknar någon av de tre `OPENAI_`-variablerna.

En ny inställning läggs i `config.py`, i tabellen ovan och, om en operatör ska sätta den, i `.env.example`,
`deploy/dokploy/anbudsklar.env.example` och blocket `x-anbudsklar-env` i `deploy/dokploy/docker-compose.anbudsklar.yml`.
Dokploy-filen skickar bara vidare de variabler som står där.

## Gränser

Flera anrop som kostar AI kräver ingen inloggning, och med `AI_ENGINE=eneo` drar varje anrop från servicenyckelns
gemensamma kvot. Appen har därför gränser, som ligger i processens minne (`backend/src/anbudsklar/api/limits.py`).

| Vad | Gräns | Över gränsen |
|---|---|---|
| Inloggning med demoperson | 300 per IP-adress och tio minuter | 429 med `Retry-After` |
| Frågor om ett underlag | 60 per IP-adress och tio minuter | 429 med `Retry-After` |
| Regelhjälpen | 60 per IP-adress och tio minuter | 429 med `Retry-After` |
| Granskning av anbudsutkast | 20 per IP-adress och tio minuter | 429 med `Retry-After` |
| CPV-förslag | 30 per IP-adress och tio minuter | 429 med `Retry-After` |
| Inköparens uppladdningar och nya tolkningar | 30 per IP-adress och tio minuter | 429 med `Retry-After` |
| Samtidiga AI-anrop från webbappen (frågor, Regelhjälpen, granskning och CPV-förslag) | 4. Ett anrop väntar högst 30 sekunder på en ledig plats | 503 med `Retry-After: 30` |
| Storlek på en begäran, till exempel JSON | 1 MB | 413 |
| Uppladdat underlag (inköpare) | 50 MB | 413 |
| Anbudsutkast för granskning | 20 MB | 413 |
| Text i ett underlag eller utkast | 300 sidor och 1 500 000 tecken. Word- och textfiler räknas i beräknade sidor | 413 med förklaring på svenska |
| Word-fil (`.docx`) | Packad upp högst 100 MB, högst 32 MB XML eller 1 000 000 XML-element, högst 2 000 filer, ingen stor fil packad mer än 100 gånger och högst 100 000 stycken och tabeller | 413 med förklaring på svenska. En Word-fil som inte går att läsa alls ger 422 |
| Inloggade sessioner | 10 000. Därutöver loggas den äldsta ut först | – |
| Regelhjälpens samtal | 10 000 i åtta timmar. Därutöver glöms det äldsta först, och nästa fråga i det samtalet startar ett nytt | – |
| Samtidiga anrop till servern (uvicorns `limit_concurrency`) | 200 | 503 |

Gränserna per IP-adress utgår från klientens adress i `X-Forwarded-For`: `anbudsklar serve` startar uvicorn med
`proxy_headers` och `forwarded_allow_ips='*'`. Det förutsätter att port 3001 bara nås genom Dokploys Traefik, eller
lokalt genom Dockers port på `127.0.0.1`. Den som når porten direkt kan annars välja vilken adress gränserna räknas på.

## Schemalagda jobb

Worker kör jobben med APScheduler, i svensk tid. Varje körning sparas i tabellen `job_runs`.

| Jobb | När | Gör |
|---|---|---|
| `ingest_ted` | Varje dag 06:15 | Hämtar annonser från TED |
| `ingest_eavrop` | Varje dag 06:30 | Hämtar från e-Avrop, men bara om `robots.txt` tillåter det. Se [Datakällor](data-sources.md) |
| `ingest_lou` | Måndagar 05:00 | Hämtar LOU från Riksdagen |
| `close_expired` | Var 15:e minut | Sparar `closed` på öppna annonser vars sista anbudsdag har passerat, oavsett källa |
| `interpret_pending` | Var femte minut | Tolkar nya underlag till checklistor, högst fem per körning. Ett misslyckat försök görs om efter 15 minuter, 30 minuter, 1 timme och 2 timmar, och efter fem försök ger jobbet upp. Det ger upp direkt när samma underlag inte kan lyckas: ett underlag utan läsbar text, en modell som fortsätter att bryta mot kontraktet, ett underlag som är för stort för modellen och en förfrågan som modelleverantören eller Eneo avvisar eller inte kan läsa |
| `match_all` | Var 30:e minut | Bedömer annonser mot företagens profiler. En bedömning görs om när annonsen, profilen eller den publicerade checklistan har ändrats, eller när bedömningsversionen (`ASSESSMENT_VERSION` i `services/matching.py`) har bytts. När ett företag sparar sin profil bedömer appen just det företagets träffar direkt, se [AI-uppgifterna](ai-tasks.md#bedöma-matchning-bedom_matchning) |
| `send_reminders` | Varje minut | Skickar påminnelser som är på tur, med länk till upphandlingen och till sidan Påminnelser |
| `notify_matches` | Var tionde minut | Mejlar nya träffar som verkar passa eller passar delvis, en gång per användare och annons, med länk till upphandlingen och till Start |

När worker startar läser den in CPV-listan och LOU om tabellerna är tomma.

Underlag som väntar på en checklista, försöker igen eller har gett upp visas i en ruta överst under Inköp › Att
granska, med antal försök, nästa försök och det senaste felet (`GET /api/admin/interpretations`). Rutan heter "N
underlag kunde inte tolkas" när något underlag har gett upp, och annars "N underlag tolkas just nu". Knappen "Tolka
igen" (för ett underlag som väntar: "Tolka nu") tolkar underlaget direkt och nollställer försöken
(`POST /api/admin/documents/{id}/interpret`). Samma anrop ligger bakom "Tolka underlaget igen" under Fler val på sidan
där en checklista granskas: det ger ett nytt utkast och låter den granskade checklistan vara, till exempel efter byte av
AI-motor.

Sidan Drift (`/inkop/drift`, i inköps kontomeny) visar jobben grupperade som Hämta, Bearbeta och Skicka, med
misslyckade jobb först i varje grupp. Varje jobb visar sin status (Klar, Misslyckades, Pågår eller Inte körd; e-Avrop
visas som "Inte aktiverad – väntar på tillstånd" när `robots.txt` stoppar hämtningen), när det senast kördes, en rad
ur statistiken och knappen "Kör nu: <jobb>" (`GET /api/admin/jobs` ger den senaste körningen per jobb). Medan en
körning pågår hämtas listan om var tredje sekund. Ett fel visas med appens egen text på svenska när det kommer från
insamlingen, AI-motorn eller appens regler. Andra fel, till exempel från databasen, visas som "Tekniskt fel (<typ>).
Detaljerna finns i loggen.", så att ingen SQL eller intern text hamnar i vyn.

## Loggar

Appen och worker loggar till standard ut. Lokalt: `docker compose logs -f app worker`. I Dokploy: fliken Logs för
tjänsten. Servern loggar inte varje anrop: `anbudsklar serve` startar uvicorn utan åtkomstlogg.

## Säkerhetskopiering

Allt som inte kan återskapas ligger i Postgres och i volymen för uppladdade underlag. Annonser, LOU och CPV kan hämtas
igen.

```bash
docker compose exec db pg_dump -U anbudsklar -Fc anbudsklar > anbudsklar.dump
```

I Dokploy heter databastjänsten `anbudsklar-db`, och Dokploy kan schemalägga säkerhetskopior av volymer.

## Uppdatera

Lokalt bygger `make up` om imagen, och i Dokploy driftsätter du igen ([Dokploy](../deploy/dokploy/README.md#uppdatera)).
Tjänsten `migrate` kör migreringarna innan app och worker startar.

Med `AI_ENGINE=eneo` behöver assistenterna i Eneo få nya instruktioner när en instruktion i
`backend/src/anbudsklar/ai/prompts/`, ett kontrakt eller ett MCP-verktyg har ändrats: kör `anbudsklar eneo provision`
igen. Vilka instruktioner som ändrades senast står i
[Eneo-integration](eneo-integration.md#sätta-upp-anbudsklar-eneo-provision).

**Efter ändringen 2026-10-05**, när migreringen `0a908af70e75` har körts, får alla sparade träffar som fortfarande
klarar förvalet en ny bedömning vid nästa körning av `match_all`. Bedömningarna sparas nu med sin version
(`ASSESSMENT_VERSION` i `backend/src/anbudsklar/services/matching.py`), och de som gjordes före migreringen saknar den.
Med `AI_ENGINE=eneo` blir det ett anrop till assistenten per träff, på servicenyckelns gemensamma kvot
([Eneo-integration](eneo-integration.md#så-anropar-appen-en-assistent)). Kör därför `anbudsklar eneo provision` innan
dess. Annars görs bedömningarna med den gamla instruktionen för `bedom_matchning` men sparas med den nya versionen, och
då görs de inte om. Worker kör `match_all` första gången 30 minuter efter att den har startat. Ett företag som sparar
sin profil får dock sina träffar bedömda direkt, och "Kör nu" vid Bedöm matchningar på sidan Drift kör jobbet när du
vill.

Samma migrering tar bort inledningen "Automatisk sammanställning utan språkmodell:" ur sammanfattningen i godkända och
publicerade checklistor och i sparade bedömningar. Utkast och avvisade checklistor behåller den, så att inköparens
granskning flaggar sammanfattningen som motorns text att skriva om. Skäl med bara CPV-siffror skrivs om med benämningar
när bedömningen görs om. En bedömning som ingen körning når, till exempel för en annons som har stängt, behåller sina
skäl.

## Vid problem

| Symptom | Trolig orsak | Gör så här |
|---|---|---|
| Alla ändringar ger 403 | `PUBLIC_URL` stämmer inte med adressen i webbläsaren | Sätt `PUBLIC_URL` till exakt den adressen, med schema och port |
| Appen startar inte och nämner `SESSION_SECRET` | `ENVIRONMENT=production` med utvecklingsvärdet | Sätt ett eget värde |
| MCP svarar 503 | `MCP_API_KEYS` är tom | Lägg in minst en nyckel |
| MCP svarar 401 | Fel nyckel eller header | Kontrollera nyckeln i Eneos registrering |
| MCP svarar 421 | Anropet går till ett värdnamn som varken är värdnamnet i `PUBLIC_URL`, ett av de fasta lokala namnen eller finns i `MCP_ALLOWED_HOSTS` | Registrera den publika adressen i Eneo, eller lägg till värdnamnet i `MCP_ALLOWED_HOSTS` |
| Eneo kan inte registrera MCP-servern | Omdirigering eller adress som Eneo inte når | Använd den slutliga https-adressen, se [Eneo-integration](eneo-integration.md#mcp-servern-i-eneo) |
| Assistenterna använder inte verktygen | Modellen saknar verktygsanrop | Slå på `supports_tool_calling` för modellen i Eneo |
| Besökare ser "AI-motorn är inte rätt inställd just nu" | Motorn är felinställd: nyckeln nekas, assistenterna saknas eller filen med deras id går inte att läsa. Besökare ser bara den allmänna texten, och det exakta felet står i appens logg (`AI engine error …`) och, för tolkningar, i rutan överst under Inköp › Att granska | Rätta det loggen säger, ofta genom att köra `anbudsklar eneo provision` igen eller sätta rätt `ENEO_API_KEY` |
| "Eneo avvisade förfrågan … kontrollera assistentens inställningar" | Eneo svarade 400 med kod 9007, Eneos allmänna fel för en felaktig förfrågan. Eneos eget meddelande står i appens logg | Kontrollera assistenten i Eneo, till exempel att modellen är aktiverad i spacet |
| "Underlaget är för stort för språkmodellen i Eneo" | Kod 9007 där Eneos meddelande nämner tokens eller kontextfönstret. Ett underlag som inte får plats kommer oftare tillbaka som 400 med kod 9041 ("Språkmodellen i Eneo avvisade förfrågan") | Välj en modell med större kontext |
| Inga checklistor skapas | Worker körs inte, eller motorn ger fel | Läs workerns logg, sidan Drift och rutan "… underlag kunde inte tolkas" (eller "… underlag tolkas just nu") överst under Inköp › Att granska, se [Schemalagda jobb](#schemalagda-jobb) |
| Ett underlag får aldrig någon checklista | Tolkningen har misslyckats fem gånger, eller på ett sätt som inte går över av sig självt | Läs felet i rutan "… underlag kunde inte tolkas" överst under Inköp › Att granska, rätta orsaken och tryck "Tolka igen" |
| "Det gick inte att nå Eneo" i Compose, och loggen visar `Could not reach Eneo at http://localhost:8123` | `ENEO_BACKEND_URL` pekar på `localhost`, som i en container är containern själv | Sätt `http://host.docker.internal:8123` för ett Eneo på värddatorn, se [Lokalt Eneo](eneo-integration.md#lokalt-eneo) |
| Svaret 429 och "Du har gjort många förfrågningar på kort tid" | En IP-adress har nått en av [gränserna](#gränser). En workshop där alla delar en publik adress räknas som en | Vänta så länge `Retry-After` säger. Ändra gränserna i `DEFAULT_LIMITS` om de är för snäva |
| Svaret 503 och "Många använder AI-stödet just nu" | Fyra AI-anrop pågick redan, och anropet fick ingen plats på 30 sekunder | Försök igen om en stund. Med Eneo: kontrollera att modellen svarar i normal tid |
| `migrate`, appen och worker stoppar med `AI_ENGINE=eneo requires ENEO_BACKEND_URL and ENEO_API_KEY` | Nyckeln saknas i repots `.env`, till exempel för att `eneo provision` skrevs till en annan fil med `--env-file` | Flytta `ENEO_`-raderna till repots `.env`, som kommandot skriver till om inget annat anges |
| Inga mejl kommer fram | Mailpit fångar alla mejl | Öppna Mailpit: `http://127.0.0.1:8025` lokalt |

## Kända luckor

- e-Avrop hämtas inte, eftersom `robots.txt` förbjuder det. Annonser under tröskelvärdena saknas därför.
- Inloggningen är ett val av demoperson ([beslut 0007](decisions/0007-poc-login-persona-picker.md)). Sessionerna
  ligger i processens minne, gäller i åtta timmar och är högst 10 000; därutöver loggas den äldsta ut först. En
  omstart loggar ut alla, och appen måste köras som en enda process. Gränserna för antal anrop och vilken webbläsare
  som äger vilket samtal i Regelhjälpen ligger också i processens minne och börjar om vid en omstart. Även den nya
  bedömningen av ett företags träffar efter en sparad profil körs i appens process: avbryts den av en omstart gör
  `match_all` den i stället.
- Regelhjälpens samtal i Eneo raderas inte av appen, eftersom ett samtal kan fortsätta. Assistentens lagringstid på en
  dag tar bort dem.
- Mejl skickas bara till Mailpit, även i testmiljön.
- Det finns ingen publicerad image. Dokploy bygger imagen från Git.
- Dokploy-filen skickar inte vidare `ORGANIZATION_LOGO` och `ORGANIZATION_LOGO_DARK`, eftersom loggan måste monteras
  som fil i containern.
