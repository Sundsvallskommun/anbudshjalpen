import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { READING_TRACE_KEY, readReadingTrace, setReadingTrace, useReadingTrace } from "./readingTrace";

describe("readingTrace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setReadingTrace(false);
    localStorage.clear();
  });

  it("is off until this browser has the choice stored, and keeps nothing for off", () => {
    expect(readReadingTrace()).toBe(false);
    const { result } = renderHook(() => useReadingTrace());
    expect(result.current[0]).toBe(false);

    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(READING_TRACE_KEY)).toBe("1");

    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(READING_TRACE_KEY)).toBeNull();
  });

  it("lasts until the page is reloaded when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useReadingTrace());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
  });
});
