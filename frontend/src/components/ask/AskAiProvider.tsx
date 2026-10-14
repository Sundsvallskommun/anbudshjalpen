import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useSearchParams } from "react-router";
import { useAsk, useSession } from "../../api/queries";
import type { NoticeDetail } from "../../api/types";
import { errorMessage } from "../states";
import {
  GENERAL_PLACE,
  historyOf,
  latestRulesSession,
  loadConversations,
  nextTurnId,
  noticePlace,
  placeKey,
  saveConversations,
  type AskPlace,
  type Conversations,
  type Turn,
} from "./askAiState";

export interface OpenOptions {
  /** A question to put in the writing field, as "Fråga om kravet" hands one over. */
  question?: string;
}

export interface AskAiApi {
  isOpen: boolean;
  /** Where the conversation is held: the notice page the reader is on, or everywhere else. */
  place: AskPlace;
  /** The notice of the page the reader is on, if any: its documents are then a subject the backend can pick. */
  notice: NoticeDetail | null;
  /** Whether the profile is a subject too: the reader is signed in as a company (decision 0025). */
  canEditProfile: boolean;
  /** The conversation at the current place, oldest first. */
  turns: readonly Turn[];
  conversations: Conversations;
  draft: string;
  isPending: boolean;
  /** Whether the writing field should take the focus when the panel opens (a question was handed over). */
  focusField: boolean;
  open: (options?: OpenOptions) => void;
  close: () => void;
  toggle: () => void;
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
 * Owns the "Fråga AI" panel (decision 0014): whether it is open, where the reader is and every conversation, so the
 * panel is the same wherever it is opened from and a conversation follows the reader between pages. The reader never
 * picks what a question is about: every question goes to one endpoint, and the backend answers it from the documents,
 * the rules or the profile (decision 0026). Mounted once in AppProviders, inside the router and the query client. The
 * conversations are kept in session storage (`askAiState`); each question, with the conversation's earlier turns as
 * history, is the only thing that leaves the browser.
 */
export function AskAiProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversations>(() => loadConversations());
  const [notice, setNoticeState] = useState<NoticeDetail | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [focusField, setFocusField] = useState(false);
  const nextId = useRef<number | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const send = useAsk();
  const user = useSession().data?.user;
  const canEditProfile = user?.role === "foretagare" && user.company !== null;

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  const place = useMemo<AskPlace>(() => (notice ? noticePlace(notice.id) : GENERAL_PLACE), [notice]);
  const key = placeKey(place);
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
      const targetKey = key;
      const earlier = conversations[targetKey] ?? [];
      nextId.current ??= nextTurnId(conversations);
      const id = nextId.current++;
      setConversations((previous) => ({
        ...previous,
        [targetKey]: [...(previous[targetKey] ?? []), { id, question: text, answer: null, rules: null, profile: null, error: null }],
      }));
      send.mutate(
        {
          question: text,
          notice_id: place.kind === "notice" ? place.noticeId : null,
          history: historyOf(earlier),
          rules_session_id: latestRulesSession(earlier),
        },
        {
          onSuccess: (view) => updateTurn(targetKey, id, { answer: view.answer, rules: view.rules, profile: view.profile }),
          onError: (error) => updateTurn(targetKey, id, { error: errorMessage(error) }),
        },
      );
    },
    [key, place, conversations, send, updateTurn],
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

  const open = useCallback((options: OpenOptions = {}) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (options.question !== undefined) setDraft(options.question);
    setFocusField(options.question !== undefined);
    setIsOpen(true);
  }, []);

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

  const api = useMemo<AskAiApi>(
    () => ({
      isOpen,
      place,
      notice,
      canEditProfile,
      turns,
      conversations,
      draft,
      isPending: send.isPending,
      focusField,
      open,
      close,
      toggle,
      setDraft,
      ask,
      retry,
      clear,
      openerRef,
      setNotice: setNoticeState,
    }),
    [isOpen, place, notice, canEditProfile, turns, conversations, draft, send.isPending, focusField, open, close, toggle, ask, retry, clear],
  );

  return <AskAiContext value={api}>{children}</AskAiContext>;
}

/** The panel's state and actions. Throws outside AskAiProvider, which AppProviders always mounts. */
export function useAskAi(): AskAiApi {
  const api = use(AskAiContext);
  if (!api) throw new Error("useAskAi needs AskAiProvider (AppProviders mounts it)");
  return api;
}

/** A notice page's notice is the panel's place, and its documents a subject, while the page is shown. */
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
    open(question !== null ? { question } : {});
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(QUESTION_PARAM);
        if (next.get("flik") === OLD_STEP) next.delete("flik");
        return next;
      },
      { replace: true },
    );
    // Runs once per requested question, on the page whose notice the panel then follows.
  }, [noticeId, wantsPanel, question]);
}
