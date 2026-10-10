import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { requestSchema } from "@/lib/model";
import { runNegotiation } from "@/lib/orchestrator";
import { liveSource } from "@/lib/qloo";
import { checkRateLimit } from "@/lib/rate-limit";
import { syntheticSource } from "@/lib/synthetic";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    checkRateLimit(
      request.headers.get("x-real-ip") ??
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "anonymous",
    );
    if (Number(request.headers.get("content-length")) > 16_384)
      throw new AppError("REQUEST_SIZE", "Request is too large.", 413);
    const body = await request.text();
    if (body.length > 16_384)
      throw new AppError("REQUEST_SIZE", "Request is too large.", 413);
    const parsed = requestSchema.parse(JSON.parse(body));
    const source = parsed.mode === "live" ? liveSource() : syntheticSource;
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
