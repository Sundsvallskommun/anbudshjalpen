"""A fictitious tender draft for fixture 1, with deliberate gaps for the review demo.

The draft from "Målerifirman i Matfors AB" answers the procurement document for
"Ommålning av Solbackens förskola, Matfors". Deliberate gaps:

- the liability insurance is answered "Ja" but no insurance certificate is attached
  (requirement not proven),
- the reference form is missing and no concrete references are given,
- the prices are correctly stated in SEK excluding VAT (a requirement that is met).

`EXPECTED_CHECKS` lists the review result a careful reviewer should reach for the
requirements the draft is designed to exercise, keyed by the requirement keys of the
procurement document.
"""

from __future__ import annotations

from dataclasses import dataclass

from anbudsklar.contracts.tasks import CheckStatus
from fixturegen import ommalning
from fixturegen.blocks import Block, Bullets, Chapter, Cover, Heading, Para, Table, Tracked
from fixturegen.dates import DateBook, KeyDate

COMPANY = "Målerifirman i Matfors AB"
FILENAME = "anbudsutkast-malerifirman-i-matfors.pdf"
SLUG = "anbudsutkast-malerifirman"
KEY_DATES = (*ommalning.KEY_DATES, KeyDate("utkast", "annat", "Anbudsutkastets datum", 22))
DISCLAIMER = (
    "FIKTIVT ANBUDSUTKAST. Det här utkastet är påhittat och används för att demonstrera hur "
    "Anbudsklar granskar ett anbud mot förfrågningsunderlaget. Företaget, personerna och alla "
    "uppgifter är fiktiva."
)


@dataclass(frozen=True)
class ExpectedCheck:
    requirement_key: str
    status: CheckStatus
    comment: str
    has_draft_quote: bool = True


EXPECTED_CHECKS = (
    ExpectedCheck("svenska", "uppfyllt", "Anbudet anger att det är skrivet på svenska."),
    ExpectedCheck("hela_uppdraget", "uppfyllt", "Anbudet omfattar hela uppdraget."),
    ExpectedCheck("giltighet", "uppfyllt", "Giltighetstiden stämmer med förfrågningsunderlaget."),
    ExpectedCheck(
        "pris_exkl_moms",
        "uppfyllt",
        "Priserna är angivna i svenska kronor exklusive mervärdesskatt, och post C stämmer med A + 40 × B.",
    ),
    ExpectedCheck(
        "bilagor",
        "saknas",
        "Referensblanketten (bilaga 2) och försäkringsbeviset (bilaga 4) finns inte med bland bilagorna.",
        has_draft_quote=False,
    ),
    ExpectedCheck("underleverantorer", "uppfyllt", "Underleverantören för ställningar är angiven."),
    ExpectedCheck("sanningsforsakran", "uppfyllt", "Sanningsförsäkran är undertecknad."),
    ExpectedCheck("f_skatt", "uppfyllt", "Anbudsgivaren uppger F-skatt; kommunen kontrollerar själv."),
    ExpectedCheck(
        "ansvarsforsakring",
        "obevisat",
        "Anbudet svarar ja om ansvarsförsäkringen men försäkringsbeviset (bilaga 4) är inte bifogat.",
    ),
    ExpectedCheck(
        "referenser",
        "saknas",
        "Inga referensuppdrag redovisas och referensblanketten (bilaga 2) saknas.",
    ),
    ExpectedCheck("arbetsmiljo", "uppfyllt", "Systematiskt arbetsmiljöarbete och rutiner beskrivs."),
    ExpectedCheck(
        "genomforandebeskrivning",
        "uppfyllt",
        "Genomförandebeskrivningen finns och behandlar de fyra delarna.",
    ),
    ExpectedCheck("avtalsvillkor", "uppfyllt", "Avtalsvillkoren accepteras utan reservationer."),
)

EXPECTED_ATTACHMENTS = (
    ("Prisbilaga (bilaga 1)", "bifogad"),
    ("Referensblankett (bilaga 2)", "saknas"),
    ("Sanningsförsäkran (bilaga 3)", "bifogad"),
    ("Försäkringsbevis för ansvarsförsäkring (bilaga 4)", "saknas"),
    ("Genomförandebeskrivning", "bifogad"),
)


def build_cover(d: DateBook) -> Cover:
    return Cover(
        kicker="Anbudsutkast",
        title=f"Anbud: {ommalning.TITLE}",
        facts=(
            ("Anbudsgivare", COMPANY),
            ("Organisationsnummer", "559900-0013 (fiktivt)"),
            ("Kontaktperson", "Anna Berg, verkställande direktör"),
            ("Telefon", "070-174 06 21 (fiktivt nummer)"),
            ("E-post", "anna.berg@malerifirman-matfors.example"),
            ("Upphandlingsnummer", ommalning.REFERENCE),
            ("Datum", d.iso("utkast")),
            ("Status", "Utkast, inte inlämnat"),
        ),
        disclaimer=DISCLAIMER,
    )


def build_blocks(d: DateBook) -> list[Block]:
    return [
        Chapter("1 Anbudsformulär"),
        Tracked(
            "hela_uppdraget",
            "Vi lämnar härmed anbud på hela uppdraget enligt avsnitt 4 i förfrågningsunderlaget.",
        ),
        Tracked("giltighet", f"Anbudet är giltigt till och med den {d.long('giltighet')}."),
        Tracked("svenska", "Anbudet är skrivet på svenska och lämnas via e-Avrop."),
        Tracked("avtalsvillkor", "Vi accepterar avtalsvillkoren i avsnitt 6 utan reservationer."),
        Tracked(
            "underleverantorer",
            "Ställningar hyrs och monteras av underleverantören Ställningsbolaget i Mitt AB (fiktivt "
            "företag). Inga andra underleverantörer anlitas.",
        ),
        Para("Vi lämnar inte anbud i grupp och åberopar inte andra företags kapacitet."),
        Chapter("2 Kvalificering", new_page=False),
        Heading("Avsnitt 3.1 Uteslutning"),
        Tracked("sanningsforsakran", "Sanningsförsäkran är undertecknad, se avsnitt 6 i detta anbud."),
        Heading("Avsnitt 3.2 Registrering och F-skatt"),
        Tracked(
            "f_skatt",
            f"{COMPANY} är registrerat i aktiebolagsregistret och godkänt för F-skatt. Vi har inga skulder "
            "hos Skatteverket eller Kronofogden.",
        ),
        Heading("Avsnitt 3.3 Ekonomisk stabilitet"),
        Para("Företaget har riskklass 4 enligt vår senaste kreditupplysning."),
        Heading("Avsnitt 3.4 Ansvarsförsäkring"),
        Tracked(
            "ansvarsforsakring",
            "Ja. Företaget har en ansvarsförsäkring med ett försäkringsbelopp på 5 000 000 kronor per "
            "skadetillfälle.",
        ),
        Heading("Avsnitt 3.5 Referensuppdrag"),
        Tracked(
            "referenser",
            "Vi har målat många skolor och förskolor i regionen och lämnar gärna referenser om "
            "kommunen vill.",
        ),
        Heading("Avsnitt 3.6 Arbetsmiljö"),
        Tracked(
            "arbetsmiljo",
            "Vi bedriver ett systematiskt arbetsmiljöarbete och har skriftliga rutiner för riskbedömning, "
            "arbete på höjd och hantering av kemiska produkter. Rutinerna kan visas på begäran.",
        ),
        Chapter("3 Genomförandebeskrivning"),
        Tracked(
            "genomforandebeskrivning",
            "Genomförandebeskrivningen omfattar två A4-sidor och följer de fyra delarna i avsnitt 5.3.",
        ),
        Heading("a) Tidplan och etappindelning"),
        Para(
            "Vi delar den utvändiga målningen i tre etapper: norra och östra fasaden, södra fasaden och "
            "västra fasaden med entrén. Varje etapp tar cirka två veckor. Entrén målas en fredag och "
            "lördag så att den är torr till måndag. Den invändiga målningen görs under sommarstängningen "
            "med två målare i lekrummen och en målare i korridoren och kapprummen."
        ),
        Heading("b) Skydd för barn, personal och besökare"),
        Para(
            "Vi sätter upp byggstängsel som är två meter högt runt den fasad vi arbetar med. "
            "Ställningarna låses varje kväll. Vi skrapar och slipar inte mellan klockan 12.00 och 13.30 "
            "när barnen vilar. Vår servicebil kör in på gården före klockan 07.00 och parkeras sedan "
            "utanför förskolans grind."
        ),
        Heading("c) Kvalitet och arbetsledning"),
        Para(
            "Anna Berg är arbetsledare. Hon har gesällbrev i måleri och 18 års erfarenhet som målare. Vi "
            "gör egenkontroll efter varje etapp enligt vår kontrollplan och fotograferar underarbetet "
            "innan vi färdigstryker. Färgerna väljs bland produkter med bedömningen Rekommenderas eller "
            "Accepteras i Byggvarubedömningen."
        ),
        Heading("d) Kommunikation"),
        Para(
            "Vi håller ett startmöte med förskolans rektor och kommunens projektledare. Under arbetet "
            "sätter vi upp ett veckobrev vid entrén som berättar vad vi gör den kommande veckan. Anna Berg "
            "nås på telefon alla vardagar mellan klockan 07.00 och 17.00."
        ),
        Chapter("4 Pris (bilaga 1)"),
        Table(
            rows=(
                ("Post", "Beskrivning", "Pris exkl. moms"),
                ("A", "Fast pris för hela uppdraget enligt avsnitt 4", "742 000 kronor"),
                ("B", "Timpris för tilläggsarbete, målare", "545 kronor per timme"),
                ("C", "Utvärderingspris: A + 40 × B", "763 800 kronor"),
            ),
            widths=(14, 92, 44),
        ),
        Tracked("pris_exkl_moms", "Samtliga priser är angivna i svenska kronor exklusive mervärdesskatt."),
        Chapter("5 Bilagor till anbudet", new_page=False),
        Bullets(
            (
                "Bilaga 1 Prisbilaga, ifylld (se avsnitt 4)",
                "Bilaga 3 Sanningsförsäkran, undertecknad (se avsnitt 6)",
                "Genomförandebeskrivning (se avsnitt 3)",
            )
        ),
        Chapter("6 Sanningsförsäkran (bilaga 3)", new_page=False),
        Para(
            f"Undertecknad, behörig företrädare för {COMPANY}, försäkrar på heder och samvete att "
            "punkterna 1–5 i bilaga 3 till förfrågningsunderlaget stämmer för företaget."
        ),
        Para(f"Matfors den {d.long('utkast')}"),
        Para(f"Anna Berg, verkställande direktör, {COMPANY}"),
    ]
