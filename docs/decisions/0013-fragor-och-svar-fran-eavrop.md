# 0013: Inköps publicerade svar på leverantörernas frågor hämtas från e-Avrops frågelogg

- **Status:** Accepterat
- **Datum:** 2026-10-12
- **Gäller:** vad insamlaren läser från e-Avrop utöver annonsens dokument, vad som sparas av frågor och svar, och
  var de visas
- **Ersätter:** delar av [0009](0009-eavrop-projekt-api.md): att bara annonsens dokument hämtas, och bara från
  adressen `/v1/announcement-documents/`

## Sammanhang

Under anbudstiden ställer leverantörerna frågor i e-Avrop, och inköp svarar där så att alla ser samma svar.
Frågorna uppstår där underlaget är otydligt, och svaren ändrar ofta kraven: i en snöröjningsupphandling i oktober
2026 blev prisposten "Pris/Enhet" efter en fråga "SEK/timme", och prisbilagan byttes ut. Den som läser bara
underlaget läser alltså fel. Svaren visas på annonsens publika sida i e-Avrop, utan inloggning och utan att säga vem
som frågade.

e-Avrops Projekt-API har inget fält för dem. Dokumentationen stannar vid flaggan `IsQuestionsOnline`, och
[e-Avrops API](../eavrop.md) förde upp frågor och svar som något API:t saknar. Men varje projekt har listan
`AnnouncementLogFiles`, och när den första frågan kommer skriver e-Avrop fyra filer där. Kontrollerat med kommunens
nyckel 2026-10-12:

- `LoggfilOrginalFragor.txt` är frågeloggen: varje fråga som den ställdes, som den publicerades och inköps svar, med
  tidpunkter. Inga namn, företag eller adresser. De besvarade posterna är exakt det annonssidan visar för alla, och
  obesvarade frågor visas inte där. Två annonser jämfördes: fyra besvarade av fyra, och fyra besvarade av tio.
- `frågor.txt`, `svar.txt` och `meddelanden.txt` är e-postloggar med frågeställarens namn, företag och e-post,
  listan över alla registrerade intressenter och handläggarens adress. Vem som frågar under anbudstiden omfattas av
  anbudssekretessen.
- Ett svar ändrar inte projektets `UpdatedDate` i listan, så insamlarens ändringskontroll missar varje nytt svar.
- Filen är en logg skriven för människor, i Windows-1252, inte ett API-kontrakt.

## Beslut

**Insamlaren läser frågeloggen och bara den.** Av annonsens loggfiler hämtas `LoggfilOrginalFragor.txt`, efter exakt
filnamn, och bara från adressen `/v1/announcements/{id}/log-documents`. E-postloggarna hämtas aldrig, och testerna
visar att de inte hämtas. Loggen läses för varje öppen upphandling vid varje körning, oavsett om projektet ändrats,
eftersom ett svar inte syns som en ändring.

**Bara besvarade frågor sparas**, i tabellen `published_answers`: frågan som den publicerades, svaret och
tidpunkterna. Obesvarade frågor och meddelanden sparas inte, och vem som frågade finns inte i det vi läser. Loggen är
sanningen: ett redigerat svar uppdateras och ett borttaget tas bort, så att appen aldrig visar något e-Avrop har
dragit tillbaka. En logg som inte går att hämta eller läsa ändrar ingenting och räknas i jobbets statistik.

**Svaren är offentliga och visas för alla:** i steg 2 Fråga före den egna tråden, i `GET /api/notices/{id}`
(`published_answers`) och via MCP-verktyget `hamta_fragor_svar`, med en rad i `hamta_upphandling` som säger hur många
svar som finns. Samma rader överallt, och aldrig vem som frågade.

**Parsern är defensiv.** Formatet är observerat, inte dokumenterat: en post som inte går att läsa hoppas över och
loggas, och det vi inte kunnat verifiera är markerat `UNCERTAIN` i `backend/src/anbudsklar/ingest/eavrop_qa.py`.
Det ska bekräftas med Antirio ([öppna frågor](../open-questions.md)).

Det starkaste alternativet var att läsa annonsens publika sida, där svaren finns för alla. e-Avrops `robots.txt`
förbjuder det, och sidan är HTML som måste tolkas. Att vänta på ett fält i API:t valdes också bort: svaren behövs
nu, och loggen ger samma innehåll som sidan.

## Konsekvenser

- Företagen ser inköps svar bredvid underlaget, och Eneos assistenter kan läsa dem innan de kallar underlaget
  otydligt. Likabehandlingen påverkas inte: det är samma svar som alla redan får i e-Avrop.
- AI-uppgifterna `besvara_fraga` och `tolka_underlag` läser inte svaren ännu. Ett publicerat svar hör till underlaget
  och borde gå före dokumentets text; det är nästa steg, efter [beslut 0012](0012-fragor-mot-alla-dokument.md) som
  samtidigt gjorde om vad `besvara_fraga` läser. Inköps sida Företagens frågor visar dem inte heller ännu.
- Ändrar e-Avrop loggens format slutar nya svar komma in, utan att gamla försvinner: jobbet räknar `answers_failed`
  och testerna med syntetiska loggar visar vad parsern tål. Formatet och användningen ska bekräftas med Antirio, och
  det bästa vore ett fält i API:t.
- Det som visas följer e-Avrop med ett dygns fördröjning, eftersom jobbet körs en gång om dagen. Ett svar som kommer
  dagen före sista anbudsdag kan därför saknas; den som har bråttom hänvisas till e-Avrop.
- Nyckeln läser fortfarande allt, och vitlistan är fortfarande skyddet. Ändringar i `eavrop_qa.py` kräver tester
  som visar att e-postloggarna aldrig hämtas och att obesvarade frågor aldrig sparas.
