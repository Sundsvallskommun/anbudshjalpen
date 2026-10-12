import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { useScrollableArea } from "@astryxdesign/core/hooks";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";
import type { AppConfig } from "../api/types";
import { engineSummary } from "../lib/labels";
import { FALLBACK_AI_DISCLOSURE, FALLBACK_DEMO_NOTICE } from "./AboutDemo";
import { useReadingTrace } from "./readingTrace";

export const READING_SWITCH = "Visa hur underlaget lästes";

/** The demo's switch for the trace of the files; a convenience kept in this browser, like the appearance. */
function ReadingTraceSwitch() {
  const [isShown, setShown] = useReadingTrace();
  return (
    <Switch
      label={READING_SWITCH}
      description="Valet sparas i den här webbläsaren."
      value={isShown}
      onChange={(checked) => setShown(checked)}
    />
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <VStack gap={1}>
      <Heading level={3}>{title}</Heading>
      {children}
    </VStack>
  );
}

/**
 * The dialog's text. On a small screen it is taller than the dialog and scrolls between the header and "Stäng"; then
 * the scrolling box joins the tab order, so a keyboard can scroll it too (WCAG 2.1.1). Where it fits it is no stop.
 */
function AboutText({ config }: { config: AppConfig | undefined }) {
  const { getViewportProps, getContentProps } = useScrollableArea({
    axis: "block",
    keyboardAccess: { owner: "viewport", label: "Texten om demon och AI" },
  });
  return (
    <LayoutContent isScrollable={false} {...getViewportProps<HTMLDivElement>()}>
      <VStack gap={5} {...getContentProps<HTMLDivElement>()}>
        <Part title="Det här är en demo">
          <Text as="p">{config?.demo_notice ?? FALLBACK_DEMO_NOTICE}</Text>
          <Text as="p">I en färdig tjänst loggar företag in med e-legitimation.</Text>
        </Part>
        <Part title="Ladda inte upp riktiga anbud">
          <Text as="p">
            Ladda inte upp riktiga anbud, affärshemligheter eller personuppgifter i demon. Ett utkast som du granskar
            sparas inte, men demon är inte gjord för riktiga uppgifter.
          </Text>
        </Part>
        <Part title="AI i Anbudshjälpen">
          <Text as="p">{config?.ai_disclosure ?? FALLBACK_AI_DISCLOSURE}</Text>
          {config && <Text as="p">{engineSummary(config.ai_engine)}</Text>}
          <Text as="p">Varje uppgift visar sin källa i underlaget. Det är alltid förfrågningsunderlaget som gäller.</Text>
        </Part>
        <Part title="Så lästes underlaget">
          <Text as="p">
            För den som vill se vad som händer bakom kulisserna: varje upphandlings sida får knappen ”Så lästes
            underlaget”, som visar steg för steg vad som hände med varje fil, från hämtningen till checklistan.
          </Text>
          <ReadingTraceSwitch />
        </Part>
      </VStack>
    </LayoutContent>
  );
}

/** The "Om demon och AI" dialog; AboutDemoProvider owns whether it is open. */
export default function AboutDemoDialog({
  config,
  isOpen,
  onOpenChange: setIsOpen,
}: {
  config: AppConfig | undefined;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={setIsOpen} width={640}>
      {/* The header is always mounted: the dialog takes its accessible name from the title. */}
      <Layout
        header={<DialogHeader title="Om demon och AI" onOpenChange={setIsOpen} />}
        content={isOpen ? <AboutText config={config} /> : undefined}
        footer={
          isOpen ? (
            <LayoutFooter>
              <HStack hAlign="end">
                <Button label="Stäng" onClick={() => setIsOpen(false)} />
              </HStack>
            </LayoutFooter>
          ) : undefined
        }
      />
    </Dialog>
  );
}
