# Eneo-integration

Syfte: Beskriva hur Anbudsklar använder en Eneo-testinstans: vad som skapas i Eneo, vilka nycklar som finns, hur
MCP-servern registreras och vad verksamheten själv kan ändra.

Läs detta när: Du ska koppla appen till en Eneo-instans, byta en nyckel, felsöka ett anrop till Eneo eller ändra något
i Eneos gränssnitt.

Hör ihop med: [Beslut 0004](decisions/0004-eneo-api-and-own-mcp-server.md), [AI-uppgifterna](ai-tasks.md),
[Eneos byggstenar](eneo-building-blocks.md), [Drift](operations.md), [Dokploy](../deploy/dokploy/README.md)

> Uppgifterna om Eneos API är kontrollerade mot `eneo-ai/eneo`, taggen `v2.2.0-rc.6` (2026-10-02).

## Översikt

```
Anbudsklar app/worker ──(sk_-nyckel)──▶ Eneo API ──▶ assistent för uppgiften ──▶ språkmodell
                                                          │
Anbudsklar /mcp ◀──(MCP-nyckel, https)─────────────────────┘  (Regelhjälpen och frågor om underlag)
```

I Eneo finns:

- spacet "Anbudsklar (PoC)", med lagringstiden en dag
- en assistent per AI-uppgift (`tolka_underlag`, `bedom_matchning`, `granska_utkast`, `besvara_fraga`, `foresla_cpv`
  och `regelhjalpen`), med namn som "Anbudsklar (PoC) – Tolka underlag", Insights avstängt och lagringstiden en dag
- MCP-servern `anbudsklar_poc` (namnet kommer från spacet), kopplad till assistenterna för Regelhjälpen och frågor om
  ett underlag
- kunskap för Regelhjälpen: Upphandlingsmyndighetens sidor om att göra affärer med offentlig sektor och kommunens sida
  om upphandling och inköp på sundsvall.se, som hämtas om varje vecka
- környckeln: en servicenyckel (`sk_`) som bara gäller spacet

Assistenternas id sparas i `var/eneo-assistants.json` (`ENEO_ASSISTANTS_FILE`) som `{uppgift: assistent-id}`.

## Förutsättningar i Eneo

- Eneo 2.2 eller senare. Hur testinstansen körs står i [deploy/dokploy](../deploy/dokploy/README.md).
- En språkmodell med verktygsanrop påslaget (`supports_tool_calling`). Det är avslaget som standard för modeller som
  läggs till i en tenant, och utan det använder assistenterna aldrig MCP-verktygen. Eneo säger inget om det.
- `ENCRYPTION_KEY` i Eneo, om modelleverantörens nyckel läggs in via Eneos admin.
- En användare med rollen Owner (eller admin med rätt att skapa API-nycklar och spaces) för uppsättningen. I en ny
  instans skapas den från `DEFAULT_USER_EMAIL` och `DEFAULT_USER_PASSWORD`.
- Att Anbudsklars `/mcp` går att nå från Eneo via https.

## Sätta upp: `anbudsklar eneo provision`

Kommandot läser `ENEO_BACKEND_URL`, `ENEO_API_KEY`, `ENEO_API_KEY_HEADER_NAME`, `ENEO_ASSISTANTS_FILE` och
`MCP_API_KEYS` från inställningarna. Admininloggningen läses från miljön. Exportera den i terminalen där du kör
kommandot, och skriv den aldrig till en fil:

| Variabel | Innehåll |
|---|---|
| `ENEO_PROVISION_EMAIL` | E-post för en admin i Eneo (eller flaggan `--email`) |
| `ENEO_PROVISION_PASSWORD` | Lösenordet för samma användare |
| `ENEO_SUPER_API_KEY` | I stället för lösenordet: Eneos superadmin-nyckel, som skapar en token åt användaren |

Från `backend/` lokalt, mot en Eneo-instans med publik adress:

```bash
export ENEO_PROVISION_EMAIL=admin@example.se
read -rs ENEO_PROVISION_PASSWORD && export ENEO_PROVISION_PASSWORD
uv run anbudsklar eneo provision --mcp-url https://anbudsklar.example.se/mcp
```

En ny nyckel skrivs till repots `.env`, som både `make dev-api` och Compose-stacken läser, oavsett vilken katalog du kör
från. Mot ett Eneo på den egna datorn, se [Lokalt Eneo](#lokalt-eneo).

| Flagga | Gör |
|---|---|
| `--mcp-url` | Adressen som Eneo når MCP-servern på. Utan flaggan registreras ingen ny MCP-server |
| `--model` | Språkmodellen i Eneo. Standard är den bästa tillgängliga, helst med verktygsanrop |
| `--name` | Spacets namn, standard "Anbudsklar (PoC)" |
| `--no-knowledge` | Hoppar över webbkunskapen för Regelhjälpen |
| `--rotate-key` | Skapar en ny környckel och återkallar de gamla direkt, även om den nuvarande fungerar. Till exempel när nyckeln har läckt |
| `--env-file` | Dotenv-filen där en ny környckel skrivs. Standard är repots `.env`. I en container finns inget repo, så ange där en fil som `/tmp/eneo.env` |

Kommandot gör det här, i ordning:

1. Loggar in och väljer en modell, helst en med verktygsanrop.
2. Registrerar MCP-servern med den första nyckeln i `MCP_API_KEYS` (typen `bearer`). Finns servern redan uppdateras
   den, och verktygen synkas och godkänns. Kan Eneo inte nå `--mcp-url`, eller är `MCP_API_KEYS` tom, hoppar
   kommandot över steget och varnar. En server som redan är registrerad ligger då kvar, kopplad till spacet och till
   assistenterna för Regelhjälpen och frågor om ett underlag, och varningen säger det. Utan `--mcp-url` behålls en
   registrerad server som den är.
3. Skapar eller uppdaterar spacet med lagringstiden en dag och bara den valda modellen.
4. Skapar eller uppdaterar en assistent per uppgift med texten från `backend/src/anbudsklar/ai/prompts/<uppgift>.md`.
5. Skriver `ENEO_ASSISTANTS_FILE`, innan nyckeln hanteras, så att filen finns även om nyckelsteget stoppar.
6. Kontrollerar környckeln i `ENEO_API_KEY` mot spacet:
   - **Fungerar den** behålls den. Går den ut inom 14 dagar skapas en efterföljare, och den gamla fortsätter att
     gälla tills den går ut.
   - **Saknas den, eller svarar Eneo 401 eller 403,** fungerar den inte. Då skapas först en ny servicenyckel, och
     sedan återkallas de gamla nycklarna med samma namn.
   - **Svarar Eneo något annat, till exempel 429 eller 5xx, eller går Eneo inte att nå,** stoppar kommandot med ett
     fel och rör ingen nyckel.
   - **Med `--rotate-key`** kontrolleras inte nyckeln. Kommandot skapar en ny och återkallar sedan de gamla.

   En ny nyckel har admin-behörighet i spacet och gäller i högst 90 dagar. Den skrivs till `--env-file` som
   `ENEO_API_KEY`, tillsammans med `ENEO_BACKEND_URL` och `ENEO_API_KEY_HEADER_NAME`. Övriga rader i filen lämnas som
   de är. Varje ny nyckel ger en varning om att sätta `ENEO_API_KEY` i driftmiljön, till exempel under Environment i
   Dokploy, eftersom en miljövariabel går före `.env`-filen.
7. Skriver en sammanfattning av vad som gjordes och vad som behöver åtgärdas.

Kommandot hittar befintliga objekt på namnet och går att köra flera gånger. Kör det igen efter varje ändring av en
instruktion, ett kontrakt eller ett MCP-verktyg.

## Nycklar

| Nyckel | Används av | Finns i | Behörighet |
|---|---|---|---|
| Környckel (`ENEO_API_KEY`) | Anbudsklar när den anropar Eneo | Anbudsklars miljövariabler | Servicenyckel (`sk_`) som bara gäller spacet. Admin, eftersom det krävs för att radera sessioner. Har utgångsdatum |
| MCP-nyckel (`MCP_API_KEYS`) | Eneo när den anropar Anbudsklars MCP-server | Anbudsklars miljövariabler och krypterad i Eneos registrering | Läser offentliga data |
| Admininloggning | Bara `anbudsklar eneo provision` | Hos den som sätter upp, aldrig i Anbudsklar | Owner eller admin i Eneo |

Byta MCP-nyckel utan avbrott: lägg den nya nyckeln först i `MCP_API_KEYS` och behåll den gamla efter, kör
`anbudsklar eneo provision --mcp-url …` så att Eneo får den nya, och ta sedan bort den gamla.

Byta környckel: nyckeln går ut efter högst 90 dagar och måste bytas innan dess. Två sätt:

- **Utan avbrott:** kör kommandot som vanligt under de sista 14 dagarna. Det skapar en ny nyckel och låter den gamla
  gälla tills den går ut. Sätt den nya nyckeln och starta om appen direkt: så länge den gamla står i `ENEO_API_KEY`
  skapar varje körning ännu en nyckel.
- **Direkt**, till exempel om nyckeln har läckt: kör kommandot med `--rotate-key`. Det skapar en ny nyckel och
  återkallar sedan den gamla, även om den fungerar.

Så här kör du det direkta bytet:

- **Lokalt** kör du samma kommando som när nyckeln skapades, med inloggningen exporterad och `--rotate-key` tillagt.
  Från `backend/`: `uv run anbudsklar eneo provision --rotate-key`, och den nya nyckeln ersätter den gamla i repots
  `.env`. Kör du uppsättningen i Compose-containern (se [Prova med Compose-stacken](#prova-med-compose-stacken)),
  lägg till `--rotate-key` efter `anbudsklar eneo provision` och flytta nyckeln till `.env` som där. Ta bort
  `ENEO_API_KEY` ur `backend/.env` om filen finns, eftersom den gäller före repots `.env` när appen körs från
  `backend/`. Starta sedan om appen (`make up` eller `make dev-api`).
- **I Dokploy**, i en bash-terminal i containern för `anbudsklar-app`: exportera `ENEO_PROVISION_EMAIL` och
  `ENEO_PROVISION_PASSWORD` som vid [uppsättningen](../deploy/dokploy/README.md#3-koppla-ihop-anbudsklar-och-eneo) och
  kör:

  ```bash
  anbudsklar eneo provision --rotate-key --env-file /tmp/eneo.env
  grep '^ENEO_API_KEY=' /tmp/eneo.env && rm /tmp/eneo.env
  ```

  Sätt den nya nyckeln i `ENEO_API_KEY` under Environment och driftsätt igen direkt. Appen har kvar den återkallade
  nyckeln tills dess, så AI-anropen misslyckas. Ange alltid `--env-file /tmp/eneo.env` i containern: där finns inget
  repo, och en fil i containern försvinner vid nästa driftsättning.

## Så anropar appen en assistent

1. `POST {ENEO_BACKEND_URL}/api/v1/assistants/{id}/sessions/?version=2` med `{"question": ..., "stream": false}`.
   Frågan innehåller uppgiftens indata, och underlaget som text med `[SIDA n]`. `version=2` skickas som
   frågeparameter.
2. Är svaret inte giltig JSON skickas felen som en följdfråga i samma session:
   `POST .../sessions/{session_id}/?version=2`.
3. Sessionen raderas alltid efteråt: `DELETE .../sessions/{session_id}/`.

Nyckeln skickas i headern `ENEO_API_KEY_HEADER_NAME` (standard `X-API-Key`). Svaret kan ligga i ett kodblock, som tas
bort före tolkningen. Regelhjälpen behåller sin session för följdfrågor, och där är lagringstiden på en dag det som
rensar.

Ett sessions-id måste vara ett UUID innan det hamnar i adressen. Regelhjälpens `session_id` kommer från webbläsaren och
används i ett anrop med spacets admin-nyckel. API:t tar bara emot ett UUID (annars 422), och motorn kontrollerar det
igen innan värdet läggs i adressen. Ett samtal fortsätter dessutom bara i webbläsaren som startade det: appen minns
vilket samtal den gav vilken webbläsare, med en egen cookie (`anbudsklar_regelhjalpen`, bara för `/api/rules`)
eftersom Regelhjälpen är öppen utan inloggning. Ett id som appen inte gav just den webbläsaren, eller ett samtal som
Eneo inte har kvar, startar ett nytt samtal.

Regelhjälpens källor kommer från Eneos kunskapsreferenser och från MCP-verktygens referenser. En paragraf i LOU blir en
källa med hänvisningen "LOU 20 kap. 1 §" och paragrafens rubrik som titel. En sida ur ett underlag får hänvisningen
"sida N" och filnamnet som titel.

Underlaget skickas som text i stället för som fil, eftersom en servicenyckel inte får ladda upp filer i Eneo. Då
stämmer också sidnumren med vår citatkontroll.

| Svar från Eneo | Betyder | Vad appen gör |
|---|---|---|
| 400, kod 9007 | Eneos allmänna fel för en felaktig förfrågan, till exempel att modellen inte är aktiverad i spacet | "Eneo avvisade förfrågan. Kontrollera assistentens inställningar i Eneo …", och Eneos eget meddelande skrivs i loggen. Bara när meddelandet nämner tokens eller kontextfönstret säger appen att underlaget är för stort |
| 400, kod 9041 | Modelleverantören avvisade anropet. Ett underlag som inte får plats i kontexten kommer oftast tillbaka så | Fel med förklaring på svenska. Samma underlag kan inte lyckas, så tolkningen ger upp direkt |
| 413, eller kod 9015 | Förfrågan är för stor för Eneo eller en proxy framför den | "Underlaget är för stort …". Tolkningen ger upp direkt |
| 422 | Eneo kunde inte läsa förfrågan, till exempel en för lång text | Fel med förklaring på svenska. Tolkningen ger upp direkt |
| 401, 403 eller 404 | Nyckeln nekas, eller assistenten finns inte | Inställningsfel. Inköparen och loggen får den exakta texten, en besökare en allmän |
| 503, kod 9010 | Modelleverantören svarar inte | Fel med förklaring på svenska |
| 429 | Nyckelns gräns för anrop är nådd | Väntar och försöker en gång om `Retry-After` är kort, annars fel med besked om när det går igen |

En servicenyckel som gäller ett space har som standard 5 000 anrop per timme, och varje anrop räknas, även
raderingarna.

Felmeddelandena från motorn kan nå en anonym besökare och nämner därför inte `ENEO_BACKEND_URL` eller sökvägen till
`ENEO_ASSISTANTS_FILE`. De uppgifterna står i appens logg. Ett inställningsfel, som en nekad nyckel eller en saknad
assistent, visas för besökare bara som "AI-motorn är inte rätt inställd just nu". Inköparen ser den exakta texten i
listan över underlag utan checklista, och loggen har den med orsaken.

Ett 400-fel med kod 9007 som inte gäller kontexten, och 401, 403 och 404, kan rättas av en operatör. Där fortsätter
tolkningen därför att försöka med allt längre paus. Fel som samma underlag aldrig klarar markeras som slutgiltiga
(`EngineError(retryable=False)`), och då ger tolkningen upp direkt.

## MCP-servern i Eneo

| Inställning | Värde |
|---|---|
| Namn | `anbudsklar_poc`. Modellen ser verktygen som `anbudsklar_poc__<verktyg>` |
| Adress | `https://<anbudsklar>/mcp`, exakt den publika adressen |
| Autentisering | `bearer` med en nyckel ur `MCP_API_KEYS`. Servern tar också emot `api_key_header` med headern `X-Api-Key` |
| Skicka användarens identitet (`forward_identity`) | Av. Verktygen lämnar bara ut offentliga data |

Tänk på:

- **Ingen omdirigering.** Eneos MCP-klient kan inte följa en omdirigering, varken från `/mcp/` till `/mcp` eller från
  http till https. Registrera den slutliga https-adressen. Servern svarar på både `/mcp` och `/mcp/`.
- **Rätt värdnamn.** Servern tar emot anrop till värdnamnet i `PUBLIC_URL`, till localhost och till några namn för
  lokal körning (`app`, `anbudsklar`, `host.docker.internal`). Fler namn, till exempel `anbudsklar-app` om Eneo når
  appen på Dokploys interna nätverk, läggs i `MCP_ALLOWED_HOSTS`. Andra värdnamn ger svaret 421. Ska Eneo nå
  Anbudsklar på Dokploys interna nät, sätt till exempel `MCP_ALLOWED_HOSTS=["anbudsklar-app"]` under Environment.
- **Godkänn ändringar.** Eneo sparar verktygens beskrivningar när servern registreras. Ändras en beskrivning eller
  parameter läggs ändringen som väntande, och den gamla versionen gäller tills verktygen synkas och godkänns, med
  `anbudsklar eneo provision --mcp-url …` eller av en admin i Eneo. Lägg därför bara till nya, valfria parametrar.
- **Storlek och tid.** Ett verktygssvar hålls under `MCP_MAX_OUTPUT_CHARS` (16 000 tecken). Eneo kortar själv av vid
  32 768. En fråga får högst tio verktygsrundor, och ett anrop får ta högst 60 sekunder.
- **Fel räknas.** Efter fem fel stänger Eneo av servern i 60 sekunder, för alla användare. I 2.2 räknas även
  verktygssvar som är markerade som fel (`isError`). Verktygen markerar därför bara riktiga fel så: meddelandet
  "Tekniskt fel i Anbudsklar", till exempel när databasen inte nås, och okända verktygsnamn. Misstag som modellen
  kan rätta själv blir vanliga svar med vägledning på svenska: ett okänt eller felskrivet `upphandling_id` eller
  `dokument_id`, en annons utan underlag, flera underlag utan `dokument_id`, en sida efter den sista, underlag vars
  text inte är inläst än, en LOU-paragraf som saknas eller inte går att tolka, och alla ogiltiga argument. Ett tomt
  sökresultat är också ett vanligt svar.
- **Värden utanför gränserna justeras** i stället för att avvisas. Tal flyttas till närmaste tillåtna värde (`limit`,
  `offset`, `manader`, `fran_sida`, `till_sida`, `sida` och gränserna i `sok_lou` och `sla_upp_cpv`). Söktext rensas
  från blanksteg i början och slutet och kortas vid en ordgräns när den är för lång. Tom `fritext` listar allt. En
  CPV-kod som sträng, eller flera med komma emellan, tas emot som en lista. Ett omvänt sidintervall (`till_sida`
  före `fran_sida`) läser samma sidor i ordning. Verktygens scheman är oförändrade, så Eneo behöver ingen ny
  synkning.

| Verktyg | Gör |
|---|---|
| `sok_upphandlingar` | Söker annonser på fritext, CPV, status och sista anbudsdag |
| `hamta_upphandling` | Visar en annons med datum, CPV-koder och underlag |
| `sok_i_underlag` | Söker i underlaget till en annons, med avsnitt och sidintervall |
| `lasa_sidor` | Läser högst fem sidor ur ett underlag |
| `kontrollera_citat` | Kontrollerar om ett citat står i underlaget, och på vilken sida |
| `hamta_checklista` | Visar den publicerade checklistan för en annons |
| `hamta_paragraf` | Visar en paragraf i LOU, till exempel "20 kap. 1 §" |
| `sok_lou` | Söker i LOU |
| `sla_upp_cpv` | Slår upp CPV-koder från en beskrivning |
| `kommande_upphandlingar` | Visar avtal som löper ut och när en ny upphandling kan väntas |

## Vad verksamheten kan ändra

Det mesta i Eneo sätts av `anbudsklar eneo provision`, som skriver över ändringar som gjorts i Eneos gränssnitt.
Prova gärna en ändring i Eneo, men för in den i repot och kör kommandot igen.

| Vad | Var | Att tänka på |
|---|---|---|
| Instruktionen för en uppgift | `backend/src/anbudsklar/ai/prompts/` | Kör [kvalitetstestet](quality-test.md) efter en ändring av `tolka_underlag` |
| Kunskap för Regelhjälpen | `KNOWLEDGE_WEBSITES` i `backend/src/anbudsklar/ai/eneo_provision.py` | Kommandot kopplar exakt de webbplatserna till assistenten och låter Eneo hämta om dem varje vecka. Lägg inte in LOU som kunskap: den nås redan via MCP, och då skulle hänvisningarna konkurrera |
| Modell | Flaggan `--model` | Kommandot sätter modellen på spacet och alla assistenter. Modellen måste ha verktygsanrop påslaget |
| Enskilda MCP-verktyg | Assistenten i Eneo | Kommandot bestämmer vilka assistenter som har MCP-servern, men inte vilka verktyg som är på. Stäng av verktyg som inte behövs |

Insights och lagringstid ändras inte. De är satta för att skydda företagens frågor och utkast.

## Lokalt Eneo

En Eneo-instans för utveckling på den egna datorn fungerar som motor. Eneos utvecklingsmiljö körs i en container och
har API:t på `http://localhost:8123`. Vilka adresser som gäller beror på hur Anbudsklar körs:

| Anbudsklar körs med | `ENEO_BACKEND_URL` | `--mcp-url` |
|---|---|---|
| `make dev-api` | `http://localhost:8123` | `http://host.docker.internal:8500/mcp` |
| `make up` (Compose) | `http://host.docker.internal:8123` | `http://host.docker.internal:3501/mcp` |

- **`localhost` i en container är containern själv.** Med `make up` ger `ENEO_BACKEND_URL=http://localhost:8123`
  felet "Det gick inte att nå Eneo" på varje anrop, och loggen visar `Could not reach Eneo at http://localhost:8123`.
  Compose-filen mappar `host.docker.internal` till värddatorn för `migrate`, `app` och `worker`, så att namnet
  fungerar även på Linux. På värddatorn själv finns namnet oftast inte, så `make dev-api` behöver `localhost`.
  Har `.env` adressen för Compose kan du köra `ENEO_BACKEND_URL=http://localhost:8123 make dev-api`.
- **`--mcp-url` är adressen sedd från Eneo.** Eneo i en container når Anbudsklar på värddatorn via
  `host.docker.internal`. Servern tar emot det värdnamnet. Kör Eneo direkt på värddatorn, använd `localhost` i stället.
- **Headern för nyckeln.** Sätt `ENEO_API_KEY_HEADER_NAME` till samma värde som `API_KEY_HEADER_NAME` i Eneos
  `backend/.env`. Mallen har `X-API-Key`, men den lokala utvecklingsmiljön som PoC:n är provad mot har `example`.
- **Linux.** Exemplen är provade med Docker Desktop på macOS. På Linux når en container bara tjänster på värddatorn som
  lyssnar på fler adresser än `127.0.0.1`.

Når Eneo inte `--mcp-url` hoppar uppsättningen över MCP-registreringen, och allt utom MCP-verktygen fungerar ändå. En
MCP-server som registrerats tidigare ligger kvar och används som förut.

### Prova med Compose-stacken

1. Sätt i `.env` och kör `make up`. Behåll `AI_ENGINE=heuristic` tills nyckeln finns, annars startar inte appen.

   ```dotenv
   ENEO_BACKEND_URL=http://host.docker.internal:8123
   ENEO_API_KEY_HEADER_NAME=example
   MCP_API_KEYS=["<nyckel från openssl rand -hex 32>"]
   ```

2. Kör uppsättningen i containern för `app`, där `host.docker.internal` fungerar. Inloggningen exporteras bara i
   terminalen och skickas vidare med `-e` utan värde, så att den inte syns i kommandot:

   ```bash
   export ENEO_PROVISION_EMAIL=<e-post för en admin i Eneo>
   read -rs ENEO_PROVISION_PASSWORD && export ENEO_PROVISION_PASSWORD
   docker compose exec -e ENEO_PROVISION_EMAIL -e ENEO_PROVISION_PASSWORD app \
     anbudsklar eneo provision --mcp-url http://host.docker.internal:3501/mcp --env-file /tmp/eneo.env
   docker compose exec app sh -c "grep '^ENEO_API_KEY=' /tmp/eneo.env && rm /tmp/eneo.env"
   ```

   Med Eneos superadmin-nyckel i stället för lösenordet: `read -rs ENEO_SUPER_API_KEY && export ENEO_SUPER_API_KEY`
   och `-e ENEO_SUPER_API_KEY` i stället för `-e ENEO_PROVISION_PASSWORD`. Assistenternas id sparas i
   `var/eneo-assistants.json`, som containern når som `/app/var`.
3. Lägg nyckeln i `.env` som `ENEO_API_KEY=sk_…`, sätt `AI_ENGINE=eneo` och kör `make up` igen. Compose startar om app
   och worker när `.env` har ändrats. `docker compose logs worker` ska visa `Worker started with the eneo engine`.
4. Röktesta motorn med kvalitetstestet, som skickar de tre påhittade underlagen till Eneo:

   ```bash
   docker compose exec app anbudsklar eval --engine eneo --out /app/var/reports
   ```

   Rapporten hamnar i `var/reports/`. Ett underlag där Eneo ger fel står under "Misslyckades".
5. Prova MCP-kopplingen i Eneo: fråga assistenten "Anbudsklar (PoC) – Regelhjälpen" vad som står i 4 kap. 1 § LOU.
   Svaret ska hänvisa till kapitel och paragraf. Kräver en modell med verktygsanrop påslaget.

### Prova med `make dev-api`

Sätt `ENEO_BACKEND_URL=http://localhost:8123` och `ENEO_API_KEY_HEADER_NAME=example` i `.env`, starta `make dev-api`
och kör från `backend/`, med inloggningen exporterad som ovan:

```bash
uv run anbudsklar eneo provision --mcp-url http://host.docker.internal:8500/mcp
```

Sätt `AI_ENGINE=eneo`, starta om `make dev-api` och röktesta med `uv run anbudsklar eval --engine eneo`. Kommandot
skriver `ENEO_BACKEND_URL=http://localhost:8123` till `.env`. Byt till `http://host.docker.internal:8123` innan du kör
`make up`, eftersom containrarna inte når `localhost`.
