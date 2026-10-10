import { AppError } from "./errors";

const windows = new Map<string, { count: number; reset: number }>();

export function checkRequestOrigin(
  request: Request,
  production = process.env.NODE_ENV === "production",
): void {
  const origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (production && !origin)
  )
    throw new AppError(
      "ORIGIN",
      "Planning requests must come from this site.",
      403,
    );
  if (!origin) return;
  try {
    const source = new URL(origin);
    const target = new URL(request.url);
    const loopback = (host: string) =>
      host === "localhost" || host === "127.0.0.1";
    const localAlias =
      !production &&
      loopback(source.hostname) &&
      loopback(target.hostname) &&
      source.port === target.port &&
      source.protocol === target.protocol;
    if (source.origin !== target.origin && !localAlias)
      throw new AppError(
        "ORIGIN",
        "Planning requests must come from this site.",
        403,
      );
  } catch {
    throw new AppError(
      "ORIGIN",
      "Planning requests must come from this site.",
      403,
    );
  }
}

export function checkRateLimit(identity: string, now = Date.now()): void {
  if (windows.size > 3000) {
    for (const [key, value] of windows)
      if (value.reset < now) windows.delete(key);
  }
  const previous = windows.get(identity);
  const window =
    !previous || previous.reset < now
      ? { count: 0, reset: now + 60_000 }
      : previous;
  window.count++;
  windows.set(identity, window);
  if (window.count > 15)
    throw new AppError(
      "RATE_LIMIT",
      "Too many planning requests. Try again in a minute.",
      429,
    );
}
