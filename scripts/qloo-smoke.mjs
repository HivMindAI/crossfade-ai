// Live-only, redacted contract check. Never logs keys, names, IDs, or payloads.
import { validateSearchResults } from "../src/lib/qloo-search.mjs";
import {
  classifyInsightsPage,
  knownPrimaryCategories,
  recognizedPrimary,
  validInsightsIdentity,
  validTypeString,
} from "./qloo-insights-classify.mjs";
const mode = process.argv.slice(2).join(" ");
if (
  mode !== "--live-once" &&
  mode !== "--search-shape-once" &&
  mode !== "--movie-insights-once"
) {
  console.log(
    "Offline only. Use --movie-insights-once for two requests, --live-once for three requests, or --search-shape-once for one Search request; each needs separate owner authorization.",
  );
  process.exit(0);
}
class SmokeError extends Error {}
const key = process.env.QLOO_API_KEY?.trim();
if (!key) {
  console.error("QLOO_API_KEY is required. No request sent.");
  process.exit(2);
}

const hackathonOrigin = "https://hackathon.api.qloo.com";
let origin;
try {
  const configured = new URL(
    process.env.QLOO_API_ORIGIN?.trim() || hackathonOrigin,
  );
  if (
    configured.origin !== hackathonOrigin ||
    configured.pathname !== "/" ||
    configured.search ||
    configured.hash ||
    configured.username ||
    configured.password
  )
    throw new SmokeError("unapproved host");
  origin = configured.origin;
} catch {
  console.error("QLOO_API_ORIGIN must be the Qloo hackathon HTTPS host.");
  process.exit(2);
}
let attempts = 0;
async function boundedJson(response, path) {
  const limit = 2_000_000;
  if (Number(response.headers.get("content-length")) > limit)
    throw new SmokeError(`${path} returned an oversized response`);
  const reader = response.body?.getReader();
  if (!reader) throw new SmokeError(`${path} returned no response body`);
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new SmokeError(`${path} returned an oversized response`);
    }
    text += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(text + decoder.decode());
  } catch {
    throw new SmokeError(`${path} returned invalid JSON`);
  }
}

async function boundedErrorMetadata(response) {
  const limit = 4096;
  const mediaType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  const format =
    mediaType?.endsWith("/json") || mediaType?.endsWith("+json")
      ? "json"
      : "other-or-missing";
  const reader = response.body?.getReader();
  if (!reader) return `error metadata: format=${format}; body=absent`;
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  let capped = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = limit - bytes;
    const accepted = value.subarray(0, remaining);
    bytes += accepted.byteLength;
    text += decoder.decode(accepted, { stream: true });
    if (value.byteLength > remaining || bytes === limit) {
      capped = true;
      await reader.cancel();
      break;
    }
  }
  if (!capped) text += decoder.decode();
  let parsed;
  try {
    if (!capped) parsed = JSON.parse(text);
  } catch {
    // A non-JSON or malformed error body is never printed.
  }
  const object =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  const knownFields = [
    "error",
    "errors",
    "code",
    "message",
    "detail",
    "details",
    "status",
  ];
  const shape = object
    ? knownFields
        .filter((field) => Object.hasOwn(object, field))
        .map((field) => `${field}:${valueType(object[field])}`)
        .join(", ") || "none"
    : "unavailable";
  const errorObject =
    object?.error &&
    typeof object.error === "object" &&
    !Array.isArray(object.error)
      ? object.error
      : null;
  const nestedShape = errorObject
    ? ["code", "message", "detail", "details", "type"]
        .filter((field) => Object.hasOwn(errorObject, field))
        .map((field) => `${field}:${valueType(errorObject[field])}`)
        .join(", ") || "none"
    : "unavailable";
  return `error metadata: format=${format}; bytes=${bytes}; capped=${capped}; json=${parsed !== undefined}; fields=${shape}; error-fields=${nestedShape}`;
}

async function boundedCall(path, params) {
  const maximum =
    mode === "--search-shape-once"
      ? 1
      : mode === "--movie-insights-once"
        ? 2
        : 3;
  if (attempts >= maximum)
    throw new SmokeError("smoke-check request limit reached");
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
    throw new SmokeError(
      `${path} returned HTTP ${response.status} redirect; no request was followed`,
    );
  if (response.status === 401 || response.status === 403)
    throw new SmokeError(
      `authentication rejected by Qloo (HTTP ${response.status})`,
    );
  if (response.status === 400)
    throw new SmokeError(
      `${path} returned HTTP 400; ${await boundedErrorMetadata(response)}`,
    );
  if (!response.ok)
    throw new SmokeError(`${path} returned HTTP ${response.status}`);
  const body = await boundedJson(response, path);
  return { body, status: response.status };
}

function valueType(value) {
  return Array.isArray(value)
    ? "array"
    : value === null
      ? "null"
      : typeof value;
}

function fieldTypes(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return valueType(value);
  const keys = Object.keys(value);
  const fields = keys.slice(0, 24).map((key) => {
    const safeKey = /^[a-z][a-z_.]{0,39}$/.test(key) ? key : "[redacted-field]";
    return `${safeKey}:${valueType(value[key])}`;
  });
  return `${fields.join(", ")}${keys.length > 24 ? ", [more fields]" : ""}`;
}

function searchTypeShape(results) {
  const kinds = new Map();
  let firstObjectFields;
  let entries = 0;
  let nonemptyStringEntries = 0;
  let urnStringEntries = 0;
  let artistMembershipEntities = 0;
  for (const item of results) {
    if (Array.isArray(item?.types)) {
      if (item.types.includes("urn:entity:artist")) artistMembershipEntities++;
      for (const element of item.types) {
        const kind = valueType(element);
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
        if (kind === "object" && firstObjectFields === undefined)
          firstObjectFields = fieldTypes(element);
        entries++;
        if (typeof element === "string" && element.trim().length > 0)
          nonemptyStringEntries++;
        if (
          typeof element === "string" &&
          /^urn:entity:[a-z][a-z_]*$/.test(element)
        ) {
          urnStringEntries++;
        }
      }
    }
  }
  return {
    kinds: [...kinds.entries()].sort(([a], [b]) => a.localeCompare(b)),
    entries,
    nonemptyStringEntries,
    urnStringEntries,
    artistMembershipEntities,
    firstObjectFields,
  };
}

// Insights item fields are inspected separately from Search's array parser.
function insightsTypeDiagnostic(entities, expectedType) {
  const expectedCategory = expectedType.slice("urn:entity:".length);
  const counts = {
    total: entities.length,
    topLevelPresent: 0,
    topLevelExact: 0,
    topLevelDifferent: 0,
    typesArrays: 0,
    validTypesArrays: 0,
    typesExact: 0,
    conflictingPrimary: 0,
    missingOrUnverifiable: 0,
    subtypePresent: 0,
    subtypeExact: 0,
    subtypeKnownOther: 0,
    genericWithExactSubtype: 0,
    noIndependentCategory: 0,
    classifiedAccepted: 0,
    classifiedRejected: 0,
    validIdentities: 0,
  };
  const topCategories = new Map();
  const topKinds = new Map();
  const arrayCategories = new Map();
  const subtypeCategories = new Map();
  const subtypeKinds = new Map();
  const reasons = new Map();
  const candidateReasons = new Map();
  const add = (map, reason) => map.set(reason, (map.get(reason) ?? 0) + 1);
  for (const item of entities) {
    const object =
      item !== null && typeof item === "object" && !Array.isArray(item);
    if (
      validInsightsIdentity(item?.entity_id) &&
      validInsightsIdentity(item?.name)
    )
      counts.validIdentities++;
    const topPresent = object && Object.hasOwn(item, "type");
    const top = item?.type;
    const topExact = top === expectedType;
    const subtypePresent = object && Object.hasOwn(item, "subtype");
    const subtype = item?.subtype;
    const subtypeExact = subtype === expectedType;
    const array = Array.isArray(item?.types) ? item.types : null;
    const arrayValid =
      array !== null && array.length > 0 && array.every(validTypeString);
    const arrayExact = arrayValid && array.includes(expectedType);
    const categories = new Set();
    const topCategory = recognizedPrimary(top);
    const subtypeCategory = recognizedPrimary(subtype);
    if (topCategory) {
      categories.add(topCategory);
      add(topCategories, topCategory);
    }
    if (subtypeCategory) {
      categories.add(subtypeCategory);
      add(subtypeCategories, subtypeCategory);
    }
    if (array) {
      const arrayKnown = new Set(array.map(recognizedPrimary).filter(Boolean));
      for (const category of arrayKnown) {
        categories.add(category);
        add(arrayCategories, category);
      }
    }
    if (topPresent) counts.topLevelPresent++;
    if (topPresent) add(topKinds, valueType(top));
    if (topExact) counts.topLevelExact++;
    else if (topPresent) counts.topLevelDifferent++;
    if (array) counts.typesArrays++;
    if (arrayValid) counts.validTypesArrays++;
    if (arrayExact) counts.typesExact++;
    if (subtypePresent) {
      counts.subtypePresent++;
      add(subtypeKinds, valueType(subtype));
    }
    if (subtypeExact) counts.subtypeExact++;
    if (subtypeCategory && subtypeCategory !== expectedCategory)
      counts.subtypeKnownOther++;
    if (top === "urn:entity" && subtypeExact) counts.genericWithExactSubtype++;
    if (categories.size > 1) {
      counts.conflictingPrimary++;
      add(reasons, "conflicting-recognized-primary");
    }
    const exactKnownOther = [top, subtype, ...(arrayValid ? array : [])].some(
      (value) =>
        value !== expectedType &&
        knownPrimaryCategories.some(
          (category) => value === `urn:entity:${category}`,
        ),
    );
    if (!topExact && !subtypeExact && !arrayExact && !exactKnownOther)
      counts.missingOrUnverifiable++;
    const exactKnownCategory = [
      top,
      subtype,
      ...(arrayValid ? array : []),
    ].some((value) =>
      knownPrimaryCategories.some(
        (category) => value === `urn:entity:${category}`,
      ),
    );
    if (!exactKnownCategory) counts.noIndependentCategory++;
    if (topExact) continue;
    if (!topPresent) add(reasons, "missing-top-level-type");
    else if (!validTypeString(top)) add(reasons, "invalid-top-level-type");
    else if (top === "urn:entity") add(reasons, "generic-top-level-type");
    else if (topCategory && topCategory !== expectedCategory)
      add(reasons, "recognized-wrong-primary");
    else if (topCategory === expectedCategory)
      add(reasons, "same-domain-nonexact-top-level-type");
    else add(reasons, "unrecognized-top-level-type");
    if (arrayExact) add(reasons, "exact-category-in-array-only");
  }
  const classification = classifyInsightsPage(entities, expectedType);
  counts.classifiedAccepted = classification.acceptedCount;
  counts.classifiedRejected = classification.rejectedCount;
  for (const [reason, count] of Object.entries(classification.reasons))
    candidateReasons.set(reason, count);
  const categoriesText = (map) =>
    knownPrimaryCategories
      .filter((category) => map.has(category))
      .map((category) => `${category}=${map.get(category)}`)
      .join(", ") || "none";
  const reasonsText =
    [...reasons.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([reason, count]) => `${reason}=${count}`)
      .join(", ") || "none";
  return {
    counts,
    topCategories: categoriesText(topCategories),
    topKinds:
      [...topKinds.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([kind, count]) => `${kind}=${count}`)
        .join(", ") || "none",
    arrayCategories: categoriesText(arrayCategories),
    subtypeCategories: categoriesText(subtypeCategories),
    subtypeKinds:
      [...subtypeKinds.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([kind, count]) => `${kind}=${count}`)
        .join(", ") || "none",
    reasons: reasonsText,
    candidateReasons:
      [...candidateReasons.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([reason, count]) => `${reason}=${count}`)
        .join(", ") || "none",
  };
}

async function call(path, params, kind) {
  const { body, status } = await boundedCall(path, params);
  if (body?.success === false)
    throw new SmokeError(`${path} reported an unsuccessful response`);
  if (body && typeof body === "object" && "error" in body)
    throw new SmokeError(`${path} reported an error`);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    (body.success !== undefined && typeof body.success !== "boolean")
  )
    throw new SmokeError(`${path} returned a malformed response`);
  const entities = kind === "search" ? body.results : body.results?.entities;
  if (!Array.isArray(entities))
    throw new SmokeError(`${path} returned an unexpected result structure`);
  if (entities.length > Number(params.take))
    throw new SmokeError(`${path} returned more entities than requested`);
  if (kind === "search") {
    const validated = validateSearchResults(
      entities,
      params.types,
      Number(params.take),
    );
    if (validated.fatal)
      throw new SmokeError(
        `${path} returned invalid or ambiguous entities; rejection categories: ${Object.keys(validated.reasons).sort().join(", ")}`,
      );
    console.log(
      `${path}: HTTP ${status}; valid response structure; ${validated.entities.length} entities; rejected=${validated.rejected}`,
    );
    return validated.entities;
  }
  console.log(
    `${path}: HTTP ${status}; valid response envelope; ${entities.length} entities`,
  );
  return entities;
}

try {
  if (mode === "--search-shape-once") {
    const { body, status } = await boundedCall("/search", {
      query: "Miles Davis",
      types: "urn:entity:artist",
      take: "3",
    });
    console.log(`/search: HTTP ${status}; root fields: ${fieldTypes(body)}`);
    const results = body?.results;
    console.log(`results type: ${valueType(results)}`);
    if (Array.isArray(results)) {
      console.log(`result count: ${results.length}`);
      if (results.length)
        console.log(`first result fields: ${fieldTypes(results[0])}`);
    }
    const rootValid =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      body.success !== false &&
      (body.success === undefined || typeof body.success === "boolean") &&
      !("error" in body);
    const pageValid =
      Array.isArray(results) && results.length > 0 && results.length <= 3;
    const fieldsValid =
      pageValid &&
      results.every(
        (item) =>
          typeof item?.entity_id === "string" &&
          item.entity_id.trim() &&
          typeof item?.name === "string" &&
          item.name.trim(),
      );
    const shape = searchTypeShape(Array.isArray(results) ? results : []);
    const validated = validateSearchResults(results, "urn:entity:artist", 3);
    const acceptedCount = rootValid ? validated.entities.length : 0;
    const rejectedCount = Array.isArray(results)
      ? results.length - acceptedCount
      : 0;
    const reasons = rootValid
      ? validated.reasons
      : { "invalid-root": rejectedCount };
    const typesArrayPresent =
      pageValid && results.every((item) => Array.isArray(item?.types));
    const urnStringHypothesis =
      typesArrayPresent &&
      shape.entries > 0 &&
      shape.urnStringEntries === shape.entries &&
      results.every((item) => item.types.length > 0);
    const nonemptyStringsValid =
      typesArrayPresent &&
      shape.entries > 0 &&
      shape.nonemptyStringEntries === shape.entries &&
      results.every((item) => item.types.length > 0);
    console.log(
      `root/page/identity/types-array: ${Boolean(rootValid)}/${Boolean(pageValid)}/${Boolean(fieldsValid)}/${Boolean(typesArrayPresent)}`,
    );
    console.log(
      `types element kinds: ${shape.kinds.map(([kind, count]) => `${kind}=${count}`).join(", ") || "none"}; entries=${shape.entries}; URN-string structural hypothesis valid=${Boolean(urnStringHypothesis)}`,
    );
    console.log(
      `types elements valid nonempty strings: ${Boolean(nonemptyStringsValid)}; valid=${shape.nonemptyStringEntries}; invalid=${shape.entries - shape.nonemptyStringEntries}`,
    );
    console.log(
      `requested-category exact string membership: entities=${shape.artistMembershipEntities}; policy=explicit-category`,
    );
    if (shape.firstObjectFields !== undefined)
      console.log(`first types object fields: ${shape.firstObjectFields}`);
    console.log(
      `Search validation: accepted=${acceptedCount}; rejected=${rejectedCount}; rejection reasons: ${
        Object.entries(reasons)
          .map(([reason, count]) => `${reason}=${count}`)
          .join(", ") || "none"
      }`,
    );
    console.log("Metadata only; no entity values or Insights request shown.");
    if (!rootValid || !pageValid || validated.fatal || !acceptedCount)
      throw new SmokeError(
        "/search item validation failed or returned no accepted entities",
      );
    console.log(`Attempted Qloo requests: ${attempts}`);
    process.exit(0);
  }
  const matches = await call(
    "/search",
    {
      query: "Miles Davis",
      types: "urn:entity:artist",
      take: "3",
    },
    "search",
  );
  console.log("Authentication: accepted for Search.");
  if (matches.length === 0)
    throw new SmokeError(
      "Search returned no matching entities; Insights not attempted",
    );
  const exact = [
    ...new Map(
      matches
        .filter(
          (item) => item.name.trim().toLocaleLowerCase() === "miles davis",
        )
        .map((item) => [item.entity_id, item]),
    ).values(),
  ];
  if (exact.length !== 1)
    throw new SmokeError(
      "Search did not resolve one exact artist match; Insights not attempted",
    );
  const seed = exact[0];
  for (const type of mode === "--movie-insights-once"
    ? ["movie"]
    : ["movie", "book"]) {
    const entities = await call(
      "/v2/insights",
      {
        "filter.type": `urn:entity:${type}`,
        "signal.interests.entities": seed.entity_id,
        "feature.explainability": "true",
        take: "5",
        page: "1",
      },
      "insights",
    );
    const expectedType = `urn:entity:${type}`;
    const diagnostic = insightsTypeDiagnostic(entities, expectedType);
    const supportedShape =
      diagnostic.counts.classifiedAccepted === entities.length;
    const accepted = supportedShape;
    if (mode === "--movie-insights-once" || type === "book" || !accepted) {
      const counts = diagnostic.counts;
      console.log(
        `${type} Insights type diagnostic: total=${counts.total}; valid-identities=${counts.validIdentities}; top-level-present=${counts.topLevelPresent}; top-level-kinds=${diagnostic.topKinds}; top-level-exact=${counts.topLevelExact}; top-level-different=${counts.topLevelDifferent}; types-arrays=${counts.typesArrays}; valid-nonempty-string-arrays=${counts.validTypesArrays}; types-exact=${counts.typesExact}; conflicting-recognized-primary=${counts.conflictingPrimary}; missing-or-unverifiable-category-evidence=${counts.missingOrUnverifiable}`,
      );
      console.log(
        `${type} Insights known primary categories: top-level ${diagnostic.topCategories}; types-array ${diagnostic.arrayCategories}`,
      );
      console.log(
        `${type} Insights legacy top-level rejection categories: ${diagnostic.reasons}`,
      );
      console.log(
        `${type} Insights subtype diagnostic: present=${counts.subtypePresent}; kinds=${diagnostic.subtypeKinds}; exact-category=${counts.subtypeExact}; known-other-domain=${counts.subtypeKnownOther}; generic-top-with-exact-subtype=${counts.genericWithExactSubtype}; no-independent-category=${counts.noIndependentCategory}; accepted=${counts.classifiedAccepted}; rejected=${counts.classifiedRejected}; subtype-known-categories=${diagnostic.subtypeCategories}`,
      );
      console.log(
        `${type} Insights rejection categories: ${diagnostic.candidateReasons}`,
      );
    }
    if (entities.length === 0)
      throw new SmokeError(
        `${type} Insights returned 200 OK but no recommendations`,
      );
    if (!accepted)
      throw new SmokeError(
        `${type} Insights returned an unexpected entity type`,
      );
    const explained = entities.filter(
      (item) => item.query?.explainability,
    ).length;
    console.log(
      `${type} cross-domain recommendations: nonempty; per-result explainability objects: ${explained}/${entities.length}`,
    );
  }
  if (mode === "--movie-insights-once") {
    console.log(
      "Movie Insights documented-shape check passed; Book Insights was not requested.",
    );
    console.log(`Attempted Qloo requests: ${attempts}`);
    process.exit(0);
  }
  console.log(
    "Live Qloo smoke check passed: authentication, structure, nonempty results, and two cross-domain recommendation sets. Film runtime and public screening rights remain unverified.",
  );
  console.log(`Attempted Qloo requests: ${attempts}`);
} catch (error) {
  console.error(
    `Live Qloo smoke check failed: ${error instanceof SmokeError ? error.message : "network or unexpected error"}`,
  );
  console.error(`Attempted Qloo requests: ${attempts}`);
  process.exitCode = 1;
}
