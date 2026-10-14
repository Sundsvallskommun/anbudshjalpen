# 0025: Granska tar emot flera filer, och citaten pekar på filen

- **Status:** Accepterat
- **Datum:** 2026-10-14
- **Gäller:** vad steget Granska tar emot, hur granskningens citat pekar, hur bilagor bedöms och gränserna för ett
  utkast
- **Ersätter:** i [direction.md](../direction.md), avsnitt 4 "Steg 3 Granska", att granskningen börjar så fort filen
  är vald

## Sammanhang

Ett anbud är sällan en fil. Företaget lämnar anbudet och det som ska bifogas: referensblanketter, försäkringsbevis,
intyg och prisbilagor, ofta som egna filer. Granska tog emot en fil, och granskningen började så fort den var vald,
för att det skulle finnas en sak att göra och ingen knapp att leta efter. Den som ville få med bilagorna fick slå ihop
allt till en PDF först. Utan bilagorna såg granskningen bara hur anbudet beskrev dem, inte vad som stod i dem, till
exempel vilken period ett skattekontoutdrag gällde, och bilagan som fanns som egen fil blev "saknas" eller "oklart".

## Beslut

**Utkastet är en eller flera filer.** Steget Granska samlar filerna i en lista, där varje fil kan tas bort igen, och
knappen "Granska utkastet" skickar dem som ett utkast. Samma fil två gånger räknas en gång. Filerna skickas i fältet
`file` i samma anrop, `POST /api/notices/{id}/review`, och delar gränserna en fil hade: tillsammans högst 20 MB,
300 sidor och 1 500 000 tecken, och högst tio filer. Ett utkast över gränserna avvisas i stället för att läsas till
hälften, så att granskningen aldrig säger att något saknas för att det inte lästes.

**Motorn får utkastet som ett `DocumentSet`,** som den får upphandlingens dokument ([beslut
0020](0020-checklistan-lases-ur-alla-dokument.md)): en förteckning över filerna, sedan varje fil med sin rad
`DOKUMENT:` och sina sidmarkeringar. Förteckningen säger att det är ett utkast och pekar inte ut något huvuddokument,
eftersom företaget väljer filerna i vilken ordning som helst. En fil per utkast ser ut som förut.

**Citaten pekar på filen.** `RequirementCheck` får `draft_document`, filens namn från raden `DOKUMENT:`, som modellen
sätter när utkastet har flera filer. Citatkontrollen letar först i den fil som anges, sedan i de andra, och rättar
`draft_document` och `draft_page` till där citatet står, som för ett svar. Webbappen säger "Ur forsakringsbevis.pdf,
s. 1" i stället för "Ur ditt utkast, s. 1".

**En fil som heter som bilagan är bilagan.** Granskningen bedömer "Bilaga 3 Referensblankett" som `bifogad` när en av
utkastets filer har det namnet, inte bara när anbudet skriver att den bifogas. Den heuristiska motorn gör det på
filnamnets ord; instruktionen säger samma sak till modellen.

Det starkaste alternativet var att låta filerna flyta ihop till ett dokument med fortlöpande sidnummer och filnamnet
som rubrik. Det hade sparat kontraktsändringen, men citaten hade pekat på "s. 7" i ett dokument som inte finns, och
citatkontrollen hade inte kunnat rätta en fil. Formen från beslut 0020 fanns redan, så flera filer kostar lite.

## Konsekvenser

- Steget Granska har en knapp. Det är ett steg mer än förut för den som bara har en fil, men ett sätt för alla.
  Knappen är aktiv och fältet säger vad som saknas när den trycks, som inköparens uppladdning.
- Kontraktet `granska_utkast` har ett nytt fält, `draft_document`, och instruktionen har ändrats: kör
  `anbudsklar eneo provision`. `CONTRACT_VERSION` är `2026-10-14`.
- `AiEngine.review_draft` tar ett `DocumentSet`. `frontend/src/api/types.ts` speglar det nya fältet.
- Nya tester i `backend/tests/api/test_review.py`, `backend/tests/ai/test_ai_heuristic.py`,
  `backend/tests/documents/test_document_citations.py` och `frontend/src/pages/notice/steps/review/`.
