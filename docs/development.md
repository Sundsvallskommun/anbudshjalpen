# Utveckling

Syfte: Visa hur man kör Anbudshjälpen lokalt, vilka kommandon och portar som finns och hur testerna körs.

Läs detta när: Du sätter upp en utvecklingsmiljö, ska köra testerna eller undrar vilket kommando som gör vad.

Hör ihop med: [Drift](operations.md), [Arkitektur](architecture.md), [Eneo-integration](eneo-integration.md),
[Kvalitetstest](quality-test.md)

Kommandona körs från repots rot om inget annat står. `make help` listar alla mål i `Makefile`.

## Det här behövs

- Docker med Compose
- uv 0.9 eller senare (installerar Python 3.12 själv)
- Node 22.22.2 eller senare i 22-serien, eller 24.15 eller senare

## Portar

| Port | Vad |
|---|---|
| 8500 | API:t under utveckling (`make dev-api`) |
| 3502 | Vite under utveckling (`make dev-web`). Skickar `/api`, `/health` och `/mcp` vidare till 8500 |
| 3501 | Hela stacken i Compose (`make up`) |
| 55432 | Postgres |
| 8025 och 1025 | Mailpit: webbsida och SMTP |

Portarna krockar inte med Eneos utvecklingsmiljö, som använder 3000, 8123 och 5432.

## Första gången

```bash
make setup                 # uv sync och npm ci
cp .env.example .env
make services              # Postgres och Mailpit
make migrate
make seed                  # demodata och CPV-koder
cd backend && uv run anbudsklar ingest lou    # LOU från Riksdagen (kräver internet)
```

Worker hämtar också LOU när den startar, om tabellen är tom.

## Köra appen

I två terminaler:

```bash
make dev-api               # API med omladdning på http://127.0.0.1:8500
make dev-web               # webbappen på http://127.0.0.1:3502
```

Öppna `http://127.0.0.1:3502`. `PUBLIC_URL` i `.env` ska vara just den adressen, annars stoppar kontrollen av ursprung
alla ändringar med 403.

Schemalagda jobb körs bara om worker är igång:

```bash
cd backend && uv run anbudsklar worker
```

Hela stacken i containrar, som i drift:

```bash
make up
docker compose exec app anbudsklar seed
```

Tjänsten `migrate` kör migreringarna innan app och worker startar. Öppna `http://127.0.0.1:3501`. Mejlen hamnar i
Mailpit på `http://127.0.0.1:8025`. `make up` igen bygger om imagen och startar om de tjänster vars inställningar har
ändrats, till exempel efter en ändring i `.env`.

Efter nya fixturer i `data/fixtures` (till exempel efter `git pull`): kör `make up`, eftersom imagen innehåller
`data/fixtures`, och sedan `docker compose exec app anbudsklar seed`. Med `make dev-api` räcker `make seed`, som läser
repots `data/`. Ett ersatt underlag tolkas på nytt av worker (eller `anbudsklar interpret --pending`), och inköparen
måste granska och publicera den nya checklistan.

## Webbappen

Logga in i demon på `/logga-in`: "Fortsätt som Anna" är företagaren, som landar på Start, och "Fortsätt som Lars" är
inköparen, som landar på Inköp › Att granska. Inköparens jobb finns på sidan Drift i kontomenyn.

Webbappen ligger i `frontend/`. Reglerna för koden står i `frontend/AGENTS.md` (engelska), och designsystemet med
principerna, sidornas uppbyggnad, de delade komponenterna och reglerna för text i [Design](design.md). Från `frontend/`:

```bash
npm run astryx -- component <Namn>   # props och exempel för en Astryx-komponent
npm run theme:build                  # bygger om temat efter en ändring i src/theme/eneo.theme.ts
```

## Kommandon

Kommandot `anbudsklar` körs från `backend/` med `uv run anbudsklar …`, eller direkt i containern.

| Kommando | Gör |
|---|---|
| `migrate` | Kör databasmigreringarna |
| `seed` | Läser in påhittade annonser, underlag, företag, demopersoner och avtal, och CPV-koderna om de saknas. Går att köra flera gånger. Har en fixtur-PDF byggts om ersätts underlaget som seed lade in tidigare, och checklistor som tolkats från den gamla filen tas bort med det. Underlag som inköpare laddat upp ligger kvar. Utskriften visar antalet i `replaced_documents` |
| `ingest ted`, `ingest eavrop`, `ingest lou`, `ingest cpv`, `ingest agreements` | Hämtar eller läser in en källa. `ingest cpv` och `ingest agreements` tar `--path` till en annan CSV-fil |
| `interpret --notice <id>` eller `interpret --pending` | Tolkar alla underlag i en annons på nytt (nya utkast), eller kör jobbet `interpret_pending` en gång |
| `match` | Bedömer annonser mot företagens profiler |
| `eval` | Kör kvalitetstestet (`--engine`, `--fixtures`, `--out`), se [Kvalitetstest](quality-test.md) |
| `eneo provision` | Sätter upp spacet, assistenterna, MCP-servern och környckeln i Eneo, se [Eneo-integration](eneo-integration.md#sätta-upp-anbudsklar-eneo-provision) |
| `serve` | Startar webbservern (`--host`, `--port`, och `--reload` under utveckling) |
| `worker` | Startar schemaläggaren |

## AI-motor lokalt

`AI_ENGINE=heuristic` fungerar utan nätverk och är standard. Webbappen kallar den regelbaserad: texterna har inget
prefix, och motorn står i fältet `engine` och i ursprungsraden ([AI-uppgifterna](ai-tasks.md#den-heuristiska-motorn)).
För en riktig modell:

- **Eneo:** sätt `ENEO_BACKEND_URL` och `ENEO_API_KEY_HEADER_NAME` och kör `uv run anbudsklar eneo provision` från
  `backend/` enligt [Eneo-integration](eneo-integration.md#sätta-upp-anbudsklar-eneo-provision). Kommandot skriver
  `ENEO_API_KEY` till repots `.env`, som både `make dev-api` och Compose-stacken läser. Sätt sedan `AI_ENGINE=eneo`.
  En nyckel som har läckt byts direkt med `--rotate-key`. Kör kommandot igen efter varje ändring i
  `backend/src/anbudsklar/ai/prompts/`, senast efter ändringen 2026-10-05.
- **Eneo på den egna datorn:** med `make up` körs appen i en container, där `localhost` är containern själv. Sätt då
  `ENEO_BACKEND_URL=http://host.docker.internal:8123` i `.env`. `localhost:8123` fungerar bara för `make dev-api`. Alla
  steg, och ett röktest, står i [Lokalt Eneo](eneo-integration.md#lokalt-eneo).
- **OpenAI-kompatibelt API:** sätt `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL` och `AI_ENGINE=openai`.

## MCP-servern lokalt

Lägg in en nyckel, till exempel `MCP_API_KEYS=["lokal-nyckel"]`, starta om API:t och lista verktygen:

```bash
curl -s http://127.0.0.1:8500/mcp \
  -H 'Authorization: Bearer lokal-nyckel' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Servern är tillståndslös och svarar på `tools/list` utan att en session först startats.

## Tester och kontroller

```bash
make check                 # allt nedan
make check-backend         # ruff och ruff format (även skripten i data/), pyright och pytest
make check-frontend        # typer, enhetstester, temats aktualitet och bygge
make gate                  # tillgänglighet med Playwright och axe, mot en körande stack
```

- Backendtesterna behöver Postgres från `make services`. Varje testkörning skapar en egen databas och tar bort den
  efteråt, så flera körningar kan pågå samtidigt. En annan server anges med `TEST_DATABASE_ADMIN_URL`.
- En enskild del: `cd backend && uv run pytest tests/search -q`.
- Testerna anropar aldrig internet. HTTP-anrop mockas med respx, och inspelade svar ligger i
  `backend/tests/data/<område>/`.
- `make gate` kräver en webbläsare för Playwright: `cd frontend && npx playwright install chromium`.
- CI (`.github/workflows/ci.yml`) kör samma kontroller som `make check-backend` och `make check-frontend`, och
  kontrollerar dessutom låsfilen, Compose-filerna och att imagen byggs. `make gate` körs inte i CI.

## Börja om med tom databas

```bash
docker compose down -v     # tar bort databasens och underlagens volymer
make services migrate seed
```
