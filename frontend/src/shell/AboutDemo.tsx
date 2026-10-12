import { createContext, lazy, Suspense, use, useMemo, useState, type ReactNode } from "react";
import type { AppConfig } from "../api/types";

/** Shown until the configuration has loaded, and if it cannot load: the notice is never missing. */
export const FALLBACK_DEMO_NOTICE = "Det här är en demo. Upphandlingsunderlag, företag och personer är fiktiva.";
export const FALLBACK_AI_DISCLOSURE =
  "Anbudshjälpen använder AI för att tolka underlag och svara på frågor. AI kan ha fel: kontrollera alltid mot underlaget.";

// The dialog is fetched the first time it is opened.
const AboutDemoDialog = lazy(() => import("./AboutDemoDialog"));

const AboutDemoContext = createContext<(() => void) | null>(null);

/** Opens "Om demon och AI"; null outside AboutDemoProvider. */
export function useOpenAboutDemo(): (() => void) | null {
  return use(AboutDemoContext);
}

/**
 * "Om demon och AI" (decision 0007 and direction.md, section 4): the operator's demo notice and AI disclosure from
 * the configuration, the engine named once, and why real tenders must not be uploaded. The demo strip and the footer
 * both open it; its open state lives here, above the dialog.
 */
export function AboutDemoProvider({ config, children }: { config: AppConfig | undefined; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const open = useMemo(
    () => () => {
      setIsOpen(true);
      setHasOpened(true);
    },
    [],
  );
  return (
    <AboutDemoContext value={open}>
      {children}
      {hasOpened && (
        <Suspense fallback={null}>
          <AboutDemoDialog config={config} isOpen={isOpen} onOpenChange={setIsOpen} />
        </Suspense>
      )}
    </AboutDemoContext>
  );
}
