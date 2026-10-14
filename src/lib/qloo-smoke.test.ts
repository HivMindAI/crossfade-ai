import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyInsightsEntity } from "../../scripts/qloo-insights-classify.mjs";

const script = fileURLToPath(
  new URL("../../scripts/qloo-smoke.mjs", import.meta.url),
);
const mockImport = (source: string) =>
  `data:text/javascript,${encodeURIComponent(source)}`;
const offlineEnv = {
  ...process.env,
  QLOO_API_KEY: "offline-test-key",
  QLOO_API_ORIGIN: "https://hackathon.api.qloo.com",
};

function runMovieInsightsFixture(
  rows: unknown[],
  mode = "--live-once",
  bookRows: unknown[] = [
    {
      entity_id: "private-book",
      name: "Private Book",
      type: "urn:entity:book",
    },
  ],
) {
  const importer = `let calls = 0; globalThis.fetch = async (input, options) => {
    calls++;
    const url = new URL(input);
    if (url.origin !== 'https://hackathon.api.qloo.com' || options.redirect !== 'manual' || options.headers['X-Api-Key'] !== 'offline-test-key') throw new Error('Unexpected transport');
    if (calls === 1 && url.pathname === '/search' && url.searchParams.get('query') === 'Miles Davis' && url.searchParams.get('types') === 'urn:entity:artist' && url.searchParams.get('take') === '3') return Response.json({ results: [{ entity_id: 'private-seed', name: 'Miles Davis', types: ['urn:entity:artist'] }] });
    if (calls === 2 && url.pathname === '/v2/insights' && url.searchParams.get('filter.type') === 'urn:entity:movie' && url.searchParams.get('signal.interests.entities') === 'private-seed' && url.searchParams.get('feature.explainability') === 'true' && url.searchParams.get('take') === '5' && url.searchParams.get('page') === '1') return Response.json({ results: { entities: ${JSON.stringify(rows)} } });
    if (calls === 3 && url.pathname === '/v2/insights' && url.searchParams.get('filter.type') === 'urn:entity:book') return Response.json({ results: { entities: ${JSON.stringify(bookRows)} } });
    throw new Error('Unexpected request');
  };`;
  return spawnSync(
    process.execPath,
    ["--import", mockImport(importer), script, mode],
    { encoding: "utf8", env: offlineEnv },
  );
}

describe("bounded Qloo smoke script", () => {
  it("recognizes the documented generic top-level Movie entity with exact subtype in invented data", () => {
    expect(
      classifyInsightsEntity(
        {
          entity_id: "invented-id",
          name: "Invented title",
          type: "urn:entity",
          subtype: "urn:entity:movie",
        },
        "urn:entity:movie",
      ),
    ).toEqual({ accepted: true, reason: "accepted" });
  });

  it.each(["artist", "movie", "book"])(
    "accepts an exact top-level %s category in invented Insights data",
    (domain) => {
      const expected = `urn:entity:${domain}`;
      expect(
        classifyInsightsEntity(
          {
            entity_id: "invented-id",
            name: "Invented title",
            type: expected,
            subtype: expected,
          },
          expected,
        ),
      ).toEqual({ accepted: true, reason: "accepted" });
    },
  );

  it("keeps generic top-level Artist subtype acceptance closed pending evidence", () => {
    expect(
      classifyInsightsEntity(
        {
          entity_id: "invented-id",
          name: "Invented title",
          type: "urn:entity",
          subtype: "urn:entity:artist",
        },
        "urn:entity:artist",
      ),
    ).toEqual({
      accepted: false,
      reason: "unverified-generic-subtype-domain",
    });
  });

  it("accepts the owner-observed generic Book subtype under the shared policy", () => {
    expect(
      classifyInsightsEntity(
        {
          entity_id: "invented-book",
          name: "Invented Book",
          type: "urn:entity",
          subtype: "urn:entity:book",
        },
        "urn:entity:book",
      ),
    ).toEqual({ accepted: true, reason: "accepted" });
  });

  it.each([
    {
      name: "missing subtype",
      row: { type: "urn:entity" },
      reason: "missing-or-wrong-subtype",
    },
    {
      name: "incorrect subtype",
      row: { type: "urn:entity", subtype: "urn:entity:book" },
      reason: "missing-or-wrong-subtype",
    },
    {
      name: "wrong top-level domain",
      row: { type: "urn:entity:book", subtype: "urn:entity:movie" },
      reason: "conflicting-primary-domains",
    },
    {
      name: "conflicting subtype",
      row: { type: "urn:entity:movie", subtype: "urn:entity:book" },
      reason: "conflicting-primary-domains",
    },
    {
      name: "malformed subtype",
      row: { type: "urn:entity", subtype: { private: "hidden" } },
      reason: "invalid-subtype",
    },
    {
      name: "malformed types array",
      row: {
        type: "urn:entity",
        subtype: "urn:entity:movie",
        types: ["urn:entity:movie", null],
      },
      reason: "invalid-types-array",
    },
    {
      name: "conflicting array metadata",
      row: {
        type: "urn:entity",
        subtype: "urn:entity:movie",
        types: ["urn:entity:book"],
      },
      reason: "conflicting-primary-domains",
    },
    {
      name: "missing top-level type",
      row: { subtype: "urn:entity:movie" },
      reason: "invalid-top-level-type",
    },
  ])("rejects $name in invented Insights rows", ({ row, reason }) => {
    expect(
      classifyInsightsEntity(
        { entity_id: "invented-id", name: "Invented title", ...row },
        "urn:entity:movie",
      ),
    ).toEqual({ accepted: false, reason });
  });

  it("rejects malformed identities before category classification", () => {
    expect(
      classifyInsightsEntity(
        {
          entity_id: "",
          name: "Invented title",
          type: "urn:entity",
          subtype: "urn:entity:movie",
        },
        "urn:entity:movie",
      ),
    ).toEqual({ accepted: false, reason: "invalid-identity" });
  });

  it("accepts an exact top-level Movie category with a same-domain descriptive subtype", () => {
    expect(
      classifyInsightsEntity(
        {
          entity_id: "invented-id",
          name: "Invented title",
          type: "urn:entity:movie",
          subtype: "urn:entity:movie:documentary",
        },
        "urn:entity:movie",
      ),
    ).toEqual({ accepted: true, reason: "accepted" });
  });

  it("checks Movie subtype in two mocked requests and never reaches Book", () => {
    const result = runMovieInsightsFixture(
      Array.from({ length: 5 }, (_, index) => ({
        entity_id: `private-movie-${index}`,
        name: "Private Movie",
        type: "urn:entity",
        subtype: "urn:entity:movie",
      })),
      "--movie-insights-once",
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Movie Insights documented-shape check passed",
    );
    expect(result.stdout).toContain("Attempted Qloo requests: 2");
    expect(result.stdout).toContain(
      "present=5; kinds=string=5; exact-category=5",
    );
    expect(result.stdout).toContain("generic-top-with-exact-subtype=5");
    expect(result.stdout).toContain("accepted=5; rejected=0");
    expect(result.stdout + result.stderr).not.toMatch(
      /private-|Private Movie|offline-test-key|Unexpected request/,
    );
  });

  it("uses the shared Movie policy and reaches Book in the three-request smoke", () => {
    const result = runMovieInsightsFixture([
      {
        entity_id: "private-movie",
        name: "Private Movie",
        type: "urn:entity",
        subtype: "urn:entity:movie",
      },
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Attempted Qloo requests: 3");
    expect(result.stdout).toContain("book Insights subtype diagnostic:");
    expect(result.stdout + result.stderr).not.toMatch(
      /private-movie|Private Movie|offline-test-key|Unexpected request/,
    );
  });

  it("reports one wrong subtype among five with counts only and stops after Movie", () => {
    const result = runMovieInsightsFixture(
      Array.from({ length: 5 }, (_, index) => ({
        entity_id: `private-movie-${index}`,
        name: "Private Movie",
        type: "urn:entity",
        subtype: index === 4 ? "urn:entity:book" : "urn:entity:movie",
      })),
      "--movie-insights-once",
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "present=5; kinds=string=5; exact-category=4; known-other-domain=1",
    );
    expect(result.stdout).toContain("generic-top-with-exact-subtype=4");
    expect(result.stdout).toContain("accepted=4; rejected=1");
    expect(result.stdout).toContain("missing-or-wrong-subtype=1");
    expect(result.stderr).toContain("Attempted Qloo requests: 2");
    expect(result.stdout + result.stderr).not.toMatch(
      /private-|Private Movie|offline-test-key|Unexpected request/,
    );
  });

  it("reports absent or malformed subtype evidence without values", () => {
    const result = runMovieInsightsFixture(
      [
        { entity_id: "private-one", name: "Private Movie", type: "urn:entity" },
        {
          entity_id: "private-two",
          name: "Private Movie",
          type: "urn:entity",
          subtype: { private: "hidden" },
        },
      ],
      "--movie-insights-once",
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "present=1; kinds=object=1; exact-category=0",
    );
    expect(result.stdout).toContain("no-independent-category=2");
    expect(result.stdout).toContain("accepted=0; rejected=2");
    expect(result.stderr).toContain("Attempted Qloo requests: 2");
    expect(result.stdout + result.stderr).not.toMatch(
      /private-|Private Movie|hidden|offline-test-key|Unexpected request/,
    );
  });
  it.each([
    {
      name: "an oversized Search page",
      body: {
        results: Array.from({ length: 4 }, (_, index) => ({
          entity_id: `mock-${index}`,
          name: "Miles Davis",
          types: ["urn:entity:artist"],
        })),
      },
      message: "more entities than requested",
    },
    {
      name: "a non-exact Search match",
      body: {
        results: [
          {
            entity_id: "mock-1",
            name: "Wrong Artist",
            types: ["urn:entity:artist"],
          },
        ],
      },
      message: "one exact artist match",
    },
    {
      name: "an explicit unsuccessful Search response",
      body: { success: false, results: [] },
      message: "reported an unsuccessful response",
    },
    {
      name: "an explicit Search error field",
      body: { error: "invented upstream detail", results: [] },
      message: "reported an error",
    },
    {
      name: "a missing Search ID",
      body: {
        results: [{ name: "Miles Davis", types: ["urn:entity:artist"] }],
      },
      message: "invalid or ambiguous entities",
    },
    {
      name: "an untyped Search result",
      body: { results: [{ entity_id: "mock-1", name: "Miles Davis" }] },
      message: "invalid or ambiguous entities",
    },
    {
      name: "conflicting primary Search categories",
      body: {
        results: [
          {
            entity_id: "mock-1",
            name: "Miles Davis",
            types: ["urn:entity:artist", "urn:entity:movie"],
          },
        ],
      },
      message: "conflicting-primary-domain",
    },
    {
      name: "a wrong-type Search result",
      body: {
        results: [
          {
            entity_id: "mock-1",
            name: "Miles Davis",
            types: ["urn:entity:book"],
          },
        ],
      },
      message: "no matching entities",
    },
    {
      name: "conflicting duplicate Search IDs",
      body: {
        results: [
          {
            entity_id: "mock-1",
            name: "Miles Davis",
            types: ["urn:entity:artist"],
          },
          { entity_id: "mock-1", name: "Other", types: ["urn:entity:artist"] },
        ],
      },
      message: "duplicate-id-conflict",
    },
    {
      name: "the old nested Search envelope",
      body: { results: { entities: [] } },
      message: "unexpected result structure",
    },
  ])(
    "stops before Insights for $name using a synthetic transport only",
    ({ body, message }) => {
      const importer = `globalThis.fetch = async (input) => { if (new URL(input).pathname !== '/search') throw new Error('Unexpected Insights dispatch'); return Response.json(${JSON.stringify(body)}); };`;
      const result = spawnSync(
        process.execPath,
        ["--import", mockImport(importer), script, "--live-once"],
        { encoding: "utf8", env: offlineEnv },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
      expect(result.stderr).not.toContain("offline-test-key");
      expect(result.stderr).not.toContain("Unexpected Insights dispatch");
    },
  );

  it("uses one Search array then two separate Insights envelopes, with no raw output", () => {
    const importer = `let calls = 0; globalThis.fetch = async (input) => {
      calls++;
      const path = new URL(input).pathname;
      if (calls === 1 && path === '/search' && new URL(input).searchParams.get('types') === 'urn:entity:artist') return Response.json({ results: [{ entity_id: 'invented-seed', name: 'Miles Davis', types: ['urn:entity:artist'] }] });
      if (calls === 2 && path === '/v2/insights') return Response.json({ results: { entities: [{ entity_id: 'invented-movie', name: 'Private Movie', type: 'urn:entity:movie' }] } });
      if (calls === 3 && path === '/v2/insights') return Response.json({ results: { entities: [{ entity_id: 'invented-book', name: 'Private Book', type: 'urn:entity:book' }] } });
      throw new Error('Unexpected fourth request');
    };`;
    const result = spawnSync(
      process.execPath,
      ["--import", mockImport(importer), script, "--live-once"],
      { encoding: "utf8", env: offlineEnv },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Live Qloo smoke check passed");
    expect(result.stdout).toContain("/search: HTTP 200");
    expect(result.stdout).toContain("Attempted Qloo requests: 3");
    expect(result.stdout).not.toMatch(
      /invented-|Private Movie|Private Book|offline-test-key/,
    );
  });

  it("accepts the exact Movie top-level type and reaches Book with at most three mocked calls", () => {
    const result = runMovieInsightsFixture([
      {
        entity_id: "private-movie",
        name: "Private Movie",
        type: "urn:entity:movie",
        types: ["urn:entity", "urn:entity:movie"],
      },
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Attempted Qloo requests: 3");
    expect(result.stdout).toContain("book Insights type diagnostic:");
    expect(result.stdout + result.stderr).not.toMatch(
      /private-movie|Private Movie|private-seed|private-book|offline-test-key/,
    );
  });

  it("accepts five generic Book subtype rows in the three-request smoke with aggregate-only output", () => {
    const result = runMovieInsightsFixture(
      [
        {
          entity_id: "private-movie",
          name: "Private Movie",
          type: "urn:entity",
          subtype: "urn:entity:movie",
        },
      ],
      "--live-once",
      Array.from({ length: 5 }, (_, index) => ({
        entity_id: `private-book-${index}`,
        name: `Private Book ${index}`,
        type: "urn:entity",
        subtype: "urn:entity:book",
      })),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("book Insights type diagnostic: total=5");
    expect(result.stdout).toContain("top-level-kinds=string=5");
    expect(result.stdout).toContain(
      "book Insights subtype diagnostic: present=5; kinds=string=5; exact-category=5",
    );
    expect(result.stdout).toContain("accepted=5; rejected=0");
    expect(result.stdout).toContain("Attempted Qloo requests: 3");
    expect(result.stdout).toContain("Live Qloo smoke check passed");
    expect(result.stdout + result.stderr).not.toMatch(
      /private-|Private Movie|Private Book|offline-test-key|Unexpected request/,
    );
  });

  it("rejects a contradictory Book subtype without leaking values or exceeding three calls", () => {
    const result = runMovieInsightsFixture(
      [
        {
          entity_id: "private-movie",
          name: "Private Movie",
          type: "urn:entity",
          subtype: "urn:entity:movie",
        },
      ],
      "--live-once",
      [
        {
          entity_id: "private-book",
          name: "Private Book",
          type: "urn:entity",
          subtype: "urn:entity:book",
          types: ["urn:entity:movie"],
        },
      ],
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("conflicting-primary-domains=1");
    expect(result.stdout).toContain("accepted=0; rejected=1");
    expect(result.stderr).toContain("Attempted Qloo requests: 3");
    expect(result.stdout + result.stderr).not.toMatch(
      /private-|Private Movie|Private Book|offline-test-key|Unexpected request/,
    );
  });

  it("reports malformed Book identity through fixed rejection categories", () => {
    const result = runMovieInsightsFixture(
      [
        {
          entity_id: "private-movie",
          name: "Private Movie",
          type: "urn:entity",
          subtype: "urn:entity:movie",
        },
      ],
      "--live-once",
      [{ name: "Private Book", type: "urn:entity:book" }],
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("book Insights type diagnostic: total=1");
    expect(result.stdout).toContain("accepted=0; rejected=1");
    expect(result.stdout).toContain("invalid-identity=1");
    expect(result.stderr).toContain("Attempted Qloo requests: 3");
    expect(result.stdout + result.stderr).not.toMatch(
      /private-|Private Book|offline-test-key|Unexpected request/,
    );
  });

  it("rejects a duplicate Movie ID before spending the third request", () => {
    const row = {
      entity_id: "private-duplicate",
      name: "Private Movie",
      type: "urn:entity",
      subtype: "urn:entity:movie",
    };
    const result = runMovieInsightsFixture([row, row]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("accepted=1; rejected=1");
    expect(result.stdout).toContain("duplicate-entity-id=1");
    expect(result.stderr).toContain("Attempted Qloo requests: 2");
    expect(result.stdout + result.stderr).not.toMatch(
      /private-|Private Movie|offline-test-key|Unexpected request/,
    );
  });

  it.each([
    {
      name: "Movie evidence only in a types array",
      rows: [
        {
          entity_id: "private-movie",
          name: "Private Movie",
          types: ["urn:entity:movie"],
        },
      ],
      counts:
        "total=1; valid-identities=1; top-level-present=0; top-level-kinds=none; top-level-exact=0; top-level-different=0; types-arrays=1; valid-nonempty-string-arrays=1; types-exact=1; conflicting-recognized-primary=0; missing-or-unverifiable-category-evidence=0",
      reason: "exact-category-in-array-only=1, missing-top-level-type=1",
    },
    {
      name: "missing type evidence",
      rows: [{ entity_id: "private-movie", name: "Private Movie" }],
      counts:
        "total=1; valid-identities=1; top-level-present=0; top-level-kinds=none; top-level-exact=0; top-level-different=0; types-arrays=0; valid-nonempty-string-arrays=0; types-exact=0; conflicting-recognized-primary=0; missing-or-unverifiable-category-evidence=1",
      reason: "missing-top-level-type=1",
    },
    {
      name: "a recognized wrong-domain top-level type",
      rows: [
        {
          entity_id: "private-movie",
          name: "Private Movie",
          type: "urn:entity:book",
        },
      ],
      counts:
        "total=1; valid-identities=1; top-level-present=1; top-level-kinds=string=1; top-level-exact=0; top-level-different=1; types-arrays=0; valid-nonempty-string-arrays=0; types-exact=0; conflicting-recognized-primary=0; missing-or-unverifiable-category-evidence=0",
      reason: "recognized-wrong-primary=1",
      known: "top-level book=1; types-array none",
    },
    {
      name: "contradictory top-level and array domains",
      rows: [
        {
          entity_id: "private-movie",
          name: "Private Movie",
          type: "urn:entity:movie",
          types: ["urn:entity:book"],
        },
      ],
      counts:
        "total=1; valid-identities=1; top-level-present=1; top-level-kinds=string=1; top-level-exact=1; top-level-different=0; types-arrays=1; valid-nonempty-string-arrays=1; types-exact=0; conflicting-recognized-primary=1; missing-or-unverifiable-category-evidence=0",
      reason: "conflicting-recognized-primary=1",
      known: "top-level movie=1; types-array book=1",
    },
    {
      name: "malformed array entries with no valid category evidence",
      rows: [
        {
          entity_id: "private-movie",
          name: "Private Movie",
          type: "urn:entity",
          types: ["urn:entity:movie", null],
        },
      ],
      counts:
        "total=1; valid-identities=1; top-level-present=1; top-level-kinds=string=1; top-level-exact=0; top-level-different=1; types-arrays=1; valid-nonempty-string-arrays=0; types-exact=0; conflicting-recognized-primary=0; missing-or-unverifiable-category-evidence=1",
      reason: "generic-top-level-type=1",
      known: "top-level none; types-array movie=1",
    },
    {
      name: "one invalid type among five results",
      rows: [
        ...Array.from({ length: 4 }, (_, index) => ({
          entity_id: `private-${index}`,
          name: "Private Movie",
          type: "urn:entity:movie",
          types: ["urn:entity:movie"],
        })),
        {
          entity_id: "private-fifth",
          name: "Private Movie",
          type: "urn:entity",
          types: ["urn:entity:movie"],
        },
      ],
      counts:
        "total=5; valid-identities=5; top-level-present=5; top-level-kinds=string=5; top-level-exact=4; top-level-different=1; types-arrays=5; valid-nonempty-string-arrays=5; types-exact=5; conflicting-recognized-primary=0; missing-or-unverifiable-category-evidence=0",
      reason: "exact-category-in-array-only=1, generic-top-level-type=1",
    },
    {
      name: "unrecognized private type value",
      rows: [
        {
          entity_id: "private-movie",
          name: "Private Movie",
          type: "secret-provider-type",
          types: ["urn:entity:movie"],
        },
      ],
      counts:
        "total=1; valid-identities=1; top-level-present=1; top-level-kinds=string=1; top-level-exact=0; top-level-different=1; types-arrays=1; valid-nonempty-string-arrays=1; types-exact=1; conflicting-recognized-primary=0; missing-or-unverifiable-category-evidence=0",
      reason: "exact-category-in-array-only=1, unrecognized-top-level-type=1",
    },
  ])(
    "reports redacted $name and stops before Book",
    ({ rows, counts, reason, known }) => {
      const result = runMovieInsightsFixture(rows);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        `movie Insights type diagnostic: ${counts}`,
      );
      expect(result.stdout).toContain(
        `movie Insights legacy top-level rejection categories: ${reason}`,
      );
      if (known)
        expect(result.stdout).toContain(
          `movie Insights known primary categories: ${known}`,
        );
      expect(result.stderr).toContain(
        "movie Insights returned an unexpected entity type",
      );
      expect(result.stderr).toContain("Attempted Qloo requests: 2");
      expect(result.stdout + result.stderr).not.toMatch(
        /private-|Private Movie|Private Book|secret-provider-type|offline-test-key|Unexpected request/,
      );
    },
  );

  it("reports only field names and types in a single Search shape request", () => {
    const importer = `let calls = 0; globalThis.fetch = async (input) => {
      calls++;
      const url = new URL(input);
      if (calls !== 1 || url.pathname !== '/search' || url.searchParams.get('types') !== 'urn:entity:artist') throw new Error('Unexpected request');
      return Response.json({ results: [{ entity_id: 'private-id', name: 'Sensitive Name', types: ['urn:entity:artist'], nested: { private: 'hidden-payload' } }] });
    };`;
    const result = spawnSync(
      process.execPath,
      ["--import", mockImport(importer), script, "--search-shape-once"],
      { encoding: "utf8", env: offlineEnv },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("entity_id:string");
    expect(result.stdout).toContain("name:string");
    expect(result.stdout).toContain("types:array");
    expect(result.stdout).toContain(
      "root/page/identity/types-array: true/true/true/true",
    );
    expect(result.stdout).toContain("types element kinds: string=1");
    expect(result.stdout).toContain(
      "types elements valid nonempty strings: true; valid=1; invalid=0",
    );
    expect(result.stdout).toContain(
      "requested-category exact string membership: entities=1; policy=explicit-category",
    );
    expect(result.stdout).toContain(
      "Search validation: accepted=1; rejected=0; rejection reasons: none",
    );
    expect(result.stdout + result.stderr).toContain(
      "Attempted Qloo requests: 1",
    );
    expect(result.stdout).not.toMatch(
      /private-id|Sensitive Name|hidden-payload|offline-test-key/,
    );
  });

  it.each([
    {
      name: "exact artist membership once per entity",
      arrays: [
        ["urn:entity:artist", "urn:entity:artist"],
        ["urn:entity:book", "urn:entity:artist"],
        ["urn:entity:movie"],
      ],
      strings: "true; valid=5; invalid=0",
      artistCount: 2,
    },
    {
      name: "no inferred membership from similar strings",
      arrays: [
        [" urn:entity:artist "],
        ["urn:entity:artist:extra"],
        ["URN:ENTITY:ARTIST"],
      ],
      strings: "true; valid=3; invalid=0",
      artistCount: 0,
    },
    {
      name: "invalid strings and mixed element kinds",
      arrays: [
        ["urn:entity:artist", null, 0, "", "   ", { private: "hidden" }],
      ],
      strings: "false; valid=1; invalid=5",
      artistCount: 1,
    },
    {
      name: "an empty array without vacuous validity",
      arrays: [[]],
      strings: "false; valid=0; invalid=0",
      artistCount: 0,
    },
    {
      name: "a missing array without vacuous validity",
      arrays: [undefined],
      strings: "false; valid=0; invalid=0",
      artistCount: 0,
    },
  ])(
    "reports $name without values or extra requests",
    ({ arrays, strings, artistCount }) => {
      const rows = arrays.map((types, index) => ({
        entity_id: `private-id-${index}`,
        name: "Sensitive Name",
        types,
      }));
      const importer = `let calls = 0; globalThis.fetch = async (input) => { if (++calls !== 1 || new URL(input).pathname !== '/search') throw new Error('Unexpected extra request'); return Response.json({ results: ${JSON.stringify(rows)} }); };`;
      const result = spawnSync(
        process.execPath,
        ["--import", mockImport(importer), script, "--search-shape-once"],
        { encoding: "utf8", env: offlineEnv },
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        `types elements valid nonempty strings: ${strings}`,
      );
      expect(result.stdout).toContain(
        `requested-category exact string membership: entities=${artistCount}; policy=explicit-category`,
      );
      expect(result.stdout).toContain(`accepted=0; rejected=${rows.length}`);
      expect(result.stdout).toContain("rejection reasons:");
      expect(result.stdout + result.stderr).toContain(
        "Attempted Qloo requests: 1",
      );
      expect(result.stdout + result.stderr).not.toMatch(
        /private-id-|Sensitive Name|hidden|urn:entity|URN:ENTITY|offline-test-key|Unexpected extra request/,
      );
    },
  );

  it.each([
    {
      name: "three structurally plausible artist rows",
      rows: ["a", "b", "c"].map((id) => ({
        entity_id: id,
        name: "Private Name",
        types: ["urn:entity:artist"],
      })),
      accepted: 3,
      reason: "none",
      kinds: "string=3",
    },
    {
      name: "missing types array",
      rows: [{ entity_id: "a", name: "Private Name" }],
      reason: "missing-types-array=1",
      kinds: "none",
    },
    {
      name: "empty types array",
      rows: [{ entity_id: "a", name: "Private Name", types: [] }],
      reason: "empty-types-array=1",
      kinds: "none",
    },
    {
      name: "malformed array entries",
      rows: [{ entity_id: "a", name: "Private Name", types: [null, 3, {}] }],
      reason: "invalid-type-string=1",
      kinds: "null=1, number=1, object=1",
    },
    {
      name: "wrong domain without an inferred membership",
      rows: [
        { entity_id: "a", name: "Private Name", types: ["urn:entity:book"] },
      ],
      reason: "missing-category=1",
      kinds: "string=1",
    },
    {
      name: "ambiguous category array",
      rows: [
        {
          entity_id: "a",
          name: "Private Name",
          types: ["urn:entity:artist", "urn:entity:book"],
        },
      ],
      reason: "conflicting-primary-domain=1",
      kinds: "string=2",
    },
    {
      name: "conflicting type fields",
      rows: [
        {
          entity_id: "a",
          name: "Private Name",
          type: "urn:entity:book",
          types: ["urn:entity:artist"],
        },
      ],
      reason: "conflicting-type-field=1",
      kinds: "string=1",
    },
    {
      name: "duplicate IDs",
      rows: [
        { entity_id: "a", name: "Private Name", types: ["urn:entity:artist"] },
        { entity_id: "a", name: "Private Name", types: ["urn:entity:artist"] },
      ],
      accepted: 1,
      reason: "duplicate-id=1",
      kinds: "string=2",
    },
    {
      name: "empty result set",
      rows: [],
      reason: "none",
      kinds: "none",
    },
  ])(
    "redacts $name while reporting type structure",
    ({ rows, reason, kinds, accepted = 0 }) => {
      const importer = `let calls = 0; globalThis.fetch = async () => { if (++calls !== 1) throw new Error('Unexpected extra request'); return Response.json({ results: ${JSON.stringify(rows)} }); };`;
      const result = spawnSync(
        process.execPath,
        ["--import", mockImport(importer), script, "--search-shape-once"],
        { encoding: "utf8", env: offlineEnv },
      );
      expect(result.status).toBe(accepted ? 0 : 1);
      expect(result.stdout).toContain(`types element kinds: ${kinds}`);
      expect(result.stdout).toContain(
        `accepted=${accepted}; rejected=${rows.length - accepted}`,
      );
      expect(result.stdout).toContain(reason);
      expect(result.stdout + result.stderr).toContain(
        "Attempted Qloo requests: 1",
      );
      expect(result.stdout + result.stderr).not.toMatch(
        /Private Name|urn:entity|offline-test-key|entity_id=|"a"/,
      );
    },
  );

  it("constructs the owner-observed Search request without extra parameters or a body", () => {
    const importer = `let calls = 0; globalThis.fetch = async (input, init) => {
      if (++calls !== 1) throw new Error('Unexpected extra request');
      const url = new URL(input);
      console.log('MOCK_REQUEST:' + JSON.stringify({
        url: url.href,
        method: init.method ?? 'GET',
        explicitMethod: init.method ?? null,
        query: [...url.searchParams.entries()],
        headersValid: Object.keys(init.headers).sort().join(',') === 'Accept,X-Api-Key' && init.headers.Accept === 'application/json' && typeof init.headers['X-Api-Key'] === 'string',
        bodyPresent: init.body !== undefined,
        redirect: init.redirect,
        cache: init.cache,
        signalPresent: init.signal instanceof AbortSignal
      }));
      return Response.json({ results: [{ entity_id: 'private-id', name: 'Sensitive Name', types: ['urn:entity:artist'] }] });
    };`;
    const result = spawnSync(
      process.execPath,
      ["--import", mockImport(importer), script, "--search-shape-once"],
      { encoding: "utf8", env: offlineEnv },
    );
    expect(result.status).toBe(0);
    const captured = JSON.parse(
      result.stdout.match(/^MOCK_REQUEST:(.+)$/m)?.[1] ?? "null",
    );
    expect(captured).toEqual({
      url: "https://hackathon.api.qloo.com/search?query=Miles+Davis&types=urn%3Aentity%3Aartist&take=3",
      method: "GET",
      explicitMethod: null,
      query: [
        ["query", "Miles Davis"],
        ["types", "urn:entity:artist"],
        ["take", "3"],
      ],
      headersValid: true,
      bodyPresent: false,
      redirect: "manual",
      cache: "no-store",
      signalPresent: true,
    });
    const previous = new URL(
      "https://hackathon.api.qloo.com/search?query=Miles%20Davis&types=urn:entity:artist&take=3",
    );
    const current = new URL(captured.url);
    expect([current.origin, current.pathname]).toEqual([
      previous.origin,
      previous.pathname,
    ]);
    expect([...current.searchParams.entries()]).toEqual([
      ...previous.searchParams.entries(),
    ]);
    expect(result.stdout + result.stderr).toContain(
      "Attempted Qloo requests: 1",
    );
    expect(result.stdout + result.stderr).not.toMatch(
      /private-id|Sensitive Name|offline-test-key/,
    );
  });

  it("caps and redacts a 400 error body without retrying or validating Search results", () => {
    const importer = `let calls = 0; globalThis.fetch = async () => {
      if (++calls !== 1) throw new Error('Unexpected extra request');
      return Response.json({ error: { code: 'INVALID_QUERY', message: 'private-id Sensitive Name ' + 'secret'.repeat(2000) }, detail: 'private input' }, { status: 400 });
    };`;
    const result = spawnSync(
      process.execPath,
      ["--import", mockImport(importer), script, "--search-shape-once"],
      { encoding: "utf8", env: offlineEnv },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("/search returned HTTP 400");
    expect(result.stderr).toContain(
      "format=json; bytes=4096; capped=true; json=false",
    );
    expect(result.stdout + result.stderr).toContain(
      "Attempted Qloo requests: 1",
    );
    expect(result.stdout + result.stderr).not.toMatch(
      /private-id|Sensitive Name|private input|INVALID_QUERY|secret|offline-test-key|result count/,
    );
  });

  it("reports only allowlisted field names and types for a short 400 JSON error", () => {
    const importer = `globalThis.fetch = async () => Response.json({ error: { code: 'INVALID_QUERY', message: 'private-id Sensitive Name' }, detail: 'private input', 'private-id': 'Sensitive Name' }, { status: 400 });`;
    const result = spawnSync(
      process.execPath,
      ["--import", mockImport(importer), script, "--search-shape-once"],
      { encoding: "utf8", env: offlineEnv },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("format=json");
    expect(result.stderr).toContain("json=true");
    expect(result.stderr).toContain("fields=error:object, detail:string");
    expect(result.stderr).toContain("error-fields=code:string, message:string");
    expect(result.stdout + result.stderr).not.toMatch(
      /private-id|Sensitive Name|private input|INVALID_QUERY|offline-test-key/,
    );
  });

  it.each([
    {
      name: "explicit failure",
      body: {
        success: false,
        results: [
          {
            entity_id: "private-id",
            name: "Sensitive Name",
            type: "urn:entity:artist",
          },
        ],
      },
      flag: "false/true/true/false",
    },
    {
      name: "blank required field",
      body: {
        results: [
          { entity_id: " ", name: "Sensitive Name", type: "urn:entity:artist" },
        ],
      },
      flag: "true/true/false/false",
    },
    {
      name: "unverifiable type",
      body: {
        results: [
          {
            entity_id: "private-id",
            name: "Sensitive Name",
            type: "urn:entity",
          },
        ],
      },
      flag: "true/true/true/false",
    },
    {
      name: "unsupported bare URN type",
      body: {
        results: [
          { entity_id: "private-id", name: "Sensitive Name", type: "urn" },
        ],
      },
      flag: "true/true/true/false",
    },
    {
      name: "wrong domain type in artist Search",
      body: {
        results: [
          {
            entity_id: "private-id",
            name: "Sensitive Name",
            type: "urn:entity:movie",
          },
        ],
      },
      flag: "true/true/true/false",
    },
  ])(
    "reports $name only as redacted flags and stops after one request",
    ({ body, flag }) => {
      const importer = `let calls = 0; globalThis.fetch = async () => { if (++calls !== 1) throw new Error('Unexpected extra request'); return Response.json(${JSON.stringify(body)}); };`;
      const result = spawnSync(
        process.execPath,
        ["--import", mockImport(importer), script, "--search-shape-once"],
        { encoding: "utf8", env: offlineEnv },
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        `root/page/identity/types-array: ${flag}`,
      );
      expect(result.stdout + result.stderr).toContain(
        "Attempted Qloo requests: 1",
      );
      expect(result.stdout + result.stderr).not.toMatch(
        /private-id|Sensitive Name|offline-test-key/,
      );
    },
  );

  it.each([302, 429, 500])(
    "stops after one HTTP %i without retrying or exposing the body",
    (status) => {
      const importer = `let calls = 0; globalThis.fetch = async (_input, init) => { if (++calls !== 1 || init.redirect !== 'manual') throw new Error('Unexpected request'); return new Response('private-provider-payload', { status: ${status} }); };`;
      const result = spawnSync(
        process.execPath,
        ["--import", mockImport(importer), script, "--live-once"],
        { encoding: "utf8", env: offlineEnv },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`HTTP ${status}`);
      expect(result.stderr).toContain("Attempted Qloo requests: 1");
      expect(result.stdout + result.stderr).not.toMatch(
        /private-provider-payload|offline-test-key|Unexpected request/,
      );
    },
  );

  it("enforces the smoke response-size cap without exposing the body", () => {
    const importer = `let calls = 0; globalThis.fetch = async () => { if (++calls !== 1) throw new Error('Unexpected request'); return new Response('private-provider-payload', { headers: { 'content-length': '2000001' } }); };`;
    const result = spawnSync(
      process.execPath,
      ["--import", mockImport(importer), script, "--live-once"],
      { encoding: "utf8", env: offlineEnv },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("oversized response");
    expect(result.stderr).toContain("Attempted Qloo requests: 1");
    expect(result.stdout + result.stderr).not.toMatch(
      /private-provider-payload|offline-test-key/,
    );
  });

  it("does not accept a Search envelope as Movie Insights or advance to Book Insights", () => {
    const importer = `let calls = 0; globalThis.fetch = async (input) => { calls++; const path = new URL(input).pathname; if (calls === 1 && path === '/search') return Response.json({ results: [{ entity_id: 'private-seed', name: 'Miles Davis', types: ['urn:entity:artist'] }] }); if (calls === 2 && path === '/v2/insights') return Response.json({ results: [{ entity_id: 'private-movie', name: 'Private Name', types: ['urn:entity:movie'] }] }); throw new Error('Unexpected request'); };`;
    const result = spawnSync(
      process.execPath,
      ["--import", mockImport(importer), script, "--live-once"],
      { encoding: "utf8", env: offlineEnv },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unexpected result structure");
    expect(result.stderr).toContain("Attempted Qloo requests: 2");
    expect(result.stdout + result.stderr).not.toMatch(
      /private-seed|private-movie|Private Name|offline-test-key|Unexpected request/,
    );
  });

  it("sends no request without an explicit live mode", () => {
    const importer = `globalThis.fetch = async () => { throw new Error('Unexpected dispatch'); };`;
    const result = spawnSync(
      process.execPath,
      ["--import", mockImport(importer), script],
      { encoding: "utf8", env: offlineEnv },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Offline only");
    expect(result.stderr).toBe("");
  });

  it("rejects a production-host override before making a credential-bearing request", () => {
    const result = spawnSync(process.execPath, [script, "--live-once"], {
      encoding: "utf8",
      env: { ...offlineEnv, QLOO_API_ORIGIN: "https://api.qloo.com" },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("hackathon HTTPS host");
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("offline-test-key");
  });

  it("reports an authentication status and one attempt without provider details", () => {
    const importer = `globalThis.fetch = async () => new Response('private provider detail', { status: 403 });`;
    const result = spawnSync(
      process.execPath,
      ["--import", mockImport(importer), script, "--search-shape-once"],
      { encoding: "utf8", env: offlineEnv },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("HTTP 403");
    expect(result.stdout + result.stderr).toContain(
      "Attempted Qloo requests: 1",
    );
    expect(result.stdout + result.stderr).not.toMatch(
      /private provider detail|offline-test-key/,
    );
  });
});
