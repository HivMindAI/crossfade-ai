# Qloo integration contract and open verification gates

The server targets the hackathon host `https://hackathon.api.qloo.com` and sends `X-Api-Key` only from the server. This host was supplied for the hackathon; it has not been exercised with an official key. The public [Search reference](https://github.com/qloo/docs-public/blob/main/reference/get-search.md) and [Insights deep dive](https://github.com/qloo/docs-public/blob/main/reference/insights-api-deep-dive.md) support these requests:

| Purpose | Request | Documented limit |
| --- | --- | --- |
| Resolve a named input | `GET /search?query=…&types=urn:entity:{artist|movie|book}&take=8` | Search `take` 1–100, `page` 1–100 |
| Gather cross-domain candidates | `GET /v2/insights?filter.type=urn:entity:{artist|movie|book}&signal.interests.entities=id,…&feature.explainability=true&take=20&page=1` | Insights `take` 1–50; `page` begins at 1 |
| Recover a missing eligible domain | Request `page=2` only for an audience whose first result page was full | One bounded recovery round; no hard-rule relaxation |
| Exclude rejected IDs | Add `filter.exclude.entities=id,…` to Insights | Rechecked locally after response |

The Search documentation specifies `types`, not a subtype equality rule. The client filters on an entity's top-level `type` when present and does not discard a valid result merely because its `subtype` differs. Insights responses are required to contain an entity array with nonempty IDs and names. A wrong top-level type, malformed entity, `success: false`, unexpected Insights `404`, or invalid JSON is an error. Search `404` means no Search matches; `200` with an empty Insights array is valid but insufficient evidence. It is never treated as a successful plan.

The Insights reference describes optional per-result `query.explainability`, where input entities can have normalized influence values. It does not publish a stable nested JSON schema in the cited page. The client only exposes explicit ID/value pairs that match submitted input IDs and have finite values from 0 to 1. If the live shape differs, it reports missing recognized evidence. These values are within-request metadata, not probabilities, causal proof, or comparable scores across unrelated requests. The UI also keeps algorithmic rank totals and creative framing separate from Qloo data.

The public reference documents a movie content-rating filter, but does not guarantee movie runtime in results or establish a runtime unit. A numeric `properties.duration` is **not** accepted as film minutes. A complete live plan therefore cannot pass the runtime and total-program hard gates until authenticated responses and a reliable minutes field are verified. Synthetic fixtures use explicitly invented minute values and remain labeled as such. Comparison (`/v2/analysis/compare`) is not used because its public semantics do not establish a calibrated per-candidate fairness measure.

The client caps actual HTTP attempts at 24 across logical calls, including retries, and times out each attempt after 8 seconds. Search documents HTTP 429; the client honors short `Retry-After` guidance and returns a rate-limit error rather than waiting through a long delay inside a planning request. No undocumented numeric Qloo rate quota is assumed.

`npm run qloo:smoke` requires a real `QLOO_API_KEY`. It reports the Search authentication result, response structure, nonempty Search result, nonempty movie and book cross-domain Insights results, and the count of per-result explainability objects as separate gates. It never prints credentials, entity IDs, names, or raw payloads. No authenticated smoke run has occurred. A passing smoke run would establish only those gates; film metadata units, rights, and full live UX would still require separate verification.
