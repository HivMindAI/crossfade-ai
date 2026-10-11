import "server-only";
import { AppError } from "./errors";

const QUOTA_KEY = "crossfade:qloo:live-plans:v1";
const MAX_RESPONSE_BYTES = 2_048;

// One atomic decision across every app instance. The first accepted plan starts
// a 60-minute window. A rejected or failed plan is not refunded: reserving the
// worst-case 24 Qloo attempts before work begins protects the shared budget.
const RESERVE_SCRIPT = `
local limit = tonumber(ARGV[1])
local used = tonumber(redis.call("GET", KEYS[1]) or "0")
if used >= limit then return {0, used} end
used = redis.call("INCR", KEYS[1])
if used == 1 then redis.call("EXPIRE", KEYS[1], 3600) end
return {1, used}
`;

function unavailable(): AppError {
  return new AppError(
    "QLOO_GUARD_UNAVAILABLE",
    "Live planning is unavailable until its shared quota guard is configured and healthy.",
    503,
  );
}

function approvedRedisOrigin(value: string): string {
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
    // A malformed URL must fail before any token-bearing request.
  }
  throw unavailable();
}

async function smallResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw unavailable();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw unavailable();
    }
    body += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(body + decoder.decode());
  } catch {
    throw unavailable();
  }
}

export async function reserveLivePlan(
  transport: typeof fetch = fetch,
): Promise<void> {
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const rawLimit = process.env.QLOO_LIVE_PLANS_PER_HOUR?.trim();
  const limit = Number(rawLimit);
  if (
    !rawUrl ||
    !token ||
    !rawLimit ||
    !/^\d+$/.test(rawLimit) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 10
  )
    throw unavailable();
  const origin = approvedRedisOrigin(rawUrl);
  try {
    const response = await transport(origin, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["EVAL", RESERVE_SCRIPT, 1, QUOTA_KEY, limit]),
      signal: AbortSignal.timeout(2_500),
      cache: "no-store",
      redirect: "manual",
    });
    if (!response.ok || (response.status >= 300 && response.status < 400))
      throw unavailable();
    const payload = await smallResponse(response);
    if (!payload || typeof payload !== "object" || !("result" in payload))
      throw unavailable();
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
      throw unavailable();
    if (result[0] === 0)
      throw new AppError(
        "QLOO_SHARED_QUOTA",
        "The live demo has reached its shared hourly request budget. Try again later.",
        429,
      );
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unavailable();
  }
}
