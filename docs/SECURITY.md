# Säkerhet

Syfte: Beskriva hur du rapporterar en säkerhetsbrist i Anbudsklar, vad som omfattas och vilka svarstider vi siktar på.

Läs detta när: Du har hittat en säkerhetsbrist, misstänker att en nyckel har läckt eller undrar hur repot skyddas.

Hör ihop med: [Bidra](CONTRIBUTING.md), [Arkitektur](architecture.md#säkerhet-i-webbappen), [Drift](operations.md),
[Eneo-integration](eneo-integration.md#nycklar)

Rapportera aldrig en säkerhetsbrist i ett öppet ärende, en pull request eller en kommentar på GitHub.

## Rapportera en brist

Mejla `security@sundsvall.se`. Det är samma adress som för Eneo.

Ta med så mycket du kan av det här:

- vilken commit eller miljö det gäller, till exempel `main`, en egen Compose-stack eller testmiljön i Dokploy
- vilken del det gäller, till exempel en adress i API:t, ett MCP-verktyg, ett schemalagt jobb, uppladdningen av filer
  eller en Compose-fil
- vad en angripare kan nå eller göra, och vilken gräns som bryts, till exempel ett annat företags data eller
  inköparens rätt att publicera
- steg för att återskapa bristen, eller ett så litet exempel som möjligt
- loggar, skärmbilder eller länkar, utan personuppgifter och nycklar
- om bristen redan är känd offentligt eller utnyttjas
- förslag på rättning, om du har ett
- hur vi når dig med frågor

Berätta inte offentligt om bristen förrän den är rättad eller det finns ett sätt att skydda sig, och vi har haft
rimlig tid att samordna.

## Svarstider

Tiderna är mål, inte löften. Brister som redan utnyttjas, nycklar som har läckt och brister i inloggning, behörighet,
tolkningen av uppladdade filer, instruktionerna till AI-motorn, nycklarna till Eneo, SSRF eller körning av kod
prioriteras.

| Allvarlighet | Första svar | Första bedömning | Mål för rättning eller skydd |
|---|---|---|---|
| Kritisk | 1 arbetsdag | 1 arbetsdag | Så snart det går |
| Hög | 1 arbetsdag | 2 arbetsdagar | 30 dagar |
| Medel | 2 arbetsdagar | 5 arbetsdagar | 90 dagar |
| Låg | 5 arbetsdagar | Vid nästa genomgång | När det finns tid |

## Vad som omfattas

Allt i det här repot: backend med API, MCP-server, worker och insamling, webbappen, `Dockerfile`, Compose-filerna,
`deploy/dokploy/` och CI.

Särskilt viktigt är:

- att ett företag kommer åt ett annat företags profil, träffar, påminnelser eller svar
- att någon kan godkänna eller publicera en checklista utan inköparens roll, eller använda inköparens demoperson där
  den ska vara avstängd (`ENVIRONMENT=production` utan `DEMO_BUYER_ENABLED=true`)
- att MCP-servern lämnar ut något annat än offentliga data och publicerade checklistor, eller svarar utan giltig
  nyckel
- att ett anbudsutkast sparas, loggas eller lämnas ut
- att en uppladdad fil kan krascha servern, fylla minnet eller disken eller läsa andra filer
- att kontrollen av ursprung, Content Security Policy eller sessionscookien går att kringgå
- att text i ett underlag eller utkast får AI-motorn att lämna ut data eller sätta kontrollfälten (`check`,
  `found_page` och `draft_check`)
- att insamlingen kan fås att anropa andra adresser än källorna (SSRF)
- att en nyckel eller ett lösenord har hamnat i repot, i en logg eller i ett svar

### Utanför

- **Avsiktliga förenklingar i PoC:n.** Att vem som helst kan välja en demoperson utan lösenord är en avsiktlig
  förenkling ([beslut 0007](decisions/0007-poc-login-persona-picker.md)). Det gäller också
  [de kända luckorna](operations.md#kända-luckor) i Drift, till exempel att sessionerna och gränserna ligger i
  processens minne. Det är däremot en brist om inköparens demoperson går att använda där den ska vara avstängd.
- **Eneo.** Brister i Eneo rapporteras till Eneo-projektet ([eneo-ai/eneo](https://github.com/eneo-ai/eneo)) enligt
  dess säkerhetspolicy.
- **Andras tjänster.** Brister i TED, e-Avrop, Riksdagens öppna data eller Dokploy rapporteras till den som driver
  tjänsten.
- **Demodatan.** Alla företag och personer i demodatan är påhittade, så uppgifter i den är ingen läcka.

## Versioner

Anbudsklar är en PoC utan släppta versioner. Rättningar görs på `main`, och bara det senaste på `main` underhålls.

## Så skyddas repot

- CI (`.github/workflows/ci.yml`) kör ruff med säkerhetsreglerna från flake8-bandit (`S`), pyright och pytest för
  backend, och typer, enhetstester och bygge för webbappen. CI kontrollerar också låsfilen, Compose-filerna och att
  imagen byggs.
- Testerna anropar aldrig internet.
- Filerna `.env` ignoreras av git. Med `ENVIRONMENT=production` vägrar appen starta med utvecklingsvärdet för
  `SESSION_SECRET`.
- Hur webbappen och datan skyddas står i [Säkerhet i webbappen](architecture.md#säkerhet-i-webbappen) och
  [Dataskydd i designen](architecture.md#dataskydd-i-designen). Gränserna för anrop och filer står i
  [Drift](operations.md#gränser).

## Om en nyckel har läckt

1. Byt nyckeln direkt:
   - **Környckeln till Eneo** (`ENEO_API_KEY`): kör `anbudsklar eneo provision --rotate-key`. Det skapar en ny nyckel
     och återkallar den gamla. Stegen för varje miljö står i [Eneo-integration](eneo-integration.md#nycklar).
   - **MCP-nycklarna** (`MCP_API_KEYS`): lägg in en ny nyckel, ge den till Eneo med
     `anbudsklar eneo provision --mcp-url …` och ta bort den gamla.
   - **`SESSION_SECRET`:** sätt ett nytt värde, till exempel med `openssl rand -hex 32`, och starta om appen.
2. Läs loggarna och se om nyckeln har använts.
3. Har nyckeln checkats in, ta bort den ur git-historiken och mejla `security@sundsvall.se`.
