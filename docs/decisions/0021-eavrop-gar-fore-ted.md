# 0021: En upphandling som finns i både TED och e-Avrop visas som e-Avrops annons

- **Status:** Accepterat
- **Datum:** 2026-10-13
- **Gäller:** vilken annons som blir kvar när samma upphandling finns i TED och i e-Avrop, och vad TED bidrar med
- **Ersätter:** punkten "En upphandling, en annons" i [beslut 0009](0009-eavrop-projekt-api.md), där TED-annonsen
  var den som blev kvar

## Sammanhang

Upphandlingar över EU:s tröskelvärden skickar e-Avrop också till TED. Enligt beslut 0009 blev en sådan upphandling en
TED-annons, med underlaget från e-Avrop lagt på den. Den 2026-10-13 hade e-Avrops API 12 öppna offentliga
upphandlingar. Filtret på källan e-Avrop visade bara 7 av dem, eftersom 5 låg som TED-annonser.

e-Avrop har mer om upphandlingen än TED: underlaget, sista dag för frågor, diarienumret, beskrivningen och inköps
publicerade svar. Det är också där leverantören ställer frågor och lämnar anbud. TED har tre saker som e-Avrops API
saknar: köparen (kommunen upphandlar också åt bolagen, till exempel Mitthem AB), ett publicerat uppskattat värde och
orten.

## Beslut

- **e-Avrops annons blir kvar.** Finns upphandlingen redan som TED-annons när e-Avrop-insamlaren läser den, blir
  TED-annonsen e-Avrops annons. Det är samma rad i databasen med e-Avrops källa, id, uppgifter och länk. Dokument,
  checklistor, matchningar, påminnelser och svar som redan finns på den följer med.
- **TED bidrar med det e-Avrop saknar.** Köpare, uppskattat värde och ort från TED sparas på e-Avrops annons. Det gör
  också TED-annonsens id, länk och version (`raw["ted"]`). Varje ny läsning från e-Avrop behåller dem. TED-insamlaren
  lägger dem på e-Avrops annons när upphandlingen redan finns därifrån. En äldre TED-version skriver inte över en
  nyare.
- **Bara annonser om upphandling.** En förhandsannons i TED med samma länk förblir en egen TED-annons och bidrar inte
  med något.
- **TED:s annons länkas.** Upphandlingens sida visar "Öppna annonsen i TED" under Om upphandlingen, bredvid länken
  till e-Avrop (`ted_url` i `GET /api/notices/{id}`).

Det starkaste alternativet var att låta båda annonserna finnas och dölja TED-annonsen i listorna. Det ger två rader att
hålla i takt och två ställen där checklistor och matchningar kan hamna. Att flytta checklistorna och matchningarna till
en ny rad valdes också bort, eftersom samma rad behåller allt utan att något behöver flyttas.

## Konsekvenser

- Filtret på källan e-Avrop visar alla kommunens öppna upphandlingar i e-Avrop. TED-filtret visar bara upphandlingar
  som inte finns i kommunens e-Avrop, till exempel andra köpares.
- Köparen på en upphandling från e-Avrop är TED:s köpare när upphandlingen finns där, och annars `ORGANIZATION_NAME`.
- Annonser som redan sparats ändras först när e-Avrop-insamlaren läser projektet igen. Den dagliga körningen läser bara
  ändrade projekt. Efter driftsättning körs därför `anbudsklar ingest eavrop --full` en gång.
- MCP-verktygens scheman är oförändrade, så Eneo behöver ingen ny synkning.
