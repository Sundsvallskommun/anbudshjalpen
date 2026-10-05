import { describe, expect, it } from "vitest";
import { externalLink, formalQuestionLink, noticeLinkText, procurementLink, submissionLink } from "./links";

const EAVROP = "https://www.e-avrop.com/sundsvall/e-Upphandling/Default.aspx?id=fiktiv";
const TED = "https://ted.europa.eu/sv/notice/-/detail/1-2026";

describe("externalLink", () => {
  it("names the site from the address, not from the words around it", () => {
    expect(externalLink(EAVROP)?.site).toBe("eavrop");
    expect(externalLink("https://e-avrop.com/sundsvall")?.site).toBe("eavrop");
    expect(externalLink(TED)?.site).toBe("ted");
    expect(externalLink("https://example.invalid/e-avrop.com/annons")?.site).toBe("other");
    expect(externalLink("https://e-avrop.com.example.invalid/")?.site).toBe("other");
  });

  it("refuses anything but an absolute http(s) address", () => {
    expect(externalLink(null)).toBeNull();
    expect(externalLink("")).toBeNull();
    expect(externalLink("/upphandlingar/1")).toBeNull();
    expect(externalLink("javascript:alert(1)")).toBeNull();
  });
});

describe("procurementLink", () => {
  it("prefers e-Avrop, whichever link goes there", () => {
    expect(procurementLink({ url: TED, documents_url: EAVROP })).toEqual({ href: EAVROP, site: "eavrop" });
    expect(procurementLink({ url: EAVROP, documents_url: "https://example.invalid/underlag" })).toEqual({
      href: EAVROP,
      site: "eavrop",
    });
  });

  it("falls back to the notice's own link, and to nothing", () => {
    expect(procurementLink({ url: TED, documents_url: null })).toEqual({ href: TED, site: "ted" });
    expect(procurementLink({ url: null, documents_url: null })).toBeNull();
  });

  it("only calls an e-Avrop link e-Avrop", () => {
    expect(noticeLinkText("eavrop")).toBe("Öppna upphandlingen i e-Avrop");
    expect(noticeLinkText("ted")).toBe("Öppna annonsen i TED");
    expect(noticeLinkText("other")).toBe("Öppna annonsen");
  });
});

describe("formalQuestionLink", () => {
  const base = "https://www.e-avrop.com/sundsvall";

  it("names the procurement only when the link goes to it", () => {
    expect(formalQuestionLink({ url: TED, documents_url: EAVROP }, EAVROP)).toEqual({
      href: EAVROP,
      text: "Öppna upphandlingen i e-Avrop",
    });
    expect(formalQuestionLink({ url: TED, documents_url: null }, base)).toEqual({ href: `${base}`, text: "Gå till e-Avrop" });
    expect(formalQuestionLink({ url: null, documents_url: null }, base)).toEqual({ href: base, text: "Gå till e-Avrop" });
  });

  it("falls back to the notice's own link when the backend names none", () => {
    expect(formalQuestionLink({ url: TED, documents_url: null }, undefined)).toEqual({
      href: TED,
      text: "Öppna annonsen i TED",
    });
    expect(formalQuestionLink({ url: null, documents_url: null }, undefined)).toBeNull();
  });
});

describe("submissionLink", () => {
  const base = "https://www.e-avrop.com/sundsvall";

  it("goes to the procurement in e-Avrop when the notice links there", () => {
    expect(submissionLink({ url: TED, documents_url: EAVROP }, base)).toEqual({
      href: EAVROP,
      text: "Lämna anbudet i e-Avrop",
    });
  });

  it("keeps a page of the notice's own, but not TED's, which has no submission", () => {
    expect(submissionLink({ url: "https://example.invalid/annons", documents_url: null }, base)).toEqual({
      href: "https://example.invalid/annons",
      text: "Öppna annonsen",
    });
    expect(submissionLink({ url: TED, documents_url: null }, base)).toEqual({ href: base, text: "Gå till e-Avrop" });
    expect(submissionLink({ url: null, documents_url: null }, base)).toEqual({ href: base, text: "Gå till e-Avrop" });
  });

  it("falls back to the notice's own link while the configuration is unknown", () => {
    expect(submissionLink({ url: TED, documents_url: null }, undefined)).toEqual({
      href: TED,
      text: "Öppna annonsen i TED",
    });
    expect(submissionLink({ url: null, documents_url: null }, undefined)).toBeNull();
  });
});
