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
- `npm audit --omit=dev`: zero advisories. Full `npm audit`: five high advisories in the development-only `eslint-config-next` dependency graph, stemming from `braces` through `micromatch`/`fast-glob`. The installed Next-aligned config has no non-breaking npm-advised fix; this does not ship in the production bundle. Recheck before submission.
- Visual review: desktop 1440 px and mobile 390 px screenshots inspected in local Chrome; synthetic provenance, responsive layout, and result hierarchy appeared coherent. Screenshots were temporary and removed.
- Playwright-managed Chromium download failed because the CDN was unreachable in this environment. Local Chrome was used for the successful browser run. CI is configured to install Chromium on GitHub's runner, but CI itself has not yet run.

Record future live checks here with date, environment, endpoint status, returned entity count, and redacted failure details. Do not store a key or raw Qloo payload.
