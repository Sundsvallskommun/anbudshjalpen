# Dokumentationsindex

Syfte: Visa alla sidor i dokumentationen, vad var och en är till för och om den är aktuell.

Läs detta när: Du söker rätt dokument eller ska lägga till ett nytt.

Hör ihop med: [README](../README.md), [Beslut](decisions/README.md), [Öppna frågor](open-questions.md)

## Börja här

| Du är | Läs i den här ordningen |
|---|---|
| Från verksamheten | [Bakgrund](background.md), [PoC](poc.md), [Datakällor](data-sources.md), [Öppna frågor](open-questions.md) |
| Utvecklare | [Utveckling](development.md), [Arkitektur](architecture.md), [AI-uppgifterna](ai-tasks.md), [Beslut](decisions/README.md) och [Design](design.md) för gränssnittet |
| Den som driftar | [Drift](operations.md), [Dokploy](../deploy/dokploy/README.md), [Eneo-integration](eneo-integration.md) |
| Ett AI-verktyg | [`AGENTS.md`](../AGENTS.md) (engelska), därefter sidorna ovan efter uppgift |

## Sidor

Status: **Aktuell** stämmer med det vi vet nu. **Under arbete** beskriver något som byggs just nu och kan ändras.
**Daterad** beskriver ett läge som ändras snabbt och måste kontrolleras igen.

| Sida | Syfte | Status |
|---|---|---|
| [Bakgrund](background.md) | Underlaget från näringslivsenheten, faktagranskning och det underlaget missar | Aktuell |
| [PoC](poc.md) | Vad PoC:n ska visa, demoresan, vad som är riktigt och vad som är mockat | Under arbete |
| [Arkitektur](architecture.md) | PoC:ns uppbyggnad, målbilden för produktion och vad som byts på vägen | Aktuell för PoC:n, målbilden kan ändras |
| [AI-uppgifterna](ai-tasks.md) | Varje AI-uppgifts indata, kontrakt, instruktion och citatkontroll | Under arbete |
| [Design](design.md) | Gränssnittets designsystem: principer, navigering, sidorna, delade komponenter, regler för text, tillgänglighet och mått | Under arbete |
| [Målbild för gränssnittet](direction.md) | Riktningen som omgörningen av gränssnittet byggdes efter, med besluten, skälen och utgångsläget. Skrivs inte om | Daterad 2026-10-05 |
| [Eneo-integration](eneo-integration.md) | Testinstansen, uppsättningen i Eneo, nycklar, MCP och vad verksamheten kan ändra | Daterad 2026-10-05 |
| [Datakällor](data-sources.md) | TED, e-Avrop, Riksdagen, CPV, avtalskatalogen och villkoren för dem | Daterad 2026-10-05 |
| [Kvalitetstest](quality-test.md) | Hur tolkningen mäts mot facit, och facitformatet | Under arbete |
| [Utveckling](development.md) | Köra lokalt, kommandon, portar och tester | Under arbete |
| [Drift](operations.md) | Imagen, miljövariabler, gränser, jobb, säkerhetskopiering, uppdatering och felsökning | Under arbete |
| [Eneos byggstenar](eneo-building-blocks.md) | Moduler, widgets, Flows med mera: vad de gör, status och vad de passar till | Daterad 2026-10-05 |
| [Öppna frågor](open-questions.md) | Det som återstår att avgöra inom teknik, verksamhet och juridik, och fel vi hittat i Eneo | Aktuell |
| [Ordlista](glossary.md) | Upphandlings- och tekniktermer på vanlig svenska | Aktuell |
| [Beslut](decisions/README.md) | Arkitekturbeslut, ett per fil | Aktuell |
| [Dokploy](../deploy/dokploy/README.md) | Compose-filer och steg för testmiljön i Dokploy | Under arbete |

## Skriva dokumentation

- Varje sida börjar med raderna `Syfte:`, `Läs detta när:` och `Hör ihop med:`.
- En uppgift står på ett ställe. Andra sidor länkar dit.
- Påståenden om koden anger sökvägen, aldrig ett radnummer. Koden har rätt om sidan och koden säger olika.
- Kommandon säger vilken katalog de körs från.
- Ändras något som en sida beskriver, ändras sidan i samma commit. En ny sida läggs till i tabellen ovan.
