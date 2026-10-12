# Bidra

Syfte: Beskriva hur du bidrar till Anbudshjälpen, från ärende till pull request, och vilka regler och kontroller som
gäller.

Läs detta när: Du vill rapportera ett fel, föreslå en förbättring eller skicka in en ändring i kod eller dokumentation.

Hör ihop med: [Utveckling](development.md), [Säkerhet](SECURITY.md), [Beslut](decisions/README.md),
[`AGENTS.md`](../AGENTS.md) (engelska)

Anbudshjälpen utvecklas av Sundsvalls kommun, och bidrag är välkomna från kommuner, organisationer och utvecklare. Repot
innehåller en PoC, så mycket kan fortfarande ändras. Börja därför alltid med ett ärende.

## 1. Börja med ett ärende

Sök först bland [ärendena på GitHub](https://github.com/Sundsvallskommun/anbudsklar/issues). Finns inget om samma
sak, skapa ett nytt med mallen **Felrapport** eller **Önskemål**. Beskriv vad du vill ändra, varför och hur du tänker
göra. Vänta på svar innan du börjar på en större ändring, så att du inte lägger tid på något som inte kan tas emot.

- En säkerhetsbrist rapporterar du inte i ett ärende. Följ [Säkerhet](SECURITY.md).
- Skriv aldrig personuppgifter, riktiga anbud eller nycklar i ett ärende.

## 2. Sätt upp miljön

Hur du installerar beroendena, startar appen och kör testerna står i [Utveckling](development.md). Börja med
[Första gången](development.md#första-gången).

## 3. Gör ändringen

- **Läs besluten först.** Läs [dokumentationsindexet](README.md) och [beslutsloggen](decisions/README.md) innan du
  föreslår en ny riktning. Ett accepterat beslut ändras inte. Vill du ändra riktning skriver du ett nytt beslut som
  ersätter det gamla.
- **Kontrollera uppgifterna om Eneo.** [Eneos byggstenar](eneo-building-blocks.md) och
  [Eneo-integration](eneo-integration.md) är daterade. Kontrollera uppgifterna mot
  [eneo-ai/eneo](https://github.com/eneo-ai/eneo) innan du bygger på dem.
- **Språk.** Kod, kodkommentarer och `AGENTS.md` skrivs på engelska. Dokumentationen i `docs/` och all text som
  användarna ser skrivs på svenska.
- **Kod.** Ange typer för allt, håll funktionerna små och skriv docstrings som säger varför, inte vad. Läs inställningar bara
  via `anbudsklar.config.Settings`. Varje ändring av datamodellen får en Alembic-migrering.
- **Ny miljövariabel.** Lägg den i `backend/src/anbudsklar/config.py` och i tabellen i
  [Drift](operations.md#miljövariabler). Ska en operatör sätta den, lägg den också i `.env.example`,
  `deploy/dokploy/anbudsklar.env.example` och blocket `x-anbudsklar-env` i
  `deploy/dokploy/docker-compose.anbudsklar.yml`.
- **Gränssnittet** byggs med Astryx. Reglerna för koden står i [`frontend/AGENTS.md`](../frontend/AGENTS.md)
  (engelska) och designsystemet i [Design](design.md).
- **Tester** anropar aldrig internet. Mocka HTTP med respx och lägg inspelade svar i `backend/tests/data/<område>/`.
- **Hemligheter** checkas aldrig in. Filerna `.env` ignoreras av git.

## 4. Regler för data

Anbudshjälpen handlar om företag och upphandlingar. Därför gäller de här reglerna för allt som hamnar i repot:

- Använd bara offentliga källor och företagets egna data. Lägg aldrig in riktiga anbudsutkast, personuppgifter eller
  konfidentiella avtalspriser.
- Testdata är påhittade och märkta som påhittade, som i `data/fixtures/` ([Fiktiva testdata](../data/fixtures/README.md)).
  Spara inte kontaktpersoner ur annonser.
- Varje påstående som visas för en användare ska gå att spåra till en källa: dokument och sida, eller kapitel och
  paragraf i lagen. Vår kod kontrollerar citaten, och en modell får aldrig sätta kontrollfälten (`check`, `found_page`
  och `draft_check`).
- Anbudsutkast hanteras i minnet och sparas aldrig.
- MCP-servern läser bara och lämnar bara ut offentliga data: aldrig företagsprofiler, frågor, träffar eller utkast,
  och checklistor först när de är publicerade. Ändra verktygens scheman bara genom att lägga till, eftersom Eneo måste
  synka och godkänna varje ändring.
- Likabehandling: coachen ger aldrig en leverantör råd som går utöver underlaget. Öppna frågor hänvisas till
  frågefunktionen i e-Avrop.
- Bygg ingen riktig inloggning i PoC:n, och låt den aldrig hålla riktiga företagsdata
  ([beslut 0007](decisions/0007-poc-login-persona-picker.md)).

## 5. Dokumentation i samma commit

- Ändrar du något som en sida i `docs/` beskriver, ändrar du sidan i samma commit.
- En ny sida börjar med raderna `Syfte:`, `Läs detta när:` och `Hör ihop med:` och läggs till i tabellen i
  [dokumentationsindexet](README.md).
- När en öppen fråga är avgjord skrivs svaret som ett beslut ([Så skriver du ett beslut](decisions/README.md#så-skriver-du-ett-beslut)),
  och frågan tas bort ur [Öppna frågor](open-questions.md).
- Övriga regler står i [Skriva dokumentation](README.md#skriva-dokumentation).

## 6. Kör kontrollerna

Från repots rot:

| Kommando | Kör |
|---|---|
| `make services` | Startar Postgres och Mailpit. Backendtesterna behöver Postgres |
| `make check` | `make check-backend` och `make check-frontend` |
| `make check-backend` | ruff och ruff format (även skripten i `data/`), pyright och pytest |
| `make check-frontend` | Typer, enhetstester, temats aktualitet och bygge |
| `make gate` | Tillgänglighet med Playwright och axe, mot en körande stack med demodata |

- `make check` ska gå igenom innan du öppnar en pull request. CI (`.github/workflows/ci.yml`) kör samma kontroller
  och kontrollerar dessutom låsfilen, Compose-filerna och att imagen byggs.
- `make gate` körs inte i CI. Kör den själv när du ändrar gränssnittet. Stacken visar koden den byggdes från, så kör
  `make up` igen först. Gaten behöver en webbläsare för Playwright: `cd frontend && npx playwright install chromium`.
- Sänk aldrig en gräns, ta aldrig bort ett läge och lägg aldrig till ett undantag för axe för att få gaten grön.

## 7. Commit-meddelanden

Skriv commit-meddelanden enligt [Conventional Commits](https://www.conventionalcommits.org/), som i `git log`: typen,
ett kolon och en kort beskrivning på engelska i imperativ. Typerna i historiken är `feat`, `fix`, `test` och `docs`.

```text
feat: let the visitor choose light or dark
fix: compare match freshness on one clock
test: wait for slow renders and the login redirect
docs: set up Anbudshjälpen with background, architecture and first decisions
```

## 8. Öppna en pull request

- Håll dig till en ändring per pull request.
- Fyll i mallen: vad du ändrade och varför, vilket ärende den stänger, vilka sidor du ändrade, hur du testade och
  skärmbilder om gränssnittet har ändrats. GitHub stänger ärendet automatiskt bara med de engelska orden, till exempel
  `Fixes #123`.
- Skärmbilder visar bara påhittade data.
- Be om granskning när CI är grön.

## Licens för bidrag

Repot har licensen AGPL-3.0 ([LICENSE](../LICENSE), [beslut 0008](decisions/0008-license-agpl-3.md)). Det du bidrar
med licensieras under samma licens. Lägg bara in kod, text och filer som du har rätt att dela under den. Ett nytt
beroende måste ha en licens som går att kombinera med AGPL-3.0.
