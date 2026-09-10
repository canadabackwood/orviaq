const crypto = require('crypto');
const { scout } = require('./scout');
const { research } = require('./researcher');
const { strategize } = require('./strategist');
const db = require('../store/db');

function event(agent, title, description, status = 'success', at = new Date()) {
  return { agent, title, description, status, at: at.toISOString() };
}

async function runPipeline(config = {}) {
  const started = Date.now();
  const events = [];
  const warnings = [];

  events.push(event('SCOUT', 'Discovery started', 'Scanning configured web and X sources', 'working'));
  let signals = [];
  const scoutStarted = Date.now();
  try {
    signals = await scout(config);
  } catch (error) {
    warnings.push(`Scout fallback: ${error.message}`);
  }
  const safeSignals = Array.isArray(signals) ? signals : [];
  db.addSignals(safeSignals);
  events.push(event('SCOUT', 'Discovery complete', `${safeSignals.length} ranked signals · ${Date.now() - scoutStarted}ms`));

  const max = Math.max(1, Number(config.maxOpportunities || 5));
  const top = safeSignals.slice(0, Math.min(max, safeSignals.length));
  const opportunities = [];
  events.push(event('RESEARCHER', 'Evidence pass', `Verifying ${top.length} opportunity${top.length === 1 ? '' : 'ies'}`, 'working'));

  for (const signal of top) {
    let r;
    let s;
    try {
      r = await research(signal, config.niche);
    } catch (error) {
      warnings.push(`Research fallback: ${error.message}`);
      r = {
        opportunityTitle: signal.title,
        angle: 'Investigate the signal and explain what changed, why it matters, and what the audience should watch next.',
        whyNow: 'Fresh signal detected by Scout.',
        audience: config.niche || 'Niche audience',
        evidence: [signal.text].filter(Boolean),
        risks: ['Research provider or AI unavailable; verify before publishing.'],
        contentFormats: ['short video', 'thread', 'newsletter'],
        sources: signal.url ? [{ title: signal.title, url: signal.url, snippet: signal.text, source: signal.source }] : []
      };
    }

    try {
      s = await strategize(r, config.niche);
    } catch (error) {
      warnings.push(`Strategy fallback: ${error.message}`);
      s = {
        score: signal.score || 70,
        thesis: r.angle,
        hook: r.opportunityTitle,
        formats: r.contentFormats || ['short video', 'thread', 'newsletter'],
        distribution: ['X', 'YouTube', 'email'],
        monetization: ['sponsorship', 'affiliate', 'owned audience'],
        verificationChecklist: ['verify primary sources', 'check dates', 'review claims before publishing']
      };
    }

    const opportunity = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      signal,
      research: r,
      strategy: s,
      status: 'ready'
    };
    db.addOpportunity(opportunity);
    opportunities.push(opportunity);
  }

  events.push(event('RESEARCHER', 'Evidence complete', `${opportunities.length} opportunities grounded`, 'success'));
  events.push(event('ORVIA BRAIN', 'Strategy ranked', `${opportunities.length} opportunities scored and structured`, 'success'));
  if (warnings.length) events.push(event('SYSTEM', 'Provider fallback used', `${warnings.length} non-blocking warning${warnings.length === 1 ? '' : 's'}`, 'warning'));

  const run = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    signals: safeSignals.length,
    opportunities: opportunities.length,
    status: 'completed',
    warnings,
    events: [
      ...events.filter((item) => item.status !== 'working'),
      event('ORVIA', 'Cycle complete', `${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'} ready`)
    ]
  };
  db.addRun(run);
  return { run, signals: safeSignals, opportunities, warnings };
}

module.exports = { runPipeline };
