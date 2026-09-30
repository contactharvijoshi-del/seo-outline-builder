// Sample output for MOCK_MODE=true — lets you demo the UI with no API keys and no cost.
export function mockBrief(keyword) {
  return {
    brief: {
      keyword,
      searchIntent: 'informational',
      intentExplanation: 'Searchers want a practical explanation and examples before choosing an option.',
      targetAudience: 'Small-business owners and marketers researching the topic for the first time.',
      titleOptions: [
        `${keyword}: The Complete Guide (2026)`,
        `What Is ${keyword}? Examples, Tips & Mistakes`,
        `${keyword} Explained in Plain English`,
      ],
      metaDescription: `Everything you need to know about ${keyword} — how it works, real examples, common mistakes and a step-by-step plan to get started today.`,
      slug: keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      recommendedWordCount: 1800,
      primaryKeyword: keyword,
      secondaryKeywords: [`${keyword} examples`, `${keyword} tips`, `best ${keyword}`, `${keyword} for beginners`, `${keyword} cost`, `how does ${keyword} work`, `${keyword} checklist`, `${keyword} tools`],
      outline: [
        { h2: `What is ${keyword}?`, notes: 'Define it in 2-3 sentences for a featured-snippet answer.', h3: ['Simple definition', 'Why it matters in 2026'] },
        { h2: `How ${keyword} works`, notes: 'Walk through the process step by step with a diagram.', h3: ['Step 1: Plan', 'Step 2: Execute', 'Step 3: Measure'] },
        { h2: `Real-world examples of ${keyword}`, notes: 'Use 3 short case studies with numbers.', h3: ['Example: small business', 'Example: enterprise'] },
        { h2: 'Common mistakes to avoid', notes: 'Top pages skip this — a clear content gap.', h3: [] },
        { h2: `Getting started with ${keyword}`, notes: 'Actionable checklist with a downloadable template.', h3: ['Checklist', 'Recommended tools'] },
      ],
      faqs: [
        { question: `Is ${keyword} worth it?`, answerHint: 'Yes for most businesses; explain ROI with an example.' },
        { question: `How much does ${keyword} cost?`, answerHint: 'Give price ranges and what drives cost.' },
        { question: `How long does ${keyword} take to show results?`, answerHint: 'Typical timeline and influencing factors.' },
      ],
      competitorInsights: ['Top results use clear definitions near the top', 'Most include a comparison table', 'Strong pages show original data'],
      contentGaps: ['No page covers common mistakes in depth', 'Few give a downloadable checklist', 'Australian-specific examples are missing'],
      internalLinkIdeas: ['Link to your pricing page', 'Link to a related how-to guide', 'Link to a case study'],
      schemaTypes: ['Article', 'FAQPage'],
      writerNotes: 'Sample output from MOCK_MODE — set GEMINI_API_KEY for real briefs.',
    },
    sources: [{ title: 'example.com', url: 'https://example.com' }],
    searchQueries: [keyword],
    usage: null,
  };
}
