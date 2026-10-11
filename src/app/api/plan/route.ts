import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { reserveLivePlan } from "@/lib/live-quota";
import { requestSchema } from "@/lib/model";
import { runNegotiation } from "@/lib/orchestrator";
import { liveSource } from "@/lib/qloo";
import { checkRateLimit, checkRequestOrigin } from "@/lib/rate-limit";
import { syntheticSource } from "@/lib/synthetic";

export const runtime = "nodejs";

async function limitedBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let total = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 16_384) {
      await reader.cancel();
      throw new AppError("REQUEST_SIZE", "Request is too large.", 413);
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

export async function POST(request: Request) {
  try {
    checkRequestOrigin(request);
    checkRateLimit("planning-global");
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      throw new AppError("CONTENT_TYPE", "Send JSON to the planner.", 415);
    if (Number(request.headers.get("content-length")) > 16_384)
      throw new AppError("REQUEST_SIZE", "Request is too large.", 413);
    const body = await limitedBody(request);
    const parsed = requestSchema.parse(JSON.parse(body));
    const source = parsed.mode === "live" ? liveSource() : syntheticSource;
    if (parsed.mode === "live") await reserveLivePlan();
    const result = await runNegotiation(parsed, source);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AppError)
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: error.status },
      );
    if (error instanceof ZodError)
      return NextResponse.json(
        {
          error: "INVALID_INPUT",
          message: "Check the audience interests and constraints.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { error: "INVALID_JSON", message: "Invalid request body." },
        { status: 400 },
      );
    console.error(
      "Planning request failed:",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      { error: "INTERNAL", message: "The plan could not be completed." },
      { status: 500 },
    );
  }
}
