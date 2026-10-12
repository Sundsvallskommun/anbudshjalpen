# Recorded samples for the ingestion tests

The tests never call the internet. These files are real responses, recorded on 2026-10-05 unless the table says otherwise.

**They are not in git.** They are third-party documents, so they stay on the machine that recorded them
(`.gitignore`). The tests that need them are skipped with a message when they are missing; everything else runs.
Ask the team for the recorded set, or record new ones from the sources below. A new recording of TED or LOU holds
other notices and counts than the tests expect, so those tests must be updated together with it.

| File | Source | How it was recorded |
|---|---|---|
| `ted_search_page1.json` | `POST https://api.ted.europa.eu/v3/notices/search` | The production query from `anbudsklar.ingest.ted.build_query` (publication date from 2025-04-05) with `limit` 30, unmodified. TED notices may be freely reused |
| `ted_notice_restricted.json` | `POST https://api.ted.europa.eu/v3/notices/search` | Recorded 2026-10-07: the query `publication-number = 680702-2026` with the production `FIELDS`, unmodified. A restricted procedure, which gives only the request deadline (BT-1311) |
| `riksdagen_sfs-2016-1145.text` | `GET https://data.riksdagen.se/dokument/sfs-2016-1145.text` | LOU consolidated through SFS 2026:880, unmodified. Statutes are not protected by copyright |

Synthetic responses that the tests need beyond these (an empty last TED page) are written inline in the tests and
marked as synthetic there. e-Avrop's API cannot be recorded at all: it is the municipality's own and a project's
response holds tenderers, prices and staff. Its tests (`test_eavrop.py`) use fictitious responses written in the test.
