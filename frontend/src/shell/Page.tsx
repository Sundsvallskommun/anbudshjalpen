import { Heading } from "@astryxdesign/core/Heading";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router";

const APP_NAME = "Anbudsklar";

/** Sets the window title: "<page> – Anbudsklar". */
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

/**
 * The common page frame: a capped column (960 px suits mixed content, 640 forms and prose), the page
 * heading, an optional lead paragraph and the content. The page owns its padding (the shell has none),
 * so the content line is the same at every width.
 */
export function Page({
  title,
  heading,
  intro,
  width = 960,
  children,
}: {
  title: string;
  /** What the h1 says, when it differs from the window title. */
  heading?: string;
  intro?: ReactNode;
  width?: 640 | 760 | 960;
  children?: ReactNode;
}) {
  usePageTitle(title);
  return (
    <Layout height="auto" contentWidth={width} padding={4}>
      <LayoutContent isScrollable={false}>
        <VStack gap={6}>
          <VStack gap={2}>
            <PageHeading>{heading ?? title}</PageHeading>
            {typeof intro === "string" ? <Text color="secondary">{intro}</Text> : intro}
          </VStack>
          {children}
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
