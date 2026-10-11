# Authenticated live journey protocol — not yet run

This protocol is ready for the account owner to approve **after** a key is available. No measurements below are Qloo results. The [three-request smoke procedure](QLOO.md) is a separate first gate.

## Before any live journey

1. Confirm the issued key's intended host and request allowance from the issuer. Set `QLOO_API_KEY` and, if required, `QLOO_API_ORIGIN` in the local server process or a secret manager. Do not put either value in a command, chat, screenshot, repository file, or log.
2. Obtain explicit account-owner authorization for the bounded smoke call set, then run `npm run qloo:smoke -- --live-once`. Stop on any authentication, type, nonempty-result, or response-shape failure. A 200 status alone is insufficient.
3. Configure the claimed free shared Redis guard and verify its 429 behavior as described in [deployment preparation](DEPLOYMENT.md). Determine `QLOO_LIVE_PLANS_PER_HOUR` from the issued Qloo allowance, reserving **24 possible Qloo HTTP attempts for each plan**, including retries. If fewer than 24 attempts remain, do not start a full plan.
4. With separate approval for a complete live scenario, set `QLOO_LIVE_ENABLED=1` only in the controlled validation server. Use the app's **Live Qloo** mode. Switch it back to `0` after the session. A public deployment requires its own approval and checks.

## Predeclared profiles and observations

Use the following *input names only* as a reproducible starting set. Search may resolve ambiguously or fail; choose an exact returned entity in the UI and record that outcome. These profiles make no prediction about Qloo overlap. Run them sequentially and stop when the shared plan budget or Qloo allowance is reached.

| Profile | Audience A interests | Audience B interests |
| --- | --- | --- |
| P1 | Miles Davis (artist), Spirited Away (movie) | Beyoncé (artist), Everything Everywhere All at Once (movie) |
| P2 | Nina Simone (artist), The Matrix (movie) | Beyoncé (artist), Spirited Away (movie) |
| P3 | Spirited Away (movie), The Matrix (movie) | Miles Davis (artist), Nina Simone (artist) |

For each attempted profile, record only the date, host category (hackathon or standard), profile ID, completed/error status, error code if any, `sourceCalls`, `httpAttempts`, `recoveryCalls`, `sharedEligible` counts for artist/movie/book, option count, conceptual or duration-verified status, and whether distinct directional alternatives appeared. These values are in the response's `metrics`, result status, options, and Decision trace. Never save raw responses, full names or IDs returned by Qloo, headers, or credentials. Do not count an unresolved Search, failed request, or skipped profile as a successful recommendation.

After one successful profile, reject its displayed film. Confirm the rejected ID is absent from every revised option, inspect the changed-component list and REPLAN trace, and record whether a replacement or an honest no-solution result followed. Tighten a film or total-program limit and observe another replan only if the remaining quota allows it. A no-solution state must be reported only if it actually occurs. If none occurs, the existing offline no-solution tests remain the only verification of that path.

For the shared-entity strategy, report the denominator explicitly: completed profiles with valid Search and Insights responses. Report how many of those had at least one eligible shared candidate in **all three** domains, how many produced a conceptual path, how many produced no path, and how many displayed distinct alternatives. Treat this as a small descriptive smoke sample, not an estimate of population success. Do not substitute synthetic fixture results for live measurements.

| Date | Profile | Status/error code | Calls/attempts | Eligible artist/movie/book | Paths/status | Repair outcome |
| --- | --- | --- | --- | --- | --- | --- |
| Pending | — | No authenticated journey run | — | — | — | — |

## Judge-facing 90-second sequence

Until live validation passes, show the existing **Synthetic demo** and explicitly call it invented fixture data. Then: **0–15 s** introduce contrasting audiences and provenance; **15–35 s** generate the plan and show the fairness and directional paths that actually appear; **35–55 s** open Evidence and explain shared IDs and ordinal ranks; **55–75 s** reject a film and show the revised result and changed-component explanation; **75–90 s** open Decision trace and state the remaining scheduling and rights checks. If a live run later passes, repeat and time this sequence with actual Qloo results before changing the demonstration claim. A conceptual live path is never presented as a verified screening schedule.
