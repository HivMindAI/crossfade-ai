import { describe, expect, it, vi } from "vitest";
import { QlooClient } from "./qloo";

const envelope = (entities: unknown[] = []) =>
  Response.json({ success: true, results: { entities } });
const transport = (
  handler: (url: URL, init: RequestInit) => Promise<Response>,
) => vi.fn(handler) as unknown as typeof fetch;

describe("Qloo client", () => {
  it("constructs documented search and insights parameters and protects the key", async () => {
    const calls: URL[] = [];
    const client = new QlooClient(
      "secret",
      transport(async (url, init) => {
        calls.push(url as URL);
        expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe(
          "secret",
        );
        return envelope([
          {
            entity_id: "id-1",
            name: "Miles Davis",
            subtype: "urn:entity:artist",
            properties: {},
          },
        ]);
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
      transport(async () => envelope()),
    );
    expect(await client.search("unknown", "book")).toEqual([]);
    expect((await client.insights("book", ["seed"], [])).entities).toEqual([]);
  });
  it("handles unauthorized requests without retrying", async () => {
    const fetcher = transport(async () => new Response("", { status: 401 }));
    await expect(
      new QlooClient("key", fetcher).search("x", "book"),
    ).rejects.toMatchObject({ code: "QLOO_AUTH" });
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
      transport(async () =>
        envelope([
          {
            entity_id: "good",
            name: "Film",
            type: "urn:entity:movie",
            subtype: "urn:entity:movie:documentary",
          },
          { entity_id: "wrong", name: "Book", type: "urn:entity:book" },
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

  it("rejects malformed entities, unsuccessful responses, and unexpected Insights 404", async () => {
    await expect(
      new QlooClient(
        "key",
        transport(async () => envelope([{ name: "No ID" }])),
      ).search("x", "book"),
    ).rejects.toMatchObject({ code: "QLOO_MALFORMED" });
    await expect(
      new QlooClient(
        "key",
        transport(async () =>
          Response.json({ success: false, results: { entities: [] } }),
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
