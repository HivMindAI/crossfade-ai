// Live-only, redacted contract check. Never logs keys, names, IDs, or payloads.
if (process.argv.slice(2).join(" ") !== "--live-once") {
  console.log(
    "Offline only. Add --live-once for the bounded, authenticated three-request check.",
  );
  process.exit(0);
}
const key = process.env.QLOO_API_KEY?.trim();
if (!key) {
  console.error("QLOO_API_KEY is required. No request sent.");
  process.exit(2);
}

const approvedOrigins = new Set([
  "https://hackathon.api.qloo.com",
  "https://api.qloo.com",
]);
let origin;
try {
  const configured = new URL(
    process.env.QLOO_API_ORIGIN?.trim() || "https://hackathon.api.qloo.com",
  );
  if (
    !approvedOrigins.has(configured.origin) ||
    configured.pathname !== "/" ||
    configured.search ||
    configured.hash ||
    configured.username ||
    configured.password
  )
    throw new Error("unapproved host");
  origin = configured.origin;
} catch {
  console.error("QLOO_API_ORIGIN must be an approved Qloo HTTPS host.");
  process.exit(2);
}
let attempts = 0;
async function boundedJson(response, path) {
  const limit = 2_000_000;
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error(`${path} returned an oversized response`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${path} returned no response body`);
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error(`${path} returned an oversized response`);
    }
    text += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(text + decoder.decode());
  } catch {
    throw new Error(`${path} returned invalid JSON`);
  }
}

async function call(path, params) {
  if (attempts >= 3) throw new Error("smoke-check request limit reached");
  const url = new URL(path, origin);
  url.search = new URLSearchParams(params).toString();
  attempts++;
  const response = await fetch(url, {
    headers: { "X-Api-Key": key, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
    redirect: "manual",
  });
  if (response.status >= 300 && response.status < 400)
    throw new Error(`${path} returned a redirect; no request was followed`);
  if (response.status === 401 || response.status === 403)
    throw new Error("authentication rejected by Qloo");
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  const body = await boundedJson(response, path);
  if (body?.success === false || !Array.isArray(body?.results?.entities))
    throw new Error(`${path} returned an unsuccessful or malformed response`);
  if (
    body.results.entities.some(
      (item) =>
        typeof item?.entity_id !== "string" ||
        !item.entity_id ||
        typeof item?.name !== "string" ||
        !item.name,
    )
  )
    throw new Error(`${path} returned malformed entity fields`);
  console.log(
    `${path}: HTTP ${response.status}; valid response structure; ${body.results.entities.length} entities`,
  );
  return body.results.entities;
}

try {
  const matches = await call("/search", {
    query: "Miles Davis",
    types: "urn:entity:artist",
    take: "3",
  });
  console.log("Authentication: accepted for Search.");
  if (matches.length === 0)
    throw new Error(
      "Search returned no matching entities; Insights not attempted",
    );
  const seed = matches.find(
    (item) => !item.type || item.type === "urn:entity:artist",
  );
  if (!seed)
    throw new Error("Search returned no artist entity of the requested type");
  for (const type of ["movie", "book"]) {
    const entities = await call("/v2/insights", {
      "filter.type": `urn:entity:${type}`,
      "signal.interests.entities": seed.entity_id,
      "feature.explainability": "true",
      take: "5",
      page: "1",
    });
    if (entities.length === 0)
      throw new Error(
        `${type} Insights returned 200 OK but no recommendations`,
      );
    if (
      entities.some((item) => item.type && item.type !== `urn:entity:${type}`)
    )
      throw new Error(`${type} Insights returned an unexpected entity type`);
    const explained = entities.filter(
      (item) => item.query?.explainability,
    ).length;
    console.log(
      `${type} cross-domain recommendations: nonempty; per-result explainability objects: ${explained}/${entities.length}`,
    );
  }
  console.log(
    "Live Qloo smoke check passed: authentication, structure, nonempty results, and two cross-domain recommendation sets. Film runtime and public screening rights remain unverified.",
  );
} catch (error) {
  console.error(
    `Live Qloo smoke check failed: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  process.exitCode = 1;
}
