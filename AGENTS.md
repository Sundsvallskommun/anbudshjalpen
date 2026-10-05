# Agent instructions: anbudsklar

Anbudsklar is an AI procurement coach for small businesses. It is built with Sundsvalls kommun's business-development
unit (näringslivsenheten) and procurement department (inköp), on top of Eneo. The project is in the discussion phase:
there is no code yet, only documentation and decision records.

Documentation for people is Swedish and lives in `docs/` (start at `docs/README.md`). This file, `CLAUDE.md`, code and
code comments are English. User-facing text is Swedish.

## How to work here

1. Read `docs/README.md` and the decision log in `docs/decisions/README.md` before proposing a change of direction.
   Do not contradict an accepted decision; write a new decision record that supersedes it instead.
2. Facts about Eneo's features and branches in `docs/eneo-building-blocks.md` are dated. Re-verify them against the
   Eneo repository (`eneo-ai/eneo`) before you rely on them.
3. Doc pages start with three lines: `Syfte:`, `Läs detta när:` and `Hör ihop med:`. Keep that form.
4. If a change alters something a doc page states, change that page in the same commit. When an open question is
   settled, record it as a decision and remove it from `docs/open-questions.md`.

## Product rules

- Only public sources and the company's own data. Never add real tender drafts, personal data or confidential contract
  prices to the repository; fixtures are fictitious and marked as such.
- Every claim the coach shows a user must be traceable to a source (document and page, or law chapter and section).
- The UI is React with Astryx (decision 0002). If a database is needed, it is Postgres (decision 0003).

## Commits

- Do not add `Co-Authored-By` trailers.
