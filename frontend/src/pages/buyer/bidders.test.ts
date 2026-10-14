import { describe, expect, it } from "vitest";
import type { SupplierMatch, UpcomingProcurement } from "../../api/types";
import { companyFacts, EMPTY_JOB, jobErrors, jobFromUpcoming, jobRequest, resultHeading, sharedWordsText } from "./bidders";

const upcoming: UpcomingProcurement = {
  agreement_id: "0b8e4c1d-5f9a-4e2b-8c3d-7a6b5c4d3e21",
  title: "Ramavtal måleriarbeten",
  category: "Bygg och fastighet",
  cpv_codes: ["45442100", "45442110"],
  end_date: "2027-11-30",
  max_end_date: "2027-11-30",
  expected_from: "2027-02-28",
  expected_to: "2027-05-30",
  previous_requirements: "Ansvarsförsäkring minst 5 miljoner kronor.",
  is_fictitious: true,
  relevant_for_company: false,
  announcement_overdue: false,
};

describe("jobErrors", () => {
  it("needs words or a CPV code, and puts that on the first field", () => {
    expect(jobErrors(EMPTY_JOB)).toEqual({ title: "Beskriv uppdraget eller ange minst en CPV-kod." });
    expect(jobErrors({ ...EMPTY_JOB, title: "  Om " })).toEqual({ title: "Beskriv uppdraget eller ange minst en CPV-kod." });
    expect(jobErrors({ ...EMPTY_JOB, title: "Ommålning" })).toEqual({});
    expect(jobErrors({ ...EMPTY_JOB, description: "Måla om en förskola" })).toEqual({});
    expect(jobErrors({ ...EMPTY_JOB, cpv: "45442100" })).toEqual({});
  });

  it("checks the CPV codes the way Ny upphandling does", () => {
    expect(jobErrors({ ...EMPTY_JOB, cpv: "4544, 45442100" })).toEqual({
      cpv: "4544 är inte en CPV-kod. En kod har åtta siffror, till exempel 45442100.",
    });
    expect(jobErrors({ ...EMPTY_JOB, cpv: "45442100-8, 45442110" })).toEqual({});
  });

  it("caps the lengths the backend caps", () => {
    expect(jobErrors({ ...EMPTY_JOB, title: "x".repeat(501) })).toEqual({ title: "Rubriken får vara högst 500 tecken." });
    expect(jobErrors({ ...EMPTY_JOB, title: "Städning", description: "x".repeat(8001) })).toEqual({
      description: "Beskrivningen får vara högst 8000 tecken.",
    });
    expect(jobErrors({ ...EMPTY_JOB, cpv: Array.from({ length: 31 }, () => "45442100").join(",") })).toEqual({
      cpv: "Ange högst 30 CPV-koder.",
    });
  });
});

describe("the job", () => {
  it("is sent trimmed, with the codes as a list", () => {
    expect(jobRequest({ title: " Ommålning ", description: " Invändigt. ", cpv: "45442100, 45442110 " })).toEqual({
      title: "Ommålning",
      description: "Invändigt.",
      cpv_codes: ["45442100", "45442110"],
    });
  });

  it("starts from an upcoming procurement with its title, codes and last requirements", () => {
    expect(jobFromUpcoming(upcoming)).toEqual({
      title: "Ramavtal måleriarbeten",
      description: "Ansvarsförsäkring minst 5 miljoner kronor.",
      cpv: "45442100, 45442110",
    });
    expect(jobFromUpcoming({ ...upcoming, previous_requirements: null, cpv_codes: [] })).toEqual({
      title: "Ramavtal måleriarbeten",
      description: "",
      cpv: "",
    });
  });
});

describe("the words for a company", () => {
  const painter: Pick<SupplierMatch, "municipalities" | "employees"> = { municipalities: ["Sundsvall", "Timrå"], employees: 5 };

  it("gives the municipalities and the size, whichever the profile has", () => {
    expect(companyFacts(painter)).toBe("Sundsvall, Timrå · 5 anställda");
    expect(companyFacts({ municipalities: [], employees: 1 })).toBe("1 anställd");
    expect(companyFacts({ municipalities: ["Sundsvall"], employees: null })).toBe("Sundsvall");
    expect(companyFacts({ municipalities: [], employees: null })).toBe("");
  });

  it("lists the shared words as a sentence", () => {
    expect(sharedWordsText(["fasader"])).toBe("Beskrivningen nämner fasader");
    expect(sharedWordsText(["fasader", "tapetserar", "förskolor"])).toBe("Beskrivningen nämner fasader, tapetserar och förskolor");
    expect(sharedWordsText([])).toBeNull();
  });

  it("counts the companies without promising them", () => {
    expect(resultHeading(1)).toBe("1 företag verkar kunna svara");
    expect(resultHeading(12)).toBe("12 företag verkar kunna svara");
  });
});
