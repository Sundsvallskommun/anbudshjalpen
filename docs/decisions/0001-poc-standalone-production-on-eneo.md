# 0001: PoC:n körs fristående, produktion byggs på Eneo

- **Status:** Ersatt av [0004](0004-eneo-api-and-own-mcp-server.md)
- **Datum:** 2026-10-05
- **Gäller:** hur PoC:n anropar AI och hur vi tar höjd för att flytta till Eneo i produktion

## Sammanhang

PoC:n ska testa konceptet: om företagen har nytta av tjänsten, om AI:n hittar alla skallkrav och om inköp vill arbeta
på det sättet. Inget av det beror på Eneo.

Eneos pipelinemotor Flows passar uppgifterna, men den är inte klar att bygga på. Widgets är inte släppta, och Services
försvinner ur gränssnittet i 2.2. Se [Eneos byggstenar](../eneo-building-blocks.md).

Kärnuppgifterna behöver ingen RAG. Ett underlag får plats i ett anrop, matchning är fasta regler plus en bedömning och
prediktion är datumräkning. Det enda RAG-behovet, regelfrågor om LOU och vägledningar, täcker Eneos assistenter redan.

## Beslut

PoC:n anropar en språkmodell direkt via ett OpenAI-kompatibelt API för fyra uppgifter: tolka underlag, bedöma
matchning, granska utkast och besvara frågor om ett underlag. Vi bygger ingen egen RAG och ingen vektordatabas. Vill vi
visa regelfrågor görs de som en vanlig assistent i Eneo.

Vi tar höjd för produktion på Eneo:

- Varje uppgift har fasta indata och ett typat JSON-svar med citat. Det är samma form som ett steg i Eneo Flows.
- AI-motorn ligger bakom ett gränssnitt. Resten av appen vet inte om den anropar modellen direkt eller via Eneo.
- Instruktionerna till modellen ligger som textfiler i repot, en per uppgift.
- En checklista går från utkast till godkänd till publicerad, vilket motsvarar granskningssteget i Flows.
- PoC:n använder samma modelleverantör som Eneo-miljön.
- Förenklingar som bara gäller PoC:n, som låtsasinloggning och direkta modellanrop, markeras i koden och i
  dokumentationen.

Tre alternativ valdes bort:

- **Bygga på Flows nu.** Arbetet är inte klart.
- **Bygga på det Eneo har släppt i dag**, alltså assistenter och Services. Services försvinner ur gränssnittet,
  assistenter ger JSON bara om man ber om det i instruktionen, och allt skulle flyttas igen när Flows är klart.
- **En egen RAG-plattform.** Den behövs inte för kärnuppgifterna och skulle dubblera Eneo.

## Konsekvenser

- PoC:n startas med `docker compose up` utan Eneo och väntar inte på Eneos tidplan.
- PoC:n saknar Eneos loggning och modellstyrning. Därför använder den bara offentliga och påhittade data.
- Under PoC:n justeras instruktionerna i repot, inte i Eneos gränssnitt.
- Appen, upphandlingsdatan och Postgres behövs i produktion oavsett. Det som byts är AI-motorn, och det sker när Flows
  är klart.
- Målbilden för produktion står i [Arkitektur](../architecture.md).
