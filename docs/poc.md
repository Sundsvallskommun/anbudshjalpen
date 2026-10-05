# PoC

Syfte: Beskriva vad PoC:n ska visa, för vem, i vilken ordning vi bygger och hur vi vet att den är bra.

Läs detta när: Du planerar arbetet, förbereder en demo eller ska avgöra vad som får mockas.

Hör ihop med: [Arkitektur](architecture.md), [Öppna frågor](open-questions.md), [Bakgrund](background.md),
[Kvalitetstest](quality-test.md)

> **Under arbete.** Beslut 0002–0007 gäller. Hur man kör PoC:n står i [Utveckling](development.md).

## Mål

Visa verksamheten hur det skulle fungera och se ut, med riktiga offentliga data där det går. Kvaliteten ska gå att
mäta, inte bara se bra ut i en demo.

## Demoresan

Resan följer underlagets påhittade målerifirma i Matfors, som har fem anställda och aldrig har lämnat anbud. I demon
loggar man in som Anna Berg på firman ([beslut 0007](decisions/0007-poc-login-persona-picker.md)).

1. **Profil:** firman beskriver sig i klartext, och Anbudsklar föreslår CPV-koder med förklaring.
2. **Bevakning:** träffar markeras som passar, passar delvis eller passar inte, med skäl och källa. Där syns också
   kommande upphandlingar utifrån avtalskatalogen.
3. **Träff:** ett mejl som visas i Mailpit.
4. **Checklista:** skallkrav, bilagor, utvärdering och datum, där varje punkt länkar till sidan i underlaget och
   termerna förklaras vid klick. "Påminn mig före <datum>" finns på checklistans första daterade rad för frågestopp
   och för sista anbudsdag, alltså de datum som påminnelsen gäller. I annonsens sidhuvud finns samma knapp för sista
   anbudsdag, med datumet ur den publicerade checklistan eller annars annonsens. Knappen visas aldrig för ett datum
   som har passerat eller för en checklista som inte är publicerad.
5. **Frågor:** svar med citat. Om underlaget inte ger svar föreslår Anbudsklar att firman ställer frågan formellt i
   e-Avrop före frågestoppet och skapar en påminnelse, när den publicerade checklistan anger ett frågestopp som inte
   har passerat.
6. **Granskning:** firman laddar upp ett utkast och ser krav för krav vad som saknas eller är obevisat. Inget sparas.
7. **Inlämning:** sker i e-Avrop. Anbudsklar visar en sista kontroll.
8. **Tilldelning:** Anbudsklar förklarar beslutet och vad avtalsspärren innebär.

Regelhjälpen svarar på allmänna frågor om upphandling med hänvisning till LOU och vägledningar.

Inköparens vy (demopersonen Lars Holm) visar att inköparen granskar och godkänner checklistan innan den publiceras,
plus sammanställda frågor och kommande upphandlingar.

## Plan

1. **Kvalitetstest av tolkningen.** `anbudsklar eval` kör uppgiften "tolka underlag" på underlag med facit,
   kontrollerar citaten och räknar täckning och precision. Det testar konceptets största osäkerhet. Se
   [Kvalitetstest](quality-test.md).
2. **En tunn version genom hela kedjan.** Annonser från TED, ett underlag som blir en checklista med kontrollerade
   citat och en vy i React med Astryx.
3. **Resten av resan:** bevakning och matchning, frågor, granskning, inköparens vy med godkännande, Regelhjälpen och
   kommande upphandlingar.
4. **Testmiljö:** Anbudsklar och en Eneo-testinstans i Dokploy, så att verksamheten och panelen kan prova.

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
| Annonser | Riktiga från TED. e-Avrop hämtas inte förrän vi har tillstånd, se [Datakällor](data-sources.md) |
| Underlag | Tre påhittade underlag med facit, tills inköp kan lämna 3–5 avslutade upphandlingar |
| LOU | Riktig, från Riksdagens öppna data |
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
