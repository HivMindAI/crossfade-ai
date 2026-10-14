# CROSSFADE

**Turn cultural differences into experiences worth sharing.** CROSSFADE is an agentic cultural negotiation prototype for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). It builds a three-act cultural program for two audiences, using separate taste queries, shared entity IDs, explicit constraints, and visible decision traces.

> **Current status:** The local end-to-end journey works with **SYNTHETIC / NOT REAL QLOO DATA**. The account owner independently observed authenticated Artist Search HTTP 200 with three valid entities, Movie Insights HTTP 200 with five accepted entities, and Book Insights HTTP 200 with five valid generic-type entities carrying exact Book subtypes. The Book production parser now accepts this evidence-backed form in offline tests. Useful explainability content and the complete live journey remain unverified. Live film suggestions can be conceptual when verified runtime minutes are unavailable; they are not schedules. No public demo has been deployed or submitted.

The implementation is under review in [PR #1](https://github.com/HivMindAI/crossfade-ai/pull/1) on `feature/crossfade-mvp`; `main` has not been merged. The public repository's current default `main` contains only `LICENSE`, so reviewers should open the feature branch until a reviewed merge or default-branch change is separately authorized. The [Milestone 5 CI run passed](https://github.com/HivMindAI/crossfade-ai/actions/runs/38137301753). Current offline verification is recorded in [the validation log](docs/VALIDATION.md).

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

The owner completed the bounded three-request Search, Movie Insights, and Book Insights smoke diagnostic. Its last run confirmed the Book subtype shape but predated the Book parser repair. Repeat only for a new, separately authorized contract question; this command makes at most three sequential GETs with no redirects or retries:

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
- The API streams and caps request bodies at 16 KiB, checks same-origin browser requests, ignores untrusted forwarding headers, limits each run to 16 logical source calls, and applies a per-process global rate window. Before a live plan, an approved shared Redis endpoint atomically reserves one plan against an hourly cross-instance ceiling. The guard refuses live work on missing configuration or provider failure; its real provider behavior remains to be validated.
- The client caps itself at 24 actual Qloo HTTP attempts per plan, including retries (this is an application cap, not a Qloo quota). Calls time out after 8 seconds, never follow redirects with the key, retry short 429/5xx/network failures at most twice, honor bounded `Retry-After`, and return safe errors for authentication, rate limits, invalid JSON, and malformed responses.
- The UI receives selected entity IDs, names, ranks, and redacted execution notes, not full Qloo payloads or credentials.
- Synthetic mode is labeled throughout the interface and never claims Qloo provenance.

## Deployment and submission gate

Milestones 6–9I are local release-candidate work and have no CI result until authorized publication. See the [exact publication procedure](docs/PUBLICATION.md). [Bridge Discovery](docs/BRIDGE_EXPERIMENT.md) is a documented experiment hypothesis; the production planner still uses shared-ID intersection. No authenticated Bridge request or public interface exists.

`vercel.json` configures the Next.js framework; use an eligible free tier only after its terms and limits have been checked by the account owner. Configure `QLOO_API_KEY` and the shared Redis token only as server-side secrets. The Redis guard is implemented and offline-tested, but **no real provider configuration or public abuse test has been verified**. Align its ceiling with Qloo's issued limit and add an edge per-source rule where available. Do not submit until authenticated Qloo and public end-to-end tests pass separately. Deployment has **not** been authorized. See [deployment gates](docs/DEPLOYMENT.md) and the [submission checklist](docs/SUBMISSION.md).

The existing [MIT license](LICENSE) is preserved.
