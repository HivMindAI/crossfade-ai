# Free-tier deployment preparation — not authorization to deploy

The repository contains a Next.js Node runtime app (`/api/plan` is a server route), a Vercel framework configuration, and a synthetic development mode. No public deployment has been made or validated. A free account may be suitable for a bounded demonstration only after its current terms, quotas, and application behavior are checked by the account owner; this document does not assume free capacity.

## Configuration

1. Deploy the existing `feature/crossfade-mvp` commit only after review. Do not merge `main` as part of setup.
2. Keep `QLOO_API_KEY` in the hosting provider's **server-side secret settings**. Never use `NEXT_PUBLIC_`, a repository file, browser storage, or a build log for this value. Match `QLOO_API_ORIGIN` to the key issuer's instructions; the app permits only `https://hackathon.api.qloo.com` or `https://api.qloo.com`. Keep `QLOO_LIVE_ENABLED=0` (or unset) until the authenticated and public-abuse gates below pass. Synthetic mode needs no key.
3. Build with `npm ci && npm run build`, start using the platform's Next.js Node integration or `npm run start`, and require HTTPS on the public hostname. Do not use a static export for `/api/plan`.
4. Add a provider-level, shared rate rule for `/api/plan` before public traffic. The in-memory 15-per-minute window is process-local and can be bypassed by multiple server instances. Confirm Qloo account request limits and align the public limit below them. Consider a short server-side response cache for repeated demo queries only after documenting key scoping, expiry, and privacy trade-offs; no cross-request cache is implemented today.
5. Restrict deployment logs to safe status/error codes. Do not log Qloo request headers, raw responses, full user interests, or secrets. Monitor 429, timeout, and upstream errors without exposing payloads.

## Independent release gates

- **Authenticated integration:** With account-owner approval, run the [bounded Qloo smoke procedure](QLOO.md), then manually verify the complete live UI journey. Record counts/statuses, not raw responses or credentials. A smoke pass does not establish duration minutes.
- **Scheduling:** Obtain trustworthy film runtime in minutes and rating independently before treating a conceptual result as a duration-verified schedule. Check rights, availability, and venue separately.
- **Public deployment:** After rate controls are in place, verify HTTPS, origin behavior, error states, mobile layout, and synthetic/live provenance on the actual public URL. This is a distinct gate from local or authenticated API testing.
- **Activation:** Only after those checks, the account owner may set `QLOO_LIVE_ENABLED=1` server-side. Revert it to `0` if rate limits, response contracts, or safety controls fail.
- **Submission:** Update the Devpost text and PR validation record with only observed results; the account owner makes the final submission.

No paid API, hosted database, or LLM service is required for the local synthetic demonstration. A multi-instance public rate limiter might require provider support; if no no-cost shared limit is available, keep the public live endpoint disabled or use a tightly access-controlled judge demo until an approved safeguard exists.
