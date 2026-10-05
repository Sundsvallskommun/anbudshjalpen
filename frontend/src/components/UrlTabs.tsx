import { Tab, TabList } from "@astryxdesign/core/TabList";
import { VStack } from "@astryxdesign/core/VStack";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";

export interface TabSpec {
  value: string;
  label: string;
  render: () => ReactNode;
}

/**
 * Tabs whose selection lives in the address (`?flik=`), so a tab can be linked to and survives a reload.
 * A panel is mounted the first time it is opened and then kept, hidden, so what a user did in it (a
 * conversation, a review result, a half-filled form) survives switching tabs. WAI-ARIA tabs pattern:
 * every tab controls a panel that exists, hidden or not.
 */
export function UrlTabs({ tabs, idPrefix }: { tabs: readonly TabSpec[]; idPrefix: string }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("flik");
  const selected = tabs.find((tab) => tab.value === requested)?.value ?? tabs[0]?.value ?? "";
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([selected]));

  const select = (value: string) => {
    setVisited((previous) => new Set(previous).add(value));
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("flik", value);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <VStack gap={6}>
      <TabList role="tablist" value={selected} onChange={select} hasDivider>
        {tabs.map((tab) => (
          <Tab key={tab.value} value={tab.value} label={tab.label} panelId={`${idPrefix}-${tab.value}`} />
        ))}
      </TabList>
      {tabs.map((tab) => (
        <section
          key={tab.value}
          id={`${idPrefix}-${tab.value}`}
          role="tabpanel"
          aria-label={tab.label}
          hidden={tab.value !== selected}
        >
          {(tab.value === selected || visited.has(tab.value)) && tab.render()}
        </section>
      ))}
    </VStack>
  );
}
