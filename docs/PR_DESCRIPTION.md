# CROSSFADE AI — reviewed release candidate through Milestone 9I

Description for existing PR #1 on `feature/crossfade-mvp`. The release-candidate changes through Milestone 9I were prepared and verified locally before the separately authorized Milestone 10 feature-branch publication.

## Behavior

CROSSFADE builds an inspectable cultural experience for two audiences and explains what prevents agreement when the retrieved evidence cannot complete a plan. It resolves named interests, gathers separate artist/movie/book Insights, and compares shared entity IDs using transparent ordinal Pareto trade-offs. Distinct directional alternatives appear only when supported by the retrieved pool.

- Preserve full provider-page counts and original result positions through local rejection checks and pagination. Reject conflicting known metadata, including conflicting duplicate IDs. Conditional recovery stays bounded at 16 logical source calls, 24 retry-inclusive HTTP attempts, and three concurrent calls; queued work stops after an observed failure.
- Report domain-level observed gaps, per-side bounded retrieval, insufficient recovery budget, checked rules, and pending conditions. Empty results have no invented filtering cause. Up to two partial receipts per domain remain visible without being presented as a complete schedule.
- Name rejected entities, evidence-supported replacements, partial alternatives when another domain blocks the plan, and unresolved or failed repairs. Validate successful planner responses before rendering; malformed or contradictory results become explicit errors.
- Keep unknown film runtime/rating conceptual. A duration-verified proposal requires known minutes, allowed rating, and film plus the proposed 45-minute agenda within the selected limits. Rights, availability, venue, and authenticated metadata remain separate checks.
- Keep synthetic provenance explicit, credentials server-side, redirects disabled, response/body sizes bounded, and the hackathon key destination fixed to `https://hackathon.api.qloo.com`. Live mode remains default-off and requires a healthy atomic shared quota reservation before Qloo.
- Parse Search's owner-observed top-level `results` array and string `types` arrays separately from Insights' `results.entities`. Client and smoke share strict Insights classification: Movie and Book accept an exact top-level category or owner-confirmed generic `type` with the matching exact subtype, while malformed, contradictory, and duplicate results fail closed. Generic Artist subtype remains unverified. The owner completed the bounded three-request smoke, supplying aggregate Book type/subtype evidence; the repaired Book production path has only offline validation.

## Verification

- The fresh Milestone 10 publication gate completed `npm ci` (448 packages), formatting, TypeScript, lint, a production Webpack build, and the full unit/integration/contract suite: **233/233 passed** across 13 files. The built `/api/plan` server route contains the shared Insights classifier and Book category despite its source living under `scripts/`.
- The fresh browser suite: **17/17 passed** in local Chrome with approved localhost access. The managed test server owns its port, clears the Qloo key, and disables live Qloo.
- Nine invented adversarial cases compare the product with an A-first feasible baseline on identical evidence and rules, including the same revised evidence after rejection. Both methods produced four verified schedules and one complete conceptual plan; two cases were partial, one had no observed solution, and one was an upstream request failure.
- Worst-audience ordinal objective: 1 win / 4 ties / 0 losses / 4 unscored. Audience A objective: 0 wins / 4 ties / 1 loss / 4 unscored. These fixtures test implementation behavior, not real customer preference or competitive superiority. Worst-audience improvement is expected from optimizing that objective.
- Fresh production audit: **0 vulnerabilities**. The full audit reports **5 high development-only advisories** in the eslint-config-next / fast-glob / micromatch / braces chain. npm's suggested forced fix would downgrade `eslint-config-next` to 14.2.35, incompatible with this Next 16 app. No dependency was changed.
- Six new browser scenarios exercise partial receipts, conceptual replacement, no observed replacement, a partial alternative blocked elsewhere, failed repair, and malformed success. All automated provider-style test data are invented fixtures; this engineering task made no authenticated Qloo request.

## Research and release gates

`docs/BRIDGE_EXPERIMENT.md` verifies that `filter.results.entities` is documented for artist/movie/book and defines a bounded, separately authorized experiment with filter controls. Bridge Discovery has no production implementation or public UI. Cross-context rank sums must not be compared as calibrated affinity.

The owner independently observed Artist Search HTTP 200 with three valid results, Movie Insights HTTP 200 with five accepted generic-top-level results carrying exact Movie subtypes, and Book Insights HTTP 200 with five valid generic-top-level results carrying exact Book subtypes. All five Movie items had explainability objects, but their content quality remains unverified. Movie and Book Search, the repaired Book production path, a complete two-audience live journey, useful live overlap, shared Redis/provider edge controls, verified film minutes/rating, rights, public deployment, and submission remain unverified end to end. MIT is intact; no raw provider dataset or credential-bearing environment file was added.

`docs/PUBLICATION.md` records the explicit feature-branch publication and CI verification procedure. CI must be checked against the exact published commit; local checks do not establish a CI result. Engineering review, authenticated integration, public abuse controls, and deployment are separate gates; do not merge, deploy, or submit as part of this PR update.
