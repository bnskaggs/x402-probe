// The retry wrapper most agent code puts around a flaky call: any failure, try again.
export async function withRetry<T extends { ok: boolean }>(
  call: () => Promise<T>,
  maxAttempts = 3,
): Promise<{ result: T; attempts: number }> {
  let result = await call();
  let attempts = 1;
  while (!result.ok && attempts < maxAttempts) {
    result = await call();
    attempts++;
  }
  return { result, attempts };
}
