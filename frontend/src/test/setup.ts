import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { VISITOR, WELCOMED_KEY } from "../components/ask/askAiState";
import { buyerUser, companyUser, labUser } from "./fixtures";

// A CI runner is slower than a laptop: inköp's review table takes over a second to render there. findBy* and waitFor
// wait up to 3 s instead of 1; a passing test still moves on as soon as its element is there.
configure({ asyncUtilTimeout: 3000 });

// jsdom lacks a few browser APIs the design system calls on mount; minimal stand-ins keep components
// rendering. Nothing here changes behaviour under test.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom has <dialog> but not its modal methods.
HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
  this.open = false;
  this.dispatchEvent(new Event("close"));
};

// "Fråga AI" opens by itself once per user and browser with its welcome. Every fixture user, and a visitor, counts as
// welcomed, so a test sees the page as a returning reader does; the welcome's own tests clear this.
beforeEach(() => {
  window.localStorage.setItem(WELCOMED_KEY, JSON.stringify([VISITOR, companyUser.id, buyerUser.id, labUser.id]));
});

afterEach(() => {
  cleanup();
});
