# Recorded samples for the ingestion tests

The tests never call the internet. These files are real responses, recorded once on 2026-10-05.

**They are not in git.** They are third-party documents, so they stay on the machine that recorded them
(`.gitignore`). The tests that need them are skipped with a message when they are missing; everything else runs.
Ask the team for the recorded set, or record new ones from the sources below. A new recording of TED or LOU holds
other notices and counts than the tests expect, so those tests must be updated together with it.

| File | Source | How it was recorded |
|---|---|---|
| `ted_search_page1.json` | `POST https://api.ted.europa.eu/v3/notices/search` | The production query from `anbudsklar.ingest.ted.build_query` (publication date from 2025-04-05) with `limit` 30, unmodified. TED notices may be freely reused |
| `riksdagen_sfs-2016-1145.text` | `GET https://data.riksdagen.se/dokument/sfs-2016-1145.text` | LOU consolidated through SFS 2026:880, unmodified. Statutes are not protected by copyright |
| `eavrop_robots.txt` | `GET https://www.e-avrop.com/robots.txt` | Unmodified. It disallows everything except `/Places.aspx` |
| `eavrop_advertised.html` | `https://www.e-avrop.com/sundsvall/e-Upphandling/Default.aspx` | Saved by hand during the data-source research (robots.txt disallows automated fetching), unmodified |
| `eavrop_planned.html` | `https://www.e-avrop.com/sundsvall/e-Upphandling/planedComing.aspx` | As above, page 1 of 4 |

The e-Avrop pages contain no personal data (only e-Avrop's public support address). Synthetic responses that the
tests need beyond these (an empty last TED page, a last page of the planned list) are written inline in the tests
and marked as synthetic there.
