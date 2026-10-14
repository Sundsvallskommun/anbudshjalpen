# Beslut

Syfte: Samla de arkitekturbeslut som formar Anbudshjälpen, ett beslut per fil, så att man kan se varför något är som det
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
| [0009](0009-eavrop-projekt-api.md) | e-Avrop hämtas via kommunens Projekt-API, med en vitlista | Accepterat, annonsen som blir kvar vid TED ersatt av 0021 | 2026-10-08 |
| [0010](0010-labblage-egna-foretag.md) | En accesskod skyddar testmiljön, och labbläget låter deltagare prova med sitt eget företag | Accepterat | 2026-10-12 |
| [0011](0011-installningar-granskning-valfri.md) | Inköp styr inställningar i tjänsten, och granskningen före publicering går att slå av | Accepterat, annonsernas märkning när granskningen är av ersatt av 0017 och ursprungsradens ord av 0019 | 2026-10-12 |
| [0012](0012-fragor-mot-alla-dokument.md) | Frågor besvaras mot alla dokument i upphandlingen, med ett urval över en budget | Accepterat, tolkningens läsning ersatt av 0020 | 2026-10-12 |
| [0013](0013-fragor-och-svar-fran-eavrop.md) | Inköps publicerade svar på leverantörernas frågor hämtas från e-Avrops frågelogg | Accepterat, AI-uppgifternas läsning ersatt av 0018 | 2026-10-12 |
| [0014](0014-fraga-ai-panel.md) | AI-stödet är en panel som följer läsaren, och samtalet går att spara som PDF | Accepterat, stegens antal och namn ersatta av 0024, ämnesvalet av 0026 | 2026-10-12 |
| [0015](0015-namnet-anbudshjalpen.md) | Tjänsten heter Anbudshjälpen och får märket Toppen, och de tekniska namnen behåller anbudsklar | Accepterat, repots namn ersatt av 0016 | 2026-10-12 |
| [0016](0016-repot-heter-anbudshjalpen.md) | Repot på GitHub heter anbudshjalpen | Accepterat | 2026-10-12 |
| [0017](0017-granskad-bara-nar-inkop-granskar.md) | Ordet "granskad" i annonslistorna visas bara när inköp granskar checklistor | Accepterat, checklistans ursprungsrad när granskningen är av ersatt av 0019 | 2026-10-12 |
| [0018](0018-publicerade-svar-i-ai-uppgifterna.md) | Inköps publicerade svar hör till underlaget i Fråga AI och checklistan | Accepterat | 2026-10-12 |
| [0019](0019-utan-granskning-ingen-ogranskad-och-checklista-pa-vag.md) | När granskningen är av säger ingen vy "inte granskad", och en checklista på väg visas som på väg | Accepterat | 2026-10-12 |
| [0020](0020-checklistan-lases-ur-alla-dokument.md) | Checklistan tolkas ur alla dokument i upphandlingen, och det som inte lästs in syns | Accepterat | 2026-10-13 |
| [0021](0021-eavrop-gar-fore-ted.md) | En upphandling som finns i både TED och e-Avrop visas som e-Avrops annons | Accepterat | 2026-10-13 |
| [0022](0022-kommunens-styrdokument-som-kalla.md) | Kommunens styrdokument för inköp är en egen källa i Regelhjälpen, skild från lagen | Accepterat | 2026-10-14 |
| [0023](0023-mojliga-anbudsgivare-for-inkop.md) | Inköp ser vilka företag som verkar kunna svara på ett tänkt uppdrag | Accepterat | 2026-10-14 |
| [0024](0024-granska-ar-sista-steget.md) | Granska är upphandlingens sista steg, och steget Lämna in tas bort | Accepterat | 2026-10-14 |
| [0025](0025-profilen-uppdateras-via-fraga-ai.md) | Profilen uppdateras genom Fråga AI via appens eget API, och svaren visar vilka verktyg som kördes | Föreslaget, ämnet som ett val ersatt av 0026 | 2026-10-14 |
| [0026](0026-fraga-ai-valjer-amne-sjalv.md) | Fråga AI väljer själv om en fråga gäller underlaget, reglerna eller profilen | Föreslaget | 2026-10-14 |

## Så skriver du ett beslut

Ett beslut per fil, med de här rubrikerna:

- **Status**, **Datum** och en rad om vad beslutet gäller överst. Ett beslut som ersätter ett annat har också en rad
  **Ersätter**.
- **Sammanhang:** vad som tvingade fram beslutet, med belägg.
- **Beslut:** vad vi gör, i presens. Nämn det starkaste alternativet och varför det valdes bort.
- **Konsekvenser:** vad som blir enklare, vad som blir svårare och vad man måste göra.

Ett accepterat beslut ändras inte i efterhand. Ett nytt beslut ersätter det gamla, och i det gamla beslutets status
står "Ersatt av 00NN". Ett föreslaget beslut får skrivas om tills det accepteras.
