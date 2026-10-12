# 0015: Tjänsten heter Anbudshjälpen och får märket Toppen, och de tekniska namnen behåller anbudsklar

- **Status:** Accepterat, för repots namn ersatt av [0016](0016-repot-heter-anbudshjalpen.md)
- **Datum:** 2026-10-12
- **Gäller:** tjänstens namn och logomärke i webbappen, mejlen, AI-uppgifternas instruktioner och dokumentationen,
  och vilka tekniska namn som inte byts

## Sammanhang

PoC:n byggdes under namnet Anbudsklar. Namnet säger inte direkt vad tjänsten gör, och det låter mer som en
kommersiell produkt än som ett stöd från kommunen. Tjänsten har redan Regelhjälpen, och ett namn i samma form gör
det tydligt att delarna hör ihop.

Namnet finns också i tekniska identiteter som andra system känner igen. Eneo-spacet "Anbudsklar (PoC)" och
assistenterna hittas på namnet av `anbudsklar eneo provision`, och MCP-serverns namn `anbudsklar_poc` härleds från
spacets namn. Ett nytt namn där skulle skapa ett nytt space och en ny MCP-server, som Eneo måste synka och godkänna,
två dagar före demon 2026-10-14.

## Beslut

**Tjänsten heter Anbudshjälpen.** Namnet står i toppnaven, foten, webbläsarfliken, manifestet, mejlen, felmeddelandena,
AI-uppgifternas grundregler och dokumentationen. Webbförfrågningar till TED och e-Avrop identifierar sig som
`Anbudshjalpen-PoC/0.1`, eftersom HTTP-huvuden bara får innehålla ASCII.

**Märket är Toppen:** två vinklar i varandra som bildar ett A och pekar uppåt, vitt och klarblått (#4C82FF) på en
nästan svart ruta (#0B1220). Det ersätter Gnistan, en pratbubbla med bock och en gul AI-gnista. Bock, dokument och
pratbubbla är vanliga symboler som många tjänster använder, och vi ville ha ett abstrakt märke med en modernare och
mer teknisk känsla. Märket ritas i `frontend/public/favicon.svg`, och `npm run icons` bygger de andra ikonerna från
den filen.

**De tekniska namnen behåller anbudsklar:** repot, Python-paketet och kommandot `anbudsklar`, Compose-tjänsterna,
miljöfilerna, databasen, adresserna, Eneo-spacet "Anbudsklar (PoC)", MCP-servern `anbudsklar_poc` och standardnamnen
för Eneo-testinstansens tenant och admin. De fiktiva underlagen i `data/fixtures` nämner också Anbudsklar, eftersom
PDF-filerna och kvalitetstestet bygger på dem.

Det starkaste alternativet var att byta allt på en gång. Det valdes bort eftersom det kräver ett nytt space och en ny
MCP-registrering i Eneo, nya Compose-namn i Dokploy och nya fixtures, och inget av det syns för användaren.

## Konsekvenser

- Användare och partner ser bara Anbudshjälpen och det nya märket.
- Efter driftsättningen körs `anbudsklar eneo provision` igen, så att assistenterna får grundreglerna med det nya
  namnet.
- Skärmbilderna i `docs/assets/` visar det gamla namnet tills de tas om.
- Ett byte av de tekniska namnen blir ett eget beslut, med ett nytt space och en ny MCP-registrering i Eneo.
