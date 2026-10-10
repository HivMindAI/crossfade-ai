# Architecture and decision record

## Boundaries and provenance

The browser sends a validated plan request to the Next.js server route. The route chooses a server-only Qloo client or a clearly labeled synthetic fixture source. The key never enters browser code. Search resolves input interests; Insights returns separate artist, movie, and book result sets for each audience. Candidate identity is the intersection of stable entity IDs, never a guessed name match. Qloo results, recognized per-result influence signals, algorithmic rank totals, hard constraints, missing evidence, and creative experience text remain distinct in the response and UI.

The synthetic catalog is invented for development. No test fixture is a captured or verified Qloo response.

## Bounded conditional agent cycle

The deterministic planner follows PLAN → SELECT TOOLS → EXECUTE → EVALUATE → VERIFY. It resolves up to six named interests and schedules six baseline Insights calls with at most three concurrent source calls. If a domain lacks an eligible shared candidate, it records why. A full 20-result page makes one documented recovery action useful: request page two only for the full audience side(s). Short pages do not trigger redundant calls. Recovery is capped by a 16-logical-call budget, and the Qloo transport separately caps actual HTTP attempts, including retries, at 24. A budget shortfall is explicit; no hard constraint is weakened. Rejection or changed inputs starts a new bounded run, with prior rejected IDs preserved.

This is tool-using deterministic orchestration, not an LLM. There is no paid model dependency. The trace names the selected tool, failed domain, recovery action, and final verification outcome.

## Negotiation policy

For each domain, the planner keeps shared entities whose metadata and explicit rules permit them. It enumerates a bounded set of complete three-act plans and sums rank positions within each audience's own result lists. A plan is Pareto-dominated when another plan is no worse for either audience and strictly better for one. From the non-dominated frontier, the fairness-first path minimizes the worse rank sum, then imbalance, then total rank. An A-favoring path is shown only if it improves A's sum while worsening B's relative to the fairness path; the B-favoring path uses the converse. Deterministic entity-ID ties ensure repeatable output. When those genuine trade-offs do not exist, the UI shows fewer paths and says why.

Rank totals are ordinal algorithmic scores, not satisfaction probabilities or comparable Qloo affinity values. No source result is promoted to a causal explanation.

## Feasibility and missing evidence

The conceptual agenda reserves 20 minutes for listening, 10 for transition, and 15 for discussion. A film passes only when verified minutes plus that 45-minute agenda fit both the film and total-program limits, and its rating is allowed. Missing or conflicting runtime/rating metadata fails the gate. The public Qloo reference does not document a runtime field with minute units, so the live adapter intentionally leaves film minutes unset pending authenticated contract verification. A live no-solution outcome with that gap is more honest than presenting an unverified schedule. Screening rights, availability, ticketing, and venue are separate human checks.

## API and security behavior

The route streams request bodies with a 16 KiB cap, validates JSON and schema, checks browser origin in production, ignores `X-Real-IP` and `X-Forwarded-For` as untrusted identity, and applies a per-process global rate window. That window is a zero-cost abuse brake, not a distributed guarantee on serverless replicas. Before broad public use, deploy behind a provider-level edge rate rule or add a shared store with trusted proxy identity. The Qloo client returns safe errors for authentication, malformed responses, timeouts, long rate-limit delays, and budget exhaustion. It does not log or return raw Qloo payloads or credentials.

## Validation

Unit tests use deterministic synthetic sources and Qloo-style transport responses to exercise conditional page recovery, call budgets, concurrency bounds, hard constraints, Pareto trade-offs, malformed data, timeout behavior, and provenance. Browser tests exercise alternatives, evidence sections, repaired plans, no-solution gaps, program timing, and missing live credentials. A real Qloo integration and public deployment remain unverified.
