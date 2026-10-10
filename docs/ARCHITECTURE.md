# Architecture and decision record

## Boundaries

The client sends a structured plan request to the Next.js route. The route validates it with Zod and selects one of two `CulturalSource` implementations: a server-only Qloo client or a labeled synthetic source. The orchestrator resolves interests, gathers separate evidence for each audience, and calls a pure negotiation function. It returns a short plan, evidence summaries, and a redacted action trace.

The synthetic source is an invented lookup table used to test workflow behavior. It does not mimic a captured Qloo response or claim any real cultural affinity.

## Negotiation policy

One cross-domain request is made for each of three output types per audience. Shared candidates are intersected by stable Qloo entity ID. For a candidate, each audience's position is the index in its own result set. For each three-act combination, the algorithm minimizes the worse audience's sum of ranks, then the difference between sums, then the total. Entity ID is the final deterministic tie-breaker. This is an ordinal heuristic; it does not infer calibrated preference probabilities.

Hard gates apply to rejected entity IDs, film runtime, and film content rating. When Qloo omits runtime or rating, the film cannot pass those gates. The planner returns no solution rather than silently relaxing a constraint. Venue, ticketing, accessibility, rights, and pricing are not inferred from taste data and remain human planning tasks.

## Bounded agent cycle

The current orchestrator is a stateful, tool-using deterministic agent: PLAN → SELECT TOOLS → EXECUTE → EVALUATE → VERIFY; a rejection adds REPLAN and reruns the cycle. Search and insights are conditional on inputs and source. Each run is capped at 12 logical source calls, with at most three HTTP attempts and an 8-second timeout per attempt. There is no AI model execution and no claim that heuristic code is an LLM.

## Failure model

Input errors return 400, ambiguous or unresolved interests return 422 with bounded options, missing key and upstream outages return 503, timeout returns 504, and local rate limits return 429. Error logs contain a generic error name only. In-memory rate limiting is best effort for a single process; add a shared store before broad public traffic. UI state retains editable inputs after failure.

## Decisions

- Use Next.js App Router and a server route to keep secrets off the browser.
- Use artist, film, and book domains because they make a compact, explainable three-act experience and have documented entity types.
- Keep Qloo explainability as an availability signal. Its contribution scores are not treated as causality or mixed across requests.
- Use no paid LLM service; the architecture keeps source and algorithm boundaries clear for future verified extensions.
