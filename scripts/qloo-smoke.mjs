// Live-only, redacted smoke check. Requires a real hackathon key in the environment.
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
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body?.results?.entities))
    throw new Error(`${path} returned an unexpected shape`);
  console.log(
    `${path}: HTTP ${response.status}, ${body.results.entities.length} entities (names and IDs redacted)`,
  );
  return body.results.entities;
}
try {
  const matches = await call("/search", {
    query: "Miles Davis",
    types: "urn:entity:artist",
    take: "3",
  });
  if (matches.length === 0)
    throw new Error("Search returned no entities; insights not attempted");
  await call("/v2/insights", {
    "filter.type": "urn:entity:movie",
    "signal.interests.entities": matches[0].entity_id,
    "feature.explainability": "true",
    take: "3",
  });
  console.log("Live Qloo smoke check passed.");
} catch (error) {
  console.error(
    `Live Qloo smoke check failed: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  process.exitCode = 1;
}
