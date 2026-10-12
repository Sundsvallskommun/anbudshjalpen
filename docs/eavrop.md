# e-Avrops API

Syfte: Beskriva hur Anbudsklar läser e-Avrops Projekt-API, vilka regler som skyddar sekretessbelagda uppgifter och
vilka uppgifter som saknas i API:t men hade behövts.

Läs detta när: Du ändrar insamlingen från e-Avrop, felsöker en upphandling som saknas eller har fel underlag, eller
förbereder ett samtal med Antirio eller inköp.

Hör ihop med: [Beslut 0009](decisions/0009-eavrop-projekt-api.md), [Datakällor](data-sources.md),
[Drift](operations.md), [Öppna frågor](open-questions.md)

> Kontrollerat mot API:t 2026-10-08. Koden ligger i `backend/src/anbudsklar/ingest/eavrop.py`.

## Vad vi läser

e-Avrop har två API:er för köpare. Båda kräver kommunens nyckel (`Authorization: Bearer`) och kund-id:

| API | Används | Innehåll |
|---|---|---|
| [Projekt-API](https://www.e-avrop.com/api-doc?api=public/Project) | Ja | Kommunens upphandlingsprojekt: lista med datum för när de skapades och ändrades, och allt om ett projekt |
| [Avtals-API](https://www.e-avrop.com/api-doc?api=public/Agreement) | Nej, ännu inte | Kommunens avtal och versioner av dem |

Jobbet `ingest_eavrop` körs varje dag 06:30:

1. Listar projekt som skapats de senaste 18 månaderna (`GET /v1.1/clients/{kund-id}/procurements`).
2. Hämtar ett projekt bara om det har ändrats (`UpdatedDate`) sedan förra lyckade körningen som hämtade något, med en
   dags marginal. Ett detaljanrop tar ett par sekunder, och de flesta projekt annonseras aldrig. Efter en ändring i
   vad insamlaren läser hämtar `anbudsklar ingest eavrop --full` alla projekt igen, vilket tar ungefär en kvart.
3. Tar med projektet bara om det är publicerat, och sparar bara fälten i vitlistan (se nedan).
4. Hämtar underlaget för öppna upphandlingar och lägger det på annonsen.

Provkörningen 2026-10-08 gav 458 projekt. 115 av dem var publicerade: 77 blev egna annonser och 38 fanns redan som
TED-annonser och fick underlaget där. 12 var öppna.

## Reglerna som skyddar sekretessen

Nyckeln läser allt i kommunens projekt, även anbudsgivare, priser, utvärdering, arbetsfiler och personal. Därför
gäller en vitlista ([beslut 0009](decisions/0009-eavrop-projekt-api.md)):

| Regel | Hur |
|---|---|
| Bara publicerade upphandlingar | Händelsen `Announced` och en annons med `AnnouncementDate`. En inbjudan till utvalda leverantörer (`InvitationDate`) räknas inte |
| Bara fälten i vitlistan | Titel, omfattning, diarienummer, CPV-koder, förfarande, datum, händelser och annonsens filnamn. Svaret sparas aldrig i sin helhet |
| Bara annonsens dokument | Från `RequestForTender` eller `RequestForApplications`, och bara från adressen `/v1/announcement-documents/`. Projektets `Documents` läses aldrig |
| Inget uppskattat värde | `Value` kan vara en intern uppskattning och visas inte |
| Nyckeln stannar i worker | Bara `ingest_eavrop` använder `EAVROP_API_TOKEN`. Appen och MCP-servern läser bara det som sparats |

Markeringen `IsClassified` används inte som skydd. Den saknades på utvärderingsprotokoll och kreditupplysningar.

## Hur uppgifterna blir en annons

| I annonsen | Från API:t |
|---|---|
| Titel, beskrivning, CPV-koder | `Title`, `Description`, `CpvCodes` |
| Referensnummer | `DiaryNumber`, till exempel "UH-2026-120" |
| Förfarande | `ProcurementType` med LOU:s namn. Nationella förfaranden blir "Upphandling under tröskelvärdena (19 kap. LOU)" |
| Sista dag | `LastBid`. I första steget av ett tvåstegsförfarande `LastApplication`, alltså sista dag för ansökan |
| Sista dag för frågor | `LastQuestion`, eller `LastQuestionApplication` i första steget. Sparas i `raw` men används ännu inte |
| Status | Avbruten (`Aborted`) blir stängd, tilldelad (`Assigned`, `ContractAssigned`) blir tilldelad, annars efter sista dag |
| Länk | `NoticeLink.aspx?id=<ProcurementId>` under `EAVROP_BASE_URL`, samma länk som TED ger |
| Köpare | `ORGANIZATION_NAME`, eftersom API:t inte anger köpare |

**Midnatt är slutet av dagen före.** API:t anger tider som midnatt i början av dagen efter sista dagen, precis som
TED. Appen sparar 23:59:59 på sista dagen, så att datumet stämmer med e-Avrops webbplats.

**TED och e-Avrop.** TED:s länk till underlaget innehåller e-Avrops `ProcurementId`. Finns upphandlingen redan som
TED-annons får den underlaget, och ingen ny annons skapas. Kommer den från e-Avrop först skapar TED-insamlaren ingen
egen annons.

**Underlaget.** Filer i PDF, Word (`.docx`) och text hämtas, högst 50 MB per fil. Excel, bilder och film hoppas över.
En fil hämtas igen när annonsen eller filen har ändrats efter att vi sparade den. Samma innehåll sparas inte två gånger.

**Huvuddokumentet** tolkas automatiskt till en checklista. Det väljs på filnamnet, i den här ordningen:

1. administrativa föreskrifter
2. upphandlingsföreskrifter
3. förfrågningsunderlag
4. upphandlingsdokument
5. anbudsförfrågan
6. förfrågan
7. inbjudan
8. krav på leverantör
9. kravspecifikation

En PDF går före en Word-fil med samma namn. Har annonsen bara en läsbar fil blir den huvuddokumentet. Annars tolkas
inget automatiskt. De andra filerna sparas som bilagor: de går att söka i och läsa via MCP, och inköp kan be om en
tolkning av dem under Inköp › Att granska.

## Det som saknas

Det här ger API:t inte, eller inte tillförlitligt, men tjänsten hade behövt det. Listan är underlag för samtal med
Antirio och inköp.

| Saknas | Följd i dag | Önskemål |
|---|---|---|
| **En nyckel som bara läser publicerat** | Nyckeln läser sekretessbelagda uppgifter, och bara vår vitlista skyddar dem | En nyckel eller ett omfång som bara ger annonserade upphandlingar och annonsens dokument |
| **Tillförlitlig sekretessmarkering** | `IsClassified` saknades på utvärderingsprotokoll och kreditupplysningar | Att markeringen sätts, eller att arbetsfiler hålls helt utanför API:t |
| **Frågor och svar** | Bara flaggan `IsQuestionsOnline`. Svaren kan inte visas eller sökas | Publicerade frågor och svar per upphandling, med datum |
| **Vad som har ändrats** | Bara `UpdatedDate` på annonsen, och på enstaka filer. Rättelser syns inte som rättelser | En ändringslogg eller versioner av annonsen och dokumenten |
| **Besked om ändringar** | Listan filtreras bara på när projektet skapades, så alla projekt listas varje gång | Filtrering på ändringsdatum, eller webhooks |
| **Köpare per upphandling** | Alla e-Avrop-annonser får `ORGANIZATION_NAME`, även när kommunen köper åt ett bolag | Köparens namn och organisationsnummer |
| **Delområden** | Bara flaggan `HasLots` | Delområdenas namn, CPV-koder och omfattning |
| **Planerade upphandlingar** | Listan "Planerade" på e-Avrops webbplats finns inte i API:t | Planerade upphandlingar med kvartal och CPV-koder |
| **Publicerat värde** | `Value` används inte, eftersom det kan vara internt | En markering av om värdet är publicerat |
| **Bolagens upphandlingar** | Inköp upphandlar en del åt bolagen, till exempel Mitthem, och de syns. Ett bolag med eget konto i e-Avrop syns troligen inte med kommunens nyckel | Besked om vilka konton nyckeln täcker, och nycklar per bolag om det behövs |

Det här är inte prövat ännu:

- **Enskilda annonser** (`/v1/simple-procurements/`). De finns i listan och hanteras som projekt, eftersom
  dokumentationen ger dem samma svar, men svaret är inte kontrollerat mot riktiga data.
- **Avtals-API:t**, som kan ersätta den påhittade avtalskatalogen.
