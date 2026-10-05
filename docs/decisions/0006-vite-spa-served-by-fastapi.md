# 0006: Webbappen byggs med Vite och serveras av FastAPI

- **Status:** Accepterat
- **Datum:** 2026-10-05
- **Gäller:** byggverktyg för gränssnittet, backendens ramverk och hur appen körs

## Sammanhang

Beslut 0002 säger React med Astryx. Kvar var byggverktyget och backenden.

- eneo-module-kit planerar Vite, React och Astryx som statiska filer, serverade av en FastAPI-backend i en process och
  en container. Tal till text ska lämna Next.js av samma skäl.
- Alla vyer i Anbudsklar visar data som hämtas i webbläsaren. Ingen vy vinner på att renderas på servern.
- Ett Vite-bygge innehåller bara externa skript- och stilfiler. Då går det att ha en strikt Content Security Policy
  utan `unsafe-inline`. Det provades med Astryx 0.6.3 och Vite 8 den 2026-10-05.
- Backenden behöver asynkron Python: Postgres, HTTP-anrop till Eneo och TED, och MCP-SDK:t, som Eneo också använder.

## Beslut

- **Gränssnitt:** Vite 8, React 19 och TypeScript, med Astryx och Eneo-temat. Astryx låses till en exakt version.
  React Router i biblioteksläge och TanStack Query för data. Bygget blir statiska filer.
- **Backend:** FastAPI med Python 3.12, SQLAlchemy 2 (asynkront) och Alembic. Beroenden hanteras med uv.
- **Körning:** en image. FastAPI serverar API:t, MCP-servern och de byggda filerna på port 3001, med reservväg till
  `index.html` och strikt CSP. Samma image kör de schemalagda jobben i en egen container (`anbudsklar worker`).

Vite+ 1.0 (släppt 2026-09-28) utvärderades. Det är samma Vite 8 med Vitest, Oxlint, Oxfmt och en uppgiftskörare
bakom kommandot `vp`. Vi väntar med det: det har bara varit stabilt i en vecka, kräver att `vite` pekas om till
VoidZeros egen kärna, och inget Eneo-repo använder det. `vite.config.ts` förblir vanlig Vite, så bytet är litet senare.

Det starkaste alternativet var Next.js, som Tal till text använder i dag. Det ger en Node-process i imagen, ett extra
proxysteg framför uppladdningar och kräver `unsafe-inline` i CSP.

## Konsekvenser

- Ingen Node behövs när appen körs. Dockerfilen bygger gränssnittet i ett eget steg.
- Under utveckling kör Vite på port 3502 och skickar `/api`, `/health` och `/mcp` vidare till API:t på port 8500.
  `PUBLIC_URL` ska då vara Vites adress, annars stoppar kontrollen av ursprung alla ändringar.
- Appen har samma körform som Eneos moduler: port 3001, `/health` och en användare utan root. Den kan senare gå över
  till eneo-module-kit utan att skrivas om.
- Hur man kör och testar står i [Utveckling](../development.md).
