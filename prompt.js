// Builds the Gemini prompt from every brief setting plus any real data we gathered
// (DataForSEO SERP/metrics and competitor page structures).

export const ARTICLE_TYPES = {
  ultimate: { label: 'Ultimate Guide', guide: 'Deep, end-to-end topical coverage. Cover every subtopic a searcher could need, from basics to advanced, so this becomes the definitive resource.' },
  howto: { label: 'How-to Guide', guide: 'Actionable step-by-step instructions. Sections follow the order a reader performs the task; include prerequisites, numbered steps, troubleshooting and tips.' },
  listicle: { label: 'Listicle', guide: 'Scannable ranked list. Each H2 is one list item (numbered), with consistent sub-points per item, plus a short intro and a summary/verdict.' },
  comparison: { label: 'Comparison', guide: 'Side-by-side "X vs Y" comparison. Include comparison criteria, a comparison table, who each option suits, and a clear verdict.' },
  review: { label: 'Review', guide: 'In-depth product or tool review. Cover overview, key features, performance/testing, pros and cons, pricing/value, alternatives and a final rating/verdict.' },
  beginner: { label: 'Beginner Guide', guide: 'Fundamental overview for newcomers. Define terms in plain language, avoid jargon, explain why it matters, and end with simple next steps.' },
  casestudy: { label: 'Case Study', guide: 'Real-world data and results. Structure as background, challenge, approach/solution, results with numbers, lessons learned, and how to apply them.' },
};

export const LENGTHS = {
  '500-800': '500–800 words',
  '800-1200': '800–1,200 words',
  '1200-1800': '1,200–1,800 words',
  '1800-2500': '1,800–2,500 words',
  '2500-4000': '2,500–4,000 words',
};

const SHAPE = `{
  "keyword": string,
  "searchIntent": "informational" | "commercial" | "transactional" | "navigational",
  "intentExplanation": string,
  "targetAudience": string,
  "articleType": string,
  "titleOptions": [string, string, string],          // <= 60 characters each
  "metaDescription": string,                          // 140-160 characters
  "slug": string,
  "recommendedWordCount": number,
  "primaryKeyword": string,
  "secondaryKeywords": [string],                      // 8-15
  "outline": [ { "h2": string, "notes": string, "h3": [string], "wordCount": number } ],
  "faqs": [ { "question": string, "answerHint": string } ],   // 5-8
  "competitorInsights": [string],                     // what the top/competitor pages do well
  "contentGaps": [string],                            // what they miss that we should cover
  "ctaPlacement": string,                             // where and how to place the CTA
  "internalLinkIdeas": [string],
  "schemaTypes": [string],                            // e.g. Article, FAQPage, HowTo, Review
  "writerNotes": string
}`;

export function buildPrompt(o) {
  const type = ARTICLE_TYPES[o.articleType];
  const p = [
    `You are a senior SEO content strategist. Create a complete SEO content brief and outline for the target keyword "${o.keyword}".`,
    `Market: ${o.countryName}. Write the entire brief in ${o.languageName}.`,
    `Article type: ${type.label}. ${type.guide}`,
    `Target length: ${LENGTHS[o.length]}. "recommendedWordCount" must fall inside this range, and the per-section "wordCount" values should add up to roughly that total.`,
    `The outline must have exactly ${o.h2Count} H2 sections (not counting a short intro/conclusion, which you may mention in notes).`,
  ];

  p.push(
    o.audience
      ? `Target audience: ${o.audience}. Tailor depth, tone and examples to them.`
      : 'Target audience: not specified — infer the most likely audience from the search results.'
  );
  p.push(
    o.intent === 'auto'
      ? 'Search intent: auto-detect from the current search results and the keyword semantics, and explain your reasoning.'
      : `Search intent: ${o.intent}. Build the outline to satisfy this intent.`
  );
  if (o.brand) p.push(`Brand / website: ${o.brand}. Position the brand naturally where relevant without making the article salesy.`);
  if (o.cta) p.push(`Primary call to action: "${o.cta}". Recommend where and how to place it in "ctaPlacement".`);
  else p.push('No CTA specified — suggest a fitting soft CTA in "ctaPlacement".');

  if (o.useSearch) {
    p.push('Use Google Search to check what currently ranks for this keyword in this market, and use current terminology and authoritative subtopics.');
  }
  if (o.metrics) p.push(`Keyword metrics (DataForSEO): ${JSON.stringify(o.metrics)}`);
  if (o.serp?.topResults?.length) {
    p.push(
      'Current Google top results:\n' +
        o.serp.topResults.map((r) => `#${r.position} ${r.title} — ${r.url}\n   ${r.snippet || ''}`).join('\n')
    );
  }
  if (o.serp?.peopleAlsoAsk?.length) p.push(`"People also ask" questions:\n- ${o.serp.peopleAlsoAsk.join('\n- ')}`);
  if (o.serp?.relatedSearches?.length) p.push(`Related searches:\n- ${o.serp.relatedSearches.join('\n- ')}`);

  const comps = (o.competitors || []).filter((c) => !c.error);
  if (comps.length) {
    p.push(
      'Competitor pages to outrank (structure extracted from the live pages):\n' +
        comps
          .map(
            (c, i) =>
              `Competitor ${i + 1}: ${c.url}\nTitle: ${c.title || '—'}\nMeta: ${c.description || '—'}\nApprox. words: ${c.wordCount}\nHeadings:\n  ${c.headings.join('\n  ') || '—'}`
          )
          .join('\n\n') +
        '\nCover everything they cover, then go further. Base "competitorInsights" and "contentGaps" on these pages.'
    );
  }
  if (o.instructions) p.push(`Additional instructions from the user (follow them): ${o.instructions}`);

  p.push(
    'Use real "People also ask" questions for FAQs where provided.',
    `Respond with ONLY a single JSON object (no markdown, no commentary) in exactly this shape:\n${SHAPE}`
  );
  return p.join('\n\n');
}
