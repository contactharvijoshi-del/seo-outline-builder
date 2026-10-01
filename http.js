// Shared fetch helper: timeout + retry with exponential backoff on 429 / 5xx.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url, opts, { retries = 3, timeoutMs = 90000, baseDelayMs = 2000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) return res;

    const text = await res.text().catch(() => '');
    // A "quota exceeded" 429 won't fix itself in seconds — don't waste time retrying it.
    const quota = res.status === 429 && /quota/i.test(text);
    const retriable = !quota && (res.status === 429 || res.status >= 500);
    if (!retriable || attempt >= retries) {
      const err = new Error(`${new URL(url).hostname} returned ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      err.quota = quota;
      throw err;
    }
    await sleep(baseDelayMs * 2 ** attempt); // 2s, 4s, 8s
  }
}
