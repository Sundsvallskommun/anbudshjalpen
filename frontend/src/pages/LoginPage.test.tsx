import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { UserView } from "../api/types";
import { renderWithProviders } from "../components/ui/testing";
import { buyerUser, companyUser, config, labUser, session } from "../test/fixtures";
import { mockApi, renderApp, type MockRoute } from "../test/render";
import LoginPage, { safeReturnPath } from "./LoginPage";
import { personaIdentity } from "./login/personas";

// The fixture's personas are named as the backend names them (services/personas.py): "Anna Berg, Målerifirman i
// Matfors AB" and "Lars Holm, inköpare", with the role in a sentence as the description.
function routes(user: UserView | null, loginAs: UserView = companyUser): MockRoute[] {
  return [
    { method: "GET", path: "/api/config", body: config },
    { method: "GET", path: "/api/session", body: session(user) },
    { method: "POST", path: "/api/session/login", body: session(loginAs) },
  ];
}

describe("LoginPage", () => {
  it("offers the two roles as cards with who they are, what they can do and where they land", async () => {
    mockApi(routes(null));
    renderApp("/logga-in");

    expect(await screen.findByRole("heading", { level: 1, name: "Välj vem du är i demon" })).toBeInTheDocument();
    expect(screen.getByText("Ingen riktig inloggning. I tjänsten loggar företag in med e-legitimation.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 2, name: "Anna Berg" })).toBeInTheDocument();
    expect(screen.getByText("Målerifirman i Matfors AB")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Lars Holm" })).toBeInTheDocument();
    expect(screen.getByText("Inköp, Sundsvalls kommun")).toBeInTheDocument();
    expect(screen.getByText("Du kommer till: Start")).toBeInTheDocument();
    expect(screen.getByText("Du kommer till: Att granska")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fortsätt som Anna, företagare" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fortsätt som Lars, inköpare" })).toBeInTheDocument();
    expect(screen.getAllByText(config.demo_notice)).toHaveLength(1);
  });

  it("creates the participant's own company when the lab is on, and lands on the profile", async () => {
    const calls = mockApi([
      { method: "GET", path: "/api/config", body: { ...config, lab_enabled: true } },
      { method: "GET", path: "/api/session", body: session(null) },
      { method: "POST", path: "/api/lab/companies", body: session(labUser) },
    ]);
    renderWithProviders(<LoginPage />, { path: "/logga-in" });

    expect(await screen.findByRole("heading", { level: 2, name: "Prova med ditt eget företag" })).toBeInTheDocument();
    expect(screen.getByText(/Skriv inga personuppgifter och inget som är hemligt/)).toBeInTheDocument();
    const create = screen.getByRole("button", { name: "Skapa testföretag" });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Företagets namn/), "Mitt bolag");
    await userEvent.click(create);

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/profil$/));
    expect(calls.find((call) => call.path === "/api/lab/companies")?.body).toEqual({ name: "Mitt bolag" });
  });

  it("lists the lab companies and continues as the chosen one", async () => {
    const companies = [{ id: labUser.company!.id, name: labUser.company!.name }];
    const calls = mockApi([
      { method: "GET", path: "/api/config", body: { ...config, lab_enabled: true } },
      { method: "GET", path: "/api/session", body: session(null, companies) },
      { method: "POST", path: "/api/lab/sessions", body: session(labUser, companies) },
    ]);
    renderWithProviders(<LoginPage />, { path: "/logga-in" });

    expect(await screen.findByRole("heading", { level: 2, name: "Testföretag från träffen" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fortsätt som Fiktiv Snickeri AB" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/start$/));
    expect(calls.find((call) => call.path === "/api/lab/sessions")?.body).toEqual({ company_id: companies[0]!.id });
  });

  it("does not offer the lab when it is off", async () => {
    mockApi(routes(null));
    renderApp("/logga-in");

    expect(await screen.findByRole("heading", { level: 2, name: "Anna Berg" })).toBeInTheDocument();
    expect(screen.queryByText("Prova med ditt eget företag")).not.toBeInTheDocument();
  });

  it("logs in as the chosen role and lands on its start", async () => {
    const calls = mockApi(routes(null));
    renderWithProviders(<LoginPage />, { path: "/logga-in" });

    await userEvent.click(await screen.findByRole("button", { name: "Fortsätt som Anna, företagare" }));

    // The probe is there from the start; wait until the login has moved it, which takes longer on a busy runner.
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/start$/));
    expect(calls.find((call) => call.path === "/api/session/login")?.body).toEqual({ persona: "foretagare" });
  });

  it("goes back to the page that asked for the login", async () => {
    mockApi([...routes(null, buyerUser), { method: "POST", path: "/api/rules/ask", body: {} }]);
    renderApp(`/logga-in?till=${encodeURIComponent("/regelhjalpen")}`);

    expect(await screen.findAllByText("Du kommer tillbaka till sidan du var på.")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Fortsätt som Lars, inköpare" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Regelhjälpen" })).toBeInTheDocument();
  });

  it("marks the role the user is logged in as now", async () => {
    mockApi(routes(companyUser));
    renderApp("/logga-in");

    // The card's own button is the first thing in the card, so its parent is Anna's card.
    const annaCard = (await screen.findByRole("button", { name: "Fortsätt som Anna, företagare" })).parentElement;
    expect(within(annaCard as HTMLElement).getByText("Inloggad nu")).toBeInTheDocument();
    expect(screen.getAllByText("Inloggad nu")).toHaveLength(1);
  });

  it("only returns to paths inside the app", () => {
    expect(safeReturnPath("/upphandlingar/1?flik=fraga")).toBe("/upphandlingar/1?flik=fraga");
    expect(safeReturnPath("//evil.example")).toBeNull();
    expect(safeReturnPath("https://evil.example")).toBeNull();
    expect(safeReturnPath("/logga-in")).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
  });
});

describe("personaIdentity", () => {
  it("reads the name and the organisation from the backend's label", () => {
    const [company, buyer] = session(null).personas;
    expect(personaIdentity(company!, "Sundsvalls kommun")).toEqual({
      name: "Anna Berg",
      firstName: "Anna",
      organization: "Målerifirman i Matfors AB",
    });
    expect(personaIdentity(buyer!, "Sundsvalls kommun")).toEqual({
      name: "Lars Holm",
      firstName: "Lars",
      organization: "Inköp, Sundsvalls kommun",
    });
    expect(personaIdentity({ key: "foretagare", label: "Anna Berg", description: "" }, undefined).organization).toBeNull();
  });
});
