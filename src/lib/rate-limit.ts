import { AppError } from "./errors";

const windows = new Map<string, { count: number; reset: number }>();

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
