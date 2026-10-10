// Live-only, redacted contract check. Never logs keys, names, IDs, or payloads.
const key = process.env.QLOO_API_KEY?.trim();
if (!key) {
  console.error("QLOO_API_KEY is required. No request sent.");
  process.exit(2);
}

const origin = "https://hackathon.api.qloo.com";
async function call(path, params) {
  const url = new URL(path, origin);
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url, {
    headers: { "X-Api-Key": key, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403)
    throw new Error("authentication rejected by Qloo");
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${path} returned invalid JSON`);
  }
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
