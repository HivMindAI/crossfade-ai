import { AppError } from "./errors";

const windows = new Map<string, { count: number; reset: number }>();

function rejectedOrigin(): AppError {
  return new AppError(
    "ORIGIN",
    "Planning requests must come from this site.",
    403,
  );
}

function configuredSiteOrigin(value: string): string {
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (
      value === url.origin &&
      (url.protocol === "https:" || (url.protocol === "http:" && local)) &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    )
      return url.origin;
  } catch {
    // An invalid server setting must not grant a browser origin.
  }
  throw new AppError(
    "ORIGIN_CONFIG",
    "The trusted site origin is invalid.",
    503,
  );
}

export function checkRequestOrigin(
  request: Request,
  production = process.env.NODE_ENV === "production",
): void {
  const origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (production && !origin)
  )
    throw rejectedOrigin();
  if (!origin) return;
  try {
    const source = new URL(origin);
    const target = new URL(request.url);
    if (origin !== source.origin) throw rejectedOrigin();
    const serverOrigin = process.env.CROSSFADE_SITE_ORIGIN;
    const expected =
      production && serverOrigin !== undefined
        ? configuredSiteOrigin(serverOrigin)
        : target.origin;
    const loopback = (host: string) =>
      host === "localhost" || host === "127.0.0.1";
    const localAlias =
      !production &&
      loopback(source.hostname) &&
      loopback(target.hostname) &&
      source.port === target.port &&
      source.protocol === target.protocol;
    if (source.origin !== expected && !localAlias) throw rejectedOrigin();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw rejectedOrigin();
  }
}

export function checkRateLimit(
  identity: string,
  now = Date.now(),
  limit = 15,
): void {
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
  if (window.count > limit)
    throw new AppError(
      "RATE_LIMIT",
      "Too many planning requests. Try again in a minute.",
      429,
    );
}
