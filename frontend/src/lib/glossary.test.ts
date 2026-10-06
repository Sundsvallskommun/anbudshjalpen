import { describe, expect, it } from "vitest";
import { findGlossaryEntry, GLOSSARY, glossaryTerms } from "./glossary";

describe("glossary", () => {
  it("explains the words the redesign asks for", () => {
    const terms = GLOSSARY.map((entry) => entry.term);
    for (const term of ["Skallkrav", "Kvalificeringskrav", "Frågestopp", "Förfarande", "Tröskelvärde", "CPV-kod", "e-Avrop", "TED", "Avtalsspärr", "ESPD", "BAS-U", "F-skatt"]) {
      expect(terms).toContain(term);
    }
  });

  it("finds an entry from any of its forms, whatever the case", () => {
    expect(findGlossaryEntry("skallkraven")?.term).toBe("Skallkrav");
    expect(findGlossaryEntry("EU:s beloppsgränser")?.term).toBe("Tröskelvärde");
    expect(findGlossaryEntry("cpv-koder")?.term).toBe("CPV-kod");
    expect(findGlossaryEntry("målning")).toBeUndefined();
  });

  it("calls förenklat förfarande an old name, never today's procedure", () => {
    const entry = findGlossaryEntry("förenklat förfarande");
    expect(entry?.term).toBe("Förfarande");
    expect(entry?.explanation).toMatch(/förenklat förfarande och urvalsförfarande togs bort ur lagen den 1 februari 2022/);
    expect(entry?.explanation).not.toMatch(/oftast ett förenklat förfarande/);
  });

  it("gives every form a term explanation with the law reference", () => {
    const terms = glossaryTerms();
    const spärr = terms.find((term) => term.term === "avtalsspärren");
    expect(spärr?.explanation).toMatch(/10 dagar.*\(LOU 20 kap\. 1 §\)$/);
    expect(spärr?.citation).toBeNull();
    // No form belongs to two entries.
    const forms = GLOSSARY.flatMap((entry) => entry.forms.map((form) => form.toLocaleLowerCase("sv")));
    expect(new Set(forms).size).toBe(forms.length);
  });
});
