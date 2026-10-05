# Datakällor

Syfte: Beskriva varifrån Anbudsklars data kommer, hur den hämtas och vilka villkor som gäller.

Läs detta när: Du ska ändra insamlingen, lägga till en källa, förklara för verksamheten vad som är riktigt och vad som
är påhittat, eller undrar varför en annons saknas.

Hör ihop med: [PoC](poc.md), [Drift](operations.md), [Öppna frågor](open-questions.md), [Ordlista](glossary.md)

> Kontrollerat 2026-10-05. Koden ligger i `backend/src/anbudsklar/ingest/`.

## Översikt

| Källa | Innehåll | Hämtas | Villkor | I PoC:n |
|---|---|---|---|---|
| TED | Annonser över EU:s tröskelvärden | Öppet API, varje dag 06:15 | Fri återanvändning | Riktiga |
| e-Avrop | Alla kommunens annonser och planerade upphandlingar | Inte automatiskt, se nedan | `robots.txt` förbjuder automatisk hämtning | Saknas tills vi får tillstånd |
| Riksdagen | LOU (SFS 2016:1145), paragraf för paragraf | Öppna data, varje måndag 05:00 | Lagtext är fri | Riktig |
| EU:s CPV-lista | 9 454 CPV-koder med svenska benämningar | Fil i repot | EU:s regler för återanvändning | Riktig |
| Avtalskatalog | Avtal och när de löper ut | CSV-fil | – | Påhittad |
| Underlag och demoföretag | Förfrågningsunderlag, facit, ett anbudsutkast och två företag | Filer i repot | – | Påhittade |
| Bolagsverket | Uppgifter om företag | Används inte i PoC:n | Kräver registrering | – |

Kontaktpersoners namn, e-post och telefonnummer i annonser sparas inte.

## TED

- **API:** `POST https://api.ted.europa.eu/v3/notices/search` (`TED_API_URL`). Sökningen kräver ingen nyckel.
- **Köpare:** Sundsvalls kommun och de kommunala bolagen, sökta på organisationsnummer med och utan bindestreck, och på
  namn som reserv (`TED_BUYER_NAMES`). Sök inte på ort: då kommer statliga myndigheter i Sundsvall med.
- **Annonstyper:** upphandlingar, tilldelningar och förhandsannonser från de senaste 18 månaderna.
- **Status:** sista anbudsdag i framtiden ger `open`, tilldelning ger `awarded`, förhandsannons ger `planned` och
  resten blir `closed`. Hela svaret från TED sparas i `raw`. När sista anbudsdag passerar sparar jobbet
  `close_expired` `closed` på annonsen inom en kvart, för annonser från alla källor, och API:t visar den som stängd
  redan från sista anbudsdagen.
- **Villkor:** TED:s annonser får återanvändas fritt, kommersiellt och icke-kommersiellt.
- **Begränsning:** TED har bara upphandlingar över tröskelvärdena. Den 2026-10-05 fanns 9 öppna annonser från Sundsvalls
  köpare i TED och 13 i e-Avrop.

| Köpare | Organisationsnummer |
|---|---|
| Sundsvalls kommun | 212000-2411 |
| MittSverige Vatten & Avfall AB | 556661-8756 |
| Sundsvall Elnät AB | 556502-7223 |
| Sundsvall Energi AB | 556478-6647 |
| Mitthem AB | 556067-6982 |
| Sundsvalls Hamn AB | 556015-8072 |
| SKIFU (Sundsvalls kommuns Industrifastighetsutveckling AB) | 556437-1424 |
| ServaNet AB | 556765-9296 |
| Sundsvall Logistikpark AB | 556789-7383 |

## e-Avrop

Sundsvalls kommun annonserar alla upphandlingar i e-Avrop, även de under tröskelvärdena. Listorna "Aktuella" och
"Planerade" är öppna utan inloggning, men e-Avrops `robots.txt` förbjuder all automatisk hämtning. Insamlaren läser
`robots.txt` först och hämtar ingenting så länge förbudet gäller.

Insamlaren följer högst fem omdirigeringar till `robots.txt`. Bara en fil som saknas (404 eller 410) räknas som att
allt är tillåtet. Alla andra svar som inte lyckas, till exempel 429, 403 och 5xx, och omdirigeringar som inte leder
fram till en fil räknas som att allt är förbjudet.

- Hämtningen kräver skriftligt tillstånd från Antirio AB, som driver e-Avrop, eller tillgång till e-Avrops API via inköp.
  Det är en [öppen fråga](open-questions.md).
- Får vi tillstånd gäller: en `User-Agent` som anger vem vi är (`HTTP_USER_AGENT`), listorna högst var tredje timme,
  minst fem sekunder mellan anrop, inga nedladdningar av underlag och stopp vid CAPTCHA, 403 eller 429. Skydd mot
  automatiska anrop kringgås aldrig.
- Samma annons i TED och e-Avrop känns igen på länken: TED:s länk till underlaget är e-Avrops annonslänk.

## LOU från Riksdagen

- **Källa:** `https://data.riksdagen.se/dokument/sfs-2016-1145.text` (`RIKSDAGEN_LOU_URL`).
- **Innehåll:** lagen delas upp i kapitel och paragraf, med rubrik och text, och sparas i tabellen `lou_sections`.
  Den 2026-10-05 var lagen ändrad till och med SFS 2026:880 och hade 422 paragrafer i 22 kapitel med paragrafer.
- **Villkor:** författningar omfattas inte av upphovsrätt (1 kap. 9 § upphovsrättslagen).
- **Används av:** MCP-verktygen `sok_lou` och `hamta_paragraf`, och Regelhjälpen med motorerna `openai` och `heuristic`.

## CPV-koder

- **Källa:** EU:s officiella CPV 2008 från TED (`https://ted.europa.eu/documents/d/ted/cpv_2008_xls`).
- **Fil:** `data/cpv/cpv_2008_sv.csv` med kod (åtta siffror utan kontrollsiffra), svensk benämning, överordnad kod och
  nivå. Den byggs av `data/cpv/build_cpv_csv.py`. Källa och licens står i `data/cpv/README.md`.
- **Inläsning:** `anbudsklar ingest cpv`. Worker läser in listan när tabellen är tom.

## Avtalskatalog

I PoC:n är avtalskatalogen påhittad: `data/fixtures/agreements.csv`, med kolumnerna `external_id`, `title`, `category`,
`cpv_codes` (separerade med `;`), `supplier`, `start_date`, `end_date`, `extension_months` (separerade med `;`),
`max_end_date` och `previous_requirements`. Den läses in med `anbudsklar ingest agreements`.

Kommande upphandlingar räknas fram ur slutdatumet (`services/upcoming.py`): en ny upphandling under tröskelvärdena
väntas annonseras 9–6 månader innan avtalet löper ut. Ett utdrag ur inköps riktiga avtalskatalog ersätter filen om
inköp kan lämna ett.

- Ett avtal vars efterföljare redan är annonserad visas inte. Efterföljaren är en öppen annons med samma titel, eller en
  som delar en CPV-kod på fem signifikanta siffror och ett ord i titeln med avtalet.
- Ett avtal vars fönster på 9–6 månader har passerat utan en sådan annons visas ändå, märkt `announcement_overdue` i
  API:t: upphandlingen borde redan ha annonserats, så läsaren bör leta bland annonserna. Webbappen visar inte
  märkningen än.

## Påhittade underlag och demoföretag

`data/fixtures/` innehåller tre påhittade förfrågningsunderlag med facit, ett anbudsutkast med avsiktliga brister och
två demoföretag. Underlagen byggs av `data/fixtures/build_fixtures.py`, och varje sida har sidfoten "FIKTIVT UNDERLAG –
endast för demonstration". `anbudsklar seed` läser in allt. Facit beskrivs i [Kvalitetstest](quality-test.md).

## Bolagsverket

Bolagsverkets API för värdefulla datamängder ger namn, SNI-kod, adress och status för ett företag. Det är gratis men
kräver ett konto i Bolagsverkets utvecklarportal och en klientnyckel. PoC:n använder det inte; demoföretagen är
påhittade.
