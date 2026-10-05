# 0003: Postgres om tjänsten behöver en databas

- **Status:** Accepterat
- **Datum:** 2026-10-05
- **Gäller:** val av databas för de egna delarna

## Sammanhang

Tal till text har ingen egen databas, eftersom allt den sparar ligger i Eneo. Anbudsklar har däremot data som inte hör
hemma i Eneo: annonser och deras metadata, extraherade checklistor, företagsprofiler, bevakningar, skickade träffar och
påminnelser. Om vi faktiskt behöver en databas är fortfarande en [öppen fråga](../open-questions.md), men det mesta
talar för det.

## Beslut

Behövs en databas blir det Postgres. Eneo kör också Postgres, så drift, backup och kunskap finns redan.

Vi lägger inte till någon separat vektordatabas, eftersom sökning i kunskap sker i Eneo. Behövs vektorsökning i de egna
delarna senare används pgvector i samma Postgres.

## Konsekvenser

- Databasen är Anbudsklars egen. Den delas inte med Eneos databas, och Anbudsklar läser aldrig Eneos tabeller direkt.
- Det som sparas om företag hålls till ett minimum, och utkast sparas inte.
