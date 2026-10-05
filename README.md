# Anbudsklar

AI-stöd som hjälper småföretag att hitta, förstå och svara på kommunens upphandlingar. Arbetet görs tillsammans med
näringslivsenheten och inköp i Sundsvalls kommun, och Eneo är AI-plattformen.

> **Status: diskussionsfas.** Repot innehåller underlag och beslut men ingen kod ännu.

## Idén i korthet

Företagaren beskriver sitt företag en gång. Anbudsklar bevakar kommunens upphandlingar och gör om förfrågningsunderlag
till checklistor med sidhänvisningar. Tjänsten svarar på frågor om underlaget och granskar anbudsutkastet mot
skallkraven före inlämning. Allt bygger på offentliga källor och hänvisar till källan. Själva anbudet lämnas som i dag i
e-Avrop.

## Karta

| Jag vill … | Läs |
|---|---|
| förstå bakgrunden och vad underlaget föreslår | [Bakgrund](docs/background.md) |
| se den föreslagna arkitekturen | [Arkitektur](docs/architecture.md) |
| veta vad Eneo redan kan och vad som är på väg | [Eneos byggstenar](docs/eneo-building-blocks.md) |
| se vad PoC:n ska visa | [PoC](docs/poc.md) |
| se vad som är beslutat | [Beslut](docs/decisions/README.md) |
| se vad som återstår att avgöra | [Öppna frågor](docs/open-questions.md) |
| förstå en term | [Ordlista](docs/glossary.md) |

Hela indexet finns i [docs/README.md](docs/README.md). Arbetar du som AI-agent, börja med [`AGENTS.md`](AGENTS.md)
(engelska).

## Beslutat hittills

- Gränssnittet byggs i React med Astryx ([beslut 0002](docs/decisions/0002-react-and-astryx.md)).
- Behöver tjänsten en databas blir det Postgres ([beslut 0003](docs/decisions/0003-postgres.md)).
- Föreslaget men inte beslutat: Eneo först. Allt generellt ligger i Eneo, och bara det upphandlingsspecifika byggs här
  ([beslut 0001](docs/decisions/0001-eneo-first.md)).
