# Backend handoff: Milestone 9F Movie Insights type evidence

Milestone 9G found an official Movie response example using generic `type` with exact Movie `subtype`. See [the newer backend handoff](BACKEND_HANDOFF_M9G.md) for the current implementation gate and keep this document as the prior investigation record.

The owner ran the bounded live smoke. Artist Search passed with three accepted entities. The second request, Movie Insights, returned HTTP 200 and five `results.entities` items, then failed the exact top-level type check. The script had already established that every Movie item had a nonblank string top-level `type`; at least one differed from `urn:entity:movie`. Book Insights was not called. The actual type strings and any `types` array semantics are still unknown.

The request itself is `GET https://hackathon.api.qloo.com/v2/insights` with decoded parameters `filter.type=urn:entity:movie`, `signal.interests.entities=<one resolved artist ID>`, `feature.explainability=true`, `take=5`, `page=1`. The production adapter also sets `filter.type=urn:entity:movie`. Do not change the request based only on HTTP 200 or the current mismatch.

The diagnostic change is limited to `scripts/qloo-smoke.mjs` and offline tests. It prints aggregate counts for top-level type presence/exactness, `types` array presence and validity, exact category membership, recognized primary-category conflicts, and fixed rejection categories. It never prints IDs, names, arbitrary type strings, keys, headers, or response bodies. The smoke still requires exact top-level type for acceptance, and it fails closed on conflicting recognized primary domains. Its cap is three requests, with zero retries; a Movie failure stops after two.

Production `src/lib/qloo.ts` still parses the independent Insights envelope `results.entities` and requires every item's top-level `type` to exactly match the requested category. It ignores `types` arrays. An array-only Movie category fails; a top-level Movie category with a conflicting array would currently be accepted by production. Do not broaden production acceptance until owner-controlled aggregate evidence establishes whether Insights returns valid string arrays and what their relationship to top-level `type` is.

After a separately authorized repeat smoke, use these decisions:

1. If one or more items have a recognized wrong primary domain, inspect whether the filter was ignored or whether some other request parameter differs from the documented contract. Keep those items rejected.
2. If the top-level type is generic or absent while valid `types` arrays explicitly contain Movie and no other recognized primary category, consider a bounded Insights-specific validator. Require exact category membership, valid identity and array strings, no conflicting recognized domain, page-size limits, and fail-closed behavior. Share code with Search only for proven common field semantics; keep the Search and Insights envelopes independent.
3. If arrays are missing, malformed, mixed, or only subtype labels appear, retain strict rejection and seek the minimum additional redacted evidence needed. Never infer Movie from `filter.type` alone.

Add production contract tests using invented fixtures for array-only category evidence, missing information, wrong domain, contradictory metadata, and mixed pages before changing the adapter. Do not treat `popularity` as preference affinity. Live validation, a complete two-audience journey, and release gates remain separate.
