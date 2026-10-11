# Qloo integration contract and open verification gates

The server defaults to the existing hackathon host `https://hackathon.api.qloo.com` and sends `X-Api-Key` only from the server. Qloo's public [Search reference](https://github.com/qloo/docs-public/blob/main/reference/get-search.md) and [Insights deep dive](https://github.com/qloo/docs-public/blob/main/reference/insights-api-deep-dive.md) show `https://api.qloo.com` as the standard host. Neither host has been exercised here with an official key. Match the host to the issued key's instructions by setting server-only `QLOO_API_ORIGIN` to exactly one of those two HTTPS origins. The app and smoke script reject other hosts, paths, user information, and redirects before forwarding a key. The public references support these requests:

| Purpose | Request | Documented limit |
| --- | --- | --- |
| Resolve a named input | `GET /search?query=…&types=urn:entity:{artist|movie|book}&take=8` (or `take=100` when revalidating a previously selected ID) | Search `take` 1–100, `page` 1–100 |
| Gather cross-domain candidates | `GET /v2/insights?filter.type=urn:entity:{artist|movie|book}&signal.interests.entities=id,…&feature.explainability=true&take=20&page=1` | Insights `take` 1–50; `page` begins at 1 |
| Recover a missing eligible domain | Request `page=2` only for an audience whose first result page was full | One bounded recovery round; no hard-rule relaxation |
| Exclude rejected IDs | Add `filter.exclude.entities=id,…` to Insights | Rechecked locally after response |

The Search documentation specifies `types`, not a subtype equality rule. The client filters on an entity's top-level `type` when present and does not discard a valid result merely because its `subtype` differs. Insights responses are required to contain an entity array with nonempty IDs and names. A wrong top-level type, malformed entity, `success: false`, unexpected Insights `404`, or invalid JSON is an error. Search `404` means no Search matches; `200` with an empty Insights array is valid but insufficient evidence. It is never treated as a successful plan.

The Insights reference describes optional per-result `query.explainability`, where input entities can have normalized influence values. It does not publish a stable nested JSON schema in the cited page. The client only exposes explicit ID/value pairs that match submitted input IDs and have finite values from 0 to 1. If the live shape differs, it reports missing recognized evidence. These values are within-request metadata, not probabilities, causal proof, or comparable scores across unrelated requests. The UI also keeps algorithmic rank totals and creative framing separate from Qloo data.

The public reference documents a movie content-rating filter, but does not guarantee movie runtime in results or establish a runtime unit. A numeric `properties.duration` is **not** accepted as film minutes. A live film can therefore participate in a **conceptual experience** when metadata is missing, but the result states that the film, rating, and total-program gates are not verified. Known violations still exclude candidates. A duration-verified schedule requires independently established minutes and rating; no current live response has met that release gate. Synthetic fixtures use explicitly invented minute values and remain labeled as such. Comparison (`/v2/analysis/compare`) is not used because its public semantics do not establish a calibrated per-candidate fairness measure.

The client caps actual HTTP attempts at 24 across logical calls, including retries, and times out each attempt after 8 seconds. It never follows an HTTP redirect with `X-Api-Key`. Search documents HTTP 429; the client honors short `Retry-After` guidance and returns a rate-limit error rather than waiting through a long delay inside a planning request. No undocumented numeric Qloo rate quota is assumed. The 24-attempt limit is an application safeguard, **not** a published Qloo allowance.

Previously selected IDs are never accepted from the browser alone. A fresh documented Search response of up to 100 matches must still contain the ID under the same exact name and requested top-level type. If it disappears, the user must choose again. This uses the original logical Search call, though it can return a larger response. Search and Insights pages that exceed the requested `take` are rejected, preserving the planner's bounded candidate count. Recognized request aborts stop later source dispatch and cancel Qloo retries; a reserved shared plan quota is never refunded.

`npm run qloo:smoke` is offline by default. With an authorized key supplied through the process environment, `npm run qloo:smoke -- --live-once` performs at most three sequential calls: Search, movie Insights, book Insights. It makes no retry, refuses redirects, caps each response at 2 MB, and reports response structure, nonempty results, and explainability-object counts without printing credentials, IDs, names, or raw payloads. No authenticated smoke run has occurred.

Before running it, the account owner should verify the key's intended host, access, and request limits from the key issuer; set `QLOO_API_KEY` as a local process secret (not in a shell command, repository, or log); set `QLOO_API_ORIGIN` only if the key requires the standard host; and explicitly approve this small call set. A pass validates only those endpoints and response gates. It does **not** establish film runtime minutes, screening rights, useful shared-entity coverage, or public deployment readiness. A separate [full live journey protocol](LIVE_JOURNEY.md) and an independently sourced runtime/rating check remain mandatory. The app's live route also requires `QLOO_LIVE_ENABLED=1` **and** a healthy, configured shared quota guard; keep the switch off until those gates and public abuse controls are reviewed. The smoke script does not change that switch or use the shared guard.

For a future **authorized** Windows PowerShell smoke run, this prompt keeps the key out of command history and screen output. Enter only the host confirmed by the issuer. If it is outside the two approved origins, stop and update the contract review before any request. The smoke script never changes `QLOO_LIVE_ENABLED`.

```powershell
$env:QLOO_API_ORIGIN = Read-Host "Issuer-confirmed Qloo HTTPS origin"
$env:QLOO_API_KEY = [System.Net.NetworkCredential]::new("", (Read-Host "Qloo API key" -AsSecureString)).Password
try {
  npm run qloo:smoke -- --live-once
} finally {
  Remove-Item Env:QLOO_API_KEY
  Remove-Item Env:QLOO_API_ORIGIN
}
```

Do not paste the key into the prompt for `QLOO_API_ORIGIN`. A failed smoke run is a blocker for the full live journey; do not repeat calls against guessed hosts.
