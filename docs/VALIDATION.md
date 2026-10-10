# Validation log

## 2026-10-10

- Repository started with only the MIT license on `main`.
- Official [hackathon overview](https://qloo.devpost.com/) and [rules](https://qloo.devpost.com/rules) reviewed. A public, externally hosted working application is required for submission.
- Qloo's [public documentation mirror](https://github.com/qloo/docs-public) reviewed for Search, Insights, explainability, exclusions, and comparison inputs.
- `QLOO_API_KEY`: absent in the local process. No authenticated Qloo request was sent.
- Public deployment: not configured against an account, not tested.
- `npm run typecheck`: passed.
- `npm run format:check`: passed.
- `npm run lint`: passed without warnings.
- `npm test`: 35/35 passed across four files, including 20 reproducible synthetic evaluation scenarios.
- `npm run build`: passed; `/` is static and `/api/plan` is a dynamic server route.
- `npm run test:e2e`: 4/4 passed using locally installed Chrome (planning and repair, impossible rules, server error, and live-mode no-fallback behavior).
- `npm run qloo:smoke` without a key exited before sending a request, as designed. A live run remains unverified.
- `npm audit --omit=dev`: zero advisories. The initial full audit reported five high advisories in the development-only `eslint-config-next` dependency graph, stemming from `braces` through `micromatch`/`fast-glob`. The installed Next-aligned config had no non-breaking npm-advised fix. Recheck before submission.
- Visual review: desktop 1440 px and mobile 390 px screenshots inspected in local Chrome; synthetic provenance, responsive layout, and result hierarchy appeared coherent. Screenshots were temporary and removed.
- Playwright-managed Chromium download failed because the CDN was unreachable in this environment. Local Chrome was used for the successful browser run. The [initial PR CI run passed](https://github.com/HivMindAI/crossfade-ai/actions/runs/38065856447), including Chromium browser tests on GitHub's runner.

## Milestone 2 hardening, 2026-10-10

- Qloo Search and Insights parameter names, result limits, pagination, exclusions, and retry behavior were compared with the [public Qloo reference](https://github.com/qloo/docs-public). The reference does not establish a movie runtime field with minute units or a stable nested explainability JSON schema. This implementation fails the live runtime gate closed and only exposes explicit matching influence ID/value pairs. These contract checks use synthetic transport responses; no authenticated Qloo request was made.
- Deterministic orchestration now selects page-two recovery only for a missing domain with a full result page. The recovery fixture observed 10 logical source calls, including two recovery calls, and at most three concurrent calls. A no-shared-entity fixture observed eight source calls and no recovery. HTTP retries have a separate 24-attempt cap.
- The conceptual program includes 45 minutes beyond film runtime. Every proposed path is checked against movie length, total-program length, rating, and exclusions; screening rights, availability, ticketing, and venue remain unverified.
- `npm run qloo:smoke` exited 1 with `QLOO_API_KEY is required. No request sent.` Its authenticated search, Insights, and cross-domain checks remain pending.
- `npm audit --omit=dev --json` and full `npm audit --json` both reported zero current advisories (0 high, 0 total). `eslint-config-next@16.4.0` still depends on `fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3`, but the npm advisory service did not flag them in this run. No dependency override or unsafe upgrade was made. Recheck before release.
- `npm run format:check`, `npm run typecheck`, `npm run lint`, and `npm run build`: passed. The production build prerendered `/` and kept `/api/plan` dynamic. The Windows sandbox blocked child-process creation for Vitest and Next's TypeScript worker (`spawn EPERM`); the authorized unsandboxed reruns passed.
- `npm test`: 49/49 passed across six files. The 15 ms delayed synthetic transport measured eight source calls, a peak of three concurrent calls, and 48 ms planner elapsed time on this local run. This fixture timing is not a live Qloo latency estimate.
- `npm run test:e2e`: 5/5 passed in locally installed Chrome, covering repair, provenance, no-solution gaps, total-program cap, and no-key live behavior.
- Milestone 2 PR CI result: pending after push.

Record future live checks here with date, environment, endpoint status, returned entity count, and redacted failure details. Do not store a key or raw Qloo payload.
