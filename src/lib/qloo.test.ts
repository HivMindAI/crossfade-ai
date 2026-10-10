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
    expect(calls.every((url) => !url.href.includes("secret"))).toBe(true);
  });
  it("handles empty results", async () => {
    const client = new QlooClient(
      "key",
      transport(async () => envelope()),
    );
    expect(await client.search("unknown", "book")).toEqual([]);
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
});
