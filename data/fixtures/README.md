# Fiktiva testdata

Här finns påhittade förfrågningsunderlag, ett anbudsutkast, en avtalskatalog och två demoföretag. De används i
demoresan, i kvalitetstestet av tolkningen (`anbudsklar eval`) och av `anbudsklar seed`, som läser in allt via
`backend/src/anbudsklar/seed.py`. Inget här är en verklig upphandling, ett verkligt företag eller en verklig person.

## Innehåll

| Mapp eller fil | Innehåll | Sidor | Krav i facit |
|---|---|---|---|
| `ommalning-solbacken/` | Ommålning av Solbackens förskola, Matfors. Annonserad upphandling under tröskelvärdena (19 kap. LOU), pris 70 % och kvalitet 30 % | 17 | 53 |
| `stadtjanster-forskolor/` | Städtjänster för kommunens förskolor. Öppet förfarande, pris 60 % och kvalitet 40 % | 9 | 30 |
| `frukt-och-gront/` | Livsmedel – frukt och grönt. Ramavtal med en leverantör, öppet förfarande, lägsta pris | 8 | 28 |
| `anbudsutkast-malerifirman/` | Anbudsutkast från Målerifirman i Matfors AB till den första upphandlingen, med avsiktliga brister | 4 | – |
| `agreements.csv` | Avtalskatalog med 26 fiktiva avtal | – | – |
| `companies.json` | Målerifirman i Matfors AB och Rena Rum i Sundsvall AB | – | – |
| `manifest.json` | Allt som seed behöver: annonser, datum, dokument, personer och sökvägar | – | – |
| `build_fixtures.py`, `fixturegen/` | Generatorn som skapar PDF:erna, facit, `manifest.json` och `agreements.csv` | – | – |
| `fonts/` | Typsnittet DejaVu Sans Condensed med licens | – | – |

Varje upphandlingsmapp innehåller en PDF och `facit.json`. Utkastets mapp innehåller PDF:en och
`expected-review.json`.

## Så syns det att allt är fiktivt

- Varje PDF-sida har sidfoten "FIKTIVT UNDERLAG – endast för demonstration", och försättsbladet säger att dokumentet
  är påhittat.
- Upphandlingsnumren börjar med `DEMO-`, och leverantörerna i avtalskatalogen är märkta "(fiktiv)".
- Organisationsnumren har med flit fel kontrollsiffra, så de kan inte tillhöra ett verkligt företag.
- E-postadresserna slutar på `.example`, och telefonnumret i utkastet ligger i den serie som PTS har avsatt för fiktion.
- I databasen får annonser, dokument, företag och avtal `is_fictitious = true`.

## Datum

Dokumenten är skrivna för referensdagen 2026-10-05. I `manifest.json` står varje datum som antal dagar från
referensdagen (`offset_days`). Seed flyttar annonsernas datum och avtalskatalogens datum så att de ligger lika långt
från dagens datum som från referensdagen. Upphandlingarna förblir då öppna oavsett när demon körs.

Datumen i PDF:erna ändras inte av seed. Ska en demo stämma exakt för en viss dag bygger du om underlagen för den dagen
(se nedan) och kör seed samma dag.

## Facit

`facit.json` är en lista med de verkliga kraven i underlaget, ett objekt per krav:

```json
{"id": "K16", "kind": "kvalificeringskrav", "page": 7,
 "quote_fragment": "med ett försäkringsbelopp på minst 5 000 000 kronor per skadetillfälle",
 "title": "Ansvarsförsäkring minst 5 miljoner kronor med försäkringsbevis"}
```

- `kind` är en av kravtyperna i kontraktet för "tolka underlag": `skallkrav` (krav på anbudet), `kvalificeringskrav`
  (krav på leverantören), `krav_pa_uppdraget` (kravspecifikationen) och `avtalsvillkor`.
- Ett krav motsvarar ett stycke i underlaget. Belägg som hör till kravet, till exempel "Försäkringsbevis ska bifogas",
  ingår i samma krav.
- `quote_fragment` är ordagrant från sidan `page`. Generatorn låter aldrig ett kravstycke delas över en sidbrytning,
  och testerna kontrollerar att varje citat hittas på sin sida med samma textutdrag och citatkontroll som appen
  använder.
- Upplysningar om vad kommunen gör ("Kommunen ska utesluta …") och rekommendationer ("bör") är inte krav på
  leverantören och finns inte i facit.
- Några krav är med flit formulerade utan "ska", till exempel "Leverantören ansvarar för …", som i verkliga underlag.
  Den regelbaserade motorn (`AI_ENGINE=heuristic`) hittar därför inte alla krav.

## Anbudsutkastet

Utkastet svarar på underlaget för ommålningen och har tre avsiktliga egenskaper:

- ansvarsförsäkringen besvaras med "Ja", men försäkringsbeviset (bilaga 4) saknas, så kravet är obevisat,
- referensblanketten (bilaga 2) saknas och inga konkreta referenser anges,
- priserna är korrekt angivna i svenska kronor exklusive moms.

`expected-review.json` anger det granskningsresultat som en noggrann granskare bör komma fram till för de krav som
utkastet är gjort för att pröva, med krav-id från facit, status och utkastets egen formulering med sidnummer.

## LOU-hänvisningar

Alla hänvisningar till lagen (2016:1145) om offentlig upphandling är kontrollerade mot Riksdagens text
<https://data.riksdagen.se/dokument/sfs-2016-1145.text>, ändrad till och med SFS 2026:880, hämtad 2026-10-05.
Under tröskelvärdena gäller 19 kap. tillsammans med 1–3, 5, 20 och 21 kap. (19 kap. 1 §), så underlaget för
ommålningen hänvisar till 19 kap. och till 13 kap. 1–3 §§ via 19 kap. 17 §. Begreppet förenklat förfarande finns inte
kvar i lagen sedan den 1 februari 2022. Annonsen och försättsbladet anger därför förfarandet som "Annonserad
upphandling under tröskelvärdena enligt 19 kap. LOU", och bara avsnitt 2.1 nämner det gamla namnet, som det förfarandet
tidigare kallades. Ett test kontrollerar att det gamla namnet inte används på något annat sätt.

## Bygga om

Från `backend/` (fpdf2 finns i utvecklingsberoendena):

```sh
uv run python ../data/fixtures/build_fixtures.py                              # referensdag 2026-10-05
uv run python ../data/fixtures/build_fixtures.py --reference-date 2026-11-02  # för en annan demodag
```

Samma referensdag ger byte för byte samma filer. Testet `backend/tests/seed/test_fixture_documents.py` bygger om allt
i en tillfällig mapp och jämför med de incheckade filerna, så ändra innehållet i `fixturegen/` och bygg om, i stället
för att redigera PDF:er eller JSON-filer för hand. `companies.json` är handskriven.

När en PDF har byggts om ersätter `anbudsklar seed` det underlag som en tidigare körning lade in för annonsen, så att
annonsen inte får två versioner av samma underlag. Checklistor som tolkades från den gamla filen tas bort med den, och
workern tolkar den nya filen. Underlag som en inköpare har laddat upp i appen rörs inte. Seed skriver ut antalet
ersatta underlag som `replaced_documents`.

## Typsnitt

DejaVu Sans Condensed 2.37 (normal, fet och kursiv) från <https://github.com/dejavu-fonts/dejavu-fonts/releases>
(`dejavu-fonts-ttf-2.37.tar.bz2`). Licensen i `fonts/LICENSE` tillåter att typsnitten bäddas in och sprids.
