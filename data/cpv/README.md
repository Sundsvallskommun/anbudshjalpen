# CPV 2008 med svenska benämningar

`cpv_2008_sv.csv` är EU:s gemensamma terminologi för offentlig upphandling (CPV 2008) med svenska benämningar.
Anbudsklar läser in filen i tabellen `cpv_codes` med `anbudsklar ingest cpv` (koden finns i
`backend/src/anbudsklar/ingest/cpv.py`).

## Källa

- Officiell fil från Europeiska unionens publikationsbyrå på TED:
  <https://ted.europa.eu/documents/d/ted/cpv_2008_xls> (länkad från <https://ted.europa.eu/en/simap/cpv>).
- Zip-filen innehåller `cpv_2008_ver_2013.xlsx`. Vi läser fliken `CPV codes`, kolumnerna `CODE` och `SV`.
- Hämtad 2026-10-05. Zip-filen var 3 616 147 byte och senast ändrad 2023-09-12.

## Licens och källhänvisning

CPV fastställs i förordning (EG) nr 213/2008, en EU-rättsakt. Kommissionens dokument får återanvändas enligt
beslut 2011/833/EU, och innehållet på TED är licensierat under CC BY 4.0. Ange källan som
"CPV 2008, Europeiska unionens publikationsbyrå (ted.europa.eu)".

## Kolumner

| Kolumn | Innehåll |
|---|---|
| `code` | Åtta siffror utan kontrollsiffra, till exempel `45442100` (TED och e-Avrop returnerar koderna så) |
| `label_sv` | Svensk benämning, med blanksteg normaliserade |
| `parent_code` | Närmaste överordnade kod som finns i listan. Tom för de 45 huvudgrupperna (divisionerna) |
| `level` | Nivå i hierarkin: 1 för huvudgrupp (`XX000000`), 2 för grupp (`XXX00000`) och så vidare till 7 |

Överordnad kod tas fram genom att den sista signifikanta siffran tas bort tills en kod som finns hittas. Exempel:
`45442100 Målning` har föräldern `45442000`, och `03221111 Rödbeta` har föräldern `03221110 Rotfrukter`. eForms
SDK pekar i 798 fall på en kod längre upp i samma kedja, så matchning mot alla förfäder ger samma resultat.

## Bygga om filen

Från repots rot (skriptet deklarerar sitt beroende `openpyxl` inline, så `uv` installerar det tillfälligt):

```sh
uv run data/cpv/build_cpv_csv.py                         # hämtar zip-filen från TED
uv run data/cpv/build_cpv_csv.py --zip cpv_2008_xls.zip  # använder en zip-fil du redan har
```

Skriptet skriver 9 454 koder och skriver ut filens sha256. Bygget 2026-10-05 gav
`c384dc4016b3c4001e66db8bb1c3ebda43142a905703e8d79aaf775788528dbf`. Varningen "Unknown extension is not supported"
från `openpyxl` är ofarlig.
