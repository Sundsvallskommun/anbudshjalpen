# 0008: Repot licensieras under AGPL-3.0, som Eneo

- **Status:** Accepterat
- **Datum:** 2026-10-07
- **Gäller:** licensen för koden och dokumentationen i det här repot

## Sammanhang

Repot hade ingen licens, och frågan stod i [Öppna frågor](../open-questions.md). Utan licens får ingen annan använda,
ändra eller dela koden, och repot kan inte bli öppen källkod.

- Anbudsklar bygger på Eneo, som Sundsvalls kommun och Ånge kommun tog fram. Eneo har licensen GNU Affero General
  Public License version 3 (`LICENSE` och README i `eneo-ai/eneo`).
- Anbudsklar är en webbtjänst. En licens som bara kräver källkod när programmet sprids, som GPL-3.0, låter den som
  kör en ändrad version som tjänst behålla ändringarna för sig själv.
- Andra kommuner ska kunna använda lösningen. [Beslut 0002](0002-react-and-astryx.md) räknar med att de kan byta
  namn, logga och färg.
- Beroendena har licenser som går att kombinera med AGPL-3.0. Den 2026-10-07 hade beroendena som följer med appen
  (`dependencies` i `backend/pyproject.toml` och `frontend/package.json`) licenserna MIT, BSD-3-Clause och
  Apache-2.0. Astryx (`@astryxdesign/core` 0.6.3) har MIT. Bland utvecklingsverktygen har fpdf2, som bygger de
  påhittade PDF:erna, LGPL-3.0-only och `@axe-core/playwright` MPL-2.0.

## Beslut

Repot licensieras under GNU Affero General Public License version 3 (AGPL-3.0), samma licens som Eneo. Licenstexten
ligger i `LICENSE` i repots rot, oförändrad, och README anger "Copyright (C) 2026 Sundsvalls kommun". Notisen säger
version 3.0 utan "eller senare", precis som Eneos README. Ska senare versioner av licensen också gälla, ändras notisen
i README och i det här beslutet.

Det starkaste alternativet var en tillåtande licens som MIT eller Apache-2.0. Den gör det lättast för leverantörer att
bygga in koden i egna produkter, men kräver inte att någon delar sina ändringar. AGPL-3.0 valdes för att förbättringar,
också i en tjänst som körs åt andra, ska komma alla till del, och för att kod då kan flyttas mellan Anbudsklar och Eneo
utan att licenserna krockar.

## Konsekvenser

- Den som ändrar Anbudsklar och låter andra använda sin version över ett nätverk måste erbjuda dem källkoden till den
  versionen (avsnitt 13 i licensen).
- Ett nytt beroende måste ha en licens som går att kombinera med AGPL-3.0. Till exempel går MIT, BSD, Apache-2.0,
  LGPL-3.0 och GPL-3.0 bra. GPL-2.0-only, egna villkor från en leverantör och villkor som förbjuder kommersiell
  användning går inte. Den som lägger till ett beroende kontrollerar licensen.
- Astryx och de andra beroendena behåller sina egna licenser. AGPL-3.0 gäller vår kod och helheten.
- Filer från andra i `data/` behåller sina villkor: CPV-listan ([data/cpv/README.md](../../data/cpv/README.md)) och
  typsnittet DejaVu ([data/fixtures/fonts/LICENSE](../../data/fixtures/fonts/LICENSE)).
- Bidrag licensieras under samma licens ([Bidra](../CONTRIBUTING.md)). Det gör det svårare att byta licens senare,
  eftersom alla som äger upphovsrätt till koden då måste gå med på bytet.
