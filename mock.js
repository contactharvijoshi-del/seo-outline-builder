// Sample output for MOCK_MODE=true / --demo — lets you try the UI with no API keys and no cost.
export function mockBrief(o) {
  const k = o.keyword;
  const parts = ['What is', 'How it works:', 'Key benefits of', 'Choosing the right', 'Common mistakes with', 'Costs and budgeting for', 'Expert tips for', 'Getting started with', 'Alternatives to', 'The future of'];
  const per = Math.round(Number(o.length.split('-')[0]) / o.h2Count) || 200;
  return {
    brief: {
      keyword: k,
      searchIntent: o.intent === 'auto' ? 'commercial' : o.intent,
      intentExplanation: 'Searchers are comparing options before buying, so the page should guide a decision.',
      targetAudience: o.audience || 'First-time buyers researching options',
      articleType: o.articleType,
      titleOptions: [`${k}: The Complete Guide (2026)`, `${k} — Expert Picks & Buying Tips`, `How to Choose the Best ${k}`],
      metaDescription: `Everything you need to know about ${k}: how it works, what to look for, common mistakes and expert tips to choose with confidence.`,
      slug: k.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      recommendedWordCount: Number(o.length.split('-')[1]) - 100,
      primaryKeyword: k,
      secondaryKeywords: [`best ${k}`, `${k} for beginners`, `${k} price`, `${k} reviews`, `how to choose ${k}`, `${k} vs alternatives`, `${k} tips`, `${k} buying guide`],
      outline: Array.from({ length: o.h2Count }, (_, i) => ({
        h2: `${parts[i % parts.length]} ${k}`,
        notes: 'Sample notes — real briefs explain what to cover and why.',
        h3: ['Key point', 'Example'],
        wordCount: per,
      })),
      faqs: [
        { question: `Is ${k} worth it?`, answerHint: 'Yes for most people — explain value with an example.' },
        { question: `How much does ${k} cost?`, answerHint: 'Give price ranges and what drives cost.' },
        { question: `What should beginners look for in ${k}?`, answerHint: 'List 3–4 must-have features.' },
      ],
      competitorInsights: ['Top pages lead with a quick-answer summary', 'Most include a comparison table', 'Strong pages show hands-on testing'],
      contentGaps: ['Few cover total cost of ownership', 'No page has a beginner checklist', 'Local (Australian) pricing is missing'],
      ctaPlacement: o.cta ? `Place "${o.cta}" after the comparison section and again in the conclusion.` : 'Add a soft CTA after the buying-guide section.',
      internalLinkIdeas: ['Link to your product category page', 'Link to a related how-to guide', 'Link to a case study'],
      schemaTypes: ['Article', 'FAQPage'],
      writerNotes: 'Sample output from demo mode — connect a Gemini key with billing for real briefs.',
    },
    sources: [{ title: 'example.com', url: 'https://example.com' }],
    searchQueries: [k],
    usage: null,
    model: 'mock',
  };
}
