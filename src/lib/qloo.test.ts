import { describe, expect, it, vi } from "vitest";
import { type Domain } from "./model";
import { QlooClient } from "./qloo";

const envelope = (entities: unknown[] = []) =>
  Response.json({ success: true, results: { entities } });
const searchEnvelope = (entities: unknown[] = []) =>
  Response.json({ results: entities });
const transport = (
  handler: (url: URL, init: RequestInit) => Promise<Response>,
) => vi.fn(handler) as unknown as typeof fetch;

describe("Qloo client", () => {
  it("accepts three typed Search items in a top-level results array without success", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      entity_id: `artist-${index}`,
      name: `Invented Artist ${index}`,
      types: ["urn:entity", "urn:entity:artist"],
      properties: {},
      popularity: 0.8,
      disambiguation: "Invented fixture",
      tags: [],
    }));
    const client = new QlooClient(
      "offline-test-key",
      transport(async () => searchEnvelope(rows)),
    );
    expect(
      await client.search("Invented Artist", "artist", { take: 3 }),
    ).toEqual(
      rows.map((row) => ({
        id: row.entity_id,
        name: row.name,
        domain: "artist",
      })),
    );
  });
  it.each(["urn", "urn:entity"])(
    "rejects the generic Search request type %s before dispatch",
    async (genericType) => {
      const fetcher = transport(async () => searchEnvelope());
      const client = new QlooClient("offline-test-key", fetcher);
      await expect(
        client.search("Miles Davis", genericType as Domain),
      ).rejects.toMatchObject({ code: "INVALID_QUERY" });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it.each(["urn", "urn:entity"])(
    "rejects an unverifiable generic Search result type %s",
    async (genericType) => {
      const client = new QlooClient(
        "offline-test-key",
        transport(async () =>
          searchEnvelope([
            {
              entity_id: "invented-artist",
              name: "Miles Davis",
              types: [genericType],
            },
          ]),
        ),
      );
      expect(await client.search("Miles Davis", "artist")).toEqual([]);
    },
  );
  it("rejects the old nested Search envelope and keeps it valid for Insights only", async () => {
    const client = new QlooClient(
      "offline-test-key",
      transport(async (url) =>
        url.pathname === "/search" ? envelope() : searchEnvelope(),
      ),
    );
    await expect(client.search("Artist", "artist")).rejects.toMatchObject({
      code: "QLOO_MALFORMED",
    });
    await expect(client.insights("artist", ["seed"], [])).rejects.toMatchObject(
      {
        code: "QLOO_MALFORMED",
        details: {
          endpoint: "insights",
          domain: "artist",
          category: "invalid-envelope",
          resultCount: null,
          acceptedCount: null,
          rejectedCount: null,
        },
      },
    );
  });
  it("rejects pages larger than the requested Search or Insights size", async () => {
    const items = Array.from({ length: 2 }, (_, index) => ({
      entity_id: `id-${index}`,
      name: `Result ${index}`,
      type: "urn:entity:artist",
    }));
    const client = new QlooClient(
      "offline-test-key",
      transport(async (url) =>
        url.pathname === "/search"
          ? searchEnvelope(
              items.map((item) => ({ ...item, types: [item.type] })),
            )
          : envelope(items),
      ),
    );
    await expect(
      client.search("Result", "artist", { take: 1 }),
    ).rejects.toMatchObject({ code: "QLOO_MALFORMED" });
    await expect(
      client.insights("artist", ["seed"], [], { take: 1, page: 1 }),
    ).rejects.toMatchObject({
      code: "QLOO_MALFORMED",
      details: {
        endpoint: "insights",
        domain: "artist",
        category: "oversized-page",
        resultCount: 2,
        acceptedCount: null,
        rejectedCount: null,
      },
    });
  });
  it("accepts only the hackathon host before sending a key", async () => {
    const calls: URL[] = [];
    const fetcher = transport(async (url) => {
      calls.push(url);
      return searchEnvelope();
    });
    const client = new QlooClient(
      "key",
      fetcher,
      24,
      8000,
      async () => {},
      "https://hackathon.api.qloo.com",
    );
    await client.search("Miles Davis", "artist");
    expect(calls[0].origin).toBe("https://hackathon.api.qloo.com");
    for (const origin of [
      "https://api.qloo.com",
      "https://staging.api.qloo.com",
      "http://api.qloo.com",
      "https://api.qloo.com.example.invalid",
      "https://api.qloo.com/collect",
      "https://user:password@api.qloo.com",
    ]) {
      expect(
        () => new QlooClient("key", fetcher, 24, 8000, undefined, origin),
      ).toThrow("not approved");
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(["artist", "movie", "book"] as const)(
    "uses documented Search and Insights types for %s",
    async (domain) => {
      const calls: URL[] = [];
      const client = new QlooClient(
        "key",
        transport(async (url) => {
          calls.push(url as URL);
          return url.pathname === "/search" ? searchEnvelope() : envelope();
        }),
      );
      await client.search("A & B", domain);
      await client.insights(domain, ["seed-A", "seed-B"], ["rejected"], {
        take: 20,
        page: 2,
      });
      expect(calls[0].searchParams.get("query")).toBe("A & B");
      expect(calls[0].searchParams.get("types")).toBe(`urn:entity:${domain}`);
      expect(calls[0].searchParams.get("take")).toBe("8");
      expect(calls[1].searchParams.get("filter.type")).toBe(
        `urn:entity:${domain}`,
      );
      expect(calls[1].searchParams.get("signal.interests.entities")).toBe(
        "seed-A,seed-B",
      );
      expect(calls[1].searchParams.get("filter.exclude.entities")).toBe(
        "rejected",
      );
      expect(calls[1].searchParams.get("page")).toBe("2");
      expect(calls[1].searchParams.get("take")).toBe("20");
    },
  );
  it("constructs documented search and insights parameters and protects the key", async () => {
    const calls: URL[] = [];
    const client = new QlooClient(
      "secret",
      transport(async (url, init) => {
        calls.push(url as URL);
        expect(init.redirect).toBe("manual");
        expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe(
          "secret",
        );
        const items = [
          {
            entity_id: "id-1",
            name: "Miles Davis",
            type:
              url.pathname === "/search"
                ? "urn:entity:artist"
                : "urn:entity:movie",
            types: [
              url.pathname === "/search"
                ? "urn:entity:artist"
                : "urn:entity:movie",
            ],
            subtype:
              url.pathname === "/search"
                ? "urn:entity:artist"
                : "urn:entity:movie",
            properties: {},
          },
        ];
        return url.pathname === "/search"
          ? searchEnvelope(items)
          : envelope(items);
      }),
    );
    await client.search("Miles Davis", "artist");
    await client.insights("movie", ["id-1"], ["excluded"]);
    expect(calls[0].origin).toBe("https://hackathon.api.qloo.com");
    expect(calls[0].pathname).toBe("/search");
    expect(calls[0].searchParams.get("types")).toBe("urn:entity:artist");
    expect(calls[1].pathname).toBe("/v2/insights");
    expect(calls[1].searchParams.get("signal.interests.entities")).toBe("id-1");
    expect(calls[1].searchParams.get("filter.exclude.entities")).toBe(
      "excluded",
    );
    expect(calls[1].searchParams.get("feature.explainability")).toBe("true");
    expect(calls[1].searchParams.get("page")).toBe("1");
    expect(calls.every((url) => !url.href.includes("secret"))).toBe(true);
  });
  it("handles empty results", async () => {
    const client = new QlooClient(
      "key",
      transport(async (url) =>
        url.pathname === "/search" ? searchEnvelope() : envelope(),
      ),
    );
    expect(await client.search("unknown", "book")).toEqual([]);
    expect((await client.insights("book", ["seed"], [])).entities).toEqual([]);
  });
  it.each(["artist", "movie", "book"] as const)(
    "accepts explicitly typed %s Search arrays without changing Insights",
    async (domain) => {
      const client = new QlooClient(
        "offline-test-key",
        transport(async (url) =>
          url.pathname === "/search"
            ? searchEnvelope([
                {
                  entity_id: `mock-${domain}`,
                  name: `Mock ${domain}`,
                  types: [`urn:entity:${domain}`],
                },
              ])
            : envelope(),
        ),
      );
      expect(await client.search("Mock", domain)).toEqual([
        { id: `mock-${domain}`, name: `Mock ${domain}`, domain },
      ]);
      expect((await client.insights(domain, ["seed"], [])).entities).toEqual(
        [],
      );
    },
  );
  it.each([
    {
      name: "missing type metadata",
      row: { entity_id: "mock-1", name: "Mock" },
    },
    {
      name: "missing types array",
      row: { entity_id: "mock-1", name: "Mock", types: undefined },
    },
    {
      name: "empty types array",
      row: { entity_id: "mock-1", name: "Mock", types: [] },
    },
    {
      name: "non-array types",
      row: { entity_id: "mock-1", name: "Mock", types: "urn:entity:artist" },
    },
    {
      name: "blank supplemental type",
      row: {
        entity_id: "mock-1",
        name: "Mock",
        types: ["urn:entity:artist", " "],
      },
    },
    {
      name: "padded type",
      row: {
        entity_id: "mock-1",
        name: "Mock",
        types: ["urn:entity:artist", " urn:entity:book "],
      },
    },
    {
      name: "numeric type",
      row: {
        entity_id: "mock-1",
        name: "Mock",
        types: ["urn:entity:artist", 4],
      },
    },
    {
      name: "object type",
      row: {
        entity_id: "mock-1",
        name: "Mock",
        types: ["urn:entity:artist", {}],
      },
    },
    {
      name: "legacy type without array",
      row: { entity_id: "mock-1", name: "Mock", type: "urn:entity:artist" },
    },
    {
      name: "recognized person conflict",
      row: {
        entity_id: "mock-1",
        name: "Mock",
        types: ["urn:entity:artist", "urn:entity:person"],
      },
    },
    {
      name: "recognized nested movie conflict",
      row: {
        entity_id: "mock-1",
        name: "Mock",
        types: ["urn:entity:artist", "urn:entity:movie:documentary"],
      },
    },
    {
      name: "malformed types entry",
      row: { entity_id: "mock-1", name: "Mock", types: [null] },
    },
    {
      name: "ambiguous arrays",
      row: {
        entity_id: "mock-1",
        name: "Mock",
        types: ["urn:entity:artist", "urn:entity:book"],
      },
    },
    {
      name: "conflicting type fields",
      row: {
        entity_id: "mock-1",
        name: "Mock",
        type: "urn:entity:book",
        types: ["urn:entity:artist"],
      },
    },
  ])("fails closed on $name", async ({ row }) => {
    const client = new QlooClient(
      "offline-test-key",
      transport(async () => searchEnvelope([row])),
    );
    await expect(client.search("Mock", "artist")).rejects.toMatchObject({
      code: "QLOO_MALFORMED",
    });
  });
  it("rejects case-variant primary conflicts without using them as category evidence", async () => {
    const client = new QlooClient(
      "offline-test-key",
      transport(async () =>
        searchEnvelope([
          {
            entity_id: "mock-1",
            name: "Mock",
            types: ["urn:entity:artist", "URN:ENTITY:BOOK"],
          },
        ]),
      ),
    );
    await expect(client.search("Mock", "artist")).rejects.toMatchObject({
      code: "QLOO_MALFORMED",
    });
  });
  it("does not use duplicate array-typed Search IDs as two candidates", async () => {
    const client = new QlooClient(
      "offline-test-key",
      transport(async () =>
        searchEnvelope([
          { entity_id: "mock-1", name: "Mock", types: ["urn:entity:artist"] },
          { entity_id: "mock-1", name: "Mock", types: ["urn:entity:artist"] },
        ]),
      ),
    );
    expect(await client.search("Mock", "artist")).toEqual([
      { id: "mock-1", name: "Mock", domain: "artist" },
    ]);
  });
  it("preserves opaque IDs and order while deduplicating equivalent type sets", async () => {
    const client = new QlooClient(
      "offline-test-key",
      transport(async () =>
        searchEnvelope([
          {
            entity_id: "Opaque-Z",
            name: "First",
            types: [
              "urn:entity",
              "urn:entity:artist:musician",
              "urn:entity:artist",
            ],
          },
          {
            entity_id: "skip",
            name: "Wrong domain",
            types: ["urn:entity:book"],
          },
          {
            entity_id: "Opaque-A",
            name: "Second",
            types: ["urn:entity:artist"],
          },
          {
            entity_id: "Opaque-Z",
            name: "First",
            types: [
              "urn:entity:artist",
              "urn:entity:artist:musician",
              "urn:entity",
            ],
          },
        ]),
      ),
    );
    expect(await client.search("Mock", "artist")).toEqual([
      { id: "Opaque-Z", name: "First", domain: "artist" },
      { id: "Opaque-A", name: "Second", domain: "artist" },
    ]);
  });
  it("does not infer category from a subtype-only array or from the request", async () => {
    const client = new QlooClient(
      "offline-test-key",
      transport(async () =>
        searchEnvelope([
          {
            entity_id: "mock-1",
            name: "Mock",
            types: ["urn:entity:artist:musician"],
          },
        ]),
      ),
    );
    expect(await client.search("Mock", "artist")).toEqual([]);
  });
  it("does not let Search arrays satisfy the independent Insights entity parser", async () => {
    const client = new QlooClient(
      "offline-test-key",
      transport(async () =>
        envelope([
          { entity_id: "mock-1", name: "Mock", types: ["urn:entity:movie"] },
        ]),
      ),
    );
    await expect(client.insights("movie", ["seed"], [])).rejects.toMatchObject({
      code: "QLOO_MALFORMED",
    });
  });
  it("never infers the requested entity type from an untyped result", async () => {
    const client = new QlooClient(
      "offline-test-key",
      transport(async (url) =>
        url.pathname === "/search"
          ? searchEnvelope([
              { entity_id: "mock-untyped", name: "Unknown kind" },
            ])
          : envelope([{ entity_id: "mock-untyped", name: "Unknown kind" }]),
      ),
    );
    await expect(client.search("Unknown kind", "artist")).rejects.toMatchObject(
      { code: "QLOO_MALFORMED" },
    );
    await expect(client.insights("movie", ["seed"], [])).rejects.toMatchObject({
      code: "QLOO_MALFORMED",
    });
  });
  it("preserves excluded rows and positions for local eligibility and full-page recovery", async () => {
    const client = new QlooClient(
      "offline-test-key",
      transport(async () =>
        envelope(
          Array.from({ length: 20 }, (_, index) => ({
            entity_id: index === 0 ? "rejected" : `item-${index}`,
            name: `Item ${index}`,
            type: "urn:entity:artist",
          })),
        ),
      ),
    );
    const result = await client.insights("artist", ["seed"], ["rejected"]);
    expect(result.entities).toHaveLength(20);
    expect(result.entities[0].id).toBe("rejected");
    expect(result.entities[1].id).toBe("item-1");
  });
  it("deduplicates repeated Search IDs without inventing a second disambiguation choice", async () => {
    const client = new QlooClient(
      "key",
      transport(async () =>
        searchEnvelope([
          {
            entity_id: "artist-1",
            name: "Miles Davis",
            types: ["urn:entity:artist"],
          },
          {
            entity_id: "artist-1",
            name: "Miles Davis",
            types: ["urn:entity:artist"],
          },
        ]),
      ),
    );
    expect(await client.search("Miles Davis", "artist")).toEqual([
      { id: "artist-1", name: "Miles Davis", domain: "artist" },
    ]);
  });
  it("rejects conflicting names for the same Search ID", async () => {
    const client = new QlooClient(
      "offline-test-key",
      transport(async () =>
        searchEnvelope([
          {
            entity_id: "artist-1",
            name: "First",
            types: ["urn:entity:artist"],
          },
          {
            entity_id: "artist-1",
            name: "Second",
            types: ["urn:entity:artist"],
          },
        ]),
      ),
    );
    await expect(client.search("First", "artist")).rejects.toMatchObject({
      code: "QLOO_MALFORMED",
    });
  });
  it("rejects conflicting types for the same Search ID, even when one is filtered", async () => {
    const client = new QlooClient(
      "offline-test-key",
      transport(async () =>
        searchEnvelope([
          { entity_id: "shared-1", name: "Title", types: ["urn:entity:book"] },
          {
            entity_id: "shared-1",
            name: "Title",
            types: ["urn:entity:artist"],
          },
        ]),
      ),
    );
    await expect(client.search("Title", "artist")).rejects.toMatchObject({
      code: "QLOO_MALFORMED",
    });
  });
  it.each([
    { entity_id: "", name: "Artist", types: ["urn:entity:artist"] },
    { entity_id: 4, name: "Artist", types: ["urn:entity:artist"] },
    { entity_id: "artist-1", name: " ", types: ["urn:entity:artist"] },
    { entity_id: "artist-1", name: 4, types: ["urn:entity:artist"] },
    { entity_id: "artist-1", name: "Artist", types: [" "] },
    { entity_id: " padded ", name: "Artist", types: ["urn:entity:artist"] },
  ])("rejects malformed Search identity fields: %j", async (row) => {
    const client = new QlooClient(
      "offline-test-key",
      transport(async () => searchEnvelope([row])),
    );
    await expect(client.search("Artist", "artist")).rejects.toMatchObject({
      code: "QLOO_MALFORMED",
    });
  });
  it("never returns a Search item of the wrong verified domain", async () => {
    const client = new QlooClient(
      "offline-test-key",
      transport(async () =>
        searchEnvelope([
          { entity_id: "book-1", name: "Book", types: ["urn:entity:book"] },
        ]),
      ),
    );
    expect(await client.search("Book", "artist")).toEqual([]);
  });
  it("handles unauthorized requests without retrying", async () => {
    const fetcher = transport(async () => new Response("", { status: 401 }));
    await expect(
      new QlooClient("key", fetcher).search("x", "book"),
    ).rejects.toMatchObject({ code: "QLOO_AUTH" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("never follows a redirect with the server-side key", async () => {
    const fetcher = transport(async (_url, init) => {
      expect(init.redirect).toBe("manual");
      return new Response(null, {
        status: 302,
        headers: { Location: "https://example.invalid/collect" },
      });
    });
    await expect(
      new QlooClient("secret", fetcher).search("Miles Davis", "artist"),
    ).rejects.toMatchObject({ code: "QLOO_REDIRECT" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("retries rate limiting in a bounded way", async () => {
    const fetcher = transport(async () => new Response("", { status: 429 }));
    await expect(
      new QlooClient("key", fetcher).search("x", "book"),
    ).rejects.toMatchObject({ code: "QLOO_RATE_LIMIT" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("handles malformed responses", async () => {
    const client = new QlooClient(
      "key",
      transport(async () => Response.json({ results: {} })),
    );
    await expect(client.search("x", "book")).rejects.toMatchObject({
      code: "QLOO_MALFORMED",
    });
  });
  it("rejects invalid paging and malformed or empty Insights envelopes", async () => {
    const fetcher = transport(async () =>
      Response.json({ results: { entities: [] } }),
    );
    const client = new QlooClient("key", fetcher);
    await expect(
      client.insights("movie", ["seed"], [], { take: 2.5, page: 1 }),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(fetcher).toHaveBeenCalledTimes(0);
    expect((await client.insights("movie", ["seed"], [])).entities).toEqual([]);
  });
  it("enforces the response-size cap without returning upstream content", async () => {
    const fetcher = transport(
      async () =>
        new Response("oversized-secret", {
          status: 200,
          headers: { "content-length": "2000001" },
        }),
    );
    await expect(
      new QlooClient("key", fetcher).search("x", "book"),
    ).rejects.toMatchObject({ code: "QLOO_RESPONSE_SIZE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const undeclared = transport(
      async () => new Response("x".repeat(2_000_001)),
    );
    await expect(
      new QlooClient("key", undeclared).search("x", "book"),
    ).rejects.toMatchObject({ code: "QLOO_RESPONSE_SIZE" });
    expect(undeclared).toHaveBeenCalledTimes(1);
  });
  it("does not disclose provider error bodies and never retries client errors", async () => {
    const fetcher = transport(
      async () => new Response("upstream-secret", { status: 400 }),
    );
    const failure = new QlooClient("key", fetcher).search("x", "book");
    await expect(failure).rejects.toMatchObject({ code: "QLOO_REQUEST" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not dispatch empty Insights signals and keeps provenance", async () => {
    const fetcher = transport(async () => envelope());
    const result = await new QlooClient("key", fetcher).insights(
      "artist",
      [],
      [],
    );
    expect(result).toEqual({
      entities: [],
      signalIds: [],
      source: "qloo",
      take: 20,
      page: 1,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("handles timeouts", async () => {
    vi.useFakeTimers();
    const client = new QlooClient(
      "key",
      transport(
        async (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );
    const promise = client.search("x", "book");
    const assertion = expect(promise).rejects.toMatchObject({
      code: "QLOO_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(8001);
    await assertion;
    vi.useRealTimers();
  });

  it("treats subtype as descriptive and filters by top-level entity type", async () => {
    const client = new QlooClient(
      "key",
      transport(async (url) =>
        (url.pathname === "/search" ? searchEnvelope : envelope)([
          {
            entity_id: "good",
            name: "Film",
            type: "urn:entity:movie",
            types: ["urn:entity:movie"],
            subtype: "urn:entity:movie:documentary",
          },
          {
            entity_id: "wrong",
            name: "Book",
            type: "urn:entity:book",
            types: ["urn:entity:book"],
          },
        ]),
      ),
    );
    expect(await client.search("Film", "movie")).toEqual([
      { id: "good", name: "Film", domain: "movie" },
    ]);
    await expect(client.insights("movie", ["seed"], [])).rejects.toMatchObject({
      code: "QLOO_MALFORMED",
    });
  });

  it("accepts the owner-observed generic Movie type with exact Movie subtype and preserves result order", async () => {
    const rows = ["first", "second"].map((id) => ({
      entity_id: `invented-${id}`,
      name: `Invented ${id}`,
      type: "urn:entity",
      subtype: "urn:entity:movie",
      query: { explainability: {} },
    }));
    const client = new QlooClient(
      "offline-test-key",
      transport(async () => envelope(rows)),
    );
    const result = await client.insights("movie", ["invented-seed"], [], {
      take: 5,
      page: 2,
    });
    expect(result.entities.map((item) => item.id)).toEqual([
      "invented-first",
      "invented-second",
    ]);
    expect(result.entities.every((item) => item.domain === "movie")).toBe(true);
    expect(result).toMatchObject({ source: "qloo", take: 5, page: 2 });
  });

  it("accepts structurally explicit generic Artist Insights in the production adapter offline", async () => {
    const rows = ["first", "second"].map((label) => ({
      entity_id: `invented-artist-${label}`,
      name: `Invented ${label}`,
      type: "urn:entity",
      subtype: "urn:entity:artist",
    }));
    const client = new QlooClient(
      "offline-test-key",
      transport(async () => envelope(rows)),
    );
    const result = await client.insights("artist", ["invented-seed"], [], {
      take: 5,
      page: 1,
    });
    expect(result.entities.map((item) => item.id)).toEqual(
      rows.map((row) => row.entity_id),
    );
    expect(result).toMatchObject({
      source: "qloo",
      signalIds: ["invented-seed"],
      take: 5,
      page: 1,
    });
  });

  it.each([
    {
      label: "missing subtype",
      row: { type: "urn:entity" },
      reason: "missing-or-wrong-subtype",
    },
    {
      label: "wrong category",
      row: { type: "urn:entity", subtype: "urn:entity:book" },
      reason: "missing-or-wrong-subtype",
    },
    {
      label: "conflicting category array",
      row: {
        type: "urn:entity",
        subtype: "urn:entity:artist",
        types: ["urn:entity:artist", "urn:entity:movie"],
      },
      reason: "conflicting-primary-domains",
    },
  ])(
    "fails closed for Artist Insights $label with redacted counts",
    async ({ row, reason }) => {
      const client = new QlooClient(
        "offline-test-key",
        transport(async () =>
          envelope([
            {
              entity_id: "invented-good",
              name: "Invented Good",
              type: "urn:entity",
              subtype: "urn:entity:artist",
            },
            {
              entity_id: "invented-private-id",
              name: "Invented Private Name",
              ...row,
            },
          ]),
        ),
      );
      let caught: unknown;
      try {
        await client.insights("artist", ["invented-seed"], []);
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({
        code: "QLOO_MALFORMED",
        status: 502,
        details: {
          endpoint: "insights",
          domain: "artist",
          category: "entity-classification",
          resultCount: 2,
          acceptedCount: 1,
          rejectedCount: 1,
          reasons: { [reason]: 1 },
        },
      });
      expect(JSON.stringify(caught)).not.toMatch(
        /invented-private-id|Invented Private Name|offline-test-key/,
      );
    },
  );

  it.each([
    {
      label: "missing subtype",
      row: { type: "urn:entity", subtype: undefined },
    },
    {
      label: "wrong-domain subtype",
      row: { type: "urn:entity", subtype: "urn:entity:book" },
    },
    {
      label: "contradictory categories",
      row: { type: "urn:entity:book", subtype: "urn:entity:movie" },
    },
    {
      label: "malformed subtype",
      row: { type: "urn:entity", subtype: { private: "invented" } },
    },
    {
      label: "conflicting types array",
      row: {
        type: "urn:entity",
        subtype: "urn:entity:movie",
        types: ["urn:entity:book"],
      },
    },
    {
      label: "blank identity",
      row: { type: "urn:entity", subtype: "urn:entity:movie", name: " " },
    },
  ])(
    "rejects $label in an otherwise valid Movie Insights page",
    async ({ row }) => {
      const valid = {
        entity_id: "invented-valid",
        name: "Invented valid movie",
        type: "urn:entity",
        subtype: "urn:entity:movie",
      };
      const client = new QlooClient(
        "offline-test-key",
        transport(async () =>
          envelope([
            valid,
            { ...valid, entity_id: "invented-invalid", ...row },
          ]),
        ),
      );
      await expect(
        client.insights("movie", ["seed"], []),
      ).rejects.toMatchObject({
        code: "QLOO_MALFORMED",
      });
    },
  );

  it("rejects duplicate Movie Insights IDs rather than ranking one entity twice", async () => {
    const row = {
      entity_id: "invented-duplicate",
      name: "Invented movie",
      type: "urn:entity",
      subtype: "urn:entity:movie",
    };
    const client = new QlooClient(
      "offline-test-key",
      transport(async () => envelope([row, row])),
    );
    await expect(client.insights("movie", ["seed"], [])).rejects.toMatchObject({
      code: "QLOO_MALFORMED",
    });
  });

  it("accepts the owner-observed generic Book subtype and the existing exact Book type without changing order or provenance", async () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      entity_id: `invented-book-${index}`,
      name: `Invented Book ${index}`,
      type: "urn:entity",
      subtype: "urn:entity:book",
    }));
    const client = new QlooClient(
      "offline-test-key",
      transport(async () => envelope(rows)),
    );
    const result = await client.insights("book", ["invented-seed"], [], {
      take: 5,
      page: 2,
    });
    expect(result.entities.map((item) => item.id)).toEqual(
      rows.map((row) => row.entity_id),
    );
    expect(result.entities.every((item) => item.domain === "book")).toBe(true);
    expect(result).toMatchObject({
      source: "qloo",
      signalIds: ["invented-seed"],
      take: 5,
      page: 2,
    });
    expect(
      (
        await new QlooClient(
          "offline-test-key",
          transport(async () =>
            envelope([
              {
                entity_id: "invented-exact-book",
                name: "Invented exact Book",
                type: "urn:entity:book",
              },
            ]),
          ),
        ).insights("book", ["seed"], [])
      ).entities[0].domain,
    ).toBe("book");
  });

  it.each([
    { label: "missing subtype", row: { subtype: undefined } },
    { label: "wrong-domain subtype", row: { subtype: "urn:entity:movie" } },
    { label: "malformed subtype", row: { subtype: {} } },
    { label: "blank identity", row: { name: " " } },
    { label: "missing identity", row: { entity_id: undefined } },
    {
      label: "conflicting array metadata",
      row: { types: ["urn:entity:movie"] },
    },
    { label: "unknown top-level type", row: { type: "urn:entity:unknown" } },
  ])(
    "rejects $label in an otherwise valid Book Insights page",
    async ({ row }) => {
      const valid = {
        entity_id: "invented-valid-book",
        name: "Invented valid Book",
        type: "urn:entity",
        subtype: "urn:entity:book",
      };
      const client = new QlooClient(
        "offline-test-key",
        transport(async () =>
          envelope([
            valid,
            { ...valid, entity_id: "invented-invalid-book", ...row },
          ]),
        ),
      );
      await expect(client.insights("book", ["seed"], [])).rejects.toMatchObject(
        {
          code: "QLOO_MALFORMED",
        },
      );
    },
  );

  it("rejects duplicate and oversized Book Insights pages", async () => {
    const row = {
      entity_id: "invented-duplicate-book",
      name: "Invented Book",
      type: "urn:entity",
      subtype: "urn:entity:book",
    };
    const client = new QlooClient(
      "offline-test-key",
      transport(async () => envelope([row, row])),
    );
    await expect(client.insights("book", ["seed"], [])).rejects.toMatchObject({
      code: "QLOO_MALFORMED",
    });
    await expect(
      client.insights("book", ["seed"], [], { take: 1, page: 1 }),
    ).rejects.toMatchObject({ code: "QLOO_MALFORMED" });
  });

  it("rejects malformed entities, unsuccessful responses, and unexpected Insights 404", async () => {
    await expect(
      new QlooClient(
        "key",
        transport(async () => searchEnvelope([{ name: "No ID" }])),
      ).search("x", "book"),
    ).rejects.toMatchObject({ code: "QLOO_MALFORMED" });
    await expect(
      new QlooClient(
        "key",
        transport(async () => Response.json({ success: false, results: [] })),
      ).search("x", "book"),
    ).rejects.toMatchObject({ code: "QLOO_UPSTREAM" });
    await expect(
      new QlooClient(
        "key",
        transport(async () =>
          Response.json({ error: "invented", results: [] }),
        ),
      ).search("x", "book"),
    ).rejects.toMatchObject({ code: "QLOO_UPSTREAM" });
    const notFound = new QlooClient(
      "key",
      transport(async () => new Response("", { status: 404 })),
    );
    expect(await notFound.search("x", "book")).toEqual([]);
    await expect(notFound.insights("book", ["seed"], [])).rejects.toMatchObject(
      { code: "QLOO_REQUEST" },
    );
  });

  it("exposes only matching normalized influence pairs and leaves film runtime unverified", async () => {
    const client = new QlooClient(
      "key",
      transport(async () =>
        envelope([
          {
            entity_id: "movie-1",
            name: "A movie",
            type: "urn:entity:movie",
            properties: { duration: 98, content_rating: "PG" },
            query: {
              explainability: {
                entities: [
                  { entity_id: "seed", score: 0.4 },
                  { entity_id: "other", score: 0.9 },
                  { entity_id: "seed", score: 4 },
                ],
              },
            },
          },
        ]),
      ),
    );
    const result = await client.insights("movie", ["seed"], [], {
      take: 5,
      page: 2,
    });
    expect(result.entities[0].duration).toBeUndefined();
    expect(result.entities[0].contentRating).toBe("PG");
    expect(result.entities[0].influence).toEqual([
      { signalId: "seed", normalizedInfluence: 0.4 },
    ]);
    expect(result.page).toBe(2);
  });

  it("counts every retry against the HTTP budget and respects long Retry-After", async () => {
    const fetcher = transport(async () => new Response("", { status: 429 }));
    const client = new QlooClient("key", fetcher, 2, 8000, async () => {});
    await expect(client.search("x", "book")).rejects.toMatchObject({
      code: "BUDGET",
    });
    expect(client.metrics().httpAttempts).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const longWait = transport(
      async () =>
        new Response("", { status: 429, headers: { "Retry-After": "60" } }),
    );
    await expect(
      new QlooClient("key", longWait).search("x", "book"),
    ).rejects.toMatchObject({ code: "QLOO_RATE_LIMIT" });
    expect(longWait).toHaveBeenCalledTimes(1);
  });
});
