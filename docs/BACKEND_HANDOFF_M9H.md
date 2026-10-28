# Backend handoff: Book Insights contract after Movie repair

Historical handoff: the owner subsequently verified the generic Book type with exact Book subtype, and Milestone 9I repaired the shared production classifier. See [current Qloo status](QLOO.md). The remaining gate is a separately authorized full live journey.

## Established evidence and implementation

The owner independently observed Artist Search HTTP 200 with three valid results and Movie Insights HTTP 200 with five valid identities. Each Movie result had generic top-level `type`, exact `subtype: urn:entity:movie`, and no recognized category conflict. All five had explainability objects, but their content quality is unverified. The official [Movie Insights example](https://raw.githubusercontent.com/qloo/docs-public/main/reference/basic-insights-use-case.md) shows the same type/subtype pairing. No authenticated request was made in Milestone 9H.

Production `src/lib/qloo.ts` and `scripts/qloo-smoke.mjs` now use the same `scripts/qloo-insights-classify.mjs` page policy. It accepts Movie through exact top-level `urn:entity:movie` or generic top-level `urn:entity` plus exact Movie subtype, and rejects malformed identity/type metadata, conflicting recognized domains, contradictory `types` arrays, and duplicate IDs. Artist and Book retain their existing exact top-level form. Search remains a separate parser. Returned order, page size, evidence provenance, exclusions, HTTP limits, and security controls remain in place.

## Book gate

Book Insights has **not** been observed. The existing `npm run qloo:smoke -- --live-once` command is prepared for a separately authorized owner run with a private local key. It makes at most three requests, with zero retries: Artist Search, Movie Insights, then Book Insights. It stops on failure and prints only aggregate Book envelope and identity validity, top-level type kinds/known domains, subtype presence/kinds/exact Book membership, conflict counts, accepted/rejected counts, and fixed reasons. It never prints raw values or payloads.

If Book returns exact top-level `urn:entity:book` with no contradictory metadata, the current production rule can accept that specific form. If it returns generic top-level `urn:entity` with exact `subtype: urn:entity:book`, the diagnostic will **reject and report** `unverified-generic-subtype-domain`. The backend developer should extend the shared policy to Book only after owner-observed Book result metadata or an official Book response example confirms that pairing. Add invented-fixture tests for all supported and rejected forms, one invalid row in a page, duplicate IDs, and the three-request stop rule. If Book subtype is missing or ambiguous, retain the fail-closed rule and investigate independent entity-ID classification through a separately authorized bounded check. Do not infer Book solely from `filter.type` or from the Movie result pattern.

Do not treat explainability object presence as verified useful influence evidence. Film runtime units, ratings, screening rights, and complete two-audience negotiations remain separate release gates.
