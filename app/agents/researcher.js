const { searchWeb } = require('../providers/search');
const { generateJSON } = require('../providers/ai');

async function research(signal = {}, niche) {
  const supporting = await searchWeb(`${signal.title || ''} ${niche || ''}`, 5);
  const safeSupporting = Array.isArray(supporting) ? supporting : [];
  const prompt = `You are Orvia's research analyst. Use only the supplied evidence. Never invent facts, quotes, dates, statistics or claims. Return JSON with keys: opportunityTitle, angle, whyNow, audience, evidence, risks, contentFormats. Evidence must contain URLs from the supplied sources.\n\nSIGNAL:\n${JSON.stringify(signal)}\n\nSUPPORTING SOURCES:\n${JSON.stringify(safeSupporting)}`;
  const ai = await generateJSON('Return valid JSON only. Ground every factual statement in the supplied evidence.', prompt);
  if (ai) return { ...ai, sources: safeSupporting };
  return {
    opportunityTitle: signal.title || 'Emerging opportunity',
    angle: 'Investigate the signal and explain what changed, why it matters, and what the audience should do next.',
    whyNow: 'Fresh signal detected by Scout.',
    audience: 'Niche audience',
    evidence: safeSupporting.map(x => x.snippet).filter(Boolean),
    risks: ['Requires human/editorial verification before publication.'],
    contentFormats: ['short video', 'thread', 'newsletter'],
    sources: safeSupporting
  };
}
module.exports = { research };
