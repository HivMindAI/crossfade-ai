# Live Qloo benchmark protocol — no results collected

Run this only after the [three-request smoke check](QLOO.md), provider quota setup, and separate account-owner approval for the full live journey. It is a small descriptive test of the product claim, not a population estimate or a substitute for judging access. The four contrasting P1–P4 audience pairs and their names are fixed in [LIVE_JOURNEY.md](LIVE_JOURNEY.md) before seeing any Qloo output. Keep the exact inputs, rule settings, application commit, date, key host category, and `take=20`/page-two policy constant. Record a skipped profile and its reason; never replace it with a more favorable pair after observing results.

## Bounded execution

1. Confirm the key is for `https://hackathon.api.qloo.com`, the issuer's actual allowance, the healthy shared guard, and the owner-approved maximum plan count. Reserve **24 possible HTTP attempts per plan**, including retries. A first plan plus one rejection repair costs up to two plan reservations per profile. Stop when the remaining allowance cannot cover another full reservation; never bypass the guard for a benchmark.
2. For each approved profile, resolve exact Search matches in the UI. If none or multiple remain, mark the profile `unresolved` and stop that profile. Do not choose a different seed merely to improve coverage. Record endpoint statuses and counts only; keep Qloo names, IDs, headers, and raw bodies out of durable logs.
3. Run one initial live plan, then reject the displayed film once if a path exists and the reserved budget allows a second plan. Observe whether the rejected ID disappears, whether the replacement is evidence-supported, and whether a no-solution state is explained. Do not count an unattempted repair as a failure or a success.
4. For an offline comparison, use the **same already retrieved Search and Insights sets** from each successful run. In a controlled, ephemeral evaluator, form a baseline by taking the first audience-A-ranked eligible shared artist, movie, and book, preferring a fully verified film when one exists and applying the same exclusion and known-metadata checks. Apply the same conceptual/scheduled label. Compare the baseline's single path with CROSSFADE's fairness path and distinct directional paths. Do not issue extra Qloo requests or persist the evidence sets. The current offline evaluator in `src/lib/evaluation.ts` compares both strategies on a captured in-memory matrix without additional source calls. It accepts synthetic mode only; an authorized live comparison would require a separate ephemeral evaluator adaptation. No live baseline result is claimed today.

## Measures and denominators

The offline harness `evaluateSyntheticScenario` runs CROSSFADE and a simple audience-A-first feasible baseline against the same post-recovery evidence matrix and hard rules. It reports complete-path coverage, worst-audience ordinal rank sum, unique candidate IDs, number of alternatives, repair exclusion correctness, known hard-rule violations, receipt completeness, source calls, and elapsed milliseconds. Its baseline favors fully verified film metadata when available, as the product does. The baseline is descriptive: a single first-feasible path has no directional alternative by design. Synthetic fixture values are never presented as live Qloo performance or human preference measurements.

The smoke reserves **3 logical calls / 3 attempts**. Each plan reserves up to **16 logical calls / 24 retry-inclusive attempts**. Four initial profiles reserve up to **64 logical calls / 96 attempts**; one film rejection repair per profile doubles that to **128 / 192**. These are worst-case application bounds, not Qloo quota claims. The actual account allowance determines how many runs can be authorized.

| Measure | Numerator / denominator or observation | Treatment of missing data |
| --- | --- | --- |
| Valid Qloo response rate | HTTP 2xx responses passing the documented envelope, requested type, ID/name, and page-size checks / all completed Qloo HTTP responses across Search and Insights; also report transport timeouts separately | A 2xx with malformed JSON or shape is invalid; an empty but valid array is valid response structure, not useful evidence. Retries count as attempts. |
| Shared candidate coverage | Initial plans with at least one **eligible** shared ID in each artist/movie/book domain / initial plans with all required Search and Insights responses valid | Report per-domain counts and page-two recovery separately. A conceptual movie can be eligible but is not a verified schedule. |
| Distinct valid alternatives | Number of distinct, non-dominated output paths (0–3) per completed plan, and plans with at least two / plans with a valid path | Verify different entity combinations and genuine A/B ordinal trade-offs. Do not count cosmetic wording changes. |
| Hard constraint violations | Paths with a known film-minute, total-minute, content-rating, or exclusion violation / paths inspected, for CROSSFADE and baseline | Unknown runtime or rating is **unverified**, never recorded as a pass. Record conceptual-path count separately. Rights and availability are separate external gates. |
| Repair success | Attempted rejection repairs producing a new valid path without the rejected ID / attempted rejection repairs | Also report honest no-solution and request failure as separate outcomes. Never count a skipped repair. |
| Evidence traceability | Displayed components whose IDs appear in both audience result sets with correct per-request ranks and source labels / displayed components inspected | Check in an ephemeral evaluator or during the controlled session; do not save Qloo IDs or raw responses. Missing recognized explainability is reported separately, not invented. |
| Response latency | Median and maximum server `metrics.elapsedMs` and observed browser submit-to-result time per completed initial/repair run | Report sample size and failures/timeouts separately. Synthetic timings are never substituted. |
| Failure rate | Initial profiles ending in unresolved Search, invalid/upstream response, quota denial, or no path / all attempted initial profiles; report each reason separately | A valid no-solution is a product outcome, not a transport error. Include skipped profiles outside the denominator. |

For the baseline, use identical eligible sets, constraints, metadata, and rejection. Record whether its first valid tuple exists and passes the same checks, plus its ordinal rank totals; compare only within the same pair of Qloo requests. Rank positions are **not** comparable calibrated affinity values across profiles or domains. A first-item baseline cannot demonstrate alternative diversity by design, so report that metric descriptively rather than claiming a quality win. The small predeclared sample, strict shared-ID intersection, possible Search ambiguity, Qloo result changes, unknown film runtime, and provider quota limit generalization. No live benchmark, baseline score, or success rate has been measured.

## Milestone 9B same-pool comparison and optional stress test

The live contract and first P1 journey must pass before evaluating competition. For each approved run, capture the planner's post-recovery evidence matrix **in memory only** during the controlled session. The product and A-first baseline must consume that same matrix, original per-audience ranks, shared-ID intersection, known-rule filter, exclusions, and verified-film preference. Do not make baseline-specific Qloo calls, persist returned names/IDs or raw bodies, or use the synthetic-only `evaluateSyntheticScenario` as though it accepted live responses. A live evaluator adaptation needs its own review and tests before it is used; no live comparison exists yet.

Compare complete-path availability first. Compare worst-audience, A, and B ordinal rank sums only when **both** methods have complete paths on the same matrix; otherwise mark each ordinal comparison `not-comparable` and record the reason (`unresolved-search`, `invalid-contract`, `upstream-failure`, `empty-domain`, `no-shared-ID`, `known-rule-block`, or `skipped`). Report conceptual versus duration-verified coverage separately, count known hard-rule violations and missing provenance, and name denominator and sample size. Rank sums are decision rules within one matrix, not calibrated affinity or a cross-profile score. The baseline's single path cannot match a method that is designed to show alternatives, so alternative count is descriptive only.

An **optional leave-one-selected-entity-out stress test** requires separate owner approval for evaluation, but no extra Qloo request when run against the frozen initial matrix. Remove one entity ID selected by the initial product fairness path from **both** methods' eligible pools, keep all other evidence and rules fixed, and recompute each method. Record the removed component's domain without its name/ID, whether each method still has a complete path, whether the removed ID is absent, and whether the replacement is conceptual or duration-verified. Repeat for other selected components only if predeclared and approved; do not select whichever removal looks favorable after viewing results. This measures fixed-pool agreement resilience, **not** the application's live repair behavior.

An actual rejection in the application may fetch a **new** Qloo matrix. Compare product and baseline on that same revised matrix and mark it separately as a live repair; never compare its ranks or coverage against a baseline using the original frozen matrix. The first authorized P1 journey permits one rejection repair only. Failed or unattempted repairs, unavailable matrices, and quota stops remain in the report with their own denominators. These procedures define a feasible test, not an observed result or a reason to publish an Agreement Stress Test UI.

## Milestone 8 offline benchmark audit

The evaluator distinguishes `verified-schedule`, `complete-conceptual`, `partial-agreement`, `no-observed-solution`, and `request-failure` with a redacted error code. Complete coverage and verified-schedule coverage are separate fields. It compares both strategies on the same initial matrix and, for repair, the same revised matrix after excluding the product-selected film. `rejectedAbsent` can be true with no path; only `replacementFound` counts a complete replacement. Source calls are shared acquisition work; the recorded planner elapsed time is not an independent baseline latency measurement. `boundedRetrieval` is always true, while `retrievalLimited` flags observed unexpanded/full capped pages; a short page does not prove exhaustiveness.

Reproduce the invented adversarial suite with:

```powershell
npx vitest run src/lib/benchmark.test.ts --silent=false --reporter=verbose
```

Nine fixed synthetic cases cover disjoint lists, an empty domain, sparse overlap, asymmetric lists, missing metadata, duplicate IDs, rejection, incomplete retrieval, and upstream failure. The observed product outcomes were four verified schedules, one complete conceptual plan, two partial agreements, one no observed solution, and one request failure. Both methods had identical complete coverage (5/8 structurally valid runs; 5/9 attempted) and verified coverage (4/8 valid; 4/9 attempted), zero known hard-rule violations on evaluated outputs, and the same available partial evidence. Five repairs were attempted; all omitted the rejected ID, but only one produced a complete replacement. These are fixture outcomes, not real customer or Qloo results.

| Ordinal metric, product versus baseline | Wins | Ties | Losses | No comparable full path |
| --- | --- | --- | --- | --- |
| Worst-audience rank sum | 1 | 4 | 0 | 4 |
| Audience A rank sum | 0 | 4 | 1 | 4 |
| Audience B rank sum | 1 | 4 | 0 | 4 |

Worst-audience non-loss is expected because CROSSFADE optimizes that objective over the same feasible pool; it is not independent evidence of superior negotiation. The A-first baseline can serve A earlier at B's expense. Alternative diversity is descriptive because the baseline emits one path by construction. Both methods also share the local eligibility filter, so a bug there can affect both; the independent Pareto-oracle and constraint tests remain necessary. No calibrated affinity, human satisfaction, population effect, or live latency inference is supported.

## Redacted live record template

| Commit/date | Profile | Attempted/resolved/valid | Calls/HTTP attempts | Eligible A/M/B | Paths/schedule status | Rejection outcome | Latency ms | Failure category |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pending | P1–P4 | No authenticated runs | — | — | — | — | — | — |

Record aggregate numerators and denominators alongside the table after a real run. Keep this file free of credentials, returned Qloo names or IDs, and raw responses.
