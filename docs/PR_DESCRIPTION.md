# CROSSFADE AI — MVP through Milestone 4

<!-- Account owner: the GitHub integration previously received HTTP 403 when editing PR #1. Copy this file into the PR description at https://github.com/HivMindAI/crossfade-ai/pull/1, then review current checks before merging. -->

## Implementation for engineering review

This PR contains the existing CROSSFADE MVP and Milestones 2–4 on `feature/crossfade-mvp`. It is a bounded, deterministic, tool-using cultural negotiation prototype with no paid LLM dependency.

- Resolve named interests with Qloo Search, gather separate artist, movie, and book Insights for two audiences, and intersect results by stable entity ID. Record tool selection, evidence gaps, conditional page-two recovery, and replanning after rejection. Limits are 16 logical source calls, 24 retry-inclusive Qloo HTTP attempts, and three concurrent source calls.
- Compare within-request ordinal rank positions on a Pareto frontier. Show fairness-first and directional alternatives only when distinct evidence-backed trade-offs exist. Ranks are not probabilities or calibrated Qloo affinity scores. Return eligible shared-candidate counts by domain for a future redacted live evaluation.
- Produce a **duration-verified** proposal only when known film minutes, rating, and the full 45-minute non-film agenda satisfy the selected limits. Missing film runtime or rating yields a clearly marked **conceptual** experience; those scheduling gates remain unverified. Known violations and rejected IDs still exclude candidates.
- Separate source evidence, recognized influence pairs, algorithmic ranks, hard rules, creative framing, and missing evidence. Synthetic fixture labels are explicit. Rejection feedback names changed components and explains the reevaluation; rerunning unchanged inputs no longer claims a rejection.
- Keep credentials server-side. Refuse redirects, restrict Qloo and Redis HTTPS origins, validate and size-limit upstream responses, cap incoming request bodies, check browser origin, and keep live planning disabled by default. A server-only atomic Redis reservation now fails closed before Qloo when the shared hourly budget is missing, exhausted, or unhealthy. Each admitted plan conservatively reserves up to 24 Qloo attempts across instances.
- Provide a bounded, opt-in three-request Qloo smoke procedure, a predeclared full live-journey protocol, and $0-tier-oriented deployment instructions. No provider account was configured and nothing was deployed.

## Verification

- Local formatting, TypeScript typecheck, lint, and production build: **passed**.
- Unit and integration tests: **76/76 passed** across seven files, including an offline mock Qloo-style journey through rejection and no-solution.
- Browser tests: **10/10 passed** in local Chrome, including rejection repair, conceptual live-response mock, missing-key behavior, no-solution rules, mobile layout, stale-request cancellation, and rerun wording.
- Current production and full npm audits: **zero advisories**. An earlier audit flagged five development-only lint-dependency advisories; the installed path remains, but the current advisory service does not flag it. No incompatible downgrade was made.
- `npm run qloo:smoke` ran in offline mode and sent **zero authenticated requests**. Offline transport and Redis mocks are not live provider validation.
- [Milestone 3 final-head CI passed](https://github.com/HivMindAI/crossfade-ai/actions/runs/38111917781). See [PR checks](https://github.com/HivMindAI/crossfade-ai/pull/1/checks) and the [validation log](https://github.com/HivMindAI/crossfade-ai/blob/feature/crossfade-mvp/docs/VALIDATION.md) for the current branch-head CI and detailed checks.

## Security and remaining release gates

Only an empty-key `.env.example` is tracked; no generated/dependency directories are tracked; the MIT license is unchanged. No key or Redis credential was available in the current runtime. The per-process rate window is a local brake; the new shared guard is offline-tested but requires a real claimed provider database, issued Qloo allowance, configured ceiling, and verified failure/429 behavior. Provider WAF protection and public-host behavior remain unverified. Cross-request caching is deferred pending privacy and expiry review.

No authenticated Qloo Search or Insights request, live shared-entity sample, or complete live UI journey has occurred. The issued key's correct host and real response shape remain unverified. The public Qloo reference does not establish film runtime in minutes. Independently sourced minutes/rating and separate screening rights, availability, ticketing, venue, and public deployment checks remain mandatory.

**Do not merge, deploy, or submit to Devpost until engineering review and the independent authenticated integration and public-deployment gates pass.**
