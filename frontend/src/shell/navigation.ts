/**
 * The frame's navigation rules (direction.md, section 3): three main choices per role, where each role lands, and
 * which pages are detail pages that get a back link instead of the choices on a phone. Pure functions, so the
 * rules are tested without rendering.
 */
import type { ChecklistAdminItem, Role } from "../api/types";

export interface NavEntry {
  key: "start" | "inkop" | "upphandlingar" | "regelhjalpen";
  label: string;
  href: string;
}

const START: NavEntry = { key: "start", label: "Start", href: "/start" };
const BUYER: NavEntry = { key: "inkop", label: "Inköp", href: "/inkop" };
const NOTICES: NavEntry = { key: "upphandlingar", label: "Upphandlingar", href: "/upphandlingar" };
const RULES: NavEntry = { key: "regelhjalpen", label: "Regelhjälpen", href: "/regelhjalpen" };

/** Företagare: Start · Upphandlingar · Regelhjälpen. Inköpare: Inköp · Upphandlingar · Regelhjälpen. Others: two. */
export function mainNav(role: Role | null): NavEntry[] {
  if (role === "foretagare") return [START, NOTICES, RULES];
  if (role === "inkopare") return [BUYER, NOTICES, RULES];
  return [NOTICES, RULES];
}

/** Whether an entry is the current section: a page or any page below it ("/upphandlingar/…" is Upphandlingar). */
export function isNavSelected(entry: NavEntry, pathname: string): boolean {
  return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}

/** Where a role starts: företagare on Start, inköpare in Inköp, visitors among the notices. */
export function homePath(role: Role | null): string {
  if (role === "foretagare") return START.href;
  if (role === "inkopare") return BUYER.href;
  return NOTICES.href;
}

export interface BackLink {
  label: string;
  href: string;
}

/**
 * The back link a phone shows instead of the main choices on a detail page ("‹ Upphandlingar"); null on the pages the
 * main choices lead to, where the choices are shown.
 */
export function backLink(pathname: string, role: Role | null): BackLink | null {
  if (/^\/upphandlingar\/[^/]+/u.test(pathname)) return { label: NOTICES.label, href: NOTICES.href };
  if (/^\/inkop\/.+/u.test(pathname)) return { label: BUYER.label, href: BUYER.href };
  if (pathname === "/profil" || pathname === "/paminnelser") {
    const home = mainNav(role)[0] ?? NOTICES;
    return { label: home.label, href: home.href };
  }
  return null;
}

/** The checklists inköp has to act on: drafts to review and approved ones not yet published. */
export function toReviewCount(items: readonly Pick<ChecklistAdminItem, "status">[]): number {
  return items.filter((item) => item.status === "draft" || item.status === "approved").length;
}

/** "AB" for Anna Berg: up to two initials for the avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]!, parts.at(-1)!] : parts;
  return letters.map((part) => part[0]!.toLocaleUpperCase("sv")).join("");
}
