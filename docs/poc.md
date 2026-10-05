# PoC

Syfte: Beskriva vad PoC:n ska visa, för vem och hur vi vet att den är bra.

Läs detta när: Du planerar arbetet, förbereder en demo eller ska avgöra vad som får mockas.

Hör ihop med: [Arkitektur](architecture.md), [Öppna frågor](open-questions.md), [Bakgrund](background.md)

> **Under diskussion.** Teknikval utöver beslut 0002 och 0003 är inte gjorda.

## Mål

Visa verksamheten hur det skulle fungera och se ut, med riktiga offentliga data där det går. Kvaliteten ska gå att
mäta, inte bara se bra ut i en demo.

## Demoresan

Resan följer underlagets fiktiva målerifirma i Matfors, som har fem anställda och aldrig har lämnat anbud.

1. **Profil:** firman beskriver sig i klartext, och Anbudsklar föreslår CPV-koder med förklaring.
2. **Bevakning:** träffar markeras som passar, passar delvis eller passar inte, med skäl och källa. Där syns också
   kommande upphandlingar utifrån avtalskatalogen.
3. **Träff:** ett mejl som visas i en lokal mejlkorg.
4. **Checklista:** skallkrav, bilagor, utvärdering och datum, där varje punkt länkar till sidan i underlaget och
   termerna förklaras vid klick.
5. **Frågor:** svar med citat. Om underlaget inte ger svar föreslår Anbudsklar att firman ställer frågan formellt i
   e-Avrop före frågestoppet och skapar en påminnelse.
6. **Granskning:** firman laddar upp ett utkast och ser krav för krav vad som saknas eller är obevisat. Inget sparas.
7. **Inlämning:** sker i e-Avrop. Anbudsklar visar en sista kontroll.
8. **Tilldelning:** Anbudsklar förklarar beslutet och vad avtalsspärren innebär.

Inköparens vy visar att inköparen granskar och godkänner checklistan innan den publiceras, plus sammanställda frågor
och kommande upphandlingar.

## Riktigt och mockat

| Del | I PoC:n |
|---|---|
| Annonser | Riktiga: TED:s öppna API och e-Avrops publika lista |
| Underlag | 3–5 avslutade upphandlingar från inköp, helst med tilldelningsbeslut |
| LOU, vägledningar, sundsvall.se | Riktiga: Riksdagens API och Eneos crawler |
| CPV-koder | Riktiga: EU:s officiella lista med svenska benämningar |
| Avtalskatalog | Ett utdrag från inköp om det går, annars fiktiva data som är tydligt märkta |
| Inloggning och Bolagsverket | Mockade. Bolagsverkets API är gratis och kan göras riktigt |
| Utskick | Lokal mejlkorg (till exempel Mailpit) |

## Så vet vi att den är bra

- **Facit från inköp:** inköparen markerar vilka skallkrav som faktiskt finns i varje underlag. Vi mäter hur många av
  dem AI:n hittar och hur många felaktiga den lägger till.
- **Citatkontroll:** andelen påståenden vars citat faktiskt står på den angivna sidan. Det som inte kan kontrolleras
  markeras i gränssnittet.
- **Panelens omdöme:** några företag provar demoresan och säger vad de förstod.

## Beroenden

- Flows och widgets finns inte i develop än. Se [Eneos byggstenar](eneo-building-blocks.md) och
  [Öppna frågor](open-questions.md).
