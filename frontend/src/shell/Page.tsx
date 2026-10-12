import { BreadcrumbItem, Breadcrumbs } from "@astryxdesign/core/Breadcrumbs";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router";
import { useIsPhone } from "../lib/usePhone";
import styles from "./Page.module.css";

const APP_NAME = "Anbudshjälpen";
/** The page's side gutter (16 px, --spacing-4): Layout pads inside its content width, so the width includes it. */
const GUTTERS = 2 * 16;

/** Sets the window title: "<page> – Anbudshjälpen". */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} – ${APP_NAME}` : APP_NAME;
  }, [title]);
}

/**
 * The page's one h1. After a client-side navigation it takes the focus, so keyboard and screen-reader
 * users start at the new page's heading instead of wherever the old page left them. The first page load
 * keeps the browser's own start (React Router's initial location has the key "default").
 */
export function PageHeading({ children }: { children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const { key, pathname } = useLocation();

  // Runs per page (pathname), not when the page changes its own search parameters (filters, tabs), so a
  // user typing in a search field keeps the focus there.
  useEffect(() => {
    if (key !== "default") ref.current?.focus();
  }, [pathname]);

  return (
    <Heading level={1} ref={ref} tabIndex={-1} data-page-heading="">
      {children}
    </Heading>
  );
}

export interface Crumb {
  label: string;
  href: string;
}

/**
 * The page widths: 640 for forms and prose, 760 for one column of content, 960 mixed, 1 152 the full container, and
 * 1 344 the workspace (inköp's review table, --layout-workspace), which the demo strip, the top bar and the foot then
 * follow (app.css).
 */
export type PageWidth = 640 | 760 | 960 | 1152 | 1344;

export interface PageProps {
  /** The window title, and the h1 unless `heading` says otherwise. */
  title: string;
  /** What the h1 says, when it differs from the window title. */
  heading?: string;
  /** A short line above the h1 ("Granska checklista"). */
  eyebrow?: string;
  /** The way up, above the h1 on wider screens ("Upphandlingar › …"); a phone shows a back link in the header. */
  breadcrumbs?: readonly Crumb[];
  /** A lead paragraph, or any content, under the h1: the meta line and tokens of a detail page. */
  intro?: ReactNode;
  /** Actions at the end of the heading row, such as "Ny upphandling". */
  actions?: ReactNode;
  width?: PageWidth;
  /** A rail beside the content on wide screens (360 px), below it on narrow ones. */
  rail?: ReactNode;
  /** The rail's name as a complementary landmark ("Mer om upphandlingen"). */
  railLabel?: string;
  children?: ReactNode;
}

function PageBreadcrumbs({ crumbs, current }: { crumbs: readonly Crumb[]; current: string }) {
  return (
    <Breadcrumbs label="Du är här" variant="supporting" separator="›">
      {crumbs.map((crumb) => (
        <BreadcrumbItem key={crumb.href} href={crumb.href}>
          {crumb.label}
        </BreadcrumbItem>
      ))}
      <BreadcrumbItem isCurrent>{current}</BreadcrumbItem>
    </Breadcrumbs>
  );
}

/**
 * The common page frame on the body grey: the container (1 152 px by default, 16 px gutters on a phone), the page's
 * header (breadcrumbs, eyebrow, the one h1, actions, intro) and the content, with an optional rail. The page owns
 * its padding (the shell has none), so the content line is the same at every width.
 */
export function Page({
  title,
  heading,
  eyebrow,
  breadcrumbs,
  intro,
  actions,
  width = 1152,
  rail,
  railLabel = "Mer på sidan",
  children,
}: PageProps) {
  usePageTitle(title);
  const isPhone = useIsPhone();
  const h1 = heading ?? title;
  return (
    <Layout height="auto" contentWidth={width + GUTTERS} padding={4}>
      <LayoutContent isScrollable={false}>
        {/* The width is said in the markup for the frame: the workspace widens the frame's content line (app.css). */}
        <VStack gap={6} paddingBlockStart={isPhone ? 1 : 4} paddingBlockEnd={6} data-page-width={width}>
          <VStack gap={2}>
            {breadcrumbs && breadcrumbs.length > 0 && !isPhone && <PageBreadcrumbs crumbs={breadcrumbs} current={h1} />}
            {eyebrow && (
              <Text type="supporting" weight="semibold">
                {eyebrow}
              </Text>
            )}
            <HStack gap={3} vAlign="end" hAlign="between" wrap="wrap">
              <PageHeading>{h1}</PageHeading>
              {actions && (
                <HStack gap={2} wrap="wrap">
                  {actions}
                </HStack>
              )}
            </HStack>
            {typeof intro === "string" ? <Text color="secondary">{intro}</Text> : intro}
          </VStack>
          {rail ? (
            <HStack className={styles.columns}>
              <VStack gap={6} className={styles.main}>
                {children}
              </VStack>
              <VStack as="aside" aria-label={railLabel} gap={4}>
                {rail}
              </VStack>
            </HStack>
          ) : (
            children
          )}
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
