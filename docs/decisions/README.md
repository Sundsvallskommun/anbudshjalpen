# Beslut

Syfte: Samla de arkitekturbeslut som formar Anbudsklar, ett beslut per fil, så att man kan se varför något är som det
är.

Läs detta när: Du undrar varför en lösning ser ut som den gör, vill ändra något som ett beslut förutsätter, eller ska
skriva ett nytt beslut.

Hör ihop med: [Dokumentationsindex](../README.md), [Arkitektur](../architecture.md), [Öppna frågor](../open-questions.md)

## Beslutslogg

| Nr | Beslut | Status | Datum |
|---|---|---|---|
| [0001](0001-eneo-first.md) | Eneo först: allt generellt i Eneo, bara det upphandlingsspecifika här | Föreslaget | 2026-10-05 |
| [0002](0002-react-and-astryx.md) | Gränssnittet byggs i React med Astryx | Accepterat | 2026-10-05 |
| [0003](0003-postgres.md) | Postgres om tjänsten behöver en databas | Accepterat | 2026-10-05 |

## Så skriver du ett beslut

Ett beslut per fil, med de här rubrikerna:

- **Status**, **Datum** och en rad om vad beslutet gäller överst.
- **Sammanhang:** vad som tvingade fram beslutet, med belägg.
- **Beslut:** vad vi gör, i presens. Nämn det starkaste alternativet och varför det valdes bort.
- **Konsekvenser:** vad som blir enklare, vad som blir svårare och vad man måste göra.

Ett accepterat beslut ändras inte i efterhand. Ett nytt beslut ersätter det gamla, och i det gamla beslutets status
står "Ersatt av 00NN". Ett föreslaget beslut får skrivas om tills det accepteras.
