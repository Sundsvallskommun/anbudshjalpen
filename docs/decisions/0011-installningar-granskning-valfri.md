# 0011: Inköp styr inställningar i tjänsten, och granskningen före publicering går att slå av

- **Status:** Accepterat
- **Datum:** 2026-10-12
- **Gäller:** var inställningar som verksamheten äger ligger, och om checklistor måste granskas innan företagen ser dem
- **Ersätter:** delar av [0007](0007-poc-login-persona-picker.md): att inköparens godkännande alltid är spärren

## Sammanhang

Sedan start visas en checklista för företagen först när inköp har godkänt och publicerat den. Det ger kvalitet, men
kostar inköps tid per upphandling, och frågan om det är värt det står bland de [öppna frågorna](../open-questions.md).
Nu när riktiga underlag kommer in från e-Avrop ([beslut 0009](0009-eavrop-projekt-api.md)) väntar tolv utkast på
granskning, och ingen av dem syns för företagen. Verksamheten vill kunna pröva båda sätten, utan att någon behöver
ändra miljövariabler och starta om.

## Beslut

**Inställningar som verksamheten äger ligger i databasen** (tabellen `app_settings`, en rad per inställning med
JSON-värde) och ändras på sidan Inställningar i inköps kontomeny. Miljövariablerna förblir driftens: adresser, nycklar
och vad som är påslaget i en miljö. En inställning som saknas har sitt standardvärde, så en ny inställning kräver
ingen dataflytt.

**Den första inställningen är "Inköp granskar checklistor innan de publiceras"**, påslagen som standard:

- **På:** som förut. En tolkning blir ett utkast, inköp godkänner och publicerar, och först då ser företagen och
  MCP-servern den.
- **Av:** en tolkning publiceras direkt när den är klar, utan `approved_at`. Appen säger då "Automatiskt framtagen ·
  inte granskad av inköp" i stället för "Granskad och publicerad av inköp", och annonserna märks "Checklista, inte
  granskad" i stället för "Granskad checklista". Utkast och godkända checklistor som väntar publiceras när
  inställningen slås av; avvisade och tillbakadragna rör inte inställningen. Inköp kan fortfarande dra tillbaka,
  rätta och publicera igen.

Det starkaste alternativet var en miljövariabel. Den kräver drift och omstart för att byta, och verksamheten ska kunna
pröva på en workshop utan att någon kör kommandon.

## Konsekvenser

- Den som läser en checklista måste kunna se om inköp har granskat den. Därför bär varje checklista `reviewed`, och
  varje annons `checklist_reviewed`, och orden i gränssnittet följer dem. Ett automatiskt publicerat fel kan annars
  uppfattas som kommunens besked.
- Utan granskning gäller kvalitetstestets siffror rakt av: tolkningen hittade 95 % av kraven på de påhittade
  underlagen och missade bland annat F-skatt. Företagen får veta att listan är ett stöd och att underlaget gäller.
- MCP-servern visar publicerade checklistor oavsett inställning. Eneos assistenter får samma märkning i texten.
- Inställningen är global, inte per upphandling. Vill inköp granska en enskild checklista slår de på granskningen,
  eller drar tillbaka den checklistan.
