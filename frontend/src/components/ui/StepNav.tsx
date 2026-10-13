import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { STEPS, type StepValue } from "../../lib/labels";
import { useIsPhone } from "../../lib/usePhone";
import styles from "./StepNav.module.css";

export type { StepValue } from "../../lib/labels";

/** The address parameter that holds the step; its values are kept from before the redesign. */
export const STEP_PARAM = "flik";

/** The step an address asks for: one of the four, else the first (Krav). */
export function parseStep(value: string | null): StepValue {
  return STEPS.find((step) => step.value === value)?.value ?? "checklista";
}

/** A mark on a step: a warning when the review found gaps, a check when everything looks fine. */
export type StepMark = "warning" | "success";

const MARK_WORDS: Record<StepMark, string> = { warning: "behöver åtgärdas", success: "ser bra ut" };

export interface StepNavApi {
  step: StepValue;
  /**
   * Moves to a step, with optional address parameters for it (e.g. { fraga: "…" } to prefill a question; null
   * removes one). Focus moves to the step's panel and the bar scrolls into view, so the reader sees where they are.
   */
  goTo: (step: StepValue, params?: Record<string, string | null>) => void;
}

const StepNavContext = createContext<StepNavApi | null>(null);

/** The step bar's state for the steps' own content ("Nästa steg" buttons). Throws outside StepNav. */
export function useStepNav(): StepNavApi {
  const api = use(StepNavContext);
  if (!api) throw new Error("useStepNav must be used inside StepNav");
  return api;
}

function StepNumber({ number, isChosen }: { number: number; isChosen: boolean }) {
  return (
    <span aria-hidden="true" className={isChosen ? `${styles.number} ${styles.numberChosen}` : styles.number}>
      {number}
    </span>
  );
}

/** Whether the bar has stuck to the top: its sentinel, just above it, has scrolled out of view. */
function useIsStuck(sentinel: React.RefObject<HTMLElement | null>): boolean {
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setIsStuck(entry ? !entry.isIntersecting : false));
    observer.observe(element);
    return () => observer.disconnect();
  }, [sentinel]);
  return isStuck;
}

export interface StepNavProps {
  /** Each step's content; a step's panel is mounted when first opened and then kept, so its state survives. */
  panels: Record<StepValue, () => ReactNode>;
  /** Marks on steps, e.g. { granska: "warning" } after a review with gaps. */
  marks?: Partial<Record<StepValue, StepMark>>;
  /** Shown at the end of the bar once it has stuck, on wider screens: "Sista anbudsdag 9 nov · om 35 dagar". */
  end?: ReactNode;
  /** The prefix of the panels' ids. */
  idPrefix?: string;
}

/**
 * The notice page's three numbered steps (1 Krav · 2 Granska · 3 Lämna in) as a sticky tab bar. The step lives in
 * the address (`?flik=checklista|granska|inlamning`), so it can be linked to and survives a reload; the old step
 * `fraga` now opens the "Fråga AI" panel (decision 0014). On a phone the labels drop their numbers and fill three
 * equal cells. WAI-ARIA tabs: each tab controls its panel.
 */
export function StepNav({ panels, marks = {}, end, idPrefix = "steg" }: StepNavProps) {
  const [params, setParams] = useSearchParams();
  const selected = parseStep(params.get(STEP_PARAM));
  const [visited, setVisited] = useState<ReadonlySet<StepValue>>(() => new Set([selected]));
  const isPhone = useIsPhone();
  const sentinel = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const isStuck = useIsStuck(sentinel);
  const pendingFocus = useRef<StepValue | null>(null);

  const select = useCallback(
    (value: string, extra?: Record<string, string | null>) => {
      const step = parseStep(value);
      setVisited((previous) => (previous.has(step) ? previous : new Set(previous).add(step)));
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set(STEP_PARAM, step);
          for (const [key, entry] of Object.entries(extra ?? {})) {
            if (entry === null) next.delete(key);
            else next.set(key, entry);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const api = useMemo<StepNavApi>(
    () => ({
      step: selected,
      goTo: (step, extra) => {
        pendingFocus.current = step;
        select(step, extra);
      },
    }),
    [selected, select],
  );

  // A step opened from its own content ("Granska utkastet") takes the focus to its panel, with the bar in view.
  useEffect(() => {
    if (pendingFocus.current !== selected) return;
    pendingFocus.current = null;
    bar.current?.scrollIntoView?.({ block: "start" });
    document.getElementById(`${idPrefix}-${selected}`)?.focus({ preventScroll: true });
  }, [selected, idPrefix]);

  // A step reached from the address alone (a link, back) is mounted too.
  if (!visited.has(selected)) setVisited(new Set(visited).add(selected));

  return (
    <StepNavContext value={api}>
      {/* The bar is a direct child of the box that holds the panels: a sticky element sticks only within its parent. */}
      <VStack gap={0}>
        <span ref={sentinel} aria-hidden="true" className={styles.sentinel} />
        {/* The tabs stand on the bar's line, so the chosen step's accent line covers it (the bar draws the line across
            its whole width, as the design does, instead of the tab list's own divider under the tabs alone). */}
        <HStack
          ref={bar}
          vAlign="end"
          hAlign="between"
          gap={4}
          className={styles.bar}
          data-stuck={isStuck}
          data-step-nav=""
        >
          <TabList
            role="tablist"
            aria-label="Steg"
            value={selected}
            onChange={(value) => select(value)}
            layout={isPhone ? "fill" : "hug"}
            size="lg"
          >
            {STEPS.map((step) => {
              const mark = marks[step.value];
              return (
                <Tab
                  key={step.value}
                  value={step.value}
                  label={step.label}
                  panelId={`${idPrefix}-${step.value}`}
                  icon={isPhone ? undefined : <StepNumber number={step.number} isChosen={false} />}
                  selectedIcon={isPhone ? undefined : <StepNumber number={step.number} isChosen />}
                  endContent={
                    mark ? (
                      <>
                        <Icon icon={mark} color={mark} size="sm" />
                        <VisuallyHidden>{`, ${MARK_WORDS[mark]}`}</VisuallyHidden>
                      </>
                    ) : undefined
                  }
                />
              );
            })}
          </TabList>
          {end && !isPhone && <HStack className={styles.end}>{end}</HStack>}
        </HStack>
        {STEPS.map((step) => (
          <section
            key={step.value}
            id={`${idPrefix}-${step.value}`}
            role="tabpanel"
            aria-label={step.label}
            tabIndex={-1}
            hidden={step.value !== selected}
            className={styles.panel}
          >
            {(step.value === selected || visited.has(step.value)) && panels[step.value]()}
          </section>
        ))}
      </VStack>
    </StepNavContext>
  );
}
