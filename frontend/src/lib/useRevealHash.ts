import { useEffect } from "react";
import { useLocation } from "react-router";

/** The element an address's hash names ("#krav-K12"), or null. */
export function hashTarget(hash: string): HTMLElement | null {
  if (hash.length < 2) return null;
  let id: string;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    return null;
  }
  return document.getElementById(id);
}

/** Scrolls an element into view and gives it the focus, making it focusable from script when it is not. */
export function revealElement(element: HTMLElement) {
  if (!element.hasAttribute("tabindex") && element.tabIndex < 0) element.setAttribute("tabindex", "-1");
  element.scrollIntoView?.({ block: "start" });
  element.focus({ preventScroll: true });
}

/**
 * Scrolls to the element an in-app link's hash names and moves the focus there, so keyboard and screen-reader users
 * land where the link pointed (WCAG 2.4.3). The router changes the address without scrolling; a section that hides
 * the element (CollapsibleSection) opens itself first, in its own effect, which runs before this one.
 */
export function useRevealHash() {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const frame = requestAnimationFrame(() => {
      const element = hashTarget(hash);
      if (element) revealElement(element);
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, pathname]);
}
