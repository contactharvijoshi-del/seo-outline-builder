// Google Gemini client (REST). Uses "Grounding with Google Search" so briefs
// reflect what currently ranks, not just the model's training data.
import { fetchWithRetry } from './http.js';

const BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/models';

export async function generateBrief({ apiKey, model, prompt, useSearch }) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 16384 },
  };
  // Search grounding and strict JSON mode can't be combined, so with grounding
  // we ask for JSON in the prompt and parse it defensively.
  if (useSearch) body.tools = [{ google_search: {} }];
  else body.generationConfig.responseMimeType = 'application/json';

  let res;
  try {
    res = await fetchWithRetry(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if ([400, 401, 403].includes(e.status)) e.message = `Gemini rejected the request — check GEMINI_API_KEY and GEMINI_MODEL. (${e.message})`;
    if (e.status === 429) e.message = `Gemini quota reached — enable billing on the Google Cloud project, or turn off GEMINI_SEARCH_GROUNDING. (${e.message})`;
    throw e;
  }
  const data = await res.json();

  const cand = data.candidates?.[0];
  if (!cand) {
    const reason = data.promptFeedback?.blockReason;
    throw new Error(`Gemini returned no answer${reason ? ` (blocked: ${reason})` : ''}`);
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
  };
}

export function parseJson(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Gemini response did not contain JSON');
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (e) {
    throw new Error(`Could not parse Gemini JSON: ${e.message}`);
  }
}
