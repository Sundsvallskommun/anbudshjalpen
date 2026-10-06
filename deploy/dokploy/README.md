# Testmiljö i Dokploy

Syfte: Beskriva hur Anbudsklar och en Eneo-testinstans sätts upp i Dokploy, med filerna i den här katalogen.

Läs detta när: Du ska sätta upp eller uppdatera testmiljön, eller undrar varför Compose-filerna ser ut som de gör.

Hör ihop med: [Drift](../../docs/operations.md), [Eneo-integration](../../docs/eneo-integration.md),
[Beslut 0004](../../docs/decisions/0004-eneo-api-and-own-mcp-server.md)

> Inget är driftsatt än. Server och domäner är en [öppen fråga](../../docs/open-questions.md). Eneo-filen är
> provkörd lokalt 2026-10-05: migreringarna, den första användaren, inloggningen och frontend fungerade.

## Filer

| Fil | Innehåll |
|---|---|
| `docker-compose.anbudsklar.yml` | Anbudsklar: `anbudsklar-app`, `anbudsklar-worker`, `anbudsklar-migrate`, `anbudsklar-db` och `anbudsklar-mail` |
| `anbudsklar.env.example` | Mall för Anbudsklars miljövariabler |
| `docker-compose.eneo-test.yml` | Eneo 2.2: `eneo-frontend`, `eneo-backend`, `eneo-worker`, `eneo-db`, `eneo-redis` och `eneo-db-init`. Bygger på Eneos egen Compose-fil, utan Traefik |
| `eneo-test.env.example` | Mall för Eneo-testinstansens miljövariabler |

Dokploy hämtar filerna från Git och skriver fliken Environment till en `.env` bredvid Compose-filen. Inga portar
publiceras; Dokploys Traefik når tjänsterna via domänerna. Tjänsterna har unika namn, eftersom Dokploy lägger tjänster
med domän från flera stackar på samma nätverk.

## Det här behövs

- En Dokploy-server med internetåtkomst och x86-64-processor. Eneo publicerar bara images för `linux/amd64`.
- Två DNS-namn som pekar på servern, till exempel `anbudsklar.example.se` och `eneo-test.example.se`.
- En nyckel till en modelleverantör för Eneo. Vilken modell är en [öppen fråga](../../docs/open-questions.md).
- Att Dokploy kan läsa det här repot.

Skapa hemligheterna med `openssl rand -hex 32` om inget annat står i mallen. Använd hex, så att värdena fungerar i
adresser och kommandon.

## 1. Eneo-testinstansen

1. Skapa en tjänst av typen Compose i Dokploy, med Git som källa och Compose-sökvägen
   `deploy/dokploy/docker-compose.eneo-test.yml`.
2. Klistra in `eneo-test.env.example` under Environment och fyll i alla tomma värden.
3. Lägg till domänerna, alla med https:

   | Tjänst | Port | Värd | Sökväg |
   |---|---|---|---|
   | `eneo-frontend` | 3000 | `eneo-test.example.se` | `/` |
   | `eneo-backend` | 8000 | `eneo-test.example.se` | `/api` |
   | `eneo-backend` | 8000 | `eneo-test.example.se` | `/version` |

   Låt sökvägen vara kvar till backend (ta inte bort prefixet). Traefik väljer den längsta regeln först, så `/api` går
   till backend och resten till frontend. Lägg till `/docs` och `/openapi.json` på samma sätt om API-dokumentationen
   ska synas.
4. Driftsätt. `eneo-db-init` kör migreringarna och skapar den första användaren med rollen Owner.
5. Logga in på `https://eneo-test.example.se` med `ENEO_ADMIN_EMAIL` och `ENEO_ADMIN_PASSWORD`, och byt lösenord.
6. Lägg till en modelleverantör och en språkmodell under Admin. Slå på verktygsanrop (`supports_tool_calling`) för
   modellen, annars använder assistenterna aldrig Anbudsklars MCP-verktyg.

## 2. Anbudsklar

1. Skapa en ny Compose-tjänst med Git som källa och Compose-sökvägen `deploy/dokploy/docker-compose.anbudsklar.yml`.
2. Klistra in `anbudsklar.env.example` under Environment. Sätt `PUBLIC_URL=https://anbudsklar.example.se`, fyll i
   hemligheterna och sätt `MCP_API_KEYS=["<nyckel>"]`. Behåll `AI_ENGINE=heuristic` tills avsnitt 3 är klart.
3. Lägg till domänen för `anbudsklar-app`, port 3001, värd `anbudsklar.example.se`, sökväg `/`, med https. Ska fler än
   de som har tillgång till servern läsa demomejlen kan `anbudsklar-mail` få en egen domän på port 8025. Webbsidan
   skyddas av `MAILPIT_UI_AUTH`.
4. Driftsätt. Dokploy bygger imagen från `Dockerfile`, och `anbudsklar-migrate` kör migreringarna innan app och worker
   startar.
5. Öppna en terminal i containern för `anbudsklar-app` och läs in demodata: `anbudsklar seed`.
6. Kontrollera: `curl -fsS https://anbudsklar.example.se/health` ska svara `{"ok": true}`.

## 3. Koppla ihop Anbudsklar och Eneo

1. Sätt `ENEO_BACKEND_URL=https://eneo-test.example.se` i Anbudsklars Environment och driftsätt igen.
2. Öppna en bash-terminal i containern för `anbudsklar-app` och kör:

   ```bash
   export ENEO_PROVISION_EMAIL=<e-post för Eneo-admin>
   read -rs ENEO_PROVISION_PASSWORD && export ENEO_PROVISION_PASSWORD
   anbudsklar eneo provision --mcp-url https://anbudsklar.example.se/mcp --env-file /tmp/eneo.env
   grep '^ENEO_API_KEY=' /tmp/eneo.env && rm /tmp/eneo.env
   ```

   Kommandot registrerar MCP-servern, skapar spacet, assistenterna och környckeln och sparar assistenternas id i
   volymen `anbudsklar_var`. Se [Eneo-integration](../../docs/eneo-integration.md#sätta-upp-anbudsklar-eneo-provision).
   Ska Eneo nå Anbudsklar på Dokploys interna nät i stället för den publika adressen: sätt
   `MCP_ALLOWED_HOSTS=["anbudsklar-app"]` i Environment, driftsätt igen och använd
   `--mcp-url http://anbudsklar-app:3001/mcp`.
3. Sätt `ENEO_API_KEY` till nyckeln från steg 2 och `AI_ENGINE=eneo` i Environment, och driftsätt igen.
4. Kontrollera i Eneo att MCP-servern `anbudsklar_poc` finns under Admin och att dess verktyg är listade.

## Uppdatera

- **Anbudsklar:** driftsätt igen i Dokploy. Migreringarna körs automatiskt. Har en instruktion, ett kontrakt eller ett
  MCP-verktyg ändrats: öppna en bash-terminal i containern för `anbudsklar-app`, exportera `ENEO_PROVISION_EMAIL` och
  `ENEO_PROVISION_PASSWORD` som i avsnitt 3 och kör
  `anbudsklar eneo provision --mcp-url https://anbudsklar.example.se/mcp --env-file /tmp/eneo.env`. Det uppdaterar
  assistenterna och synkar och godkänner verktygen. En nyckel i Environment som fungerar behålls, och då skrivs ingen
  fil. Har den slutat fungera (Eneo svarar 401 eller 403), eller går den ut inom 14 dagar, finns en ny i
  `/tmp/eneo.env`, och kommandot varnar om att sätta den i Environment: gör som i avsnitt 3, steg 2 och 3. Svarar
  Eneo något annat på kontrollen av nyckeln, till exempel 429 eller 5xx, stoppar kommandot utan att röra nyckeln.
  Instruktionerna ändrades senast 2026-10-05, så en testmiljö som kopplades till Eneo före det behöver en körning (se
  [Eneo-integration](../../docs/eneo-integration.md#sätta-upp-anbudsklar-eneo-provision)).
- **Fixturerna:** har `data/fixtures` ändrats, kör `anbudsklar seed` i containern för `anbudsklar-app` efter
  driftsättningen. Imagen innehåller fixturerna och byggs om vid varje driftsättning. Ett ersatt underlag får en ny
  checklista som måste granskas och publiceras igen.
- **Környckeln** går ut efter högst 90 dagar. Byt den enligt [Eneo-integration](../../docs/eneo-integration.md#nycklar).
  Under de sista 14 dagarna ger en vanlig körning en ny nyckel medan den gamla fortsätter att gälla. Byter du med
  `--rotate-key` återkallas den gamla nyckeln direkt, så sätt den nya i Environment och driftsätt igen med en gång.
- **Eneo:** ändra `ENEO_BACKEND_VERSION` och `ENEO_FRONTEND_VERSION` och driftsätt igen. `eneo-db-init` kör
  migreringarna.

## Säkerhet

- Bara `anbudsklar-app`, Eneos frontend och backend, och eventuellt Mailpits webbsida, får domäner. Databaserna har
  inga publicerade portar, och Eneos Postgres och Redis ligger på ett internt nätverk utan internet.
- `anbudsklar-app` publicerar ingen port och nås bara genom Dokploys Traefik. Det förutsätter appens gränser per
  IP-adress, som läser besökarens adress ur `X-Forwarded-For` ([Drift](../../docs/operations.md#gränser)). Publicera
  därför aldrig port 3001 direkt.
- Hemligheter finns bara i Dokploys Environment.
- Testmiljön får bara innehålla påhittade företag och offentliga underlag.
- Mailpit fångar alla mejl, så inget når en riktig mottagare.
- Compose-filen sätter `ENVIRONMENT=production`, och där döljs och nekas inköparens demoperson
  ([beslut 0007](../../docs/decisions/0007-poc-login-persona-picker.md)). Ska inköp granska och publicera checklistor i
  testmiljön: lägg först grundläggande autentisering eller en IP-spärr i Traefik framför hela `anbudsklar-app`, sätt
  sedan `DEMO_BUYER_ENABLED=true` under Environment och driftsätt igen.
- Ställ in säkerhetskopior av volymerna `anbudsklar_db` och `eneo_postgres_data` i Dokploy.

## Kända luckor

- Eneos frontend kör 2.2.0-rc.4 och backend 2.2.0-rc.6, eftersom frontendimagen för rc.5 och rc.6 saknades på ghcr.io
  den 2026-10-05. Byt båda till 2.2.0 när den är släppt.
- Det finns ingen publicerad image för Anbudsklar. Dokploy bygger den från källkoden vid varje driftsättning.
