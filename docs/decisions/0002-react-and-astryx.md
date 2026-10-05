# 0002: Gränssnittet byggs i React med Astryx

- **Status:** Accepterat
- **Datum:** 2026-10-05
- **Gäller:** alla gränssnitt i det här repot

## Sammanhang

Eneos nya webbapp, eneo-module-kit och Tal till text använder React med Astryx. Kitet ska ge ett Eneo-tema, ett sidskal
och inloggningsskärmar till moduler. Teamet föredrar Astryx.

## Beslut

Gränssnitten byggs i React med Astryx-komponenter och Eneo-temat.

Det starkaste alternativet var Sundsvalls designsystem sk-web-gui, så att företagarappen ser ut som kommunens övriga
e-tjänster. Det valdes bort eftersom det binder lösningen till en kommun och inte delar kod med Eneo och kitet.

## Konsekvenser

- Koden kan återanvändas mellan Eneo, kitet och modulerna, och tillgänglighet följer med komponenterna.
- Andra kommuner kan byta namn, logga och färg på samma sätt som i Tal till text.
- Ska företagarvyn senare ligga i Sundsvalls Mina sidor behöver den kläs om. Därför hålls domänlogiken utanför
  komponenterna.
- Astryx-versionen låses exakt, och användartexter skrivs på svenska.
