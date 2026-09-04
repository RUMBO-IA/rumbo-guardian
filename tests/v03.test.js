const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const core = require(path.join(root,'guardian-core.js'));

assert.equal(core.classifyDomain('openai.com',{trusted:['openai.com'],blocked:[]}), 'trusted');
assert.equal(core.classifyDomain('evil.test',{trusted:[],blocked:['evil.test']}), 'blocked');
const blocked = core.analyzeUrl('https://evil.test/login',{trusted:[],blocked:['evil.test']});
assert.ok(blocked.score >= 90);
assert.equal(blocked.domainStatus, 'blocked');

const ranked = core.rankLinks(['https://example.com/','http://198.51.100.10/login','https://safe.example/'],{trusted:['safe.example'],blocked:[]});
assert.equal(ranked.length,3);
assert.ok(ranked[0].score >= ranked[1].score && ranked[1].score >= ranked[2].score);

const html = read('index.html').toLowerCase();
for (const banned of ['gratis','sin suscripción','sin api paga']) assert.ok(!html.includes(banned));
assert.ok(html.includes('rumbo security intelligence'));
assert.ok(html.includes('privacy-first'));
assert.ok(html.includes('private by design'));
assert.ok(html.includes('domainlists'));

const manifest = JSON.parse(read('extension/manifest.json'));
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.ok(manifest.permissions.includes('storage'));
const popup = read('extension/popup.html');
assert.ok(popup.includes('rankedLinks') && popup.includes('trustDomainBtn') && popup.includes('blockDomainBtn'));
console.log('RUMBO Guardian baseline tests: PASS');
