import { Theme, type ThemeMode } from "@astryxdesign/core/theme";
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { eneoTheme } from "../theme/built/eneo";

/** Ljust, Mörkt or Automatiskt ("system", the device's own setting). The theme's tokens hold both modes. */
export type Appearance = ThemeMode;

/** Where this browser keeps the choice. `public/appearance.js` reads the same key before the first paint. */
export const APPEARANCE_KEY = "anbudsklar.utseende";

/** The choices in the order they are offered, in the words of the device's own appearance setting. */
export const APPEARANCES = [
  { value: "light", label: "Ljust" },
  { value: "dark", label: "Mörkt" },
  { value: "system", label: "Automatiskt" },
] as const satisfies readonly { value: Appearance; label: string }[];

export function isAppearance(value: unknown): value is Appearance {
  return APPEARANCES.some((choice) => choice.value === value);
}

/** The stored choice; "system" when there is none or the browser blocks storage. */
export function readAppearance(): Appearance {
  try {
    const stored = window.localStorage.getItem(APPEARANCE_KEY);
    return isAppearance(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function storeAppearance(appearance: Appearance): void {
  try {
    if (appearance === "system") window.localStorage.removeItem(APPEARANCE_KEY);
    else window.localStorage.setItem(APPEARANCE_KEY, appearance);
  } catch {
    // Storage can be blocked, as in a private window: the choice then lasts until the page is reloaded.
  }
}

interface AppearanceApi {
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
}

const AppearanceContext = createContext<AppearanceApi | null>(null);

/** The visitor's appearance and the way to change it; only inside AppearanceTheme. */
export function useAppearance(): AppearanceApi {
  const api = use(AppearanceContext);
  if (!api) throw new Error("useAppearance must be used inside AppearanceTheme");
  return api;
}

/**
 * The Eneo theme in the visitor's appearance: light, dark, or the device's setting (the default). The choice is a
 * convenience kept in this browser, not an account setting, and other tabs follow it. Astryx's Theme sets
 * `data-theme` on <html>, which also turns the browser's own scrollbars and form controls.
 */
export function AppearanceTheme({ children }: { children: ReactNode }) {
  const [appearance, setState] = useState<Appearance>(readAppearance);

  useEffect(() => {
    const follow = (event: StorageEvent) => {
      if (event.key === APPEARANCE_KEY || event.key === null) setState(readAppearance());
    };
    window.addEventListener("storage", follow);
    return () => window.removeEventListener("storage", follow);
  }, []);

  const setAppearance = useCallback((next: Appearance) => {
    storeAppearance(next);
    setState(next);
  }, []);
  const api = useMemo(() => ({ appearance, setAppearance }), [appearance, setAppearance]);

  return (
    <AppearanceContext value={api}>
      <Theme theme={eneoTheme} mode={appearance}>
        {children}
      </Theme>
    </AppearanceContext>
  );
}
