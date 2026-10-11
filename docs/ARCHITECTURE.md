# Architecture and decision record

## Boundaries and provenance

The browser sends a validated plan request to the Next.js server route. The route chooses a server-only Qloo client or a clearly labeled synthetic fixture source. The key never enters browser code. Search resolves input interests; Insights returns separate artist, movie, and book result sets for each audience. Candidate identity is the intersection of stable entity IDs, never a guessed name match. Qloo results, recognized per-result influence signals, algorithmic rank totals, hard constraints, missing evidence, and creative experience text remain distinct in the response and UI.

The synthetic catalog is invented for development. No test fixture is a captured or verified Qloo response.

## Bounded conditional agent cycle

The deterministic planner follows PLAN → SELECT TOOLS → EXECUTE → EVALUATE → VERIFY. It resolves up to six named interests and schedules six baseline Insights calls with at most three concurrent source calls. If a domain lacks an eligible shared candidate, it records why. A full 20-result page makes one documented recovery action useful: request page two only for the full audience side(s). Short pages do not trigger redundant calls. Recovery is capped by a 16-logical-call budget, and the Qloo transport separately caps actual HTTP attempts, including retries, at 24. A budget shortfall is explicit; no hard constraint is weakened. Rejection or changed inputs starts a new bounded run, with prior rejected IDs preserved.

This is tool-using deterministic orchestration, not an LLM. There is no paid model dependency. The trace names the selected tool, failed domain, recovery action, and final verification outcome.

## Negotiation policy

For each domain, the planner keeps shared entities whose **known** metadata and explicit rules permit them. It enumerates a bounded set of three-act combinations and sums rank positions within each audience's own result lists. If any duration-verified combinations exist, they take precedence over conceptual combinations; otherwise only clearly labeled conceptual paths are considered. A plan is Pareto-dominated when another plan is no worse for either audience and strictly better for one. From the non-dominated frontier, the fairness-first path minimizes the worse rank sum, then imbalance, then total rank. An A-favoring path is shown only if it improves A's sum while worsening B's relative to the fairness path; the B-favoring path uses the converse. Deterministic entity-ID ties ensure repeatable output. When those genuine trade-offs do not exist, the UI shows fewer paths and says why.

Rank totals are ordinal algorithmic scores, not satisfaction probabilities or comparable Qloo affinity values. No source result is promoted to a causal explanation.

## Feasibility and missing evidence

The proposed agenda reserves 20 minutes for listening, 10 for transition, and 15 for discussion. A path is duration-verified only when known film minutes plus that 45-minute agenda fit both the film and total-program limits, and a known rating is allowed. A known rule violation or conflicting metadata excludes that film. Missing runtime/rating metadata does **not** pass the gate: it allows only a conceptual experience without a certified total or schedule, and the missing fields appear in the gap and trace. The public Qloo reference does not document a runtime field with minute units, so the live adapter intentionally leaves film minutes unset pending authenticated contract verification. Screening rights, availability, ticketing, and venue are separate human checks.

## API and security behavior

The route streams request bodies with a 16 KiB cap, validates JSON and schema, checks browser origin in production, ignores `X-Real-IP` and `X-Forwarded-For` as untrusted identity, and applies a per-process global rate window. Live planning additionally requires a server-side key, `QLOO_LIVE_ENABLED=1`, and an **atomic shared hourly plan reservation** in an approved Upstash Redis REST database. The quota guard fails closed before any Qloo call when configuration, Redis authentication, response validation, or connectivity fails. Its Lua script admits at most the configured number of plans across instances in a rolling 60-minute window; each admitted plan conservatively reserves the application's maximum 24 Qloo HTTP attempts. The account owner must derive the plan ceiling from the issued Qloo allowance and verify the guard in the chosen provider before public activation. The per-process window remains a local brake; a provider WAF rule can add per-source protection but cannot replace the global quota. Cross-request caching remains deferred pending privacy, key-scoping, and expiry review. The Qloo client accepts only the hackathon and standard Qloo HTTPS origins through server-side configuration, refuses redirects, and returns safe errors for authentication, malformed responses, timeouts, long rate-limit delays, and budget exhaustion. It does not log or return raw Qloo payloads or credentials.

## Validation

Unit tests use deterministic synthetic sources and Qloo-style transport responses to exercise conditional page recovery, call budgets, concurrency bounds, hard constraints, Pareto trade-offs, malformed data, timeout behavior, and provenance. Offline Redis-transport tests exercise shared quota reservation and failure behavior. The result records eligible shared-candidate counts by domain for later **redacted** live evaluation. Browser tests exercise alternatives, evidence sections, repaired plans, no-solution gaps, program timing, and missing live credentials. A real Qloo integration, shared provider deployment, and public deployment remain unverified.
