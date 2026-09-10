'use strict';

const Core = require('../../guardian-core.js');
const Chain = require('../../evidence-chain.js');

const SIGNALS = {
  active_content_scheme: 'The URL uses an active-content scheme such as javascript:, data:, or vbscript: and should not be treated as a normal HTTPS navigation.',
  credentials: 'The supplied text contains credential, password, verification-code, or account-access language.',
  urgency: 'The supplied text contains urgency or pressure language that can increase social-engineering risk.',
  external_redirect_target: 'A recognized redirect parameter points to a different domain; Guardian analyzes the supplied destination locally without fetching it.',
  embedded_credentials: 'The URL embeds user-information before the host, which can obscure the actual destination.'
};

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name}_REQUIRED`);
  if (value.length > 16384) throw new Error(`${name}_TOO_LARGE`);
  return value.trim();
}

async function call(tool, args = {}) {
  if (tool === 'analyze_url') return Core.analyzeUrl(requireString(args.url, 'URL'), {});
  if (tool === 'analyze_text') return Core.analyzeMessage(requireString(args.text, 'TEXT'), 'message', {});
  if (tool === 'verify_ledger') {
    const ledger = args.ledger;
    if (!ledger || !Array.isArray(ledger.history)) return { valid: false, entries: 0, brokenAt: 1, reason: 'missing_history' };
    const result = await Chain.verifyChain(ledger.history);
    return { ...result, rootHash: ledger.history.at(-1)?.entryHash || Chain.GENESIS_HASH };
  }
  if (tool === 'explain_signal') {
    const code = requireString(args.code, 'CODE');
    return { code, explanation: SIGNALS[code] || 'Unknown or unsupported Guardian signal code.', supported: Boolean(SIGNALS[code]) };
  }
  throw new Error('UNKNOWN_TOOL');
}

module.exports = { call, tools: ['analyze_url', 'analyze_text', 'verify_ledger', 'explain_signal'] };
