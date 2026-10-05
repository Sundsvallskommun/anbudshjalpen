/**
 * TanStack Query hooks, one per endpoint. Pages read server state only through these, so caching,
 * invalidation and query keys live in one place.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, withQuery } from "./client";
import type {
  AnswerView,
  AppConfig,
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
  InsightItem,
  InterpretationView,
  JobName,
  JobRunView,
  LoginRequest,
  MatchView,
  NoticeCreate,
  NoticeDetail,
  NoticeList,
  NoticeStatus,
  PageView,
  QuestionRequest,
  RejectRequest,
  ReminderRequest,
  ReminderView,
  ReviewView,
  Role,
  RulesRequest,
  RulesView,
  SessionView,
  UpcomingProcurement,
} from "./types";

export interface NoticeFilters {
  q?: string;
  status?: NoticeStatus;
  source?: string;
  cpv?: string;
  limit: number;
  offset: number;
}

export const keys = {
  config: ["config"] as const,
  session: ["session"] as const,
  notices: (filters: NoticeFilters) => ["notices", filters] as const,
  notice: (id: string) => ["notice", id] as const,
  page: (noticeId: string, documentId: string, page: number) => ["page", noticeId, documentId, page] as const,
  matches: ["matches"] as const,
  upcoming: (months: number) => ["upcoming", months] as const,
  profile: ["profile"] as const,
  reminders: ["reminders"] as const,
  adminChecklists: (status: ChecklistStatus | "all") => ["admin", "checklists", status] as const,
  adminChecklist: (id: string) => ["admin", "checklist", id] as const,
  insights: ["admin", "insights"] as const,
  interpretations: ["admin", "interpretations"] as const,
  jobs: ["admin", "jobs"] as const,
};

// --- Session and configuration -----------------------------------------------------------------

export function useConfig() {
  return useQuery({ queryKey: keys.config, queryFn: () => api.get<AppConfig>("/api/config"), staleTime: Infinity });
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

/** One notice; waits while `id` is still unknown (empty). */
export function useNotice(id: string) {
  return useQuery({
    queryKey: keys.notice(id),
    queryFn: () => api.get<NoticeDetail>(`/api/notices/${id}`),
    enabled: id !== "",
  });
}

export function usePage(noticeId: string, documentId: string, page: number) {
  return useQuery({
    queryKey: keys.page(noticeId, documentId, page),
    queryFn: () => api.get<PageView>(`/api/notices/${noticeId}/documents/${documentId}/pages/${page}`),
    staleTime: Infinity,
  });
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

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (update: CompanyUpdate) => api.put<CompanyView>("/api/profile", update),
    onSuccess: async (profile) => {
      client.setQueryData(keys.profile, profile);
      await client.invalidateQueries({ queryKey: keys.matches });
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

export function useDismissMatch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<unknown>(`/api/matches/${id}/dismiss`),
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

/** How often the jobs list is refetched while a run is going on, so "pågår" turns into the outcome. */
export const JOB_POLL_MS = 3000;
/** A run still marked as running after this long belongs to a process that died (services/jobs.STALE_AFTER). */
const JOB_STALE_MS = 2 * 60 * 60 * 1000;

/** Whether any of the runs is still going on (and not a leftover from a process that died). */
export function hasActiveRun(runs: readonly JobRunView[] | undefined, now: number = Date.now()): boolean {
  return (runs ?? []).some((run) => run.status === "running" && now - Date.parse(run.started_at) < JOB_STALE_MS);
}

/** The latest run of every job that has run, polled while one is running. */
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
