import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api/client";

/** Whether a failed request may pass on a second try: the network and the server may, a 4xx answer never. */
export function isTransientError(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
}

function shouldRetry(failureCount: number, error: unknown): boolean {
  return isTransientError(error) && failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}
