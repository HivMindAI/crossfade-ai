// Shared production/smoke Insights policy. Search retains its separate parser.
export const knownPrimaryCategories = [
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
];
const supportedTypes = new Set([
  "urn:entity:artist",
  "urn:entity:book",
  "urn:entity:movie",
]);
const verifiedGenericSubtypeTypes = new Set([
  "urn:entity:book",
  "urn:entity:movie",
]);

export function recognizedPrimary(value) {
  if (typeof value !== "string") return undefined;
  const category = /^urn:entity:([^:]+)(?::|$)/i.exec(value)?.[1].toLowerCase();
  return knownPrimaryCategories.includes(category) ? category : undefined;
}

export function validTypeString(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value === value.trim() &&
    !/\p{Cc}/u.test(value)
  );
}

export function validInsightsIdentity(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !/\p{Cc}/u.test(value)
  );
}

export function classifyInsightsEntity(item, expectedType) {
  if (!supportedTypes.has(expectedType))
    return { accepted: false, reason: "unsupported-expected-category" };
  if (
    !item ||
    typeof item !== "object" ||
    Array.isArray(item) ||
    !validInsightsIdentity(item.entity_id) ||
    !validInsightsIdentity(item.name)
  )
    return { accepted: false, reason: "invalid-identity" };
  const expectedCategory = expectedType.slice("urn:entity:".length);
  const top = item.type;
  const hasSubtype = Object.hasOwn(item, "subtype");
  const subtype = item.subtype;
  const hasTypes = Object.hasOwn(item, "types");
  const types = item.types;
  const known = new Set([recognizedPrimary(top), recognizedPrimary(subtype)]);
  if (Array.isArray(types))
    for (const value of types) known.add(recognizedPrimary(value));
  known.delete(undefined);
  if (known.size > 1)
    return { accepted: false, reason: "conflicting-primary-domains" };
  if (!validTypeString(top))
    return { accepted: false, reason: "invalid-top-level-type" };
  if (top !== expectedType && top !== "urn:entity")
    return { accepted: false, reason: "unexpected-top-level-type" };
  if (hasSubtype && !validTypeString(subtype))
    return { accepted: false, reason: "invalid-subtype" };
  // Owner-observed Movie and Book Insights use this exact pairing.
  // Generic Artist subtype evidence remains unverified.
  if (top === "urn:entity" && !verifiedGenericSubtypeTypes.has(expectedType))
    return { accepted: false, reason: "unverified-generic-subtype-domain" };
  if (top === "urn:entity" && subtype !== expectedType)
    return { accepted: false, reason: "missing-or-wrong-subtype" };
  if (
    top === expectedType &&
    hasSubtype &&
    recognizedPrimary(subtype) !== expectedCategory
  )
    return { accepted: false, reason: "unexpected-subtype" };
  if (
    hasTypes &&
    (!Array.isArray(types) ||
      types.length === 0 ||
      !types.every(validTypeString))
  )
    return { accepted: false, reason: "invalid-types-array" };
  if (hasTypes && !types.includes(expectedType))
    return { accepted: false, reason: "array-category-unverified" };
  return { accepted: true, reason: "accepted" };
}

export function classifyInsightsPage(items, expectedType) {
  const reasons = new Map();
  const seenIds = new Set();
  let acceptedCount = 0;
  for (const item of items) {
    const result = classifyInsightsEntity(item, expectedType);
    let reason = result.reason;
    if (result.accepted) {
      if (seenIds.has(item.entity_id.trim())) reason = "duplicate-entity-id";
      else {
        seenIds.add(item.entity_id.trim());
        acceptedCount++;
      }
    }
    if (reason !== "accepted")
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  return {
    accepted: reasons.size === 0,
    acceptedCount,
    rejectedCount: items.length - acceptedCount,
    reasons: Object.fromEntries(reasons),
  };
}
