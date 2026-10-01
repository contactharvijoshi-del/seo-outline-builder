// Reads competitor pages the user provides and extracts their title, meta description,
// heading structure (H1–H3) and approximate word count, so the brief can be built to beat them.

const BLOCKED_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.internal$|.*\.local$)/i;

export function cleanUrls(input) {
  const list = Array.isArray(input) ? input : String(input || '').split(/[\s,]+/);
  const out = [];
  for (const raw of list) {
    const s = String(raw).trim();
    if (!s) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s)) continue; // ftp:, javascript:, etc.
    try {
      const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
      if (!/^https?:$/.test(u.protocol) || BLOCKED_HOST.test(u.hostname)) continue;
      if (!out.includes(u.href)) out.push(u.href);
    } catch {
      /* skip invalid */
    }
    if (out.length === 5) break;
  }
  return out;
}

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

async function readPage(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SEOOutlineBuilder/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return { url, error: `page returned ${res.status}` };
    const html = (await res.text()).slice(0, 2_000_000);

    const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    const metaTag =
      html.match(/<meta[^>]+name=["']description["'][^>]*>/i)?.[0] ||
      html.match(/<meta[^>]+property=["']og:description["'][^>]*>/i)?.[0] ||
      '';
    const description = decode(metaTag.match(/content=["']([^"']*)["']/i)?.[1] || '');

    const headings = [];
    for (const m of html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
      const text = decode(m[2]);
      if (text && text.length < 200) headings.push(`H${m[1]}: ${text}`);
      if (headings.length >= 40) break;
    }

    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
    const wordCount = decode(body).split(' ').filter((w) => /\w/.test(w)).length;

    if (!title && !headings.length) return { url, error: 'no readable content (page may block bots or need JavaScript)' };
    return { url, title, description, headings, wordCount };
  } catch (e) {
    return { url, error: e.name === 'TimeoutError' ? 'timed out' : 'could not be reached' };
  }
}

export function fetchCompetitors(urls) {
  return Promise.all(urls.map(readPage));
}
