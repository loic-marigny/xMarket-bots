export function optionalEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

export function positiveNumberEnv(key: string, fallback: number): number {
  const raw = optionalEnv(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isRetriableNetworkError(error: unknown): boolean {
  const text = String(error ?? "");
  return [
    "fetch failed",
    "ENOTFOUND",
    "ECONNRESET",
    "ETIMEDOUT",
    "network-request-failed",
    "Temporary failure",
  ].some((fragment) => text.includes(fragment));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetries<T>(
  label: string,
  task: () => Promise<T>,
  attempts = 4,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isRetriableNetworkError(error) || attempt === attempts) {
        throw error;
      }
      const delayMs = attempt * 1500;
      console.warn(`[${label}] attempt ${attempt}/${attempts} failed, retrying in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
