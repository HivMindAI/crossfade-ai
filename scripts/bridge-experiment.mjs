// Isolated artist-only research. Importing this module never contacts providers.
import { fileURLToPath } from "node:url";
import { classifyInsightsPage } from "./qloo-insights-classify.mjs";
import { validateSearchResults } from "../src/lib/qloo-search.mjs";
import {
  QuotaAdmissionError,
  reserveSharedQuota,
} from "../src/lib/live-quota-core.mjs";

export const MAX_QLOO_CALLS = 8;
const ORIGIN = "https://hackathon.api.qloo.com";
const ARTIST = "urn:entity:artist";
const NAMES = ["Miles Davis", "Beyoncé"];
const MAX_URL_BYTES = 6_000;
const MAX_RESPONSE_BYTES = 2_000_000;

class ResearchFailure extends Error {
  constructor(status, category, stage, httpStatus = null) {
    super(category);
    this.status = status;
    this.category = category;
    this.stage = stage;
    this.httpStatus = httpStatus;
  }
}

const fail = (category, stage, httpStatus) =>
  new ResearchFailure("FAIL", category, stage, httpStatus);
const inconclusive = (category, stage) =>
  new ResearchFailure("INCONCLUSIVE", category, stage);

function approvedQlooOrigin(value) {
  try {
    const url = new URL(value || ORIGIN);
    if (
      url.origin === ORIGIN &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    )
      return url.origin;
  } catch {
    // Configuration fails before any token-bearing request.
  }
  throw fail("unapproved-origin", "preflight");
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function boundedJson(response, stage, signal) {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES)
    throw fail("response-size", stage);
  const reader = response.body?.getReader();
  if (!reader) throw fail("response-shape", stage);
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch {
      throw fail(signal.aborted ? "qloo-timeout" : "response-read", stage);
    }
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw fail("response-size", stage);
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  try {
    return JSON.parse(body + decoder.decode());
  } catch {
    throw fail("invalid-json", stage);
  }
}

function validEnvelope(body, kind, take, stage) {
  if (
    !object(body) ||
    body.success === false ||
    (body.success !== undefined && typeof body.success !== "boolean") ||
    Object.hasOwn(body, "error")
  )
    throw fail(`${kind}-envelope`, stage);
  const rows = kind === "search" ? body.results : body.results?.entities;
  if (!Array.isArray(rows) || rows.length > take)
    throw fail(`${kind}-envelope`, stage);
  return rows;
}

function searchRows(body, take, name, stage) {
  const rows = validEnvelope(body, "search", take, stage);
  const checked = validateSearchResults(rows, ARTIST, take);
  if (checked.fatal) throw fail("search-entities", stage);
  const exact = checked.entities.filter(
    (item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  if (exact.length !== 1) throw inconclusive("search-unresolved", stage);
  return exact[0].entity_id;
}

function insightRows(body, take, stage, side, filterIds) {
  const rows = validEnvelope(body, "insights", take, stage);
  // Match the production raw-entity envelope before using its shared strict
  // classifier. Production trims identity strings via Zod.
  if (
    rows.some(
      (item) =>
        !object(item) ||
        typeof item.entity_id !== "string" ||
        !item.entity_id.trim() ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        (item.type !== undefined && typeof item.type !== "string") ||
        (item.subtype !== undefined && typeof item.subtype !== "string") ||
        (item.properties !== undefined && !object(item.properties)) ||
        (item.query !== undefined && !object(item.query)),
    )
  )
    throw fail("insights-entities", stage);
  const normalized = rows.map((item) => ({
    ...item,
    entity_id: item.entity_id.trim(),
    name: item.name.trim(),
  }));
  const checked = classifyInsightsPage(normalized, ARTIST);
  if (!checked.accepted) throw fail("insights-entities", stage);
  if (filterIds) {
    const allowed = new Set(filterIds);
    if (normalized.some((item) => !allowed.has(item.entity_id)))
      throw fail("filtered-outsider", stage);
  }
  if (!normalized.length) throw inconclusive("empty-results", stage);
  return normalized.map((item, index) => ({
    id: item.entity_id,
    rank: index + 1,
    source: "qloo",
    stage,
    side,
  }));
}

function paretoCount(ids, aRank, bRank) {
  return ids.filter(
    (id) =>
      !ids.some(
        (other) =>
          other !== id &&
          aRank.get(other) <= aRank.get(id) &&
          bRank.get(other) <= bRank.get(id) &&
          (aRank.get(other) < aRank.get(id) ||
            bRank.get(other) < bRank.get(id)),
      ),
  ).length;
}

/**
 * @param {{ config: { authorized: boolean, liveModeOff: boolean, key: string | undefined, qlooOrigin?: string, redisUrl: string | undefined, redisToken: string | undefined, quotaLimit: string | undefined }, qlooTransport: typeof fetch, redisTransport: typeof fetch }} options
 * @returns {Promise<Record<string, unknown>>} Redacted aggregate report only.
 */
export async function runBridgeExperiment({
  config,
  qlooTransport,
  redisTransport,
}) {
  const started = performance.now();
  const report = {
    status: "BLOCKED",
    stage: "preflight",
    category: "none",
    httpStatus: null,
    logicalCalls: 0,
    httpAttempts: 0,
    redisRequests: 0,
    reservationOutcome: "not-attempted",
    httpStatuses: [],
    // Advisory only: the header's presence and meaning are not yet confirmed
    // by official Qloo documentation. Never use it to admit a request.
    monthlyHeaderState: "absent",
    monthlyRemainingMinimum: null,
    initialIntersection: null,
    unionCandidates: null,
    discoveryReturned: [null, null],
    evaluationReturned: [null, null],
    controlReturned: [null, null],
    controlMembershipValid: [false, false],
    filterEvidence: "not-tested",
    culturalCompatibility: "unverified",
    doublyReturned: null,
    newlyDoublyReturned: null,
    baselineEvaluable: null,
    baselineFrontier: null,
    expandedFrontier: null,
    provenanceRecords: 0,
    latencyMs: 0,
  };
  try {
    if (
      config?.authorized !== true ||
      config.liveModeOff !== true ||
      !config.key?.trim() ||
      typeof qlooTransport !== "function" ||
      typeof redisTransport !== "function"
    )
      throw new ResearchFailure("BLOCKED", "preflight", "preflight");
    const origin = approvedQlooOrigin(config.qlooOrigin);
    const key = config.key.trim();
    try {
      await reserveSharedQuota({
        rawUrl: config.redisUrl,
        token: config.redisToken,
        rawLimit: config.quotaLimit,
        transport: (...args) => {
          if (report.redisRequests >= 1)
            throw fail("redis-request-cap", "reservation");
          report.redisRequests++;
          return redisTransport(...args);
        },
      });
      report.reservationOutcome = "admitted";
    } catch (error) {
      const reason =
        error instanceof QuotaAdmissionError ? error.category : "unavailable";
      report.reservationOutcome =
        reason === "exhausted"
          ? "denied"
          : report.redisRequests > 0
            ? "unknown"
            : "not-attempted";
      const categories = {
        exhausted: "quota-denied",
        timeout: "quota-timeout",
        transport: "quota-transport",
        authentication: "quota-authentication",
        "http-status": "quota-http-status",
        "provider-error": "quota-provider-error",
        "malformed-response": "quota-malformed-response",
        configuration: "quota-configuration",
        origin: "quota-configuration",
      };
      throw new ResearchFailure(
        "BLOCKED",
        categories[reason] ?? "quota-unavailable",
        "reservation",
        error instanceof QuotaAdmissionError ? error.httpStatus : null,
      );
    }

    async function get(path, params, stage) {
      if (
        report.logicalCalls >= MAX_QLOO_CALLS ||
        report.httpAttempts >= MAX_QLOO_CALLS
      )
        throw fail("request-cap", stage);
      const url = new URL(path, origin);
      url.search = new URLSearchParams(params).toString();
      if (Buffer.byteLength(url.href, "utf8") > MAX_URL_BYTES)
        throw inconclusive("url-size", stage);
      report.logicalCalls++;
      report.httpAttempts++; // Count even a transport rejection or timeout.
      const signal = AbortSignal.timeout(8_000);
      let response;
      try {
        response = await qlooTransport(url, {
          method: "GET",
          headers: { "X-Api-Key": key, Accept: "application/json" },
          signal,
          cache: "no-store",
          redirect: "manual",
        });
      } catch {
        throw fail(signal.aborted ? "qloo-timeout" : "qloo-transport", stage);
      }
      if (!response || !Number.isInteger(response.status))
        throw fail("response-shape", stage);
      report.httpStatuses.push(response.status);
      const remaining = response.headers?.get("x-month-ratelimit-remaining");
      if (remaining !== null && remaining !== undefined) {
        if (/^\d{1,9}$/.test(remaining)) {
          const value = Number(remaining);
          if (report.monthlyHeaderState !== "invalid") {
            report.monthlyHeaderState = "numeric-unverified";
            report.monthlyRemainingMinimum =
              report.monthlyRemainingMinimum === null
                ? value
                : Math.min(report.monthlyRemainingMinimum, value);
          }
        } else {
          report.monthlyHeaderState = "invalid";
          report.monthlyRemainingMinimum = null;
        }
      }
      if (response.status >= 300 && response.status < 400)
        throw fail("qloo-redirect", stage, response.status);
      if (response.status !== 200)
        throw fail("qloo-http", stage, response.status);
      return boundedJson(response, stage, signal);
    }

    const seeds = [];
    for (let side = 0; side < 2; side++) {
      const stage = `search-${side}`;
      const body = await get(
        "/search",
        { query: NAMES[side], types: ARTIST, take: "8" },
        stage,
      );
      seeds.push(searchRows(body, 8, NAMES[side], stage));
    }
    const discovery = [];
    for (let side = 0; side < 2; side++) {
      const stage = `discovery-${side}`;
      const body = await get(
        "/v2/insights",
        {
          "filter.type": ARTIST,
          "signal.interests.entities": seeds[side],
          "feature.explainability": "true",
          take: "10",
          page: "1",
        },
        stage,
      );
      const rows = insightRows(body, 10, stage, side);
      discovery.push(rows);
      report.discoveryReturned[side] = rows.length;
      report.provenanceRecords += rows.length;
    }
    const originalIds = new Set(discovery[0].map((row) => row.id));
    const originalShared = new Set(
      discovery[1].map((row) => row.id).filter((id) => originalIds.has(id)),
    );
    const union = [
      ...new Set(discovery.flatMap((rows) => rows.map((row) => row.id))),
    ];
    report.initialIntersection = originalShared.size;
    report.unionCandidates = union.length;
    if (union.length < 2 || union.length > 20)
      throw inconclusive("insufficient-pool", "union");

    const evaluation = [];
    for (let side = 0; side < 2; side++) {
      const stage = `evaluation-${side}`;
      const body = await get(
        "/v2/insights",
        {
          "filter.type": ARTIST,
          "signal.interests.entities": seeds[side],
          "feature.explainability": "true",
          "filter.results.entities": union.join(","),
          take: String(union.length),
          page: "1",
        },
        stage,
      );
      const rows = insightRows(body, union.length, stage, side, union);
      evaluation.push(rows);
      report.evaluationReturned[side] = rows.length;
      report.provenanceRecords += rows.length;
    }

    for (let side = 0; side < 2; side++) {
      const stage = `control-${side}`;
      const omitted = evaluation[side][0]?.id;
      const subset = union.filter((id) => id !== omitted);
      if (!omitted || !subset.length || subset.length === union.length)
        throw inconclusive("insufficient-control", stage);
      const body = await get(
        "/v2/insights",
        {
          "filter.type": ARTIST,
          "signal.interests.entities": seeds[side],
          "feature.explainability": "true",
          "filter.results.entities": subset.join(","),
          take: String(subset.length),
          page: "1",
        },
        stage,
      );
      const rows = insightRows(body, subset.length, stage, side, subset);
      report.controlReturned[side] = rows.length;
      report.controlMembershipValid[side] = true;
      report.provenanceRecords += rows.length;
    }
    report.filterEvidence = "sample-membership-only";

    const aRank = new Map(evaluation[0].map((row) => [row.id, row.rank]));
    const bRank = new Map(evaluation[1].map((row) => [row.id, row.rank]));
    const doubly = [...aRank.keys()].filter((id) => bRank.has(id));
    const baseline = doubly.filter((id) => originalShared.has(id));
    report.doublyReturned = doubly.length;
    report.newlyDoublyReturned = doubly.length - baseline.length;
    report.baselineEvaluable = baseline.length;
    report.baselineFrontier = paretoCount(baseline, aRank, bRank);
    report.expandedFrontier = paretoCount(doubly, aRank, bRank);
    report.status = "VALID";
    report.stage = "complete";
  } catch (error) {
    const safe =
      error instanceof ResearchFailure
        ? error
        : new ResearchFailure("FAIL", "internal", "internal");
    report.status = safe.status;
    report.stage = safe.stage;
    report.category = safe.category;
    report.httpStatus = safe.httpStatus;
  }
  report.latencyMs = Math.round(performance.now() - started);
  return report;
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--live-once") {
    process.stdout.write(
      "BLOCKED preflight=explicit_live_once_required requests=0\n",
    );
    process.exitCode = 1;
    return;
  }
  const report = await runBridgeExperiment({
    config: {
      authorized: process.env.CROSSFADE_BRIDGE_AUTHORIZED === "1",
      liveModeOff: process.env.QLOO_LIVE_ENABLED === "0",
      key: process.env.QLOO_API_KEY,
      qlooOrigin: process.env.QLOO_API_ORIGIN,
      redisUrl: process.env.UPSTASH_REDIS_REST_URL,
      redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
      quotaLimit: process.env.QLOO_LIVE_PLANS_PER_HOUR,
    },
    qlooTransport: fetch,
    redisTransport: fetch,
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.status !== "VALID") process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    process.stdout.write("FAIL stage=internal category=internal requests=0\n");
    process.exitCode = 1;
  });
}
