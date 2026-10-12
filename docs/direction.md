# Målbild för gränssnittet

Syfte: Spara riktningen som omgörningen av gränssnittet byggdes efter: principerna, besluten och skälen bakom dem,
sidornas uppbyggnad och utgångsläget före.

Läs detta när: Du vill veta varför gränssnittet ser ut som det gör, eller en kodkommentar hänvisar hit med ett avsnitt,
till exempel "direction.md, section 4".

Hör ihop med: [Design](design.md), [Beslut 0002](decisions/0002-react-and-astryx.md),
[Beslut 0007](decisions/0007-poc-login-persona-picker.md)

Riktningen godkändes 2026-10-05 och är genomförd. Sidan skrivs inte om när gränssnittet ändras: det som är byggt står i
[Design](design.md), och säger sidorna olika gäller den och koden. Granskningarna och skärmbilderna som nämns nedan finns
inte i repot. Före-bilderna, målbilden och den byggda appen ligger bredvid varandra i Claude Design:
[Anbudshjälpen – målbild](https://claude.ai/artifact/YZUesFY9gAH4MiBALTuseW), som är privat tills den delas.

**Utgångsläge.** Underlaget är fem granskningar (företagaren, informationsarkitektur, visuell form, förtroende och inköparen) och 28 skärmbilder från 2026-10-05. Grunden håller: Eneo och Astryx, lugn typografi, en källa till varje påstående, inköparens grind och klarspråk. Det som brister är strukturen, inte stilen. Allt är utfällt och väger lika mycket. Därför blir upphandlingens sida 13 623 px hög på desktop och 20 619 px på telefon, verktygen hamnar under vecket och förtroendesignalerna drunknar i upprepning.

**Målbilden.** Anbudshjälpen ska kännas som en lugn och modern e-tjänst. Den leder Anna från frågan "passar det här oss?" till "jag vet vad jag ska lämna in" i fyra steg. Fristen är ankaret, och källan finns alltid ett klick bort.

**Vi byter inte varumärke.** Eneo-accenten (#004595), systemtypsnittet, Astryx-komponenterna och tillgänglighetsöverstyrningarna i `eneo.theme.ts` ligger fast. Moderniseringen kommer från ytor, hierarki och färre men tydligare val. Ingen ny färg, inga gradienter, inga illustrationer.

---

## 1. Principer

1. **Svaret först, detaljerna sedan.** Varje vy börjar med ett utlåtande: en siffra, en status och nästa steg. Detaljerna ligger i hopfällbara grupper med antalet i rubriken. Budget i standardläget: högst 4 000 px för upphandlingens sida på desktop och högst 7 000 px på telefon.
2. **En väg, inte en verktygslåda.** Upphandlingens sida består av fyra numrerade steg: 1 Krav, 2 Fråga, 3 Granska och 4 Lämna in. Varje steg slutar med ett kort "Nästa steg".
3. **Fristen är ankaret.** Samma fristblock används i listan, i korten, i sidhuvudet, bland påminnelserna och i inköparens kö. Det visar datumet stort, klockslaget och "om N dagar", och får varningsfärg när det är 7 dagar eller färre kvar.
4. **Förtroende genom undantag.** Beskedet ges en gång per vy: "Granskad av inköp 5 okt 2026 · Alla 86 källhänvisningar hittades i underlaget". Varje rad har bara en diskret länk, "s. 5". Bara avvikelser får ord, ikon och färg: citat på fel sida, citat som inte hittades och text som inte är granskad.
5. **En upplysning, på rätt plats.** Demobandet är en enda rad. Varje annan upplysning står där användaren kan agera på den. "Ladda inte upp riktiga anbud" står vid uppladdningen. Motorn och granskningsstatusen står överst i varje automatiskt block. E-legitimationen nämns på inloggningen.
6. **Telefonen först för företagaren.** 390 × 844 är den primära vyn för företagarens sidor. Stegen och fristen ska synas på första skärmen.
7. **Ett kort, en handling.** Det som går att agera på för sig blir ett kort. En vy har högst en primärknapp. Knappar som upprepas i en lista är sekundära.
8. **Klarspråk utan expertord.** Företagarens vy har inga ord som "språkmodell", "verifierat citat" eller "obevisat", och inga CPV-koder utan benämning. Fackord förklaras vid klick med de befintliga begreppsrutorna (TermText).

---

## 2. Beslut där granskarna var oeniga

| Fråga | Förslagen | Beslut | Varför |
|---|---|---|---|
| Huvudnavigering | IA: Start · Upphandlingar · Regelhjälpen. Visuell: Upphandlingar · Bevakning · Påminnelser, med Regelhjälpen som hjälplänk | **Start · Upphandlingar · Regelhjälpen.** Företagsprofil, Påminnelser och Logga ut ligger i kontomenyn (avatar). Påminnelser och profilen visas också som kort på Start | Anna har två ärenden, "vad är nytt för mig" och "leta själv", plus hjälp. Bevakning och Upphandlingar överlappar, och Påminnelser är nästan alltid en enda rad. Med tre val får menyn plats på telefon utan hamburgare |
| Bevakningssidan | Egen sida eller en del av Start | **Bevakning blir Start.** Den ligger på /start, och /bevakning omdirigeras dit eftersom mejlen länkar dit | En plats för "det som gäller mig" |
| Antal steg och namn | Förtroende: fem korta flikar inklusive Underlag. Övriga: fyra steg | **Fyra numrerade steg: 1 Krav · 2 Fråga · 3 Granska · 4 Lämna in.** Underlag blir en länk i sidhuvudet ("Underlaget · 17 sidor") och källdialogen | Underlag är en referens som nås via citaten, inte ett steg i resan. Fyra korta etiketter får plats i 358 px |
| Checklista och Inför inlämning | IA: slå ihop dem. Övriga: behåll steg 4 | **Behåll steg 4, men utan dubblering.** Steg 1 är för att läsa och förstå. Steg 4 är för att bocka av, och det förifylls från granskningen | Förstå → fråga → kontrollera → lämna in är en logisk ordning. Kraven visas på två ställen men har olika uppgift |
| Flikar på telefon | Visuell: Selector eller Stepper under 480 px. Företagaren och IA: korta etiketter | **Korta etiketter utan siffror på telefon** (Krav · Fråga · Granska · Lämna in), i fyra lika breda celler | Alla steg syns direkt, och ingen rad scrollar i sidled |
| Fast bottenrad på telefon | IA: en rad med flikens åtgärd | **Nej.** Bara stegraden är sticky, plus skrivfältet i steg 2. Varje steg slutar med ett kort "Nästa steg" | Två fasta fält tar för stor del av 844 px och riskerar att dölja fokus (WCAG 2.4.11) |
| Ord för passform | Företagaren: Passar. Förtroende: Verkar passa | **Verkar passa · Passar delvis · Verkar inte passa** | Motorn jämför bara CPV-koder och ord, inte skallkraven. Ett grönt "Passar" lovar för mycket |
| Källan på varje rad | Visuell: "s. 5" med bock. Förtroende: en textlänk utan ikon | **"s. 5" som diskret länk utan ikon.** Verifieringen sammanfattas en gång per vy. Ordet "Verifierat" försvinner helt | När alla rader har samma bock säger bocken ingenting. Avvikelserna ska synas |
| Granskningens gruppering | IA och Visuell: per status. Förtroende: per kravtyp. Företagaren: per åtgärd | **Per åtgärd:** Måste åtgärdas · Kontrollera själv · Ser bra ut, plus de neutrala grupperna Krav på uppdraget och Avtalsvillkor. Kravtypen visas som en Token på raden | Anna behöver veta vad hon ska göra först, inte hur motorn har klassat raden |
| Statusord i granskningen | Saknas, Obevisat, Oklart, Uppfyllt | **Hittades inte · Bevis saknas · Kontrollera själv · Ser bra ut** | Den regelbaserade motorn letar efter ord, så "saknas" påstår mer än den vet |
| Kravgrupper som är öppna från början | IA och Visuell: bara Skallkrav. Företagaren: Skallkrav och Kvalificeringskrav | **Skallkrav och Kvalificeringskrav är öppna,** övriga stängda | Kvalificeringskraven (försäkring, referenser) är det som oftast stoppar en förstagångsanbudsgivare. I demon är det just Annas luckor |
| Demobandet | Inköparen: fäll ihop det efter första besöket | **Alltid synligt, en rad, aldrig dolt** (beslut 0007). Detaljerna finns under "Om demon och AI". Bandet har neutral yta och en gul token "Demo", inte infoblått | Bandet uppfyller beslutet, men utan att ta en tredjedel av skärmen. Blått ska betyda att något är klickbart |
| Upplysning om motorn | IA: token vid rubriken. Förtroende: ursprungsrad överst. Företagaren: fotnot | **En ursprungsrad (AiProvenance) överst i varje automatiskt block.** Den har två lägen, "Granskad av inköp" och "Automatiskt framtaget · inte granskat av inköp", och en popover "Hur togs det här fram?". Inga fotnoter och inget prefix | Upplysningen ska läsas före innehållet, en gång |
| Var "ladda inte upp riktiga anbud" står | Förtroende: i bandet | **Vid uppladdningsytan** och i dialogen "Om demon och AI" | Där varningen går att följa |
| Påminnelsens datum | Företagaren: bara ny text. IA och Förtroende: fältet `deadline_at` i ReminderView | **Båda.** Rätt text nu, och fältet så att frontend inte räknar ut datumet själv (`due_at` kan vara "nu") | Ett fel datum i ett fristverktyg är det farligaste felet |
| Statusfilter i listan | Selector eller SegmentedControl | **SegmentedControl "Öppna · Planerade · Alla" med antal.** "Bara det som passar er" är en Switch för inloggad företagare | Status har tre lägen. Passform är ett av eller på |
| Källan | Idag: hopp till fliken Underlag. IA och Förtroende: alltid en dialog | **Alltid samma dialog på desktop och BottomSheet på telefon,** med påståendet, citatet, status i ord och den markerade sidan. `?flik=underlag` öppnar dialogen | Samma kontroll ska bete sig likadant överallt (WCAG 3.2.4) |
| Inköparens beslut | IA: Stepper i två steg. Inköparen: "Godkänn och publicera" i ett | **En primärknapp, "Godkänn och publicera",** i en sticky åtgärdsrad längst ned, med bekräftelsedialog. "Godkänn utan att publicera" ligger under Fler val. Tillståndet visas som en Stepper i sidhuvudet | Inget fastnar mellan godkänd och publicerad, och tillståndsmodellen i beslut 0001 ligger kvar |
| Knappar i träffkorten | Företagaren och Visuell: primär. IA: sekundär | **Sekundär** ("Öppna checklistan") | Upprepade knappar i en lista är aldrig primära |
| Högerspalten på upphandlingens sida | Visuell: Outline och Att göra. IA: Nästa steg | **Spalten visar stegets sammanhang:** steg 1 Outline, steg 2 reglerna för frågor, steg 3 integritet och teckenförklaring, steg 4 framsteg. Fristerna står i sidhuvudet och upprepas inte | Ingen dubblering |

---

## 3. Navigering och informationsarkitektur

**Företagare (inloggad):** Start · Upphandlingar · Regelhjälpen. Till höger finns en avatarknapp ("AB", Anna Berg, Målerifirman i Matfors AB). Den öppnar en Popover med Företagsprofil, Påminnelser och Logga ut.
**Anonym:** Upphandlingar · Regelhjälpen och knappen "Logga in".
**Inköpare:** Inköp (med Badge för antal att granska) · Upphandlingar · Regelhjälpen. Avatar "LH". Inköp har två flikar, **Att granska (n)** och **Företagens frågor**. "Ny upphandling" är en sekundärknapp i sidhuvudet. Jobben flyttar till sidan **Drift**, som nås via kontomenyn.

**Telefon:** Rad 1 har logomärke, ordmärke och avatar (56 px). På sidor på toppnivå har rad 2 de tre huvudvalen som understrukna flikar (44 px). På detaljsidor har rad 2 i stället en tillbakalänk ("‹ Upphandlingar"). Ingen hamburgare. Huvudet är statiskt, inte sticky.

**Adresser:** /start (ny, /bevakning omdirigeras), /upphandlingar, /upphandlingar/:id?flik=checklista|fraga|granska|inlamning (värdena behålls, etiketten "Krav" visas för checklista), ?flik=underlag eller ?citat= öppnar källdialogen ovanpå steg 1, /regelhjalpen, /profil, /paminnelser (behålls som djuplänk från mejlen), /inkop, /inkop/checklistor/:id, /inkop/drift (ny).

**Landning efter inloggning:** företagare till /start, inköpare till /inkop. Därefter tillbaka till rätt sida via ?till.

---

## 4. Sidstrukturer

### Ramen (alla sidor)
- **Demoband** överst: 36 px på desktop, högst två rader på telefon, yta #FBFCFF med kant nedtill. Gul Token "Demo" och texten "Påhittade företag och upphandlingar är märkta Fiktiv. AI kan ha fel – kontrollera alltid mot underlaget." samt länken "Om demon och AI", som öppnar en Dialog med `config.demo_notice`, `config.ai_disclosure` och motorn. Telefon: "Fiktiva uppgifter · AI kan ha fel" och länken "Mer".
- **Toppnav** 64 px på ytan #FBFCFF med kant nedtill (AppShell variant "section"). Innehållet följer sidbehållaren på 1 152 px. Vald menypunkt har accentfärgad text i semibold och en 2 px accentlinje under, i stället för dagens grå pill.
- **Sidans bakgrund** #F0F0F6 (`--color-background-body`, som inte används i dag). Det användaren agerar på ligger på vita kort (#FBFCFF) med 1 px kant och 12 px radie.
- **Bredder:** sidbehållare 1 152 px. Två spalter: innehåll 760 px och högerspalt 360 px med 32 px mellanrum. Formulär 640 px. Telefon har 16 px marginal.
- **Fot:** "Anbudshjälpen · Sundsvalls kommun · Om demon och AI · Tillgänglighetsredogörelse".

### Start (företagare)
1. H1 "Välkommen, Anna" och raden "Målerifirman i Matfors AB · 2 nya träffar · nästa frist om 25 dagar".
2. **Kortet "Nästa frist"** (vänsterkant i accent): "30 okt · om 25 dagar · Sista dag för frågor · Ommålning av Solbackens förskola, Matfors", med påminnelsestatus. Därunder "Därefter: Sista anbudsdag 9 nov".
3. **Nya träffar (2)** som kort: passform, titel, fristblock till höger, högst 3 skäl som ikonlista i klarspråk, "Visa alla skäl (n)", sekundärknappen "Öppna checklistan" och en ghost-knapp med stängikon, "Inte intressant" (med Toast "Dold · Ångra"). Ursprungsraden står en gång i kortets fot.
4. **Kommande upphandlingar** med SegmentedControl "För er · Alla", som en tidslinje: perioden till vänster och titeln till höger. "Förra gången krävdes" ligger i en Collapsible som heter "Förbered er: det här krävdes förra gången".
5. Högerspalt: korten **Dina påminnelser**, **Träffarna bygger på er profil** (Målning, Målning av byggnader, Ommålning · Sundsvall, Timrå · Ansvarsförsäkring 5 mnkr · "Ändra profil") och **Regelhjälpen**.

### Upphandlingar (lista)
- H1 och en rad intro: "Kommunens och regionens upphandlingar. De som är märkta Granskad checklista har full hjälp: krav, frågor och granskning."
- Sökfält på cirka 560 px, SegmentedControl "Öppna 12 · Planerade 1 · Alla 168" (förvalt Öppna) och knappen "Fler filter" (Popover med Källa och Köpare). För inloggad företagare även en Switch, "Visa bara det som passar er", som skickar profilens CPV-koder i den befintliga cpv-parametern.
- "12 öppna upphandlingar · närmast sista anbudsdag först". Backend sorterar på `deadline_at asc nulls last` när status är open.
- Raderna ligger i ett kort (padding 0) och hela raden är klickbar. Vänster: titeln i semibold med textfärg (högst 2 rader), "köpare · källa" och bara de tokens som säger något (passform, Granskad checklista, Fiktiv, Stänger snart). Höger: fristblocket. "Öppen för anbud" visas inte, eftersom det är standardläget. Långa köparlistor kortas till "Timrå kommun + 1 till". Radhöjd 80–88 px, så att 7–8 rader syns på första skärmen.
- Högerspalt: "Passar er (2)" och Kommande upphandlingar.
- Astryx Pagination ersätter den egna raden med föregående och nästa.

### Upphandlingens sida: sidhuvud (gemensamt för alla steg)
1. Breadcrumbs "Upphandlingar › …", H1, därefter "Sundsvalls kommun · DEMO-2026-0147" och tokens (Fiktiv, Verkar passa, Granskad checklista).
2. **Nyckeltalskort** i fyra kolumner (två × två på telefon):
   - **Sista anbudsdag:** 9 nov 2026, kl. 23:59 · om 35 dagar, och påminnelsestatus.
   - **Sista dag för frågor:** 30 okt 2026, om 25 dagar, och "Påminn mig".
   - **Uppskattat värde:** 900 000 kr, och platsen.
   - **Förfarande:** "Under EU:s beloppsgränser" med begreppsruta, och "19 kap. LOU".
3. En rad med två Collapsible-utlösare och en länk:
   - "Därför verkar den passa (4 skäl)", stängd.
   - "Om upphandlingen", stängd: beskrivning, CPV som benämningar, Publicerad och Plats.
   - "Underlaget · 17 sidor", som öppnar källdialogen på sida 1, och "Ladda ned".
4. **Sticky stegrad:** TabList med ① Krav · ② Fråga · ③ Granska · ④ Lämna in. Siffrorna står i cirklar på 20 px. Vald flik har accentfylld cirkel och accentlinje. När raden har fastnat visas "Sista anbudsdag 9 nov · om 35 dagar" längst till höger. Ett steg kan få en markering: en varningspunkt på steg 3 när granskningen hittade luckor, en bock när allt ser bra ut.
   Mål: stegraden börjar senast vid y ≈ 560 på desktop (i dag 1 040) och inom första skärmen på telefon (i dag 1 750).

### Steg 1 Krav
Ordning:
1. Ursprungsraden: "Granskad och publicerad av inköp, Sundsvalls kommun, 5 okt 2026 · Alla 86 källhänvisningar hittades i underlaget · Hur togs listan fram?"
2. **Det här behöver du göra**: fyra klickbara statistikrutor som är ankarlänkar till sina avsnitt (11 skallkrav · 10 kvalificeringskrav · 5 bilagor · Pris 70/Kvalitet 30).
3. **Sammanfattning**: 2–4 meningar som inköp har skrivit för företagen.
4. **Skallkrav (11)**, öppen.
5. **Kvalificeringskrav (10)**, öppen.
6. **Bilagor att lämna in (5 + 2 i vissa fall)**: dubbletter slås ihop, och villkorade bilagor läggs under "Bara i vissa fall".
7. **Så utvärderas anbuden**: en stapel som delas 70/30 i accent och accent-muted.
8. **Viktiga datum**:
   - "Före anbudet" är öppen. Raderna sorteras i datumordning, passerade datum blir grå och den avslutande ISO-dateringen tas bort ur texten.
   - "Efter anbudet och under uppdraget (6)" är stängd. Start- och slutrad slås ihop till ett intervall: "17 maj – 25 jun 2027 · Utvändig målning".
9. **Krav på uppdraget (34)**, stängd.
10. **Avtalsvillkor (3)**, stängd.
11. **Ord och begrepp (6)**, stängd.
12. **Nästa steg**: "Undrar du något om kraven?" och primärknappen "Ställ en fråga".

Raderna är kompakta, med minst 48 px höjd. De har titeln och "s. 5" till höger, och vid behov en neutral Badge "Bevis: Prisbilaga (bilaga 1)". Brödtexten visas bara när den skiljer sig från titeln efter normalisering (bort med avslutande punkt och "…"). Varje krav får ett ankare (#krav-K12) som matchningsskäl och granskningsrader kan länka till. Högerspalten innehåller Outline "På den här sidan" (sticky).

### Steg 2 Fråga
En samtalstråd i den ordning frågorna ställdes. Frågan står i en högerställd bubbla (accent-muted). Svaret är ett kort med ursprungsrad, en **fet ledmening**, "Det här står i underlaget:" och ett citat per punkt som Blockquote med "s. 8" sist. Tokenen "Står i underlaget" visas när svaret finns i underlaget. Alla svar avslutas med raden om likabehandling: "Ger underlaget inget entydigt svar? Ställ frågan i e-Avrop senast 30 oktober – då får alla leverantörer samma svar." och knappen "Påminn mig". Efter tråden kommer "Fler frågor du kan ställa" som chips, därefter skrivfältet (TextArea med 2 rader och primärknappen "Fråga", som är aktiv; ett tomt skick ger felet "Skriv en fråga på minst tre tecken"). Statusraden för skärmläsare blir VisuallyHidden. Utan språkmodell är ledmeningen "Det här står i underlaget:". Med språkmodell kräver prompten `besvara_fraga` en kort slutsats först. Högerspalten: "Bra att veta" (frågor ställs skriftligt i e-Avrop, och kommunen svarar senast 3 nov).

### Steg 3 Granska
- Före uppladdning: ytan för att välja fil, med "Utkastet sparas inte" och "Ladda inte upp riktiga anbud eller personuppgifter i demon" direkt vid ytan.
- Efter uppladdning krymper formuläret till en rad: filnamn, "Granskat i dag · utkastet sparades inte" och "Granska en ny version".
- **Utlåtandekort:** "3 saker behöver åtgärdas innan du lämnar anbudet", ProgressBar "10 av 21 skall- och kvalificeringskrav ser bra ut", fyra filterknappar med antal och raden "Bilagor i utkastet: 3 av 5" med en chip per bilaga.
- Grupper:
  - **Måste åtgärdas (3)**, öppen. Varje rad har röd vänsterkant, status och kravtyp, hela titeln, kommentaren, "Så visar du det: …" (från requirement.evidence), "Visa kravet · s. 8" och "Fråga om kravet", som öppnar steg 2 med frågan ifylld.
  - **Kontrollera själv (8)**, **Ser bra ut (10)**, **Krav på uppdraget (34)** och **Avtalsvillkor (3)** är stängda. De två sista är neutralt grå. När alla rader i en grupp har samma kommentar skrivs den en gång som grupptext.
- Kravtypen slås upp via `requirement_id` i `notice.checklist.checklist.requirements`, så ingen API-ändring behövs.
- **Nästa steg:** primärknappen "Granska en ny version" och sekundärknappen "Nästa: 4 Lämna in".

### Steg 4 Lämna in
- ProgressBar "x av 21 klara".
- Skall- och kvalificeringskrav samt bilagor som CheckboxList. De rader granskningen bedömde som "Ser bra ut" är förbockade och märkta "Granskat". Rader som "Hittades inte" är flaggade.
- Ett avslutande kort med primärknappen "Gå till e-Avrop och lämna anbudet". För en Fiktiv upphandling står i stället: "Den här upphandlingen är påhittad och finns inte i e-Avrop."
- Lugnande rad: "I e-Avrop kan du oftast ändra ditt anbud fram till sista anbudsdag."
- Bockarna sparas per upphandling i localStorage, som en bekvämlighet.

### Upphandling utan checklista (de flesta av TED-annonserna)
Inga steg. Under sidhuvudet visas en EmptyState: "Ingen granskad checklista ännu". Den förklarar varför (inget underlag ännu, eller att inköp granskar) och erbjuder "Öppna annonsen i TED", "Påminn mig före sista anbudsdag" och, bara när `has_documents` är sant, "Fråga underlaget". I passformen läggs skälet till: "Bedömt bara på CPV-kod och ord i annonsen. Det finns ingen granskad checklista att jämföra med."

### Källan (citatdialog)
Samma komponent för alla "s. N", oavsett var användaren klickar. Dialogen är 760 px på desktop och en BottomSheet på telefon. Fokus flyttas till titeln och tillbaka till länken när dialogen stängs.

Ordning i dialogen:
1. **Påståendet** (rubrik och ursprung, till exempel "Från: Därför verkar den passa").
2. **Status i ord:** "Citatet står på sida 7 och är markerat nedan", "Citatet står på sida 9 (AI angav 7)" eller "Citatet hittades inte i underlaget".
3. **Dokumentet:** filnamnet en gång, "17 sidor · Fiktiv", "Ladda ned" och kompakt Pagination.
4. **Sidan som papper:** högst cirka 72 tecken per rad, radavstånd 1,6, avsnittsrubriker (/^\d+(\.\d+)*\s/) i semibold, citatet markerat och inskrollat.
5. **Fot:** "Stämmer det inte? Det är alltid förfrågningsunderlaget som gäller. Ställ frågan i e-Avrop senast 30 okt."

Påståendet följer med i citationHref (parametern `pastaende`) eller i CitationTarget.

### Regelhjälpen
Samma samtalsmönster som Fråga.
- **Med regelmotorn:** rubriken "Paragrafer som handlar om din fråga". Varje paragraf blir ett kort, "LOU 20 kap. 1 § · Avtalsspärr", där utdraget kapas vid hel mening och slutar med " …", följt av "Läs hela paragrafen ↗". Den separata listan Källor tas bort.
- **Med språkmodell:** först en fet mening, till exempel "Avtalsspärren är 10 dagar om underrättelsen skickas elektroniskt, annars 15 dagar." Därefter korten.
- Exempelfrågorna ligger kvar efter svaret.

### Företagsprofil
- **Sammanfattningskort överst:** "Profilen styr vilka upphandlingar som visas på Start och om de märks Verkar passa. Just nu: 2 träffar".
- **CPV-koder:** tokens med benämningen först ("Målning · 45442100"). Avsnittet heter "Vad ni gör (CPV-koder)" och har hjälptexten "EU:s kodlista för vad som upphandlas. Ni behöver inte kunna koderna – tryck Föreslå."
- **Fält:** Kommuner och Certifieringar blir Tokenizer. Korta fält står två och två i en Grid. Fälten får tips om vad kraven brukar vara, till exempel "Ansvarsförsäkring: kommunen kräver ofta minst 5 mnkr".
- **Spara:** spara-raden blir sticky när något har ändrats. Efter sparning visas Toast "Profilen är sparad · 2 upphandlingar verkar passa er" med "Se träffarna".

### Påminnelser
Avsnitten "Kommande" och "Skickade". Varje påminnelse är ett kort med fristblock, titellänk, "Påminnelse om sista anbudsdag · Sista anbudsdag 9 nov kl. 23:59", "Mejlas fredag 7 november kl. 08:00 · om 33 dagar" och ghost-knappen "Ta bort" med papperskorgsikon på titelraden. "Väntar" blir "Skickas om 33 dagar", och "Skickad" blir "Skickad 7 nov". Det tomma läget föreslår de närmaste fristerna från träffarna.

### Logga in (demo)
- H1 "Välj vem du är i demon" och raden "Ingen riktig inloggning. I tjänsten loggar företag in med e-legitimation." Den gula bannern tas bort.
- **Två ClickableCard sida vid sida** (staplade på telefon). Varje kort har avatar ("AB", "LH"), namn, en Badge med rollen (Företagare, Inköpare) och tre punkter om vad man kan göra. Där står också "Du kommer till: Start" respektive "Du kommer till: Att granska", och knappen "Fortsätt som Anna" eller "Fortsätt som Lars".
- Hela demotexten står i en muted Section under korten.

### Inköp: Att granska (kö)
- **Table** med kolumnerna Upphandling (länk) · Sista anbudsdag (fristblock) · Status · Källor ("41/41" med bock, eller en gul token "3 att kontrollera") · Krav · Tolkad · knappen "Granska".
- Sorteras på sista anbudsdag. Backend lägger till `deadline_at` i ChecklistAdminItem.
- SegmentedControl "Att hantera (1) · Publicerade · Avvisade · Alla". Att hantera omfattar utkast och godkända, så att inget fastnar.
- Äldre utkast för samma upphandling märks "Ersatt av nyare tolkning".
- Underlag som inte kunde tolkas visas som Banner överst.

### Inköp: Granska checklista (granskningsbord)
- **Sidhuvud:** H1 med upphandlingens namn, raden "Granska checklista" ovanför och en Stepper som visar Utkast → Godkänd → Publicerad. Under den en MetadataList: Sista anbudsdag, Sista dag för frågor, Underlag (8 sidor), Tolkad och Källor (41 av 41).
- **Automatiska kontroller** som länkar till sina rader: sista anbudsdag mot annonsen, utvärderingskriterier som saknas, kravtyp som inte stämmer med avsnittets rubrik och motortext i sammanfattningen.
- **Två rutor från 1 200 px** (Layout med LayoutPanel och Resizable):
  - Vänster: lista med filtret "Alla · Att kontrollera · Ändrade · Kontrollerade". Varje rad har en kryssruta "Kontrollerad". Ändra och Ta bort ligger i en MoreMenu.
  - Höger, sticky: "Källan i underlaget" med PageViewer, där vald rad visar sin sida med citatet markerat. Formuläret för Ändra öppnas ovanför sidan i samma ruta. Med "Använd markeringen som citat" kan markerad text bli citat.
  - Under 1 200 px används Dialog eller BottomSheet som i dag.
- **Allt företagen ser går att redigera:** datum, bilagor, utvärdering, begrepp, öppna frågor och sammanfattning. Ändringar sparas automatiskt med PUT, så att citatkontrollen svarar direkt. Ta bort ger en Toast med "Ångra".
- **Sticky åtgärdsrad längst ned:** till vänster ProgressBar "Kontrollerat 12 av 36" och sparstatus, till höger "Avvisa…" (ghost, destruktiv), "Fler val" och primärknappen "Godkänn och publicera" med bekräftelsedialog. Dialogen innehåller anteckningen och nämner påminnelserna som schemaläggs.
- **Efter publicering:** Toast "Checklistan är publicerad" och "Granska nästa (n kvar)".
- **Avvisad eller tillbakadragen:** Banner med motiveringen och "Öppna som utkast igen". Godkänn visas bara för status draft.

### Inköp: Företagens frågor och Drift
- **Företagens frågor:** Table med Upphandling · Sista anbudsdag · Frågor · Utan svar i underlaget (n, %) · Till e-Avrop. Talen högerställs, och noll visas som ett dämpat "–". Rättviseregeln står en gång ovanför tabellen. Dolda rader har låsikon och "Visas från 10 nov".
- **Drift:** jobben grupperas i Hämta, Bearbeta och Skicka. Varje rad har StatusDot (Klar, Misslyckades, Pågår, Inte körd), relativ tid, en rad ur stats och knappen "Kör nu" (liten, sekundär). Misslyckade jobb visas först. e-Avrop visas som "Inte aktiverad – väntar på tillstånd".

---

## 5. Visuellt system

**Ytor.** Sidans bakgrund är #F0F0F6. Kort, toppnav, demoband och sticky rader är #FBFCFF med 1 px kant #1B1B1F1A (cirka #E5E5E9 mot kort). Muted Section inuti kort är #1B1B1F0D (cirka #F0F0F4). Kort har ingen skugga. Sticky rader får `--shadow-low`, dialoger `--shadow-high`.

**Färg har betydelse:**
- **Accent #004595** används bara för det som går att klicka på, vald navigering och vald flik.
- **Grön** (bakgrund #24BB5E33, text #09441F, ikon #0D8626) betyder bra: Verkar passa, Ser bra ut, Granskad checklista, källa hittad.
- **Gul** (bakgrund #E2A40033, text #753F07, kant #C58600) betyder uppmärksamhet: Passar delvis, Bevis saknas, frist inom 7 dagar och Demo.
- **Röd** (bakgrund #E3193B33, text #7B0210, felfärg #AA181D) betyder att något saknas eller är fel.
- **Neutral grå** (bakgrund #0A131733, text #0A1317) betyder beskrivande metadata: kategori, källa, Tilldelad, Stängd och Fiktiv (med infoikon).
- Lila, cyan, teal och orange används inte längre för status.
- Status visas alltid med ikon och ord, aldrig bara med färg.

**Typografi:** systemtypsnitt.
- H1 28/40, H2 23/32, H3 19/28 och H4 16/24, alla i semibold.
- Brödtext 16/24 och stödtext 13/20.
- Fristens datum och statistikrutornas siffror: 23/28 och 28/32 i semibold med `tabular-nums`.

**Rytm:** 16 px mellan rader, 24 px mellan grupper och 40 px mellan avsnitt (`--spacing-4`, `--spacing-6`, `--spacing-10`).

**Radier:** 4 px för markering och tokens, 8 px för kontroller och 12 px för kort och dialoger.

**Ikoner:** Astryx semantiska ikoner (success, warning, error, info, close, calendar, clock, externalLink, trash, moreHorizontal).

**Logomärke:** Toppen, en egen SVG på 28 px: två vinklar i varandra som bildar ett A, vitt och klarblått på en nästan svart ruta (beslut 0015). Det sitter före ordmärket "Anbudshjälpen" (19 px semibold) med "Sundsvalls kommun" i 13 px under. Kommunvapnet används inte utan klartecken.

**Theme overrides i `eneo.theme.ts`** (i stället för egen CSS):
- `top-nav-item` i vald stil: accentfärg, semibold och 2 px linje i stället för grå bakgrund.
- `tab`: den grå tryckta bakgrunden som ligger kvar efter klick tas bort.
- `token` gray för Fiktiv.
- `banner` för demobandets neutrala yta.

**Mörkt läge** följer temat automatiskt. Inga nya färgvärden behövs.

---

## 6. Delade komponenter (byggs en gång och används överallt)

| Komponent | Grund i Astryx | Beteende |
|---|---|---|
| **PhaseStrip** | Token, Link, Dialog | En rad, alltid synlig och inte stängbar. "Om demon och AI" öppnar en Dialog |
| **DeadlineBlock** | Text, Icon, Token | "9 nov" i 19–23 px semibold, "kl. 23:59" och "om 35 dagar". Vid 7 dagar eller färre: gul token med klockikon. Passerat datum: grått med texten "passerat". Varianterna inline, stack och kompakt |
| **ReminderState** | Button, Icon, Link | "Påminn mig" som ghost-knapp med kalenderikon. När en påminnelse finns: "Påminnelse mejlas 7 nov" med success-ikon och "Ändra". Läser `useReminders()` och visas likadant överallt |
| **SourceLink** | Link, Token | "s. 5" i 13 px accent, utan ikon. Tillgängligt namn: "Visa källan för ”Anbudet är skrivet på svenska”, sida 5". Fel sida ger en blå Token "s. 9 (AI angav 7)", inte hittad en gul Token "Hittades inte i underlaget". Öppnar alltid SourceDialog |
| **SourceDialog** | Dialog / BottomSheet, Blockquote, Pagination | Påstående, status, citat och sida (se 4) |
| **AiProvenance** | HStack, Icon, Popover | "Granskad av inköp 5 okt 2026 · Alla 86 källhänvisningar hittades" eller "Automatiskt framtaget · inte granskat av inköp", med popovern "Hur togs det här fram?". Motorn namnges en gång: regelbaserat eller AI via Eneo |
| **FitToken** | Token | Verkar passa (grön, success) · Passar delvis (gul, warning) · Verkar inte passa (grå, close) |
| **StatusToken** | Token | Hittades inte (röd, error) · Bevis saknas (gul, warning) · Kontrollera själv (grå, info) · Ser bra ut (grön, success) |
| **StatTile** | ClickableCard | Siffra i 28 px, etikett och stödrad. Ankarlänk eller filter |
| **ResultSummary** | Section, ProgressBar, SegmentedControl | Rubrik med siffra, framstegsstapel och statistikrutor som filtrerar |
| **NextStepCard** | Card | Vänsterkant 4 px i accent, "Nästa steg", en mening och en knapp |
| **RequirementRow** | Item | Titel, valfri Badge "Bevis: …" och SourceLink. Brödtexten visas bara när den skiljer sig från titeln |
| **CollapsibleSection** | Collapsible / CollapsibleGroup | Rubrik med antal i Badge, en hjälprad och angivet standardläge (öppen eller stängd). Antalet ingår i utlösarens namn |
| **MatchCard** | Card | Passform, titel, DeadlineBlock, högst 3 skäl, "Visa alla skäl (n)", sekundär åtgärd, "Inte intressant" och AiProvenance |
| **Glossary** | TermText | `lib/glossary.ts` porteras från `docs/glossary.md`: skallkrav, frågestopp, förfarande och tröskelvärde, CPV-kod, e-Avrop, TED, avtalsspärr, ESPD, BAS-U och F-skatt |

---

## 7. Regler för text

- **Tilltal:** "du" till personen i handlingar ("Påminn mig", "ditt utkast"). "Ni" och "er" om företaget ("passar er", "er profil").
- **Datum:** "9 nov" i listor och "9 november 2026" i löptext. Relativ tid står alltid intill: "om 35 dagar", "i dag", "i morgon". Klockslag skrivs "kl. 23:59".
- **Belopp:** "900 000 kr" och "5 000 000 kr", i kort form "5 mnkr".
- **Knappar:** verbet först, högst tre ord, och de säger vad som händer: "Ställ en fråga", "Granska en ny version", "Fortsätt som Anna".
- **Status:** säger vad användaren ska göra, inte vad motorn gjorde.
- **Förbjudna ord** i företagarens vy: språkmodell, heuristik, verifierat, obevisat, styrka. CPV-kod utan benämning. "Automatisk sammanställning utan språkmodell:" (HEURISTIC_PREFIX) som inledning.
- **Fackord** förklaras vid klick, inte i varje mening.
- **Inga emojis.** Ett enda utropstecken är tillåtet, i bekräftelsen "Klart!".

| I dag | Målbild |
|---|---|
| Passar / Passar inte | Verkar passa / Verkar inte passa |
| Styrka: … / Hinder: … / Oklart: … | Rubrik "Därför verkar den passa", rader med ikon. "Det här kan stoppa er". "Kontrollera själv" |
| Profilens CPV-kod 45442100 ligger nära annonsens 45442100 | Upphandlingen gäller målning – det gör ni. |
| Sida 7 · Verifierat citat | s. 7 |
| 86 av 86 citat hittades på angiven sida | Alla 86 källhänvisningar hittades i underlaget |
| Saknas · Obevisat · Oklart · Uppfyllt | Hittades inte · Bevis saknas · Kontrollera själv · Ser bra ut |
| Annonserad upphandling under tröskelvärdena enligt 19 kap. LOU | Under EU:s beloppsgränser (19 kap. LOU), med begreppsruta |
| CPV-koder 45442100, 45442110, 45442180 | Målning · Målning av byggnader · Ommålning |
| Checklista finns | Granskad checklista |
| Token "Öppen för anbud" på varje rad | Visas inte. "Stänger snart" vid 7 dagar eller färre |
| Sista anbudsdag: 7 november 2026 kl. 08:00 (påminnelse) | Sista anbudsdag 9 nov kl. 23:59 · Mejlas 7 nov kl. 08:00 |
| Väntar | Skickas om 33 dagar |
| Påminnelse skapad till 7 november 2026 kl. 08:00 | Klart! Du får ett mejl 7 november kl. 08:00, två dagar före sista anbudsdag. Se dina påminnelser |
| Påminn mig före sista anbudsdag 9 november 2026 (två likadana knappar) | En ReminderState vid fristen: "Påminn mig", därefter "Påminnelse mejlas 7 nov" |
| Checklista · Fråga underlaget · Granska utkast · Underlag · Inför inlämning | 1 Krav · 2 Fråga · 3 Granska · 4 Lämna in |
| Frågor som rör ditt eget anbud ställer du formellt i e-Avrop. | Är något oklart? Ställ frågan i e-Avrop senast 30 oktober, så får alla leverantörer samma svar. |
| Svaret på frågan ”…” visas överst. (synlig) | Bara för skärmläsare |
| AI-genererat svar (regelbaserad sammanställning utan språkmodell) | Automatiskt framtaget · inte granskat av inköp |
| Logga in som Anna Berg, Målerifirman i Matfors AB | Fortsätt som Anna |
| Bevakning (meny) | Start |
| Visa: Att granska (Selector) | Att hantera (1) · Publicerade · Avvisade · Alla |
| Godkänn / Avvisa överst | Godkänn och publicera / Avvisa… i åtgärdsraden längst ned |

---

## 8. Före och efter

| Område | I dag | Målbild | Varför |
|---|---|---|---|
| Demoband | Två stycken, 110 px på desktop och cirka 270 px på telefon, infoblått | En rad på 36 px (högst två rader på telefon), neutral med gul "Demo" | Innehållet syns på första skärmen, och blått betyder "klickbart" |
| Ytor | Allt på en vit yta med 1 px avdelare | Grå bakgrund och vita kort för det som går att agera på | Det syns vad som hör ihop och vad som är klickbart |
| Nav | 5–6 likvärdiga val och en grå pill | 3 val, accentlinje och avatarmeny | Färre beslut, och varumärket syns |
| Lista | 4 textrader per post, 3 poster på första skärmen, sorterad på publicering, "Alla" förvalt | 2-spaltiga klickbara rader, 7–8 på första skärmen, Öppna förvalt, sorterad på frist | Företagaren letar efter öppna jobb sorterade efter hur bråttom det är |
| Upphandlingens huvud | 7 lika viktiga fakta, beskrivning och ett helt avsnitt om passform. Flikarna vid y ≈ 1 040 | 4 nyckeltal och resten i Collapsible. Stegen vid y ≈ 560 | Det viktigaste beslutet och arbetsytan hamnar ovanför vecket |
| Checklista | 13 623 px, allt utfällt, titeln upprepad, 86 chips | Cirka 3 900 px, grupper med antal, 2 av 8 öppna, titeln en gång, "s. 5" | Det som kan diskvalificera syns direkt |
| Datum | 14 rader med generisk etikett, ISO-dubblett och fel ordning | 6 före anbudet (öppna) och 6 efter (stängda), intervall och datumordning | Anna behöver det som gäller före 9 november |
| Granskning | 58 likadana rader, cirka 8 240 px, 25 röda | Utlåtande, 3 rader att åtgärda och resten stängt, cirka 1 700 px | En att göra-lista i stället för en felrapport |
| Fråga | Formulär överst, svar i ett löpande stycke, chips i klump | Tråd, ledmening, citat som punkter med sida och rad om likabehandling | Samtalsform och slutsats först |
| Källa | Hopp till fliken Underlag utan sammanhang, citatet stöder inte påståendet | Samma dialog överallt, med påstående, status och sida | Påstående och belägg kan bedömas tillsammans |
| Påminnelser | Fel datum märkt "Sista anbudsdag" | Fristen och utskicket som två fakta | Rätt fakta |
| Inköparens granskning | Beslutet överst och en modal per citat | Granskningsbord med källan bredvid och beslutet sist | Snabbare och säkrare granskning |
| Logga in | Smal kolumn med långa knappar och dubbla varningar | Två rollkort med avatar | Ett genomtänkt första intryck |

---

## 9. Fixa först (fel som skadar förtroendet)

1. **Fel citat för försäkring.** I `backend/src/anbudsklar/ai/heuristic.py` ger `_PROFILE_CHECKS` med `re.compile(r"försäkring")` träff i "socialförsäkringsavgifter". Byt till `r"(?<!social)försäkring"` eller `r"\b(ansvars)?försäkring"`. Lägg till ett test som visar att skälet citerar meningen under 3.4 Ansvarsförsäkring på sida 7. Kontrollera mönstren för referens och omsättning på samma sätt.
2. **Påminnelsens datum** (RemindersPage, ReminderAction): ny text enligt avsnitt 7 och `deadline_at` i ReminderView.
3. **Godkänn på avvisad checklista** (ChecklistReviewPage): knappen visas bara för status draft. För rejected visas "Öppna som utkast igen". Lägg till ett test.
4. **Titeln upprepas som brödtext** (RequirementItem): normaliserad jämförelse, så att brödtexten bara visas när den skiljer sig.
5. **HEURISTIC_PREFIX:** ta bort prefixet ur texten som visas, och lägg motorn i AiProvenance.
6. **Ordet "Verifierat":** ändra `citationStatus` i `lib/labels.ts` till "Står på sida N" (för dialog och skärmläsare).

## 10. Tillgänglighet (WCAG 2.2 AA)

- **Sticky element (2.4.11):** stegraden och åtgärdsraden får `scroll-padding-top` och `scroll-padding-bottom` lika med sin höjd, så att fokus aldrig hamnar under dem.
- **Unika namn (2.4.4 och 2.4.6):** varje SourceLink får ett unikt namn som innehåller vad källan belägger.
- **Markering (1.3.1):** `<mark>` kompletteras med VisuallyHidden-texten "Markerat citat:" före och "slut på citatet" efter. Forced colors behålls.
- **Dialoger (3.2.4):** samma beteende överallt. Fokus till titeln och tillbaka till utlösaren.
- **Primärknappar** är aktiva och validerar vid skick, i stället för att vara avaktiverade med 2:1 kontrast.
- **Collapsible:** antalet ingår i namnet, till exempel "Krav på uppdraget, 34 krav".
- **Fokus** hamnar på H1 vid navigering, som i dag. Touchmål på 44 px för grov pekare (finns i temat).
- **Ombrytning (1.4.10):** tokens och knappar bryts vid 320 px, som i dag.
- **Kontrast:** text i demobandet, #454650 på #FBFCFF, cirka 9:1. Gul tokentext, #753F07 på #F6EACC, över 7:1.

## 11. Så vet vi att det blev bättre

- Upphandlingens sida i standardläget: högst 4 000 px på desktop (i dag 13 623) och högst 7 000 px på telefon (i dag 20 619).
- Stegraden börjar senast vid y = 600 på desktop och inom 844 px på telefon.
- Demobandet: högst 36 px på desktop och 52 px på telefon.
- Listan: minst 7 rader på första skärmen vid 1440 × 900.
- Granskningsresultatet: högst 1 800 px i standardläget.
- Panelens test: Anna kan på under en minut säga vilka två bilagor hon saknar, och när frågestoppet är.

## 12. Ordning för genomförande

1. Fel enligt avsnitt 9.
2. Ramen: demoband, ytor, nav och theme overrides.
3. Upphandlingens sida: sidhuvud, steg och sticky rad, och checklistan med CollapsibleSection, SourceLink och AiProvenance.
4. Granska, Fråga och SourceDialog.
5. Start, listan, profilen, påminnelserna och Regelhjälpen.
6. Inköp: kön, granskningsbordet, Företagens frågor och Drift.

**Om mockuperna.** Varje artboard använder riktiga data ur appen och `data/fixtures`. Granskningsresultatet följer facit i `anbudsutkast-malerifirman/expected-review.json`, alltså det granskningen ska kunna hitta. Med den regelbaserade motorn blir antalen andra, men strukturen är densamma.