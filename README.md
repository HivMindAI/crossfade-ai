# CROSSFADE

**Turn cultural differences into experiences worth sharing.** CROSSFADE is an agentic cultural negotiation prototype for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). It builds a three-act cultural program for two audiences, using separate taste queries, shared entity IDs, explicit constraints, and visible decision traces.

> **Current status:** The local end-to-end journey works with **SYNTHETIC / NOT REAL QLOO DATA**. `QLOO_API_KEY` was unavailable during implementation. The live client is built against documented endpoints but has **not** completed an authenticated round trip. No public demo has been deployed or submitted.

## Run locally

Requires Node.js 24 and npm. The app uses only free and open-source dependencies.

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. The default **Synthetic demo** mode needs no credentials. Choose a preset, select **Find the shared ground**, inspect the three paths, reject a component, or change film rules and select **Repair the experience**.

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

On PowerShell, set `$env:QLOO_API_KEY` for the current process before running the command. The smoke script logs status and result counts only. It never prints the key, names, IDs, or response body.

## How it works

1. **Resolve:** `/api/plan` validates inputs, resolves each named interest through Qloo Search, and asks the user to disambiguate multiple matches. A selected ID is checked against a fresh search result.
2. **Gather:** A bounded orchestrator requests artist, movie, and book insights **separately for each audience**. Results are linked to the input entity IDs used in the query.
3. **Negotiate:** Candidates must appear by the **same entity ID** in both result sets. The algorithm prioritizes the audience with the worse within-request rank, then reduces rank imbalance and breaks ties deterministically.
4. **Verify:** Film duration, allowed content ratings, and explicit rejections are hard gates. Missing film metadata fails a hard gate. If any act has no verified candidate, the planner returns `no-solution`.
5. **Repair:** Rejection or a changed rule triggers a new run. Qloo exclusions are sent upstream and checked again locally. The interface shows changes and a redacted PLAN → SELECT TOOLS → EXECUTE → EVALUATE → VERIFY / REPLAN trace.

Rank sums are an **algorithmic ordering device**, not confidence, probabilities, or comparable affinity values from different Qloo requests. The sequence and experience framing are creative interpretations. No LLM is used; the tool-using orchestration and negotiation are deterministic, bounded code.

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
- The API validates request size and shape, limits each execution to 12 logical source calls, and applies a basic per-process rate window. Production needs a shared rate limiter and trusted proxy identity configuration.
- Qloo calls time out after 8 seconds, retry 429/5xx/network failures at most twice, and return specific safe errors for authentication, rate limits, invalid JSON, malformed responses, and empty results.
- The UI receives selected entity IDs, names, ranks, and redacted execution notes, not full Qloo payloads or credentials.
- Synthetic mode is labeled throughout the interface and never claims Qloo provenance.

## Deployment and submission gate

`vercel.json` configures the Next.js framework; deployment can use a free plan if available to the account owner. A deployment must set `QLOO_API_KEY` as a server-side environment variable. Do not enter an external hackathon submission until the public app has been tested end to end with a real key. The [hackathon rules](https://qloo.devpost.com/rules) require a public repository and a free, functional externally hosted demo. Account-owner actions still needed: obtain the Qloo key, provide deployment access, validate a live public run, and submit on Devpost.

The existing [MIT license](LICENSE) is preserved.
