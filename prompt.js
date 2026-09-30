// Builds the Gemini prompt. Real SERP/keyword data (when available) is injected
// so the brief is based on what actually ranks.
const SHAPE = `{
  "keyword": string,
  "searchIntent": "informational" | "commercial" | "transactional" | "navigational",
  "intentExplanation": string,
  "targetAudience": string,
  "titleOptions": [string, string, string],          // <= 60 chars each
  "metaDescription": string,                          // 140-160 chars
  "slug": string,
  "recommendedWordCount": number,
  "primaryKeyword": string,
  "secondaryKeywords": [string],                      // 8-15
  "outline": [ { "h2": string, "notes": string, "h3": [string] } ],
  "faqs": [ { "question": string, "answerHint": string } ],   // 5-8
  "competitorInsights": [string],                     // what the top pages do well
  "contentGaps": [string],                            // what they miss that we should cover
  "internalLinkIdeas": [string],
  "schemaTypes": [string],                            // e.g. Article, FAQPage, HowTo
  "writerNotes": string
}`;

export function buildPrompt({ keyword, country, language, serp, metrics, useSearch }) {
  const parts = [
    `You are a senior SEO content strategist. Create a complete SEO content brief for the target keyword "${keyword}".`,
    `Market: ${country}. Language: ${language}.`,
  ];

  if (useSearch) {
    parts.push('Use Google Search to check what currently ranks for this keyword in this market before writing the brief.');
  }
  if (metrics) {
    parts.push(`Keyword metrics (DataForSEO): ${JSON.stringify(metrics)}`);
  }
  if (serp?.topResults?.length) {
    const top = serp.topResults
      .map((r) => `#${r.position} ${r.title} — ${r.url}\n   ${r.snippet || ''}`)
      .join('\n');
    parts.push(`Current Google top results:\n${top}`);
  }
  if (serp?.peopleAlsoAsk?.length) parts.push(`"People also ask" questions:\n- ${serp.peopleAlsoAsk.join('\n- ')}`);
  if (serp?.relatedSearches?.length) parts.push(`Related searches:\n- ${serp.relatedSearches.join('\n- ')}`);

  parts.push(
    'Build an outline that can outrank the current top results: match the dominant search intent, cover every subtopic they cover, and fill their gaps.',
    'Use the real "People also ask" questions for FAQs where provided.',
    `Respond with ONLY a single JSON object (no markdown, no commentary) in exactly this shape:\n${SHAPE}`
  );
  return parts.join('\n\n');
}
