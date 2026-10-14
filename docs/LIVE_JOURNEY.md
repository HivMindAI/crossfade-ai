# Authenticated live journey protocol — not yet run

The owner has independently observed the Artist Search, Movie Insights, and Book Insights item shapes in a bounded three-request smoke. The repaired production Book path and full two-audience journey have not been authenticated end to end. No journey measurements below are Qloo results. This protocol requires separate owner authorization and a healthy shared quota guard.

## Before any live journey

1. Confirm the issued hackathon key and request allowance from the issuer. Set `QLOO_API_KEY` in the local server process or a secret manager and leave `QLOO_API_ORIGIN` unset or set it to the exact hackathon origin. The current code permits only `https://hackathon.api.qloo.com`. Do not put the key in a command, chat, screenshot, repository file, or log.
2. Review the owner-observed [Search, Movie, and Book shape evidence](QLOO.md) and the offline production contract tests. Do not repeat completed diagnostics without a new factual question and separate authorization. Stop if the production response shape differs from the verified metadata; HTTP 200 alone is insufficient.
3. Configure the claimed free shared Redis guard and verify its 429 behavior as described in [deployment preparation](DEPLOYMENT.md). Determine `QLOO_LIVE_PLANS_PER_HOUR` from the issued Qloo allowance, reserving **24 possible Qloo HTTP attempts for each plan**, including retries. If fewer than 24 attempts remain, do not start a full plan.
4. With separate approval for a complete live scenario, set `QLOO_LIVE_ENABLED=1` only in the controlled validation server. Use the app's **Live Qloo** mode. Switch it back to `0` after the session. A public deployment requires its own approval and checks.

## Predeclared profiles and observations

The **first** separately authorized journey is bounded to **P1, at most two plans**: an initial result and one film rejection repair if a path exists. Reserve 32 logical calls / 48 retry-inclusive HTTP attempts separately from the smoke. Stop after these plans. Additional profiles, rule edits, the four-profile benchmark, and [Bridge research](BRIDGE_EXPERIMENT.md) require their own explicit authorization and quota reservations.

Use the following *input names only* as a reproducible starting set. Search may resolve ambiguously or fail; choose an exact returned entity in the UI and record that outcome. These profiles make no prediction about Qloo overlap. Run them sequentially and stop when the shared plan budget or Qloo allowance is reached.

| Profile | Audience A interests | Audience B interests |
| --- | --- | --- |
| P1 | Miles Davis (artist), Spirited Away (movie) | Beyoncé (artist), Everything Everywhere All at Once (movie) |
| P2 | Nina Simone (artist), The Matrix (movie) | Beyoncé (artist), Spirited Away (movie) |
| P3 | Spirited Away (movie), The Matrix (movie) | Miles Davis (artist), Nina Simone (artist) |
| P4 | Nina Simone (artist), Everything Everywhere All at Once (movie) | Miles Davis (artist), The Matrix (movie) |

These four cases were fixed before any authenticated Qloo result was inspected. An ambiguous Search, valid empty Insights list, or missing overlap is recorded as such; the profile is never replaced after viewing results.

The three-request smoke has a maximum of **3 logical calls / 3 HTTP attempts**. One full plan has a maximum of **16 logical calls / 24 retry-inclusive HTTP attempts**. An initial plan plus one rejection repair reserves up to **32 logical calls / 48 attempts** per profile. The separate four-profile benchmark, if all initial runs and repairs are approved, reserves up to **128 logical calls / 192 attempts**, in addition to the smoke. Execute fewer plans when the issued allowance or shared quota cannot cover full reservations.

For each attempted profile, record only the date, hackathon host status, profile ID, completed/error status, error code if any, `sourceCalls`, `httpAttempts`, `recoveryCalls`, `sharedEligible` counts for artist/movie/book, option count, conceptual or duration-verified status, and whether distinct directional alternatives appeared. These values are in the response's `metrics`, result status, options, and Decision trace. Never save raw responses, full names or IDs returned by Qloo, headers, or credentials. Do not count an unresolved Search, failed request, or skipped profile as a successful recommendation.

After one successful profile, reject its displayed film. Confirm the rejected ID is absent from every revised option, inspect the changed-component list and REPLAN trace, and record whether a replacement or an honest no-solution result followed. Stop after this second plan; a rule-tightening replan is a **separately authorized later plan** with its own full quota reservation. A no-solution state must be reported only if it actually occurs. If none occurs, the existing offline no-solution tests remain the only verification of that path.

For the shared-entity strategy, report the denominator explicitly: completed profiles with valid Search and Insights responses. Report how many of those had at least one eligible shared candidate in **all three** domains, how many produced a conceptual path, how many produced no path, and how many displayed distinct alternatives. Treat this as a small descriptive smoke sample, not an estimate of population success. Do not substitute synthetic fixture results for live measurements. Use the [predeclared benchmark](LIVE_BENCHMARK.md) for metric definitions and a baseline comparison.

| Date | Profile | Status/error code | Calls/attempts | Eligible artist/movie/book | Paths/status | Repair outcome |
| --- | --- | --- | --- | --- | --- | --- |
| Pending | — | No authenticated journey run | — | — | — | — |

## Judge-facing 90-second sequence

Until live validation passes, show the existing **Synthetic demo** and explicitly call it invented fixture data. Then: **0–15 s** introduce contrasting audiences and provenance; **15–35 s** generate the plan and show the fairness and directional paths that actually appear; **35–55 s** open Evidence and explain shared IDs and ordinal ranks; **55–75 s** reject a film and show the revised result and changed-component explanation; **75–90 s** open Decision trace and state the remaining scheduling and rights checks. If a live run later passes, repeat and time this sequence with actual Qloo results before changing the demonstration claim. A conceptual live path is never presented as a verified screening schedule.
