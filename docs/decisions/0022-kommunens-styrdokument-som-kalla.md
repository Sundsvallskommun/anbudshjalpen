# 0022: Kommunens styrdokument för inköp är en egen källa i Regelhjälpen, skild från lagen

- **Status:** Accepterat
- **Datum:** 2026-10-14
- **Gäller:** vilka källor Regelhjälpen svarar ur, hur de hålls isär, hur systemet väljer källa efter frågan och hur
  kommunens styrdokument kommer in i tjänsten

## Sammanhang

Kommunfullmäktige fastställde 2023-09-25 en inköpsstrategi för Sundsvalls kommun (KSK-2023-00196), som gäller tills
vidare och binder alla nämnder och de hel- och majoritetsägda bolagen i Stadsbackenkoncernen. Inköp bekräftade
2026-10-14 att versionen från 2023 gäller. Strategin säger sådant som LOU inte säger och som företagen frågar om: att
kommunen ska ta tillvara småföretagens konkurrenskraft och sänka trösklarna (avsnitt 5.3), att villkor i nivå med
kollektivavtal ska gälla även underleverantörer i obegränsat antal led och att kommunen ställer krav på sommarjobb och
praktikplatser (5.2), att kraven ska vara relevanta och inköpen transparenta (5.4), att behov först ska mötas genom
återbruk och köp på avtal (4), och att inköpsenheten upphandlar åt Timrå kommun (6.1.1).

Regelhjälpen hade LOU via MCP-verktygen och webbkunskap från Upphandlingsmyndigheten och sundsvall.se. Webbkunskapen
hämtar inga filer, så strategin fanns inte med alls. De två källorna är av olika slag: lagen binder leverantören,
medan strategin binder kommunens egna beställare och säger vad kommunen vill. Blandas de kan coachen säga "kommunen
måste" där strategin säger "ska beakta", eller dra slutsatser om hur ett anbud bedöms, vilket bryter mot
likabehandlingen.

## Beslut

- **Styrdokumenten är en egen källklass vid sidan av lagen.** De lagras i tabellerna `policy_documents` och
  `policy_sections`, avsnitt för avsnitt med PDF-sidor, och läses in från `data/styrdokument/` av jobbet
  `load_policies` varje gång worker startar och av `anbudsklar seed`. En ny dokumenttyp blir en ny fil, inte ny kod.
- **Texten återges i repot, inte genom en hämtning.** Kommunen beslutar sådana dokument sällan och genom formella
  beslut, så en ny version är en pull request som inköp kan läsa. PDF:ens textlager delar dessutom ord, vilket exakta
  citat inte överlever. `data/styrdokument/README.md` säger vad återgivningen ändrar och hur en ny version läggs in.
- **Ett verktygspar per källklass i MCP.** `sok_styrdokument` och `hamta_avsnitt` vid sidan av `sok_lou` och
  `hamta_paragraf`. Modellen väljer källa efter frågan, och verktygsbeskrivningarna säger när vart och ett passar och
  att en fråga om krav kan ha svar i båda. Styrdokumenten läggs inte in som kunskap i Eneo: kunskap hämtas alltid,
  oavsett fråga, och hänvisningarna skulle konkurrera med verktygens.
- **Appen rangordnar båda källorna tillsammans för motorerna utan verktyg.** `search_rule_texts` ger först det
  avsnitt eller den paragraf en hänvisning namnger, sedan träffar med alla frågans ord, sedan träffar med något av
  dem och sist trigramträffar. Inom en nivå vinner högst poäng, och lagen går före vid lika. Ett test med fjorton
  frågor visar vilken källa som svarar först.
- **Källan märks alltid.** `RuleSource` får `kind` (`law` eller `policy`) och `note` ("Kommunens styrdokument,
  fastställt av kommunfullmäktige 2023-09-25."), som appen sätter ur sin egen kopia, aldrig modellen. Webbappen visar
  noten under kortets rubrik och länkar "Läs hela avsnittet" till PDF:ens sida. MCP-svaren säger att ett styrdokument
  binder kommunens beställare, inte leverantören. Prompten säger att svaret ska ange vilket slag källan är, använda
  båda när frågan gäller ett krav, och aldrig dra slutsatser ur styrdokumenten om hur ett anbud eller en upphandling
  bedöms.
- **Bara i Regelhjälpen och via MCP.** I Fråga AI får styrdokumenten användas för att förklara begrepp och syften,
  med citaten fortsatt enbart ur underlaget. Tolkningen, checklistan, matchningen och granskningen använder dem inte.

Det starkaste alternativet var att ladda upp PDF:en som kunskap i Eneo. Det är snabbt men ger bara Eneo-motorn
källan, inga avsnitt eller sidor att hänvisa till, och hänvisningar som konkurrerar med verktygens. Ett gemensamt
sökverktyg med källan som filter valdes också bort: varje ny källa skulle ändra schemat, som kräver omsynk i Eneo, och
märkningen av källklassen blir svårare när träffarna kommer blandade.

## Konsekvenser

- Eneo behöver synka och godkänna de två nya verktygen. `anbudsklar eneo provision --mcp-url …` gör båda; annars
  godkänns de i Eneo. De gamla verktygens scheman är oförändrade.
- En ny migration skapar tabellerna. Worker läser in styrdokumenten vid start, så en ändrad fil följer med nästa
  driftsättning utan åtgärd. `anbudsklar ingest styrdokument` läser in dem direkt.
- Den regelbaserade motorns inledning blir "Paragrafer och avsnitt som kan handla om din fråga:" när ett avsnitt ur
  ett styrdokument är med, annars som förut.
- Ursprungsraden för Regelhjälpen säger att ett styrdokument binder kommunens beställare, inte läsaren, och att det
  alltid är lagtexten som gäller.
- En handlingsplan för strategin eller riktlinjer för inköp kan bli nästa dokument i mappen, se
  [Öppna frågor](../open-questions.md).
