import "server-only";
import { AppError } from "./errors";
import { QuotaAdmissionError, reserveSharedQuota } from "./live-quota-core.mjs";

export async function reserveLivePlan(
  transport: typeof fetch = fetch,
): Promise<void> {
  try {
    await reserveSharedQuota({
      rawUrl: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
      rawLimit: process.env.QLOO_LIVE_PLANS_PER_HOUR,
      transport,
    });
  } catch (error) {
    if (error instanceof QuotaAdmissionError && error.category === "exhausted")
      throw new AppError(
        "QLOO_SHARED_QUOTA",
        "The live demo has reached its shared hourly request budget. Try again later.",
        429,
      );
    throw new AppError(
      "QLOO_GUARD_UNAVAILABLE",
      "Live planning is unavailable until its shared quota guard is configured and healthy.",
      503,
    );
  }
}
