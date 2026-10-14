# 0023: Inköp ser vilka företag som verkar kunna svara på ett tänkt uppdrag

- **Status:** Accepterat
- **Datum:** 2026-10-14
- **Gäller:** fliken Möjliga anbudsgivare under Inköp, vilka regler som avgör vilka företag som listas, vad inköp får
  se av ett företag och hur likabehandlingen hålls

## Sammanhang

Matchningen går åt ett håll: från företagets profil till annonserna som verkar passa. Inköp har haft nytta av det
omvända, redan innan en upphandling finns: finns det företag i Anbudshjälpen som kan svara på det vi tänker upphandla,
hur många, och hur små? Det är frågan inför en marknadsanalys, ett beslut att dela upp en upphandling i delar eller en
inbjudan till leverantörsdialog, och inköpsstrategin säger att kommunen ska ta tillvara småföretagens konkurrenskraft
och sänka trösklarna ([beslut 0022](0022-kommunens-styrdokument-som-kalla.md), avsnitt 5.3 i strategin). Samtidigt
är företagens profiler företagens egna, inköp får aldrig se vilket företag som frågade vad, och listan får inte bli en
väg att gynna någon leverantör.

## Beslut

- **En flik under Inköp, Möjliga anbudsgivare.** Inköp beskriver ett uppdrag som kan bli en upphandling med rubrik,
  några rader och CPV-koder, eller utgår från ett avtal i katalogen som snart ska upphandlas igen (kommande
  upphandlingar, som fyller i fälten), och får en lista över företag som verkar kunna svara, med skälet för varje.
- **Samma fasta regler som matchningens förfilter, lästa åt andra hållet, och inget AI-anrop.** Ett företag listas när
  det delar CPV-grupp med uppdraget (tre siffror, eller en bredare kod hos företaget som täcker uppdragets), eller när
  minst två ord ur företagets egen beskrivning förekommer i uppdragets text. Närmast kod först, sedan flest gemensamma
  ord. Orden jämförs på ordstam i Python eftersom företagen är få; annonsernas fulltextindex behövs inte. Ingen
  bedömning sparas: listan räknas fram ur profilerna som de är just då.
- **Inköp ser bara det matchningen läser.** Namn, CPV-koder med benämningar, kommuner, antal anställda och de ord i
  beskrivningen som uppdraget delar. Aldrig beskrivningen i sin helhet, omsättningen, försäkringen eller referenserna.
  Testföretag från labbläget ([beslut 0010](0010-labblage-egna-foretag.md)) listas märkta Testföretag, och påhittade
  företag märkta Fiktiv. Företagen ser inte listan, och inget i den sparas.
- **Likabehandlingen sägs i vyn.** Texten ovanför formuläret säger att listan är underlag för marknadsanalys och
  leverantörsdialog, att den ger ingen förtur och att det som gäller upphandlingen går till alla via e-Avrop.

Det starkaste alternativet var att låta motorn bedöma varje företag mot uppdraget, som matchningen gör mot en annons.
Det valdes bort: utan annons och checklista finns inget att citera, bedömningen skulle kosta ett anrop per företag,
och frågan inköp ställer är "finns det några" snarare än "hur väl passar var och en". Att visa företagens
matchningar mot befintliga annonser valdes också bort, eftersom de träffarna är företagens egna, med avfärdanden och
mejl, och inte svarar på frågan om ett uppdrag som inte finns än.

## Konsekvenser

- Nytt anrop `POST /api/admin/suppliers/search`, bara för inköparens demoperson, i `services/suppliers.py`. Inget
  schema i databasen ändras, och MCP-servern berörs inte: företagsdata exponeras fortsatt aldrig via MCP.
- Ändras förfiltrets regler i `services/matching.py` ska `services/suppliers.py` följa med, så att inköps lista och
  företagens träffar bygger på samma regler.
- Om företagens profiler ska visas för inköp i produktion är en fråga för juristen, se
  [Öppna frågor](../open-questions.md).
