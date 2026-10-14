# 0026: Fråga AI väljer själv om en fråga gäller underlaget, reglerna eller profilen

- **Status:** Föreslaget
- **Datum:** 2026-10-14
- **Gäller:** hur en fråga i panelen Fråga AI hamnar hos rätt AI-uppgift, och vad läsaren behöver välja
- **Ersätter:** valet "Underlaget · Reglerna" (`SegmentedControl`) i [beslut 0014](0014-fraga-ai-panel.md), och
  ämnet "Profilen" som ett val i [beslut 0025](0025-profilen-uppdateras-via-fraga-ai.md)

## Sammanhang

Panelen hade en ämnesväljare: Underlaget eller Reglerna på en upphandlings sida, och Profilen för en inloggad
företagare. Den som frågade "Vad är ett kvalificeringskrav?" med Underlaget valt fick svaret att det inte står i
underlaget och rådet att ställa frågan i e-Avrop, och den som skrev "vi har numera tolv anställda" med Reglerna valt
fick en paragraf. Valet är ett arbetsmoment som ingen annan chatt har, och inför demon 2026-10-14 ville vi att
läsaren bara skriver och att Anbudshjälpen förstår. Samtidigt får ett svar om reglerna inte låtsas komma ur
underlaget, och ett svar om underlaget får aldrig bygga på något annat än underlaget och inköps publicerade svar:
spårbarheten per uppgift ska stå kvar.

## Beslut

**Läsaren väljer inget ämne. Appen väljer.** Panelen har ett skrivfält och ett samtal per plats: upphandlingens
sida, eller överallt annars. Varje fråga går till `POST /api/ask` med upphandlingens id när läsaren är på en sådan
sida, samtalets tidigare frågor och svar med det ämne som svarade på var och en, och Regelhjälpens samtals-id.
Appen avgör ämnet i tre steg och skickar frågan vidare till samma uppgift som förut (`besvara_fraga`,
`regelhjalpen` eller `uppdatera_profil`), med bara det ämnets tidigare frågor som historik:

1. **Orden först** (`backend/src/anbudsklar/ai/subject_rules.py`, utan modell). Ord som "underlaget", "bilagor",
   "kravet", "K3", "sida 4", "anbudet" och "måste vi" placerar frågan i underlaget; "LOU", "§", "avtalsspärr",
   "direktupphandling", "inköpsstrategin", "vad är ett …" och "i allmänhet" i reglerna; ett påstående om företaget
   ("vi har numera …", "vi är ISO 14001-certifierade", "lägg till …") i profilen, men bara för en inloggad
   företagare och aldrig för en fråga. En kort uppföljning utan egna ord stannar hos förra frågans ämne.
2. **Modellen vid tvekan.** Pekar orden åt två håll eller ingetstans frågar appen den nya AI-uppgiften `valj_amne`,
   som får ämnena som finns på sidan, historiken med ämnen och frågan, och svarar med `SubjectChoice` (ämne och
   skäl). Det är ett kort anrop utan underlag. Ett ämne som inte finns på sidan godtas inte.
3. **Sidans eget ämne** när modellen saknas eller fallerar: underlaget på en upphandlings sida, annars reglerna.
   En Eneo-instans utan assistenten `valj_amne` svarar alltså ändå, med en varning i loggen.

Svaret bär vilket ämne som svarade (`AskView.subject`) och vad som avgjorde (`decided_by`: `rule`, `model` eller
`default`), och det första verktyget under varje svar säger det: "Välj ämne · Reglerna, på frågans ord". Panelen
visar svaret med samma kort som förut, och en dämpad rad över kortet när ämnet inte är sidans eget: "Allmänt om
reglerna, inte om just den här upphandlingen" eller "Ändring i er profil". Exempelfrågorna visar bredden: på en
upphandlings sida fyra frågor om underlaget och en om reglerna, och för en inloggad företagare två ändringar.

De tre gamla endpointerna finns kvar: Regelhjälpens sida använder `/api/rules/ask`, och `/api/notices/{id}/questions`
och `/api/profile/chat` är oförändrade. Regelhjälpens samtalscookie skickas nu till hela `/api`, så att ett samtal
fortsätter också genom `/api/ask`.

Det starkaste alternativet var att låta `besvara_fraga` avgöra själv, med ett fält i `Answer` som säger att frågan
hör hemma hos reglerna, och skicka den vidare därefter. Det valdes bort: en allmän fråga skulle då kosta ett anrop
med hela underlaget innan den fick sitt svar, och ett svar om reglerna skulle komma ur ett kort som är byggt för citat
ur underlaget. Ett rent ordbaserat val utan modell valdes bort för att "Hur många referenser behövs?" och "Vad säger
LOU om kravet K3?" inte går att avgöra på orden.

## Konsekvenser

- Eneo får en assistent till, "Välj ämne" (`valj_amne`), utan MCP och utan kunskapskällor. `anbudsklar eneo
  provision` måste köras igen i varje instans; tills dess avgör orden och sidans eget ämne, och loggen varnar.
- En fråga som orden inte avgör kostar ett kort anrop till, före svaret. Anropet räknas under Drift › AI-användning
  som `valj_amne`.
- Samtalen i webbläsaren byter indelning: ett per upphandling och ett allmänt (`general`). Samtal om reglerna och
  profilen som sparats före ändringen läses in i det allmänna samtalet. Utskriftsvyn tar `amne=general` och de gamla
  värdena `rules` och `profile`.
- Ämnesvalet går att styra med ord: "i underlaget", "enligt LOU", "i vår profil". Det står inte i panelen; raden
  över ett svar och verktygsraden visar vad som hände, och "Rensa samtalet" ger en ny start.
- Dokumentationen följer: [AI-uppgifterna](../ai-tasks.md), [Design](../design.md), [Eneo-integration](../eneo-integration.md),
  [Arkitektur](../architecture.md) och [Drift](../operations.md).
