# Agent instructions: frontend

The Anbudshjälpen web app: Vite + React 19 + TypeScript + Astryx, served as a static SPA by the FastAPI
backend in production and by Vite (port 3502, proxying `/api`, `/health` and `/mcp` to 127.0.0.1:8500) in
development. Code and comments are English; every user-facing word is Swedish. Read the root `AGENTS.md`
for the product rules.

The design as built is in `docs/design.md`. Comments that cite "direction.md, section N" point to
`docs/direction.md`, the direction the redesign followed (dated 2026-10-05 and not updated).

## Layout of the code

- `src/api/types.ts` mirrors `backend/src/anbudsklar/api/schemas.py` and `backend/src/anbudsklar/contracts/`
  exactly. Change both in the same commit. `src/api/client.ts` is the only `fetch`; `src/api/queries.ts`
  holds one TanStack Query hook per endpoint.
- `src/AppProviders.tsx` mounts what every page needs, once: the query client, the Swedish catalogue, the built theme
  in the visitor's appearance (`AppearanceTheme`), the router's link, Astryx's `LayerProvider` (the one toast viewport
  `useToast()` shows in; mount no other) and the app's one source dialog (`SourceDialogProvider`).
- `src/shell/` is the frame (Tal till text's ModuleShell pattern), and holds no server data:
  - `AppFrame` composes it per route: `PhaseStrip` (the one-line demo strip), `FrameHeader` (the top bar; on a phone
    two rows), the page, and `SiteFooter`. `ModuleShell` is Astryx's AppShell with the foot after the main region
    (a contentinfo landmark must not sit inside main).
  - `FrameHeader` holds `Brand`, `MainNav` (the role's three main choices; on a phone tabs on a top-level page and a
    back link on a detail page) and `AccountMenu` (the avatar's popover, or "Logga in" for a visitor).
  - `AboutDemo` owns the "Om demon och AI" dialog (lazily loaded `AboutDemoDialog`) that the strip and the foot open.
  - `appearance.tsx` keeps the visitor's appearance (Ljust, Mörkt or Automatiskt, which follows the device and is the
    default) in localStorage and passes it to Astryx `Theme`; `AppearanceControl` offers it in the account menu and the
    foot. `public/appearance.js` sets a stored choice before the first paint with the same key: change the two together.
  - `navigation.ts` has the rules as pure functions: main choices per role, where each role starts, back links.
    `redirects.tsx` sends "/" to the role's start and moves old addresses (`/bevakning` → `/start`) with their query.
  - `Page` is the page frame: the one h1 (focused after a client navigation), breadcrumbs, the widths (640, 760, 960,
    1 152, and 1 344 for inköp's review workspace, which the strip, the top bar and the foot then follow) and the
    rail. `RequireRole` shows a page only to its role.
- `src/components/ui/` holds the redesign's shared components (each one's purpose is in `docs/design.md`, "Delade
  komponenter"): `DeadlineBlock`, `ReminderState`, `SourceLink` and the source dialog (`source/`: `SourceDialog`,
  `PageText`, and `sourceTarget.ts`, the address that opens a source), `AiProvenance` (with `basis="law"` for
  Regelhjälpen), `StatTile`, `ResultSummary`, `NextStepCard` and `AccentCard`, `RequirementRow`, `CollapsibleSection`,
  `StepNav`, `PublishedAnswerQuote` (inköp's answer in e-Avrop and its quote, decision 0018), `ToolsUsed` (the tools
  behind an answer, on Astryx `ChatToolCalls`), and the app's own glyphs (`icons.tsx`, among them `DownloadIcon` and `UploadIcon`).
- `public/favicon.svg` is the mark (Toppen), shown by the top bar's `Brand` and the browser tab. `npm run icons`
  (`scripts/icons.mjs`) builds `favicon.ico`, the home-screen and manifest icons and the README logo from it; rerun it
  after changing the mark, and never edit the generated files by hand.
- `src/components/ask/` is "Fråga AI" (decision 0014): `AskAiProvider` owns the panel and the conversations
  (`askAiState.ts`, session storage), `AskAiPanel` holds `AskAiWidget`, the button that follows the reader and the
  panel it opens (a non-modal Astryx Popover, or a BottomSheet on a phone, with the Chat components), and
  `ProfileChatCard` the answer to a message to the profile (decision 0025). `useAskAi().open({ question })` opens it anywhere.
- `src/components/` also holds the status tokens (`tokens.tsx`), `states.tsx` (loading and errors), `TermText`,
  `RowList`, `UrlTabs`, `NoticeRow`, `FormalQuestionAdvice`, `DocumentUpload` and the checklist's sections
  (`checklist/`). `src/lib/` has pure helpers: dates and numbers (`format.ts`), the Swedish words for the contract's
  codes (`labels.ts`), links out to e-Avrop and TED (`links.ts`), terms (`terms.ts`, and `glossary.ts`, which is
  ported from `docs/glossary.md`: change the two together), page text and quote marking, and small hooks (`usePhone`,
  `useRevealHash`, `hooks.ts`).
- `src/pages/` has one module per route, each lazy-loaded; a page's parts live in a folder beside it.
- Tests: Vitest + Testing Library next to the code (`*.test.ts(x)`), with a plain `fetch` stub
  (`src/test/render.tsx`, the whole app at an address) and fictitious data (`src/test/fixtures.ts`).
  `src/components/ui/testing.tsx` renders one component with the app's providers. No running backend is needed.
  A toast's words, and a field's error, are also written to Astryx's live region for screen readers, so find
  them with an `*AllBy*` query or inside their region.
- `e2e/` is the accessibility gate (Playwright + axe) against a running, seeded app, one state per step of the demo
  journey plus the overlays the frame opens; the phone projects cover the phone's header, step bar and bottom sheet.

## Checks

`npm run typecheck`, `npm run test`, `npm run theme:check`, `npm run build`; `npm run gate` against the
compose stack (`BASE_URL` overrides http://127.0.0.1:3501; `PLAYWRIGHT_CHANNEL=chrome` uses an installed Chrome).
The stack serves the code it was built from: rebuild it before judging a change by the gate.

## UI rules

- Build UI from Astryx components. Run `npm run astryx -- build "<idea>"`, then `npm run astryx -- component <Name>`
  for every component, from `frontend/`. Never guess a prop. Never run the CLI via `npx @astryxdesign/cli` (other
  version). The hosted Astryx MCP documents the latest release; when it and `npm run astryx` disagree, the CLI is right.
- Read `npm run astryx -- docs layout` before a new page. Cap prose/forms with `Layout contentWidth`; a VStack stretches
  children, align actions with `hAlign="start"` or an HStack.
- No `<div>` for layout, no `style={{}}`, no hex colours or px spacing: component props, else tokens. No Tailwind,
  no shadcn, no second UI library.
- Bespoke surfaces with no Astryx counterpart may use a `*.module.css` beside the component, using only Astryx tokens
  (`var(--color-*)`, `var(--spacing-*)`, `var(--radius-*)`), the theme's layout tokens (`var(--layout-*)`,
  `var(--height-*)`) and semantic HTML. Its first comment says why it exists. The shared ones today: `PageText` (the
  page as paper and the quote mark), `SourceLink` (the hit area), `TermText` (inline term buttons), `RowList` (rows
  whose titles wrap instead of being cut off), `CollapsibleSection` (a disclosure button inside a heading, which
  Astryx's Collapsible cannot do), `StepNav` (the sticky bar and the step number), `AccentCard` (the accent edge of
  "Nästa steg" and "Nästa frist"), `RequirementRow` (the row inset), `PublishedAnswerQuote` (the answer's surface and
  accent edge), `checklist/SectionRow` (rows edge to edge in a
  section card, with a straight divider and a fixed date column), `checklist/Evaluation` (the price and quality split
  bar), `shell/Page` (the rail grid) and `shell/SiteFooter` (the foot on the frame's content line). Global rules live
  in `src/app.css`, such as the step bar's scroll padding and the frame following the 1 344 px workspace. Pages keep
  theirs beside the page.
- Do not author StyleX (`stylex.create`, `xstyle`) and do not run `astryx swizzle`.
- A design-system shortfall is fixed once in `src/theme/eneo.theme.ts`, then `npm run theme:build`; commit
  `src/theme/built/` (generated, never hand-edited; CI runs `npm run theme:check`). Never override `--color-*` in :root.
- Dense data = rows (`Table`, `List`, `Item`, `RowList`), never Card-wrapped list items. Status = `StatusDot` or
  `Token`; `Badge` = counts only.
- Each route renders inside the shell frame (`AppFrame` → `ModuleShell`). A page renders no `<main>` and no skip link.
  The shell holds no state.
- State that must survive a dialog closing lives above the dialog. Dialogs are Astryx's (native `<dialog>`),
  opened by `isOpen`. Keep a dialog's `DialogHeader` mounted while it is closed: the dialog takes its name from it.
- Astryx (core + CLI) and `@stylexjs/stylex` are pinned to exact versions; upgrade only in its own PR
  (`npm run astryx -- upgrade --from <old>`, `doctor`, `theme:build`, full gate).
- The ASTRYX block below is generated by `npm run astryx -- init --features agents`; do not hand-edit it.
  Where it says Tailwind or "no imported CSS", the rules above win.

## Product rules (UI)

- User-facing text is Swedish; Astryx's own words come from `@astryxdesign/core/locales/sv-SE.json`.
- No fonts, scripts or CDNs from other origins (CSP `script-src 'self'; style-src 'self'`). No inline scripts.
- Every AI claim shows its source: `SourceLink`'s quiet "s. N", named by the claim it backs, which opens the source
  dialog. Only deviations get words and a token ("s. 9 (AI angav 7)", "Hittades inte i underlaget"), and
  `AiProvenance` sums the check up once per view ("Alla 86 källhänvisningar hittades i underlaget"), with the engine
  and whether inköp reviewed it. Fictitious data carries the "Fiktiv" token.
- Never give one supplier advice the others do not get: when the document does not answer, point to the
  formal question in e-Avrop before the question deadline (likabehandling).
- WCAG 2.2 AA (DOS-lagen / EN 301 549), 24 px targets with a mouse and 44 px with a finger, a visible focus indicator.
  `npm run gate` is the proof. Never lower a gate threshold, delete a gate state or add an axe exclusion
  to get a green gate.

<!-- ASTRYX:START -->
Astryx v0.6.3 · 164 components
CLI: run every command as `npx astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in your app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — discover, don't guess. Before writing UI:
1. `astryx build "<idea>"` — START HERE: returns a kit (closest [page] + [block]s + [component]s). No args = full playbook.
2. `astryx template <name> [--skeleton]` — scaffold the [page]/[block]s it named, or study their layout. Templates are reference code.
3. `astryx component <Name>` — props + examples for every component you use.

RULES:
- No <div> — components do all layout/spacing, page frame included.
- Frame first: read `astryx docs layout` before writing any page or screen — page frame, region widths, breakpoint behavior.
- Dense data = rows (Table, List/Item), never Card-wrapped list items; Card is for standalone widgets. Status = StatusDot/Token; Badge = counts only.
- Custom styling: component props first; else style/className with tokens — var(--color-*|--spacing-*|--radius-*). No raw hex/px. (No StyleX/Tailwind compiler here — don't use xstyle/utility classes.)
- Tokens for every value (`astryx docs tokens`). Brand/accent belongs in the theme (`astryx theme list` / `theme add <slug>`, or `astryx theme template` for a custom one) — never override --color-* in :root.
- SELF-CHECK before you finish: re-read the file and replace any raw <div>/<span> layout, imported .css/@apply, or hardcoded value (#hex, 16px) with the component or a token (var(--color-*|--spacing-*|…)). If unsure a component/prop exists, run `astryx component <Name>` / `astryx search "<thing>"`; don't hand-roll CSS.

MORE CLI:
  search "<query>"   find any component / hook / doc / template / block
  component --list   164 components by category
  template --list    page + block recipes
  docs <topic>       browser-support, cli-integrations, color, elevation, getting-started, icons, illustrations, internationalization, layout, migration, motion, principles, shape, spacing, styling-libraries, styling, theme, tokens, typography, working-with-ai
  swizzle <Name>     eject component source for deep customization
  upgrade --apply    run after any Astryx or integration dependency bump
<!-- ASTRYX:END -->
