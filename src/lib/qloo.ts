import "server-only";
import { z } from "zod";
import { AppError } from "./errors";
import {
  entityType,
  type CulturalSource,
  type Domain,
  type Entity,
  type EvidenceSet,
  type SearchMatch,
} from "./model";

const ORIGIN = "https://hackathon.api.qloo.com";
const rawEntity = z
  .object({
    entity_id: z.string().min(1),
    name: z.string().min(1),
    subtype: z.string().optional(),
    properties: z
      .object({
        duration: z.number().positive().optional(),
        content_rating: z.string().optional(),
      })
      .passthrough()
      .optional(),
    query: z
      .object({ explainability: z.unknown().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();
const envelope = z
  .object({
    success: z.boolean().optional(),
    results: z.object({ entities: z.array(rawEntity) }),
  })
  .passthrough();

export class QlooClient implements CulturalSource {
  private count = 0;
  constructor(
    private key: string,
    private transport: typeof fetch = fetch,
    private maxCalls = 12,
  ) {
    if (!key.trim())
      throw new AppError(
        "MISSING_KEY",
        "Live Qloo mode requires QLOO_API_KEY.",
        503,
      );
  }

  private async get(
    path: string,
    params: URLSearchParams,
  ): Promise<z.infer<typeof envelope>> {
    if (++this.count > this.maxCalls)
      throw new AppError("BUDGET", "Qloo request budget exceeded.", 429);
    const url = new URL(path, ORIGIN);
    url.search = params.toString();
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await this.transport(url, {
          headers: { "X-Api-Key": this.key, Accept: "application/json" },
          signal: controller.signal,
          cache: "no-store",
        });
        if (response.status === 401 || response.status === 403)
          throw new AppError(
            "QLOO_AUTH",
            "Qloo rejected the configured API key.",
            502,
          );
        if (response.status === 404) return { results: { entities: [] } };
        if (response.status === 429 || response.status >= 500) {
          if (attempt < 2) {
            await new Promise((resolve) =>
              setTimeout(resolve, 200 * (attempt + 1)),
            );
            continue;
          }
          throw new AppError(
            response.status === 429 ? "QLOO_RATE_LIMIT" : "QLOO_UPSTREAM",
            "Qloo is temporarily unavailable. Try again shortly.",
            503,
          );
        }
        if (!response.ok)
          throw new AppError(
            "QLOO_REQUEST",
            "Qloo could not process this request.",
            502,
          );
        const body = await response.text();
        if (body.length > 2_000_000)
          throw new AppError(
            "QLOO_RESPONSE_SIZE",
            "Qloo returned an oversized response.",
            502,
          );
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          throw new AppError(
            "QLOO_MALFORMED",
            "Qloo returned invalid JSON.",
            502,
          );
        }
        const result = envelope.safeParse(parsed);
        if (!result.success || result.data.success === false)
          throw new AppError(
            "QLOO_MALFORMED",
            "Qloo returned an unexpected response.",
            502,
          );
        return result.data;
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (controller.signal.aborted)
          throw new AppError(
            "QLOO_TIMEOUT",
            "Qloo took too long to respond.",
            504,
          );
        if (attempt === 2)
          throw new AppError("QLOO_NETWORK", "Could not reach Qloo.", 503);
        await new Promise((resolve) =>
          setTimeout(resolve, 200 * (attempt + 1)),
        );
      } finally {
        clearTimeout(timer);
      }
    }
    throw new AppError("QLOO_UPSTREAM", "Qloo is unavailable.", 503);
  }

  async search(name: string, domain: Domain): Promise<SearchMatch[]> {
    const params = new URLSearchParams({
      query: name,
      types: entityType(domain),
      take: "8",
    });
    const response = await this.get("/search", params);
    return response.results.entities
      .filter((item) => !item.subtype || item.subtype === entityType(domain))
      .map((item) => ({ id: item.entity_id, name: item.name, domain }));
  }

  async insights(
    domain: Domain,
    signalIds: string[],
    excludedIds: string[],
  ): Promise<EvidenceSet> {
    if (signalIds.length === 0)
      return { entities: [], signalIds, source: "qloo" };
    const params = new URLSearchParams({
      "filter.type": entityType(domain),
      "signal.interests.entities": signalIds.join(","),
      "feature.explainability": "true",
      take: "20",
    });
    if (excludedIds.length)
      params.set("filter.exclude.entities", excludedIds.join(","));
    const response = await this.get("/v2/insights", params);
    const entities: Entity[] = response.results.entities.map((item) => ({
      id: item.entity_id,
      name: item.name,
      domain,
      duration: item.properties?.duration,
      contentRating: item.properties?.content_rating,
      explainability: item.query?.explainability ? "available" : "unavailable",
    }));
    return { entities, signalIds, source: "qloo" };
  }
}

export function liveSource(): QlooClient {
  const key = z.string().min(1).safeParse(process.env.QLOO_API_KEY);
  if (!key.success)
    throw new AppError(
      "MISSING_KEY",
      "Live Qloo mode requires QLOO_API_KEY.",
      503,
    );
  return new QlooClient(key.data);
}
