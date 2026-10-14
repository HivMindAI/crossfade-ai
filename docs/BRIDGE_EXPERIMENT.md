# Bridge Discovery — proposed experiment, no live results

Status: research protocol only, fixed before inspecting live results on 2026-10-13. No Bridge request, production algorithm, public control, or captured Qloo dataset has been added. The current planner remains shared-ID intersection with bounded page-two recovery.

## Hypothesis and API evidence

Separate truncated audience lists may omit a candidate from one side even when it could be returned for that side under a common candidate filter. Re-evaluating a deduplicated union might uncover additional doubly supported candidates. An omission is not evidence of dislike, and a returned rank is not a satisfaction score.

The official [entity-type parameter guide](https://docs.qloo.com/reference/available-parameters-by-entity-type) lists `filter.results.entities` and `signal.interests.entities` for **artist, movie, and book**. This was checked against Qloo's [official documentation mirror](https://github.com/qloo/docs-public/blob/main/reference/available-parameters-by-entity-type.md), specifically those three tables. The [Insights deep dive](https://docs.qloo.com/reference/insights-api-deep-dive) describes `filter.results.entities` as a comma-separated ID list and Insights `take` as at most 50. It does not guarantee that all requested candidates are returned, describe a minimum affinity threshold, or establish calibrated cross-request scores. Availability with the issued hackathon key remains unverified.

The [hackathon guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide) warns that unsupported parameters can be ignored silently. HTTP 200, empty output, and an echoed query alone do not demonstrate that a filter worked. Use only `https://hackathon.api.qloo.com`, GET `/search` and `/v2/insights`, with a server-only `X-Api-Key`. No guessed endpoint, host, score field, or entity ID is permitted.

## Gates before Bridge testing

1. Owner provides the issued key privately, confirms its host and allowance, and separately authorizes the existing maximum-three-request [smoke procedure](QLOO.md). Validate actual Search, movie Insights, and book Insights envelopes, requested types, page sizes, and useful nonempty evidence. Stop on failure.
2. Separately approve the [first live journey](LIVE_JOURNEY.md): P1, one initial plan and at most one rejection repair, with a healthy shared quota guard. This covers artist Insights and actual UI provenance as well. Reserve at most 32 logical calls / 48 retry-inclusive HTTP attempts, in addition to the smoke's 3 / 3. Leave live mode disabled after the controlled session.
3. Only after those contracts pass, authorize a distinct Bridge experiment and quota reservation. Production `/api/plan` has no Bridge mode and must not be modified to bypass its guard for research. A future isolated runner must reserve quota before dispatch, enforce the approved total across all calls, prohibit redirects, redact output, and stop on failures. No runner is implemented by this document.

## Minimum useful experiment

Use P1's **artist** domain first; it avoids treating missing film minutes as verified. Keep the two audience signal sets fixed. Begin with one artist interest per side (Miles Davis / Beyoncé); Search must resolve exact, unambiguous IDs. This is a parameter/coverage experiment, not the full production profile.

| Stage | Calls | Candidate bound / purpose |
| --- | --- | --- |
| Resolve seeds | 2 Search | One name per audience; no ID guessing |
| Independent discovery | 2 Insights | Artist, `take=10`, page 1, same exclusions |
| Common-pool evaluation | 2 Insights | One per audience, identical deduplicated union of at most 20 genuine returned IDs, `filter.results.entities=<IDs>`, `take=pool size`, page 1 |
| Filter controls | 2 Insights | One per audience with a strict nonempty subset of that union; omit an ID actually returned in that audience's main evaluation |
| **Maximum** | **8 logical / 8 HTTP attempts** | No automatic retries or pagination in this first experiment |

The six core calls alone cannot adequately detect a silently ignored filter. Require the two controls. If the union has fewer than two IDs, or a control cannot return useful evidence, record the contract as inconclusive and stop. All returned control IDs must belong to the control subset. Even a passing membership control is operational evidence for this sample, not proof of every provider implementation detail.

Deduplicate by genuine ID within each domain, preserve each original first occurrence and its discovery position, and record whether a candidate was originally shared or appeared on only one side. Keep discovery positions separate from new evaluation positions. Never assign a missing audience a fabricated bottom rank, zero affinity, or explainability value.

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

Proceed to a separately reviewed isolated prototype only if all three domain filter contracts pass, **at least two of the four fixed profiles** gain an eligible doubly returned candidate in a previously blocked domain, no known hard-rule or provenance violation occurs, and the approved budget is sufficient. A newly complete conceptual path is recorded separately from a verified schedule. Failure to meet this small-sample threshold means retain the production intersection method and document the limitation; do not tune profiles after seeing outputs. Even meeting the threshold supports further engineering research only, not competitive superiority or public deployment.
