# Milestone 11 backend handoff — one live journey infrastructure gate

No backend code or provider state was changed in this milestone. This handoff is for the backend developer and account owner. The published baseline is `7eed92542a1d949e233c1109c98e00728dc2b976` on `feature/crossfade-mvp`.

## Milestone 12 public Live gate update (2026-10-15)

The owner later verified the atomic Lua operation on an isolated Upstash key (two admissions, third denied, valid TTL, cleanup), completed one fixed live P1 with zero shared IDs across all three domains, and completed a separate VALID artist-only Bridge filter experiment. Bridge remains outside `/api/plan`; filtered return is not positive affinity. Earlier statements below about Redis being untested describe the pre-verification state.

The first public deployment should be **Synthetic only** on a reviewed Node host. Keep `QLOO_LIVE_ENABLED=0`, leave Qloo and Upstash credentials absent, and set `CROSSFADE_SITE_ORIGIN` to the exact issued HTTPS origin. Verify the real public Origin guard, same-site Synthetic POST, foreign-Origin rejection, and Live-without-key failure before sharing the URL. Render Free is the current [preview candidate](DEPLOYMENT.md#first-public-url-synthetic-only-render-free-preview), but its cold start and account access remain untested.

Before any public Live activation, the backend owner must implement and verify the cumulative issuer-period reservation described below **and** a provider-trusted per-source admission rule for `POST /api/plan`. The existing process-local windows and shared hourly plan counter do not identify or throttle individual public clients across restarts/instances. Do not derive identity from caller-supplied `X-Forwarded-For`, `X-Real-IP`, `Origin`, or `Host`. The chosen host/edge must expose a trustworthy source identity or enforce its own rule; test allowed traffic, a blocked burst, shared NAT behavior, Redis failure, and no Qloo dispatch on denial. No $0 edge rule has been verified for the Render `onrender.com` preview. If this cannot be met on the chosen free host, leave public Live off. Keep all failures fixed-category/redacted and do not log credentials, IDs, names, raw provider bodies, or full interests. Do not infer the Qloo cumulative allowance from the unverified monthly-header number.

## Existing boundary

`src/app/api/plan/route.ts` selects `liveSource()`, then awaits `reserveLivePlan()` before `runNegotiation()` can send Qloo requests. `liveSource()` requires an explicit `QLOO_LIVE_ENABLED=1` and a nonblank server-only key. `src/lib/live-quota.ts` sends one authenticated, redirect-disabled Upstash REST `EVAL` to an allowlisted HTTPS origin. The Lua operation atomically admits no more than `QLOO_LIVE_PLANS_PER_HOUR` plans in a 3,600-second window starting with the first admission. Missing configuration, network failure, malformed response, or unhealthy Redis fails closed with application HTTP 503; an exhausted budget maps to HTTP 429. One admitted plan is charged for all **24 possible retry-inclusive Qloo attempts**, even on abort or failure. The application still has a 16-logical-call / 24-attempt / three-concurrent-call per-plan ceiling. Existing tests are mocked; no real Redis instance has been tested.

The Redis hourly counter does **not** know the key's cumulative/monthly allowance or usage by other tools. Public Qloo documentation reviewed for this milestone does not state a numeric allowance for this issued credential. The owner must obtain the actual period, remaining requests, rate limit, reset/expiry time, and whether other clients share the same allocation from the issuer/account. Do not infer those numbers from a different participant's key. For exactly one local plan, require at least **24 uncommitted requests** remaining in every applicable Qloo limit, plus room for any other uses, before setting the hourly plan ceiling to `1`. If a limit is unknown, do not run.

For repeated or public live use, keep the existing hourly guard and add an **atomic cumulative reservation** keyed to the issuer's actual accounting period. In one Redis Lua operation check both the 60-minute plan budget and the cumulative attempt budget, and increment both only when both admit a full 24-attempt reservation. Set each expiry from its real reset boundary; fail closed if the boundary or ceiling is unknown. Never refund an admitted reservation after a partial plan. Account for calls made outside CROSSFADE, or use an isolated key/allocation; a Redis counter cannot discover external consumption. Test concurrency, boundary rollover, provider failures, and the application's 429/503 mapping offline before live activation. Do not invent a monthly reset time or accept a manually chosen public ceiling as proof of issuer allowance.

## Owner-controlled Upstash setup

1. Create a **claimed** $0 Redis database in the account owner's Upstash console. Do not use an anonymous temporary database, upgrade to paid service, or paste credentials into chat or Git. Confirm current free-tier terms in the [Upstash pricing page](https://upstash.com/pricing/redis).
2. In the console's REST/Connect panel, privately capture the HTTPS `UPSTASH_REDIS_REST_URL` and **standard write** `UPSTASH_REDIS_REST_TOKEN`. The read-only token cannot run the reservation. Store both only in the local server's private process environment or an approved secret manager. The code accepts only root `https://*.upstash.io` URLs and never sends the token in a query string. Upstash documents REST bearer authentication and scripting in its [REST reference](https://upstash.com/docs/redis/features/restapi).
3. Keep `QLOO_LIVE_ENABLED=0`. Set `QLOO_LIVE_PLANS_PER_HOUR=1` only after the owner confirms that the real Qloo hourly and cumulative remaining allowances each cover a 24-attempt reservation. No production quota key should be touched by the test below.

## Separate authorization: isolated real Redis verification

The owner reports a claimed Upstash Free database and a successful REST `PING` → `PONG`. That confirms connectivity only. The first isolated verifier run returned `FAIL stage=cleanup statuses=none admitted=0 rejected=0 ttl_valid=false deleted=0 requests=3`. Code inspection proves that the old verifier overwrote the first admission error with a cleanup error. Two `EVAL` requests and one `DEL` were attempted; none produced a recorded HTTP status. The actual transport failure, whether either `EVAL` reached Redis, and whether a disposable key exists remain unknown. Do not scan or delete an unidentified key. If a script admission reached Redis and completed, its TTL should be 3,600 seconds; an unconfirmed partial execution must not be assumed safe. No production quota key was addressed by the verifier.

The repaired verifier in [verify-redis-quota.mjs](../scripts/verify-redis-quota.mjs) keeps the first failure and reports cleanup separately, using only fixed operation/category labels and HTTP status numbers. The owner should privately confirm that the REST credential is the **Standard** token, not the Readonly token, before considering another test. PING can succeed with a Readonly token, while `EVAL` and `DEL` require write privilege. The earlier `statuses=none` result does not prove a Readonly-token denial; an HTTP denial would ordinarily provide a status.

**Subsequent owner-reported result:** the isolated verifier passed with five of five HTTP 200 responses, two admitted reservations, one rejected reservation, valid TTL, and successful cleanup. The initial failure remains a historical diagnostic; its transport cause was not established. No further Redis test is needed for this isolated atomic behavior. The production quota key was not used. See [VALIDATION.md](VALIDATION.md) for the release-gate distinction.

The verifier reads the exact `RESERVE_SCRIPT` Lua template from `src/lib/live-quota-core.mjs`. It creates a new random `crossfade:test:quota:<32-hex-character UUID>` key and issues **five authenticated REST requests maximum, with zero retries**: two concurrent `EVAL` admissions at limit 2, one rejected `EVAL`, one `TTL`, and one `DEL` of that same disposable key. It requires admission results `[1,1]` and `[1,2]` in either order, rejection `[0,2]`, a TTL between 1 and 3,600 seconds, and exactly one deleted key. If a request fails, it still makes at most one cleanup `DEL`. A failed cleanup means key state is unknown; never infer deletion from a timeout. It never addresses `crossfade:qloo:live-plans:v1`.

Run the offline regression checks first:

```powershell
Set-Location D:\CROSSFADE
node --test .\scripts\verify-redis-quota.test.mjs
npx vitest run src/lib/live-quota.test.ts src/app/api/plan/route.test.ts
```

Only after the owner separately authorizes **one additional isolated test of up to five Upstash REST requests**, use this exact command in the privately configured PowerShell session:

```powershell
Set-Location D:\CROSSFADE
$env:QLOO_LIVE_ENABLED = '0'
node .\scripts\verify-redis-quota.mjs --live-once
```

The script requires that explicit flag and `QLOO_LIVE_ENABLED=0`. It permits only a root HTTPS `*.upstash.io` origin, uses a bearer header, disables redirects and caching, caps each response at 2,048 bytes, and times out each request after 2.5 seconds. Its output contains only fixed operation/category labels, HTTP statuses, counts, TTL-valid Boolean, and PASS/FAIL. It never prints credentials, the random key, raw Redis responses, or Qloo data. An actual PASS would establish isolated Upstash `EVAL` behavior, not public-host protection or Qloo allowance.

Upstash returns HTTP 200 for both admitted and rejected `EVAL` decisions. The application maps `[0, used]` to HTTP 429 and missing or unhealthy guard service to HTTP 503. The offline route/quota tests above verify those mappings without a Qloo request. Do not send a live `/api/plan` request merely to test failure handling. The hourly Redis counter still does not enforce a cumulative Qloo allowance or account for calls outside CROSSFADE.

## First P1 plan and evidence limits

After the Redis test and a separate **one-plan** Qloo authorization, follow [LIVE_JOURNEY.md](LIVE_JOURNEY.md) unchanged: A = Miles Davis + Spirited Away; B = Beyoncé + Everything Everywhere All at Once. Use one loopback-only server and one click. An ambiguous Search or failed plan consumes its reservation; do not choose a disambiguation, retry, change rules, or reject an option without another approval and another 24-attempt allowance. On a successful response, `metrics.sourceCalls` and `metrics.httpAttempts` expose logical and attempted counts. The current error response does not reliably expose attempt counts after upstream failure; record **unavailable** rather than zero and conservatively treat the full 24-attempt reservation as spent. The backend developer should add only safe numeric error metrics if complete failed-run measurement becomes necessary. Never log raw provider bodies, Qloo IDs/names, credentials, or full user inputs.
