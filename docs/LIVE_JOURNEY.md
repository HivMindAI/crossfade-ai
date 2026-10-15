# Authenticated live journey protocol — first P1 initial plan observed

The owner has independently observed the Artist Search, Movie Insights, and Book Insights item shapes in a bounded three-request smoke. The owner also reported a passing isolated Upstash atomic quota test: five HTTP 200 responses, two admissions, one denial, valid TTL, and cleanup. The first fixed P1 initial plan has now been attempted; the owner observed no complete path and zero shared IDs in the bounded results for all three domains. See the [P1 validation record](VALIDATION.md) for the precise available aggregates and unknowns. A future malformed Insights page fails at the adapter with a fixed error category and aggregate accepted/rejected counts, without raw entity values. The procedure below documents the original one-plan gate; it does not authorize another run or rejection repair.

## Original preflight for the completed first P1 attempt

1. Confirm the issued hackathon key and request allowance from the issuer. Set `QLOO_API_KEY` in the local server process or a secret manager and leave `QLOO_API_ORIGIN` unset or set it to the exact hackathon origin. The current code permits only `https://hackathon.api.qloo.com`. Do not put the key in a command, chat, screenshot, repository file, or log.
2. Review the owner-observed [Search, Movie, and Book shape evidence](QLOO.md) and the offline production contract tests. Do not repeat completed diagnostics without a new factual question and separate authorization. Stop if the production response shape differs from the verified metadata; HTTP 200 alone is insufficient.
3. Confirm the issued key's **hourly and cumulative/period** remaining allowances, reset/expiry time, and any other clients sharing them. Reserve **24 possible Qloo HTTP attempts for this one plan**, including retries, from every applicable limit. The app's 60-minute Redis counter does not track monthly or external usage. If any limit is unknown or fewer than 24 uncommitted attempts remain, do not run.
4. The owner's isolated-key Redis test has passed; [Milestone 11 validation](VALIDATION.md) records its scope. Use the same privately controlled claimed database and Standard REST token for the first local plan. Keep `QLOO_LIVE_PLANS_PER_HOUR=1`. The disposable-key result does not validate the Qloo allowance or public-host abuse protection.
5. Only after separate approval for **one plan**, set `QLOO_LIVE_ENABLED=1` in a private, loopback-only validation server. Use the app's **Live Qloo** mode once. Stop the server and return the switch to `0` after the attempt. A public deployment requires its own approval and checks.

## Predeclared profiles and observations

The **first** separately authorized journey was bounded to **P1, exactly one attempted initial plan**. Its ceiling was **16 logical calls / 24 retry-inclusive HTTP attempts** separately from the completed smoke. The observed no-path outcome ended that authorization. A new plan, disambiguation, rejection repair, rule edit, additional profile, four-profile benchmark, or [Bridge research](BRIDGE_EXPERIMENT.md) requires its own approval and allowance check. A later rejection repair would require another full 24-attempt reservation.

The first P1 attempt used the fixed input names below. Search may resolve ambiguously or fail in future runs; record that outcome without selecting a different profile after seeing results. These profiles make no prediction about Qloo overlap. P2–P4 remain unattempted and require separate approval.

| Profile | Audience A interests                                            | Audience B interests                                        |
| ------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| P1      | Miles Davis (artist), Spirited Away (movie)                     | Beyoncé (artist), Everything Everywhere All at Once (movie) |
| P2      | Nina Simone (artist), The Matrix (movie)                        | Beyoncé (artist), Spirited Away (movie)                     |
| P3      | Spirited Away (movie), The Matrix (movie)                       | Miles Davis (artist), Nina Simone (artist)                  |
| P4      | Nina Simone (artist), Everything Everywhere All at Once (movie) | Miles Davis (artist), The Matrix (movie)                    |

These four cases were fixed before any authenticated Qloo result was inspected. An ambiguous Search, valid empty Insights list, or missing overlap is recorded as such; the profile is never replaced after viewing results.

The three-request smoke has a maximum of **3 logical calls / 3 HTTP attempts**. One full plan has a maximum of **16 logical calls / 24 retry-inclusive HTTP attempts**. An initial plan plus one rejection repair reserves up to **32 logical calls / 48 attempts** per profile. The separate four-profile benchmark, if all initial runs and repairs are approved, reserves up to **128 logical calls / 192 attempts**, in addition to the smoke. Execute fewer plans when the issued allowance or shared quota cannot cover full reservations.

For each attempted profile, record only the date, hackathon host status, profile ID, completed/error status, error code if any, `sourceCalls`, `httpAttempts`, `recoveryCalls`, `sharedEligible` counts for artist/movie/book, complete three-domain option count, distinct Pareto alternative count, conceptual or duration-verified status, evidence-provenance completeness, observed latency, and unsupported-claim categories. These values are in a successful response's `metrics`, result status, options, and Decision trace. On a failed request the current API may not return attempted-call metrics: write **unavailable**, not zero, and conservatively count the whole 24-attempt reservation against the planned allowance. Never save raw responses, full names or IDs returned by Qloo, headers, or credentials. Do not count an unresolved Search, failed request, or skipped profile as a successful recommendation.

**Later, only after separate authorization**, a successful profile may be followed by one film rejection repair. Confirm the rejected ID is absent from every revised option, inspect the changed-component list and REPLAN trace, and record whether a replacement or an honest no-solution result followed. Stop after that second plan. A rule-tightening replan would need another approval and quota reservation. A no-solution state must be reported only if it actually occurs.

For the shared-entity strategy, report the denominator explicitly: completed profiles with valid Search and Insights responses. Report how many of those had at least one eligible shared candidate in **all three** domains, how many produced a conceptual path, how many produced no path, and how many displayed distinct alternatives. Treat this as a small descriptive smoke sample, not an estimate of population success. Do not substitute synthetic fixture results for live measurements. Use the [predeclared benchmark](LIVE_BENCHMARK.md) for metric definitions and a baseline comparison.

For P1, inspect the successful local response only transiently in browser developer tools if the UI does not expose a metric. Copy **aggregates and categories only** into this worksheet; do not save a HAR, raw JSON, provider entities, IDs, names, headers, or credentials. `metrics.elapsedMs` is planner time, not the full browser wait. A failed API response may omit metrics: write **unavailable**, never zero, and charge the full 24-attempt reservation. Option count is `options.length`; record path labels, not titles. Provenance is complete only if every displayed candidate has `source: qloo`, ordinal ranks, and an evidence receipt; count missing receipts or warnings without copying their text. A conceptual option is not a duration-verified schedule.

| P1 field                                                                                               | Observation to record after the one attempt |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| UTC time; HTTP status; result status or fixed error code                                               | Time/status unavailable; NO COMPLETE PATH observed |
| `metrics.sourceCalls` / `httpAttempts` / `recoveryCalls`                                               | Unavailable; page-two recovery observed     |
| `metrics.sharedEligible`: artist / movie / book                                                        | Zero shared IDs observed in each domain; eligible counts not separately supplied |
| `options.length`; path labels; distinct alternative count                                              | No complete path; counts not separately supplied |
| Schedule status; unverified runtime/rating counts                                                      | Unavailable                                 |
| Qloo-sourced candidates / displayed candidates; missing receipt or rank counts; evidence-warning count | Unavailable                                 |
| `metrics.elapsedMs` planner latency; optional separately labeled browser wait                          | Unavailable                                 |
| Failure stage/code; diagnostic issue categories; unsupported-claim categories                          | Unavailable                                 |

## First P1 operator procedure — historical instructions, already executed once

1. In a fresh **Windows PowerShell 5.1 or PowerShell 7** session on the owner's machine, prepare the existing application before entering any secrets:

   ```powershell
   Set-Location D:\CROSSFADE
   $env:QLOO_LIVE_ENABLED = '0'
   $env:CROSSFADE_SITE_ORIGIN = 'http://127.0.0.1:3100'
   npm ci --no-audit --no-fund
   if ($LASTEXITCODE -ne 0) { throw 'Install failed; stop before loading credentials.' }
   npm run build
   if ($LASTEXITCODE -ne 0) { throw 'Build failed; stop before loading credentials.' }
   ```

2. Privately confirm the issued Qloo key's hourly, cumulative/period, and any shorter remaining allowances, including other clients' planned use. At least **24 uncommitted attempts must remain in every applicable limit**. If a limit is unknown, stop with live mode at `0`. Obtain separate owner authorization for **exactly one** P1 plan. Only after both gates pass, use masked prompts in the same private session; do not paste values into commands, files, chat, screenshots, or logs. This helper works in Windows PowerShell 5.1 and PowerShell 7 and clears the temporary unmanaged copy after setting each process-only variable:

   ```powershell
   function Set-PrivateEnv($name, $prompt) {
     $secret = Read-Host $prompt -AsSecureString
     $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
     try { [Environment]::SetEnvironmentVariable($name, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr), 'Process') }
     finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secret.Dispose() }
   }
   Set-PrivateEnv 'QLOO_API_KEY' 'Qloo API key'
   Set-PrivateEnv 'UPSTASH_REDIS_REST_URL' 'Upstash REST URL'
   Set-PrivateEnv 'UPSTASH_REDIS_REST_TOKEN' 'Upstash Standard REST token'
   $env:QLOO_API_ORIGIN = 'https://hackathon.api.qloo.com'
   $env:QLOO_LIVE_PLANS_PER_HOUR = '1'
   $env:QLOO_LIVE_ENABLED = '1'
   npm run start -- --hostname 127.0.0.1 --port 3100
   ```

   The server command remains in the foreground. In a **second PowerShell window**, confirm that port 3100 has only the intended loopback listener before opening the app:

   ```powershell
   $bound = @(Get-NetTCPConnection -State Listen -LocalPort 3100 | Select-Object -ExpandProperty LocalAddress -Unique)
   if ($bound.Count -ne 1 -or $bound[0] -ne '127.0.0.1') { throw 'Stop the server: listener is not loopback-only.' }
   ```

   Do not expose a tunnel, proxy, or public hostname. If the listener check fails, stop the server and follow the shutdown step without submitting a plan.

3. Open `http://127.0.0.1:3100`, select **Live Qloo**, enter the fixed P1 interests above, and invoke the planner **once**. Observe the result and Decision trace. Record only the redacted worksheet fields. A conceptual path is not a verified schedule; an error, ambiguity, or no-solution is not a successful negotiation. Do not reject, revise, retry, or run another profile under this authorization.
4. In the server PowerShell window, stop the foreground server with **Ctrl+C**. Then run these shutdown commands in that same window and close it:

   ```powershell
   $env:QLOO_LIVE_ENABLED = '0'
   Remove-Item Env:\QLOO_API_KEY,Env:\UPSTASH_REDIS_REST_URL,Env:\UPSTASH_REDIS_REST_TOKEN,Env:\QLOO_API_ORIGIN,Env:\QLOO_LIVE_PLANS_PER_HOUR,Env:\CROSSFADE_SITE_ORIGIN -ErrorAction SilentlyContinue
   ```

   A failed or aborted attempt is not refunded. On Qloo 429, quota 429/503, malformed response, ambiguity, or any other failure, report the redacted status and stop. Do not retry, choose a match, or run a repair without new authorization and another full allowance check.

## Judge-facing 90-second sequence

Until live validation passes, show the existing **Synthetic demo** and explicitly call it invented fixture data. Then: **0–15 s** introduce contrasting audiences and provenance; **15–35 s** generate the plan and show the fairness and directional paths that actually appear; **35–55 s** open Evidence and explain shared IDs and ordinal ranks; **55–75 s** reject a film and show the revised result and changed-component explanation; **75–90 s** open Decision trace and state the remaining scheduling and rights checks. If a live run later passes, repeat and time this sequence with actual Qloo results before changing the demonstration claim. A conceptual live path is never presented as a verified screening schedule.
