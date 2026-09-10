const { generateJSON } = require('../providers/ai');

async function strategize(research = {}, niche) {
  const result = await generateJSON(
    'You are Orvia Brain, a ruthless but responsible media strategist. Do not fabricate facts. Produce practical content decisions grounded in the research record.',
    `Create a content opportunity plan for the niche ${niche || 'general audience'}. Return JSON: score (0-100), thesis, hook, formats (array), distribution (array), monetization (array), verificationChecklist (array). Research: ${JSON.stringify(research)}`
  );
  if (result && typeof result === 'object') return result;
  return {
    score: 70,
    thesis: research.angle || research.opportunityTitle || 'Emerging opportunity',
    hook: research.opportunityTitle || 'A signal worth watching',
    formats: Array.isArray(research.contentFormats) ? research.contentFormats : ['short video', 'thread', 'newsletter'],
    distribution: ['X', 'YouTube', 'email'],
    monetization: ['sponsorship', 'affiliate', 'owned audience'],
    verificationChecklist: ['verify primary sources', 'check dates', 'review claims before publishing']
  };
}
module.exports = { strategize };
