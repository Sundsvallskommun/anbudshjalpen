"""Fixture 1: "Ommålning av Solbackens förskola, Matfors".

An advertised procurement below the EU threshold (LOU chapter 19), the procedure that
used to be called förenklat förfarande. The LOU references below were checked against
Riksdagen's consolidated text (SFS 2016:1145, amended up to SFS 2026:880). Chapters 13,
14 and 16 do not apply directly below the threshold (19 kap. 1 §); exclusion follows
19 kap. 17 §, which points to 13 kap. 1–3 §§.
"""

from __future__ import annotations

from fixturegen.blocks import (
    Block,
    Bullets,
    Chapter,
    Cover,
    Heading,
    Para,
    Req,
    Signature,
    Table,
)
from fixturegen.dates import DateBook, KeyDate
from fixturegen.spec import BUYER, BUYER_CONTACT, DISCLAIMER, NoticeSpec

SKALL = "skallkrav"
KVAL = "kvalificeringskrav"
UPPDRAG = "krav_pa_uppdraget"
AVTAL = "avtalsvillkor"

TITLE = "Ommålning av Solbackens förskola, Matfors"
REFERENCE = "DEMO-2026-0147"
# The current name. "Förenklat förfarande" left LOU on 1 February 2022 (SFS 2021:1110), so
# it only appears in section 2.1 as the name that readers may still know.
PROCEDURE = "Annonserad upphandling under tröskelvärdena enligt 19 kap. LOU"

KEY_DATES = (
    KeyDate("annons", "annat", "Annonsering i e-Avrop", -4),
    KeyDate("platsbesok_anmalan", "annat", "Sista dag för anmälan till platsbesök", 8),
    KeyDate("platsbesok", "annat", "Frivilligt platsbesök", 10),
    KeyDate("fragestopp", "fragestopp", "Sista dag för frågor", 25),
    KeyDate("svar", "annat", "Sista dag för kommunens svar på frågor", 29),
    KeyDate("sista_anbudsdag", "sista_anbudsdag", "Sista anbudsdag", 35),
    KeyDate("tilldelning", "tilldelning", "Planerat tilldelningsbeslut", 46),
    KeyDate("kontrakt", "avtalsstart", "Planerat kontraktstecknande", 63),
    KeyDate("giltighet", "anbudets_giltighet", "Anbudet ska vara giltigt till och med", 125),
    KeyDate("utvandig_start", "annat", "Utvändig målning, start", 224),
    KeyDate("utvandig_slut", "annat", "Utvändig målning, klar", 263),
    KeyDate("invandig_start", "annat", "Invändig målning under sommarstängning, start", 280),
    KeyDate("invandig_slut", "annat", "Invändig målning under sommarstängning, klar", 305),
    KeyDate("fardigt", "annat", "Uppdraget färdigställt för slutbesiktning", 312),
)


def build_cover(d: DateBook) -> Cover:
    return Cover(
        kicker="Förfrågningsunderlag",
        title=TITLE,
        facts=(
            ("Upphandlande myndighet", BUYER),
            ("Upphandlingsnummer", REFERENCE),
            ("Förfarande", PROCEDURE),
            ("Datum", d.iso("annons")),
            ("Sista anbudsdag", f"{d.iso('sista_anbudsdag')} kl. 23.59"),
            ("Kontaktperson", f"{BUYER_CONTACT} (frågor ställs i e-Avrop)"),
        ),
        disclaimer=DISCLAIMER,
    )


def build_blocks(d: DateBook) -> list[Block]:
    return [
        *_introduction(),
        *_administrative(d),
        *_qualification(),
        *_specification(d),
        *_evaluation(),
        *_contract_terms(d),
        *_attachments(),
    ]


def _introduction() -> list[Block]:
    return [
        Chapter("1 Inledning"),
        Heading("1.1 Upphandlande myndighet"),
        Para(
            "Sundsvalls kommun, nedan kallad kommunen, inbjuder till anbud på ommålning av Solbackens "
            "förskola i Matfors. Upphandlingen genomförs av kommunens inköpsenhet på uppdrag av den "
            "kommunala fastighetsförvaltningen, som förvaltar byggnaden."
        ),
        Heading("1.2 Bakgrund"),
        Para(
            "Solbackens förskola har fyra avdelningar och cirka 70 barn. Byggnaden uppfördes 1978, har "
            "ett plan och en fasad av liggande träpanel. Fasaden målades senast 2011. I dag flagnar "
            "färgen, särskilt på den södra och den västra sidan, och på flera ställen syns trärena partier. "
            "Invändigt är väggarna i lekrummen och korridoren slitna efter många års användning."
        ),
        Para(
            "Kommunen vill därför måla om byggnaden utvändigt och måla delar av lokalerna invändigt. "
            "Arbetet behöver planeras så att barnen och förskolans verksamhet påverkas så lite som möjligt."
        ),
        Heading("1.3 Uppdraget i korthet"),
        Para("Uppdraget omfattar"),
        Bullets(
            (
                "utvändig ommålning av fasader, fönster, ytterdörrar, vindskivor och takfotsbrädor,",
                "invändig målning av väggar i fyra lekrum, korridoren och två kapprum samt korridorens "
                "innertak,",
                "ställningar, skyddstäckning, avspärrningar, städning och bortforsling av avfall.",
            )
        ),
        Para("En närmare beskrivning finns i avsnitt 4 Kravspecifikation."),
        Heading("1.4 Upphandlingens värde"),
        Para(
            "Kommunens uppskattade värde för uppdraget är cirka 900 000 kronor exklusive "
            "mervärdesskatt. Uppgiften är ett riktvärde och inget tak för anbudspriset."
        ),
        Heading("1.5 Upphandlingsdokumentens delar"),
        Para(
            "Upphandlingsdokumenten består av annonsen i e-Avrop, detta förfrågningsunderlag med "
            "bilagor och de kompletterande upplysningar som kommunen publicerar under anbudstiden. Om "
            "dokumenten motsäger varandra gäller de i följande ordning: kompletterande upplysningar, "
            "förfrågningsunderlaget och sist bilagorna."
        ),
        Heading("1.6 Begrepp"),
        Table(
            rows=(
                ("Begrepp", "Betydelse i detta underlag"),
                ("Anbudsgivare", "Den leverantör som lämnar anbud i upphandlingen."),
                ("Leverantör", "Den anbudsgivare som tilldelas kontraktet och utför uppdraget."),
                ("Ska-krav", "Krav som måste vara uppfyllda för att ett anbud ska kunna antas."),
                (
                    "Avtalsspärr",
                    "Den period efter tilldelningsbeslutet då kommunen inte får teckna kontrakt.",
                ),
                (
                    "Slutbesiktning",
                    "Kommunens kontroll av att uppdraget är utfört enligt kontraktet när arbetet är klart.",
                ),
                ("e-Avrop", "Det upphandlingsverktyg där annonsen, frågor och svar och anbud hanteras."),
            ),
            widths=(32, 118),
        ),
    ]


def _administrative(d: DateBook) -> list[Block]:
    return [
        Chapter("2 Administrativa föreskrifter"),
        Heading("2.1 Förfarande"),
        Para(
            "Upphandlingen genomförs enligt 19 kap. lagen (2016:1145) om offentlig upphandling, LOU, "
            "som gäller för upphandlingar vars värde understiger tröskelvärdet. Förfarandet motsvarar "
            "det som tidigare kallades förenklat förfarande: alla leverantörer får lämna anbud efter "
            "annonsering. Kommunen avser att anta ett anbud utan förhandling, men förbehåller sig rätten "
            "att förhandla enligt 19 kap. 16 § LOU. Minimikrav och tilldelningskriterier förhandlas inte."
        ),
        Heading("2.2 Tidsplan"),
        Table(
            rows=(
                ("Händelse", "Datum"),
                ("Annonsering i e-Avrop", d.iso("annons")),
                ("Sista dag för anmälan till platsbesök", d.iso("platsbesok_anmalan")),
                ("Frivilligt platsbesök", f"{d.iso('platsbesok')} kl. 14.00"),
                ("Sista dag för frågor", d.iso("fragestopp")),
                ("Sista dag för kommunens svar på frågor", d.iso("svar")),
                ("Sista anbudsdag", f"{d.iso('sista_anbudsdag')} kl. 23.59"),
                ("Planerat tilldelningsbeslut", d.iso("tilldelning")),
                ("Planerat kontraktstecknande", d.iso("kontrakt")),
                ("Utvändig målning", f"{d.iso('utvandig_start')} – {d.iso('utvandig_slut')}"),
                ("Invändig målning", f"{d.iso('invandig_start')} – {d.iso('invandig_slut')}"),
                ("Uppdraget färdigställt", f"senast {d.iso('fardigt')}"),
            ),
            widths=(95, 55),
        ),
        Para("Datumen för tilldelningsbeslut och kontraktstecknande är preliminära."),
        Heading("2.3 Frågor och kompletterande upplysningar"),
        Para(
            "Frågor om upphandlingen ställs skriftligt via frågefunktionen i e-Avrop. Kommunen besvarar "
            "inte frågor som kommer in per telefon eller e-post, eftersom alla leverantörer ska få "
            "samma information samtidigt."
        ),
        Para(
            f"Sista dag för frågor är den {d.long('fragestopp')}. Kommunen besvarar frågor som har "
            f"kommit in i tid senast den {d.long('svar')}, det vill säga senast sex dagar före sista "
            "anbudsdag (19 kap. 13 § LOU). Frågor och svar publiceras anonymiserade i e-Avrop och blir "
            "en del av upphandlingsdokumenten."
        ),
        Para(
            "Kommunen rekommenderar att anbudsgivaren regelbundet tittar efter kompletterande "
            "upplysningar i e-Avrop under anbudstiden."
        ),
        Heading("2.4 Platsbesök"),
        Para(
            f"Kommunen erbjuder ett frivilligt platsbesök den {d.long('platsbesok')} klockan 14.00. "
            "Samling sker vid förskolans huvudentré. Anmälan görs via frågefunktionen i e-Avrop senast "
            f"den {d.long('platsbesok_anmalan')}. Frågor som ställs vid platsbesöket besvaras skriftligt "
            "i e-Avrop. Anbudsgivare som inte deltar i platsbesöket missgynnas inte."
        ),
        Heading("2.5 Anbudets form och innehåll"),
        Req(
            "Anbud ska lämnas elektroniskt via e-Avrop senast sista anbudsdag. Anbud som lämnas på "
            "annat sätt eller kommer in för sent prövas inte.",
            SKALL,
            "Anbud lämnas via e-Avrop senast sista anbudsdag",
        ),
        Req("Anbudet ska vara skrivet på svenska.", SKALL, "Anbudet är skrivet på svenska", key="svenska"),
        Req(
            "Anbudet ska omfatta hela uppdraget enligt avsnitt 4. Anbud på delar av uppdraget prövas inte.",
            SKALL,
            "Anbudet omfattar hela uppdraget",
            key="hela_uppdraget",
        ),
        Req(
            "Alternativa anbud godtas inte. Varje anbudsgivare får lämna ett anbud.",
            SKALL,
            "Inga alternativa anbud",
        ),
        Req(
            f"Anbudet ska vara giltigt till och med den {d.long('giltighet')}.",
            SKALL,
            "Anbudets giltighetstid",
            key="giltighet",
        ),
        Req(
            "Priser ska anges i svenska kronor exklusive mervärdesskatt i prisbilagan (bilaga 1). "
            "Prisbilagan får inte ändras eller kompletteras med egna villkor.",
            SKALL,
            "Priser i SEK exklusive moms i prisbilagan",
            key="pris_exkl_moms",
        ),
        Req(
            "Anbudet ska innehålla samtliga bilagor som enligt avsnitt 7 ska lämnas med anbudet.",
            SKALL,
            "Anbudet innehåller samtliga begärda bilagor",
            key="bilagor",
        ),
        Para(
            "Kommunen kan begära att en anbudsgivare förtydligar eller kompletterar sitt anbud om det "
            "kan göras utan risk för särbehandling. Anbudsgivaren kan inte räkna med att få komplettera."
        ),
        Heading("2.6 Anbud i grupp, andra företags kapacitet och underleverantörer"),
        Para(
            "Flera leverantörer får lämna anbud tillsammans som en grupp (19 kap. 4 § LOU). En "
            "leverantör får också åberopa andra företags kapacitet (19 kap. 5 § LOU)."
        ),
        Req(
            "Vid anbud i grupp ska anbudet ange vilken av leverantörerna som är kommunens kontaktpart "
            "och att samtliga leverantörer i gruppen tar solidariskt ansvar för uppdraget.",
            SKALL,
            "Anbud i grupp: kontaktpart och solidariskt ansvar",
        ),
        Req(
            "Om anbudsgivaren åberopar ett annat företags kapacitet för att uppfylla kraven i avsnitt 3 "
            "ska anbudsgivaren bifoga ett åtagande från det företaget som visar att resurserna står till "
            "förfogande under hela uppdraget.",
            SKALL,
            "Åtagande vid åberopad kapacitet",
        ),
        Req(
            "Anbudsgivaren ska i anbudet ange vilka underleverantörer som kommer att utföra delar av "
            "uppdraget, till exempel ställningsarbeten.",
            SKALL,
            "Underleverantörer anges i anbudet",
            key="underleverantorer",
        ),
        Heading("2.7 Sekretess"),
        Para(
            "Anbud blir allmänna handlingar när de kommer in till kommunen. Fram till dess att "
            "tilldelningsbeslut har fattats gäller absolut sekretess för uppgifter i anbuden. Därefter "
            "prövar kommunen sekretessen enligt offentlighets- och sekretesslagen (2009:400) om någon "
            "begär ut ett anbud. Anbudsgivare som vill att vissa uppgifter ska sekretessprövas bör ange "
            "vilka uppgifter det gäller och vilken skada ett utlämnande skulle orsaka."
        ),
        Heading("2.8 Prövning av anbud"),
        Para("Kommunen prövar anbuden i följande steg:"),
        Bullets(
            (
                "Steg 1: kontroll av att anbudet har kommit in i tid och uppfyller kraven i avsnitt 2.",
                "Steg 2: kontroll av att det inte finns grund för uteslutning och att anbudsgivaren "
                "uppfyller kvalificeringskraven i avsnitt 3.",
                "Steg 3: kontroll av att anbudet uppfyller kraven i kravspecifikationen i avsnitt 4.",
                "Steg 4: utvärdering enligt avsnitt 5 av de anbud som har gått vidare.",
            )
        ),
        Para(
            "Kommunen får göra steg 2 och 3 för de anbud som efter utvärderingen ligger bäst till. Om "
            "ett anbud verkar vara onormalt lågt begär kommunen en förklaring. Anbudet får förkastas om "
            "anbudsgivaren inte kan förklara det låga priset på ett tillfredsställande sätt "
            "(19 kap. 18 § LOU)."
        ),
        Heading("2.9 Tilldelningsbeslut och avtalsspärr"),
        Para(
            "Kommunen skickar tilldelningsbeslutet till alla anbudsgivare via e-Avrop. Beslutet "
            "innehåller skälen för beslutet och uppgift om avtalsspärrens längd (19 kap. 19 § LOU)."
        ),
        Para(
            "Avtalsspärren är 10 dagar från det att underrättelsen skickades elektroniskt "
            "(20 kap. 1 § LOU). Under avtalsspärren får kommunen inte teckna kontrakt. En leverantör som "
            "anser att kommunen har brutit mot LOU kan under den tiden ansöka om överprövning hos "
            "förvaltningsrätten (20 kap. 4 och 5 §§ LOU)."
        ),
        Para(
            "Kontrakt är ingånget först när båda parter har undertecknat det. Tilldelningsbeslutet i "
            "sig innebär inte att kontrakt har ingåtts."
        ),
        Heading("2.10 Avbrytande av upphandlingen"),
        Para(
            "Kommunen förbehåller sig rätten att avbryta upphandlingen om det finns sakliga skäl, till "
            "exempel om inget anbud uppfyller kraven eller om priserna väsentligt överstiger kommunens "
            "budget. Ett beslut om att avbryta meddelas skriftligt med skälen för beslutet "
            "(19 kap. 21 § LOU). Anbudsgivaren står själv för sina kostnader för att ta fram anbudet."
        ),
    ]


def _qualification() -> list[Block]:
    return [
        Chapter("3 Kvalificering och uteslutning"),
        Para(
            "I det här avsnittet finns kraven på anbudsgivaren som företag. Kraven gäller från sista "
            "anbudsdag och under hela kontraktstiden. De är anpassade till uppdragets art och omfattning "
            "enligt principen om proportionalitet (19 kap. 2 § LOU)."
        ),
        Heading("3.1 Uteslutning"),
        Para(
            "Kommunen kommer att utesluta en leverantör om det finns grund för det enligt 13 kap. 1 och "
            "2 §§ LOU, till exempel om leverantören är dömd för vissa brott eller inte har betalat skatter "
            "och socialförsäkringsavgifter. Kommunen kan också utesluta en leverantör som är i konkurs "
            "eller likvidation eller har gjort sig skyldig till allvarliga fel i yrkesutövningen "
            "(13 kap. 3 § LOU). Att dessa grunder får tillämpas under tröskelvärdena följer av "
            "19 kap. 17 § LOU."
        ),
        Req(
            "Anbudsgivaren ska intyga att det inte finns grund för uteslutning genom att underteckna "
            "sanningsförsäkran (bilaga 3) och lämna den med anbudet.",
            KVAL,
            "Ingen grund för uteslutning (sanningsförsäkran)",
            key="sanningsforsakran",
        ),
        Para(
            "Innan kommunen beslutar att utesluta en leverantör får leverantören tillfälle att yttra sig "
            "över skälen (19 kap. 17 § andra stycket LOU)."
        ),
        Heading("3.2 Registrering, F-skatt och skatter"),
        Req(
            "Anbudsgivaren ska vara registrerad i aktiebolagsregistret, handelsregistret eller "
            "föreningsregistret hos Bolagsverket, eller i motsvarande register i det land där "
            "anbudsgivaren är etablerad.",
            KVAL,
            "Registrerad i bolags-, handels- eller föreningsregister",
            key="registrering",
        ),
        Req(
            "Anbudsgivaren ska vara godkänd för F-skatt och ha fullgjort sina skyldigheter att betala "
            "skatter och socialförsäkringsavgifter.",
            KVAL,
            "Godkänd för F-skatt och inga skatteskulder",
            key="f_skatt",
        ),
        Para(
            "Kommunen hämtar själv uppgifter om registrering, F-skatt och skatteskulder från "
            "Skatteverket och Bolagsverket. Anbudsgivare som är etablerade i Sverige behöver därför inte "
            "bifoga intyg om detta."
        ),
        Req(
            "Anbudsgivare som är etablerade i ett annat land ska bifoga intyg från behörig myndighet i "
            "etableringslandet som visar att kraven ovan är uppfyllda. Intygen får vara högst tre månader "
            "gamla räknat från sista anbudsdag.",
            KVAL,
            "Intyg för anbudsgivare etablerade utomlands",
        ),
        Heading("3.3 Ekonomisk stabilitet"),
        Req(
            "Anbudsgivaren ska ha en så stabil ekonomi att uppdraget kan genomföras under hela "
            "kontraktstiden. Kommunen kontrollerar detta genom en kreditupplysning. Kravet är uppfyllt om "
            "anbudsgivaren har lägst riskklass 3 på en femgradig skala där 5 betyder lägst risk, eller "
            "motsvarande hos ett annat kreditupplysningsföretag.",
            KVAL,
            "Ekonomisk stabilitet, lägst riskklass 3",
        ),
        Para(
            "Om anbudsgivaren har en lägre riskklass eller är nystartad kan stabiliteten visas på annat "
            "sätt, till exempel med en bankgaranti, ett moderbolagsåtagande eller ett utlåtande från en "
            "auktoriserad eller godkänd revisor. Underlaget bifogas i så fall anbudet."
        ),
        Heading("3.4 Ansvarsförsäkring"),
        Req(
            "Anbudsgivaren ska ha en ansvarsförsäkring som gäller för den verksamhet som uppdraget avser, "
            "med ett försäkringsbelopp på minst 5 000 000 kronor per skadetillfälle. Försäkringsbevis "
            "ska bifogas anbudet (bilaga 4).",
            KVAL,
            "Ansvarsförsäkring minst 5 miljoner kronor med försäkringsbevis",
            quote="med ett försäkringsbelopp på minst 5 000 000 kronor per skadetillfälle",
            key="ansvarsforsakring",
        ),
        Para(
            "En anbudsgivare som ännu inte har en sådan försäkring kan i stället bifoga ett intyg från "
            "ett försäkringsbolag om att försäkringen kommer att tecknas om anbudsgivaren tilldelas "
            "kontraktet."
        ),
        Heading("3.5 Referensuppdrag"),
        Req(
            "Anbudsgivaren ska under de senaste tre åren, räknat från sista anbudsdag, ha genomfört minst "
            "två uppdrag med målning i offentlig miljö, till exempel förskola, skola, vårdlokal eller "
            "annan lokal där allmänheten vistas. Varje uppdrag ska ha haft ett värde av minst 200 000 "
            "kronor exklusive mervärdesskatt. Uppdragen ska redovisas i referensblanketten (bilaga 2) med "
            "beställare, kontaktperson, tidsperiod, omfattning och värde.",
            KVAL,
            "Två referensuppdrag i offentlig miljö de senaste tre åren",
            quote="ha genomfört minst två uppdrag med målning i offentlig miljö",
            key="referenser",
        ),
        Para(
            "Kommunen kan komma att kontakta referenserna. Om en referens uppger att uppdraget inte har "
            "utförts på ett tillfredsställande sätt kan kommunen bedöma att kravet inte är uppfyllt."
        ),
        Heading("3.6 Arbetsmiljö"),
        Req(
            "Anbudsgivaren ska bedriva ett systematiskt arbetsmiljöarbete enligt arbetsmiljölagen "
            "(1977:1160) och Arbetsmiljöverkets föreskrifter. Anbudsgivaren ska på begäran kunna visa "
            "skriftliga rutiner för riskbedömning, arbete på höjd och hantering av kemiska produkter.",
            KVAL,
            "Systematiskt arbetsmiljöarbete med skriftliga rutiner",
            key="arbetsmiljo",
        ),
    ]


def _specification(d: DateBook) -> list[Block]:
    return [
        Chapter("4 Kravspecifikation"),
        Heading("4.1 Objektet"),
        Para(
            "Solbackens förskola är en byggnad i ett plan med en bruttoarea på cirka 640 kvadratmeter. "
            "Fasaden består av liggande, målad träpanel. Fönster och ytterdörrar är av trä. Taket är ett "
            "sadeltak med betongpannor och ingår inte i uppdraget."
        ),
        Table(
            rows=(
                ("Del", "Ungefärlig mängd"),
                ("Fasad, liggande träpanel", "520 m²"),
                ("Fönster, kopplade träfönster", "34 st"),
                ("Ytterdörrar av trä", "6 st"),
                ("Vindskivor och takfotsbrädor", "190 löpmeter"),
                ("Väggar invändigt i lekrum, korridor och kapprum", "780 m²"),
                ("Innertak i korridoren", "95 m²"),
            ),
            widths=(105, 45),
        ),
        Para(
            "Mängderna är ungefärliga. Anbudsgivaren rekommenderas att kontrollera dem, till exempel vid "
            "platsbesöket. Anbudspriset är fast även om mängderna avviker något."
        ),
        Heading("4.2 Utvändig målning"),
        Req(
            "Fasader, vindskivor och takfotsbrädor ska tvättas, skrapas fria från löst sittande färg och "
            "grundas på trärena partier innan de färdigstryks två gånger.",
            UPPDRAG,
            "Underarbete och två färdigstrykningar på fasaden",
        ),
        Req(
            "Fasaden ska målas med linoljefärg eller en annan färgtyp som är förenlig med den befintliga "
            "färgen. Kulören ska vara densamma som i dag, NCS S 1505-Y40R, om kommunen inte anger något "
            "annat före arbetets start.",
            UPPDRAG,
            "Färgtyp och kulör på fasaden",
        ),
        Req(
            "Fönsterbågar, karmar och ytterdörrar ska skrapas och slipas, kittas om där kittet har släppt "
            "och målas två gånger med en färg som är avsedd för utvändiga snickerier.",
            UPPDRAG,
            "Målning av fönster och ytterdörrar",
        ),
        Req(
            "Leverantören byter ut upp till 15 löpmeter skadad träpanel inom det fasta anbudspriset. Byte "
            "utöver det ersätts som tilläggsarbete enligt avsnitt 6.4.",
            UPPDRAG,
            "Byte av skadad träpanel ingår upp till 15 löpmeter",
        ),
        Heading("4.3 Invändig målning"),
        Req(
            "Väggar i fyra lekrum, korridoren och två kapprum ska lagas, spacklas och slipas där det "
            "behövs och därefter målas två gånger.",
            UPPDRAG,
            "Invändiga väggar lagas och målas två gånger",
        ),
        Req(
            "Invändigt ska vattenburen väggfärg med glans 7 och våtnötningsklass 1 enligt standarden "
            "SS-EN 13300 användas, så att väggarna tål upprepad rengöring.",
            UPPDRAG,
            "Vattenburen väggfärg, glans 7, våtnötningsklass 1",
        ),
        Req(
            "Innertaket i korridoren ska målas två gånger med vit takfärg.",
            UPPDRAG,
            "Målning av innertak i korridoren",
        ),
        Req(
            "Golv, inredning, fast utrustning och elinstallationer ska skyddstäckas eller maskeras innan "
            "arbetet påbörjas.",
            UPPDRAG,
            "Skyddstäckning invändigt",
        ),
        Heading("4.4 Material, kemiska produkter och avfall"),
        Req(
            "Färger, spackel och andra kemiska produkter ska vara registrerade i Byggvarubedömningen och "
            "lägst ha bedömningen Accepteras. Produkter med bedömningen Undviks får inte användas.",
            UPPDRAG,
            "Produkter bedömda i Byggvarubedömningen, lägst Accepteras",
        ),
        Req(
            "Leverantören ska före arbetets start lämna en förteckning över de produkter som kommer att "
            "användas, med säkerhetsdatablad.",
            UPPDRAG,
            "Produktförteckning med säkerhetsdatablad före start",
        ),
        Req(
            "Leverantören ansvarar för att färgrester, förpackningar och annat avfall sorteras och tas om "
            "hand enligt gällande regler. Färgrester och lösningsmedel som är farligt avfall lämnas till en "
            "godkänd mottagare, och leverantören står för bortforslingen och kostnaden för den.",
            UPPDRAG,
            "Sortering och omhändertagande av avfall",
        ),
        Heading("4.5 Arbete i en förskola i drift"),
        Para(
            "Den utvändiga målningen görs medan förskolan har öppet. Barnens säkerhet går före allt annat. "
            "Leverantören och förskolans rektor stämmer av arbetet inför varje ny etapp."
        ),
        Req(
            "Arbetsområdet ska vara inhägnat med byggstängsel som är minst 1,8 meter högt, så att barn "
            "inte kan ta sig in. Stängslet ska stå kvar under hela den tid som arbete pågår på en fasad.",
            UPPDRAG,
            "Byggstängsel minst 1,8 meter runt arbetsområdet",
        ),
        Req(
            "Ställningar ska vara låsta eller avspärrade efter arbetstid så att ingen kan klättra upp "
            "på dem.",
            UPPDRAG,
            "Ställningar låses eller spärras av efter arbetstid",
        ),
        Req(
            "Arbete som bullrar eller dammar, till exempel skrapning och slipning, får inte utföras under "
            "barnens vila mellan klockan 12.00 och 13.30.",
            UPPDRAG,
            "Inget bullrande arbete under barnens vila",
        ),
        Req(
            "Fordon får köras in på förskolans gård endast före klockan 07.00 eller efter klockan 17.30, "
            "när inga barn är ute.",
            UPPDRAG,
            "Fordon på gården endast utanför barnens tider",
        ),
        Req(
            "Leverantörens personal ska bära synlig id-handling med foto och anmäla sig till förskolans "
            "personal vid ankomst.",
            UPPDRAG,
            "Synlig id-handling och anmälan vid ankomst",
        ),
        Heading("4.6 Arbetsmiljö och arbetsledning på arbetsplatsen"),
        Req(
            "Kommunen är byggherre. Leverantören ska åta sig uppdraget som byggarbetsmiljösamordnare för "
            "utförandet (BAS-U) och se till att arbetsmiljöplanen hålls aktuell under hela arbetet.",
            UPPDRAG,
            "Leverantören är BAS-U och håller arbetsmiljöplanen aktuell",
            quote="Leverantören ska åta sig uppdraget som byggarbetsmiljösamordnare för utförandet (BAS-U)",
        ),
        Req(
            "Leverantören ska utse en arbetsledare med minst fem års erfarenhet av yrkesmässig målning. "
            "Arbetsledaren är kommunens kontaktperson under arbetet och ska kunna kommunicera obehindrat "
            "på svenska i tal och skrift.",
            UPPDRAG,
            "Arbetsledare med minst fem års erfarenhet",
        ),
        Heading("4.7 Tidplan för utförandet"),
        Req(
            f"Den utvändiga målningen ska utföras under perioden {d.day_month('utvandig_start')} till "
            f"{d.long('utvandig_slut')}.",
            UPPDRAG,
            "Tidsperiod för utvändig målning",
        ),
        Req(
            f"Den invändiga målningen ska utföras under förskolans sommarstängning, "
            f"{d.day_month('invandig_start')} till {d.long('invandig_slut')}, då lokalerna är tomma.",
            UPPDRAG,
            "Invändig målning under sommarstängningen",
        ),
        Req(
            f"Hela uppdraget ska vara färdigställt och klart för slutbesiktning senast den "
            f"{d.long('fardigt')}.",
            UPPDRAG,
            "Färdigställande senast angivet datum",
        ),
        Req(
            "Leverantören ska senast två veckor före arbetets start lämna en detaljerad tidplan med "
            "etapper till kommunens projektledare.",
            UPPDRAG,
            "Detaljerad tidplan två veckor före start",
        ),
        Heading("4.8 Egenkontroll, besiktning och dokumentation"),
        Req(
            "Leverantören ska utföra egenkontroller enligt en egen kontrollplan och lämna signerade "
            "egenkontroller till kommunen senast vid slutbesiktningen.",
            UPPDRAG,
            "Egenkontroller enligt kontrollplan",
        ),
        Para(
            "Kommunen utser besiktningsman. Slutbesiktning görs när leverantören har meddelat att "
            "arbetet är färdigt."
        ),
        Req(
            "Fel som noteras vid slutbesiktningen ska vara åtgärdade inom 30 dagar efter besiktningen.",
            UPPDRAG,
            "Fel från slutbesiktning åtgärdas inom 30 dagar",
        ),
        Req(
            "Efter slutbesiktningen ska leverantören lämna en färgsättningsförteckning med produktnamn och "
            "kulör för varje yta, så att kommunen kan underhålla ytorna.",
            UPPDRAG,
            "Färgsättningsförteckning efter slutbesiktning",
        ),
    ]


def _evaluation() -> list[Block]:
    return [
        Chapter("5 Utvärdering"),
        Heading("5.1 Utvärderingsgrund"),
        Para(
            "Kommunen antar det anbud som har det bästa förhållandet mellan pris och kvalitet. "
            "Tilldelningskriterierna och deras vikter anges här enligt 19 kap. 9 § LOU."
        ),
        Table(
            rows=(
                ("Kriterium", "Vikt", "Högsta poäng"),
                ("Pris", "70 %", "70"),
                ("Kvalitet: genomförandebeskrivning", "30 %", "30"),
                ("Summa", "100 %", "100"),
            ),
            widths=(90, 30, 30),
        ),
        Heading("5.2 Pris, 70 %"),
        Para(
            "Utvärderingspriset är summan av det fasta priset för hela uppdraget och priset för 40 timmar "
            "tilläggsarbete enligt anbudsgivarens timpris. De 40 timmarna är en fiktiv mängd som bara "
            "används i utvärderingen och är inget löfte om beställning."
        ),
        Para("Prispoäng = (lägsta utvärderingspris / anbudets utvärderingspris) × 70"),
        Para(
            "Exempel: Anbud A har utvärderingspriset 800 000 kronor och är lägst. Anbud B har "
            "utvärderingspriset 1 000 000 kronor. Anbud A får 70 prispoäng och anbud B får "
            "800 000 / 1 000 000 × 70 = 56 prispoäng."
        ),
        Heading("5.3 Kvalitet: genomförandebeskrivning, 30 %"),
        Req(
            "Anbudsgivaren ska bifoga en genomförandebeskrivning på högst tre A4-sidor som beskriver hur "
            "uppdraget kommer att genomföras.",
            SKALL,
            "Genomförandebeskrivning på högst tre sidor",
            key="genomforandebeskrivning",
        ),
        Para("Beskrivningen bedöms utifrån hur väl den behandlar följande fyra delar:"),
        Bullets(
            (
                "a) tidplan och etappindelning med hänsyn till förskolans verksamhet,",
                "b) hur barn, personal och besökare skyddas under arbetet,",
                "c) hur leverantören säkerställer kvaliteten, till exempel genom egenkontroller och "
                "arbetsledning,",
                "d) hur leverantören kommunicerar med förskolan och kommunens projektledare.",
            )
        ),
        Table(
            rows=(
                ("Poäng", "Bedömning"),
                (
                    "5",
                    "Mycket god: alla fyra delar är konkreta, anpassade till Solbackens förskola och visar "
                    "god förståelse för arbete i en verksamhet med barn.",
                ),
                ("3", "God: alla fyra delar är behandlade och beskrivningen är till största delen konkret."),
                ("1", "Godtagbar: alla delar är behandlade men beskrivningen är allmänt hållen."),
                ("0", "Bristfällig: en eller flera delar saknas."),
            ),
            widths=(18, 132),
        ),
        Para("Kvalitetspoäng = (erhållen poäng / 5) × 30"),
        Para(
            "Det som anbudsgivaren beskriver i genomförandebeskrivningen blir en del av kontraktet. "
            "Prisuppgifter hör hemma i prisbilagan och beaktas inte i genomförandebeskrivningen."
        ),
        Heading("5.4 Sammanställning"),
        Para(
            "Anbudets totalpoäng är summan av prispoäng och kvalitetspoäng, högst 100 poäng. Kommunen "
            "tilldelar kontraktet till det anbud som får högst totalpoäng. Om två anbud får samma "
            "totalpoäng vinner det anbud som har högst kvalitetspoäng. Om även den är lika avgörs "
            "tilldelningen genom lottning."
        ),
    ]


def _contract_terms(d: DateBook) -> list[Block]:
    return [
        Chapter("6 Avtalsvillkor"),
        Para(
            "Följande villkor gäller för kontraktet mellan kommunen och den leverantör som tilldelas "
            "uppdraget. Kommunen upprättar kontraktet efter tilldelningsbeslutet och avtalsspärren."
        ),
        Req(
            "Anbudsgivaren ska i anbudet bekräfta att avtalsvillkoren i detta avsnitt accepteras utan "
            "reservationer.",
            SKALL,
            "Avtalsvillkoren accepteras utan reservationer",
            key="avtalsvillkor",
        ),
        Heading("6.1 Kontraktstid"),
        Para(
            "Kontraktet gäller från det att båda parter har undertecknat det till dess att garantitiden "
            "enligt avsnitt 6.6 har löpt ut."
        ),
        Heading("6.2 Pris"),
        Req(
            "Det fasta priset ska gälla under hela kontraktstiden och får inte indexregleras.",
            AVTAL,
            "Fast pris utan indexreglering",
        ),
        Heading("6.3 Fakturering och betalning"),
        Req(
            "Leverantören ska skicka fakturor elektroniskt i formatet Peppol BIS Billing 3, enligt lagen "
            "(2018:1277) om elektroniska fakturor till följd av offentlig upphandling. Fakturan ska ange "
            "kommunens referens och upphandlingsnumret.",
            AVTAL,
            "Elektronisk faktura i Peppol BIS Billing 3",
        ),
        Para(
            "Leverantören får fakturera 50 procent av det fasta priset när den utvändiga målningen är "
            "godkänd och resterande del efter godkänd slutbesiktning. Betalning sker 30 dagar efter att "
            "kommunen har tagit emot en korrekt faktura. Kommunen betalar inga fakturaavgifter."
        ),
        Heading("6.4 Tilläggsarbeten och ändringar"),
        Req(
            "Tilläggsarbeten får utföras endast efter skriftlig beställning från kommunens projektledare. "
            "De ersätts med timpriset i prisbilagan, och material ersätts mot kvitto med ett påslag på "
            "högst 10 procent.",
            AVTAL,
            "Tilläggsarbeten endast efter skriftlig beställning",
        ),
        Heading("6.5 Försäkringar under kontraktstiden"),
        Req(
            "Leverantören ska under hela kontraktstiden ha den ansvarsförsäkring som anges i avsnitt 3.4 "
            "och på begäran visa ett giltigt försäkringsbevis.",
            AVTAL,
            "Ansvarsförsäkring under hela kontraktstiden",
        ),
        Heading("6.6 Garanti"),
        Req(
            "Garantitiden är fem år från godkänd slutbesiktning. Under garantitiden ska leverantören utan "
            "kostnad för kommunen åtgärda fel som beror på bristande material eller utförande, till "
            "exempel flagning eller missfärgning. Felen ska åtgärdas inom 30 dagar efter att kommunen har "
            "anmält dem, och snarast om felet innebär en säkerhetsrisk.",
            AVTAL,
            "Fem års garanti med åtgärd inom 30 dagar",
            quote="Under garantitiden ska leverantören utan kostnad för kommunen åtgärda fel",
        ),
        Heading("6.7 Vite vid försening"),
        Req(
            f"Om uppdraget inte är färdigställt för slutbesiktning den {d.long('fardigt')} ska "
            "leverantören betala vite med 0,5 procent av det fasta priset för varje påbörjad vecka som "
            "förseningen varar, dock högst 10 procent av det fasta priset. Vitet påverkar inte kommunens "
            "rätt att häva kontraktet vid väsentlig försening.",
            AVTAL,
            "Vite 0,5 procent per påbörjad vecka vid försening",
            quote="ska leverantören betala vite med 0,5 procent av det fasta priset",
        ),
        Heading("6.8 Underleverantörer"),
        Req(
            "Leverantören ansvarar för underleverantörers arbete som för sitt eget. Innan arbetet påbörjas "
            "ska leverantören lämna namn och kontaktuppgifter för samtliga underleverantörer och deras "
            "behöriga företrädare. Nya eller utbytta underleverantörer kräver kommunens skriftliga "
            "godkännande.",
            AVTAL,
            "Uppgifter om underleverantörer före start",
            quote="Innan arbetet påbörjas ska leverantören lämna namn och kontaktuppgifter",
        ),
        Heading("6.9 Arbetsrättsliga villkor"),
        Req(
            "Leverantören ska tillförsäkra de arbetstagare som utför uppdraget lön, semester och arbetstid "
            "som minst motsvarar de lägsta nivåerna i det centrala kollektivavtal som tillämpas i hela "
            "Sverige för måleribranschen. Samma krav gäller underleverantörer som direkt medverkar i "
            "uppdraget. Leverantören ska på begäran visa att villkoren följs inom tio arbetsdagar.",
            AVTAL,
            "Lön, semester och arbetstid enligt centralt kollektivavtal",
        ),
        Heading("6.10 Hävning"),
        Para(
            "Kommunen får häva kontraktet med omedelbar verkan om leverantören väsentligt bryter mot "
            "kontraktet och inte vidtar rättelse inom 14 dagar efter skriftlig anmaning, om leverantören "
            "försätts i konkurs eller likvidation, eller om leverantören borde ha uteslutits enligt "
            "13 kap. 1 § LOU."
        ),
        Heading("6.11 Tvist"),
        Para(
            "Tvister med anledning av kontraktet ska i första hand lösas genom förhandling mellan "
            "parterna. Om parterna inte kommer överens avgörs tvisten av allmän domstol med Sundsvalls "
            "tingsrätt som första instans."
        ),
    ]


def _attachments() -> list[Block]:
    return [
        Chapter("7 Bilagor", new_page=False),
        Para(
            "Följande bilagor hör till förfrågningsunderlaget. Tabellen visar vilka handlingar som ska "
            "lämnas med anbudet."
        ),
        Table(
            rows=(
                ("Bilaga", "Innehåll", "Lämnas med anbudet"),
                ("1", "Prisbilaga", "Ja, ifylld"),
                ("2", "Referensblankett", "Ja, ifylld med två referensuppdrag"),
                ("3", "Sanningsförsäkran", "Ja, undertecknad av behörig företrädare"),
                ("4", "Försäkringsbevis för ansvarsförsäkring", "Ja, anbudsgivarens eget dokument"),
                ("–", "Genomförandebeskrivning, högst tre A4-sidor", "Ja, anbudsgivarens eget dokument"),
            ),
            widths=(18, 75, 57),
        ),
        Para(
            "I stället för sanningsförsäkran får anbudsgivaren lämna ett ifyllt europeiskt enhetligt "
            "upphandlingsdokument (ESPD) som omfattar samma uppgifter."
        ),
        Chapter("Bilaga 1 Prisbilaga"),
        Para(
            "Fyll i priserna i tabellen. Alla priser anges i svenska kronor exklusive mervärdesskatt, se "
            "avsnitt 2.5. Det fasta priset omfattar allt som behövs för uppdraget enligt avsnitt 4, "
            "inklusive ställningar, skydd, material och avfallshantering."
        ),
        Table(
            rows=(
                ("Post", "Beskrivning", "Enhet", "Pris exkl. moms"),
                ("A", "Fast pris för hela uppdraget enligt avsnitt 4", "kronor", ""),
                ("B", "Timpris för tilläggsarbete, målare", "kronor per timme", ""),
                ("C", "Utvärderingspris: A + 40 × B", "kronor", ""),
            ),
            widths=(14, 76, 30, 30),
        ),
        Para("Anbudsgivare:"),
        Signature(labels=("Ort och datum", "Underskrift", "Namnförtydligande")),
        Chapter("Bilaga 2 Referensblankett"),
        Para(
            "Redovisa två referensuppdrag enligt avsnitt 3.5. Uppdragen gäller målning i offentlig miljö "
            "under de senaste tre åren. Informera referenspersonerna om att kommunen kan kontakta dem."
        ),
        *_reference_form("Referensuppdrag 1"),
        *_reference_form("Referensuppdrag 2"),
        Chapter("Bilaga 3 Sanningsförsäkran"),
        Para("Undertecknad, behörig företrädare för anbudsgivaren, försäkrar på heder och samvete att"),
        Bullets(
            (
                "1. varken anbudsgivaren eller någon person i dess ledning, eller med rätt att företräda, "
                "fatta beslut om eller kontrollera anbudsgivaren, är dömd för brott som avses i 13 kap. 1 § "
                "LOU, till exempel organiserad brottslighet, bestickning, bedrägeri, penningtvätt, "
                "terroristbrott eller människohandel,",
                "2. anbudsgivaren har fullgjort sina skyldigheter att betala skatter och "
                "socialförsäkringsavgifter (13 kap. 2 § LOU),",
                "3. anbudsgivaren inte är i konkurs eller likvidation, under tvångsförvaltning eller har "
                "ingått ackord med borgenärer (13 kap. 3 § LOU),",
                "4. anbudsgivaren inte har gjort sig skyldig till allvarligt fel i yrkesutövningen "
                "(13 kap. 3 § LOU), och",
                "5. uppgifterna i anbudet är riktiga och fullständiga.",
            )
        ),
        Para("Anbudsgivarens namn och organisationsnummer:"),
        Signature(),
    ]


def _reference_form(title: str) -> list[Block]:
    return [
        Heading(title),
        Table(
            rows=(
                ("Uppgift", "Svar"),
                ("Beställare", ""),
                ("Kontaktperson och telefonnummer", ""),
                ("Objekt och ort", ""),
                ("Tidsperiod (från och med – till och med)", ""),
                ("Kort beskrivning av uppdraget", "\n\n"),
                ("Värde exklusive mervärdesskatt", ""),
            ),
            widths=(65, 85),
        ),
    ]


SPEC = NoticeSpec(
    slug="ommalning-solbacken",
    title=TITLE,
    reference_number=REFERENCE,
    description=(
        "Fiktiv upphandling för demonstration. Utvändig ommålning av fasader, fönster och dörrar samt "
        "invändig målning av lekrum och korridor på en förskola i ett plan i Matfors. Annonserad "
        "upphandling under tröskelvärdena enligt 19 kap. LOU. Utvärdering: pris 70 %, kvalitet 30 %."
    ),
    procedure=PROCEDURE,
    cpv_codes=("45442100", "45442110", "45442180"),
    place="Matfors, Sundsvalls kommun",
    estimated_value_sek=900_000,
    key_dates=KEY_DATES,
    published="annons",
    deadline="sista_anbudsdag",
    filename="forfragningsunderlag-ommalning-solbackens-forskola.pdf",
    with_toc=True,
    build_cover=build_cover,
    build_blocks=build_blocks,
)
