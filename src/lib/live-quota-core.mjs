// Server-side quota operation shared by the production route and isolated
// research runner. Never import this module into a browser bundle.
export const QUOTA_KEY = "crossfade:qloo:live-plans:v1";
const MAX_RESPONSE_BYTES = 2_048;
export const REDIS_RESERVATION_TIMEOUT_MS = 8_000;

// One atomic decision across every app instance. A reservation is never
// refunded and represents the production worst case of 24 Qloo attempts.
export const RESERVE_SCRIPT = `
local limit = tonumber(ARGV[1])
local used = tonumber(redis.call("GET", KEYS[1]) or "0")
if used >= limit then return {0, used} end
used = redis.call("INCR", KEYS[1])
if used == 1 then redis.call("EXPIRE", KEYS[1], 3600) end
return {1, used}
`;

export class QuotaAdmissionError extends Error {
  constructor(category, httpStatus = null) {
    super(category);
    this.category = category;
    this.httpStatus = httpStatus;
  }
}

const unavailable = (category = "unavailable", httpStatus = null) =>
  new QuotaAdmissionError(category, httpStatus);

export function approvedOrigin(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      url.hostname.endsWith(".upstash.io") &&
      !url.port &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    )
      return url.origin;
  } catch {
    // Invalid configuration fails before a token-bearing request.
  }
  throw unavailable("origin");
}

async function smallResponse(response, signal) {
  const reader = response.body?.getReader();
  if (!reader) throw unavailable("malformed-response", response.status);
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch {
      throw unavailable(
        signal.aborted ? "timeout" : "transport",
        response.status,
      );
    }
    const { done, value } = chunk;
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The size violation remains the cause even if cancellation fails.
      }
      throw unavailable("malformed-response", response.status);
    }
    body += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(body + decoder.decode());
  } catch {
    throw unavailable("malformed-response", response.status);
  }
}

/**
 * @param {{ rawUrl: string | undefined, token: string | undefined, rawLimit: string | undefined, transport?: typeof fetch }} options
 */
export async function reserveSharedQuota({
  rawUrl,
  token,
  rawLimit,
  transport = fetch,
}) {
  const trimmedUrl = rawUrl?.trim();
  const trimmedToken = token?.trim();
  const trimmedLimit = rawLimit?.trim();
  const limit = Number(trimmedLimit);
  if (
    !trimmedUrl ||
    !trimmedToken ||
    !trimmedLimit ||
    !/^\d+$/.test(trimmedLimit) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 10
  )
    throw unavailable("configuration");
  const origin = approvedOrigin(trimmedUrl);
  const signal = AbortSignal.timeout(REDIS_RESERVATION_TIMEOUT_MS);
  let response;
  try {
    response = await transport(origin, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${trimmedToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["EVAL", RESERVE_SCRIPT, 1, QUOTA_KEY, limit]),
      signal,
      cache: "no-store",
      redirect: "manual",
    });
  } catch (error) {
    throw unavailable(
      signal.aborted || error?.name === "TimeoutError"
        ? "timeout"
        : "transport",
    );
  }
  try {
    if (!response || !Number.isInteger(response.status))
      throw unavailable("malformed-response");
    if (response.status === 401 || response.status === 403)
      throw unavailable("authentication", response.status);
    if (response.status !== 200)
      throw unavailable("http-status", response.status);
    const payload = await smallResponse(response, signal);
    if (payload && typeof payload === "object" && "error" in payload)
      throw unavailable("provider-error", response.status);
    if (!payload || typeof payload !== "object" || !("result" in payload))
      throw unavailable("malformed-response", response.status);
    const result = payload.result;
    if (
      !Array.isArray(result) ||
      result.length !== 2 ||
      (result[0] !== 0 && result[0] !== 1) ||
      !Number.isInteger(result[1]) ||
      result[1] < 0 ||
      (result[0] === 1 && result[1] > limit) ||
      (result[0] === 0 && result[1] < limit)
    )
      throw unavailable("malformed-response", response.status);
    if (result[0] === 0)
      throw new QuotaAdmissionError("exhausted", response.status);
  } catch (error) {
    if (error instanceof QuotaAdmissionError) throw error;
    throw unavailable(
      signal.aborted ? "timeout" : "transport",
      response.status,
    );
  }
}
