// Google Gemini client (REST). Uses "Grounding with Google Search" so briefs reflect
// what currently ranks. Retries busy errors and can fall back to a second model.
import { fetchWithRetry } from './http.js';

const BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/models';

async function callModel({ apiKey, model, prompt, useSearch, retries = 3 }) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 16384 },
  };
  // Search grounding and strict JSON mode can't be combined, so with grounding
  // we ask for JSON in the prompt and parse it defensively.
  if (useSearch) body.tools = [{ google_search: {} }];
  else body.generationConfig.responseMimeType = 'application/json';

  const res = await fetchWithRetry(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  }, { retries });
  return res.json();
}

function friendly(e) {
  if (e.quota) {
    e.message = 'Gemini quota reached — this API key has no billing (free tier). Enable billing on its Google Cloud project, or use a paid key.';
  } else if (e.status === 503 || e.status === 500) {
    e.status = 503;
    e.message = "Google's Gemini servers are busy right now (temporary, on Google's side). Please try again in a minute.";
  } else if (e.status === 429) {
    e.message = 'Too many requests to Gemini in a short time. Please wait a minute and try again.';
  } else if ([400, 401, 403].includes(e.status)) {
    e.message = `Gemini rejected the request — check GEMINI_API_KEY and GEMINI_MODEL. (${e.message})`;
  } else if (e.status === 404) {
    e.message = `Gemini model not found — check GEMINI_MODEL. (${e.message})`;
  }
  return e;
}

export async function generateBrief({ apiKey, model, fallbackModel, prompt, useSearch }) {
  let data;
  let usedModel = model;
  try {
    data = await callModel({ apiKey, model, prompt, useSearch, retries: fallbackModel ? 1 : 3 });
  } catch (e) {
    const busy = e.status >= 500 || (e.status === 429 && !e.quota);
    if (!(fallbackModel && busy)) throw friendly(e);
    try {
      usedModel = fallbackModel;
      data = await callModel({ apiKey, model: fallbackModel, prompt, useSearch });
    } catch (e2) {
      throw friendly(e2);
    }
  }

  const cand = data.candidates?.[0];
  if (!cand) {
    const reason = data.promptFeedback?.blockReason;
    throw new Error(`Gemini returned no answer${reason ? ` (blocked: ${reason})` : ''}. Please try again.`);
  }
  const text = (cand.content?.parts || []).map((p) => p.text || '').join('');
  const meta = cand.groundingMetadata || {};

  const seen = new Set();
  const sources = (meta.groundingChunks || [])
    .map((c) => c.web)
    .filter((w) => w?.uri && !seen.has(w.uri) && seen.add(w.uri))
    .map((w) => ({ title: w.title || w.uri, url: w.uri }));

  return {
    brief: parseJson(text),
    sources,
    searchQueries: meta.webSearchQueries || [],
    usage: data.usageMetadata || null,
    model: usedModel,
  };
}

export function parseJson(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Gemini response did not contain a brief. Please try again.');
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error('Gemini returned an incomplete brief. Please try again.');
  }
}
