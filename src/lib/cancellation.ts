import { AppError } from "./errors";

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new AppError(
      "REQUEST_ABORTED",
      "Planning request was cancelled.",
      499,
    );
}

export function cancellableWait(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(
        new AppError("REQUEST_ABORTED", "Planning request was cancelled.", 499),
      );
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
