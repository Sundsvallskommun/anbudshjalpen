# Datakällor

Syfte: Beskriva varifrån Anbudshjälpens data kommer, hur den hämtas och vilka villkor som gäller.

Läs detta när: Du ska ändra insamlingen, lägga till en källa, förklara för verksamheten vad som är riktigt och vad som
är påhittat, eller undrar varför en annons saknas.

Hör ihop med: [PoC](poc.md), [Drift](operations.md), [Öppna frågor](open-questions.md), [Ordlista](glossary.md)

> Kontrollerat 2026-10-05, e-Avrop 2026-10-08. Koden ligger i `backend/src/anbudsklar/ingest/`.

## Översikt

| Källa | Innehåll | Hämtas | Villkor | I PoC:n |
|---|---|---|---|---|
| TED | Annonser över EU:s tröskelvärden | Öppet API, varje dag 06:15 | Fri återanvändning | Riktiga |
| e-Avrop | Kommunens annonserade upphandlingar, även under tröskelvärdena, och deras underlag | Kommunens Projekt-API, varje dag 06:30 | Kommunens nyckel. Bara publicerat sparas ([beslut 0009](decisions/0009-eavrop-projekt-api.md)) | Riktiga när nyckeln är inlagd |
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
- **Sista dag:** annonsens tidigaste sista anbudsdag (eForms BT-131, fälten `deadline-receipt-tender-*-lot`) sparas
  som `deadline_at` med `deadline_kind` `tender`. Ett selektivt förfarande har ingen sista anbudsdag i annonsen, bara
  sista dag för anbudsansökan (BT-1311, `cac:ParticipationRequestReceptionPeriod`, fälten
  `deadline-receipt-request-*-lot`): då sparas den dagen med `deadline_kind` `request`, och appen, mejlen, MCP-verktygen
  och motorernas annonsblock kallar den "Sista dag för anbudsansökan". Sista anbudsdag kommer först i inbjudan till de
  utvalda och finns bara om en publicerad checklista anger den. Kontrollerat 2026-10-07 på annonsen 680702-2026
  (Hedbergska skolan, Sundsvalls kommun).
- **Beskrivning:** förfarandets beskrivning (`description-proc`), annars alla delområdenas (`description-lot`)
  efter varandra, så att ett delområde aldrig faller bort ur sökningen, matchningen och det modellen läser.
- **Status:** en sista dag i framtiden ger `open`, tilldelning ger `awarded`, förhandsannons ger `planned` och resten
  blir `closed`. Hela svaret från TED sparas i `raw`. När sista dagen passerar sparar jobbet `close_expired` `closed`
  på annonsen inom en kvart, för annonser från alla källor, och API:t visar den som stängd redan från den dagen. Det
  gäller också sista dag för anbudsansökan: efter den kan inget nytt företag komma med, så annonsen räknas inte längre
  som öppen och matchas inte.
- **Referensnummer:** köparens eget nummer för upphandlingen (eForms BT-22, fältet `internal-identifier-proc`) sparas
  som `reference_number`. Det visas efter köparen på upphandlingens sida och i MCP-verktyget
  `hamta_upphandling`. Annonser som e-Avrop har skickat till TED saknar det: den 2026-10-05 gällde det alla 165
  annonser från Sundsvalls köpare. De har bara e-Avrops URN:er per delområde (`urn:…`), som inte räknas som
  referensnummer. Annonser från e-Avrops API får kommunens diarienummer (till exempel "UH-2026-120"), de påhittade
  sitt DEMO-nummer, och inköparen kan ange ett för en upphandling som läggs in för hand. Sökningen hittar inte annonser på referensnumret.
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

Sundsvalls kommun annonserar alla upphandlingar i e-Avrop, även de under tröskelvärdena, och underlagen finns bara där.
Anbudshjälpen läser kommunens upphandlingar via e-Avrops Projekt-API med kommunens nyckel (`EAVROP_API_TOKEN`,
`EAVROP_CLIENT_ID`). Hur det går till, reglerna som skyddar sekretessbelagda uppgifter och det API:t saknar står i
[e-Avrops API](eavrop.md).

- Nyckeln läser allt i kommunens projekt. Insamlaren sparar bara publicerade upphandlingar och fälten i en vitlista
  ([beslut 0009](decisions/0009-eavrop-projekt-api.md)).
- Underlagets filer hämtas i PDF, Word, Excel och text, och zip-arkiv packas upp. Andra filer står med namn och skäl
  på annonsen, och en fil som e-Avrop publicerat på nytt ersätter den gamla
  ([beslut 0020](decisions/0020-checklistan-lases-ur-alla-dokument.md)). De flesta av kommunens dokument är exporter
  ur e-Avrop, som tjänsten känner igen, se [e-Avrops egna dokument](eavrop.md#e-avrops-egna-dokument).
- Inköps publicerade svar på leverantörernas frågor läses ur annonsens frågelogg, bara besvarade frågor och aldrig
  vem som frågade ([beslut 0013](decisions/0013-fragor-och-svar-fran-eavrop.md)). De visas i steg 1 Krav och via
  MCP-verktyget `hamta_fragor_svar`, och Fråga AI och tolkningen läser dem ([beslut 0018](decisions/0018-publicerade-svar-i-ai-uppgifterna.md)).
- e-Avrops webbplats hämtas inte automatiskt. Dess `robots.txt` förbjuder det, och API:t gör det onödigt.
- Samma upphandling i TED och e-Avrop känns igen på länken: TED:s länk till underlaget är e-Avrops annonslänk med
  upphandlingens id. Den blir e-Avrops annons, med köpare, uppskattat värde, ort och länk från TED
  ([beslut 0021](decisions/0021-eavrop-gar-fore-ted.md)).

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
  API:t: upphandlingen borde redan ha annonserats, så läsaren bör leta bland annonserna. På Start står ett sådant avtal
  som "borde redan ha annonserats", med en länk som söker bland upphandlingarna. Högerspalten i listan Upphandlingar
  visar det inte.

## Påhittade underlag och demoföretag

`data/fixtures/` innehåller tre påhittade förfrågningsunderlag med facit, ett anbudsutkast med avsiktliga brister och
två demoföretag. Underlagen byggs av `data/fixtures/build_fixtures.py`, och varje sida har sidfoten "FIKTIVT UNDERLAG –
endast för demonstration". `anbudsklar seed` läser in allt. Facit beskrivs i [Kvalitetstest](quality-test.md).

Med `SHOW_FICTITIOUS=false` döljs de påhittade annonserna, underlagen och avtalen överallt, utan att raderas. Det
passar när riktiga underlag finns från e-Avrop. Demopersonerna och deras företag finns kvar, eftersom inloggningen
bygger på dem.

## Bolagsverket

Bolagsverkets API för värdefulla datamängder ger namn, SNI-kod, adress och status för ett företag. Det är gratis men
kräver ett konto i Bolagsverkets utvecklarportal och en klientnyckel. PoC:n använder det inte; demoföretagen är
påhittade.
