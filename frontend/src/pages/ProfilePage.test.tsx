import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CompanyUpdate, CompanyView, CpvSuggestionView, MatchView, ProfileSaved } from "../api/types";
import { companyUser, matchView } from "../test/fixtures";
import { baseRoutes, mockApi, renderApp, type MockRoute } from "../test/render";
import { profileView } from "./profile/profileTestData";

const secondMatch: MatchView = { ...matchView, id: "2b1a0f9e-8d7c-4b6a-9f5e-4d3c2b1a0f9e", fit: "passar" };
const unfitMatch: MatchView = { ...matchView, id: "5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b", fit: "passar_inte" };

const suggestions: CpvSuggestionView = {
  suggestions: {
    suggestions: [
      { code: "45442100", label: "Målning", reason: "Beskrivningen nämner målning." },
      { code: "45442110", label: "Målning av byggnader", reason: "Ni målar invändigt och utvändigt." },
    ],
  },
  engine: "heuristic",
};

const LABELS: Record<string, string> = { "45442100": "Målning", "45442110": "Målning av byggnader" };

function savedFrom(update: CompanyUpdate, fittingNotices: number | null): ProfileSaved {
  return {
    ...profileView,
    ...update,
    annual_turnover_sek: update.annual_turnover_sek,
    public_references: update.public_references,
    cpv_labels: Object.fromEntries(update.cpv_codes.map((code) => [code, LABELS[code] ?? code])),
    fitting_notices: fittingNotices,
  };
}

function saveRoute(fittingNotices: number | null): MockRoute {
  return { method: "PUT", path: "/api/profile", body: (update: unknown) => savedFrom(update as CompanyUpdate, fittingNotices) };
}

function routes(profile: CompanyView = profileView, extra: MockRoute[] = []): MockRoute[] {
  return [
    ...baseRoutes(companyUser),
    { method: "GET", path: "/api/profile", body: profile },
    { method: "GET", path: "/api/matches", body: [matchView, secondMatch, unfitMatch] },
    ...extra,
  ];
}

describe("ProfilePage", () => {
  it("shows the profile in plain words, with what it decides and the codes named first", async () => {
    mockApi(routes());
    renderApp("/profil");

    expect(await screen.findByRole("heading", { level: 2, name: "Målerifirman i Matfors AB" })).toBeInTheDocument();
    expect(screen.getByText("Org.nr 559900-0013")).toBeInTheDocument();
    // The matches Start shows as cards: the one that does not seem to fit is not counted.
    expect(await screen.findByText("Just nu: 2 träffar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Se träffarna" })).toHaveAttribute("href", "/start");
    const activity = screen.getByRole("region", { name: "Vad ni gör (CPV-koder)" });
    expect(within(activity).getByRole("textbox", { name: "Beskriv företaget" })).toHaveValue(profileView.description);
    expect(within(activity).getByText("Målning · 45442100")).toBeInTheDocument();
    expect(within(activity).getByRole("button", { name: "Ta bort Målning · 45442100" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Om företaget" })).getByText("Sundsvall")).toBeInTheDocument();
    expect(screen.queryByText("Du har ändringar som inte är sparade.")).not.toBeInTheDocument();
  });

  it("suggests codes as boxes with the reason beside each, and saves the profile with the new fit count", async () => {
    const calls = mockApi(routes(profileView, [{ method: "POST", path: "/api/profile/cpv-suggestions", body: suggestions }, saveRoute(2)]));
    renderApp("/profil");

    await userEvent.click(await screen.findByRole("button", { name: "Föreslå koder" }));
    const group = await screen.findByRole("group", { name: "Förslag utifrån beskrivningen" });
    expect(group).toHaveAccessibleDescription(
      "Framtagna automatiskt utifrån orden i beskrivningen och inte granskade. Välj de som stämmer.",
    );
    expect(within(group).getByRole("checkbox", { name: "Målning · 45442100" })).toBeChecked();
    const building = within(group).getByRole("checkbox", { name: "Målning av byggnader · 45442110" });
    expect(building).not.toBeChecked();
    expect(building).toHaveAccessibleDescription("Ni målar invändigt och utvändigt.");

    await userEvent.click(building);
    expect(building).toBeChecked();
    expect(screen.getByRole("button", { name: "Ta bort Målning av byggnader · 45442110" })).toBeInTheDocument();
    expect(screen.getByText("Du har ändringar som inte är sparade.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Spara profilen" }));
    // Testing Library reads the toast's no-break spaces as plain spaces.
    expect((await screen.findAllByText("Profilen är sparad · 2 upphandlingar verkar passa er")).length).toBeGreaterThan(0);
    // The summary's link and the toast's way to the matches (the toast layer is a popover jsdom never shows).
    expect(screen.getAllByRole("link", { name: "Se träffarna", hidden: true }).map((link) => link.getAttribute("href"))).toEqual([
      "/start",
      "/start",
    ]);
    expect(screen.queryByText("Du har ändringar som inte är sparade.")).not.toBeInTheDocument();
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ description: profileView.description });
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
      description: profileView.description,
      cpv_codes: ["45442100", "45442110"],
      municipalities: ["Sundsvall", "Timrå"],
      employees: 5,
      annual_turnover_sek: 4_800_000,
      certifications: [],
      insurance: profileView.insurance,
      public_references: profileView.public_references,
    });
  });

  it("takes a code away when its box is unticked", async () => {
    mockApi(routes(profileView, [{ method: "POST", path: "/api/profile/cpv-suggestions", body: suggestions }]));
    renderApp("/profil");

    await userEvent.click(await screen.findByRole("button", { name: "Föreslå koder" }));
    const group = await screen.findByRole("group", { name: "Förslag utifrån beskrivningen" });
    await userEvent.click(within(group).getByRole("checkbox", { name: "Målning · 45442100" }));

    expect(within(group).getByRole("checkbox", { name: "Målning · 45442100" })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Ta bort Målning · 45442100" })).not.toBeInTheDocument();
    expect(screen.getByText("Du har ändringar som inte är sparade.")).toBeInTheDocument();
  });

  it("says the matches follow shortly when the save cannot count them yet", async () => {
    mockApi(routes(profileView, [saveRoute(null)]));
    renderApp("/profil");

    const insurance = await screen.findByRole("textbox", { name: "Försäkringar" });
    await userEvent.clear(insurance);
    await userEvent.type(insurance, "Ansvarsförsäkring 10 mnkr");
    await userEvent.click(screen.getByRole("button", { name: "Spara profilen" }));

    expect((await screen.findAllByText("Profilen är sparad · Träffarna uppdateras om en stund")).length).toBeGreaterThan(0);
  });

  it("points to the description when it is too short to suggest codes from", async () => {
    const calls = mockApi(routes({ ...profileView, description: "Måleri" }));
    renderApp("/profil");

    await userEvent.click(await screen.findByRole("button", { name: "Föreslå koder" }));
    const description = screen.getByRole("textbox", { name: "Beskriv företaget" });
    expect(description).toHaveFocus();
    expect(description).toHaveAttribute("aria-invalid", "true");
    expect(calls.some((call) => call.path === "/api/profile/cpv-suggestions")).toBe(false);

    await userEvent.type(description, " invändigt och utvändigt");
    expect(description).not.toHaveAttribute("aria-invalid", "true");
  });

  it("keeps the save row in view while anything is unsaved, and can undo the changes", async () => {
    mockApi(routes());
    renderApp("/profil");

    const insurance = await screen.findByRole("textbox", { name: "Försäkringar" });
    await userEvent.clear(insurance);
    await userEvent.type(insurance, "Ansvarsförsäkring 10 mnkr");
    expect(screen.getByText("Du har ändringar som inte är sparade.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Ångra ändringar" }));
    expect(insurance).toHaveValue(profileView.insurance);
    expect(screen.queryByText("Du har ändringar som inte är sparade.")).not.toBeInTheDocument();
  });

  it("says why the profile could not be saved", async () => {
    mockApi(
      routes(profileView, [
        {
          method: "PUT",
          path: "/api/profile",
          status: 422,
          body: { detail: "Okända CPV-koder: 12345678. Välj koder från förslagen eller sökningen." },
        },
      ]),
    );
    renderApp("/profil");

    await userEvent.click(await screen.findByRole("button", { name: "Spara profilen" }));
    expect(await screen.findByText("Profilen kunde inte sparas")).toBeInTheDocument();
    expect(screen.getByText("Okända CPV-koder: 12345678. Välj koder från förslagen eller sökningen.")).toBeInTheDocument();
  });
});
