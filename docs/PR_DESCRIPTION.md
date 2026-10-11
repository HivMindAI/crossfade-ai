# CROSSFADE AI — MVP through Milestone 5

<!-- Account owner: the GitHub integration previously received HTTP 403 when editing PR #1. Copy this file into the PR description at https://github.com/HivMindAI/crossfade-ai/pull/1, then review current checks before merging. -->

## Implementation for engineering review

This PR contains the existing CROSSFADE MVP and Milestones 2–5 on `feature/crossfade-mvp`. It is a bounded, deterministic, tool-using cultural negotiation prototype with no paid LLM dependency.

- Resolve named interests with Qloo Search, gather separate artist, movie, and book Insights for two audiences, and intersect results by stable entity ID. Record tool selection, evidence gaps, conditional page-two recovery, and replanning after rejection. Limits are 16 logical source calls, 24 retry-inclusive Qloo HTTP attempts, and three concurrent source calls.
- Compare within-request ordinal rank positions on a Pareto frontier. Show fairness-first and directional alternatives only when distinct evidence-backed trade-offs exist. Ranks are not probabilities or calibrated Qloo affinity scores. Return eligible shared-candidate counts by domain for a future redacted live evaluation.
- Produce a **duration-verified** proposal only when known film minutes, rating, and the full 45-minute non-film agenda satisfy the selected limits. Missing film runtime or rating yields a clearly marked **conceptual** experience; those scheduling gates remain unverified. Known violations and rejected IDs still exclude candidates.
- Separate source evidence, recognized influence pairs, algorithmic ranks, hard rules, creative framing, and missing evidence. Synthetic fixture labels are explicit. Rejection feedback names changed components and explains the reevaluation; rerunning unchanged inputs no longer claims a rejection.
- Keep credentials server-side. Refuse redirects, restrict Qloo and Redis HTTPS origins, validate and size-limit upstream responses, cap incoming request bodies, check browser origin, and keep live planning disabled by default. A server-only atomic Redis reservation now fails closed before Qloo when the shared hourly budget is missing, exhausted, or unhealthy. Each admitted plan conservatively reserves up to 24 Qloo attempts across instances.
- Provide a bounded, opt-in three-request Qloo smoke procedure, a predeclared full live-journey protocol, and $0-tier-oriented deployment instructions. No provider account was configured and nothing was deployed.

## Milestone 5 correctness and security hardening

- Enumerate all bounded shared-candidate combinations and extract the exact two-audience Pareto frontier; the former top-12 cutoff could suppress legitimate extreme alternatives. Adversarial and exhaustive-oracle tests cover this change.
- Carry observable browser cancellation through the route, bounded workers, Qloo fetches, and retry waits. Already reserved shared quota is never refunded. Host-specific disconnect behavior still needs deployment verification.
- Separate synthetic and live process-local emergency rate windows. A provider-enforced per-source rule and the independent shared Qloo quota remain required for a public live demo.
- Revalidate a previously selected Qloo ID with a documented Search request of up to 100 results, checking ID, name, and type again. A disappeared ID fails closed for reselection.
- Pin the GitHub Actions runner to Ubuntu 24.04 and add keyboard arrow/Home/End navigation for result tabs without changing the visual design.

## Verification

- `npm ci`, formatting, TypeScript typecheck, lint, and production build: **passed**.
- Unit and integration tests: **89/89 passed** across nine files, including adversarial and exhaustive Pareto cases, aborts, entity revalidation, oversized provider pages, and offline quota admission.
- Browser tests: **11/11 passed** in local Chrome, including keyboard tab navigation, rejection repair, conceptual live-response mock, no-solution rules, mobile layout, and stale-request cancellation.
- Production audit: **zero advisories**. Full npm audit: **five high development-only advisories** in `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`; the advisory offers no compatible patched `braces` release and suggests an incompatible Next 14 lint-config downgrade. Recheck before release.
- Synthetic 40×40×40 Pareto benchmark: **64,000 combinations in 327 ms** on the local Windows runner; this is not live Qloo latency.
- `npm run qloo:smoke` ran in offline mode and sent **zero authenticated requests**. Offline transport and Redis mocks are not live provider validation.
- [Milestone 4 implementation CI passed](https://github.com/HivMindAI/crossfade-ai/actions/runs/38113489941), including production audit, formatting, types, lint, tests, build, and Chromium browser tests.
- [Milestone 3 final-head CI passed](https://github.com/HivMindAI/crossfade-ai/actions/runs/38111917781). See [PR checks](https://github.com/HivMindAI/crossfade-ai/pull/1/checks) and the [validation log](https://github.com/HivMindAI/crossfade-ai/blob/feature/crossfade-mvp/docs/VALIDATION.md) for the current branch-head CI and detailed checks.

## Security and remaining release gates

Only an empty-key `.env.example` is tracked; no generated/dependency directories are tracked; the MIT license is unchanged. No key or Redis credential was available in the current runtime. The separate per-process emergency windows are local brakes; the shared guard is offline-tested but requires a real claimed provider database, issued Qloo allowance, configured ceiling, and verified failure/429 behavior. A provider per-source rule and public-host behavior remain unverified. Cross-request caching is deferred pending privacy and expiry review.

No authenticated Qloo Search or Insights request, live shared-entity sample, or complete live UI journey has occurred. The issued key's correct host and real response shape remain unverified. The public Qloo reference does not establish film runtime in minutes. Independently sourced minutes/rating and separate screening rights, availability, ticketing, venue, and public deployment checks remain mandatory.

**Do not merge, deploy, or submit to Devpost until engineering review and the independent authenticated integration and public-deployment gates pass.**
