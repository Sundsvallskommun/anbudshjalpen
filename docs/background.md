# Bakgrund

Syfte: Sammanfatta underlaget från näringslivsenheten, rätta det som inte stämmer och lyfta det som underlaget inte tar
upp.

Läs detta när: Du ska förstå varför projektet finns, förbereda ett möte med verksamheten eller ifrågasätta en premiss.

Hör ihop med: [Arkitektur](architecture.md), [PoC](poc.md), [Öppna frågor](open-questions.md)

## Underlaget

"AI-stöd för företagare i upphandling", underlag till näringslivsenheten, 2026-09-22. Själva PDF:en ligger inte i repot.

**Problemet:** företagare tycker att det är svårt och tidskrävande att hitta rätt och agera rätt i kommunens
upphandlingar. Informationen finns, men den är spridd över sundsvall.se, e-Avrop och LOU och skriven för insatta.
Därför avstår småföretag, missar annonser eller får sina anbud förkastade på formalia.

**Lösningsidén** är en assistent med tre roller:

| Roll | Gör |
|---|---|
| Bevakaren | Företaget beskriver sig i klartext. Assistenten översätter till CPV-koder, bevakar annonser och ger en ärlig bedömning: passar, passar delvis eller passar inte |
| Tolken | Gör om förfrågningsunderlaget till en checklista med skallkrav, bilagor, utvärdering och datum, där varje punkt har en sidhänvisning. Svarar också på frågor om dokumentet |
| Följeslagaren | Ger påminnelser om frågestopp och anbudsdag och granskar utkastet mot skallkraven före inlämning. Förklarar tilldelningsbeslutet |

Den största nyttan enligt underlaget är att kunna **förutse upphandlingar** 12–18 månader i förväg, utifrån när avtalen
i avtalskatalogen löper ut.

**Pilotförslag:** sex månader i en utvald verksamhet, med en panel på 8–10 företag. Bevakning och tolkning kommer
först, granskning och prediktion senare. Mätetal: antal anbud per upphandling, andel lokala anbudsgivare, andel anbud
som förkastas på formalia och tid per anbud.

## Faktagranskning (kontrollerat 2026-10-05)

| Underlaget säger | Det faktiska läget |
|---|---|
| e-Avrop: "ingen sökning, inget filter, ingen bevakning" | Det finns sökning med CPV-filter och en "Bevaka"-knapp, men bevakningen sker via Pabliq och kostar. Det verkliga gapet är att allt bygger på CPV-koder och att ingen bedömer om annonsen passar företaget |
| Planerade upphandlingar: "poster från 2017" | Inga poster från 2017. Men 14 av 15 poster gäller kvartal 1–3 2026, som redan har passerat. Poängen håller, med andra siffror |
| Bolagsverket: "API mot avgift" | API:t för värdefulla datamängder är avgiftsfritt sedan februari 2025 och kräver inget avtal |
| TED: "licens kan krävas" | Sök-API:t är öppet och kräver ingen nyckel. Det gav 168 notiser för Sundsvalls kommun sedan januari 2025 |
| e-Avrops API "som kommunen har tillgång till" | Leverantören uppger att det finns API för all data, men villkoren är inte publika. Underlagen kräver inloggning på webben. Stäm av med inköp |
| Inloggning med BankID i Mina sidor | BankID identifierar en person, inte ett företag. Att personen får företräda företaget måste kontrolleras separat |
| LOU (2016:1145) i fulltext | Stämmer. Riksdagens öppna API ger lagtexten uppdelad i kapitel och paragrafer, konsoliderad t.o.m. SFS 2026:880 |

## Det underlaget inte tar upp

- **Avgränsning och konkurrens.** Tendium (med en gratis LOU-chatt sedan 2023), Pabliq och Public Insight erbjuder
  redan generell bevakning och AI-analys. Det bara kommunen kan göra är att stå för sina egna upphandlingar, sin
  avtalskatalog och återkopplingen till inköp. Att avgränsa till kommunens och de kommunala bolagens upphandlingar ryms
  tydligt i att "allmänt främja näringslivet" (2 kap. 8 § kommunallagen).
- **Allmän handling.** Profiler, frågor och särskilt uppladdade anbudsutkast kan bli allmänna handlingar hos kommunen.
  Det behöver juristerna bedöma, och tjänsten bör utformas så att utkasten inte sparas.
- **Insikter under anbudstiden.** Företagens frågor kan avslöja deras strategi. Insikterna bör därför sammanställas och
  helst visas först efter tilldelning. Om många frågar samma sak bör kommunen gå ut med ett förtydligande till alla i
  e-Avrop, vilket gör likabehandlingen till en del av tjänsten.
- **AI-förordningen, artikel 50.** Användaren ska få veta att den pratar med en AI. Underlaget tar bara upp frågan om
  högrisk.
- **DOS-lagen.** Ett publikt gränssnitt ska uppfylla tillgänglighetskraven (EN 301 549 och WCAG).

## Källor

- [TED API](https://docs.ted.europa.eu/api/latest/index.html)
- [Bolagsverket: värdefulla datamängder](https://bolagsverket.se/apierochoppnadata/hamtaforetagsinformation/vardefulladatamangder.5294.html)
- e-Avrop: [API](https://info.e-avrop.com/tjanst/upphandlingssystem-avtalsdatabas/api-kopplat-med-andra-affarssystem/),
  [Sundsvalls annonser](https://www.e-avrop.com/sundsvall/e-Upphandling/Default.aspx),
  [planerade upphandlingar](https://www.e-avrop.com/sundsvall/e-Upphandling/planedComing.aspx),
  [för leverantörer (Pabliq)](https://info.e-avrop.com/tjanst/leverantorer/)
- [LOU via Riksdagens API](https://data.riksdagen.se/dokument/sfs-2016-1145.text)
- [Tendiums LOU-chatt (2023)](https://via.tt.se/pressmeddelande/3348794/ny-ai-chatt-for-upphandlingsjuridik-svarar-pa-dina-lou-fragor?publisherId=3235696),
  [Public Insight (2024)](https://upphandling24.se/lanserar-ai-stod-for-leverantorer/)
