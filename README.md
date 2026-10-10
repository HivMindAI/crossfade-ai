# CROSSFADE

**Turn cultural differences into experiences worth sharing.** CROSSFADE is an agentic cultural negotiation prototype for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). It builds a three-act cultural program for two audiences, using separate taste queries, shared entity IDs, explicit constraints, and visible decision traces.

> **Current status:** The local end-to-end journey works with **SYNTHETIC / NOT REAL QLOO DATA**. `QLOO_API_KEY` was unavailable during implementation. The live client is built against documented endpoints but has **not** completed an authenticated round trip. No public demo has been deployed or submitted.

The implementation is published for review in [PR #1](https://github.com/HivMindAI/crossfade-ai/pull/1) on `feature/crossfade-mvp`. The [GitHub Actions CI run](https://github.com/HivMindAI/crossfade-ai/actions/runs/38065856447) passed for the initial MVP. Milestone 2 changes remain on that feature branch until review; `main` has not been merged.

## Run locally

Requires Node.js 24 and npm. The app uses only free and open-source dependencies.

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. The default **Synthetic demo** mode needs no credentials. Choose a preset, select **Find the shared ground**, inspect up to three evidence-supported paths, reject a component, or change film and total-program rules and select **Repair the experience**.

To try live Qloo after receiving a hackathon key, create `.env.local` from `.env.example` and set `QLOO_API_KEY`. Select **Live Qloo** in the UI. The key remains server-side. The server never falls back to fixtures if a live request fails.

## Verification

```bash
npm run typecheck
npm run format:check
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

On a local machine with Chrome already installed, Playwright uses that installation. In CI it installs its own Chromium build.

The live smoke check needs an actual key in the process environment:

```bash
QLOO_API_KEY=your-key npm run qloo:smoke
```

On PowerShell, set `$env:QLOO_API_KEY` for the current process before running the command. The smoke script reports authentication, response shape, nonempty Search and movie/book Insights results, and explainability availability separately. It never prints the key, names, IDs, or response body. Without a key it exits before any request.

## How it works

1. **Resolve:** `/api/plan` validates inputs, resolves each named interest through Qloo Search, and asks the user to disambiguate multiple matches. A selected ID is checked against a fresh search result.
2. **Gather:** The orchestrator requests artist, movie, and book Insights separately for each audience, with at most three concurrent calls. When a full result page leaves a required domain without an eligible shared candidate, it conditionally requests page two for only the full side(s). Every recovery decision is recorded.
3. **Negotiate:** Candidates must appear by the same entity ID in both result sets. The algorithm compares within-request rank totals, removes dominated plans, and selects a fairness-first plan plus genuinely A- and B-favoring trade-offs when they exist. It shows fewer paths otherwise.
4. **Check rules:** Film length, total proposed program time, allowed ratings, and explicit rejections are hard gates. The conceptual agenda reserves 20 minutes for listening, 10 for transition, and 15 for discussion. Missing or conflicting movie metadata yields `no-solution` with a specific gap; no rule is silently weakened.
5. **Repair:** Rejection or a changed rule triggers a new run. Qloo exclusions are sent upstream and checked again locally. The interface shows changed components, missing evidence, and a redacted PLAN → SELECT TOOLS → EXECUTE → EVALUATE → VERIFY / REPLAN trace.

Rank sums are an **algorithmic ordering device**, not confidence, probabilities, or comparable affinity values from different Qloo requests. Qloo-returned evidence, recognized per-result influence signals, constraints, missing evidence, and creative framing are shown separately. The sequence and experience framing are creative interpretations. No LLM is used; the tool-using orchestration and negotiation are deterministic, bounded code.

The public Qloo reference does not specify a movie runtime field with a guaranteed unit. The live client therefore does not treat a numeric `properties.duration` as verified minutes. A real live plan may remain incomplete until an official key allows response inspection and runtime metadata can be validated. A conceptually timed plan does not verify screening rights, film availability, ticketing, or a venue.

## Project map

| Path | Purpose |
| --- | --- |
| `src/app/page.tsx`, `src/components/workspace.tsx` | Responsive product experience and plan repair interaction |
| `src/app/api/plan/route.ts` | Validated server API and safe error responses |
| `src/lib/qloo.ts` | Server-only Qloo Search and Insights client |
| `src/lib/orchestrator.ts` | Tool selection, budget, audit, replanning |
| `src/lib/negotiation.ts` | Deterministic overlap, constraints, and alternatives |
| `src/lib/synthetic.ts` | Clearly labeled invented development fixture source |
| `src/lib/evaluation.test.ts` | 20 reproducible synthetic scenarios |
| `e2e/journey.spec.ts` | Browser journey for planning, evidence, and repair |
| `scripts/qloo-smoke.mjs` | Authenticated live endpoint smoke check |

More details: [architecture](docs/ARCHITECTURE.md), [Qloo contract](docs/QLOO.md), [demo and submission draft](docs/SUBMISSION.md), [validation log](docs/VALIDATION.md).

## Security and reliability

- The key is read only on the server and sent in `X-Api-Key`. `.env*` is ignored except `.env.example`.
- The API streams and caps request bodies at 16 KiB, checks same-origin browser requests, ignores untrusted forwarding headers, limits each run to 16 logical source calls, and applies a per-process global rate window. This is a zero-cost abuse brake, not a distributed production rate limit.
- Qloo allows at most 24 actual HTTP attempts per plan, including retries. Calls time out after 8 seconds, retry short 429/5xx/network failures at most twice, honor a bounded `Retry-After`, and return specific safe errors for authentication, rate limits, invalid JSON, malformed responses, and empty results.
- The UI receives selected entity IDs, names, ranks, and redacted execution notes, not full Qloo payloads or credentials.
- Synthetic mode is labeled throughout the interface and never claims Qloo provenance.

## Deployment and submission gate

`vercel.json` configures the Next.js framework; deployment can use a free plan if available to the account owner. A deployment must set `QLOO_API_KEY` as a server-side environment variable. Do not enter an external hackathon submission until the public app has been tested end to end with a real key. The [hackathon rules](https://qloo.devpost.com/rules) require a public repository and a free, functional externally hosted demo. Account-owner actions still needed: obtain the Qloo key, provide deployment access, validate a live public run, and submit on Devpost.

The existing [MIT license](LICENSE) is preserved.
