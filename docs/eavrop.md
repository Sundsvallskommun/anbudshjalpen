# e-Avrops API

Syfte: Beskriva hur Anbudshjälpen läser e-Avrops Projekt-API, vilka regler som skyddar sekretessbelagda uppgifter, hur
frågor och svar läses ur frågeloggen och vilka uppgifter som saknas i API:t men hade behövts.

Läs detta när: Du ändrar insamlingen från e-Avrop, felsöker en upphandling som saknas eller har fel underlag, eller
förbereder ett samtal med Antirio eller inköp.

Hör ihop med: [Beslut 0009](decisions/0009-eavrop-projekt-api.md),
[Beslut 0013](decisions/0013-fragor-och-svar-fran-eavrop.md), [Datakällor](data-sources.md), [Drift](operations.md),
[Öppna frågor](open-questions.md)

> Kontrollerat mot API:t 2026-10-08 och, för frågeloggen, 2026-10-12. Koden ligger i
> `backend/src/anbudsklar/ingest/eavrop.py` och `backend/src/anbudsklar/ingest/eavrop_qa.py`.

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
   vad insamlaren läser hämtar `anbudsklar ingest eavrop --full` alla projekt igen, även de som redan är sparade,
   vilket tar ungefär en kvart. Oförändrade filer hämtas inte igen.
3. Tar med projektet bara om det är publicerat, och sparar bara fälten i vitlistan (se nedan).
4. Hämtar underlaget för öppna upphandlingar och lägger det på annonsen.
5. Läser frågeloggen för varje öppen upphandling, även de som inte ändrats, och speglar inköps publicerade svar
   (se [Frågor och svar](#frågor-och-svar)).

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
| Bara frågeloggen bland loggfilerna | Av `AnnouncementLogFiles` hämtas `LoggfilOrginalFragor.txt`, efter exakt filnamn och bara från adressen `/v1/announcements/{id}/log-documents` ([beslut 0013](decisions/0013-fragor-och-svar-fran-eavrop.md)). E-postloggarna bredvid den, som namnger frågeställarna, hämtas aldrig |
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
| Sista dag för frågor | `LastQuestion`, eller `LastQuestionApplication` i första steget, som slutet av den dagen (`question_deadline_at`). Listor, Fråga AI och påminnelser använder det före checklistans datum ([beslut 0020](decisions/0020-checklistan-lases-ur-alla-dokument.md)) |
| Status | Avbruten (`Aborted`) blir stängd, tilldelad (`Assigned`, `ContractAssigned`) blir tilldelad, annars efter sista dag |
| Länk | `NoticeLink.aspx?id=<ProcurementId>` under `EAVROP_BASE_URL`, samma länk som TED ger |
| Köpare | `ORGANIZATION_NAME`, eftersom API:t inte anger köpare |

**Midnatt är slutet av samma dag.** Tidsplanen (`TimeTable`) anger datum som midnatt i början av sista dagen:
`LastBid` "2026-11-06T00:00:00+01:00" visas som sista anbudsdag 2026-11-06 på e-Avrops annonssida (kontrollerat
2026-10-12). Appen sparar 23:59:59 samma dag, så att datumet stämmer med e-Avrops webbplats och med TED. Fram till
2026-10-12 sparades dagen före, så att annonserna visade en dag för tidig sista dag och stängdes en dag för tidigt.

**TED och e-Avrop.** TED:s länk till underlaget innehåller e-Avrops `ProcurementId`. Finns upphandlingen redan som
TED-annons får den underlaget, och ingen ny annons skapas. Kommer den från e-Avrop först skapar TED-insamlaren ingen
egen annons.

**Underlaget.** Filer i PDF, Word (`.docx`), Excel (`.xlsx`, `.xlsm`) och text hämtas, högst 50 MB per fil. Ett
zip-arkiv packas upp, och de filer i det som går att läsa blir egna dokument med arkivets namn först
("11.4 Ritningar.zip › plan.pdf"), aldrig tolkade för sig; det i arkivet som inte går att läsa sägs på en rad. Bilder,
film och ritningar i andra format hoppas över, och står med namn och skäl på annonsen (`unread_files`), på
upphandlingssidan, i MCP-verktyget `hamta_upphandling` och i förteckningen modellen får. En fil hämtas igen när annonsen eller filen har
ändrats efter att vi sparade den. Samma innehåll sparas inte två gånger. Har e-Avrop publicerat en ny version under
samma namn blir den ett nytt dokument, och det gamla märks ersatt (`superseded_by`): bara aktuella dokument når
motorerna, sökningen, MCP och dokumentlistan, men raden finns kvar så att äldre checklistors källänkar fungerar.

**Huvuddokumentet** är det tolkningen startar från; tolkningen läser alla dokument
([beslut 0020](decisions/0020-checklistan-lases-ur-alla-dokument.md)), så valet avgör bara ordningen. Det väljs på
filnamnet, i den här ordningen:

1. administrativa föreskrifter
2. upphandlingsföreskrifter
3. förfrågningsunderlag
4. upphandlingsdokument
5. anbudsförfrågan
6. förfrågan
7. inbjudan
8. krav på leverantör
9. kravspecifikation

En PDF går före en Word-fil med samma namn. Matchar inget ord tas den första PDF:en, annars den första läsbara filen.
De andra filerna följer med som bilagor i tolkningen, går att söka i och läsa via MCP, och inköp kan be om en tolkning
med någon av dem som huvuddokument under Inköp › Att granska.

## e-Avrops egna dokument

Inköp skriver de flesta dokumenten inne i e-Avrop, som exporterar dem som PDF med en sidfot på varje sida: "Sundsvalls
kommun / Upphandling / titel / Dokument / namn / Diarienummer / nummer / Datum / datum" och sidnumret. Kravdokumenten
("Krav på Leverantör", "Kravspecifikation", "Pris och utvärdering", "Utvärderingsmodell") är dessutom elektroniska
formulär: efter varje krav kommer fälten leverantören fyller i på webben, och raden före en numrerad punkt anger
punktens typ i e-Avrop. Den 2026-10-13 var 25 av de 61 sparade dokumenten sådana exporter.

| I exporten | Betyder | Så hanteras det (`backend/src/anbudsklar/documents/eavrop_export.py`) |
|---|---|---|
| Sidfoten | Samma uppgifter på varje sida | Tas bort ur den sparade texten. Dokumentet märks `layout = eavrop` |
| `Kvalificeringskrav`, `Skakrav`, `Utvärderingskrav`, `Informationsfråga`, `Uteslutningsgrund` på egen rad | Typen på punkten som följer | Står kvar i texten. Modellen får en förklaring i förteckningen; den regelbaserade motorn hoppar över själva raden. En informationsfrågas text läses som annan text, eftersom det den ber om ska lämnas i anbudet |
| `1.3.1.1 Leverantören bekräftar att ovanstående krav uppfylls.` följt av `Ja` | Svarsfältet för kravet ovanför | Står kvar i texten. Modellen uppmanas citera kravets egen text; den regelbaserade motorn hoppar över raderna |
| `Ja`, `Nej`, `Svar`, `Kommentar`, `Ingen fil bifogad`, `Antal`, ett tal efter `Antal`, `Pris/…`, `SEK` | Fält leverantören fyller i | Som ovan |

Formulärraderna står kvar i den sparade texten därför att ett citat måste gå att hitta på sidan som läsaren ser den.
Sparade dokument får märkningen när jobbet `reextract_outdated` läser om dem.

## Frågor och svar

Leverantörernas frågor och inköps svar visas på annonsens publika sida i e-Avrop, utan inloggning och utan
frågeställarens namn. API:t har inget fält för dem, men när den första frågan kommer skriver e-Avrop fyra filer i
projektets `AnnouncementLogFiles`:

| Fil | Innehåll | Läses |
|---|---|---|
| `LoggfilOrginalFragor.txt` | Frågeloggen: varje fråga som den ställdes och som den publicerades, inköps svar och tidpunkter. Inga namn. Även meddelanden till de registrerade intressenterna | Ja |
| `frågor.txt`, `svar.txt`, `meddelanden.txt` | E-postloggar: frågeställarens namn, företag och e-post, listan över alla registrerade intressenter och handläggarens adress | Aldrig |
| `Loggfil<datum>.txt` | En ögonblicksbild av annonsen vid varje publicering, med handläggarens namn och e-post och det interna värdet | Aldrig |

Loggen är Windows-1252 och består av block med en rubrikrad var: `Orginal Fraga <tid>:`, `Besvarad Fraga <tid>:`
(utan tid tills frågan är besvarad), `Svar :` och `Meddelande <tid>:`. Jämfört med annonssidan 2026-10-12 på två
upphandlingar: de besvarade posterna är exakt det sidan visar, och obesvarade frågor visas inte där.

Så används den:

- **Bara besvarade frågor sparas**, i tabellen `published_answers`, med frågan som den publicerades, svaret och
  tidpunkterna. Obesvarade frågor och meddelanden sparas inte. Nyckeln är frågans ursprungliga lydelse och tid, så
  att ett redigerat svar uppdateras i stället för att sparas två gånger.
- **Loggen är sanningen.** Ett svar som inte längre står i loggen tas bort. En logg som inte går att hämta eller läsa
  ändrar ingenting och räknas som `answers_failed` i jobbets statistik.
- **Öppna upphandlingar läses varje körning.** Ett svar ändrar inte projektets `UpdatedDate`, så ändringskontrollen
  i steg 2 ovan skulle missa det. En TED-annons med underlag från e-Avrop läses med
  `/v1/procurements/by-procurement-id/{id}`.
- **Svaren visas för alla:** i steg 1 Krav som "Frågor och svar från inköp", i `GET /api/notices/{id}` (`published_answers`) och med MCP-verktyget
  `hamta_fragor_svar`. `hamta_upphandling` säger hur många svar som finns. Fråga AI och tolkningen läser dem
  ([beslut 0018](decisions/0018-publicerade-svar-i-ai-uppgifterna.md)).

Det här är inte dokumenterat av e-Avrop, och parsern är därför försiktig: en post som inte går att läsa hoppas över.
Det som inte kunnat verifieras är markerat `UNCERTAIN` i `eavrop_qa.py` och ska bekräftas med Antirio:

- om inköp kan svara enbart till frågeställaren, och om ett sådant svar i så fall hamnar i loggen
- om annonssidan visar meddelandena ("Meddelande") till de registrerade intressenterna
- om `by-procurement-id` fungerar för enskilda annonser (`SimpleProcurementProject`)
- om formatet och teckenkodningen är stabila

## Det som saknas

Det här ger API:t inte, eller inte tillförlitligt, men tjänsten hade behövt det. Listan är underlag för samtal med
Antirio och inköp.

| Saknas | Följd i dag | Önskemål |
|---|---|---|
| **En nyckel som bara läser publicerat** | Nyckeln läser sekretessbelagda uppgifter, och bara vår vitlista skyddar dem | En nyckel eller ett omfång som bara ger annonserade upphandlingar och annonsens dokument |
| **Tillförlitlig sekretessmarkering** | `IsClassified` saknades på utvärderingsprotokoll och kreditupplysningar | Att markeringen sätts, eller att arbetsfiler hålls helt utanför API:t |
| **Frågor och svar som fält** | Bara flaggan `IsQuestionsOnline`. Svaren läses ur en odokumenterad loggfil, se [Frågor och svar](#frågor-och-svar) | Publicerade frågor och svar per upphandling, med datum, som en del av API:t |
| **Kravmodulen som data** | Kravdokumenten är redan strukturerade i e-Avrop, men API:t ger bara PDF-utskriften, som tjänsten tolkar tillbaka till krav, typ och svarsfält, se [e-Avrops egna dokument](#e-avrops-egna-dokument) | Punkterna i kravmodulen med nummer, text, typ och svarstyp, så att ingen tolkning av utskriften behövs |
| **Vad som har ändrats** | Bara `UpdatedDate` på annonsen, och på enstaka filer. Rättelser syns inte som rättelser | En ändringslogg eller versioner av annonsen och dokumenten |
| **Besked om ändringar** | Listan filtreras bara på när projektet skapades, så alla projekt listas varje gång | Filtrering på ändringsdatum, eller webhooks |
| **Köpare per upphandling** | Alla e-Avrop-annonser får `ORGANIZATION_NAME`, även när kommunen köper åt ett bolag. Annonsens `Loggfil<datum>.txt` anger `Avtalstecknare`, men filen innehåller också handläggarens e-post och det interna värdet, så den läses inte | Köparens namn och organisationsnummer |
| **Delområden** | Bara flaggan `HasLots` | Delområdenas namn, CPV-koder och omfattning |
| **Planerade upphandlingar** | Listan "Planerade" på e-Avrops webbplats finns inte i API:t | Planerade upphandlingar med kvartal och CPV-koder |
| **Publicerat värde** | `Value` används inte, eftersom det kan vara internt | En markering av om värdet är publicerat |
| **Bolagens upphandlingar** | Inköp upphandlar en del åt bolagen, till exempel Mitthem, och de syns. Ett bolag med eget konto i e-Avrop syns troligen inte med kommunens nyckel | Besked om vilka konton nyckeln täcker, och nycklar per bolag om det behövs |

Det här är inte prövat ännu:

- **Enskilda annonser** (`/v1/simple-procurements/`). De finns i listan och hanteras som projekt, eftersom
  dokumentationen ger dem samma svar, men svaret är inte kontrollerat mot riktiga data.
- **Avtals-API:t**, som kan ersätta den påhittade avtalskatalogen.
