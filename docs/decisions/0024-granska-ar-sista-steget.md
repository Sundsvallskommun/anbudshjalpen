# 0024: Granska är upphandlingens sista steg, och steget Lämna in tas bort

- **Status:** Accepterat
- **Datum:** 2026-10-14
- **Gäller:** hur många steg upphandlingens sida har, var länken till e-Avrop står och vad den gamla adressen
  `?flik=inlamning` gör
- **Ersätter:** stegens antal och namn i [0014](0014-fraga-ai-panel.md) ("Stegen är 1 Krav, 2 Granska och 3 Lämna
  in") och steg 4 Lämna in i [målbilden](../direction.md), avsnitt 2 och 4

## Sammanhang

Upphandlingens sida hade tre steg: 1 Krav, 2 Granska och 3 Lämna in. Det sista steget var en lista att bocka av med
varje skall- och kvalificeringskrav och varje bilaga, där det granskningen hade hittat i utkastet var förbockat och
märkt "Granskat", en framstegsstapel och sist kortet "Lämna anbudet" med sista anbudsdag och länken till e-Avrop.
Bockarna sparades bara i webbläsaren.

Listan sa inget nytt. Kraven stod redan i steg 1, och vad utkastet uppfyllde sa granskningen i steg 2, krav för krav.
Steg 3 visade alltså samma krav en tredje gång, nu som kryssrutor, och den som inte hade granskat något utkast fick en
tom lista att bocka av för hand. Det enda som steget tillförde var kortet med länken till e-Avrop. Vid genomgången
2026-10-14 bedömdes steget som överflödigt: Granska är det sista företagaren gör i Anbudshjälpen innan anbudet lämnas i
e-Avrop.

## Beslut

- **Upphandlingens sida har två steg, 1 Krav och 2 Granska.** Stegraden, telefonens flikar och gate-lägena följer
  med. Granska slutar med kortet "Lämna anbudet", med samma innehåll som förut: sista anbudsdag (i ett selektivt
  förfarande först anbudsansökan senast annonsens datum, och sista anbudsdag ur checklistan), att ett sent anbud inte
  prövas, och länken dit anbudet lämnas enligt samma regel som frågorna (upphandlingen i e-Avrop när annonsen länkar
  dit, annonsens egen sida när den inte är TED:s, annars kommunens sida i e-Avrop). En påhittad upphandling säger att
  den inte finns i e-Avrop.
- **En primärknapp per vy.** Länken i "Lämna anbudet" är primärknapp bara efter en granskning utan något att åtgärda.
  Innan dess har uppladdningen sin, och efter en granskning med luckor kommer kortet "Nästa steg" med "Granska en ny
  version" före "Lämna anbudet".
- **Den gamla adressen lever kvar.** `?flik=inlamning` öppnar Granska, så länkar och bokmärken från före beslutet
  leder rätt. Bockarna som sparades i webbläsaren läses inte längre; de kan ligga kvar där utan att något händer.

Det starkaste alternativet var att behålla steget med bara kortet "Lämna anbudet", så att resan slutar i ett eget
steg. Ett steg med ett enda kort är ett tomt steg, och kortet säger samma sak var det än står. Att i stället flytta
in kryssrutorna i Granska valdes också bort: det är upprepningen, inte placeringen, som var problemet.

## Konsekvenser

- Mappen `frontend/src/pages/notice/steps/submit/` är borta, och kortet lever i `steps/review/HandInCard.tsx`.
  Gate-läget `upphandling-inlamning` är borttaget.
- [Målbilden](../direction.md) beskriver fortfarande fyra steg; den är daterad och skrivs inte om. Design, PoC och
  README beskriver två.
- Om en sista kontroll före inlämningen visar sig behövas är den rätta platsen granskningsresultatet, som redan säger
  vad som bör åtgärdas, kontrolleras eller ser bra ut.
