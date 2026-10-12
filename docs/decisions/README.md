# Beslut

Syfte: Samla de arkitekturbeslut som formar Anbudsklar, ett beslut per fil, så att man kan se varför något är som det
är.

Läs detta när: Du undrar varför en lösning ser ut som den gör, vill ändra något som ett beslut förutsätter, eller ska
skriva ett nytt beslut.

Hör ihop med: [Dokumentationsindex](../README.md), [Arkitektur](../architecture.md), [Öppna frågor](../open-questions.md)

## Beslutslogg

| Nr | Beslut | Status | Datum |
|---|---|---|---|
| [0001](0001-poc-standalone-production-on-eneo.md) | PoC:n körs fristående, produktion byggs på Eneo | Ersatt av 0004 | 2026-10-05 |
| [0002](0002-react-and-astryx.md) | Gränssnittet byggs i React med Astryx | Accepterat | 2026-10-05 |
| [0003](0003-postgres.md) | Postgres om tjänsten behöver en databas | Accepterat | 2026-10-05 |
| [0004](0004-eneo-api-and-own-mcp-server.md) | PoC:n använder Eneo via API och en egen MCP-server | Accepterat | 2026-10-05 |
| [0005](0005-domain-search-in-postgres.md) | Sökning i upphandlingsdatan görs i Postgres | Accepterat | 2026-10-05 |
| [0006](0006-vite-spa-served-by-fastapi.md) | Webbappen byggs med Vite och serveras av FastAPI | Accepterat | 2026-10-05 |
| [0007](0007-poc-login-persona-picker.md) | Inloggningen i PoC:n är ett val av demoperson | Accepterat | 2026-10-05 |
| [0008](0008-license-agpl-3.md) | Repot licensieras under AGPL-3.0, som Eneo | Accepterat | 2026-10-07 |
| [0009](0009-eavrop-projekt-api.md) | e-Avrop hämtas via kommunens Projekt-API, med en vitlista | Accepterat | 2026-10-08 |
| [0010](0010-labblage-egna-foretag.md) | En accesskod skyddar testmiljön, och labbläget låter deltagare prova med sitt eget företag | Accepterat | 2026-10-12 |
| [0011](0011-installningar-granskning-valfri.md) | Inköp styr inställningar i tjänsten, och granskningen före publicering går att slå av | Accepterat | 2026-10-12 |

## Så skriver du ett beslut

Ett beslut per fil, med de här rubrikerna:

- **Status**, **Datum** och en rad om vad beslutet gäller överst. Ett beslut som ersätter ett annat har också en rad
  **Ersätter**.
- **Sammanhang:** vad som tvingade fram beslutet, med belägg.
- **Beslut:** vad vi gör, i presens. Nämn det starkaste alternativet och varför det valdes bort.
- **Konsekvenser:** vad som blir enklare, vad som blir svårare och vad man måste göra.

Ett accepterat beslut ändras inte i efterhand. Ett nytt beslut ersätter det gamla, och i det gamla beslutets status
står "Ersatt av 00NN". Ett föreslaget beslut får skrivas om tills det accepteras.
