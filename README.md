# SEO Outline Builder

Enter a target keyword and get a complete SEO content brief: search intent, title options, meta description, H2/H3 outline, FAQs, secondary keywords, competitor insights, content gaps, internal-link ideas and schema types. Export as Markdown or JSON.

## How it gets accurate data

| Layer | What it adds | Required? |
|---|---|---|
| **Google Gemini** (`gemini-3.8-flash`) | Writes the brief | Yes |
| **Grounding with Google Search** | Gemini checks what actually ranks today before writing | On by default |
| **DataForSEO** | Real search volume, keyword difficulty, CPC, live Google top 10, "People also ask", related searches | Optional |

All API keys stay on the server. They are never sent to the browser.

## Run it locally (5 minutes)

1. Install **Node.js 22 or newer** from https://nodejs.org
2. In this folder, copy `.env.example` to `.env`
3. Get a Gemini key at https://aistudio.google.com/apikey and paste it into `GEMINI_API_KEY`
4. Run `npm start` and open http://localhost:3000

Want to see it with no keys? Run `npm run demo` for sample data at zero cost.

## Removing limits ("unlimited" use)

- **Gemini:** the free tier has low daily caps. In Google AI Studio → *Get API key*, open the key's Google Cloud project and **enable billing**. You then pay per use, with far higher limits. Set a budget alert in Google Cloud Billing.
- **Search grounding:** it includes a free daily allowance, after which Google bills per grounded request. Turn it off with `GEMINI_SEARCH_GROUNDING=false` if cost matters more than freshness.
- **DataForSEO:** it's pay-as-you-go with no subscription. Each brief makes 2 calls (SERP + keyword overview). Sign up at https://dataforseo.com and paste the *API login / API password* from the dashboard (not your website login).
- **Cache:** repeat keywords within `CACHE_HOURS` (default 72) are served from `cache/` for free. The **Regenerate** button forces a fresh brief.

Check current prices on each provider's pricing page before rollout.

## Company deployment

Set the variables from `.env.example` in your host's dashboard (don't upload `.env`):

- **Render / Railway:** create a new Node web service from this folder or repo. Start command: `node server.js`
- **Google Cloud Run:** `gcloud run deploy seo-outline-builder --source . --region australia-southeast1 --set-env-vars GEMINI_API_KEY=...` (uses the included Dockerfile)

**Protect it:** set `APP_ACCESS_TOKEN` to a long random string and share it only with staff. Without it, anyone with the URL can spend your API credit. `RATE_LIMIT_PER_MIN` caps usage per user.

Note: on hosts with a temporary filesystem (Cloud Run, Render free tier), the cache resets whenever the server restarts. That's harmless; it only means occasional repeat API calls.

## API (for other company systems)

```
POST /api/brief
Headers: Content-Type: application/json, x-access-token: <APP_ACCESS_TOKEN>
Body:    { "keyword": "boutique hotels brisbane", "country": "AU", "language": "en", "refresh": false }
```

Countries: AU, US, GB, CA, NZ, IN. To add more, edit `COUNTRIES` in `server.js` using DataForSEO location codes.

## Files

- `server.js`: web server, auth, rate limit, cache, orchestration
- `lib/gemini.js`: Gemini + Google Search grounding
- `lib/dataforseo.js`: SERP and keyword metrics
- `lib/prompt.js`: the brief prompt and output shape (edit it to change what the brief contains)
- `public/index.html`: the app UI
