import "server-only";
import { z } from "zod";
import { AppError } from "./errors";
import {
  entityType,
  type CulturalSource,
  type Domain,
  type Entity,
  type EvidenceSet,
  type InfluenceSignal,
  type InsightOptions,
  type SearchMatch,
} from "./model";

const ORIGIN = "https://hackathon.api.qloo.com";
const rawEntity = z
  .object({
    entity_id: z.string().min(1),
    name: z.string().min(1),
    type: z.string().optional(),
    subtype: z.string().optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
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

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

// The public reference describes per-result normalized influence, but not a
// stable JSON schema. Only expose explicit ID/value pairs that match inputs.
function influenceSignals(
  value: unknown,
  signalIds: string[],
): InfluenceSignal[] {
  const data = record(value);
  if (!data) return [];
  const input = data.entities ?? data["signal.interests.entities"];
  const entries: [string, unknown][] = Array.isArray(input)
    ? input.flatMap((item) => {
        const object = record(item);
        return object && typeof object.entity_id === "string"
          ? [[object.entity_id, object.normalized_score ?? object.score]]
          : [];
      })
    : Object.entries(record(input) ?? {});
  return entries
    .flatMap(([signalId, raw]) => {
      const object = record(raw);
      const score = object ? (object.normalized_score ?? object.score) : raw;
      return signalIds.includes(signalId) &&
        typeof score === "number" &&
        Number.isFinite(score) &&
        score >= 0 &&
        score <= 1
        ? [{ signalId, normalizedInfluence: score }]
        : [];
    })
    .slice(0, signalIds.length);
}

function retryDelay(header: string | null, fallback: number): number {
  if (!header) return fallback;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(header) - Date.now();
  return Number.isFinite(ms) ? Math.max(0, ms) : fallback;
}

export class QlooClient implements CulturalSource {
  private attempts = 0;
  constructor(
    private key: string,
    private transport: typeof fetch = fetch,
    private maxAttempts = 24,
    private timeoutMs = 8000,
    private wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    if (!key.trim())
      throw new AppError(
        "MISSING_KEY",
        "Live Qloo mode requires QLOO_API_KEY.",
        503,
      );
  }

  metrics() {
    return { httpAttempts: this.attempts };
  }

  private async get(path: string, params: URLSearchParams, allow404 = false) {
    const url = new URL(path, ORIGIN);
    url.search = params.toString();
    for (let attempt = 0; attempt < 3; attempt++) {
      if (this.attempts >= this.maxAttempts)
        throw new AppError("BUDGET", "Qloo HTTP attempt budget exceeded.", 429);
      this.attempts++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
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
        if (response.status === 404 && allow404)
          return { results: { entities: [] } } as z.infer<typeof envelope>;
        if (response.status === 429 || response.status >= 500) {
          const delay = retryDelay(
            response.headers.get("Retry-After"),
            200 * (attempt + 1),
          );
          if (attempt < 2 && delay <= 1000 && this.attempts >= this.maxAttempts)
            throw new AppError(
              "BUDGET",
              "Qloo HTTP attempt budget exceeded.",
              429,
            );
          if (attempt < 2 && delay <= 1000) {
            await this.wait(delay);
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
        if (Number(response.headers.get("content-length")) > 2_000_000)
          throw new AppError(
            "QLOO_RESPONSE_SIZE",
            "Qloo returned an oversized response.",
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
        if (!result.success)
          throw new AppError(
            "QLOO_MALFORMED",
            "Qloo returned an unexpected response.",
            502,
          );
        if (result.data.success === false)
          throw new AppError(
            "QLOO_UPSTREAM",
            "Qloo reported an unsuccessful request.",
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
        if (attempt < 2 && this.attempts >= this.maxAttempts)
          throw new AppError(
            "BUDGET",
            "Qloo HTTP attempt budget exceeded.",
            429,
          );
        if (attempt === 2)
          throw new AppError("QLOO_NETWORK", "Could not reach Qloo.", 503);
        await this.wait(200 * (attempt + 1));
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
    const response = await this.get("/search", params, true);
    return response.results.entities
      .filter((item) => !item.type || item.type === entityType(domain))
      .map((item) => ({ id: item.entity_id, name: item.name, domain }));
  }

  async insights(
    domain: Domain,
    signalIds: string[],
    excludedIds: string[],
    options: InsightOptions = { take: 20, page: 1 },
  ): Promise<EvidenceSet> {
    if (signalIds.length === 0)
      return { entities: [], signalIds, source: "qloo", ...options };
    if (
      options.take < 1 ||
      options.take > 50 ||
      options.page < 1 ||
      options.page > 100
    )
      throw new AppError("INVALID_QUERY", "Invalid Qloo paging request.", 400);
    const params = new URLSearchParams({
      "filter.type": entityType(domain),
      "signal.interests.entities": signalIds.join(","),
      "feature.explainability": "true",
      take: String(options.take),
      page: String(options.page),
    });
    if (excludedIds.length)
      params.set("filter.exclude.entities", excludedIds.join(","));
    const response = await this.get("/v2/insights", params);
    const entities: Entity[] = response.results.entities
      .filter((item) => !excludedIds.includes(item.entity_id))
      .map((item) => {
        if (item.type && item.type !== entityType(domain))
          throw new AppError(
            "QLOO_MALFORMED",
            "Qloo returned a result of the wrong type.",
            502,
          );
        const explainability = record(item.query?.explainability);
        return {
          id: item.entity_id,
          name: item.name,
          domain,
          // The public contract does not establish a film runtime field or
          // unit. Do not promote an undocumented property into a hard gate.
          contentRating:
            domain === "movie" &&
            typeof item.properties?.content_rating === "string"
              ? item.properties.content_rating
              : undefined,
          explainability: explainability ? "available" : "unavailable",
          influence: influenceSignals(explainability, signalIds),
          evidenceWarning:
            typeof explainability?.warning === "string"
              ? "Qloo reported that explainability could not be computed."
              : undefined,
        };
      });
    return { entities, signalIds, source: "qloo", ...options };
  }
}

export function liveSource(): QlooClient {
  const key = z.string().trim().min(1).safeParse(process.env.QLOO_API_KEY);
  if (!key.success)
    throw new AppError(
      "MISSING_KEY",
      "Live Qloo mode requires QLOO_API_KEY.",
      503,
    );
  return new QlooClient(key.data);
}
