# 0014: AI-stödet är en panel som följer läsaren, och samtalet går att spara som PDF

- **Status:** Accepterat
- **Datum:** 2026-10-12
- **Gäller:** var företagaren ställer frågor till AI-stödet, hur ett samtal följer med mellan sidorna och hur det
  exporteras
- **Ersätter:** steg 2 Fråga som ett eget steg på upphandlingens sida i [målbilden](../direction.md), avsnitt 2 och 4

## Sammanhang

Upphandlingens sida hade fyra steg, och frågorna till AI-stödet bodde i steg 2. Den som undrade något i steg 1 eller
3 skickades dit, Regelhjälpen var en egen sida med en egen tråd, och ett samtal försvann när man lämnade sidan. Inför
demon med näringslivsenheten och inköp 2026-10-14 ville vi att stödet ska gå att öppna varifrån som helst, med en
fråga ifylld ("Fråga om kravet"), och att man ska kunna ta med sig det man frågat och fått svar på som en PDF.

Eneos egna widgets är inte släppta, och de är anonyma utan verktyg eller MCP ([Eneos byggstenar](../eneo-building-blocks.md)).
En sådan widget skulle gå förbi `AiEngine`, citatkontrollen och reservmotorerna, så svaren vore inte längre
spårbara till sida i underlaget. Appens CSP tillåter dessutom bara egna skript. Astryx har däremot en hel chattfamilj:
meddelandelista, bubblor, skrivfält, dialog och bottenark.

## Beslut

**AI-stödet är panelen "Fråga AI"**, byggd av Astryx komponenter: `Dialog` dockad i slutet av vyn på bredare skärmar
och `BottomSheet` på telefon, med `ChatMessageList`, `ChatMessage` och `ChatComposer` för samtalet och en
`SegmentedControl` för vad frågan gäller, underlaget eller reglerna. Svarskorten är desamma som förut, med citat,
"Står i underlaget" och rutan om likabehandling. Knappen "Fråga AI" följer läsaren på varje sida bakom dörren; den är
appens enda flytande kontroll och placeras av en liten stilmodul.

**Samtalen följer med.** Ett samtal per ämne, upphandling eller regler, sparas i webbläsarens sessionslagring, så det
finns kvar mellan sidorna och efter en omladdning i samma flik. Bara frågan lämnar webbläsaren, som förut, med de
senaste svaren som historik. "Rensa samtalet" tar bort det.

**Ingångarna öppnar panelen:** "Ställ en fråga" i steg 1, "Fråga om kravet" i Granska (med frågan ifylld, också via
adressen `?fraga=` i en ny flik), "Fråga underlaget" på en upphandling utan checklista och knappen själv. Den gamla
adressen `?flik=fraga` öppnar panelen.

**Steg 2 försvinner.** Stegen är 1 Krav, 2 Granska och 3 Lämna in. Inköps publicerade svar ([beslut 0013](0013-fragor-och-svar-fran-eavrop.md))
står i steg 1, och under kortet för en upphandling utan checklista. Panelens inledning säger vad svaren bygger på och
när sista dag för frågor är.

**Exporten är en utskriftsvy**, `/fraga-ai/utskrift`, utanför ramen: ämnet, datum, att svaren är automatiskt
framtagna och inte granskade av inköp, och varje fråga med svar, citat med sida eller paragrafer. Knappen "Skriv ut
eller spara som PDF" använder webbläsarens egen utskrift. Inget skickas till servern, och inget sparas.

Det starkaste alternativet var Eneos widget, av skälen ovan. En PDF gjord på servern valdes bort: samtalet finns bara i
webbläsaren, och ett anrop till skulle ge samma dokument för mer kod.

## Konsekvenser

- Regelhjälpens sida finns kvar och använder samma anrop som panelens regelläge. Den kan tas bort när panelen har
  visat sig räcka.
- Tillgänglighetsgatens tillstånd för steg 2 blev panelen. Källdialogen kan öppnas ovanpå panelen, som är en modal
  dialog; att det fungerar i alla webbläsare är inte verifierat och ska prövas i gaten.
- Sessionslagringen är flikens egen: ett samtal följer inte med till en ny flik, och försvinner när fliken stängs.
- Dokumentationen följer: [Design](../design.md) och [PoC](../poc.md). Målbilden skrivs inte om.
