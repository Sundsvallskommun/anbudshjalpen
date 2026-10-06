import { describe, expect, it } from "vitest";
import { matchView } from "../../test/fixtures";
import {
  chipValues,
  cpvChipLabel,
  draftErrors,
  draftFromProfile,
  fittingMatchCount,
  hasUnsavedChanges,
  matchCountText,
  savedMessage,
  toUpdate,
  wordSource,
} from "./profileDraft";
import { profileView } from "./profileTestData";

describe("the profile draft", () => {
  it("names a CPV code before its number, and never shows a bare code", () => {
    expect(cpvChipLabel("45442100", "Målning")).toBe("Målning · 45442100");
    expect(cpvChipLabel("45442100", undefined)).toBe("Kod utan benämning · 45442100");
    expect(draftFromProfile(profileView).cpv).toEqual([{ id: "45442100", label: "Målning · 45442100" }]);
  });

  it("sends the profile trimmed, with empty texts as nothing", () => {
    const draft = { ...draftFromProfile(profileView), description: "  Måleri i Matfors.  ", insurance: "   ", municipalities: ["Sundsvall", " "] };
    expect(toUpdate(draft)).toEqual({
      description: "Måleri i Matfors.",
      cpv_codes: ["45442100"],
      municipalities: ["Sundsvall"],
      employees: 5,
      annual_turnover_sek: 4_800_000,
      certifications: [],
      insurance: null,
      public_references: profileView.public_references,
    });
  });

  it("counts only real changes as unsaved", () => {
    const draft = draftFromProfile(profileView);
    expect(hasUnsavedChanges(draft, profileView)).toBe(false);
    expect(hasUnsavedChanges({ ...draft, description: `${draft.description}  ` }, profileView)).toBe(false);
    expect(hasUnsavedChanges({ ...draft, employees: 6 }, profileView)).toBe(true);
    expect(hasUnsavedChanges({ ...draft, cpv: [] }, profileView)).toBe(true);
  });

  it("says which texts are too long to save", () => {
    const draft = draftFromProfile(profileView);
    expect(draftErrors(draft)).toEqual({});
    expect(draftErrors({ ...draft, description: "x".repeat(4001), insurance: "x".repeat(501) })).toEqual({
      description: "Beskrivningen får vara högst 4\u00a0000 tecken.",
      insurance: "Försäkringarna får beskrivas med högst 500 tecken.",
    });
  });

  it("words the number of matches", () => {
    expect(matchCountText(0)).toBe("Inga träffar just nu");
    expect(matchCountText(1)).toBe("Just nu: 1 träff");
    expect(matchCountText(2)).toBe("Just nu: 2 träffar");
  });

  it("counts the matches Start shows, not those that do not seem to fit", () => {
    const fits = [
      { ...matchView, fit: "passar" as const },
      { ...matchView, fit: "passar_delvis" as const },
      { ...matchView, fit: "passar_inte" as const },
    ];
    expect(fittingMatchCount(fits)).toBe(2);
    expect(fittingMatchCount([])).toBe(0);
  });
});

describe("savedMessage", () => {
  it("says the profile is saved and how many notices seem to fit now", () => {
    expect(savedMessage(2)).toBe("Profilen är sparad\u00a0· 2\u00a0upphandlingar verkar passa\u00a0er");
    expect(savedMessage(1)).toBe("Profilen är sparad\u00a0· 1\u00a0upphandling verkar passa\u00a0er");
    expect(savedMessage(1200)).toBe("Profilen är sparad\u00a0· 1\u00a0200\u00a0upphandlingar verkar passa\u00a0er");
  });

  it("says when nothing seems to fit, and leaves the count out when the matches follow later", () => {
    expect(savedMessage(0)).toBe("Profilen är sparad\u00a0· Inga öppna upphandlingar verkar passa er just\u00a0nu");
    expect(savedMessage(null)).toBe("Profilen är sparad\u00a0· Träffarna uppdateras om en\u00a0stund");
  });
});

describe("wordSource", () => {
  const source = wordSource(["Sundsvall", "Timrå"]);

  it("offers the known words that match, then the typed word in Swedish", () => {
    expect(source.search("sund")).toEqual([
      { id: "Sundsvall", label: "Sundsvall" },
      { id: "sund", label: "Lägg till ”sund”" },
    ]);
    expect(source.search("timrå")).toEqual([{ id: "Timrå", label: "Timrå" }]);
    expect(source.search("Härnösand")).toEqual([{ id: "Härnösand", label: "Lägg till ”Härnösand”" }]);
  });

  it("stores the word itself, not the entry's wording", () => {
    expect(chipValues([{ id: "Härnösand", label: "Lägg till ”Härnösand”" }])).toEqual(["Härnösand"]);
  });
});
