/**
 * TanStack Query hooks, one per endpoint. Pages read server state only through these, so caching,
 * invalidation and query keys live in one place.
 */
import { queryOptions, useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api, withQuery } from "./client";
import type {
  AnswerView,
  AppConfig,
  AiUsageView,
  AppSettingsSaved,
  AppSettingsUpdate,
  AppSettingsView,
  ChecklistAdminItem,
  ChecklistStatus,
  ChecklistUpdate,
  ChecklistView,
  CompanyUpdate,
  CompanyView,
  CpvHit,
  CpvSuggestionRequest,
  CpvSuggestionView,
  DocumentInfo,
  GateRequest,
  InsightItem,
  InterpretationView,
  JobName,
  JobRunView,
  LabCreateRequest,
  LabLoginRequest,
  LoginRequest,
  MatchingStatus,
  MatchView,
  NoticeBuyers,
  NoticeCreate,
  NoticeDetail,
  NoticeList,
  NoticeSort,
  NoticeStatus,
  PageView,
  ProfileSaved,
  ReadingReport,
  QuestionRequest,
  RejectRequest,
  ReminderRequest,
  ReminderView,
  ReviewView,
  Role,
  RulesRequest,
  RulesView,
  SessionView,
  SupplierMatch,
  SupplierSearch,
  UpcomingProcurement,
  Uuid,
} from "./types";

export interface NoticeFilters {
  q?: string;
  status?: NoticeStatus;
  source?: string;
  /** CPV prefixes, comma-separated (e.g. the profile's codes for "Visa bara det som passar er"). */
  cpv?: string;
  /** A buyer, or part of its name: matches every notice whose buyer contains it, whatever its case. */
  buyer?: string;
  /** Leave out for the backend's default: soonest deadline first for open notices, else newest (or best match). */
  sort?: NoticeSort;
  limit: number;
  offset: number;
}

/** The list's filters that the buyer choices are counted with (everything but the buyer itself and the paging). */
export type BuyerFilters = Pick<NoticeFilters, "q" | "status" | "source" | "cpv">;

export const keys = {
  config: ["config"] as const,
  session: ["session"] as const,
  notices: (filters: NoticeFilters) => ["notices", filters] as const,
  /** Under "notices", so whatever refetches the lists refetches the buyer choices too. */
  noticeBuyers: (filters: BuyerFilters) => ["notices", "buyers", filters] as const,
  notice: (id: string) => ["notice", id] as const,
  page: (noticeId: string, documentId: string, page: number) => ["page", noticeId, documentId, page] as const,
  reading: (noticeId: string) => ["notice", noticeId, "reading"] as const,
  matches: ["matches"] as const,
  matchingStatus: ["matches", "status"] as const,
  upcoming: (months: number) => ["upcoming", months] as const,
  profile: ["profile"] as const,
  reminders: ["reminders"] as const,
  adminChecklists: (status: ChecklistStatus | "all") => ["admin", "checklists", status] as const,
  adminChecklist: (id: string) => ["admin", "checklist", id] as const,
  insights: ["admin", "insights"] as const,
  interpretations: ["admin", "interpretations"] as const,
  jobs: ["admin", "jobs"] as const,
  aiUsage: (days: number) => ["admin", "ai-usage", days] as const,
  appSettings: ["admin", "settings"] as const,
};

// --- Session and configuration -----------------------------------------------------------------

export function useConfig() {
  return useQuery({ queryKey: keys.config, queryFn: () => api.get<AppConfig>("/api/config"), staleTime: Infinity });
}

/**
 * Whether inköp reviews checklists now (decision 0017). With the review off, "granskad" tells a company nothing, so
 * the words leave it out. Until the config is here, the review counts as on: the words that were always shown.
 */
export function useReviewRequired(): boolean {
  return useConfig().data?.review_required ?? true;
}

export function useSession() {
  return useQuery({ queryKey: keys.session, queryFn: () => api.get<SessionView>("/api/session") });
}

/** Everything a user sees depends on who they are, so a login or logout refetches it all. */
async function resetForNewUser(client: QueryClient, session: SessionView | undefined) {
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== "config" });
  if (session) client.setQueryData(keys.session, session);
  await client.invalidateQueries({ queryKey: keys.session });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (persona: Role) =>
      api.post<SessionView | undefined>("/api/session/login", { persona } satisfies LoginRequest),
    onSuccess: (session) => resetForNewUser(client, session),
  });
}

/** The access code that gates the service (decision 0010): once in, everything is fetched anew. */
export function useEnterGate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post<unknown>("/api/gate", { code } satisfies GateRequest),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.config });
      await resetForNewUser(client, undefined);
    },
  });
}

/** Lab mode (decision 0010): a company of the participant's own, behind the gate. */
export function useCreateLabCompany() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: LabCreateRequest) => api.post<SessionView | undefined>("/api/lab/companies", body),
    onSuccess: (session) => resetForNewUser(client, session),
  });
}

/** Signs the participant in as a lab company picked on the login page. */
export function useLabLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (companyId: Uuid) =>
      api.post<SessionView | undefined>("/api/lab/sessions", { company_id: companyId } satisfies LabLoginRequest),
    onSuccess: (session) => resetForNewUser(client, session),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<unknown>("/api/session/logout"),
    onSuccess: () => resetForNewUser(client, undefined),
  });
}

// --- Notices -----------------------------------------------------------------------------------

export function useNotices(filters: NoticeFilters) {
  return useQuery({
    queryKey: keys.notices(filters),
    queryFn: () => api.get<NoticeList>(withQuery("/api/notices", { ...filters })),
    placeholderData: (previous) => previous,
  });
}

/**
 * The buyers for the list's "Fler filter", each with how many notices filtering on it lists. Pass the list's current
 * filters: the counts follow them, so a buyer never promises notices the list will not show. Only `q`, `status`,
 * `source` and `cpv` are read, so paging, sorting and the chosen buyer do not refetch the choices.
 */
export function useNoticeBuyers({ q, status, source, cpv }: BuyerFilters) {
  const filters: BuyerFilters = { q, status, source, cpv };
  return useQuery({
    queryKey: keys.noticeBuyers(filters),
    queryFn: () => api.get<NoticeBuyers>(withQuery("/api/notices/buyers", { ...filters })),
    placeholderData: (previous) => previous,
  });
}

/** One notice; waits while `id` is still unknown (empty). */
/** How often a notice page asks again while its checklist is on its way: the worker interprets every five minutes. */
const CHECKLIST_POLL_MS = 15_000;

/** A notice whose first checklist the worker is about to make (decision 0019): the page shows it when it comes. */
function isChecklistComing(notice: NoticeDetail | undefined): boolean {
  return notice !== undefined && notice.checklist === null && notice.checklist_progress !== null;
}

export function useNotice(id: string) {
  return useQuery({
    queryKey: keys.notice(id),
    queryFn: () => api.get<NoticeDetail>(`/api/notices/${id}`),
    enabled: id !== "",
    // Asked again now and then while a checklist is on its way, so the steps appear without the reader doing anything.
    refetchInterval: (query) => (isChecklistComing(query.state.data) ? CHECKLIST_POLL_MS : false),
  });
}

/** The demo's trace of a notice's files ("Så lästes underlaget"); asked for only while the switch is on. */
export function useReadingReport(noticeId: string) {
  return useQuery({
    queryKey: keys.reading(noticeId),
    queryFn: () => api.get<ReadingReport>(`/api/notices/${noticeId}/reading`),
    enabled: noticeId !== "",
  });
}

/** A document page never changes once extracted, so it is fetched once and shared by everything that shows it. */
function pageQuery(noticeId: string, documentId: string, page: number) {
  return queryOptions({
    queryKey: keys.page(noticeId, documentId, page),
    queryFn: () => api.get<PageView>(`/api/notices/${noticeId}/documents/${documentId}/pages/${page}`),
    staleTime: Infinity,
  });
}

export function usePage(noticeId: string, documentId: string, page: number) {
  return useQuery(pageQuery(noticeId, documentId, page));
}

/**
 * Several pages of one document at once, e.g. every page a checklist cites. The results come in the order of `pages`,
 * one per entry, and share their cache with `usePage`.
 */
export function usePages(noticeId: string, documentId: string, pages: readonly number[]) {
  return useQueries({ queries: pages.map((page) => pageQuery(noticeId, documentId, page)) });
}

export function documentFileUrl(documentId: string): string {
  return `/api/documents/${documentId}/file`;
}

// --- Questions, review and reminders -----------------------------------------------------------

export function useAskQuestion(noticeId: string) {
  return useMutation({
    mutationFn: (request: QuestionRequest) => api.post<AnswerView>(`/api/notices/${noticeId}/questions`, request),
  });
}

export function useReviewDraft(noticeId: string) {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post<ReviewView>(`/api/notices/${noticeId}/review`, form);
    },
  });
}

export function useReminders() {
  return useQuery({ queryKey: keys.reminders, queryFn: () => api.get<ReminderView[]>("/api/reminders") });
}

export function useCreateReminder(noticeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: ReminderRequest) => api.post<ReminderView>(`/api/notices/${noticeId}/reminders`, request),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.reminders }),
  });
}

export function useDeleteReminder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/reminders/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.reminders }),
  });
}

// --- Profile, CPV, matches and upcoming procurements -------------------------------------------

export function useProfile() {
  return useQuery({ queryKey: keys.profile, queryFn: () => api.get<CompanyView>("/api/profile") });
}

/**
 * Saves the profile. The answer also says how many open notices seem to fit it now (`fitting_notices`, for "Profilen
 * är sparad · 2 upphandlingar verkar passa er"); it is null when the matches are re-assessed after the answer (a
 * language model), and then Start has them a little later. The fit shown in lists and on notices may change too.
 */
export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (update: CompanyUpdate) => api.put<ProfileSaved>("/api/profile", update),
    onSuccess: async (saved) => {
      const { fitting_notices: _count, ...profile } = saved;
      client.setQueryData<CompanyView>(keys.profile, profile);
      await Promise.all([
        client.invalidateQueries({ queryKey: keys.matches, exact: true }),
        client.invalidateQueries({ queryKey: keys.matchingStatus }),
        client.invalidateQueries({ queryKey: ["notices"] }),
        client.invalidateQueries({ queryKey: ["notice"] }),
      ]);
    },
  });
}

export function useSuggestCpv() {
  return useMutation({
    mutationFn: (description: string) =>
      api.post<CpvSuggestionView>("/api/profile/cpv-suggestions", { description } satisfies CpvSuggestionRequest),
  });
}

export function searchCpv(q: string): Promise<CpvHit[]> {
  return api.get<CpvHit[]>(withQuery("/api/cpv", { q }));
}

export function useMatches() {
  return useQuery({ queryKey: keys.matches, queryFn: () => api.get<MatchView[]>("/api/matches") });
}

/** How often a page asks whether the re-assessment is done: a language model takes 10–30 s per notice. */
export const MATCHING_STATUS_POLL_MS = 3000;

/**
 * Whether the company's matches are being re-assessed right now (after a profile save with a language model). Polls
 * while they are, and fetches the matches anew once the run is done, so the cards appear without a reload.
 */
export function useMatchingStatus() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: keys.matchingStatus,
    queryFn: () => api.get<MatchingStatus>("/api/matches/status"),
    refetchInterval: (query) => (query.state.data?.is_assessing ? MATCHING_STATUS_POLL_MS : false),
  });
  const isAssessing = query.data?.is_assessing ?? false;
  const wasAssessing = useRef(false);
  useEffect(() => {
    if (wasAssessing.current && !isAssessing) {
      void client.invalidateQueries({ queryKey: keys.matches, exact: true });
      void client.invalidateQueries({ queryKey: ["notices"] });
      void client.invalidateQueries({ queryKey: ["notice"] });
    }
    wasAssessing.current = isAssessing;
  }, [client, isAssessing]);
  return isAssessing;
}

/** "Inte intressant": the match leaves the list (and gets no "Ny träff" mail). Undo with `useRestoreMatch`. */
export function useDismissMatch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<unknown>(`/api/matches/${id}/dismiss`),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.matches }),
  });
}

/** "Ångra" after "Inte intressant": the match is listed again while it still fits the profile. */
export function useRestoreMatch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<unknown>(`/api/matches/${id}/restore`),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.matches }),
  });
}

export function useUpcoming(months: number) {
  return useQuery({
    queryKey: keys.upcoming(months),
    queryFn: () => api.get<UpcomingProcurement[]>(withQuery("/api/upcoming", { months })),
  });
}

// --- Rules help --------------------------------------------------------------------------------

export function useAskRules() {
  return useMutation({ mutationFn: (request: RulesRequest) => api.post<RulesView>("/api/rules/ask", request) });
}

// --- Buyer (inköpare) --------------------------------------------------------------------------

export function useAdminChecklists(status: ChecklistStatus | "all") {
  return useQuery({
    queryKey: keys.adminChecklists(status),
    queryFn: () =>
      api.get<ChecklistAdminItem[]>(withQuery("/api/admin/checklists", { status: status === "all" ? null : status })),
  });
}

export function useAdminChecklist(id: string) {
  return useQuery({
    queryKey: keys.adminChecklist(id),
    queryFn: () => api.get<ChecklistView>(`/api/admin/checklists/${id}`),
  });
}

/** After a buyer changes a checklist: show the new version and refetch what lists or shows it. */
function useChecklistMutation<TArg>(id: string, send: (arg: TArg) => Promise<ChecklistView>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: async (view) => {
      client.setQueryData(keys.adminChecklist(id), view);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin", "checklists"] }),
        client.invalidateQueries({ queryKey: keys.notice(view.notice_id) }),
        client.invalidateQueries({ queryKey: ["notices"] }),
      ]);
    },
  });
}

export function useUpdateChecklist(id: string) {
  return useChecklistMutation(id, (update: ChecklistUpdate) =>
    api.put<ChecklistView>(`/api/admin/checklists/${id}`, update),
  );
}

/** Only a draft can be approved; the backend answers 409 with a Swedish message for any other status. */
export function useApproveChecklist(id: string) {
  return useChecklistMutation(id, () => api.post<ChecklistView>(`/api/admin/checklists/${id}/approve`));
}

export function usePublishChecklist(id: string) {
  return useChecklistMutation(id, () => api.post<ChecklistView>(`/api/admin/checklists/${id}/publish`));
}

export function useRejectChecklist(id: string) {
  return useChecklistMutation(id, (note: string) =>
    api.post<ChecklistView>(`/api/admin/checklists/${id}/reject`, { note } satisfies RejectRequest),
  );
}

/** Takes a published checklist away from companies, with the reason; it can be corrected and published again. */
export function useWithdrawChecklist(id: string) {
  return useChecklistMutation(id, (note: string) =>
    api.post<ChecklistView>(`/api/admin/checklists/${id}/withdraw`, { note } satisfies RejectRequest),
  );
}

/**
 * "Öppna som utkast igen": a rejected or withdrawn checklist becomes a draft that can be corrected and approved. The
 * reviewer's note (why it was rejected) is kept until the buyer saves a new one; 409 for any status but rejected.
 */
export function useReopenChecklist(id: string) {
  return useChecklistMutation(id, () => api.post<ChecklistView>(`/api/admin/checklists/${id}/reopen`));
}

/** How often documents waiting for their first interpretation are checked again. */
export const INTERPRETATION_POLL_MS = 10_000;

/**
 * Documents without a checklist yet: waiting, retrying after a failure, or given up. Polled while one waits, and a
 * document that leaves the list has its draft now, so the review queue is refetched.
 */
export function useInterpretations() {
  const client = useQueryClient();
  return useQuery({
    queryKey: keys.interpretations,
    queryFn: async () => {
      const items = await api.get<InterpretationView[]>("/api/admin/interpretations");
      const previous = client.getQueryData<InterpretationView[]>(keys.interpretations) ?? [];
      if (previous.some((before) => !items.some((item) => item.document_id === before.document_id))) {
        void client.invalidateQueries({ queryKey: ["admin", "checklists"] });
      }
      return items;
    },
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.state === "pending") ? INTERPRETATION_POLL_MS : false,
  });
}

/** Interprets a document again now; the result is a new draft in the review queue (earlier checklists stay). */
export function useInterpretDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      api.post<InterpretationView>(`/api/admin/documents/${documentId}/interpret`),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.interpretations }),
  });
}

export function useCreateNotice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (notice: NoticeCreate) => api.post<NoticeDetail>("/api/admin/notices", notice),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notices"] }),
  });
}

export function useUploadDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ noticeId, file }: { noticeId: string; file: File }) => {
      const form = new FormData();
      form.append("file", file);
      return api.post<DocumentInfo>(`/api/admin/notices/${noticeId}/documents`, form);
    },
    onSuccess: (_document, { noticeId }) =>
      Promise.all([
        client.invalidateQueries({ queryKey: keys.notice(noticeId) }),
        client.invalidateQueries({ queryKey: ["notices"] }),
      ]),
  });
}

export function useInsights() {
  return useQuery({ queryKey: keys.insights, queryFn: () => api.get<InsightItem[]>("/api/admin/insights") });
}

/** Which companies could answer a job inköp is considering (decision 0023): a computation, so a mutation; nothing is stored. */
export function useSearchSuppliers() {
  return useMutation({
    mutationFn: (search: SupplierSearch) => api.post<SupplierMatch[]>("/api/admin/suppliers/search", search),
  });
}

/** How often the jobs list is refetched while a run is going on, so "pågår" turns into the outcome. */
export const JOB_POLL_MS = 3000;
/** A run still marked as running after this long belongs to a process that died (services/jobs.STALE_AFTER). */
const JOB_STALE_MS = 2 * 60 * 60 * 1000;

/** Whether any of the runs is still going on (and not a leftover from a process that died). */
export function hasActiveRun(runs: readonly JobRunView[] | undefined, now: number = Date.now()): boolean {
  return (runs ?? []).some((run) => run.status === "running" && now - Date.parse(run.started_at) < JOB_STALE_MS);
}

/** The latest run of every job that has run, polled while one is running. */
/** The AI engine's calls, tokens and estimated cost over the last `days` days (Drift). */
export function useAiUsage(days: number) {
  return useQuery({
    queryKey: keys.aiUsage(days),
    queryFn: () => api.get<AiUsageView>(withQuery("/api/admin/ai-usage", { days })),
  });
}

/** The settings inköp can change (decision 0011). */
export function useAppSettings() {
  return useQuery({ queryKey: keys.appSettings, queryFn: () => api.get<AppSettingsView>("/api/admin/settings") });
}

export function useUpdateAppSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: AppSettingsUpdate) => api.put<AppSettingsSaved>("/api/admin/settings", body),
    onSuccess: async (saved) => {
      client.setQueryData(keys.appSettings, { review_required: saved.review_required } satisfies AppSettingsView);
      client.setQueryData<AppConfig>(keys.config, (config) =>
        config ? { ...config, review_required: saved.review_required } : config,
      );
      // Turning the review off publishes checklists, so every list that shows them is stale.
      await client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "config" });
    },
  });
}

export function useJobs() {
  return useQuery({
    queryKey: keys.jobs,
    queryFn: () => api.get<JobRunView[]>("/api/admin/jobs"),
    refetchInterval: (query) => (hasActiveRun(query.state.data) ? JOB_POLL_MS : false),
  });
}

export function useRunJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (job: JobName) => api.post<JobRunView>(`/api/admin/jobs/${job}/run`),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.jobs }),
  });
}
