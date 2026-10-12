/**
 * Procurement words explained in plain Swedish, so a term in any text can be pressed for its meaning (TermText).
 * Ported from docs/glossary.md, plus the words the redesign needs (förfarande, BAS-U, F-skatt). The explanations
 * are simplified and never replace the law text; a checklist's own explanation of a term (from the document) wins
 * over the glossary's.
 */
import type { TermExplanation } from "../api/types";

export interface GlossaryEntry {
  /** The word as a heading in the explanation. */
  term: string;
  explanation: string;
  /** The forms that are marked in running text, the term itself included. Whole words, any case. */
  forms: readonly string[];
  /** Where the rule is, when there is one law reference to give. */
  reference?: string;
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: "LOU",
    explanation: "Lagen (2016:1145) om offentlig upphandling, som styr hur kommunen köper in varor och tjänster.",
    forms: ["LOU"],
  },
  {
    term: "Förfrågningsunderlag",
    explanation:
      "Dokumenten som beskriver vad kommunen vill köpa och vilka krav som gäller. Lagen kallar dem upphandlingsdokument. Det är alltid underlaget som gäller.",
    forms: ["förfrågningsunderlag", "förfrågningsunderlaget", "förfrågningsunderlagets", "upphandlingsdokument", "upphandlingsdokumenten"],
  },
  {
    term: "Skallkrav",
    explanation: "Krav som måste uppfyllas. Ett anbud som inte uppfyller ett skallkrav förkastas och kan inte vinna.",
    forms: ["skallkrav", "skallkravet", "skallkraven", "ska-krav", "ska-kraven", "skall-krav", "skall-kraven"],
  },
  {
    term: "Kvalificeringskrav",
    explanation:
      "Krav på företaget, till exempel ekonomisk stabilitet, referensuppdrag eller försäkring. De visar att företaget kan klara uppdraget.",
    forms: ["kvalificeringskrav", "kvalificeringskravet", "kvalificeringskraven"],
    reference: "LOU 14 kap.",
  },
  {
    term: "Utvärderingskriterier",
    explanation: "Hur anbuden jämförs, till exempel 70 procent pris och 30 procent kvalitet.",
    forms: ["utvärderingskriterier", "utvärderingskriterierna", "utvärderingskriterium"],
  },
  {
    term: "ESPD",
    explanation:
      "Europeiskt enhetligt upphandlingsdokument: en egenförsäkran där företaget preliminärt intygar att det inte ska uteslutas och att det uppfyller kvalificeringskraven.",
    forms: ["ESPD"],
  },
  {
    term: "Frågestopp",
    explanation:
      "Sista dagen att ställa frågor om underlaget. Frågor ställs skriftligt i upphandlingens frågefunktion, och svaren publiceras för alla som vill lämna anbud.",
    forms: ["frågestopp", "frågestoppet"],
  },
  {
    term: "Sista anbudsdag",
    explanation: "Sista dagen, och ofta klockslaget, för att lämna anbud. Ett anbud som kommer in för sent prövas inte.",
    forms: ["sista anbudsdag", "sista anbudsdagen"],
  },
  {
    term: "Anbudsansökan",
    explanation:
      "En ansökan om att få lämna anbud, i ett selektivt förfarande. Köparen väljer ut leverantörer bland dem som har ansökt och bjuder in dem att lämna anbud. Därför kommer sista dag för anbudsansökan före sista anbudsdag, som står i inbjudan.",
    forms: ["anbudsansökan", "anbudsansökningar", "anbudsansökningen"],
  },
  {
    term: "Förfarande",
    explanation:
      "Hur upphandlingen genomförs enligt lagen, till exempel öppet förfarande, där alla får lämna anbud. Under EU:s beloppsgränser gäller 19 kapitlet i LOU, och underlaget beskriver hur upphandlingen går till. Namnen förenklat förfarande och urvalsförfarande togs bort ur lagen den 1 februari 2022, men äldre underlag använder dem.",
    forms: ["förfarande", "förfarandet", "förenklat förfarande"],
    reference: "LOU 19 kap.",
  },
  {
    term: "Tröskelvärde",
    explanation:
      "EU:s beloppsgränser för upphandling. Över dem gäller EU-reglerna fullt ut och annonsen publiceras även i TED. Under dem gäller enklare regler i 19 kapitlet i LOU.",
    forms: [
      "tröskelvärde",
      "tröskelvärdet",
      "tröskelvärden",
      "tröskelvärdena",
      "EU:s beloppsgränser",
      "beloppsgränser",
      "beloppsgränserna",
    ],
    reference: "LOU 5 kap. och 19 kap.",
  },
  {
    term: "Tilldelningsbeslut",
    explanation: "Beslutet om vem eller vilka som vinner upphandlingen. Alla som har lämnat anbud ska få veta beslutet och skälen.",
    forms: ["tilldelningsbeslut", "tilldelningsbeslutet"],
    reference: "LOU 12 kap. 12 §",
  },
  {
    term: "Avtalsspärr",
    explanation:
      "En väntetid efter tilldelningsbeslutet då avtal inte får tecknas: 10 dagar om beslutet skickas elektroniskt, annars 15 dagar. Under den tiden kan beslutet begäras överprövat.",
    forms: ["avtalsspärr", "avtalsspärren"],
    reference: "LOU 20 kap. 1 §",
  },
  {
    term: "Överprövning",
    explanation: "Att begära att förvaltningsrätten prövar om en upphandling har gått rätt till.",
    forms: ["överprövning", "överprövningen", "överprövat", "överprövas"],
    reference: "LOU 20 kap.",
  },
  {
    term: "Direktupphandling",
    explanation: "En enklare upphandling utan formkrav, tillåten under en viss beloppsgräns.",
    forms: ["direktupphandling", "direktupphandlingen", "direktupphandlingar"],
  },
  {
    term: "Ramavtal",
    explanation: "Ett avtal som anger villkoren för framtida beställningar under en period, utan att varje beställning upphandlas på nytt.",
    forms: ["ramavtal", "ramavtalet", "ramavtalen"],
  },
  {
    term: "CPV-kod",
    explanation:
      "EU:s kodlista för vad som upphandlas, ordnad som ett träd från breda till smala koder. Ni behöver inte kunna koderna: Anbudshjälpen visar vad de betyder.",
    forms: ["CPV-kod", "CPV-koden", "CPV-koder", "CPV-koderna"],
  },
  {
    term: "e-Avrop",
    explanation:
      "Systemet där Sundsvalls kommun annonserar upphandlingar, svarar på frågor och tar emot anbud. Där ställer du formella frågor och lämnar ditt anbud.",
    forms: ["e-Avrop"],
  },
  {
    term: "TED",
    explanation: "EU:s gemensamma databas för upphandlingar över tröskelvärdena (Tenders Electronic Daily).",
    forms: ["TED"],
  },
  {
    term: "Avtalskatalog",
    explanation: "Inköps förteckning över kommunens avtal och när de löper ut. Den visar vilka upphandlingar som snart kommer.",
    forms: ["avtalskatalog", "avtalskatalogen"],
  },
  {
    term: "BAS-U",
    explanation:
      "Byggarbetsmiljösamordnare för utförandet: den som samordnar arbetsmiljön på en byggarbetsplats medan arbetet pågår.",
    forms: ["BAS-U"],
    reference: "Arbetsmiljölagen 3 kap.",
  },
  {
    term: "F-skatt",
    explanation:
      "Ett godkännande från Skatteverket som visar att företaget självt betalar sin preliminära skatt och sina avgifter. Kommunen kontrollerar oftast F-skatten själv.",
    forms: ["F-skatt", "F-skattsedel"],
  },
];

/** The glossary as term explanations for TermText, one per form, each pointing at its entry's words. */
export function glossaryTerms(): TermExplanation[] {
  return GLOSSARY.flatMap((entry) =>
    entry.forms.map((form) => ({
      term: form,
      explanation: entry.reference ? `${entry.explanation} (${entry.reference})` : entry.explanation,
      citation: null,
    })),
  );
}

const BY_FORM = new Map(GLOSSARY.flatMap((entry) => entry.forms.map((form) => [form.toLocaleLowerCase("sv"), entry])));

/** The entry a word belongs to, whatever its case and form; undefined for a word the glossary does not explain. */
export function findGlossaryEntry(word: string): GlossaryEntry | undefined {
  return BY_FORM.get(word.trim().toLocaleLowerCase("sv"));
}
