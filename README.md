# Anbudsklar

AI-stöd som hjälper småföretag att hitta, förstå och svara på kommunens upphandlingar. Arbetet görs tillsammans med
näringslivsenheten och inköp i Sundsvalls kommun, och Eneo är AI-plattformen.

> **Status: PoC under uppbyggnad.** Alla företag, personer och underlag i demodata är påhittade.

## Idén i korthet

Företagaren beskriver sitt företag en gång. Anbudsklar bevakar kommunens upphandlingar och gör om förfrågningsunderlag
till checklistor med sidhänvisningar. Tjänsten svarar på frågor om underlaget och granskar anbudsutkastet mot
skallkraven före inlämning. Allt bygger på offentliga källor och hänvisar till källan. Själva anbudet lämnas som i dag i
e-Avrop.

## Kom igång

Du behöver Docker, [uv](https://docs.astral.sh/uv/) och Node 22.22.2 eller senare i 22-serien, eller 24.15 eller
senare. Från repots rot:

```bash
make setup                 # installera beroenden
cp .env.example .env
make services              # Postgres och Mailpit
make migrate
make seed                  # påhittade demodata och CPV-koder
make dev-api               # terminal 1: API:t på port 8500
make dev-web               # terminal 2: webbappen på http://127.0.0.1:3502
```

AI-motorn är `heuristic` från början, som fungerar utan nätverk. Hur du kopplar in Eneo, kör hela stacken i containrar
och kör testerna står i [Utveckling](docs/development.md).

## Karta

| Jag vill … | Läs |
|---|---|
| förstå bakgrunden och vad underlaget föreslår | [Bakgrund](docs/background.md) |
| se vad PoC:n ska visa | [PoC](docs/poc.md) |
| se hur lösningen är uppbyggd | [Arkitektur](docs/architecture.md) |
| förstå AI-uppgifterna och citatkontrollen | [AI-uppgifterna](docs/ai-tasks.md) |
| koppla appen till Eneo | [Eneo-integration](docs/eneo-integration.md) |
| veta varifrån datan kommer | [Datakällor](docs/data-sources.md) |
| köra appen och testerna | [Utveckling](docs/development.md) |
| driftsätta eller felsöka | [Drift](docs/operations.md) och [Dokploy](deploy/dokploy/README.md) |
| veta vad Eneo redan kan och vad som är på väg | [Eneos byggstenar](docs/eneo-building-blocks.md) |
| se vad som är beslutat | [Beslut](docs/decisions/README.md) |
| se vad som återstår att avgöra | [Öppna frågor](docs/open-questions.md) |
| förstå en term | [Ordlista](docs/glossary.md) |

Hela indexet finns i [docs/README.md](docs/README.md). Arbetar du som AI-agent, börja med [`AGENTS.md`](AGENTS.md)
(engelska).

## Beslutat hittills

- Gränssnittet byggs i React med Astryx ([beslut 0002](docs/decisions/0002-react-and-astryx.md)).
- Databasen är Postgres ([beslut 0003](docs/decisions/0003-postgres.md)).
- PoC:n använder en Eneo-testinstans via API som AI-motor och har en egen MCP-server som bara läser offentliga data.
  De styrda uppgifterna flyttar till Eneo Flows när Flows är klart
  ([beslut 0004](docs/decisions/0004-eneo-api-and-own-mcp-server.md), som ersätter beslut 0001).
- Sökningen görs i Postgres med fulltext på svenska och trigram ([beslut 0005](docs/decisions/0005-domain-search-in-postgres.md)).
- Webbappen byggs med Vite och serveras av en FastAPI-backend i samma container
  ([beslut 0006](docs/decisions/0006-vite-spa-served-by-fastapi.md)).
- Inloggningen i PoC:n är ett val av demoperson ([beslut 0007](docs/decisions/0007-poc-login-persona-picker.md)).

## Licens

Licensen är inte vald än. Se [Öppna frågor](docs/open-questions.md).
