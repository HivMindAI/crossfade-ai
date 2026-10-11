# CROSSFADE AI — MVP, Milestone 2 and Milestone 3

<!-- Account owner: if the GitHub integration cannot edit PR #1, copy this file into the PR description at https://github.com/HivMindAI/crossfade-ai/pull/1. Review current checks on the PR before merging. -->

## Implementation for engineering review

This PR contains the existing CROSSFADE MVP and its Milestone 2–3 hardening on `feature/crossfade-mvp`. It is a bounded, deterministic, tool-using cultural negotiation prototype with no paid LLM dependency.

- Resolve named interests with Qloo Search, gather separate artist, movie and book Insights for two audiences, and intersect results by stable entity ID. Record tool selection, evidence gaps, conditional page-two recovery, and replanning after a rejection. Limits are 16 logical source calls, 24 retry-inclusive HTTP attempts and three concurrent source calls.
- Compare within-request ordinal rank positions on a Pareto frontier. Show a fairness-first path and directional alternatives only when distinct evidence-backed trade-offs exist. Ranks are not probabilities or calibrated Qloo affinity scores.
- Produce a **duration-verified** proposal only when film minutes, rating and the full 45-minute non-film agenda satisfy the selected limits. Missing film runtime or rating can yield a clearly marked **conceptual** experience; missing values have not passed the scheduling gates. Known violations and rejected IDs still exclude candidates.
- Show Qloo-returned data, recognized influence pairs, algorithmic ranks, hard rules, creative framing, and missing evidence separately. Synthetic development fixtures are labeled throughout and never represented as live Qloo data.
- Keep the key server-side; refuse redirects with the key; permit only the standard and hackathon Qloo HTTPS hosts; validate and size-limit upstream responses; cap request bodies; check browser origin; and keep live planning disabled by default with `QLOO_LIVE_ENABLED`.
- Improve the existing UI's mobile layout, accessible status and error feedback, visible repair changes, and cancellation of obsolete in-flight requests. Add a bounded, opt-in live smoke procedure and free-tier-oriented deployment checklist without deploying.

## Validation

- Local formatting, TypeScript typecheck, lint and production build: **passed**.
- Unit and integration tests: **62/62 passed** across six files.
- Browser tests: **9/9 passed** in local Chrome, including rejection repair, conceptual live-response mock, missing-key behavior, no-solution rules, mobile layout and stale-request cancellation.
- [Milestone 3 implementation CI passed](https://github.com/HivMindAI/crossfade-ai/actions/runs/38111776786), including the production audit, formatting, types, lint, tests, build, and Chromium browser suite.
- Current production and full npm audits: **zero advisories**. An earlier audit flagged five development-only lint-dependency advisories; the installed dependency path remains, but the current advisory service does not flag it. No incompatible downgrade was made.
- Synthetic timed transport: eight source calls, peak concurrency of three, 48 ms elapsed with a 15 ms artificial delay per call. Conditional recovery used ten calls. These are fixture measurements, not live Qloo performance.
- See [PR checks](https://github.com/HivMindAI/crossfade-ai/pull/1/checks) and the [validation log](https://github.com/HivMindAI/crossfade-ai/blob/feature/crossfade-mvp/docs/VALIDATION.md) for the current branch-head CI and detailed checks.

## Security and remaining release gates

Only an empty-key `.env.example` is tracked; credential-pattern scanning found no matches, generated/dependency files are not tracked, and the MIT license is unchanged. The in-memory rate window is process-local, so a shared provider-level rule or equivalent control is still required before a public multi-instance live demo. Cross-request caching is deferred until privacy, key scoping and expiry can be validated.

No official `QLOO_API_KEY` was available in this runtime. The smoke script sent **zero** authenticated requests here. The key's correct host, real Search/Insights response shape, explainability values, and complete live UI journey remain unverified. The public Qloo reference does not establish film runtime in minutes, so independently sourced minutes and rating are required before treating a conceptual film suggestion as a schedule. Screening rights, availability, ticketing, venue and public deployment are separate gates.

**Do not merge, deploy or submit to Devpost until engineering review and the independent authenticated integration and public-deployment gates pass.**
