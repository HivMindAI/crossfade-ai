# Bridge Discovery — predeclared protocol and observed artist-only result

Status: research protocol fixed before inspecting live results on 2026-10-13. The owner-observed P1 result and the later isolated Bridge result are recorded separately below. The first owner-executed Bridge attempt stopped at Redis reservation; a subsequent owner-executed artist-only run was VALID. No Bridge production planner change, public control, or captured Qloo dataset has been added. The current planner remains shared-ID intersection with bounded page-two recovery.

## Owner-observed artist-only Bridge result (2026-10-15)

The owner reports **VALID** with eight authenticated Qloo HTTP requests, all HTTP 200, and one admitted Redis reservation. Initial artist-ID intersection was **0**; the discovered union contained **20** unique candidates. Both audiences' identical shared-filter evaluation returned all **20**; strict-subset filter controls returned **19** each and passed sample membership checks. The runner counted **20 newly doubly returned IDs** and an expanded **five-option ordinal Pareto frontier**. Elapsed time was **12,402 ms**. These are owner-supplied aggregates, not requests or raw results reproduced in this repository. The observed monthly remaining-allowance header has unverified numeric semantics and is not a guaranteed account balance.

The controlled filter increased **observed candidate coverage** from zero independently shared IDs to 20 jointly returned IDs in this artist-only sample. Filtered inclusion establishes that a result was returned from a requested pool; it does **not** show positive affinity, cultural compatibility, or whether either audience wants the candidate. Five non-dominated ordinal options show trade-offs under this rank rule, not five satisfying options or an improvement in human satisfaction. Rank positions cannot be converted into calibrated preference scores. Bridge remains outside production pending independent human evaluation and a separately reviewed three-domain design.

## Post-P1 evidence annotation (2026-10-15; protocol unchanged)

The owner observed one fixed P1 initial plan ending **NO COMPLETE PATH**. In artist, movie, and book, each audience had 40 returned rows across two pages, zero shared IDs, attempted page-two recovery, and a reached page limit. No rejection repair occurred. The owner did not supply verified HTTP-attempt counts, latency, unique-ID counts, or provider payloads. This demonstrates zero overlap in those bounded windows, not absence of a useful candidate elsewhere. It does not by itself establish an identity or comparison defect. See [VALIDATION.md](VALIDATION.md) for the live-evidence record. The artist-only experiment below remains exploratory and cannot establish a complete three-domain P1 improvement.

## Hypothesis and API evidence

Separate truncated audience lists may omit a candidate from one side even when it could be returned for that side under a common candidate filter. Re-evaluating a deduplicated union might uncover additional doubly supported candidates. An omission is not evidence of dislike, and a returned rank is not a satisfaction score.

The official [entity-type parameter guide](https://docs.qloo.com/reference/available-parameters-by-entity-type) lists `filter.results.entities` and `signal.interests.entities` for **artist, movie, and book**. This was checked against Qloo's [official documentation mirror](https://github.com/qloo/docs-public/blob/main/reference/available-parameters-by-entity-type.md), specifically those three tables. The [Insights deep dive](https://docs.qloo.com/reference/insights-api-deep-dive) describes `filter.results.entities` as a comma-separated ID list and Insights `take` as at most 50. It does not guarantee that all requested candidates are returned, describe a minimum affinity threshold, or establish calibrated cross-request scores. The issued hackathon key returned the owner-observed artist-only sample above; Movie and Book filtered behavior remains unverified.

The [hackathon guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide) warns that unsupported parameters can be ignored silently. HTTP 200, empty output, and an echoed query alone do not demonstrate that a filter worked. Use only `https://hackathon.api.qloo.com`, GET `/search` and `/v2/insights`, with a server-only `X-Api-Key`. No guessed endpoint, host, score field, or entity ID is permitted.

## Gates before Bridge testing

The gates, commands, and earlier failure below are retained as the predeclared protocol and audit history. The owner has since completed one VALID run recorded above. This document does not authorize a repeat.

1. The owner already completed the bounded Search/Movie/Book smoke and the first fixed [P1 initial plan](LIVE_JOURNEY.md). P1 ended without a complete path; no rejection repair was authorized or run. Do not repeat those calls under this protocol.
2. Before a distinct artist-only experiment, the owner must privately confirm at least **8 uncommitted Qloo attempts** in every applicable issued-key allowance, account for other clients, and explicitly authorize this experiment. Leave production live mode off outside a controlled local session. The existing shared Redis guard must admit a separate reservation before any Qloo request; its current policy reserves the worst-case **24-attempt plan allowance**, even though this exploratory experiment is capped at **8 Qloo attempts**. That reservation is one additional Upstash REST request. If P1's reservation still fills the shared window, wait for its normal expiry; do not reset or delete the quota key. An isolated runner must reuse that guard, not bypass it.
3. The isolated [runner](../scripts/bridge-experiment.mjs) enforces at most 8 logical calls / 8 HTTP attempts, zero retries and pagination, the exact hackathon origin, timeouts, manual redirects, response-size and encoded-URL limits, strict Search and Insights validation, exact filtered-ID membership, redacted aggregate output, and fail-closed behavior. Stop if the filter contract cannot be demonstrated. Its safeguards have offline tests with invented responses; the owner also observed one valid bounded artist-only run. Production `/api/plan` has no Bridge mode.

### Owner-observed Redis reservation failure and read-only check

The first live Bridge attempt reported `BLOCKED`, `stage=reservation`, `category=quota-unavailable`, one Redis request, zero Qloo attempts, no HTTP status, and 2,502 ms total elapsed. The old Redis request deadline was 2,500 ms, so timeout is a strong hypothesis, **not a proven cause**. The response and failure were previously collapsed into one category. An aborted request might still have executed its atomic `EVAL`; do not refund, delete, or repeat the reservation. The core now uses one 8,000 ms deadline with no retry and reports fixed timeout, transport, authentication, HTTP status, provider error, malformed response, or exhausted categories. The production route still fails closed with HTTP 503 except for proven exhaustion, which maps to HTTP 429.

Before another Bridge attempt, the owner may perform **one read-only, two-request maximum** inspection of the existing quota key. This does not authorize the experiment. Use the Upstash **Readonly REST token** if available. In a private PowerShell session, enter only the REST URL and token through masked prompts; the checker sends `GET` and `TTL` for `crossfade:qloo:live-plans:v1`, never `EVAL`, `DEL`, or `EXPIRE`:

```powershell
Set-Location D:\CROSSFADE
$env:QLOO_LIVE_ENABLED = '0'
try {
  function Set-PrivateEnv($name, $prompt) {
    $secret = Read-Host $prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { [Environment]::SetEnvironmentVariable($name, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr), 'Process') }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secret.Dispose() }
  }
  Set-PrivateEnv 'UPSTASH_REDIS_REST_URL' 'Upstash REST URL'
  Set-PrivateEnv 'UPSTASH_REDIS_REST_TOKEN' 'Upstash Readonly REST token'
  node .\scripts\read-redis-quota.mjs --read-only-once
} finally {
  Remove-Item Env:\UPSTASH_REDIS_REST_URL,Env:\UPSTASH_REDIS_REST_TOKEN -ErrorAction SilentlyContinue
  $env:QLOO_LIVE_ENABLED = '0'
}
```

The checker prints only fixed categories, HTTP statuses, count, TTL seconds, and state. `active` with `counter>=1` means a limit of one is occupied until its positive TTL expires. `absent` means no key existed at read time; expiry may have erased evidence of whether the earlier EVAL executed. `BLOCKED`, missing expiry, or inconsistent GET/TTL observations leave state unresolved. Two reads are not an atomic snapshot; other clients can change the counter between them. Never use this check to reset the key or infer issued Qloo allowance. Wait for natural expiry or obtain account-owner evidence before another separately authorized attempt.

### Future owner-controlled run — separate authorization required

Do not run this under the present offline-only approval. After the read-only quota check and separately authorizing **one artist-only experiment**, privately confirm at least eight uncommitted Qloo attempts in **every** applicable allowance, including other clients, and a free shared Redis reservation window. The runner requires the one-shot flag and a separate process flag. Use this masked, process-only setup in a private PowerShell 5.1 or 7 session; do not save or display the entered values:

```powershell
Set-Location D:\CROSSFADE
$env:QLOO_LIVE_ENABLED = '0'
try {
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
  $env:CROSSFADE_BRIDGE_AUTHORIZED = '1'
  npm run bridge:experiment -- --live-once
} finally {
  Remove-Item Env:\CROSSFADE_BRIDGE_AUTHORIZED,Env:\QLOO_API_KEY,Env:\UPSTASH_REDIS_REST_URL,Env:\UPSTASH_REDIS_REST_TOKEN,Env:\QLOO_LIVE_PLANS_PER_HOUR,Env:\QLOO_API_ORIGIN -ErrorAction SilentlyContinue
  $env:QLOO_LIVE_ENABLED = '0'
}
```

Without `--live-once`, the authorization flag, an approved origin, an issued key, and an admitted shared reservation, it dispatches no Qloo requests. The runner prints only a redacted aggregate JSON report. It does not delete or reset the production quota key; a reserved slot is not refunded after failure. The owner must stop after this one invocation regardless of outcome, including `BLOCKED`, `FAIL`, `INCONCLUSIVE`, HTTP 429, or timeout. Keep `QLOO_LIVE_ENABLED=0`; this research does not enable the production Live planner. A Qloo allowance header, when returned, is sampled from an existing response without an extra request: the runner recognizes only a bounded decimal value of `x-month-ratelimit-remaining` and reports the minimum as advisory metadata. Official documentation has not yet confirmed this header's name or semantics, and it cannot substitute for the owner's independent preflight allowance check. Raw headers and malformed values are never printed.

## Minimum useful experiment

Use P1's **artist** domain first; it avoids treating missing film minutes as verified. Keep the two audience signal sets fixed. Begin with one artist interest per side (Miles Davis / Beyoncé); Search must resolve exact, unambiguous IDs. This is a parameter/coverage experiment, not the full production profile.

| Stage | Calls | Candidate bound / purpose |
| --- | --- | --- |
| Resolve seeds | 2 Search | One name per audience; no ID guessing |
| Independent discovery | 2 Insights | Artist, `take=10`, page 1, same exclusions |
| Common-pool evaluation | 2 Insights | One per audience, identical deduplicated union of at most 20 genuine returned IDs, `filter.results.entities=<IDs>`, `take=pool size`, page 1 |
| Filter controls | 2 Insights | One per audience with a strict nonempty subset of that union; omit an ID actually returned in that audience's main evaluation |
| **Maximum** | **8 logical / 8 HTTP attempts** | No automatic retries or pagination in this first experiment |

All Insights calls keep `filter.type=urn:entity:artist`, that audience's independently resolved `signal.interests.entities`, `feature.explainability=true`, `page=1`, and the same explicit exclusions. Discovery uses `take=10` without a result-pool filter. Main evaluation uses the **same ordered union IDs** in `filter.results.entities` for both audiences and `take` equal to its size. Each control uses its preselected strict subset in that filter and `take` equal to the subset size. Search uses the exact fixed names, `types=urn:entity:artist`, and bounded `take`; it must resolve one unambiguous ID per name. Build URLs with encoded query parameters and check the encoded length before dispatch. No second page, alternate signal, host, or retry is allowed to rescue an inconclusive result.

The six core calls alone cannot adequately detect a silently ignored filter. Require the two controls. If the union has fewer than two IDs, or a control cannot return useful evidence, record the contract as inconclusive and stop. Every result of either filtered call must have an exact ID in that call's requested set; an outsider invalidates the filter contract, even when HTTP status is 200. Both main evaluation calls must receive the identical ordered, deduplicated pool of genuine discovered IDs. A passing membership control is operational evidence for this sample, not proof of every provider implementation detail. `filterEvidence=sample-membership-only` denotes this limited check. A candidate returned in both forced-pool responses is **jointly returned**, not proven to have positive affinity or cultural compatibility. The runner always reports `culturalCompatibility=unverified`; determining actual compatibility requires separately supported affinity semantics or human assessment. An originally shared ID has independent discovery evidence, which stays distinct from newly jointly returned IDs.

Deduplicate by genuine ID within each domain, preserve each original first occurrence and its discovery position, and record whether a candidate was originally shared or appeared on only one side. Label an ID newly doubly returned only when it was absent from the original intersection and both common-pool responses actually contain that exact ID. Keep discovery positions separate from new evaluation positions. An absent candidate is unobserved, never disliked; never assign a fabricated bottom rank, zero affinity, or explainability value. Compare the original-intersection subset and newly expanded subset only under the same two common-pool evaluation responses and hard rules.

## Larger paired experiment and budgets

After the single-domain contract succeeds, test all three domains with the predeclared P1–P4 profiles. For a fair candidate-generation comparison, use `take=20` independently per audience, yielding a union of at most 40 IDs per domain. Re-evaluate each complete union with `take=40` or its actual smaller size. The union is below the documented response maximum, but that still does not guarantee full return coverage. Refuse an encoded URL above a predeclared 6,000-byte safety cap; record an incomplete experiment rather than silently dropping IDs or adding batches.

| Signals per audience | Search | Discovery | Common-pool evaluation | Core logical calls |
| --- | --- | --- | --- | --- |
| 1 | 2 | 6 | 6 | 14 |
| 2 (P1–P4) | 4 | 6 | 6 | 16 |
| 3 | 6 | 6 | 6 | 18 — exceeds the current cap; do not run as one plan |

These core counts leave no room for page-two recovery at two interests per side. Keep the existing ceiling of **16 logical calls / 24 retry-inclusive attempts** for any future full experiment; prefer no retries during contract testing. Controls for every domain add six calls, so validate them in separately authorized domain experiments, not by exceeding the core cap. Four approved 16-call core profiles require up to **64 logical calls / 64 attempts without retries**, conservatively reserve **96 attempts** under the existing per-plan quota policy. Smoke, first journey, and domain controls are additional reservations. The account's actual allowance overrides these maxima; no published Qloo quota is assumed.

## Validation and failure handling

- Validate status, JSON envelope, nonempty ID/name fields, verifiable requested entity type (stop for adapter review if the actual response uses another documented field), requested page size, unique-ID handling, result membership in the requested pool, and correspondence to the fixed audience signals. Never trust HTTP 200 alone.
- An absent candidate means **not evaluated/returned**, not known dislike. Keep candidates only when actual validated evidence returns for both audiences. Report the count requested, returned per side, doubly returned, originally shared, and newly doubly returned.
- Reapply explicit exclusions locally. Reject conflicting known metadata and known film, total-program, or rating violations. Missing runtime/rating permits only conceptual output; verified scheduling requires independently established minutes and rating, plus separate rights, availability, and venue checks.
- An outsider ID in a filtered response invalidates that domain's filter contract. Empty, partial, or malformed responses produce distinct inconclusive/error outcomes; do not assign a speculative filtering cause. Authentication, quota, timeout, redirect, or upstream errors stop the bounded session. Do not try another host or automatically repeat calls.
- Keep raw payloads, returned names/IDs, headers, and credentials ephemeral and private. Durable records contain profile/domain IDs, status/error category, counts, schedule category, calls/attempts, and elapsed time only. Do not publish a raw Qloo response dataset.

## Comparison and decision rule

For candidate-generation comparison, score two eligible subsets using the **same common-pool evaluation responses and ranks**: (A) only IDs from the original discovery intersection; (B) all IDs returned and validated for both audiences during union evaluation. Apply identical hard rules and verified-film preference. This isolates the addition of candidate IDs. Separately record the production intersection method on its original discovery ranks, but do not numerically compare its rank sums to the union-evaluation sums: list context and truncation changed.

Ranks can order options within a fixed domain, audience, and response context. Their gaps are not cardinal preference differences. Adding ranks across domains is the existing explicit heuristic, not calibrated fairness or human satisfaction. Smaller worst-rank sums are expected when optimizing that objective on an expanded pool; they are insufficient justification by themselves.

Predeclare these descriptive measures: valid/inconclusive/error counts; requested-versus-returned coverage; newly doubly returned IDs; complete conceptual versus duration-verified coverage; known violations; rejection correctness; provenance completeness; calls/attempts and latency. Report wins, ties, losses, missing comparisons, and the original-intersection controls. Ask independent humans whether any added candidates are useful before claiming user benefit.

## Minimal human acceptance gate (not yet run)

The recorded aggregate-only Bridge report cannot reconstruct candidate cards or human labels. A later, separately authorized evaluation must prepare private, ephemeral cards from validated candidate identities and evidence; do not publish raw Qloo responses or person-level judgments. For the artist-only sample, each card identifies an artist and gives the same concise, source-qualified explanation format used by the application's Evidence view. Mark the card **artist candidate, not a complete event or schedule**. Show each audience member the same cards in independently randomized, blinded order, without method labels or the other side's answers. No login or new public UI is needed; a private paper or local worksheet suffices.

For every card, each audience member independently records: (1) relevant to their interests: yes/no/unsure; (2) would accept this artist as part of a joint event: yes/no/unsure; (3) explanation understandable: yes/no/unsure; (4) unacceptable even as a compromise: yes/no; and an optional short reason. Ask these questions before showing the other side's choices. A missing answer is **unobserved**. A jointly acceptable candidate requires both explicit acceptances and neither side's veto; filter membership or ordinal rank cannot fill a missing human answer.

Compare with a simple **A-first, first-eligible baseline selected from the identical validated common-pool evaluation responses**, using the same known-rule and provenance checks. Freeze both selections before collecting ratings. If baseline and Bridge choose the same candidate, report a tie; if either has no eligible candidate or comparable evidence, mark the pair non-comparable. Also report the original-intersection baseline's no-candidate outcome separately when its pool is empty; do not invent a baseline candidate. Rotate display order and hide method labels until both sides submit. For each method report the number of cards shown, independent acceptance/relevance/clarity/veto responses per side, both-accept/no-veto count, missing responses, and paired wins/ties/losses on jointly acceptable candidates. Keep denominators and artist-only scope visible. This measures perceived usefulness in a small, selected sample; it does not establish population satisfaction, full three-domain feasibility, or a live scheduling right.

Proceed to a separately reviewed isolated prototype only if all three domain filter contracts pass, **at least two of the four fixed profiles** gain an eligible doubly returned candidate in a previously blocked domain, no known hard-rule or provenance violation occurs, and the approved budget is sufficient. A newly complete conceptual path is recorded separately from a verified schedule. Failure to meet this small-sample threshold means retain the production intersection method and document the limitation; do not tune profiles after seeing outputs. Even meeting the threshold supports further engineering research only, not competitive superiority or public deployment.
