/**
 * Fetch wrapper for the backend's `/api`.
 *
 * Same origin only, with the session cookie. Errors become `ApiError` with a Swedish message the UI
 * can show as is: the backend's own `detail` when it sent one, otherwise a message for the status.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  401: "Du behöver logga in för att göra det här.",
  403: "Du har inte behörighet att göra det här.",
  404: "Det du letar efter finns inte, eller har tagits bort.",
  409: "Det gick inte att genomföra eftersom läget har ändrats. Ladda om sidan och försök igen.",
  413: "Filen är för stor.",
  415: "Filtypen stöds inte.",
  422: "Uppgifterna kunde inte godtas. Kontrollera fälten och försök igen.",
  429: "För många förfrågningar just nu. Vänta en stund och försök igen.",
};

const UNAVAILABLE = "Tjänsten svarar inte just nu. Försök igen om en stund.";

/** The message for a failed response: the backend's string `detail`, else one for the status. */
export function messageForStatus(status: number, detail: unknown): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  return STATUS_MESSAGES[status] ?? UNAVAILABLE;
}

/** The `detail` of an error body: a string (ErrorView) or FastAPI's list of validation errors. */
async function readDetail(response: Response): Promise<unknown> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null && "detail" in body ? body.detail : undefined;
  } catch {
    return undefined;
  }
}

type Body = FormData | object | undefined;

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(path, { method, headers, body: payload, credentials: "include" });
  } catch {
    throw new ApiError(0, UNAVAILABLE);
  }
  if (!response.ok) {
    throw new ApiError(response.status, messageForStatus(response.status, await readDetail(response)));
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Builds `path?key=value` from the defined, non-empty parameters. */
export function withQuery(path: string, params: Record<string, string | number | undefined | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: Body) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body: Body) => request<T>("PUT", path, body),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};
