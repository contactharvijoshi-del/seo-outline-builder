// DataForSEO client — real Google SERP results + keyword metrics.
// Pay-per-request; only called when DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD are set.
import { fetchWithRetry } from './http.js';

const BASE = process.env.DATAFORSEO_BASE_URL || 'https://api.dataforseo.com/v3';

async function post(pathname, payload, { login, password }) {
  const res = await fetchWithRetry(
    BASE + pathname,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    { timeoutMs: 60000 }
  );
  const data = await res.json();
  if (data.status_code !== 20000) throw new Error(`DataForSEO: ${data.status_message}`);
  const task = data.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO task: ${task?.status_message || 'no task returned'}`);
  }
  return task.result?.[0] || null;
}

export async function getSerp({ keyword, locationCode, languageCode, creds }) {
  const r = await post(
    '/serp/google/organic/live/advanced',
    [{ keyword, location_code: locationCode, language_code: languageCode, depth: 10, device: 'desktop' }],
    creds
  );
  const items = r?.items || [];
  return {
    topResults: items
      .filter((i) => i.type === 'organic')
      .slice(0, 10)
      .map((i) => ({ position: i.rank_group, title: i.title, url: i.url, domain: i.domain, snippet: i.description })),
    peopleAlsoAsk: items
      .filter((i) => i.type === 'people_also_ask')
      .flatMap((i) => (i.items || []).map((q) => q.title))
      .filter(Boolean),
    relatedSearches: items
      .filter((i) => i.type === 'related_searches')
      .flatMap((i) => i.items || [])
      .filter((s) => typeof s === 'string'),
    totalResults: r?.se_results_count ?? null,
  };
}

export async function getKeywordMetrics({ keyword, locationCode, languageCode, creds }) {
  const r = await post(
    '/dataforseo_labs/google/keyword_overview/live',
    [{ keywords: [keyword], location_code: locationCode, language_code: languageCode }],
    creds
  );
  const it = r?.items?.[0];
  if (!it) return null;
  return {
    searchVolume: it.keyword_info?.search_volume ?? null,
    cpc: it.keyword_info?.cpc ?? null,
    competition: it.keyword_info?.competition_level ?? null,
    difficulty: it.keyword_properties?.keyword_difficulty ?? null,
    intent: it.search_intent_info?.main_intent ?? null,
  };
}
