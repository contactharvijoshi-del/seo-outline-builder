// SEO Outline Builder — backend server.
// Holds all API keys server-side (never sent to the browser), caches results,
// rate-limits users and optionally requires a company access token.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateBrief } from './gemini.js';
import { getSerp, getKeywordMetrics } from './dataforseo.js';
import { makeCache } from './cache.js';
import { buildPrompt, ARTICLE_TYPES, LENGTHS } from './prompt.js';
import { cleanUrls, fetchCompetitors } from './competitors.js';
import { mockBrief } from './mock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;

const CONFIG = {
  port: Number(env.PORT || 3000),
  geminiKey: env.GEMINI_API_KEY || '',
  geminiModel: env.GEMINI_MODEL || 'gemini-3.8-flash',
  fallbackModel: env.GEMINI_FALLBACK_MODEL || '',
  useSearch: env.GEMINI_SEARCH_GROUNDING !== 'false',
  dfs: env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD
    ? { login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD }
    : null,
  accessToken: (env.APP_ACCESS_TOKEN || '').trim(),
  rateLimitPerMin: Number(env.RATE_LIMIT_PER_MIN || 20),
  mock: env.MOCK_MODE === 'true' || process.argv.includes('--demo'),
};

// Markets — DataForSEO location codes (Google geo IDs). "Global" uses US data for SERP lookups.
const COUNTRIES = {
  GLOBAL: { name: 'Global', code: 2840 },
  AU: { name: 'Australia', code: 2036 },
  US: { name: 'United States', code: 2840 },
  GB: { name: 'United Kingdom', code: 2826 },
  CA: { name: 'Canada', code: 2124 },
  NZ: { name: 'New Zealand', code: 2554 },
  IN: { name: 'India', code: 2356 },
  IE: { name: 'Ireland', code: 2372 },
  SG: { name: 'Singapore', code: 2702 },
  ZA: { name: 'South Africa', code: 2710 },
  DE: { name: 'Germany', code: 2276 },
  FR: { name: 'France', code: 2250 },
  ES: { name: 'Spain', code: 2724 },
  IT: { name: 'Italy', code: 2380 },
};
const LANGUAGES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', nl: 'Dutch', hi: 'Hindi', ja: 'Japanese',
};
const INTENTS = ['auto', 'informational', 'commercial', 'transactional', 'navigational'];

const cache = makeCache(path.join(__dirname, 'cache'), Number(env.CACHE_HOURS ?? 72));
const inFlight = new Map();

// ---------- helpers ----------
function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

async function readBody(req, limit = 20_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
}

function authorized(req) {
  if (!CONFIG.accessToken) return true;
  const given = Buffer.from(String(req.headers['x-access-token'] || '').trim());
  const expected = Buffer.from(CONFIG.accessToken);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > CONFIG.rateLimitPerMin;
}

const text = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

function normalize(body) {
  const keyword = text(body.keyword, 120);
  if (keyword.length < 2) throw Object.assign(new Error('Please enter a target keyword (at least 2 characters).'), { status: 400 });
  const country = COUNTRIES[body.country] ? body.country : 'GLOBAL';
  const language = LANGUAGES[body.language] ? body.language : 'en';
  const h2 = Math.round(Number(body.h2Count));
  return {
    keyword,
    country,
    countryName: COUNTRIES[country].name,
    language,
    languageName: LANGUAGES[language],
    audience: text(body.audience, 200),
    intent: INTENTS.includes(body.intent) ? body.intent : 'auto',
    articleType: ARTICLE_TYPES[body.articleType] ? body.articleType : 'ultimate',
    length: LENGTHS[body.length] ? body.length : '800-1200',
    h2Count: h2 >= 3 && h2 <= 12 ? h2 : 5,
    brand: text(body.brand, 120),
    cta: text(body.cta, 120),
    competitorUrls: cleanUrls(body.competitorUrls),
    instructions: String(body.instructions ?? '').trim().slice(0, 1500),
  };
}

// ---------- core ----------
async function buildBrief(o) {
  const warnings = [];
  let serp = null;
  let metrics = null;
  let competitors = [];

  if (CONFIG.mock) {
    return { ...mockBrief(o), serp, metrics, competitors, warnings: ['Demo mode — sample data only, no AI used.'] };
  }
  if (!CONFIG.geminiKey) {
    throw Object.assign(new Error('Server is missing GEMINI_API_KEY. Add it in the hosting settings and redeploy.'), { status: 500 });
  }

  const jobs = [o.competitorUrls.length ? fetchCompetitors(o.competitorUrls) : Promise.resolve([])];
  if (CONFIG.dfs) {
    const args = { keyword: o.keyword, locationCode: COUNTRIES[o.country].code, languageCode: o.language, creds: CONFIG.dfs };
    jobs.push(getSerp(args), getKeywordMetrics(args));
  }
  const [c, s, m] = await Promise.allSettled(jobs);
  competitors = c.status === 'fulfilled' ? c.value : [];
  competitors.filter((x) => x.error).forEach((x) => warnings.push(`Couldn't read competitor ${x.url} — ${x.error}.`));
  if (s) s.status === 'fulfilled' ? (serp = s.value) : warnings.push(`SERP data unavailable: ${s.reason.message}`);
  if (m) m.status === 'fulfilled' ? (metrics = m.value) : warnings.push(`Keyword metrics unavailable: ${m.reason.message}`);

  const prompt = buildPrompt({ ...o, serp, metrics, competitors, useSearch: CONFIG.useSearch });
  const ai = await generateBrief({
    apiKey: CONFIG.geminiKey,
    model: CONFIG.geminiModel,
    fallbackModel: CONFIG.fallbackModel,
    prompt,
    useSearch: CONFIG.useSearch,
  });
  if (ai.model !== CONFIG.geminiModel) warnings.push(`${CONFIG.geminiModel} was busy, so the backup model ${ai.model} was used.`);
  return { ...ai, serp, metrics, competitors, warnings };
}

async function handleBrief(req, res) {
  const body = await readBody(req);
  const o = normalize(body);

  const key = cache.key([o, CONFIG.geminiModel, CONFIG.mock, !!CONFIG.dfs, CONFIG.useSearch]);
  if (!body.refresh) {
    const hit = await cache.get(key);
    if (hit) return send(res, 200, { ...hit, meta: { ...hit.meta, cached: true } });
  }

  if (!inFlight.has(key)) inFlight.set(key, buildBrief(o).finally(() => inFlight.delete(key)));
  const result = await inFlight.get(key);

  const payload = {
    ...result,
    competitors: result.competitors.map(({ headings, ...rest }) => ({ ...rest, headingCount: headings?.length || 0 })),
    meta: {
      ...o,
      articleTypeName: ARTICLE_TYPES[o.articleType].label,
      lengthName: LENGTHS[o.length],
      model: result.model,
      searchGrounding: CONFIG.useSearch && !CONFIG.mock,
      dataforseo: !!CONFIG.dfs && !CONFIG.mock,
      generatedAt: new Date().toISOString(),
      cached: false,
    },
  };
  await cache.set(key, payload);
  send(res, 200, payload);
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return send(res, 200, await readFile(path.join(__dirname, 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true });
    if (req.method === 'GET' && url.pathname === '/api/config') {
      return send(res, 200, {
        authRequired: !!CONFIG.accessToken,
        mock: CONFIG.mock,
        dataforseo: !!CONFIG.dfs,
        searchGrounding: CONFIG.useSearch && !CONFIG.mock,
        model: CONFIG.mock ? 'demo' : CONFIG.geminiModel,
        countries: Object.fromEntries(Object.entries(COUNTRIES).map(([k, v]) => [k, v.name])),
        languages: LANGUAGES,
        articleTypes: Object.fromEntries(Object.entries(ARTICLE_TYPES).map(([k, v]) => [k, v.label])),
        lengths: LENGTHS,
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/brief') {
      if (!authorized(req)) return send(res, 401, { error: 'Invalid or missing access token.' });
      if (rateLimited(ip)) return send(res, 429, { error: 'Too many requests — please wait a minute.' });
      return await handleBrief(req, res);
    }
    send(res, 404, { error: 'Not found' });
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    console.error(`[${new Date().toISOString()}] ${req.method} ${url.pathname} → ${status}: ${err.message}`);
    if (!res.headersSent) send(res, status, { error: err.message });
  }
});

server.listen(CONFIG.port, () => {
  console.log(`SEO Outline Builder running on http://localhost:${CONFIG.port}`);
  console.log(
    `  Gemini: ${CONFIG.mock ? 'DEMO MODE' : CONFIG.geminiKey ? `${CONFIG.geminiModel}${CONFIG.fallbackModel ? ` (backup: ${CONFIG.fallbackModel})` : ''}${CONFIG.useSearch ? ' + Google Search grounding' : ''}` : 'NOT CONFIGURED'}`
  );
  console.log(`  DataForSEO: ${CONFIG.dfs ? 'enabled' : 'off'} | Access token: ${CONFIG.accessToken ? 'required' : 'off'}`);
});
