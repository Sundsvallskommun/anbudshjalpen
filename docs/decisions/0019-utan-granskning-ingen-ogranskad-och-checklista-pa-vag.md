# 0019: När granskningen är av säger ingen vy "inte granskad", och en checklista på väg visas som på väg

- **Status:** Accepterat
- **Datum:** 2026-10-12
- **Gäller:** ursprungsraden i checklistor, svar, passform och granskningar av utkast, och kortet på en upphandling
  som har underlag men ännu ingen checklista, när inköp inte granskar checklistor
- **Ersätter:** i [beslut 0017](0017-granskad-bara-nar-inkop-granskar.md) att checklistans ursprungsrad säger "inte
  granskad av inköp" när granskningen är av, och i [beslut 0011](0011-installningar-granskning-valfri.md) orden
  "Automatiskt framtagen · inte granskad av inköp" och "märkt ”inte granskad av inköp”"

## Sammanhang

När granskningen är av (beslut 0011) granskar inköp ingenting. Ändå sa ursprungsraden "Automatiskt framtaget · inte
granskat av inköp" över varje checklista, varje svar i Fråga AI, varje passform och varje granskning av ett utkast.
Orden skilde inte ut något: de upprepade inställningen på varje rad, samma skäl som tog bort "inte granskad" ur
annonslistorna (beslut 0017).

En upphandling med underlag men utan checklista sa dessutom "Ingen checklista ännu", som om något väntade på inköp.
Med granskningen av väntar inget på någon: tolkningen är automatisk, jobbet `interpret_pending` kör var femte minut
och publicerar resultatet så fort det är klart. Glappet är några minuter, men kortet lät som en spärr, och läsaren
måste ladda om sidan själv för att se kraven.

## Beslut

**Medan granskningen är av nämner ursprungsraden inte granskningen.** Den säger "Automatiskt framtaget", sedan
källkontrollen när det finns en ("Alla 86 källhänvisningar hittades i underlaget") och "Hur togs det här fram?".
Popovern säger fortfarande att inköp inte har granskat innehållet, för den som frågar. Inställningens egen förklaring
säger inte längre att en checklista "märks". Utskriftsvyn av ett samtal behåller "inte granskade av inköp": den läses
utanför appen, där inställningen inte syns.

**Medan granskningen är på gäller beslut 0011 och 0017 som förut:** en checklista som publicerades utan granskning
säger "Automatiskt framtaget · inte granskat av inköp", liksom svar, passform och granskningar av utkast, som inköp
aldrig granskar.

**En checklista på väg visas som på väg, med var den är.** `NoticeDetail` får `checklist_progress`: var tolkningen
befinner sig medan ett dokument väntar på sin första tolkning (i kö till arbetarens nästa körning, pågår, eller försöks
igen efter ett fel), med antal försök och tiderna för nästa körning och nästa försök, och null när arbetaren har gett
upp och för bilagor. Nästa körning räknas från jobbets senaste start och dess intervall, som arbetarens schema läser
från samma ställe. Med granskningen av heter kortet då "Checklistan tas fram", säger att kraven visas så fort den är
klar, och har en statusrad: "Står i kö. Nästa tolkning väntas kl. 15:42", "Tolkning pågår. Tar oftast under en
minut" eller "Försök 1 av 5 misslyckades. Försöker igen tidigast kl. 16:05", och under den när sidan senast frågade.
Sidan frågar efter upphandlingen igen var femtonde sekund tills checklistan finns, och visar då stegen utan att
läsaren gör något. Är ingen checklista på väg står "Ingen checklista ännu" som förut, och inköparen får veta
att tolkningen misslyckades och att en ny begärs under Inköp. Med granskningen på gäller kortets ord som förut, men
också då frågar sidan igen tills checklistan finns, så att inköparen ser utkastet när det kommer.

Det starkaste alternativet var att tolka underlaget i samma stund som en läsare öppnar sidan. Då hade kortet kunnat
försvinna helt, men varje besök hade kunnat starta ett anrop till modellen, och flera besökare samtidigt flera, utan
att arbetaren vet om det. Att tolka i förväg och visa när det är klart kostar bara väntan på nästa körning.

## Konsekvenser

- Gränssnittet kallar fortfarande aldrig en ogranskad checklista granskad. Checklistans eget `reviewed` styr
  ursprungsraden så snart granskningen är på igen.
- `checklist_progress` är ett tillägg i REST-kontraktet (`NoticeDetail`); MCP-servern påverkas inte. Intervallet
  för `interpret_pending` ligger i `services.checklists`, och arbetarens schema läser det därifrån.
- Kortet lovar en checklista bara när arbetaren kommer att tolka. Ett dokument som arbetaren gett upp syns under
  Tolkningar i Inköp, där en ny tolkning begärs.
- En öppen sida utan checklista gör ett anrop var femtonde sekund i högst några minuter; sedan finns checklistan, eller
  så har arbetaren gett upp och anropen upphör.
