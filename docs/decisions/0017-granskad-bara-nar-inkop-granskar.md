# 0017: Ordet "granskad" i annonslistorna visas bara när inköp granskar checklistor

- **Status:** Accepterat
- **Datum:** 2026-10-12
- **Gäller:** hur annonser, passformen och kortet utan checklista talar om checklistan när granskningen är av
- **Ersätter:** att annonserna märks "Checklista, inte granskad" när granskningen är av, i
  [beslut 0011](0011-installningar-granskning-valfri.md)

## Sammanhang

När inköp slår av granskningen (beslut 0011) publiceras varje tolkning direkt. Då märktes varje annons med checklista
"Checklista, inte granskad", och kortet utan checklista hette "Ingen granskad checklista ännu". Men när ingen
checklista granskas skiljer ordet inte ut någon annons från någon annan: det upprepar bara inställningen, på varje
rad. Det lovar också en granskning som inte kommer.

## Beslut

**Medan granskningen är av säger annonserna bara "Checklista"**, en grå token, för alla publicerade checklistor.
Kortet utan checklista heter "Ingen checklista ännu" (eller "Ingen checklista" när upphandlingen är avslutad), och
passformens extra skäl säger "Det finns ingen checklista att jämföra med". Inköparens kort säger att en tolkning
publiceras direkt, inte att den väntar på granskning.

**Medan granskningen är på gäller beslut 0011 som förut:** "Granskad checklista" i grönt, och "Checklista, inte
granskad" i grått för en checklista som publicerades när granskningen var av.

**I checklistan själv står granskningen kvar.** Ursprungsraden säger "Automatiskt framtagen · inte granskad av inköp"
eller "Granskad och publicerad av inköp" efter checklistans eget `reviewed`, så den som läser listan ser alltid om
inköp har granskat den.

Inställningen når alla besökare genom `review_required` i `/api/config`. Det starkaste alternativet var att märka
efter varje annons `checklist_reviewed` och ta bort ordet bara för ogranskade. Då står "Granskad checklista" kvar på
äldre annonser medan granskningen är av, och kortet utan checklista kan ändå inte veta vad det ska lova.

## Konsekvenser

- Gränssnittet kallar fortfarande aldrig en ogranskad checklista granskad.
- Slås granskningen på igen märks annonserna efter varje checklistas `reviewed`, så de som publicerades medan den var
  av säger "Checklista, inte granskad".
- `/api/config` har fältet `review_required`. Det är ett tillägg i REST-kontraktet; MCP-servern påverkas inte.
