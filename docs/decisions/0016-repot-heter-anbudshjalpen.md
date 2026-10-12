# 0016: Repot på GitHub heter anbudshjalpen

- **Status:** Accepterat
- **Datum:** 2026-10-12
- **Gäller:** repots namn och adress på GitHub
- **Ersätter:** att repot behåller namnet anbudsklar, i [beslut 0015](0015-namnet-anbudshjalpen.md)

## Sammanhang

Tjänsten bytte namn till Anbudshjälpen i beslut 0015, men repot hette fortfarande `anbudsklar`. Repot är publikt och
det första många ser av tjänsten, så namnet ska stämma. Till skillnad från paketet och Eneo-spacet går repot att byta
namn på utan att något annat system måste sättas upp igen: GitHub skickar vidare från den gamla adressen.

## Beslut

**Repot heter `Sundsvallskommun/anbudshjalpen`**, utan ä, eftersom webbadresser och git-kommandon klarar sig bäst med
ASCII. Länkarna i README, CONTRIBUTING och ärendemallarna pekar på den nya adressen.

Python-paketet och kommandot `anbudsklar`, Compose-tjänsterna, Eneo-spacet och MCP-servern behåller sina namn, som
beslut 0015 säger.

## Konsekvenser

- GitHub skickar vidare länkar, kloner och push från `Sundsvallskommun/anbudsklar`. Omdirigeringen försvinner om
  någon skapar ett nytt repo med det namnet i organisationen, så det namnet ska inte användas igen.
- Den som har en lokal klon kan peka om den: `git remote set-url origin git@github.com:Sundsvallskommun/anbudshjalpen.git`.
- Dokploy bygger testmiljön från repot. Pekar Dokploy ut repot med namn via sin GitHub-koppling väljs repot på nytt
  där, annars misslyckas nästa driftsättning.
