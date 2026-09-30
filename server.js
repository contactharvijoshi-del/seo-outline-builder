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
import { buildPrompt } from './prompt.js';
import { mockBrief } from './mock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;

const CONFIG = {
  port: Number(env.PORT || 3000),
  geminiKey: env.GEMINI_API_KEY || '',
  geminiModel: env.GEMINI_MODEL || 'gemini-3.8-flash',
  useSearch: env.GEMINI_SEARCH_GROUNDING !== 'false',
  dfs: env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD
    ? { login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD }
    : null,
  accessToken: env.APP_ACCESS_TOKEN || '',
  rateLimitPerMin: Number(env.RATE_LIMIT_PER_MIN || 20),
  mock: env.MOCK_MODE === 'true' || process.argv.includes('--demo'),
};

// Markets: DataForSEO location codes (Google Ads geo IDs).
const COUNTRIES = {
  AU: { name: 'Australia', code: 2036 },
  US: { name: 'United States', code: 2840 },
  GB: { name: 'United Kingdom', code: 2826 },
  CA: { name: 'Canada', code: 2124 },
  NZ: { name: 'New Zealand', code: 2554 },
  IN: { name: 'India', code: 2356 },
};
const LANGUAGES = { en: 'English' };

const cache = makeCache(path.join(__dirname, 'cache'), Number(env.CACHE_HOURS ?? 72));
const inFlight = new Map(); // de-duplicates identical concurrent requests

// ---------- helpers ----------
function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

async function readBody(req, limit = 10_000) {
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
  const given = Buffer.from(String(req.headers['x-access-token'] || ''));
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

// ---------- core ----------
async function buildBrief({ keyword, countryKey, languageKey }) {
  const country = COUNTRIES[countryKey];
  const language = LANGUAGES[languageKey];
  const warnings = [];
  let serp = null;
  let metrics = null;

  if (CONFIG.mock) {
    const out = mockBrief(keyword);
    return { ...out, serp, metrics, warnings: ['MOCK_MODE is on — sample data only.'] };
  }
  if (!CONFIG.geminiKey) {
    throw Object.assign(new Error('Server is missing GEMINI_API_KEY. Add it to .env and restart.'), { status: 500 });
  }

  if (CONFIG.dfs) {
    const args = { keyword, locationCode: country.code, languageCode: languageKey, creds: CONFIG.dfs };
    const [s, m] = await Promise.allSettled([getSerp(args), getKeywordMetrics(args)]);
    if (s.status === 'fulfilled') serp = s.value;
    else warnings.push(`SERP data unavailable: ${s.reason.message}`);
    if (m.status === 'fulfilled') metrics = m.value;
    else warnings.push(`Keyword metrics unavailable: ${m.reason.message}`);
  }

  const prompt = buildPrompt({ keyword, country: country.name, language, serp, metrics, useSearch: CONFIG.useSearch });
  const ai = await generateBrief({
    apiKey: CONFIG.geminiKey,
    model: CONFIG.geminiModel,
    prompt,
    useSearch: CONFIG.useSearch,
  });
  return { ...ai, serp, metrics, warnings };
}

async function handleBrief(req, res) {
  const body = await readBody(req);
  const keyword = String(body.keyword || '').trim().replace(/\s+/g, ' ');
  const countryKey = COUNTRIES[body.country] ? body.country : 'AU';
  const languageKey = LANGUAGES[body.language] ? body.language : 'en';

  if (keyword.length < 2 || keyword.length > 120) {
    return send(res, 400, { error: 'Keyword must be between 2 and 120 characters.' });
  }

  const key = cache.key([keyword.toLowerCase(), countryKey, languageKey, CONFIG.geminiModel, CONFIG.mock, !!CONFIG.dfs]);
  if (!body.refresh) {
    const hit = await cache.get(key);
    if (hit) return send(res, 200, { ...hit, meta: { ...hit.meta, cached: true } });
  }

  if (!inFlight.has(key)) {
    inFlight.set(
      key,
      buildBrief({ keyword, countryKey, languageKey }).finally(() => inFlight.delete(key))
    );
  }
  const result = await inFlight.get(key);

  const payload = {
    ...result,
    meta: {
      keyword,
      country: COUNTRIES[countryKey].name,
      language: LANGUAGES[languageKey],
      model: CONFIG.mock ? 'mock' : CONFIG.geminiModel,
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
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/config') {
      return send(res, 200, {
        authRequired: !!CONFIG.accessToken,
        mock: CONFIG.mock,
        dataforseo: !!CONFIG.dfs,
        searchGrounding: CONFIG.useSearch,
        model: CONFIG.geminiModel,
        countries: Object.fromEntries(Object.entries(COUNTRIES).map(([k, v]) => [k, v.name])),
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
    if (!res.headersSent) send(res, status === 429 ? 429 : status, { error: err.message });
  }
});

server.listen(CONFIG.port, () => {
  console.log(`SEO Outline Builder running on http://localhost:${CONFIG.port}`);
  console.log(
    `  Gemini: ${CONFIG.mock ? 'MOCK MODE' : CONFIG.geminiKey ? `${CONFIG.geminiModel}${CONFIG.useSearch ? ' + Google Search grounding' : ''}` : 'NOT CONFIGURED'}`
  );
  console.log(`  DataForSEO: ${CONFIG.dfs ? 'enabled' : 'off'} | Access token: ${CONFIG.accessToken ? 'required' : 'off'}`);
});
