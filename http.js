// Shared fetch helper: timeout + retry with exponential backoff on 429 / 5xx.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url, opts, { retries = 2, timeoutMs = 90000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) return res;

    const retriable = res.status === 429 || res.status >= 500;
    if (!retriable || attempt >= retries) {
      const text = await res.text().catch(() => '');
      const err = new Error(`${new URL(url).hostname} returned ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    await sleep(1000 * 2 ** attempt);
  }
}
