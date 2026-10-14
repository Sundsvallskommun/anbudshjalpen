# PoC

Syfte: Beskriva vad PoC:n ska visa, för vem, i vilken ordning vi bygger och hur vi vet att den är bra.

Läs detta när: Du planerar arbetet, förbereder en demo eller ska avgöra vad som får mockas.

Hör ihop med: [Arkitektur](architecture.md), [Öppna frågor](open-questions.md), [Bakgrund](background.md),
[Kvalitetstest](quality-test.md), [Design](design.md)

> **Under arbete.** Beslut 0002–0007 gäller. Hur man kör PoC:n står i [Utveckling](development.md), och hur
> gränssnittet är uppbyggt i [Design](design.md).

## Mål

Visa verksamheten hur det skulle fungera och se ut, med riktiga offentliga data där det går. Kvaliteten ska gå att
mäta, inte bara se bra ut i en demo.

## Demoresan

Resan följer underlagets påhittade målerifirma i Matfors, som har fem anställda och aldrig har lämnat anbud. I demon
loggar man in som Anna Berg på firman ([beslut 0007](decisions/0007-poc-login-persona-picker.md)).

1. **Profil:** firman beskriver sig i klartext, och Anbudshjälpen föreslår CPV-koder med förklaring.
2. **Start:** träffarna visas som kort, markerade Verkar passa eller Passar delvis, med högst tre skäl och källan
   ("s. 5"). Övriga träffar ligger i en stängd lista, "Verkar inte passa (n)", under korten. Överst står nästa frist
   med Påminn mig, och under träffarna kommande upphandlingar utifrån avtalskatalogen. Gamla adressen /bevakning leder
   hit.
3. **Träff:** ett mejl som visas i Mailpit, med länk till upphandlingen och till Start.
4. **Krav:** upphandlingens sida har två steg, 1 Krav och 2 Granska
   ([beslut 0024](decisions/0024-granska-ar-sista-steget.md)). Steg 1 visar skallkrav,
   kvalificeringskrav, bilagor, utvärdering och datum, där varje punkt länkar till sidan i underlaget ("s. 5") och
   termerna förklaras vid klick. "Påminn mig" finns vid sista anbudsdag och sista dag för frågor i sidhuvudet, och på
   checklistans första daterade rad för frågestopp och för sista anbudsdag, alltså de datum som påminnelsen gäller.
   Sidhuvudets knapp för sista anbudsdag använder datumet ur den publicerade checklistan, eller annars annonsens. I ett
   selektivt förfarande anger annonsen bara sista dag för anbudsansökan, och sidhuvudet påminner om den i stället.
   Knappen visas bara för en öppen upphandling och aldrig för ett datum som har passerat, och för frågestoppet bara när
   checklistan är publicerad.
5. **Fråga AI:** en panel som öppnas på varje sida ([beslut 0014](decisions/0014-fraga-ai-panel.md)), med svar med
   citat och slutsatsen först. Om underlaget inte ger svar föreslår Anbudshjälpen att firman ställer frågan formellt i
   e-Avrop före frågestoppet och skapar en påminnelse, när den publicerade checklistan anger ett frågestopp som inte
   har passerat. Samtalet följer med mellan sidorna och går att spara som PDF. I steg 1 står de svar inköp redan har
   publicerat i e-Avrop på andra leverantörers frågor, samma för alla ([beslut 0013](decisions/0013-fragor-och-svar-fran-eavrop.md)).
6. **Granska:** firman laddar upp ett utkast, anbudet och det som ska bifogas, och får först ett besked, till exempel hur många saker som bör
   åtgärdas, och sedan kraven grupperade som Bör åtgärdas, Kontrollera själv och Ser bra ut. Inget sparas.
7. **Lämna in:** sker i e-Avrop. Granska slutar med kortet "Lämna anbudet", med sista anbudsdag och länken till
   e-Avrop. Något eget steg för inlämningen finns inte längre.
8. **Tilldelning:** Anbudshjälpen förklarar beslutet och vad avtalsspärren innebär.

Regelhjälpen svarar på allmänna frågor om upphandling med hänvisning till LOU, kommunens inköpsstrategi och
vägledningar. Varje paragraf eller avsnitt som svaret bygger på visas med källans egna ord, och ett avsnitt ur
strategin är märkt som kommunens styrdokument, inte lag
([beslut 0022](decisions/0022-kommunens-styrdokument-som-kalla.md)).

För den som visar demon finns växeln "Visa hur underlaget lästes" under "Om demon och AI". Upphandlingens sida får då
knappen "Så lästes underlaget", som visar vad som hände med varje fil från hämtningen till checklistan, se
[Design](design.md#upphandlingens-sida). Valet sparas i webbläsaren och ändrar inget för andra.

Inköparens vy (demopersonen Lars Holm) har tre flikar: Att granska, där inköparen granskar, rättar, godkänner och
publicerar checklistan innan företagen ser den, Företagens frågor med de sammanställda frågorna, och Möjliga
anbudsgivare, där inköparen beskriver ett tänkt uppdrag eller utgår från ett avtal som snart ska upphandlas igen och
ser vilka företag som verkar kunna svara ([beslut 0023](decisions/0023-mojliga-anbudsgivare-for-inkop.md)). Jobben
finns på sidan Drift i kontomenyn.

## Plan

1. **Kvalitetstest av tolkningen.** `anbudsklar eval` kör uppgiften "tolka underlag" på underlag med facit,
   kontrollerar citaten och räknar täckning och precision. Det testar konceptets största osäkerhet. Se
   [Kvalitetstest](quality-test.md).
2. **En tunn version genom hela kedjan.** Annonser från TED, ett underlag som blir en checklista med kontrollerade
   citat och en vy i React med Astryx.
3. **Resten av resan:** matchning och Start, frågor, granskning, inköparens vy med godkännande, Regelhjälpen och
   kommande upphandlingar.
4. **Testmiljö:** Anbudshjälpen och en Eneo-testinstans i Dokploy, så att verksamheten och panelen kan prova.

## Uppsättning

| Tjänst | Innehåll |
|---|---|
| `app` | FastAPI med API, MCP-server och den byggda webbappen i en container |
| `worker` | Samma image, kör de schemalagda jobben |
| `db` | Postgres |
| `mailpit` | Mejlkorg som fångar träffar och påminnelser |

AI-motorn är en Eneo-testinstans som nås via API. Utan Eneo används motorn `openai` eller `heuristic`. Se
[Arkitektur](architecture.md#ai-motorn).

## Riktigt och mockat

| Del | I PoC:n |
|---|---|
| Annonser | Riktiga från TED, och från e-Avrops API när kommunens nyckel är inlagd, se [Datakällor](data-sources.md) |
| Underlag | Tre påhittade underlag med facit, tills inköp kan lämna 3–5 avslutade upphandlingar |
| LOU | Riktig, från Riksdagens öppna data |
| Kommunens inköpsstrategi | Riktig, kommunfullmäktiges beslut 2023-09-25 återgivet i repot |
| Vägledningar och sundsvall.se | Riktiga, som kunskap i Eneo för Regelhjälpen |
| CPV-koder | Riktiga: EU:s officiella lista med svenska benämningar |
| Avtalskatalog | Påhittad och märkt, tills inköp kan lämna ett utdrag |
| Företag och personer | Påhittade och märkta |
| AI | Riktiga anrop via Eneo, eller direkt till en modell |
| Inloggning | Val av demoperson |
| Bolagsverket | Används inte |
| Utskick | Mailpit |

## Så vet vi att den är bra

- **Facit från inköp:** inköparen markerar vilka skallkrav som faktiskt finns i varje underlag. Vi mäter hur många av
  dem AI:n hittar och hur många felaktiga den lägger till.
- **Citatkontroll:** andelen påståenden vars citat faktiskt står på den angivna sidan. Det som inte kan kontrolleras
  markeras i gränssnittet.
- **Panelens omdöme:** några företag provar demoresan och säger vad de förstod.

## Beroenden

- En Eneo-testinstans med en modell som klarar svenska, långa dokument, JSON-svar och verktygsanrop. Se
  [Öppna frågor](open-questions.md).
- Kvalitetstestet på riktiga underlag behöver underlag och facit från inköp.
