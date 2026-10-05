# Ordlista

Syfte: Förklara upphandlings- och tekniktermer på vanlig svenska.

Läs detta när: En term är okänd, eller när du skriver text som företagare ska läsa.

Hör ihop med: [Bakgrund](background.md), [Arkitektur](architecture.md)

Förklaringarna är förenklade och ersätter inte lagtexten.

## Upphandling

| Term | Betydelse |
|---|---|
| LOU | Lagen (2016:1145) om offentlig upphandling, som styr hur kommunen köper in |
| Förfrågningsunderlag | Dokumenten som beskriver vad kommunen vill köpa och vilka krav som gäller. Lagen kallar dem upphandlingsdokument |
| Skallkrav | Krav som måste uppfyllas. Ett anbud som inte uppfyller ett skallkrav förkastas |
| Kvalificeringskrav | Krav på företaget, till exempel ekonomisk stabilitet, referensuppdrag eller försäkring |
| Utvärderingskriterier | Hur anbuden jämförs, till exempel 70 procent pris och 30 procent kvalitet |
| ESPD | Europeiskt enhetligt upphandlingsdokument: en egenförsäkran där företaget preliminärt intygar att det inte ska uteslutas och att det uppfyller kvalificeringskraven |
| Frågestopp | Sista dagen att ställa frågor om underlaget. Svaren publiceras för alla anbudsgivare |
| Sista anbudsdag | Sista dagen att lämna anbud |
| Tilldelningsbeslut | Beslutet om vem eller vilka som vinner upphandlingen |
| Avtalsspärr | En väntetid efter tilldelningsbeslutet då avtal inte får tecknas, oftast tio dagar. Under den kan beslutet begäras överprövat |
| Överprövning | Att begära att förvaltningsrätten prövar en upphandling |
| Direktupphandling | Enklare upphandling utan formkrav, tillåten under en viss beloppsgräns |
| Tröskelvärde | EU:s beloppsgränser. Över dem gäller EU-reglerna fullt ut och annonsen publiceras även i TED |
| Ramavtal | Ett avtal som anger villkoren för framtida beställningar under en period |
| CPV-kod | EU:s kodsystem för vad som upphandlas, ordnat som ett träd från breda till smala koder |
| SNI-kod | Svensk kod för vilken bransch ett företag verkar i |
| e-Avrop | Systemet där Sundsvalls kommun annonserar upphandlingar och tar emot anbud |
| TED | EU:s databas för upphandlingar över tröskelvärdena |
| Avtalskatalog | Inköps förteckning över kommunens avtal och när de löper ut |

## Teknik

| Term | Betydelse |
|---|---|
| Eneo | En AI-plattform med öppen källkod som utvecklas av Sundsvalls kommun |
| Flow | Ett flöde i Eneo: steg som körs i ordning, till exempel "läs underlaget och gör en checklista" |
| Granskningssteg | En paus i ett flöde där en människa godkänner eller rättar resultatet |
| Widget | En Eneo-assistent som är inbäddad som chatt på en webbplats |
| Modul | En fristående webbapp bredvid Eneo som medarbetare loggar in i med sitt Eneo-konto |
| RAG | Ett sätt att svara där AI:n först hämtar relevanta textstycken och sedan bara svarar utifrån dem |
| MCP | Ett standardprotokoll som låter en AI-assistent hämta data från andra system |
| Citatkontroll | Att kontrollera att ett citat som AI:n anger faktiskt står på den sida den hänvisar till |
| Assistent | En AI-tjänst i Eneo med egen instruktion, modell och kunskap. Anbudsklar har en assistent per AI-uppgift |
| Space | En arbetsyta i Eneo som samlar assistenter, behörigheter och lagringstid |
| Servicenyckel | En API-nyckel (`sk_`) i Eneo som ägs av en tjänst i stället för en person |
| MCP-server | Ett system som erbjuder MCP-verktyg. Anbudsklars MCP-server låter Eneos assistenter läsa offentlig upphandlingsdata |
| Fulltextsökning | Sökning på ord, där böjningar räknas som samma ord, till exempel "försäkring" och "försäkringar" |
| Trigramsökning | Sökning som jämför bitar om tre tecken och därför hittar ord trots stavfel |
| Demoperson | En påhittad användare som man loggar in som i PoC:n |
| Heuristisk motor | Anbudsklars AI-motor utan språkmodell, som plockar ut krav och datum med fasta regler |
