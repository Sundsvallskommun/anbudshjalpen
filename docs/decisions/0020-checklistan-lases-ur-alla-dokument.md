# 0020: Checklistan tolkas ur alla dokument i upphandlingen, och det som inte lästs in syns

- **Status:** Accepterat
- **Datum:** 2026-10-13
- **Gäller:** vad `tolka_underlag` läser, hur citaten pekar, när en checklista tolkas om, vilka filer som hämtas och
  hur tjänsten säger vad den inte har läst
- **Ersätter:** konsekvensen i [beslut 0012](0012-fragor-mot-alla-dokument.md) att tolkningen bara läser
  huvuddokumentet

## Sammanhang

Granskningen av datahanteringen 2026-10-12 visade var information gick förlorad på vägen från källan till modellen:

- Checklistan tolkades ur ett enda dokument. Med e-Avrop har en upphandling flera: kravspecifikation och
  avtalsvillkor ligger ofta i egna filer, och de nådde aldrig checklistan. Matchningen och granskningen av utkast
  utgår från checklistan och ärvde luckan. Instruktionen sa att krav ofta står i bilagor, men modellen fick dem inte.
- Excel-filer hämtades inte, och ingen fick veta det. Prisbilagor och kravmatriser i Excel är vanliga.
- Text i Word-filers innehållskontroller, textrutor och fotnoter försvann vid textuttaget, liksom nästlade tabeller.
  Kommunala mallar håller diarienummer, datum och hela klausuler i innehållskontroller.
- En sida utan textlager blev tom utan besked. Modellen såg en sidmarkering utan text, och inköp fick inget veta.
- När e-Avrop publicerade en rättad fil sparades den som en ny rad, och den gamla låg kvar. Fråga AI skickade båda
  versionerna till modellen.
- e-Avrops eget datum för sista dag för frågor sparades men användes inte. Listor, Fråga AI och påminnelser läste i
  stället ett datum modellen plockat ut ur dokumentet.
- Ett för stort underlag och ett avhugget svar från modellen gav fel som såg ut som tillfälliga.
- Ett förbättrat textuttag nådde aldrig de underlag som redan var sparade.

## Beslut

**Tolkningen läser alla dokument.** `tolka_underlag` får ett `DocumentSet` som Fråga AI: huvuddokumentet först, sedan
övriga aktuella dokument, med samma paketbyggare och budget (`BUNDLE_BUDGET_CHARS`). Huvuddokumentet läses alltid
helt; ryms det inte ensamt stoppas tolkningen med ett tydligt fel till inköp, eftersom en halv checklista ur ett halvt
dokument inte får publiceras. Bilagor som inte ryms utelämnas och står som utelämnade i förteckningen modellen ser.
Citaten anger dokumentet (`document`), och kontrollen sätter `document_id` som för ett svar. Checklistan sparar vad
tolkningen läste (`verification.read`), och ursprungsraden visar det. Den heuristiska motorn läser alla dokument på
samma sätt.

**Det som inte lästs in syns.** Insamlaren från e-Avrop hämtar alla format textuttaget läser, nu även Excel
(`.xlsx`, `.xlsm`). Filer i andra format, för stora filer och filer som inte går att läsa sparas på annonsen som
`unread_files` med skälet, och visas på upphandlingssidan, i MCP-verktyget `hamta_upphandling` och i förteckningen som
modellen får. En sida utan läsbar text räknas (`empty_pages`), visas vid dokumentet och säger till modellen att den
saknar text.

**Word läses ur XML:et.** Innehållskontroller, textrutor, fotnoter och nästlade tabeller tas med; den borttagna sidan
av en spårad ändring och reservkopian av en ritning tas inte med.

**En ersatt fil pekas ut.** Publicerar e-Avrop en ny version under samma namn blir den ett nytt dokument, och det
gamla märks `superseded_by`. Bara aktuella dokument når motorerna, sökningen, MCP och dokumentlistan. Raden och
sidorna finns kvar, så att en äldre checklistas källänkar fungerar.

**Källans datum går före modellens.** `question_deadline_at` på annonsen sätts av insamlaren (e-Avrops `LastQuestion`)
och används först i listor, Fråga AI och påminnelser; checklistans frågestopp är reserv. Motorerna får datumet i
annonsblocket.

**En checklista tolkas om när underlaget ändras,** som när inköps svar ändras (beslut 0018): checklistan sparar ett
fingeravtryck av dokumenten och deras uttagsversion (`documents_digest`). Jobbet `interpret_pending` tolkar om öppna
upphandlingar där en fil tillkommit, ersatts eller lästs om, med samma regler för utkast, godkända och avvisade
checklistor. En checklista från före beslutet räknas som inaktuell när upphandlingen har fler aktuella dokument än det
den tolkades ur.

**Textuttaget har en version.** Varje dokument sparar `extraction_version`. Jobbet `reextract_outdated` läser om de
sparade filerna med det nya uttaget, några per körning, och fingeravtrycket ser till att checklistan tolkas om.

**Avhuggna svar och för stora underlag är slutgiltiga fel.** Motorn `openai` läser varför svaret slutade och ger ett
slutgiltigt fel när det höggs av, i stället för att be om en rättelse som huggs av igen. Ett huvuddokument som inte
ryms i budgeten stoppas före anropet.

**TED:s beskrivning tar med alla delområden** när förfarandet saknar egen beskrivning.

Det starkaste alternativet för checklistan var att tolka varje dokument för sig och slå ihop listorna. Det hade
klarat större underlag, men dubblerat krav som står i flera dokument och gjort citatkontrollen och granskningen
svårare. Budgeten räcker för upphandlingarna som mättes i beslut 0012, och ett underlag som inte ryms stoppas i stället
för att läsas till hälften.

Matchningen läser fortfarande bara annonsens text för ordregeln, inte dokumenten: ett långt underlag innehåller nästan
alla ord, så regeln skulle släppa fram det mesta. CPV-koderna är den bärande signalen.

## Konsekvenser

- Första körningen av `interpret_pending` efter uppdateringen tolkar om varje öppen upphandling som har fler aktuella
  dokument än checklistan lästes ur, fem i taget. Med granskningen på blir det ett nytt utkast för inköp per
  upphandling. `reextract_outdated` läser om alla sparade filer, tjugo per körning, och utlöser nya tolkningar där
  texten ändrades.
- Instruktionen för `tolka_underlag` har ändrats: kör `anbudsklar eneo provision`.
- Migreringen `d7f3b9c2e1a4` lägger till kolumnerna. `openpyxl` är ett nytt beroende.
- Ett e-Avrop-projekt utan en fil som matchar orden för huvuddokument tolkas nu ändå, med den första PDF:en som
  huvuddokument: tolkningen läser alla dokument, så valet avgör bara ordningen.
- Webbappen visar filer som inte lästs in, sidor utan text och vad tolkningen läste. `frontend/src/api/types.ts`
  speglar de nya fälten.
- Nya tester i `backend/tests/documents/`, `backend/tests/services/test_jobs.py`,
  `backend/tests/services/test_documents.py`, `backend/tests/ingest/` och `backend/tests/api/`.
