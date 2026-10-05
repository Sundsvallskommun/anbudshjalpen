import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, messageForStatus, withQuery } from "./client";

afterEach(() => vi.restoreAllMocks());

describe("api client", () => {
  it("sends JSON with the session cookie and parses the answer", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(api.post("/api/session/login", { persona: "foretagare" })).resolves.toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.credentials).toBe("include");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(init?.body).toBe('{"persona":"foretagare"}');
  });

  it("uses the backend's Swedish detail as the error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Upphandlingen finns inte." }), { status: 404 }),
    );
    await expect(api.get("/api/notices/x")).rejects.toEqual(new ApiError(404, "Upphandlingen finns inte."));
  });

  it("falls back to a message for the status when detail is not a string", () => {
    expect(messageForStatus(422, [{ msg: "field required" }])).toMatch(/kunde inte godtas/);
    expect(messageForStatus(503, undefined)).toMatch(/svarar inte/);
  });

  it("reports a network failure as status 0", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.get("/api/config")).rejects.toMatchObject({ status: 0 });
  });

  it("returns nothing for 204", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.delete("/api/reminders/1")).resolves.toBeUndefined();
  });

  it("builds a query string from defined values only", () => {
    expect(withQuery("/api/notices", { q: "måla", status: undefined, limit: 20, cpv: "" })).toBe(
      "/api/notices?q=m%C3%A5la&limit=20",
    );
  });
});
