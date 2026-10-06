import { Card } from "@astryxdesign/core/Card";
import { Layout, LayoutContent, LayoutHeader, LayoutPanel } from "@astryxdesign/core/Layout";
import { percent, ResizeHandle, useResizable } from "@astryxdesign/core/Resizable";
import { pixel } from "@astryxdesign/core/Table";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode, Ref } from "react";
import styles from "./Workbench.module.css";

/** From this width the source stands beside the list; below it the source opens in the dialog, as elsewhere. */
export const WIDE_QUERY = "(min-width: 1200px)";

export interface WorkbenchProps {
  hasPane: boolean;
  /** Above the list, in the list's column: the automatic checks. */
  top?: ReactNode;
  toolbar: ReactNode;
  list: ReactNode;
  pane: ReactNode;
  /** The list's own scrolling box beside the pane. */
  listRef?: Ref<HTMLDivElement>;
}

/** The two panes from 1 200 px. The pane's width is the buyer's to set, and it is remembered. */
function Panes({ top, toolbar, list, pane, listRef }: Omit<WorkbenchProps, "hasPane">) {
  const source = useResizable({
    defaultSize: percent(44, { min: pixel(440) }),
    minSize: 380,
    maxSize: percent(60, { max: pixel(960) }),
    autoSaveId: "anbudsklar-granskning-kallan",
  });
  return (
    // A transparent card: it holds the two columns at the page's edges (a Layout would otherwise reach into the
    // page's padding) and draws nothing itself.
    <Card variant="transparent" padding={0} className={styles.bench}>
      <Layout
        height="fill"
        padding={0}
        content={
          <VStack gap={4} className={styles.column}>
            {top}
            <Card padding={0} className={styles.list}>
              <Layout
                height="fill"
                padding={0}
                header={<LayoutHeader>{toolbar}</LayoutHeader>}
                content={
                  <LayoutContent ref={listRef} padding={0} role="region" label="Checklistans rader">
                    {list}
                  </LayoutContent>
                }
              />
            </Card>
          </VStack>
        }
        end={
          <>
            <ResizeHandle isReversed pillPlacement="center" resizable={source.props} label="Ändra bredd på källan" />
            <LayoutPanel resizable={source.props} padding={0} isScrollable={false}>
              <Card padding={0} className={styles.pane}>
                <Layout
                  height="fill"
                  padding={0}
                  content={
                    <LayoutContent padding={0} role="region" label="Källan i underlaget">
                      {pane}
                    </LayoutContent>
                  }
                />
              </Card>
            </LayoutPanel>
          </>
        }
      />
    </Card>
  );
}

/**
 * The review table (direction.md, section 4 "Två rutor från 1 200 px"): the automatic checks and the list in one
 * column, and from 1 200 px the source beside them in a pane the buyer can widen or narrow. The two scroll on their
 * own, as high as the window leaves beside the decision bar. Below 1 200 px the checks and the list stand alone, and
 * each "s. N" opens the source dialog.
 */
export function Workbench({ hasPane, top, toolbar, list, pane, listRef }: WorkbenchProps) {
  if (!hasPane) {
    return (
      <VStack gap={4}>
        {top}
        <Card padding={0}>
          {toolbar}
          {list}
        </Card>
      </VStack>
    );
  }
  return <Panes top={top} toolbar={toolbar} list={list} pane={pane} listRef={listRef} />;
}
