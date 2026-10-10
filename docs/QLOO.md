# Qloo integration contract

The Qloo client targets the hackathon host specified by the event mission: `https://hackathon.api.qloo.com`. It sends `X-Api-Key` server-side. The official public documentation mirror describes the following contract:

| Purpose | Request | Documentation |
| --- | --- | --- |
| Resolve a named interest | `GET /search?query=…&types=urn:entity:{artist|movie|book}&take=8` | [Search](https://github.com/qloo/docs-public/blob/main/reference/get-search.md) |
| Gather cross-domain candidates | `GET /v2/insights?filter.type=urn:entity:{artist|movie|book}&signal.interests.entities=id,…&take=20&feature.explainability=true` | [Insights deep dive](https://github.com/qloo/docs-public/blob/main/reference/insights-api-deep-dive.md) |
| Exclude rejected IDs | Add `filter.exclude.entities=id,…` to insights | [Insights deep dive](https://github.com/qloo/docs-public/blob/main/reference/insights-api-deep-dive.md) |
| Optional comparison | `GET /v2/analysis/compare` with `a.signal.interests.entities` and `b.signal.interests.entities` | [Compare](https://github.com/qloo/docs-public/blob/main/reference/analysis-compare.md) |

Comparison is not called in this version because the public response semantics do not establish a reliable per-candidate fairness metric. The planner's fairness calculation uses only the rank positions in separate result sets. `feature.explainability=true` is requested, but the interface only reports whether per-result metadata was present. It does not interpret normalized contribution values as probabilities or proof of cause.

Search and insight responses are parsed as `results.entities`. Search requires a unique exact-name match or the user chooses a displayed match. The server validates that choice against a new search result. `404` and empty entity arrays become no result. Unexpected response shapes fail safely.

**Verification status:** documentation reviewed October 10, 2026. `QLOO_API_KEY` was not available. Host availability, credential scope, exact live response metadata, rate limits, and real entity disambiguation must be checked with `npm run qloo:smoke` and a complete live UI journey when the key arrives. Do not treat synthetic fixture tests as live integration verification.
