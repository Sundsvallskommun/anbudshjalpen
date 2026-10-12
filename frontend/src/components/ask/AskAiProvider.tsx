import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useSearchParams } from "react-router";
import { useAskQuestion, useAskRules } from "../../api/queries";
import type { NoticeDetail } from "../../api/types";
import { errorMessage } from "../states";
import {
  historyOf,
  latestRulesSession,
  loadConversations,
  nextTurnId,
  noticeScope,
  RULES_SCOPE,
  saveConversations,
  scopeKey,
  type AskScope,
  type Conversations,
  type Turn,
} from "./askAiState";

export interface OpenOptions {
  /** A question to put in the writing field, as "Fråga om kravet" hands one over. */
  question?: string;
  /** What to ask about. By default the notice on the page, else the rules. */
  scope?: AskScope;
}

export interface AskAiApi {
  isOpen: boolean;
  scope: AskScope;
  /** The notice of the page the reader is on, if any: the subject the panel offers first. */
  notice: NoticeDetail | null;
  /** The conversation about the current subject, oldest first. */
  turns: readonly Turn[];
  conversations: Conversations;
  draft: string;
  isPending: boolean;
  /** Whether the writing field should take the focus when the panel opens (a question was handed over). */
  focusField: boolean;
  open: (options?: OpenOptions) => void;
  close: () => void;
  toggle: () => void;
  chooseScope: (scope: AskScope) => void;
  setDraft: (draft: string) => void;
  ask: (question: string) => void;
  retry: (turnId: number) => void;
  clear: () => void;
  /** The control that opened the panel, for returning the focus. */
  openerRef: RefObject<HTMLElement | null>;
  /** A notice page registers its notice while it is shown, and unregisters it when it leaves. */
  setNotice: (notice: NoticeDetail | null) => void;
}

const AskAiContext = createContext<AskAiApi | null>(null);

/** The address parameter that hands a question to the panel on a notice page ("?fraga=…"). */
export const QUESTION_PARAM = "fraga";
/** The old step's address (`?flik=fraga`), which still opens the panel. */
const OLD_STEP = "fraga";

/**
 * Owns the "Fråga AI" panel (decision 0014): whether it is open, what it is about and every conversation, so the
 * panel is the same wherever it is opened from and a conversation follows the reader between pages. Mounted once in
 * AppProviders, inside the router and the query client. The conversations are kept in session storage
 * (`askAiState`); each question is the only thing that leaves the browser.
 */
export function AskAiProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversations>(() => loadConversations());
  const [notice, setNoticeState] = useState<NoticeDetail | null>(null);
  const [scope, setScope] = useState<AskScope>(RULES_SCOPE);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [focusField, setFocusField] = useState(false);
  const nextId = useRef<number | null>(null);
  const noticeId = useRef<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const askNotice = useAskQuestion(scope.kind === "notice" ? scope.noticeId : "");
  const askRules = useAskRules();

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  const key = scopeKey(scope);
  const turns = conversations[key] ?? [];

  const updateTurn = useCallback((inKey: string, id: number, changes: Partial<Turn>) => {
    setConversations((previous) => ({
      ...previous,
      [inKey]: (previous[inKey] ?? []).map((turn) => (turn.id === id ? { ...turn, ...changes } : turn)),
    }));
  }, []);

  const ask = useCallback(
    (question: string) => {
      const text = question.trim();
      if (!text) return;
      const target = scope;
      const targetKey = scopeKey(target);
      const earlier = conversations[targetKey] ?? [];
      nextId.current ??= nextTurnId(conversations);
      const id = nextId.current++;
      setConversations((previous) => ({
        ...previous,
        [targetKey]: [...(previous[targetKey] ?? []), { id, question: text, answer: null, rules: null, error: null }],
      }));
      const fail = (error: unknown) => updateTurn(targetKey, id, { error: errorMessage(error) });
      if (target.kind === "notice") {
        askNotice.mutate(
          { question: text, history: historyOf(earlier) },
          { onSuccess: (view) => updateTurn(targetKey, id, { answer: view }), onError: fail },
        );
      } else {
        askRules.mutate(
          { question: text, session_id: latestRulesSession(earlier) },
          { onSuccess: (view) => updateTurn(targetKey, id, { rules: view }), onError: fail },
        );
      }
    },
    [scope, conversations, askNotice, askRules, updateTurn],
  );

  const retry = useCallback(
    (turnId: number) => {
      const turn = turns.find((candidate) => candidate.id === turnId);
      if (!turn) return;
      setConversations((previous) => ({ ...previous, [key]: (previous[key] ?? []).filter((candidate) => candidate.id !== turnId) }));
      ask(turn.question);
    },
    [turns, key, ask],
  );

  const open = useCallback(
    (options: OpenOptions = {}) => {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      let wanted = options.scope ?? scope;
      // A conversation about another notice than the page's is not what the reader asks about here.
      if (!options.scope && wanted.kind === "notice" && wanted.noticeId !== notice?.id) {
        wanted = notice ? noticeScope(notice.id) : RULES_SCOPE;
      }
      setScope(wanted);
      if (options.question !== undefined) setDraft(options.question);
      setFocusField(options.question !== undefined);
      setIsOpen(true);
    },
    [notice, scope],
  );

  const close = useCallback(() => {
    setIsOpen(false);
    const opener = openerRef.current;
    requestAnimationFrame(() => opener?.focus());
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) close();
    else open();
  }, [isOpen, close, open]);

  const clear = useCallback(() => {
    setConversations((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }, [key]);

  const setNotice = useCallback((next: NoticeDetail | null) => {
    const nextId = next?.id ?? null;
    if (nextId !== noticeId.current) {
      noticeId.current = nextId;
      // A new page: its notice is the subject; leaving a notice falls back to the rules.
      setScope((current) => (next ? noticeScope(next.id) : current.kind === "notice" ? RULES_SCOPE : current));
    }
    setNoticeState(next);
  }, []);

  const api = useMemo<AskAiApi>(
    () => ({
      isOpen,
      scope,
      notice,
      turns,
      conversations,
      draft,
      isPending: askNotice.isPending || askRules.isPending,
      focusField,
      open,
      close,
      toggle,
      chooseScope: setScope,
      setDraft,
      ask,
      retry,
      clear,
      openerRef,
      setNotice,
    }),
    [isOpen, scope, notice, turns, conversations, draft, askNotice.isPending, askRules.isPending, focusField, open, close, toggle, ask, retry, clear, setNotice],
  );

  return <AskAiContext value={api}>{children}</AskAiContext>;
}

/** The panel's state and actions. Throws outside AskAiProvider, which AppProviders always mounts. */
export function useAskAi(): AskAiApi {
  const api = use(AskAiContext);
  if (!api) throw new Error("useAskAi needs AskAiProvider (AppProviders mounts it)");
  return api;
}

/** A notice page's notice is the panel's subject while the page is shown. */
export function useRegisterNotice(notice: NoticeDetail) {
  const { setNotice } = useAskAi();
  useEffect(() => {
    setNotice(notice);
    return () => setNotice(null);
  }, [notice, setNotice]);
}

/**
 * Opens the panel that a notice page's address asks for: `?fraga=…` with the question in the writing field ("Fråga om
 * kravet" opened in a new tab), or the old step's `?flik=fraga`. The parameters are taken out of the address once the
 * panel is open, so going back or reloading does not open it again.
 */
export function useAskDeepLink(notice: NoticeDetail | undefined) {
  const [params, setParams] = useSearchParams();
  const { open } = useAskAi();
  const question = params.get(QUESTION_PARAM);
  const wantsPanel = question !== null || params.get("flik") === OLD_STEP;
  const noticeId = notice?.id;

  useEffect(() => {
    if (!noticeId || !wantsPanel) return;
    open({ scope: noticeScope(noticeId), ...(question !== null ? { question } : {}) });
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(QUESTION_PARAM);
        if (next.get("flik") === OLD_STEP) next.delete("flik");
        return next;
      },
      { replace: true },
    );
    // Runs once per requested question; `open` changes with the page's notice, which is what it should follow.
  }, [noticeId, wantsPanel, question]);
}
