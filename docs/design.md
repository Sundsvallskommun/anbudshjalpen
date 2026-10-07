# Design

Syfte: Beskriva gränssnittets designsystem som det är byggt: principerna, navigeringen, sidornas uppbyggnad, de delade
komponenterna, reglerna för text och tillgänglighet och måtten som sidorna ska hålla.

Läs detta när: Du bygger eller ändrar en sida i webbappen, skriver text som användarna ser eller granskar gränssnittet.

Hör ihop med: [PoC](poc.md), [Arkitektur](architecture.md), [AI-uppgifterna](ai-tasks.md),
[Beslut 0002](decisions/0002-react-and-astryx.md), [Beslut 0007](decisions/0007-poc-login-persona-picker.md),
[Målbild för gränssnittet](direction.md), [`frontend/AGENTS.md`](../frontend/AGENTS.md) (engelska)

Målbilden är ritad i Claude Design: [Anbudsklar – målbild](https://claude.ai/artifact/YZUesFY9gAH4MiBALTuseW), som är
privat tills den delas. Den här sidan beskriver det som är byggt i `frontend/src`. Säger sidan och koden olika har koden
rätt. Skälen bakom besluten och utgångsläget före står i [Målbild för gränssnittet](direction.md), som kodkommentarerna
hänvisar till med avsnittsnummer.

## Grunden

Gränssnittet byggs med Astryx och Eneo-temat ([beslut 0002](decisions/0002-react-and-astryx.md)). Eneo-accenten
(#004595), systemtypsnittet och tillgänglighetsöverstyrningarna i `frontend/src/theme/eneo.theme.ts` ligger fast. Det
moderna kommer från ytor, hierarki och färre men tydligare val: ingen ny färg, inga gradienter och inga illustrationer.
Temat har ett ljust och ett mörkt läge. Användaren väljer under Utseende, i kontomenyn och i foten: Ljust, Mörkt eller
Automatiskt, som följer datorns eller telefonens inställning och är förvalt. Valet sparas i webbläsaren
(`frontend/src/shell/appearance.tsx`), och `frontend/public/appearance.js` sätter det innan sidan ritas, så att en sida i
mörkt läge inte blinkar ljust.

Hur koden skrivs, till exempel Astryx-komponenter i stället för egen layout och temafixar i `eneo.theme.ts`, står i
`frontend/AGENTS.md`. Se också [Ändra designen](#ändra-designen).

## Principer

1. **Svaret först, detaljerna sedan.** Varje vy börjar med ett besked: en siffra, en status och nästa steg. Detaljerna
   ligger i hopfällbara grupper med antalet i rubriken.
2. **En väg, inte en verktygslåda.** Upphandlingens sida har fyra numrerade steg: 1 Krav, 2 Fråga, 3 Granska och
   4 Lämna in. Varje steg slutar med kortet "Nästa steg".
3. **Fristen är ankaret.** Samma fristblock används i listan, i korten, i sidhuvudet, bland påminnelserna och i
   inköparens kö: datumet stort, klockslaget och "om N dagar", med varningsfärg vid 7 dagar eller färre.
4. **Förtroende genom undantag.** Ursprungsraden säger en gång per vy vem som tog fram innehållet och hur källorna höll.
   Varje rad har bara en diskret länk, "s. 5". Bara avvikelser får ord, ikon och färg.
5. **En upplysning, på rätt plats.** Demobandet är en rad. Varje annan upplysning står där användaren kan agera på den:
   "Ladda inte upp riktiga anbud" vid uppladdningen, motorn i ursprungsraden och e-legitimationen på inloggningen.
6. **Telefonen först för företagaren.** 390 × 844 är den viktigaste vyn för företagarens sidor. Stegen och fristen ska
   synas på första skärmen.
7. **Ett kort, en handling.** Det som går att agera på för sig blir ett kort. En vy har högst en primärknapp, och
   knappar som upprepas i en lista är sekundära.
8. **Klarspråk utan expertord.** Företagarens vy har inga tekniska ord och inga CPV-koder utan benämning. Fackord
   förklaras vid klick.

## Navigering

| Vem | Huvudmeny | Kontomeny (avataren) | Landar på |
|---|---|---|---|
| Företagare | Start · Upphandlingar · Regelhjälpen | Utseende, Företagsprofil, Påminnelser, Logga ut | Start |
| Inköpare | Inköp, med antalet att granska · Upphandlingar · Regelhjälpen | Utseende, Drift, Logga ut | Inköp › Att granska |
| Besökare | Upphandlingar · Regelhjälpen, och knappen "Logga in" | – | Upphandlingar |

Reglerna står i `frontend/src/shell/navigation.ts`. Adressen `/` skickar var och en till sin startsida, och efter
inloggningen kommer man tillbaka till sidan som bad om den (`?till=`).

**Telefon** (smalare än 640 px): rad 1 har logomärket, ordmärket och avataren. På sidorna i huvudmenyn har rad 2 de tre
valen som flikar, och på en detaljsida en tillbakalänk ("‹ Upphandlingar"). Det finns ingen hamburgermeny, och
sidhuvudet rullar bort med sidan.

| Adress | Sida |
|---|---|
| `/start` | Start. Den gamla adressen `/bevakning` leder hit, med sina parametrar kvar |
| `/upphandlingar` | Listan över upphandlingar. Sökningen och filtren står i adressen, så att en sökning går att dela: `?q=`, `?status=planned\|alla` (utan värde visas Öppna), `?kalla=`, `?kopare=`, `?passar=1`, `?sortera=frist\|publicerad\|relevans` och `?sida=` |
| `/upphandlingar/:id?flik=checklista\|fraga\|granska\|inlamning` | Upphandlingens sida och dess steg. Värdena är kvar från före omgörningen, så `checklista` är steget Krav |
| `/upphandlingar/:id?citat=…&sida=…&pastaende=…` | Öppnar källdialogen på upphandlingens sida. `?flik=underlag` öppnar underlaget på sida 1 |
| `/regelhjalpen?fraga=…` | Regelhjälpen, som ställer frågan direkt och sedan tar bort den ur adressen |
| `/profil` och `/paminnelser` | Företagsprofil och Påminnelser. Påminnelsemejlen länkar till `/paminnelser` |
| `/logga-in?till=…` | Val av demoperson ([beslut 0007](decisions/0007-poc-login-persona-picker.md)) |
| `/inkop?flik=granska\|insikter` | Inköp med flikarna Att granska och Företagens frågor. `?flik=ny` öppnar "Ny upphandling", och `?flik=jobb` leder till Drift |
| `/inkop/checklistor/:id` | Granska checklista |
| `/inkop/drift` | Drift |

## Ramen

Varje sida visas i ramen `AppFrame` i `frontend/src/shell/`:

- **Demobandet** (`PhaseStrip`) står överst på varje sida och går inte att stänga
  ([beslut 0007](decisions/0007-poc-login-persona-picker.md)). Det är en rad på neutral yta med en gul token "Demo",
  texten "Påhittade företag och upphandlingar är märkta Fiktiv. AI kan ha fel – kontrollera alltid mot underlaget." och
  länken "Om demon och AI". På telefon står "Fiktiva uppgifter · AI kan ha fel" och "Mer". Länken öppnar en dialog med
  operatörens demotext och AI-upplysning (`GET /api/config`), vilken motor demon använder och varför riktiga anbud inte
  ska laddas upp.
- **Toppnaven** (`FrameHeader`, `MainNav`, `AccountMenu` och `Brand`) är 64 px hög på bredare skärmar och följer
  sidbehållarens bredd. Vald menypunkt har accentfärgad text i semibold och en accentlinje på 2 px under. Logomärket är
  Gnistan: coachens vita pratbubbla med en bock, på en blå ruta, och en gul gnista i hörnet som står för AI. Rutan har
  egen bakgrund och ser likadan ut i ljust och mörkt läge. Gult finns bara i märket, aldrig som statusfärg.
  Kommunvapnet används inte utan klartecken.
- **Märket** är filen `frontend/public/favicon.svg`, som både toppnaven och webbläsarfliken visar. Från den bygger
  `npm run icons` (från `frontend/`) reservikonen `favicon.ico`, hemskärmsikonerna och manifestets ikoner i
  `frontend/public/` och README-loggan i `docs/assets/`. Ändras märket körs skriptet igen.
- **Sidan** (`Page`) har sidans enda h1, som får fokus efter en navigering i appen. Över h1 kan brödsmulor (bara på
  bredare skärmar) och en kort rad som "Granska checklista" stå. I rubrikraden kan en knapp stå, under den en ingress,
  och bredvid innehållet en högerspalt.
- **Foten** (`SiteFooter`): "Anbudsklar · Sundsvalls kommun · Om demon och AI", där länken öppnar samma dialog som
  demobandet, och sist på raden valet Utseende, som även den som inte har loggat in når. Foten står efter sidans `main`, inte i den, så att den är sidans enda `contentinfo` på översta nivån:
  `ModuleShell` lägger den efter Astryx `AppShell`. Den har en linje över sig och samma innehållslinje som toppnaven,
  och på en kort sida följer den direkt efter innehållet i stället för att stå under första skärmen. Målbildens länk
  till en tillgänglighetsredogörelse kommer när den sidan är skriven.

**Ytor och bredder.** Sidan ligger på temats grå bakgrund (`--color-background-body`). Det användaren agerar på ligger
på vita kort med 1 px kant, 12 px hörn och ingen skugga. Sidbehållaren är 1 152 px. Inköparens granskning av en
checklista är en arbetsyta på 1 344 px, och på den sidan följer demobandet, toppnaven och foten med till samma bredd. En
sida med högerspalt har innehållet och en spalt på 360 px med 32 px emellan, och under 1 024 px hamnar spalten under
innehållet. Formulär och löptext hålls till 640 eller 760 px, och telefonen har 16 px marginal. `Page` tar bredderna
640, 760, 960, 1 152 och 1 344. Bredderna och barhöjderna är tokens i temat, till exempel `--layout-container`,
`--layout-workspace`, `--layout-rail` och `--height-step-bar`.

**Färg har betydelse.** Accentfärgen betyder att något går att klicka på, och den visar vald menypunkt och valt steg.
Grönt betyder bra (Verkar passa, Ser bra ut, Granskad checklista). Gult betyder uppmärksamhet (Passar delvis, Bevis
saknas, frist inom 7 dagar, Demo). Rött betyder att något saknas eller är fel (Hittades inte). Grått är beskrivande
(Fiktiv, Stängd, Verkar inte passa, Kontrollera själv). Lila, cyan, teal och orange används inte för status. En status
har alltid ikon och ord, aldrig bara färg (`frontend/src/components/tokens.tsx`).

**Typografi och rytm.** Systemtypsnittet. H1 är 28/40 (23/32 på telefon), H2 23/32, H3 19/28 och H4 16/24, alla i
semibold. Brödtext är 16/24 och stödtext 13/20. Datum i fristblocket och siffror i statistikrutor har tabellsiffror.
Avstånden följer temats skala: i regel 16 px mellan rader, 24 px mellan grupper och 40 px mellan avsnitt.

## Sidorna

### Start (företagare)

- H1 "Välkommen, Anna" och raden "Målerifirman i Matfors AB · 2 nya träffar · nästa frist om 25 dagar", som på telefon
  inte nämner företaget.
- Kortet **Nästa frist**, med accentkant (`AccentCard`): den närmaste fristen bland träffarna, vad den gäller,
  upphandlingen och "Påminn mig". På bredare skärmar står därunder "Därefter: …" med samma upphandlings nästa frist.
- **Nya träffar (n)** som kort, de som verkar passa först: passform, titel, fristblock, högst tre skäl med källa, "Visa
  alla skäl (n)", sekundärknappen "Öppna checklistan" (utan checklista "Öppna upphandlingen") och "Inte intressant", som
  döljer kortet och visar en avisering med "Ångra". Ursprungsraden står i kortets fot. Utan publicerad checklista säger
  skälen att bedömningen bara bygger på CPV-kod och ord i annonsen. Träffar som inte verkar passa ligger i en stängd
  lista under korten.
- **Kommande upphandlingar** ur avtalskatalogen som en tidslinje, med valet "För er · Alla" och "Förbered er: det här
  krävdes förra gången".
- Högerspalten har tre kort: "Dina påminnelser", "Träffarna bygger på er profil" och "Frågor om upphandling?".
  Telefonen har ingen högerspalt: påminnelserna kommer efter träffarna, och profilen och Regelhjälpen sist. Kortet
  "Frågor om upphandling?" har exempelfrågan "Hur lång är avtalsspärren?", som öppnar Regelhjälpen med svaret.

### Upphandlingar

- Ingress, sökfält, "Öppna · Planerade · Alla" med antal (Öppna är förvalt) och "Fler filter" i en popover med två
  väljare, Källa och Köpare. Köpare visar varje köpare med hur många upphandlingar listan då visar, till exempel "Timrå
  kommun (3)", och får en sökruta när köparna är fler än åtta (`GET /api/notices/buyers`). Valda filter står som chips,
  till exempel "Köpare: Timrå kommun", med en knapp som tar bort filtret och lämnar fokus på "Fler filter". På telefon
  är knappen en ikon bredvid sökfältet som heter "Filter och sortering" och rymmer även sorteringen. En inloggad
  företagare får också "Visa bara det som passar er", som filtrerar på profilens CPV-koder.
- Raden "12 öppna upphandlingar · närmast sista anbudsdag först", som också nämner en vald köpare ("3 öppna
  upphandlingar från Timrå kommun") och på bredare skärmar har "Sortera" bredvid sig. Sedan raderna i ett kort. En rad
  har titeln (högst två rader), "köpare · kategori · källa", bara de tokens som säger något och fristblocket till höger.
  Är datumet sista dag för anbudsansökan (ett selektivt förfarande) står "Anbudsansökan" ovanför det.
  På telefon står tokens på en egen rad under. Hela raden är en länk. "Öppen för anbud" visas inte, eftersom det är det
  vanliga läget. Sidorna bläddras med Astryx `Pagination`.
- Högerspalten har "Passar er" för en företagare eller en uppmaning att logga in för en besökare, och "Kommande enligt
  avtalskatalogen".

### Upphandlingens sida

**Sidhuvudet** är gemensamt för alla steg: brödsmulor, h1 och en rad med köparen, referensnumret och källan, till
exempel "Sundsvalls kommun · DEMO-2026-0147". En påhittad upphandling visar ingen källa i raden, eftersom token Fiktiv
redan säger det. Efter raden kommer tokens i ordningen status (utom öppen), Fiktiv, passform och Granskad checklista.
Referensnumret står bara här, inte i listans rader. Sedan nyckeltalen i fyra kolumner, två gånger två på telefon: sista
anbudsdag och sista dag för frågor med "Påminn mig" (i ett selektivt förfarande "Sista dag för anbudsansökan" i
stället för sista anbudsdag, med en påminnelse om den), uppskattat värde och förfarandet i klarspråk ("Under EU:s
beloppsgränser"). Därefter de stängda knapparna "Därför verkar den passa (n skäl)" och "Om upphandlingen", och
"Underlaget · 17 sidor", som öppnar källdialogen på sida 1, med "Ladda ned". Ett skäl som gäller ett krav har länken
"Visa kravet", som öppnar steg 1 vid kravet. På telefon är knapparna rader i ett kort, och underlaget ligger under "Om
upphandlingen och underlaget". För en tilldelad upphandling förklaras beslutet och avtalsspärren.

**Stegraden** är sticky: ① Krav · ② Fråga · ③ Granska · ④ Lämna in. Valt steg har accentfylld siffra och accentlinje.
På telefon står de fyra korta etiketterna utan siffror i lika breda celler. När raden har fastnat visas sista
anbudsdag längst till höger på bredare skärmar. Steg 3 får en varningsikon när granskningen hittade luckor och en bock
när allt ser bra ut.

| Steg | Innehåll | Högerspalt |
|---|---|---|
| 1 Krav | Ursprungsraden, till exempel "Granskad och publicerad av inköp, Sundsvalls kommun, 5 okt 2026 · Alla 86 källhänvisningar hittades i underlaget" (på telefon "Granskad av inköp 5 okt"). "Det här behöver du göra" med fyra statistikrutor som leder till sina avsnitt och på telefon bara visar siffra och ord, sedan sammanfattningen och grupperna med antal. Skallkrav, Kvalificeringskrav och Viktiga datum (med "Före anbudet") är öppna. Bilagor att lämna in, Så utvärderas anbuden, Krav på uppdraget, Avtalsvillkor, Ord och begrepp, Oklart i underlaget och "Efter anbudet och under uppdraget" är stängda. Slutar med "Ställ en fråga" | "På den här sidan", en innehållsförteckning som följer med och öppnar en stängd grupp, och "Något som inte stämmer?". Under 1 024 px har steget ingen högerspalt |
| 2 Fråga | Frågorna som en tråd: frågan i en bubbla ("Du") och svaret som ett kort med ursprungsrad, "Står i underlaget", en fet slutsats och citaten med sida. När underlaget inte svarar har svaret en tonad ruta, "Ger underlaget inget entydigt svar?", med "Påminn mig" och länken dit frågan ställs formellt ([AI-uppgifterna](ai-tasks.md#besvara-fråga-besvara_fraga)), och annars raden "Oklart? Ställ frågan i e-Avrop senast 30 okt.". Exempelfrågor och skrivfältet, som är sticky på telefon | "Bra att veta" om frågor i e-Avrop, med sista dag för frågor och "Påminn mig" och, när checklistan anger det, när kommunen svarar senast. Sedan underlaget |
| 3 Granska | Ytan för utkastet, med "Utkastet sparas inte" och "Ladda inte upp riktiga anbud eller personuppgifter i demon" vid ytan. Efter granskningen en rad med filnamnet och "Granska en ny version", utlåtandet med framstegsstapel och filter, och grupperna Måste åtgärdas (öppen), Kontrollera själv, Ser bra ut, Krav på uppdraget och Avtalsvillkor. Rader att åtgärda eller kontrollera säger hur kravet visas ("Så visar du det") och har "Fråga om kravet", som öppnar steg 2 med frågan ifylld | "Så läser du resultatet", och efter granskningen även "Utkastet sparas inte", som ytan säger innan dess |
| 4 Lämna in | Skall- och kvalificeringskrav och bilagor att bocka av. Det som granskningen bedömde som "Ser bra ut" är förbockat och märkt "Granskat". Kortet "Lämna anbudet" med länken till e-Avrop, eller för en påhittad upphandling att den inte finns där. I ett selektivt förfarande säger kortet först att man lämnar en anbudsansökan senast annonsens datum, och sista anbudsdag tas från checklistan. Bockarna sparas bara i webbläsaren | "Ditt framsteg", till exempel "12 av 21 klara", som står före listan på smala skärmar |

**Utan checklista**, som de flesta annonserna från TED, har sidan inga steg. Under sidhuvudet står kortet "Ingen
granskad checklista ännu" med skälet, knappen till annonsen, knappen till underlaget där det finns när det inte är
inläst här (till exempel "Underlaget i e-Avrop") och, när det finns ett underlag, "Fråga underlaget". "Påminn mig"
står vid sista anbudsdag bland nyckeltalen, så kortet upprepar den inte. En stängd eller tilldelad upphandling lovas
ingen checklista: kortet heter då "Ingen granskad checklista". Saknas underlaget kan inköparen ladda upp det där.

### Källdialogen

Alla "s. 5" i appen öppnar samma dialog, var användaren än klickar: 760 px bred på bredare skärmar och ett ark nerifrån
(`BottomSheet`) på telefon. Den visar påståendet och var det stod ("Från: Skallkrav"), status i ord ("Citatet står på
sida 7 och är markerat nedan", "Citatet står på sida 9 (AI angav 7)" eller "Citatet hittades inte i underlaget"),
dokumentet med "Ladda ned" och sidbläddring, och sidan som papper med citatet markerat. Foten säger "Stämmer det inte?
Det är alltid förfrågningsunderlaget som gäller. Ställ frågan i e-Avrop senast 30 okt." Fokus flyttas till rubriken och
tillbaka till länken när dialogen stängs.

### Regelhjälpen, profilen, påminnelserna och inloggningen

- **Regelhjälpen** har samma samtalsform som steg 2, med "Fråga" bredvid skrivfältet och, när ett samtal har börjat,
  "Börja om" under det. Ett svar har ursprungsraden, en fet slutsats när motorn skrev en, förklaringen och ett kort per
  paragraf: "LOU 20 kap. 1 § · Avtalsspärr", början av lagtexten ur Anbudsklars egen kopia av LOU och "Läs hela
  paragrafen". Korten står under rubriken "Svaret bygger på", eller "Paragrafer som kan handla om din fråga" när den
  regelbaserade motorn svarar utan slutsats. Ursprungsraden förklarar att svaret bygger på lagen och att det alltid är
  lagtexten som gäller. Exempelfrågorna står kvar efter svaret, utom de som redan har ställts.
- **Företagsprofil** är ett formulär på 640 px. Det börjar med ett kort som säger vad profilen styr och hur många
  träffar som verkar passa just nu, samma antal som på Start. Under "Vad ni gör (CPV-koder)" står först beskrivningen
  med egna ord och sedan koderna, med benämningen först ("Målning · 45442100"). "Föreslå koder" visar förslagen som
  rutor att kryssa i, med skälet under varje och en rad om hur de togs fram. Fälten har tips om vad kraven brukar vara.
  Raden med "Spara profilen" blir sticky när något har ändrats. Efter sparandet får träffarna en ny bedömning, och en
  avisering säger hur många som verkar passa nu: "Profilen är sparad · 2 upphandlingar verkar passa er" med "Se
  träffarna". Med en språkmodell bedöms träffarna efter svaret, och då står det "Träffarna uppdateras om en stund".
  Verkar inget passa försvinner aviseringen av sig själv.
- **Påminnelser** har avsnitten Kommande och Skickade. Varje påminnelse är ett kort med upphandlingen och "Ta bort", och
  fristen och utskicket står som två fakta bredvid varandra, även på telefon: fristblocket, till exempel "Sista
  anbudsdag 9 nov kl. 23:59", och "Mejlas fredag 7 november kl. 08:00 · om 33 dagar", eller "Skickad 7 nov" när mejlet
  har gått. Utan påminnelser står "Inga påminnelser ännu" med de närmaste fristerna i träffar som verkar passa, var och
  en med "Påminn mig". Finns ingen frist att föreslå visar sidan i stället "Se upphandlingar". En påminnelse om sista
  dag för anbudsansökan följer annonsens datum; en om sista anbudsdag följer då bara checklistans.
- **Logga in** heter "Välj vem du är i demon", med raden "Ingen riktig inloggning. I tjänsten loggar företag in med
  e-legitimation." Två rollkort, staplade på telefon, har avatar, namn, roll, tre saker man kan göra, vart man kommer
  och "Fortsätt som Anna" eller "Fortsätt som Lars". Hela demotexten står under korten.

### Inköp

- **Att granska** visar först en ruta om underlag som inte har tolkats än ("2 underlag kunde inte tolkas" eller "1
  underlag tolkas just nu"). Sedan "Att hantera (n) · Publicerade · Avvisade · Alla", där Att hantera omfattar utkast
  och godkända checklistor, och en tabell sorterad på sista anbudsdag: Upphandling, Sista anbudsdag, Status, Källor
  ("41/41" med bock eller "3 att kontrollera"), Krav, Tolkad och knappen "Granska". Är annonsens datum sista dag för
  anbudsansökan står "Anbudsansökan" ovanför det, och den automatiska kontrollen jämför då inte checklistans sista
  anbudsdag med annonsen utan varnar om de är samma dag. Ett äldre utkast märks "Ersatt av
  nyare tolkning". Där tabellen inte får plats, under 1 100 px, står uppgifterna under rubriken, med "Granska" bredvid.
  "Ny upphandling" står i sidhuvudet och har ett fält för referensnummer (diarienummer), som visas under upphandlingens
  rubrik, och valet "Datumet gäller: Anbud · Anbudsansökan", som ger datumfältet namnet "Sista anbudsdag" eller "Sista
  dag för anbudsansökan".
- **Företagens frågor** är en tabell per upphandling: antal frågor, hur många underlaget inte svarade på och hur många
  som hänvisades till e-Avrop. Frågorna själva visas först efter sista anbudsdag, och inget företag namnges. Under
  760 px står fristen och de andra antalen under rubriken, och bara antalet frågor har en egen kolumn.
- **Granska checklista** har raden "Granska checklista" över h1 med upphandlingens namn, stegen Utkast → Godkänd →
  Publicerad och fakta att jämföra med. Från 1 200 px är sidan en arbetsyta på upp till 1 344 px: de automatiska
  kontrollerna, som länkar till sina rader, och listan står i en kolumn bredvid "Källan i underlaget", och båda rullar
  för sig. Rubriken för gruppen man läser står kvar överst i listan. Under 1 200 px står kontrollerna över listan, och
  formuläret öppnas i en dialog. Saknar checklistan utvärderingskriterier säger kontrollen var underlaget beskriver
  utvärderingen ("… underlaget har kapitlet 4 Utvärdering på sida 6"), och "Lägg till" öppnar ett kriterium med den
  sidan som källa. Listan filtreras på Alla, Flaggade, Ändrade och Kontrollerade (de två sista bara medan checklistan
  går att ändra), och varje rad har en kryssruta "Kontrollerad". Ändringar sparas medan man arbetar. Beslutet står
  sist, i en rad som är sticky på bredare skärmar: "Kontrollerat x av y", "Avvisa…", "Fler val" och primärknappen
  "Godkänn och publicera" med bekräftelse. En avvisad eller tillbakadragen checklista visar motiveringen och "Öppna som
  utkast igen".
- **Drift** visar jobben grupperade som Hämta, Bearbeta och Skicka, se [Drift](operations.md#schemalagda-jobb).

## Delade komponenter

Byggstenarna som omgörningen lade till ligger i `frontend/src/components/ui/`. Varje komponent finns en gång och används
överallt där behovet finns.

| Komponent | Till för |
|---|---|
| `AccentCard` | Ett kort med en accentkant på 4 px i startkanten, för det enda kortet i en vy som leder vidare: "Nästa steg" och Starts "Nästa frist". Tar samma props som Astryx `Card` |
| `AiProvenance` | Ursprungsraden överst i varje automatiskt block, en gång. Granskat innehåll: "Granskad av inköp 5 okt 2026 · Alla 86 källhänvisningar hittades i underlaget". Annars "Automatiskt framtaget · inte granskat av inköp". Popovern "Hur togs det här fram?" namnger motorn: regelbaserat, AI via Eneo eller en AI-modell. `basis` säger vad innehållet bygger på: underlaget (standard), där popovern slutar med "Det är alltid förfrågningsunderlaget som gäller", eller lagen (`basis="law"`, Regelhjälpen), där den säger "Läs alltid hela paragrafen" och "Det är alltid lagtexten som gäller". På telefon heter länken "Mer" |
| `CollapsibleSection` | En grupp som kort, där rubriken är knappen. Antalet står i en Badge och ingår i knappens namn ("Skallkrav, 11 krav"), med en hjälprad och ett startläge. En länk till gruppen ("#skallkrav") eller till en rad i den öppnar gruppen och rullar sedan fram till målet och ger det fokus, även när man kommer från en annan sida. Innehållet ligger kvar när gruppen är stängd, så att ankarna fungerar |
| `DeadlineBlock` | Fristblocket: "9 nov" stort i tabellsiffror, "kl. 23:59" och "om 35 dagar". Vid 7 dagar eller färre blir den relativa tiden en gul token med klocka, och ett passerat datum blir grått med "passerat". Varianterna `inline`, `stack` och `compact`. `note` sätter ett ord ovanför datumet där etiketten inte syns, till exempel "Anbudsansökan" |
| `NextStepCard` | "Nästa steg" sist i varje steg: en mening och en eller två knappar, på ett `AccentCard` |
| `ReminderState` | "Påminn mig" vid en frist, och efteråt på samma plats "Påminnelse mejlas 7 nov · Ändra". På telefon står "Påminnelse 7 nov", och skärmläsare hör ändå "mejlas". En besökare skickas till inloggningen. Inköpare och passerade datum får ingen knapp |
| `RequirementRow` | Ett krav som en kompakt rad på minst 48 px: titeln, vid behov "Bevis: …" och "s. 5". Brödtexten visas bara när den säger mer än titeln, och raden har ankaret `#krav-K12`, som granskningens "Visa kravet" länkar till |
| `ResultSummary` | Ett utlåtande: rubrik med siffran, framstegsstapel och statistikrutor som filtrerar raderna under |
| `StatTile` | En siffra att agera på, med etikett och stödrad. Antingen en länk (ett ankare som öppnar sitt avsnitt) eller ett filter |
| `StepNav` | Upphandlingens fyra steg som en sticky flikrad, med steget i adressen (`?flik=`). Ett steg monteras första gången det öppnas och behålls sedan. `useStepNav().goTo` byter steg och flyttar fokus till steget |
| `icons.tsx` | Appens egna ikoner där Astryx semantiska ikoner saknar en: dokument, papperskorg, pil framåt, `DownloadIcon` ("Ladda ned") och `UploadIcon` ("Granska en ny version" och "Ladda upp"). De ritas med `Icon` som alla andra |
| `source/SourceLink` | Källan till ett påstående: "s. 5" som en diskret länk. Bara avvikelser får en token: "s. 9 (AI angav 7)" i blått och "Hittades inte i underlaget" i gult. Namnet säger vad källan belägger: "Visa källan för ”Anbudet är skrivet på svenska”, s. 5" |
| `source/SourceDialog` och `SourceDialogProvider` | Appens enda källdialog, se [Källdialogen](#källdialogen). Den öppnas med `useSourceDialog()`, och `useSourceDeepLink` öppnar den från adressen |
| `source/PageText` | En sida ur underlaget som papper: cirka 72 tecken per rad, numrerade avsnittsrubriker i semibold och citatet markerat och inskrollat. Används i källdialogen och i inköparens granskning |
| `source/sourceTarget.ts` | Vad källdialogen visar och adressen som öppnar den (`sourceHref`) |
| `testing.tsx` | Testhjälp: renderar en komponent med appens providers på en viss adress |

Andra delade delar ligger i `frontend/src/components/`, `frontend/src/shell/` och `frontend/src/AppProviders.tsx`:

| Del | Till för |
|---|---|
| `AppProviders.tsx` | Det varje sida behöver, en gång: data från API:t, Astryx svenska ord, temat, routerns länkar, källdialogen och den enda ytan för aviseringar (Astryx `LayerProvider`, med "Aviseringar" och "Stäng avisering"). En sida monterar ingen egen `LayerProvider` |
| `tokens.tsx` | Statusorden som tokens: `FitToken`, `StatusToken`, `FictitiousToken`, `PublishedChecklistToken`, `ClosingSoonToken`, `NoticeStatusToken` och `ChecklistStatusToken` |
| `NoticeRow` och `RowList` | En upphandling som rad, och listor med rader där hela raden är en länk |
| `TermText` | Fackord som går att trycka på för en förklaring, ur `frontend/src/lib/glossary.ts` (som bygger på [Ordlistan](glossary.md)) eller checklistans egna termer |
| `FormalQuestionAdvice` | Rutan om likabehandling, tonad och infälld i svaret: "Ger underlaget inget entydigt svar?" Ställ frågan i e-Avrop före sista dag för frågor, med "Påminn mig" och länken dit frågan ställs, eller för en påhittad upphandling utan egen sida att den inte finns i e-Avrop |
| `states.tsx` | `Loading` och `ErrorNotice`, med vad som misslyckades och "Försök igen" när det kan hjälpa |
| `shell/` | Ramen: `AppFrame`, `ModuleShell` (Astryx `AppShell` med foten efter `main`), `PhaseStrip`, `FrameHeader`, `Brand`, `MainNav`, `AccountMenu`, `AboutDemo` (dialogen "Om demon och AI"), `appearance.tsx` (temat i besökarens utseende) och `AppearanceControl` (valet Utseende), `Page`, `SiteFooter`, `RequireRole` och reglerna i `navigation.ts` och `redirects.tsx` |

Orden till statusarna och motorerna står på ett ställe, `frontend/src/lib/labels.ts`, och datum och belopp formateras i
`frontend/src/lib/format.ts`.

## Regler för text

- **Tilltal:** "du" till personen i handlingar ("Påminn mig", "ditt utkast"), och "ni" och "er" om företaget ("passar
  er", "er profil").
- **Datum:** "9 nov" i listor och "9 november 2026" i löptext. Den relativa tiden står alltid intill: "om 35 dagar", "i
  dag", "i morgon". Klockslag skrivs "kl. 23:59".
- **Belopp:** "900 000 kr" och "5 000 000 kr", i kort form "5 mnkr".
- **Knappar:** verbet först, högst tre ord, och de säger vad som händer: "Ställ en fråga", "Granska en ny version",
  "Fortsätt som Anna".
- **Status** säger vad användaren ska göra, inte vad motorn gjorde.
- **Förbjudet i företagarens vy:** språkmodell, heuristik, verifierat, obevisat och styrka, en CPV-kod utan benämning
  och inledningen "Automatisk sammanställning utan språkmodell:". Motorn namnges bara i ursprungsraden.
- **Fackord** förklaras vid klick, inte i varje mening.
- **Inga emojis.** Ett enda utropstecken är tillåtet, i bekräftelsen "Klart!".
- **Likabehandling:** när underlaget inte svarar hänvisar texten till frågefunktionen i e-Avrop före sista dag för
  frågor, så att alla leverantörer får samma svar. Anbudsklar ger aldrig en leverantör råd som de andra inte får.

| Säg | Inte |
|---|---|
| Verkar passa · Passar delvis · Verkar inte passa | Passar · Passar inte |
| Därför verkar den passa · Det här kan stoppa er · Kontrollera själv | Styrka · Hinder · Oklart |
| Upphandlingen gäller målning – det gör ni. | Profilens CPV-kod 45442100 ligger nära annonsens 45442100 |
| s. 7 | Sida 7 · Verifierat citat |
| Alla 86 källhänvisningar hittades i underlaget | 86 av 86 citat hittades på angiven sida |
| Hittades inte · Bevis saknas · Kontrollera själv · Ser bra ut | Saknas · Obevisat · Oklart · Uppfyllt |
| Under EU:s beloppsgränser (19 kap. LOU), med förklaring vid klick | Annonserad upphandling under tröskelvärdena enligt 19 kap. LOU |
| Målning · Målning av byggnader · Ommålning | CPV-koder 45442100, 45442110, 45442180 |
| Granskad checklista | Checklista finns |
| Ingen token för en öppen upphandling. Vid 7 dagar eller färre en gul token med "om 4 dagar" | Öppen för anbud på varje rad |
| Sista anbudsdag 9 nov kl. 23:59 · Mejlas fredag 7 november kl. 08:00 | Sista anbudsdag: 7 november 2026 kl. 08:00 (påminnelsen) |
| om 33 dagar · Skickad 7 nov | Väntar · Skickad |
| Klart! Du får ett mejl 7 november kl. 08:00, två dagar före sista anbudsdag. | Påminnelse skapad till 7 november 2026 kl. 08:00 |
| Stegen 1 Krav · 2 Fråga · 3 Granska · 4 Lämna in | Flikarna Checklista, Fråga underlaget, Granska utkast, Underlag och Inför inlämning |
| Är något oklart? Ställ frågan i e-Avrop senast 30 oktober, så får alla leverantörer samma svar. | Frågor som rör ditt eget anbud ställer du formellt i e-Avrop. |
| Automatiskt framtaget · inte granskat av inköp | AI-genererat svar (regelbaserad sammanställning utan språkmodell) |
| Regelbaserat · AI via Eneo | Heuristisk motor · Språkmodell |
| Fortsätt som Anna | Logga in som Anna Berg, Målerifirman i Matfors AB |
| Start | Bevakning |
| Att hantera · Publicerade · Avvisade · Alla | Visa: Att granska |

## Tillgänglighet

Webbappen ska klara WCAG 2.2 AA (DOS-lagen och EN 301 549). Beviset är `npm run gate` från `frontend/`: Playwright och
axe mot en körande stack med demodata, på telefon i 320 och 390 px, laptop i ljust och mörkt läge, 200 % zoom och
tvingade färger. Gaten stoppar på varje WCAG-fel och på allvarliga fel mot god praxis, när en sida inte har exakt en
h1, på sidledes rullning i 320 px och 200 % och på brott mot CSP. Sänk aldrig en gräns, ta aldrig bort ett läge och
lägg aldrig till ett undantag för axe för att få gaten grön.

- **Målytor:** minst 24 px med mus och 44 px med finger. Temat sätter 44 px när pekaren är grov.
- **Fokus** syns alltid. Efter en navigering i appen får sidans h1 fokus. En dialog öppnar med fokus på rubriken och
  lämnar tillbaka det till knappen som öppnade den, likadant överallt (3.2.4).
- **Sticky element** döljer aldrig fokus (2.4.11). Det som stannar kvar när sidan rullar är stegraden, skrivfältet i
  steg 2 på telefon, inköparens beslutsrad och profilens spara-rad, och sidan har en `scroll-padding` lika stor som
  dem. Högerspalten i steg 1 och 4 följer också med, men bredvid innehållet. I inköparens granskning från 1 200 px
  står gruppens rubrik kvar överst i listan, och listan har en egen `scroll-padding` för den. Sidhuvudet och
  demobandet är inte sticky.
- **Unika namn:** varje källänk säger vad den belägger, och en grupps antal ingår i knappens namn (2.4.4, 2.4.6).
- **Markeringen** av ett citat läses som "Markerat citat: … slut på citatet", och i tvingade färger används systemets
  färger för markering (1.3.1).
- **Färg ensam bär aldrig betydelse:** status har ikon och ord (1.4.1).
- **Knappar** är aktiva och säger vad som saknas när de trycks, i stället för att vara avstängda med låg kontrast.
- **Ombrytning:** knappar, tokens och långa ord bryts i 320 px i stället för att skäras av (1.4.10).
- **Tid:** en avisering med en handling, som "Ångra", försvinner inte av sig själv (2.2.1).
- **Rörelse:** övergångar stängs av när användaren ber om mindre rörelse.
- **Språk:** allt är på svenska, även Astryx egna ord (`@astryxdesign/core/locales/sv-SE.json`).

## Mått

Omgörningen började med att upphandlingens sida var 13 623 px hög på desktop och 20 619 px på telefon. De här måtten ska
hålla i standardläget, med demodatan:

| Vad | Gräns |
|---|---|
| Upphandlingens sida | Högst 4 000 px på desktop och 7 000 px på telefon |
| Stegraden | Börjar senast vid y = 600 på desktop och inom de första 844 px på telefon |
| Demobandet | Högst 36 px högt på desktop och 52 px på telefon |
| Listan Upphandlingar | Minst 7 rader på första skärmen vid 1440 × 900 |
| Granskningsresultatet i steg 3 | Högst 1 800 px |
| Panelens test | Anna kan på under en minut säga vilka två bilagor hon saknar och när sista dag för frågor är |

Gaten mäter inte de här måtten. De kontrolleras i webbläsaren vid 1440 × 900 och 390 × 844, och längre texter i
underlaget ger högre sidor.

## Ändra designen

- Börja i Astryx. Från `frontend/`: `npm run astryx -- build "<idé>"` och sedan `npm run astryx -- component <Namn>` för
  varje komponent. Gissa aldrig en prop.
- En brist i designsystemet rättas en gång i `frontend/src/theme/eneo.theme.ts`, och sedan körs `npm run theme:build`.
  Den genererade katalogen `frontend/src/theme/built/` ändras aldrig för hand.
- Egen CSS får bara finnas för en yta utan motsvarighet i Astryx, i en `*.module.css` bredvid komponenten och bara med
  temats tokens. Vilka ytor det gäller står i `frontend/AGENTS.md`.
- Ett behov som finns på flera sidor blir en komponent i `frontend/src/components/ui/`, med ett test bredvid.
- Ändras något som den här sidan beskriver, ändras sidan i samma commit.
