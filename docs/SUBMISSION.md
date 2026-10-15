# Submission materials — draft, pending live validation

## Devpost description draft

CROSSFADE helps organizers sketch a shared cultural experience for two audiences with different tastes. Participants enter separate film and music interests and set hard film and total-program limits. A bounded deterministic planner resolves interests, requests separate cross-domain artist, movie, and book Insights for each group, and intersects candidates by entity ID. When a full result page leaves a gap, it conditionally requests another page. It compares non-dominated ordinal trade-offs, shows only evidence-supported alternatives, and repairs the concept when someone rejects a component or changes a rule. The interface distinguishes source results from algorithmic choices, missing evidence, and creative framing.

**Current caveat:** The local demo uses clearly labeled synthetic data. The owner observed authenticated Artist Search, Movie and Book Insights, then one real fixed two-audience P1 that ended with **no complete path** because all three domains had zero shared IDs in bounded results. A separate artist-only Bridge run returned 20 candidates for both audiences under a common filter; positive affinity and human acceptance remain **unverified**, and Bridge is not in the production planner. The public Qloo reference does not guarantee film runtime in minutes; a live recommendation without it is conceptual, not a duration-verified schedule. The concept does not establish screening rights, film availability, ticketing, or a venue. No public demo or complete live three-domain recommendation has been verified. No LLM model is used; decision-making is a transparent tool-using algorithm.

## Honest 90-second demo script

1. **0–15 s:** Open CROSSFADE. Point out the source banner: synthetic development preview. Select two contrasting audience profiles.
2. **15–35 s:** Run negotiation. Show the available fairness and audience-favoring paths, when distinct trade-offs exist, and the proposed listening, film, and reading sequence.
3. **35–55 s:** Open Evidence. Explain that each synthetic candidate appears in both audience-specific result sets and that ranks are within each request, not probabilities. Point to the **Synthetic fixture evidence** label; state that the real fixed P1 produced no complete path.
4. **55–75 s:** Reject the film. Show that the rejected component is excluded, both audiences are reevaluated, and the changed-component list names the revision. If no valid alternative remains, show the specific no-solution gap instead of pretending a repair succeeded.
5. **75–90 s:** Open Decision trace and point out PLAN, tool selection, execution, evaluation, verification, and replanning. State that the separate artist-only Bridge run improved filtered coverage, while cultural compatibility and a complete live three-domain recommendation remain unverified.

After a verified public deployment, replace the synthetic-mode demonstration with live Qloo results and update every claim here to match what was tested.

The [live journey protocol](LIVE_JOURNEY.md) predeclares profiles, redacted metrics, stopping rules, and a separate 90-second live sequence. No live success rate has been measured.

## Submission checklist

- [x] Milestone 8 local review: provider counts/ranks, duplicate metadata, explicit type validation, conservative diagnostics, typed browser-response validation, and repair states corrected; 108/108 unit/contract tests and 17/17 browser tests passed, with format, types, lint, and Webpack build passing. These edits remain local, without a new CI run.
- [x] Milestone 9A local Search contract repair: owner-observed top-level Search `results` array accepted without `success`; Insights parser remains separate. Offline contract tests, two full 128/128 unit runs, formatting, types, lint, and Webpack build passed. The owner-observed Search item fields and authenticated Insights remain open gates; no new CI run exists.
- [x] Owner-observed VALID artist-only [Bridge research](BRIDGE_EXPERIMENT.md) recorded as filtered coverage, with human acceptance pending; no production algorithm or public UI added.
- [ ] Owner authorizes the reviewed [feature-branch publication procedure](PUBLICATION.md), then verifies CI against the exact pushed SHA.

- [x] MIT license preserved
- [ ] Judge-facing repository link opens source, README/run instructions, and a detectable license. The public root URL currently opens `main` with only `LICENSE`; source is on the unmerged feature branch. The [2026 rules](https://qloo.devpost.com/rules) require a public functional repository and demo. Use a direct feature-branch link and confirm it is accepted, or separately authorize a reviewed merge/default-branch change.
- [x] Application code pushed to the [public feature branch](https://github.com/HivMindAI/crossfade-ai/tree/feature/crossfade-mvp) for [PR #1](https://github.com/HivMindAI/crossfade-ai/pull/1); `main` remains unmerged
- [x] Local synthetic primary journey
- [x] Server-only Qloo client and live smoke script
- [x] Automated test and CI configuration; [initial PR CI passed](https://github.com/HivMindAI/crossfade-ai/actions/runs/38065856447)
- [x] [Milestone 2 PR CI reviewed and passed](https://github.com/HivMindAI/crossfade-ai/actions/runs/38070292125) for hardening commit `4872b7e`
- [x] Milestone 3 local offline gates passed: 62/62 unit/integration tests, 9/9 browser tests, formatting, types, lint, build, and current zero-advisory audits
- [x] [Milestone 3 implementation CI reviewed and passed](https://github.com/HivMindAI/crossfade-ai/actions/runs/38111776786) for commit `36ab75e`
- [x] Milestone 4 shared live-plan quota implemented with an atomic Redis reservation and offline fail-closed tests
- [x] Milestone 4 local gates passed: 76/76 unit/integration tests, 10/10 browser tests, formatting, types, lint, build, and zero current audit advisories
- [x] [Milestone 4 implementation CI reviewed and passed](https://github.com/HivMindAI/crossfade-ai/actions/runs/38113489941) for commit `c5a424c`
- [x] Milestone 5 published PR CI passed; Milestone 6 local format, types, lint, 90 unit/integration tests, Webpack production build, and 11 browser tests passed. Milestone 6 edits have no published CI until an authorized push.
- [x] Milestone 7 local agreement diagnostics, evidence receipts, same-pool synthetic evaluator, and four predeclared live profiles prepared. Final local checks: 98/98 unit/integration, 11/11 browser, format, types, lint, and Webpack build. Milestones 6–7 remain uncommitted and unpushed; neither has CI.
- [x] Owner verified the shared Redis Lua reservation on a disposable key: two admissions, exhausted third, valid TTL, cleanup; application 429/503 mapping has offline tests
- [ ] Complete Search result-item contract and full live three-domain recommendation verified (owner observed valid Artist Search plus Movie/Book subtype metadata; fixed P1 returned no complete path)
- [ ] Qloo API host verified against the issued key instructions
- [x] Hackathon-key destination restricted in code and smoke script to `https://hackathon.api.qloo.com`; owner observed Artist Search, Movie and Book Insights HTTP 200, a no-path P1, and a separate VALID artist-only Bridge run
- [ ] Conceptual live results and their unverified scheduling gates checked against an authenticated response
- [ ] Film runtime units and complete program timing verified against live metadata
- [ ] Qloo account limits reviewed; shared plan ceiling aligned to the 24-attempt worst case
- [ ] Edge per-source rate control and public abuse behavior verified on an eligible host
- [ ] Several predeclared live profiles evaluated for shared-entity coverage without fabricated measurements
- [ ] Predeclared [live benchmark](LIVE_BENCHMARK.md) measured against the simple first-eligible baseline
- [ ] Public screening rights, availability, ticketing, and venue arrangements verified
- [ ] Public synthetic preview deployed and tested; [Render Free path](DEPLOYMENT.md#first-public-url-synthetic-only-render-free-preview) prepared, awaiting separate authorization and publication
- [ ] Public Live Qloo mode secured and tested separately from the synthetic preview
- [ ] Devpost project submitted by the account owner
