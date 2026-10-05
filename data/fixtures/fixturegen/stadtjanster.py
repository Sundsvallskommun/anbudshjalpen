"""Fixture 2: "Städtjänster för kommunens förskolor".

An open procedure above the EU threshold (6 kap. 2 § LOU). The LOU references were
checked against Riksdagen's consolidated text (SFS 2016:1145, amended up to
SFS 2026:880): 4 kap. 14 § (reasons for not dividing into lots), 12 kap. 12 §
(notification of award), 13 kap. 1–3 §§ (exclusion), 14 kap. 2, 3 and 5 §§
(qualification), 15 kap. 1 § (ESPD), 16 kap. 1 and 6 §§ (evaluation and weighting),
17 kap. 2 § (labour law conditions), 17 kap. 17 § (termination) and 20 kap. 1 §
(standstill period).
"""

from __future__ import annotations

from fixturegen.blocks import Block, Bullets, Chapter, Cover, Heading, Para, Req, Table
from fixturegen.dates import DateBook, KeyDate
from fixturegen.spec import BUYER, BUYER_CONTACT, DISCLAIMER, NoticeSpec

SKALL = "skallkrav"
KVAL = "kvalificeringskrav"
UPPDRAG = "krav_pa_uppdraget"
AVTAL = "avtalsvillkor"

TITLE = "Städtjänster för kommunens förskolor"
REFERENCE = "DEMO-2026-0139"

KEY_DATES = (
    KeyDate("annons", "annat", "Annonsering i e-Avrop och TED", -14),
    KeyDate("fragestopp", "fragestopp", "Sista dag för frågor", 14),
    KeyDate("svar", "annat", "Sista dag för kommunens svar på frågor", 18),
    KeyDate("sista_anbudsdag", "sista_anbudsdag", "Sista anbudsdag", 24),
    KeyDate("tilldelning", "tilldelning", "Planerat tilldelningsbeslut", 45),
    KeyDate("giltighet", "anbudets_giltighet", "Anbudet ska vara giltigt till och med", 177),
    KeyDate("avtalsstart", "avtalsstart", "Avtalsstart", 119),
    KeyDate("avtalsslut", "annat", "Avtalet löper ut (utan förlängning)", 849),
)

PRESCHOOLS = (
    ("Solbackens förskola", "Matfors", "640"),
    ("Granens förskola", "Matfors", "720"),
    ("Lärkans förskola", "Stöde", "540"),
    ("Myrans förskola", "Kovland", "610"),
    ("Ekorrens förskola", "Njurunda", "880"),
    ("Blåbärets förskola", "Njurunda", "760"),
    ("Tallkottens förskola", "Sundsvall centrum", "1 040"),
    ("Stjärnans förskola", "Sundsvall centrum", "930"),
    ("Vitsippans förskola", "Alnö", "690"),
    ("Humlans förskola", "Alnö", "580"),
    ("Kottens förskola", "Kvissleby", "820"),
    ("Regnbågens förskola", "Kvissleby", "990"),
)


def build_cover(d: DateBook) -> Cover:
    return Cover(
        kicker="Förfrågningsunderlag",
        title=TITLE,
        facts=(
            ("Upphandlande myndighet", BUYER),
            ("Upphandlingsnummer", REFERENCE),
            ("Förfarande", "Öppet förfarande enligt 6 kap. 2 § LOU"),
            ("Datum", d.iso("annons")),
            ("Sista anbudsdag", f"{d.iso('sista_anbudsdag')} kl. 23.59"),
            ("Kontaktperson", f"{BUYER_CONTACT} (frågor ställs i e-Avrop)"),
        ),
        disclaimer=DISCLAIMER,
    )


def build_blocks(d: DateBook) -> list[Block]:
    return [
        *_introduction(d),
        *_administrative(d),
        *_qualification(),
        *_specification(),
        *_evaluation(),
        *_contract_terms(d),
        *_attachments(),
    ]


def _introduction(d: DateBook) -> list[Block]:
    return [
        Chapter("1 Inledning"),
        Heading("1.1 Om upphandlingen"),
        Para(
            "Sundsvalls kommun, nedan kallad kommunen, upphandlar lokalvård för tolv kommunala förskolor. "
            "Uppdraget omfattar daglig städning, storstädning två gånger per år och fönsterputs en gång "
            "per år. Nuvarande avtal löper ut när det nya avtalet börjar gälla."
        ),
        Heading("1.2 Förskolor som ingår"),
        Table(
            rows=(("Förskola", "Område", "Städyta, m²"), *PRESCHOOLS),
            widths=(70, 50, 30),
        ),
        Para(
            "Den sammanlagda städytan är cirka 9 200 kvadratmeter. Ritningar med ytor per rum finns som "
            "separata filer i e-Avrop."
        ),
        Heading("1.3 Värde och avtalstid"),
        Para(
            "Kommunens uppskattade värde är cirka 3 400 000 kronor per år exklusive mervärdesskatt. "
            f"Avtalet gäller från den {d.long('avtalsstart')} till och med den {d.long('avtalsslut')} "
            "med möjlighet till förlängning, se avsnitt 6.1."
        ),
        Heading("1.4 Uppdelning i delar"),
        Para(
            "Kommunen har valt att inte dela upp upphandlingen i delar. Förskolorna har samma behov och "
            "rutiner, och en samordnad leverantör ger enhetlig kvalitet och en kontaktväg för "
            "förskolorna. Skälen redovisas här enligt 4 kap. 14 § LOU."
        ),
    ]


def _administrative(d: DateBook) -> list[Block]:
    return [
        Chapter("2 Administrativa föreskrifter"),
        Heading("2.1 Förfarande"),
        Para(
            "Upphandlingen genomförs som ett öppet förfarande enligt 6 kap. 2 § lagen (2016:1145) om "
            "offentlig upphandling, LOU. Alla leverantörer får lämna anbud. Förhandling är inte tillåten "
            "i ett öppet förfarande, så anbudet bör vara komplett och innehålla anbudsgivarens bästa villkor."
        ),
        Heading("2.2 Tidsplan"),
        Table(
            rows=(
                ("Händelse", "Datum"),
                ("Annonsering i e-Avrop och TED", d.iso("annons")),
                ("Sista dag för frågor", d.iso("fragestopp")),
                ("Sista dag för kommunens svar på frågor", d.iso("svar")),
                ("Sista anbudsdag", f"{d.iso('sista_anbudsdag')} kl. 23.59"),
                ("Planerat tilldelningsbeslut", d.iso("tilldelning")),
                ("Avtalsstart", d.iso("avtalsstart")),
            ),
            widths=(95, 55),
        ),
        Heading("2.3 Frågor under anbudstiden"),
        Para(
            f"Frågor ställs via frågefunktionen i e-Avrop senast den {d.long('fragestopp')}. Kommunen "
            f"publicerar svaren anonymiserade i e-Avrop senast den {d.long('svar')}. Svaren blir en del "
            "av upphandlingsdokumenten."
        ),
        Heading("2.4 Anbudets form och innehåll"),
        Req(
            "Anbud ska lämnas elektroniskt via e-Avrop senast sista anbudsdag. Anbud som kommer in för "
            "sent eller på annat sätt prövas inte.",
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
            "Anbud ska omfatta samtliga tolv förskolor i avsnitt 1.2. Anbud på enstaka förskolor "
            "prövas inte.",
            SKALL,
            "Anbudet omfattar samtliga tolv förskolor",
        ),
        Req(
            "Anbudsgivaren ska lämna en egen försäkran i form av ett europeiskt enhetligt "
            "upphandlingsdokument (ESPD) enligt 15 kap. 1 § LOU. ESPD fylls i via e-Avrop.",
            SKALL,
            "Egen försäkran i ESPD",
        ),
        Req(
            "Priser ska anges i svenska kronor exklusive mervärdesskatt i prisbilagan (bilaga 1).",
            SKALL,
            "Priser i SEK exklusive moms i prisbilagan",
        ),
        Heading("2.5 Prövning, tilldelning och avtalsspärr"),
        Para(
            "Kommunen kontrollerar först att anbuden uppfyller de formella kraven, därefter att det inte "
            "finns grund för uteslutning och att kvalificeringskraven är uppfyllda, sedan kraven i "
            "kravspecifikationen. Till sist utvärderas anbuden enligt avsnitt 5."
        ),
        Para(
            "Tilldelningsbeslutet skickas till alla anbudsgivare via e-Avrop med skälen för beslutet "
            "(12 kap. 12 § LOU). Avtal får tecknas tidigast när avtalsspärren på 10 dagar har löpt ut "
            "(20 kap. 1 § LOU)."
        ),
    ]


def _qualification() -> list[Block]:
    return [
        Chapter("3 Kvalificering och uteslutning"),
        Heading("3.1 Uteslutning"),
        Para(
            "Kommunen ska utesluta en leverantör om det finns grund för det enligt 13 kap. 1 eller 2 § "
            "LOU och kan utesluta en leverantör enligt 13 kap. 3 § LOU. Kommunen kontrollerar uppgifter "
            "om skatter och avgifter hos Skatteverket för den anbudsgivare som ska tilldelas kontraktet."
        ),
        Heading("3.2 Registrering"),
        Req(
            "Anbudsgivaren ska vara registrerad i aktiebolagsregistret, handelsregistret eller "
            "föreningsregistret eller i motsvarande register i etableringslandet (14 kap. 2 § LOU).",
            KVAL,
            "Registrerad i bolags-, handels- eller föreningsregister",
        ),
        Heading("3.3 Ekonomisk och finansiell ställning"),
        Req(
            "Anbudsgivaren ska ha haft en årsomsättning på minst 3 000 000 kronor under det senaste "
            "avslutade räkenskapsåret (14 kap. 3 § LOU).",
            KVAL,
            "Årsomsättning minst 3 miljoner kronor",
        ),
        Req(
            "Anbudsgivaren ska ha en ansvarsförsäkring med ett försäkringsbelopp på minst 10 000 000 "
            "kronor per skadetillfälle. Försäkringsbevis ska bifogas anbudet.",
            KVAL,
            "Ansvarsförsäkring minst 10 miljoner kronor",
        ),
        Heading("3.4 Teknisk och yrkesmässig kapacitet"),
        Req(
            "Anbudsgivaren ska under de senaste tre åren ha utfört minst två uppdrag med lokalvård i "
            "förskola eller skola, vart och ett med en städyta på minst 1 500 kvadratmeter. Uppdragen ska "
            "redovisas med beställare, kontaktperson, tidsperiod och städyta (14 kap. 5 § LOU).",
            KVAL,
            "Två referensuppdrag med lokalvård i förskola eller skola",
        ),
        Req(
            "Anbudsgivaren ska ha dokumenterade rutiner för kvalitetsledning och miljöledning, eller vara "
            "certifierad enligt ISO 9001 och ISO 14001 eller motsvarande. Rutinerna eller certifikaten "
            "ska bifogas anbudet.",
            KVAL,
            "Rutiner eller certifiering för kvalitet och miljö",
        ),
    ]


def _specification() -> list[Block]:
    return [
        Chapter("4 Kravspecifikation"),
        Heading("4.1 Städkvalitet"),
        Req(
            "Städningen ska hålla kvalitetsnivå 4 i toaletter och skötrum och kvalitetsnivå 3 i övriga "
            "utrymmen, bedömt enligt INSTA 800.",
            UPPDRAG,
            "Städkvalitet enligt INSTA 800",
        ),
        Heading("4.2 Städfrekvens och tider"),
        Req(
            "Daglig städning ska utföras vardagar efter förskolornas stängning, tidigast klockan 17.30, och "
            "vara klar senast klockan 06.00 nästa morgon.",
            UPPDRAG,
            "Daglig städning efter stängning",
        ),
        Req(
            "Storstädning ska utföras två gånger per år, under förskolornas sommarstängning och under "
            "jullovet, enligt en plan som leverantören tar fram tillsammans med varje förskola.",
            UPPDRAG,
            "Storstädning två gånger per år",
        ),
        Req(
            "Fönsterputs ska utföras invändigt och utvändigt en gång per år, under perioden april till juni.",
            UPPDRAG,
            "Fönsterputs en gång per år",
        ),
        Heading("4.3 Metoder, kemikalier och utrustning"),
        Req(
            "Rengöringsmedel ska vara märkta med Svanen eller EU Ecolabel eller uppfylla motsvarande "
            "krav. Doseringen ska vara automatisk eller förutbestämd.",
            UPPDRAG,
            "Miljömärkta rengöringsmedel med kontrollerad dosering",
        ),
        Req(
            "Leverantören ska använda mikrofiberbaserade metoder för golv och ytor.",
            UPPDRAG,
            "Mikrofiberbaserade metoder",
        ),
        Req(
            "Leverantören håller med städutrustning, maskiner och städmaterial. Kommunen står för "
            "toalettpapper, pappershanddukar och tvål.",
            UPPDRAG,
            "Leverantören håller med utrustning och städmaterial",
        ),
        Heading("4.4 Personal"),
        Req(
            "All personal som utför städningen ska ha genomgått utbildning i lokalvård och kunna "
            "kommunicera med förskolans personal på svenska.",
            UPPDRAG,
            "Utbildad personal som kommunicerar på svenska",
        ),
        Req(
            "Leverantören ska utse en objektsansvarig kontaktperson som kan nås vardagar klockan 07.00 "
            "till 17.00 och som svarar på frågor från förskolorna inom en arbetsdag.",
            UPPDRAG,
            "Objektsansvarig kontaktperson",
        ),
        Heading("4.5 Nycklar och säkerhet"),
        Req(
            "Nycklar och passerkort ska kvitteras och förvaras inlåsta. En förlust ska anmälas till "
            "kommunen samma dag.",
            UPPDRAG,
            "Hantering av nycklar och passerkort",
        ),
        Heading("4.6 Avvikelser och egenkontroll"),
        Req(
            "Brister som förskolan anmäler ska åtgärdas senast nästa arbetsdag.",
            UPPDRAG,
            "Anmälda brister åtgärdas nästa arbetsdag",
        ),
        Req(
            "Leverantören ska utföra egenkontroll minst en gång per månad på varje förskola och "
            "dokumentera resultatet så att kommunen kan ta del av det.",
            UPPDRAG,
            "Månatlig egenkontroll per förskola",
        ),
        Heading("4.7 Uppföljning"),
        Para(
            "Kommunen följer upp städkvaliteten genom kvalitetsmätningar enligt INSTA 800 minst två "
            "gånger per år."
        ),
        Req(
            "Leverantören ska delta i uppföljningsmöten med kommunen en gång per kvartal.",
            UPPDRAG,
            "Uppföljningsmöten varje kvartal",
        ),
    ]


def _evaluation() -> list[Block]:
    return [
        Chapter("5 Utvärdering"),
        Para(
            "Kommunen tilldelar kontraktet till det ekonomiskt mest fördelaktiga anbudet på grunden "
            "bästa förhållandet mellan pris och kvalitet (16 kap. 1 § LOU). Kriterierna viktas enligt "
            "16 kap. 6 § LOU: pris 60 % och kvalitet 40 %."
        ),
        Table(
            rows=(
                ("Kriterium", "Vikt", "Högsta poäng"),
                ("Pris", "60 %", "60"),
                ("Kvalitet: arbetsplan för införandet", "40 %", "40"),
            ),
            widths=(90, 30, 30),
        ),
        Heading("5.1 Pris"),
        Para(
            "Utvärderingspriset är summan av månadspriserna för samtliga förskolor gånger 24 månader, plus "
            "priset för fyra storstädningar och två fönsterputsningar per förskola. "
            "Prispoäng = (lägsta utvärderingspris / anbudets utvärderingspris) × 60."
        ),
        Heading("5.2 Kvalitet"),
        Req(
            "Anbudsgivaren ska bifoga en arbetsplan på högst fyra A4-sidor som beskriver hur städningen "
            "införs på förskolorna under de tre första månaderna.",
            SKALL,
            "Arbetsplan för införandet, högst fyra sidor",
        ),
        Bullets(
            (
                "Hur personalen introduceras på varje förskola.",
                "Hur leverantören samordnar städningen med förskolornas rutiner.",
                "Hur egenkontroll och avvikelsehantering kommer igång.",
            )
        ),
        Para(
            "Arbetsplanen bedöms på skalan 0, 1, 3 eller 5 poäng, där 5 betyder mycket konkret och "
            "anpassad till förskolornas verksamhet. Kvalitetspoäng = (erhållen poäng / 5) × 40."
        ),
    ]


def _contract_terms(d: DateBook) -> list[Block]:
    return [
        Chapter("6 Avtalsvillkor"),
        Heading("6.1 Avtalstid och förlängning"),
        Para(
            f"Avtalet gäller från den {d.long('avtalsstart')} till och med den {d.long('avtalsslut')}. "
            "Kommunen får förlänga avtalet med ett år i taget, högst två gånger. Kommunen meddelar "
            "förlängning senast tre månader innan avtalet löper ut."
        ),
        Heading("6.2 Pris och prisjustering"),
        Para(
            "Priserna är fasta under det första avtalsåret. Därefter justeras de en gång per år med "
            "förändringen i Statistiska centralbyråns arbetskostnadsindex för arbetare inom privat sektor."
        ),
        Heading("6.3 Arbetsrättsliga villkor"),
        Req(
            "Leverantören ska under hela avtalstiden tillförsäkra arbetstagare som utför arbete enligt "
            "avtalet villkor om lön, semester och arbetstid enligt 17 kap. 2 § LOU, minst på de nivåer som "
            "framgår av bilaga 2. Samma krav gäller underleverantörer som direkt medverkar.",
            AVTAL,
            "Arbetsrättsliga villkor om lön, semester och arbetstid",
        ),
        Heading("6.4 Underleverantörer"),
        Req(
            "Leverantören ska innan avtalet börjar gälla lämna namn och kontaktuppgifter för de "
            "underleverantörer som ska anlitas och meddela kommunen varje ändring under avtalstiden.",
            AVTAL,
            "Uppgifter om underleverantörer",
        ),
        Heading("6.5 Vite"),
        Req(
            "Om leverantören inte åtgärdar en anmäld brist inom den tid som anges i avsnitt 4.6 ska "
            "leverantören betala vite med 1 000 kronor per brist och tillfälle.",
            AVTAL,
            "Vite vid brister som inte åtgärdas i tid",
        ),
        Heading("6.6 Fakturering"),
        Req(
            "Leverantören ska fakturera månadsvis i efterskott med elektronisk faktura enligt lagen "
            "(2018:1277) om elektroniska fakturor till följd av offentlig upphandling.",
            AVTAL,
            "Elektronisk faktura månadsvis i efterskott",
        ),
        Heading("6.7 Tystnadsplikt"),
        Req(
            "Leverantören förbinder sig att personalen iakttar tystnadsplikt om förhållanden som rör barn, "
            "vårdnadshavare och personal och som de får kännedom om i arbetet.",
            AVTAL,
            "Tystnadsplikt för personalen",
        ),
        Heading("6.8 Hävning"),
        Para(
            "Kommunen får häva avtalet om leverantören väsentligt bryter mot avtalet och inte vidtar "
            "rättelse inom 30 dagar efter skriftlig anmaning. Avtalet får också avslutas i de fall som "
            "anges i 17 kap. 17 § LOU."
        ),
    ]


def _attachments() -> list[Block]:
    rows = tuple((name, area, "") for name, area, _ in PRESCHOOLS)
    return [
        Chapter("Bilaga 1 Prisbilaga"),
        Para("Ange pris per månad för daglig städning per förskola i svenska kronor exklusive moms."),
        Table(rows=(("Förskola", "Område", "Pris per månad, kr"), *rows), widths=(70, 45, 35)),
        Table(
            rows=(
                ("Tilläggstjänst", "Pris per tillfälle och förskola, kr"),
                ("Storstädning", ""),
                ("Fönsterputs, invändigt och utvändigt", ""),
            ),
            widths=(90, 60),
        ),
        Chapter("Bilaga 2 Arbetsrättsliga villkor", new_page=False),
        Para(
            "Nivåerna motsvarar de lägsta nivåerna i det centrala kollektivavtal som tillämpas i hela "
            "Sverige för städbranschen, och aldrig lägre än vad som följer av lag."
        ),
        Table(
            rows=(
                ("Villkor", "Lägsta nivå"),
                ("Lön", "Lägsta lön enligt det centrala kollektivavtalet för motsvarande arbetstagare."),
                ("Semester", "Minst 25 semesterdagar per år enligt semesterlagen (1977:480)."),
                (
                    "Arbetstid",
                    "Ordinarie arbetstid högst 40 timmar per vecka enligt arbetstidslagen (1982:673).",
                ),
            ),
            widths=(30, 120),
        ),
    ]


SPEC = NoticeSpec(
    slug="stadtjanster-forskolor",
    title=TITLE,
    reference_number=REFERENCE,
    description=(
        "Fiktiv upphandling för demonstration. Daglig lokalvård, storstädning och fönsterputs för tolv "
        "kommunala förskolor med sammanlagt cirka 9 200 kvadratmeter. Öppet förfarande. Avtalstid två år "
        "med möjlighet till förlängning två gånger ett år. Utvärdering: pris 60 %, kvalitet 40 %."
    ),
    procedure="Öppet förfarande (6 kap. 2 § LOU)",
    cpv_codes=("90911200", "90919300", "90911300"),
    place="Sundsvalls kommun",
    estimated_value_sek=13_600_000,
    key_dates=KEY_DATES,
    published="annons",
    deadline="sista_anbudsdag",
    filename="forfragningsunderlag-stadtjanster-forskolor.pdf",
    with_toc=True,
    build_cover=build_cover,
    build_blocks=build_blocks,
)
