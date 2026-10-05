# Arkitektur

Syfte: Beskriva målbilden: vad som ligger i Eneo, vad som byggs i det här repot och varför.

Läs detta när: Du ska föreslå teknik, bygga en del eller förklara lösningen för någon annan.

Hör ihop med: [Eneos byggstenar](eneo-building-blocks.md), [Beslut](decisions/README.md), [Öppna frågor](open-questions.md)

> **Under diskussion.** Målbilden bygger på förslaget i [beslut 0001](decisions/0001-eneo-first.md), som inte är
> beslutat än.

## Målbild

```
Eneo core (anropas direkt, ingen proxy)
├─ Widget:     Regelhjälpen på sundsvall.se: anonym, om LOU, vägledningar och kommunens regler
├─ Flows:      Tolka underlag · Granska anbudsutkast · Bedöm matchning
│              (JSON med typat kontrakt och citat; granskningssteg för inköparen)
└─ Assistent för inköpare, med MCP mot upphandlingsdatan

Anbudsklar (det här repot)
├─ Upphandlingsdata: hämtar från TED, e-Avrop och avtalskatalogen; API och MCP (bara läsning)
└─ Företagarappen:   inloggning och behörighet, profil, bevakning, påminnelser;
                     startar Eneos flöden med en servicenyckel
```

## Varför de egna delarna finns

De egna delarna finns för det som Eneo saknar eller inte ska äga. Det handlar inte om nyckelhantering.

| Behov | Varför inte i Eneo |
|---|---|
| Företagsidentitet (BankID och behörighet att företräda företaget) | Eneo har inga externa användare. Widgets är anonyma, och moduler kräver ett Eneo-konto |
| Profiler, bevakningar, frister och påminnelser | Eneo har ingen sådan datamodell och kan inte skicka notiser |
| Insamling från TED, e-Avrop och avtalskatalogen | Det kräver schemaläggning, internetåtkomst och strukturerad lagring av upphandlingsdata |

## Var tekniken gör nytta

| Funktion | Teknik | Varför |
|---|---|---|
| Regelfrågor | RAG i Eneo. LOU delas upp så att varje kapitel/paragraf blir ett eget dokument | Eneo hänvisar till hela dokument, så då blir hänvisningen paragrafen |
| Checklista ur underlaget | Ett flöde som läser hela dokumentet och ger JSON med citat och sidnummer. Appen kontrollerar att citatet står på den sidan | RAG hämtar bara de mest relevanta styckena och tappar krav när frågan är "lista alla skallkrav" |
| Frågor om underlaget | Hela dokumentet skickas med, svaret ska ha citat och sida, och citaten kontrolleras | Samma skäl |
| Bevakning | Först fasta regler (CPV-hierarki, datum, ort), sedan bedömer AI:n mot kraven som plockats ut | Går att förklara och testa |
| Granskning av utkast | Krav för krav, med strukturerat svar | Utkasten sparas inte längre än körningen kräver |
| Prediktion | Datumräkning på avtalskatalogen. AI:n sammanfattar bara förra gångens krav | Mest unikt värde, minst AI |

MCP används bara där en AI-klient själv ska hitta information, till exempel inköparnas assistent. Kärnflödena är
förutsägbara steg och använder inte MCP. Företagsdata exponeras aldrig via MCP.

## Dataskydd i designen

- Anbudsklars assistenter och flöden ligger i ett eget space. Inköpare är inte redaktörer där, Insights är avstängt och
  lagringstiden är kort.
- Appen använder en `sk_`-nyckel som ägs av ett servicekonto, aldrig en nyckel som ägs av en person.
- Appen ser till att ett företag bara kommer åt sina egna körningar.
- Anbudsutkast sparas inte i appen. I Eneo gäller flödets lagringstid.
- Det som inköp får se under anbudstiden är sammanställt och visas helst först efter tilldelning.
