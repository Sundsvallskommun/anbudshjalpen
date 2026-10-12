# 0010: En accesskod skyddar testmiljön, och labbläget låter deltagare prova med sitt eget företag

- **Status:** Accepterat
- **Datum:** 2026-10-12
- **Gäller:** vem som når testmiljön, inloggningssidan, företagsprofiler som inte är demoföretag, och vad PoC:n får
  innehålla
- **Ersätter:** delar av [0007](0007-poc-login-persona-picker.md): regeln att PoC:n aldrig innehåller riktiga företag

## Sammanhang

Beslut 0007 säger att PoC:n bara innehåller påhittade företag, och att inloggningen är ett val av demoperson. Det
räcker för att visa resan, men inte för att svara på den fråga verksamheten vill ställa på workshoppen med
näringslivsenheten och inköp: *får mitt företag relevanta träffar?* Nu när annonserna och underlagen är riktiga (TED
och e-Avrop, [beslut 0009](0009-eavrop-projekt-api.md)) är det bara företaget som fattas.

Samtidigt gäller det som gjorde 0007 nödvändigt: det finns ingen riktig inloggning, ingen kontroll av vem som får
företräda ett företag, och ingen konsekvensbedömning för dataskydd. Dessutom kan vem som helst som når adressen
ställa frågor till AI-motorn utan att logga in, vilket kostar pengar och kan missbrukas så snart tjänsten ligger på
en publik adress.

## Beslut

**En accesskod skyddar hela testmiljön.** Med `ACCESS_CODE` satt visar webbappen bara sidan "Ange accesskoden"
tills besökaren skrivit koden, och varje API-väg utom `/api/config` och `/api/gate` svarar 401. Rätt kod ger en
kaka (`HttpOnly`, 30 dagar) vars värde är en HMAC av koden under sessionshemligheten: byts koden gäller ingen gammal
kaka. Felaktiga försök räknas per adress. `/health` och MCP-servern, som har egna nycklar, står utanför. Utan
`ACCESS_CODE` är tjänsten öppen, som i lokal utveckling och i testerna.

**Inloggningssidan får ett labbläge**, påslaget med `LAB_ENABLED=true` och bara bakom koden:

- **Den som kommit in** skapar ett företag med bara ett namn, beskriver verksamheten på profilsidan och ser vilka
  upphandlingar som verkar passa.
- **Inga personuppgifter.** Ingen tillfrågas om namn, e-post eller organisationsnummer. Användaren bakom företaget
  heter "Deltagare" och har en adress som inte går att nå (`lab-<id>@anbudsklar.local`), så påminnelser och mejl om
  träffar stannar i Mailpit. Formuläret och profilsidan säger att inget personligt eller hemligt ska skrivas in.
  Det som sparas är företagets egna ord om vad det gör, uppgifter som företaget självt väljer att lämna.
- **Företagen listas på inloggningssidan** under demopersonerna, som "Fortsätt som <företaget>". Så hittar
  deltagaren sitt företag igen på vilken enhet som helst, utan länkar att hålla reda på.
- **Allt raderas efter `LAB_RETENTION_DAYS`** (30 dagar) av jobbet `purge_lab`, med träffar och påminnelser. Inköp
  kan rensa tidigare med `anbudsklar lab purge`.
- Labbföretag är inte märkta Fiktiv. De är riktiga företags beskrivningar, men utan identitet.

Det starkaste alternativet till koden var grundläggande autentisering i Traefik, som [beslut 0007](0007-poc-login-persona-picker.md)
anvisar för inköparens roll. Den skyddar lika bra men ger en webbläsardialog i stället för en sida i tjänsten, och
den kan inte skilja på MCP-servern och resten utan egna regler per sökväg.

Det starkaste alternativet till labbföretagen var företag som bara finns i minnet under besöket. Då fungerar inte matchningen, som
sparar bedömningar per företag, och inte mejlen om nya träffar eller påminnelserna, alltså det deltagarna ska få
känna på. Riktiga konton med e-legitimation är fortfarande vägen till produktion, inte till en workshop.

## Konsekvenser

- Den som driftar testmiljön sätter `ACCESS_CODE` som en hemlighet och byter den efter träffen. Koden är en enkel
  spärr mot förbipasserande och mot att AI-motorn används av vem som helst, inte en inloggning: alla som har koden
  är lika. Utan koden finns labbläget inte: varken formuläret eller API-vägarna.
- Alla som är innanför koden kan öppna och ändra varandras testföretag. Det är avsiktligt enkelt: profilen innehåller
  varken personuppgifter eller hemligheter, och deltagarna sitter i samma rum. Den som vill ha egna, skyddade konton
  behöver den riktiga inloggningen.
- Företagets beskrivning skickas till AI-motorn för CPV-förslag och matchning, som demoföretagens. Med `openai`
  lämnar den kommunen; det står redan i "Om demon och AI".
- `AGENTS.md`:s regel "låt aldrig PoC:n hålla riktig företagsdata" gäller fortsatt för allt utom labbföretagens
  självbeskrivningar, och de gallras.
- Vad produktion kräver i inloggning och dataskydd står kvar i [Öppna frågor](../open-questions.md).
