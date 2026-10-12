# 0007: Inloggningen i PoC:n är ett val av demoperson

- **Status:** Accepterat, delvis ersatt av [0010](0010-labblage-egna-foretag.md) (labbföretag) och
  [0011](0011-installningar-granskning-valfri.md) (granskningen går att slå av)
- **Datum:** 2026-10-05
- **Gäller:** inloggning och roller i PoC:n, och vad som krävs i produktion

## Sammanhang

PoC:n visas med påhittade företag. Demoresan behöver ändå två roller: en företagare som har profil, bevakning och
påminnelser, och en inköpare som godkänner checklistor.

Riktig inloggning för företag kräver e-legitimation och en kontroll av att personen får företräda företaget. Det är ett
eget projekt, och Eneo har ingen identitet för externa användare. Se [Arkitektur](../architecture.md).

## Beslut

Inloggningssidan i PoC:n låter besökaren välja en demoperson. Sidan är märkt "Demo".

| Demoperson | Roll | Ser |
|---|---|---|
| Anna Berg, Målerifirman i Matfors AB (påhittad) | `foretagare` | Egen profil, bevakning, granskning av utkast och påminnelser |
| Lars Holm, Inköp Sundsvalls kommun (påhittad) | `inkopare` | Checklistor att granska och publicera, sammanställda frågor och jobb |

- Valet ger en sessionscookie med ett slumpat värde som bara servern kan tolka. Cookien är `HttpOnly` och
  `SameSite=Lax`, och `Secure` när appen körs över https.
- Den som inte loggar in kan se annonser och publicerade checklistor och ställa frågor om ett underlag.
- Det finns inga lösenord. Varje ändrande anrop måste komma från appens eget ursprung.
- Koden och gränssnittet markerar inloggningen som en förenkling som bara gäller PoC:n.

I produktion loggar företagare in med kommunens lösning för e-legitimation. Appen kontrollerar sedan att personen får
företräda företaget, till exempel som firmatecknare eller med fullmakt, innan företagets data visas. Inköpare loggar
in med sitt kommunkonto.

Det starkaste alternativet var ingen inloggning alls. Då går det inte att visa profil, bevakning, påminnelser eller
inköparens vy.

Användarnamn och lösenord valdes bort. Det ger ett sken av säkerhet, kräver lösenordshantering och är ändå inte vägen
till produktion.

## Konsekvenser

- PoC:n får aldrig innehålla riktiga företag eller personuppgifter. Alla företag och personer i demodata är påhittade
  och märkta.
- Demomiljön visar alltid att den är en demo och får inte presenteras som en riktig tjänst.
- Inköparens godkännande är spärren för vad företagen och Eneos assistenter läser som granskat av inköp. I en delad
  miljö (`ENVIRONMENT=production`, som testmiljön i Dokploy) får rollen därför inte vara öppen för alla besökare:
  inköparens demoperson döljs på inloggningssidan och nekas vid inloggning, också för en session som redan finns.
  En operatör kan slå på den med `DEMO_BUYER_ENABLED=true`, men bara bakom grundläggande autentisering eller en
  IP-spärr i Traefik. `DEMO_BUYER_ENABLED=false` stänger av den även lokalt. Se [Drift](../operations.md#miljövariabler).
- Produktion kräver en lösning för e-legitimation och behörighet, och en konsekvensbedömning för dataskydd. Det står
  i [Öppna frågor](../open-questions.md).
