// Search-only policy supported by owner-observed artist responses. The full
// provider item schema is not documented; supplementary labels carry no score.
const primaryCategories = new Set([
  "artist",
  "book",
  "brand",
  "destination",
  "movie",
  "person",
  "place",
  "podcast",
  "tv_show",
  "videogame",
]);
const supportedTypes = new Set([
  "urn:entity:artist",
  "urn:entity:movie",
  "urn:entity:book",
]);

/** @param {unknown} value */
function nonblankString(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !/\p{Cc}/u.test(value)
  );
}

/**
 * @typedef {{ entity_id: string, name: string, types: string[] }} SearchEntity
 * @param {unknown} results
 * @param {string} expectedType
 * @param {number} take
 * @returns {{ entities: SearchEntity[], rejected: number, reasons: Record<string, number>, fatal: boolean }}
 */
export function validateSearchResults(results, expectedType, take) {
  /** @type {Record<string, number>} */
  const reasons = {};
  /** @type {SearchEntity[]} */
  const accepted = [];
  const seen = new Map();
  let fatal = false;
  /** @param {string} reason @param {boolean} [invalid] */
  const reject = (reason, invalid = true) => {
    reasons[reason] = (reasons[reason] ?? 0) + 1;
    fatal ||= invalid;
  };
  if (
    !Array.isArray(results) ||
    !supportedTypes.has(expectedType) ||
    !Number.isInteger(take) ||
    take < 1 ||
    take > 100
  )
    return {
      entities: [],
      rejected: Array.isArray(results) ? results.length : 0,
      reasons: { "invalid-page": 1 },
      fatal: true,
    };
  if (results.length > take)
    return {
      entities: [],
      rejected: results.length,
      reasons: { "oversized-page": results.length },
      fatal: true,
    };
  for (const item of results) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      !nonblankString(item.entity_id) ||
      item.entity_id !== item.entity_id.trim() ||
      !nonblankString(item.name)
    ) {
      reject("invalid-identity");
      continue;
    }
    if (!Object.hasOwn(item, "types")) {
      reject("missing-types-array");
      continue;
    }
    if (!Array.isArray(item.types)) {
      reject("non-array-types");
      continue;
    }
    if (!item.types.length) {
      reject("empty-types-array");
      continue;
    }
    if (
      !item.types.every((type) => nonblankString(type) && type === type.trim())
    ) {
      reject("invalid-type-string");
      continue;
    }
    const types = [...new Set(item.types)].sort();
    if (
      Object.hasOwn(item, "type") &&
      (!nonblankString(item.type) ||
        (item.type !== "urn:entity" && !types.includes(item.type)))
    ) {
      reject("conflicting-type-field");
      continue;
    }
    const name = item.name.trim();
    const signature = JSON.stringify([name, types]);
    const previous = seen.get(item.entity_id);
    if (previous !== undefined) {
      reject(
        previous === signature ? "duplicate-id" : "duplicate-id-conflict",
        previous !== signature,
      );
      continue;
    }
    seen.set(item.entity_id, signature);
    const primary = new Set(
      types.flatMap((type) => {
        // Case variants cannot hide a conflicting recognized primary type.
        // They still cannot supply the required exact category membership.
        const category = /^urn:entity:([^:]+)(?::|$)/.exec(
          type.toLowerCase(),
        )?.[1];
        return category && primaryCategories.has(category)
          ? [`urn:entity:${category}`]
          : [];
      }),
    );
    if (primary.size > 1) {
      reject("conflicting-primary-domain");
      continue;
    }
    if (!types.includes(expectedType)) {
      reject("missing-category", false);
      continue;
    }
    accepted.push({ entity_id: item.entity_id, name, types });
  }
  // A malformed/ambiguous page must never yield partial usable evidence.
  if (fatal && accepted.length)
    reasons["invalid-page-discard"] = accepted.length;
  const entities = fatal ? [] : accepted;
  return {
    entities,
    rejected: results.length - entities.length,
    reasons,
    fatal,
  };
}
