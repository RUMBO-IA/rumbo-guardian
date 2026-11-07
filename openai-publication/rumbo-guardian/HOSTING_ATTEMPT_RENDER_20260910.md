# RUMBO Guardian hosting attempt — Render — 2026-09-10

Candidate repository: `RUMBO-IA/rumbo-guardian`

Candidate branch: `fix/mcp-vercel-stateless-adapter-v1`

## Proven local/CI deployability

A portable Node host now exists at `render-server.js` and exposes:

- `GET /healthz`
- `POST /mcp`

The host delegates `/mcp` to the existing bounded MCP HTTP handler and does not introduce a second Guardian policy engine.

TDD evidence:

1. RED head `70a9c55e935dabe449e04bddde3acf956dc7a02c` failed Guardian CI because `render-server.js` did not exist.
2. GREEN implementation added `render-server.js`, `npm start`, syntax coverage, and the real HTTP server regression.
3. Exact-head CI on `ef89b8f8de5b064d41834a11c5489016c52c4a0b` passed both Guardian CI and OpenAI Plugin Contract.

## External hosting attempt

Render workspace: `My Workspace`

Requested service:

- name: `rumbo-guardian-mcp`
- public repository: `https://github.com/RUMBO-IA/rumbo-guardian.git`
- branch: `fix/mcp-vercel-stateless-adapter-v1`
- runtime: Node
- build: `npm run check && npm test`
- start: `npm start`
- plan: free
- region: Virginia
- auto deploy: disabled

Render rejected service creation before provisioning with HTTP 402: payment information is required.

No service was created, no paid resource was provisioned, and no billing mutation was performed.

## Canonical classification

`HOST_CODE = PASS`

`HOSTING_PROVIDER_ACCOUNT_GATE = PAYMENT_INFORMATION_REQUIRED`

`HOSTED_HTTPS_ENDPOINT = NOT_PROVEN`

`OPENAI_SUBMISSION = NO`

`PRODUCTION = NO_GO`
