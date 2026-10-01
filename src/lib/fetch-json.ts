/** Bound both the download and JSON parsing, and cancel obsolete requests. */
export async function fetchJson(
  url: string,
  options: { signal?: AbortSignal; cache?: RequestCache; timeoutMs?: number } = {},
): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, options.timeoutMs ?? 10_000);
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      signal: controller.signal,
      cache: options.cache,
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
