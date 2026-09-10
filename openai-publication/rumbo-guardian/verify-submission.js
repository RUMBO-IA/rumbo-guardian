'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { tools } = require('./mcp-contract.js');

const submission = JSON.parse(fs.readFileSync('chatgpt-app-submission.json', 'utf8'));
const reviewer = JSON.parse(fs.readFileSync('openai-publication/rumbo-guardian/REVIEWER_CASES_V1.json', 'utf8'));
const listing = JSON.parse(fs.readFileSync('openai-publication/rumbo-guardian/LISTING_V1.json', 'utf8'));

const names = tools.map((tool) => tool.name);
assert.equal(submission.schema_version, 1);
assert.equal(submission.app_info.display_name, 'RUMBO Guardian');
assert.ok(submission.app_info.subtitle.length <= 30);
assert.deepEqual(Object.keys(submission.tools), names);
for (const tool of tools) {
  const hints = submission.tools[tool.name].annotations;
  assert.equal(hints.readOnlyHint, tool.annotations.readOnlyHint);
  assert.equal(hints.openWorldHint, tool.annotations.openWorldHint);
  assert.equal(hints.destructiveHint, tool.annotations.destructiveHint);
  assert.equal(tool.outputSchema.type, 'object');
}
assert.equal(submission.test_cases.length, 5);
assert.equal(submission.negative_test_cases.length, 3);
assert.ok(submission.test_cases.every((test) => names.includes(test.tools_triggered)));
assert.ok(submission.negative_test_cases.every((test) => test.tools_triggered === null));
assert.equal(reviewer.positive.length, 5);
assert.equal(reviewer.negative.length, 3);
assert.equal(listing.submission_state, 'NOT_SUBMITTED');
assert.equal(listing.availability.state, 'UNSET_FAIL_CLOSED');
console.log('RUMBO_GUARDIAN_SUBMISSION_PACKET_STATIC_PASS');
