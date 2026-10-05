# Öppna frågor

Syfte: Samla det som återstår att avgöra, med vem som behöver svara.

Läs detta när: Du förbereder ett möte, ska fatta ett beslut eller undrar varför något inte är bestämt.

Hör ihop med: [Beslut](decisions/README.md), [PoC](poc.md), [Arkitektur](architecture.md)

När en fråga är avgjord flyttas svaret till ett beslut i [decisions/](decisions/README.md) och raden tas bort här.

## Teknik

| Fråga | Läge |
|---|---|
| När landar Flows i develop, och får PoC:n köras mot Flows-grenen? | Avgör tidplanen och om PoC:n kan visa målbilden. Anbudsklar skulle bli den andra appen som använder Flows körkontrakt, efter Tal till text |
| Vilket språk och ramverk för appens backend? | eneo-module-kit och Tal till text använder FastAPI som BFF med Vite, React och Astryx |
| En eller två containrar för upphandlingsdatan och företagarappen? | En är enklast för PoC:n. Två gör det lättare att återanvända upphandlingsdatan och att flytta gränssnittet |
| Behövs en databas, och vad ska den innehålla? | Beslut 0003 säger Postgres om det behövs. Profiler, bevakningar, annonsindex och påminnelser talar för en |
| Företagsinloggning i PoC:n: mockad eller ingen alls? | Tolkningen av underlag kräver ingen inloggning eftersom allt är offentligt |
| Ska inköparens vy vara en Eneo-modul? | Det fungerar för medarbetare, men mycket kan visas direkt i Eneo: granskningen i flödena, inköparassistenten och Insights |
| Vilken modell ska användas? | Den behöver klara svenska, långa dokument och verktygsanrop. Välj bland modellerna i Eneo-tenanten |

## Verksamhet

| Fråga | Vem |
|---|---|
| Ska vi avgränsa till kommunens och de kommunala bolagens upphandlingar, eller ta med TED? | Näringslivsenheten och inköp |
| Kan inköp ta fram 3–5 avslutade upphandlingar inom pilotens verksamhet? | Inköp |
| Ligger avtalskatalogen i e-Avrops avtalsdatabas? I så fall kan den hämtas via samma API | Inköp |
| Vilka villkor gäller för e-Avrops API? | Inköp och Antirio |
| Ska inköparen godkänna checklistorna innan de publiceras? Det kostar tid per upphandling och gör checklistan till kommunens sammanfattning | Inköp |
| Vilken verksamhet ska piloten gälla? | Näringslivsenheten och inköp |

## Juridik

| Fråga | Vem |
|---|---|
| Blir profiler, frågor och anbudsutkast allmänna handlingar? | Jurist |
| Hur ser DPIA och personuppgiftsbiträdesfrågan ut? | Dataskydd |
| Vad får inköp se av företagens frågor under anbudstiden? | Jurist och inköp |
