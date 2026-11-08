'use strict';

const supportUrl = process.env.RUMBO_PUBLISHER_SUPPORT_URL || 'https://rumbo-openai-support.val.run/';
const required = [
  'RUMBO OpenAI Support',
  'sebastian@rumbo.verso.fans',
  'RUMBO Agent Reliability',
  'RUMBO Guardian',
  'RUMBO IA CRM',
  'https://rumbo.verso.fans/openai-privacy',
  'https://rumbo.verso.fans/openai-terms',
  'Do not send passwords',
  'does not claim that any RUMBO plugin has been approved or published by OpenAI'
];
const forbidden = ['Hi there!', "I'm your cool new webpage"];

(async () => {
  const response = await fetch(supportUrl, { redirect: 'error' });
  const body = await response.text();
  const contentType = response.headers.get('content-type') || '';
  if (response.status !== 200) throw new Error(`SUPPORT_HTTP_STATUS:${response.status}`);
  if (!contentType.toLowerCase().includes('text/html')) throw new Error(`SUPPORT_CONTENT_TYPE:${contentType}`);
  const missing = required.filter(token => !body.includes(token));
  const placeholders = forbidden.filter(token => body.includes(token));
  if (missing.length) throw new Error(`SUPPORT_REQUIRED_MARKERS_MISSING:${JSON.stringify(missing)}`);
  if (placeholders.length) throw new Error(`SUPPORT_PLACEHOLDER_CONTENT_PRESENT:${JSON.stringify(placeholders)}`);
  console.log(JSON.stringify({
    publisherSupportSemantic: 'PASS',
    url: supportUrl,
    status: response.status,
    contentType,
    requiredMarkers: required.length,
    placeholders: 0
  }));
})();
