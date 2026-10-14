# 0012: Frågor besvaras mot alla dokument i upphandlingen, med ett urval över en budget

- **Status:** Accepterat
- **Datum:** 2026-10-12
- **Gäller:** uppgiften `besvara_fraga`: vilka dokument modellen får, hur de väljs och hur citaten pekar
- **Ersätter:** delar av [0005](0005-domain-search-in-postgres.md): att AI-uppgifterna aldrig använder sökningen för
  att välja ut text

## Sammanhang

Med e-Avrop ([beslut 0009](0009-eavrop-projekt-api.md)) har en upphandling flera dokument: administrativa
föreskrifter, kravspecifikation, avtalsvillkor och formulär. Frågor besvarades bara ur huvuddokumentet, som ofta
hänvisar vidare: "krav på entreprenören framgår av bilaga 6.6". Den som frågade om kraven fick inget svar, fast
svaret fanns i underlaget.

Mätt 2026-10-12 har de öppna upphandlingarna 12 000–165 000 tecken text sammanlagt, alltså högst omkring 50 000
tokens. Det ryms i modellernas fönster, och en fråga mot allt kostar under ett öre med den modell demon använder.
Gränsen är inte fönstret utan uppmärksamheten: mer text än nödvändigt ger sämre svar, och Eneos modell kan ha ett
mindre fönster.

## Beslut

- **Modellen får alla dokument** i upphandlingen när deras text ryms i en budget (`BUNDLE_BUDGET_CHARS`, 150 000
  tecken). Huvuddokumentet först, sedan övriga i den ordning de lästes in. Materialet inleds med en förteckning
  över dokumenten och hur mycket av varje som är med.
- **Över budgeten väljs sidor**, utan vektorer: huvuddokumentet helt, sedan de bilagor huvuddokumentet hänvisar
  till där det matchar frågan ("bilaga 6.6" mot filnamnet "6.6 Krav på Entreprenör.pdf"), sedan de sidor vår
  fulltext- och trigramsökning rankar högst. Sidor som inte är med behåller sitt nummer och säger att de saknas,
  så att citaten stämmer och modellen kan säga vad den inte läst.
- **Citaten pekar på dokument.** Ett citat anger dokumentets namn (`document`), och verifieringen sätter
  `document_id`: först söks citatet i det namngivna dokumentet, sedan i de andra, huvuddokumentet först. Ett citat
  som finns i ett annat dokument än det angivna markeras "på annan sida" och pekar dit det finns. Webbappen öppnar
  rätt fil, och säger hur mycket svaret bygger på: "alla 6 dokument" eller "30 av 76 sidor".
- `CONTRACT_VERSION` höjs, och Eneos assistenter sätts upp igen.

Det starkaste alternativet var att låta modellen hämta själv med MCP-verktygen `sok_i_underlag` och `lasa_sidor`,
som redan finns. Det kräver en modell med verktygsanrop och Eneo som motor. Det här fungerar med alla tre
motorerna och kan senare få verktygen som ett komplement.

Vektorsökning valdes bort igen, av samma skäl som i 0005: den ger inte exakta sidträffar, och det som behövs
hittas med hänvisningar och ord.

## Konsekvenser

- Svaren kan nu peka in i bilagor, och ursprungsraden visar vilket dokument ett citat kommer från.
- Tolkningen till checklista läste fortfarande bara huvuddokumentet. Sedan [beslut 0020](0020-checklistan-lases-ur-alla-dokument.md)
  ger samma paketbyggare `tolka_underlag` alla dokument.
- Budgeten är en konstant i koden, inte en inställning: den beror på modellen, inte på verksamheten.
- Nya tester: `backend/tests/documents/test_document_bundle.py` och fall i citat-, motor- och API-testerna.
