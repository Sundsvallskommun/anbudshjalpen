# 0018: Inköps publicerade svar hör till underlaget i Fråga AI och checklistan

- **Status:** Accepterat
- **Datum:** 2026-10-12
- **Gäller:** vad `besvara_fraga` och `tolka_underlag` läser, hur ett publicerat svar citeras och kontrolleras, när en
  checklista tolkas om, och hur frågor och svar visas
- **Ersätter:** konsekvensen i [beslut 0013](0013-fragor-och-svar-fran-eavrop.md) att AI-uppgifterna inte läser svaren

## Sammanhang

Inköps svar på leverantörernas frågor i e-Avrop gäller alla leverantörer och hör till underlaget. De uppstår där
underlaget är otydligt, och de ändrar ofta kraven. Sedan beslut 0013 hämtas de och visas, men ingen AI-uppgift läser
dem. Checklistan kunde därför lista en oklarhet som inköp redan har besvarat några rader längre ned, och Fråga AI
kunde svara utifrån en text som ett svar har ändrat. I KBT-upphandlingen i oktober 2026 svarade inköp "Ja, det minskar
med 25% per poäng" om hur påslaget beräknas, något dokumentet själv inte sa.

Listan med svar var dessutom svår att läsa. Frågan stod i fetstil och svaret i vanlig text under den, så att ett kort
svar som "Ja" försvann.

## Beslut

**Svaren går med underlaget till `besvara_fraga` och `tolka_underlag`,** i blocket `<publicerade_svar>`, numrerade
`[SVAR n]` från det äldsta som på sidan och daterade. Instruktionerna säger att ett svar gäller före dokumentets text
där de säger olika. Fråga AI läser svaren först och citerar dem. Tolkningen tar inte med det som ett svar redan besvarar
bland oklarheterna, och ett krav som ett svar ändrar eller förtydligar säger vad som gäller efter svaret.

**Ett citat ur ett svar är ett eget slags källa,** `AnswerCitation` med svarets nummer och ordagrann text (`Answer.answer_citations`
och `Requirement.answer_citation`, båda tillägg i kontraktet). Vår kod kontrollerar citatet mot svarets fråga och svar,
som mot en sida, och sätter `answer_key`, svarets fasta nyckel, så att länken hittar rätt fråga även om numreringen
flyttar. Ett citat kortare än 20 tecken, som "Ja", godtas bara som hela ord i det svar det anger. Modellen sätter aldrig
`check`, `found_answer` eller `answer_key`.

**En checklista tolkas om när svaren ändras.** Checklistan sparar ett fingeravtryck av svaren den tolkades med
(`answers_digest`). Jobbet `interpret_pending` tolkar om öppna upphandlingar vars svar har tillkommit, ändrats eller
dragits tillbaka sedan dess, högst fem per körning. Den senaste checklistan avgör: en publicerad får en efterföljare (ett
utkast för inköp, eller publicerad direkt med granskningen av), och ett utkast som inköp aldrig har sparat eller
kommenterat ersätts och märks att det ersatts. Checklistan sparar när inköp senast sparade den (`edited_at`), så ett
utkast inköp har arbetat med ersätts aldrig. Ett sådant utkast, en godkänd och en avvisad checklista lämnas åt inköp.
En omtolkning som misslyckas räknas på checklistans dokument som i `interpret_pending`: nya försök efter 15 minuter,
30 minuter, 1 timme och 2 timmar, och jobbet ger upp efter fem försök eller direkt när samma underlag inte kan lyckas.
Dokumentet står då under "Underlag att tolka" hos inköp, med felet och "Tolka igen", som startar det igen. Matchningen och
granskningen av utkast läser checklistan och följer därmed svaren utan egen ändring.

**Frågor och svar visas som par.** Sektionen heter "Frågor och svar från inköp" och finns i "På den här sidan". Varje
post har "Fråga 3 · Besvarad 9 okt", frågan i dämpad text och svaret på en egen yta med accentkant och rubriken "Svar
från inköp". Från sex poster finns ett sökfält. Ett citerat svar visas i Fråga AI och i kravraden med frågan det
besvarar och länken "Frågor och svar från inköp, fråga 3". Ett citat som inte hittades, eller vars svar e-Avrop har
dragit tillbaka, säger det. I inköps granskning märks kravet "Bygger på inköps svar, fråga 3", och ett citat som inte
stämmer flaggas och räknas bland källhänvisningarna som behöver kontrolleras. Sammanställningen av citat som sparas med
checklistan (`verification`) räknar dokumentets citat, som ursprungsraden talar om.

Det starkaste alternativet var att lägga svaren som ett extra dokument i underlaget, med en sida per svar. Då hade
citatkontrollen fungerat utan ändring, men källänken hade öppnat källdialogen för ett dokument som inte finns, och
numreringen hade inte gått att knyta till rätt svar när e-Avrop ändrar ordningen.

## Konsekvenser

- Den heuristiska motorn kan inte avgöra vilket krav ett svar ändrar, så dess checklista läser inte svaren. I Fråga AI
  börjar den med ett publicerat svar vars fråga är nästan densamma som läsarens (minst 70 % av orden i de två
  frågorna tillsammans), så att ett svar om F-skatt aldrig blir svaret på en fråga om referenser.
- Första körningen efter införandet tolkar om varje öppen upphandling som har svar, fem i taget, med ett anrop till
  modellen per upphandling. Med granskningen på blir det ett nytt utkast för inköp per upphandling.
- Ett utkast som inköp sparade före införandet har ingen `edited_at` och skyddas bara av en anteckning.
- Instruktionerna har ändrats: kör `anbudsklar eneo provision` så att assistenterna i Eneo får den nya texten.
- Svaren hämtas en gång om dygnet (beslut 0013), så en checklista kan ligga ett dygn efter e-Avrop. Sektionen säger det.
