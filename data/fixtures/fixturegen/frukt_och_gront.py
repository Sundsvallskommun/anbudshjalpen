"""Fixture 3: "Livsmedel – frukt och grönt".

A framework agreement with one supplier (7 kap. 1 och 4 §§ LOU) procured with an open
procedure (6 kap. 2 § LOU) and evaluated on price only (16 kap. 1 § LOU). The LOU
references were checked against Riksdagen's consolidated text (SFS 2016:1145, amended
up to SFS 2026:880), including 7 kap. 2 § (at most four years without special reasons),
12 kap. 12 § and 20 kap. 1 § (notification and standstill period).
"""

from __future__ import annotations

from fixturegen.blocks import Block, Chapter, Cover, Heading, Para, Req, Table
from fixturegen.dates import DateBook, KeyDate
from fixturegen.spec import BUYER, BUYER_CONTACT, DISCLAIMER, NoticeSpec

SKALL = "skallkrav"
KVAL = "kvalificeringskrav"
UPPDRAG = "krav_pa_uppdraget"
AVTAL = "avtalsvillkor"

TITLE = "Livsmedel – frukt och grönt"
REFERENCE = "DEMO-2026-0128"

KEY_DATES = (
    KeyDate("annons", "annat", "Annonsering i e-Avrop och TED", -20),
    KeyDate("fragestopp", "fragestopp", "Sista dag för frågor", 7),
    KeyDate("sista_anbudsdag", "sista_anbudsdag", "Sista anbudsdag", 17),
    KeyDate("tilldelning", "tilldelning", "Planerat tilldelningsbeslut", 31),
    KeyDate("giltighet", "anbudets_giltighet", "Anbudet ska vara giltigt till och med", 118),
    KeyDate("avtalsstart", "avtalsstart", "Ramavtalet börjar gälla", 178),
    KeyDate("avtalsslut", "annat", "Ramavtalet löper ut (utan förlängning)", 908),
)

BASKET = (
    ("1", "Bananer, klass I", "kg", "18 000"),
    ("2", "Äpplen, svenska när säsong finns, klass I", "kg", "14 000"),
    ("3", "Päron, klass I", "kg", "4 500"),
    ("4", "Apelsiner, klass I", "kg", "6 000"),
    ("5", "Clementiner, klass I", "kg", "5 000"),
    ("6", "Vindruvor, kärnfria", "kg", "1 800"),
    ("7", "Gurka", "kg", "9 000"),
    ("8", "Tomater", "kg", "8 500"),
    ("9", "Paprika, röd", "kg", "4 000"),
    ("10", "Isbergssallad", "kg", "5 500"),
    ("11", "Morötter, svenska", "kg", "16 000"),
    ("12", "Gul lök, svensk", "kg", "7 500"),
    ("13", "Vitkål, svensk", "kg", "6 000"),
    ("14", "Broccoli", "kg", "3 500"),
    ("15", "Blomkål", "kg", "3 000"),
    ("16", "Potatis, fast, svensk", "kg", "42 000"),
    ("17", "Rödbetor, svenska", "kg", "2 500"),
    ("18", "Purjolök", "kg", "1 500"),
    ("19", "Citroner", "kg", "900"),
    ("20", "Färska örter i kruka, basilika", "st", "1 200"),
)


KITCHENS = (
    ("Sundsvall centrum", "4", "9"),
    ("Matfors och Stöde", "2", "6"),
    ("Njurunda och Kvissleby", "3", "7"),
    ("Alnö", "1", "4"),
    ("Kovland och Liden", "1", "3"),
    ("Sundsvall norr", "1", "4"),
)

DELIVERY_POINTS = (
    ("Sundsvall centrum", "Tallkottens förskola, mottagningskök", "måndag och torsdag"),
    ("Sundsvall centrum", "Stjärnans förskola, mottagningskök", "måndag och torsdag"),
    ("Sundsvall centrum", "Granbackaskolan, tillagningskök", "måndag, onsdag och fredag"),
    ("Sundsvall centrum", "Björkhagens äldreboende, tillagningskök", "måndag, onsdag och fredag"),
    ("Matfors och Stöde", "Älvängsskolan, tillagningskök", "måndag och torsdag"),
    ("Matfors och Stöde", "Solbackens förskola, mottagningskök", "tisdag och fredag"),
    ("Matfors och Stöde", "Lärkhedens skola, tillagningskök", "tisdag och fredag"),
    ("Njurunda och Kvissleby", "Havsviksskolan, tillagningskök", "måndag och torsdag"),
    ("Njurunda och Kvissleby", "Ekorrens förskola, mottagningskök", "tisdag och fredag"),
    ("Alnö", "Furuuddens skola, tillagningskök", "tisdag och fredag"),
    ("Kovland och Liden", "Fjällsätersskolan, tillagningskök", "onsdag"),
)


def build_cover(d: DateBook) -> Cover:
    return Cover(
        kicker="Förfrågningsunderlag",
        title=TITLE,
        facts=(
            ("Upphandlande myndighet", BUYER),
            ("Upphandlingsnummer", REFERENCE),
            ("Förfarande", "Öppet förfarande enligt 6 kap. 2 § LOU, ramavtal med en leverantör"),
            ("Datum", d.iso("annons")),
            ("Sista anbudsdag", f"{d.iso('sista_anbudsdag')} kl. 23.59"),
            ("Kontaktperson", f"{BUYER_CONTACT} (frågor ställs i e-Avrop)"),
        ),
        disclaimer=DISCLAIMER,
    )


def build_blocks(d: DateBook) -> list[Block]:
    return [*_introduction(d), *_qualification(), *_specification(), *_evaluation_and_terms(d), *_basket()]


def _introduction(d: DateBook) -> list[Block]:
    return [
        Chapter("1 Inledning och administrativa föreskrifter"),
        Heading("1.1 Om upphandlingen"),
        Para(
            "Sundsvalls kommun, nedan kallad kommunen, upphandlar ett ramavtal för frukt och grönsaker "
            "till kommunens cirka 45 tillagnings- och mottagningskök i förskolor, skolor och äldreboenden. "
            "Ramavtalet tecknas med en leverantör, och kontrakt grundade på ramavtalet tilldelas enligt "
            "villkoren i ramavtalet (7 kap. 4 § LOU)."
        ),
        Para(
            "Kommunens uppskattade värde är cirka 3 200 000 kronor per år exklusive mervärdesskatt. De "
            "volymer som anges i bilaga 1 är uppskattningar och inget åtagande från kommunen."
        ),
        Heading("1.2 Kök som ingår"),
        Table(
            rows=(("Område", "Tillagningskök", "Mottagningskök"), *KITCHENS),
            widths=(70, 40, 40),
        ),
        Para("Leveransadresser och leveransdagar per kök anges i bilaga 2."),
        Heading("1.3 Förfarande och tidsplan"),
        Para(
            "Upphandlingen genomförs som ett öppet förfarande enligt 6 kap. 2 § lagen (2016:1145) om "
            "offentlig upphandling, LOU. Ramavtal får ingås med användning av något av lagens "
            "förfaranden (7 kap. 1 § LOU)."
        ),
        Table(
            rows=(
                ("Händelse", "Datum"),
                ("Annonsering i e-Avrop och TED", d.iso("annons")),
                ("Sista dag för frågor", d.iso("fragestopp")),
                ("Sista anbudsdag", f"{d.iso('sista_anbudsdag')} kl. 23.59"),
                ("Planerat tilldelningsbeslut", d.iso("tilldelning")),
                ("Ramavtalet börjar gälla", d.iso("avtalsstart")),
            ),
            widths=(95, 55),
        ),
        Para(
            f"Frågor ställs via frågefunktionen i e-Avrop senast den {d.long('fragestopp')}. Svaren "
            "publiceras anonymiserade i e-Avrop."
        ),
        Heading("1.4 Anbudets form och innehåll"),
        Req(
            "Anbud ska lämnas elektroniskt via e-Avrop senast sista anbudsdag.",
            SKALL,
            "Anbud lämnas via e-Avrop senast sista anbudsdag",
        ),
        Req("Anbudet ska vara skrivet på svenska.", SKALL, "Anbudet är skrivet på svenska"),
        Req(
            f"Anbudet ska vara giltigt till och med den {d.long('giltighet')}.",
            SKALL,
            "Anbudets giltighetstid",
        ),
        Req(
            "Anbudsgivaren ska lämna en egen försäkran i form av ett europeiskt enhetligt "
            "upphandlingsdokument (ESPD) enligt 15 kap. 1 § LOU.",
            SKALL,
            "Egen försäkran i ESPD",
        ),
        Req(
            "Anbudsgivaren ska lämna pris för samtliga 20 artiklar i varukorgen (bilaga 1), i svenska "
            "kronor exklusive mervärdesskatt och inklusive leverans.",
            SKALL,
            "Pris för samtliga artiklar i varukorgen",
        ),
        Para(
            "Tilldelningsbeslutet skickas till alla anbudsgivare via e-Avrop (12 kap. 12 § LOU). "
            "Ramavtalet får tecknas tidigast när avtalsspärren på 10 dagar har löpt ut (20 kap. 1 § LOU)."
        ),
    ]


def _qualification() -> list[Block]:
    return [
        Chapter("2 Kvalificering"),
        Para(
            "Kommunen prövar om det finns grund för uteslutning enligt 13 kap. 1–3 §§ LOU. Kraven nedan "
            "gäller från sista anbudsdag och under hela avtalstiden."
        ),
        Req(
            "Anbudsgivaren ska vara registrerad i aktiebolagsregistret, handelsregistret eller "
            "föreningsregistret eller i motsvarande register i etableringslandet.",
            KVAL,
            "Registrerad i bolags-, handels- eller föreningsregister",
        ),
        Req(
            "Anbudsgivaren ska ha haft en årsomsättning på minst 5 000 000 kronor under det senaste "
            "avslutade räkenskapsåret.",
            KVAL,
            "Årsomsättning minst 5 miljoner kronor",
        ),
        Req(
            "Anbudsgivaren ska vara registrerad som livsmedelsföretagare hos behörig kontrollmyndighet "
            "för den verksamhet som ramavtalet avser.",
            KVAL,
            "Registrerad livsmedelsföretagare",
        ),
        Req(
            "Anbudsgivaren ska ha ett dokumenterat system för egenkontroll som bygger på principerna i "
            "HACCP och omfattar mottagning, lagring och transport.",
            KVAL,
            "Egenkontrollsystem enligt HACCP",
        ),
        Req(
            "Anbudsgivaren ska under de senaste tre åren ha levererat frukt och grönsaker till minst två "
            "offentliga kunder med vardera minst 20 leveransadresser.",
            KVAL,
            "Två offentliga referenskunder",
        ),
    ]


def _specification() -> list[Block]:
    return [
        Chapter("3 Kravspecifikation"),
        Heading("3.1 Produkter"),
        Req(
            "Frukt och grönsaker ska minst uppfylla kraven för klass I enligt EU:s handelsnormer när en "
            "sådan norm finns för produkten.",
            UPPDRAG,
            "Klass I enligt EU:s handelsnormer",
        ),
        Req(
            "Varje produkt ska vara märkt med ursprungsland på förpackning eller följesedel.",
            UPPDRAG,
            "Ursprungsmärkning",
        ),
        Req(
            "Leverantören ska kunna erbjuda ekologiskt odlade alternativ till minst 10 av de 20 artiklarna "
            "i varukorgen.",
            UPPDRAG,
            "Ekologiska alternativ till minst 10 artiklar",
        ),
        Heading("3.2 Beställning och leverans"),
        Req(
            "Leverantören ska erbjuda beställning via en webbutik eller ett e-handelssystem där köken ser "
            "kommunens avtalade sortiment och priser.",
            UPPDRAG,
            "Beställning via webbutik eller e-handel",
        ),
        Req(
            "Leverans ska ske till varje kök minst två gånger per vecka, på dagar som kommunen bestämmer, "
            "mellan klockan 06.00 och 10.00.",
            UPPDRAG,
            "Leverans två gånger per vecka kl. 06.00–10.00",
        ),
        Req(
            "Beställningar som görs senast klockan 12.00 ska levereras nästa leveransdag.",
            UPPDRAG,
            "Beställning före kl. 12.00 levereras nästa leveransdag",
        ),
        Req(
            "Varor som kräver kylförvaring ska transporteras i en obruten kylkedja med högst 8 °C.",
            UPPDRAG,
            "Obruten kylkedja högst 8 °C",
        ),
        Req(
            "Fordon som används för leveranser ska uppfylla lägst utsläppsklass Euro 6 eller drivas med "
            "förnybart drivmedel.",
            UPPDRAG,
            "Fordon Euro 6 eller förnybart drivmedel",
        ),
        Heading("3.3 Reklamation, spårbarhet och statistik"),
        Req(
            "Reklamerade varor ska ersättas senast nästa leveransdag utan extra kostnad för kommunen.",
            UPPDRAG,
            "Reklamerade varor ersätts nästa leveransdag",
        ),
        Req(
            "Leverantören ska vid en återkallelse kunna spåra varje levererat parti till odlare eller "
            "packeri inom fyra timmar.",
            UPPDRAG,
            "Spårbarhet inom fyra timmar",
        ),
        Req(
            "Leverantören redovisar varje kvartal statistik över levererade artiklar, volymer och andel "
            "ekologiska produkter per kök.",
            UPPDRAG,
            "Kvartalsvis statistik per kök",
        ),
        Heading("3.4 Sortiment utöver varukorgen och kundtjänst"),
        Req(
            "Leverantören ska erbjuda ett sortiment på minst 150 artiklar frukt och grönsaker och ge en "
            "fast rabatt i procent på listpriset för artiklar som inte ingår i varukorgen.",
            UPPDRAG,
            "Sortiment på minst 150 artiklar med fast rabatt",
        ),
        Req(
            "Leverantören tillhandahåller en kundtjänst som köken når per telefon och e-post vardagar "
            "mellan klockan 06.00 och 15.00.",
            UPPDRAG,
            "Kundtjänst vardagar kl. 06.00–15.00",
        ),
    ]


def _evaluation_and_terms(d: DateBook) -> list[Block]:
    return [
        Chapter("4 Utvärdering"),
        Para(
            "Utvärderingen görs på grunden pris (16 kap. 1 § LOU). Utvärderingspriset är summan av varje "
            "artikels pris gånger den uppskattade årsvolymen i bilaga 1. Det anbud som har lägst "
            "utvärderingspris antas. Om två anbud har samma utvärderingspris avgörs tilldelningen genom "
            "lottning."
        ),
        Chapter("5 Avtalsvillkor", new_page=False),
        Heading("5.1 Avtalstid"),
        Para(
            f"Ramavtalet gäller från den {d.long('avtalsstart')} till och med den {d.long('avtalsslut')}. "
            "Kommunen får förlänga ramavtalet med ett år i taget, högst två gånger, så att den sammanlagda "
            "avtalstiden blir högst fyra år (7 kap. 2 § LOU)."
        ),
        Heading("5.2 Priser"),
        Para(
            "Priserna är fasta i tre månader. Därefter får leverantören justera priserna en gång per "
            "kvartal med högst förändringen i Statistiska centralbyråns konsumentprisindex för frukt och "
            "grönsaker under samma period."
        ),
        Req(
            "Leverantören ska skicka en prislista med de justerade priserna till kommunen senast 30 dagar "
            "innan de nya priserna börjar gälla.",
            AVTAL,
            "Prislista 30 dagar före prisjustering",
        ),
        Heading("5.3 Hållbarhet i leverantörskedjan"),
        Req(
            "Leverantören ska säkerställa att produkter som odlas utanför EU produceras under förhållanden "
            "som är förenliga med ILO:s kärnkonventioner, och på kommunens begäran redovisa hur detta "
            "kontrolleras.",
            AVTAL,
            "Produktion förenlig med ILO:s kärnkonventioner",
        ),
        Heading("5.4 Fakturering och vite"),
        Req(
            "Leverantören ska skicka fakturor elektroniskt per kök och leverans enligt lagen (2018:1277) "
            "om elektroniska fakturor till följd av offentlig upphandling.",
            AVTAL,
            "Elektronisk faktura per kök och leverans",
        ),
        Req(
            "Om en leverans uteblir eller är mer än två timmar försenad ska leverantören betala vite med "
            "500 kronor per kök och tillfälle.",
            AVTAL,
            "Vite vid utebliven eller försenad leverans",
        ),
        Heading("5.5 Uppföljning och hävning"),
        Req(
            "Leverantören ska delta i uppföljningsmöten med kommunen minst två gånger per år och redovisa "
            "leveransprecision och reklamationer.",
            AVTAL,
            "Uppföljningsmöten två gånger per år",
        ),
        Para(
            "Kommunen får häva ramavtalet om leverantören väsentligt bryter mot avtalet och inte vidtar "
            "rättelse inom 30 dagar efter skriftlig anmaning, och i de fall som anges i 17 kap. 17 § LOU."
        ),
    ]


def _basket() -> list[Block]:
    deliveries = tuple((area, kitchen, days) for area, kitchen, days in DELIVERY_POINTS)
    return [
        Chapter("Bilaga 1 Varukorg och prisbilaga"),
        Para(
            "Ange pris per enhet i svenska kronor exklusive moms, inklusive leverans. Volymerna är "
            "uppskattade per år för hela kommunen."
        ),
        Table(
            rows=(("Nr", "Artikel", "Enhet", "Uppskattad årsvolym", "Pris per enhet, kr"), *BASKET),
            widths=(10, 68, 16, 30, 26),
        ),
        Chapter("Bilaga 2 Leveransställen"),
        Para(
            "Urval av leveransställen med preliminära leveransdagar. Den fullständiga förteckningen med "
            "adresser lämnas till leverantören när ramavtalet har tecknats."
        ),
        Table(rows=(("Område", "Kök", "Leveransdagar"), *deliveries), widths=(40, 70, 40)),
    ]


SPEC = NoticeSpec(
    slug="frukt-och-gront",
    title=TITLE,
    reference_number=REFERENCE,
    description=(
        "Fiktiv upphandling för demonstration. Ramavtal med en leverantör för frukt och grönsaker till "
        "cirka 45 kök i förskolor, skolor och äldreboenden. Öppet förfarande. Utvärdering på lägsta pris "
        "för en varukorg med 20 artiklar."
    ),
    procedure="Öppet förfarande (6 kap. 2 § LOU), ramavtal med en leverantör",
    cpv_codes=("03221000", "03222000", "15300000"),
    place="Sundsvalls kommun",
    estimated_value_sek=12_800_000,
    key_dates=KEY_DATES,
    published="annons",
    deadline="sista_anbudsdag",
    filename="forfragningsunderlag-livsmedel-frukt-och-gront.pdf",
    with_toc=False,
    build_cover=build_cover,
    build_blocks=build_blocks,
)
