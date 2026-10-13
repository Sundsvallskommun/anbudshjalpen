# 0009: e-Avrop hämtas via kommunens Projekt-API, med en vitlista

- **Status:** Accepterat, vilken annons som blir kvar när upphandlingen också finns i TED ersatt av
  [0021](0021-eavrop-gar-fore-ted.md)
- **Datum:** 2026-10-08
- **Gäller:** insamlingen från e-Avrop, vilka uppgifter som får lämna e-Avrop och vilka underlag som tolkas automatiskt

## Sammanhang

Sundsvalls kommun annonserar alla upphandlingar i e-Avrop. Upphandlingar under EU:s tröskelvärden, och alla
förfrågningsunderlag, finns bara där. TED har bara en sammanfattning med länk till e-Avrop för upphandlingar över
tröskelvärdena.

e-Avrops `robots.txt` förbjuder automatisk hämtning från webbplatsen, och insamlaren hämtade därför ingenting.
Kommunen har nu en nyckel och ett kund-id till e-Avrops Projekt-API
([dokumentation](https://www.e-avrop.com/api-doc?api=public/Project)). API:t ger annonserade upphandlingar med datum,
CPV-koder och de dokument som hör till annonsen.

Nyckeln är kommunens egen och läser **allt** i kommunens upphandlingsprojekt. Det gäller också sådant som omfattas av
sekretess eller aldrig ska ut:

- vilka som har lämnat anbud, med priser, kontaktuppgifter, kvalificering och vinnare (`Suppliers`)
- utvärderingsprotokoll och loggar (`Reports`, `LogFiles`)
- projektets arbetsfiler (`Documents`)
- handläggarnas namn och e-post (`Members`, `AgreementOwner`)
- projekt som ännu inte har annonserats

Vid provkörningen 2026-10-08 hade inget av 76 arbetsdokument markeringen `IsClassified`. Det gällde även
utvärderingsprotokoll och kreditupplysningar om anbudsgivare, så markeringen går inte att lita på.

## Beslut

Insamlaren `ingest_eavrop` läser e-Avrops Projekt-API med kommunens nyckel och sparar bara det som står på en vitlista:

- **Bara publicerat:** ett projekt tas med när det har händelsen `Announced` och en annons med `AnnouncementDate`.
  Det är `RequestForTender`, eller `RequestForApplications` i första steget av ett tvåstegsförfarande. En inbjudan som
  bara skickats till utvalda leverantörer räknas inte.
- **Bara fälten i vitlistan:**
  - titel, omfattning, diarienummer, CPV-koder och förfarande
  - sista dag för anbud eller ansökan, sista dag för frågor och annonsdatum
  - händelserna och filnamnen på annonsens dokument

  Svaret sparas aldrig i sin helhet. Uppskattat värde används inte, eftersom det kan vara en intern uppskattning.
- **Bara annonsens dokument**, och bara från adressen för annonsdokument (`/v1/announcement-documents/`). Projektets
  egna dokument läses aldrig. Underlag hämtas för öppna upphandlingar, i format som appen kan läsa (PDF, Word och text).
- **Ett huvuddokument tolkas automatiskt.** Det väljs på filnamnet, till exempel "Administrativa föreskrifter" eller
  "Förfrågan". De andra dokumenten sparas som bilagor (`auto_interpret = false`). Inköp kan be om en tolkning av en
  bilaga.
- **En upphandling, en annons.** Finns upphandlingen redan som TED-annons läggs underlaget på den. TED:s länk
  `NoticeLink.aspx?id=<ProcurementId>` pekar ut den. TED-insamlaren skapar inte en annons för en upphandling som redan
  finns från e-Avrop.
- Nyckeln används bara av worker, för det här jobbet. Utan nyckel gör jobbet ingenting.

Det starkaste alternativet var att skrapa e-Avrops öppna listor med skriftligt tillstånd från Antirio. Det ger bara
listorna, inga underlag, och kräver att HTML-sidor tolkas. Skrapan tas bort.

## Konsekvenser

- Upphandlingar under tröskelvärdena och riktiga underlag finns i appen när nyckeln är inlagd. De öppna
  upphandlingarnas huvuddokument blir checklistor som inköp granskar.
- Ett fel i vitlistan kan läcka sekretessbelagda uppgifter. Ändringar i `backend/src/anbudsklar/ingest/eavrop.py`
  kräver därför tester som visar att de hemliga delarna aldrig sparas. De syntetiska API-svaren i testerna har sådana
  delar med avsikt.
- Nyckeln är en hemlighet med vid behörighet. Den hör hemma i driftmiljöns hemligheter (`EAVROP_API_TOKEN`) och
  ska bytas om den läcker.
- Svaren kan inte spelas in som testdata, eftersom de innehåller anbudsgivare och personal. Testerna använder
  påhittade svar.
- Det API:t inte ger, men som tjänsten hade behövt, står i [e-Avrops API](../eavrop.md#det-som-saknas).
