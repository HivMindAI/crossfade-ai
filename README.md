# CROSSFADE

**Turn cultural differences into experiences worth sharing.** CROSSFADE is an agentic cultural negotiation prototype for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). It builds a three-act cultural program for two audiences, using separate taste queries, shared entity IDs, explicit constraints, and visible decision traces.

> **Current status (October 27, 2026):** The [public Render preview](https://crossfade-ai-preview.onrender.com/) is deployed and its end-to-end **SYNTHETIC / NOT REAL QLOO DATA** journey has been observed in a public browser. The deployed commit is reported as `1b63afc` on `feature/crossfade-mvp`; a public page alone does not independently prove its server commit or environment. Live Qloo remains disabled on the preview. The owner previously observed authenticated Artist Search and Movie/Book Insights, then ran one fixed two-audience P1 plan that ended **NO COMPLETE PATH**: each domain had zero shared IDs in the bounded pages. A separate artist-only Bridge experiment returned 20 candidates for both audiences under the same filter, but cultural compatibility is **unverified** and Bridge is not in the product planner. No complete live three-domain recommendation has been verified. Live film suggestions can be conceptual when verified runtime minutes are unavailable; they are not schedules.

The implementation is under review in [PR #1](https://github.com/HivMindAI/crossfade-ai/pull/1) on `feature/crossfade-mvp`; `main` has not been merged. The public repository's current default `main` contains only `LICENSE`, so reviewers should open the feature branch until a reviewed merge or default-branch change is separately authorized. Current offline verification is recorded in [the validation log](docs/VALIDATION.md); review CI against the exact published feature-branch SHA before treating this release candidate as checked remotely.

## Run locally

Requires Node.js 24 and npm. The app uses only free and open-source dependencies.

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. The default **Synthetic demo** mode needs no credentials. Choose a preset, select **Find the shared ground**, inspect up to three evidence-supported paths, reject a component, or change film and total-program rules and run the planner again.

To try live Qloo **after** the separate integration and abuse-control gates, set the hackathon-issued `QLOO_API_KEY` privately, leave `QLOO_API_ORIGIN` unset or set it to the exact hackathon host, configure the shared Redis quota, and set `QLOO_LIVE_ENABLED=1` as an explicit server-side launch switch. The key can be sent only to `https://hackathon.api.qloo.com`. Select **Live Qloo** in the UI. Keys and the Redis token remain server-side. Missing key, launch switch, or healthy quota guard fails closed; the planner never falls back to fixtures. The bounded smoke script is a separate, explicit validation step and does not activate the app's live mode. See [secure deployment setup](docs/DEPLOYMENT.md).

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

The owner completed the bounded three-request Search, Movie Insights, and Book Insights smoke diagnostic. Its last run confirmed the Book subtype shape but predated the Book parser repair. The subsequent P1 and separate Bridge observations are recorded in [validation](docs/VALIDATION.md). Repeat the smoke only for a new, separately authorized contract question; this command makes at most three sequential GETs with no redirects or retries:

```bash
npm run qloo:smoke -- --live-once
```

Set `QLOO_API_KEY` privately in the local process environment before an authorized live check; never place the value in a command, file, chat, or CI log. The smoke reports only redacted status and aggregate counts and now shares Book classification with production. Without an explicit live flag, the script sends no request; without a key, it stops before dispatch. See the [Qloo validation record](docs/QLOO.md) and the [separately authorized live journey protocol](docs/LIVE_JOURNEY.md) for remaining gates.

## How it works

1. **Resolve:** `/api/plan` validates inputs, resolves each named interest through Qloo Search, and asks the user to disambiguate multiple matches. A selected ID is checked against a fresh search result.
2. **Gather:** The orchestrator requests artist, movie, and book Insights separately for each audience, with at most three concurrent calls. When a full result page leaves a required domain without an eligible shared candidate, it conditionally requests page two for only the full side(s). Every recovery decision is recorded.
3. **Negotiate:** Candidates must appear by the same entity ID in both result sets. The algorithm compares within-request rank totals, removes dominated plans, and selects a fairness-first plan plus genuinely A- and B-favoring trade-offs when they exist. It shows fewer paths otherwise.
4. **Check rules:** Known violations of film length, total program time, rating, or explicit rejections are excluded. A plan is **duration-verified** only when its film runtime and rating are known and pass those limits. Missing runtime/rating yields a clearly marked **conceptual** option, with no certified schedule or total time. Conflicting metadata or known violations can still produce `no-solution`. The proposed non-film agenda is 45 minutes; no rule is silently weakened.
5. **Repair:** Rejection or a changed rule triggers a new run. Qloo exclusions are sent upstream and checked again locally. The interface names the rejected entity, its evidence-backed replacement or unresolved outcome, and whether the revised path is duration-verified or conceptual. Domain cards distinguish missing source results, missing overlap, exclusions, known metadata failures, and retrieval-budget limits. Valid partial evidence stays visible but is never called a complete plan.

Rank sums are an **algorithmic ordering device**, not confidence, probabilities, or comparable affinity values from different Qloo requests. Qloo-returned evidence, recognized per-result influence signals, constraints, missing evidence, and creative framing are shown separately. The sequence and experience framing are creative interpretations. No LLM is used; the tool-using orchestration and negotiation are deterministic, bounded code.

The artist-only [Bridge study](docs/BRIDGE_EXPERIMENT.md) demonstrated filtered candidate coverage in one owner-observed run, not positive affinity or improved human satisfaction. Its [independent acceptance protocol](docs/BRIDGE_EXPERIMENT.md#minimal-human-acceptance-gate-not-yet-run) is pending. The deployed **synthetic-only** Render Free preview does not validate Live Qloo or replace the public live security gate.

The public Qloo reference does not specify a movie runtime field with a guaranteed unit. The live client therefore does not treat a numeric `properties.duration` as verified minutes. A live conceptual path requires independent runtime and rating verification before scheduling, plus separate screening-rights, availability, ticketing, and venue checks.

## Project map

| Path | Purpose |
| --- | --- |
| `src/app/page.tsx`, `src/components/workspace.tsx` | Responsive product experience and plan repair interaction |
| `src/app/api/plan/route.ts` | Validated server API and safe error responses |
| `src/lib/qloo.ts` | Server-only Qloo Search and Insights client |
| `src/lib/live-quota.ts` | Atomic, shared, fail-closed budget for live plans |
| `src/lib/orchestrator.ts` | Tool selection, budget, audit, replanning |
| `src/lib/negotiation.ts` | Deterministic overlap, constraints, and alternatives |
| `src/lib/evaluation.ts` | Synthetic-only same-pool product/baseline comparison and repair check |
| `src/lib/synthetic.ts` | Clearly labeled invented development fixture source |
| `src/lib/evaluation.test.ts` | 20 reproducible synthetic scenarios |
| `e2e/journey.spec.ts` | Browser journey for planning, evidence, and repair |
| `scripts/qloo-smoke.mjs` | Authenticated live endpoint smoke check |

More details: [architecture](docs/ARCHITECTURE.md), [Qloo contract](docs/QLOO.md), [live journey protocol](docs/LIVE_JOURNEY.md), [live benchmark](docs/LIVE_BENCHMARK.md), [demo and submission draft](docs/SUBMISSION.md), [validation log](docs/VALIDATION.md).

## Security and reliability

- The key is read only on the server and sent in `X-Api-Key`. `.env*` is ignored except `.env.example`. Live planning is disabled by default even if a key exists; `QLOO_LIVE_ENABLED=1` is required after release review.
- The API streams and caps request bodies at 16 KiB, checks same-origin browser requests, ignores untrusted forwarding headers, limits each run to 16 logical source calls, and applies a per-process global rate window. Before a live plan, an approved shared Redis endpoint atomically reserves one plan against an hourly cross-instance ceiling. The guard refuses live work on missing configuration or provider failure. The owner reported an isolated reservation test on a disposable Redis key; public operation, key-specific Qloo quota, cumulative allowance, other clients' usage, and public abuse control remain unverified.
- The client caps itself at 24 actual Qloo HTTP attempts per plan, including retries (this is an application cap, not a Qloo quota). Calls time out after 8 seconds, never follow redirects with the key, retry short 429/5xx/network failures at most twice, honor bounded `Retry-After`, and return safe errors for authentication, rate limits, invalid JSON, and malformed responses.
- The UI receives selected entity IDs, names, ranks, and redacted execution notes, not full Qloo payloads or credentials.
- Synthetic mode is labeled throughout the interface and never claims Qloo provenance.

## Deployment and submission gate

The public preview was deployed from `feature/crossfade-mvp` at the owner-confirmed SHA `1b63afc`; its release source and CI should always be checked against an exact SHA. [Bridge Discovery](docs/BRIDGE_EXPERIMENT.md) has one owner-observed artist-only result; the production planner still uses shared-ID intersection. No Bridge public interface exists. The [submission checklist](docs/SUBMISSION.md) tracks the remaining judge-facing work.

`vercel.json` configures the Next.js framework for a possible future host. Configure `QLOO_API_KEY` and the shared Redis token only as server-side secrets. The Redis guard is implemented, offline-tested, and owner-verified on a disposable Upstash key, but **no public abuse control has been verified**. The account's actual Qloo allowance, a complete live result, and safe public Live operation remain open. Keep Live disabled until those gates pass. See [deployment gates](docs/DEPLOYMENT.md) and the [submission checklist](docs/SUBMISSION.md).

The existing [MIT license](LICENSE) is preserved.
