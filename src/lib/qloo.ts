import "server-only";
import { z } from "zod";
import { AppError } from "./errors";
import { cancellableWait, throwIfAborted } from "./cancellation";
import { validateSearchResults } from "./qloo-search.mjs";
import { classifyInsightsPage } from "../../scripts/qloo-insights-classify.mjs";
import {
  DOMAINS,
  entityType,
  type CulturalSource,
  type Domain,
  type Entity,
  type EvidenceSet,
  type InfluenceSignal,
  type InsightOptions,
  type SearchMatch,
} from "./model";

const DEFAULT_ORIGIN = "https://hackathon.api.qloo.com";
const MAX_RESPONSE_BYTES = 2_000_000;

function approvedOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (
      url.origin === DEFAULT_ORIGIN &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    )
      return url.origin;
  } catch {
    // Invalid configuration must fail before sending an authenticated request.
  }
  throw new AppError(
    "QLOO_CONFIG",
    "The configured Qloo API host is not approved.",
    503,
  );
}
const rawEntity = z
  .object({
    entity_id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    type: z.string().optional(),
    subtype: z.string().optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
    query: z
      .object({ explainability: z.unknown().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();
const searchEnvelope = z
  .object({
    success: z.boolean().optional(),
    // Item validation is Search-specific and shared with the bounded smoke.
    results: z.array(z.unknown()),
  })
  .passthrough();
const insightsEnvelope = z
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
  const seen = new Set<string>();
  return entries
    .flatMap(([signalId, raw]) => {
      const object = record(raw);
      const score = object ? (object.normalized_score ?? object.score) : raw;
      if (seen.has(signalId)) return [];
      const valid =
        signalIds.includes(signalId) &&
        typeof score === "number" &&
        Number.isFinite(score) &&
        score >= 0 &&
        score <= 1;
      if (!valid) return [];
      seen.add(signalId);
      return [{ signalId, normalizedInfluence: score }];
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

async function limitedResponseText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new AppError(
        "QLOO_RESPONSE_SIZE",
        "Qloo returned an oversized response.",
        502,
      );
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export class QlooClient implements CulturalSource {
  private attempts = 0;
  private origin: string;
  constructor(
    private key: string,
    private transport: typeof fetch = fetch,
    private maxAttempts = 24,
    private timeoutMs = 8000,
    private wait: (
      ms: number,
      signal?: AbortSignal,
    ) => Promise<void> = cancellableWait,
    origin = DEFAULT_ORIGIN,
  ) {
    if (!key.trim())
      throw new AppError(
        "MISSING_KEY",
        "Live Qloo mode requires QLOO_API_KEY.",
        503,
      );
    this.origin = approvedOrigin(origin);
  }

  metrics() {
    return { httpAttempts: this.attempts };
  }

  private async get(
    path: string,
    params: URLSearchParams,
    allow404 = false,
    signal?: AbortSignal,
  ) {
    const url = new URL(path, this.origin);
    url.search = params.toString();
    for (let attempt = 0; attempt < 3; attempt++) {
      throwIfAborted(signal);
      if (this.attempts >= this.maxAttempts)
        throw new AppError("BUDGET", "Qloo HTTP attempt budget exceeded.", 429);
      this.attempts++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const requestSignal = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;
      try {
        const response = await this.transport(url, {
          headers: { "X-Api-Key": this.key, Accept: "application/json" },
          signal: requestSignal,
          cache: "no-store",
          redirect: "manual",
        });
        if (response.status >= 300 && response.status < 400)
          throw new AppError(
            "QLOO_REDIRECT",
            "Qloo redirected the request; no credential was forwarded.",
            502,
          );
        if (response.status === 401 || response.status === 403)
          throw new AppError(
            "QLOO_AUTH",
            "Qloo rejected the configured API key.",
            502,
          );
        if (response.status === 404 && allow404) return { results: [] };
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
            await this.wait(delay, signal);
            throwIfAborted(signal);
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
        if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES)
          throw new AppError(
            "QLOO_RESPONSE_SIZE",
            "Qloo returned an oversized response.",
            502,
          );
        const body = await limitedResponseText(response);
        throwIfAborted(signal);
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
        return parsed;
      } catch (error) {
        throwIfAborted(signal);
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
        await this.wait(200 * (attempt + 1), signal);
        throwIfAborted(signal);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new AppError("QLOO_UPSTREAM", "Qloo is unavailable.", 503);
  }

  async search(
    name: string,
    domain: Domain,
    options: { take?: number; signal?: AbortSignal } = {},
  ): Promise<SearchMatch[]> {
    const take = options.take ?? 8;
    if (!DOMAINS.includes(domain))
      throw new AppError("INVALID_QUERY", "Invalid Qloo Search type.", 400);
    if (!Number.isInteger(take) || take < 1 || take > 100)
      throw new AppError("INVALID_QUERY", "Invalid Qloo Search size.", 400);
    const params = new URLSearchParams({
      query: name,
      types: entityType(domain),
      take: String(take),
    });
    const response = searchEnvelope.safeParse(
      await this.get("/search", params, true, options.signal),
    );
    if (!response.success)
      throw new AppError(
        "QLOO_MALFORMED",
        "Qloo Search returned an unexpected response.",
        502,
      );
    if (response.data.success === false)
      throw new AppError("QLOO_UPSTREAM", "Qloo Search reported failure.", 502);
    if ("error" in response.data)
      throw new AppError(
        "QLOO_UPSTREAM",
        "Qloo Search reported an error.",
        502,
      );
    if (response.data.results.length > take)
      throw new AppError(
        "QLOO_MALFORMED",
        "Qloo returned more Search results than requested.",
        502,
      );
    const validated = validateSearchResults(
      response.data.results,
      entityType(domain),
      take,
    );
    if (validated.fatal)
      throw new AppError(
        "QLOO_MALFORMED",
        "Qloo Search returned invalid or ambiguous entities.",
        502,
      );
    return validated.entities.map((item) => ({
      id: item.entity_id,
      name: item.name,
      domain,
    }));
  }

  async insights(
    domain: Domain,
    signalIds: string[],
    excludedIds: string[],
    options: InsightOptions = { take: 20, page: 1 },
    signal?: AbortSignal,
  ): Promise<EvidenceSet> {
    if (signalIds.length === 0)
      return { entities: [], signalIds, source: "qloo", ...options };
    if (
      !Number.isInteger(options.take) ||
      !Number.isInteger(options.page) ||
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
    const response = insightsEnvelope.safeParse(
      await this.get("/v2/insights", params, false, signal),
    );
    if (!response.success)
      throw new AppError(
        "QLOO_MALFORMED",
        "Qloo Insights returned an unexpected response.",
        502,
      );
    if (response.data.success === false)
      throw new AppError(
        "QLOO_UPSTREAM",
        "Qloo Insights reported failure.",
        502,
      );
    if (response.data.results.entities.length > options.take)
      throw new AppError(
        "QLOO_MALFORMED",
        "Qloo returned more Insights results than requested.",
        502,
      );
    const classification = classifyInsightsPage(
      response.data.results.entities,
      entityType(domain),
    );
    if (!classification.accepted)
      throw new AppError(
        "QLOO_MALFORMED",
        "Qloo Insights returned invalid or ambiguous entity metadata.",
        502,
      );
    // Keep returned positions and full-page counts intact. The shared local
    // eligibility filter excludes rejected IDs before any option/partial receipt.
    const entities: Entity[] = response.data.results.entities.map((item) => {
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
  if (process.env.QLOO_LIVE_ENABLED !== "1")
    throw new AppError(
      "QLOO_LIVE_DISABLED",
      "Live Qloo planning is disabled until its validation and public-demo gates are approved.",
      503,
    );
  return new QlooClient(
    key.data,
    fetch,
    24,
    8000,
    undefined,
    process.env.QLOO_API_ORIGIN?.trim() || DEFAULT_ORIGIN,
  );
}
