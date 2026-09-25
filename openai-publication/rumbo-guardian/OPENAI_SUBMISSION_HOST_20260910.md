# RUMBO Guardian — dedicated OpenAI submission host receipt — 2026-09-10

Zero-spend host created by remixing the verified Val Town staging implementation.

- Val: `sebas1/rumbo-guardian-openai`
- Public endpoint: `https://rumbo-guardian-openai.val.run/`
- Code visibility: public
- HTTP access: public
- Source clone: `sebas1/rumbo-guardian-mcp@main-v8`
- Runtime source receipt: `89cbd20685604a01be8b17a09584a1e7364b4fb0`
- Money spend: `0`

Direct preflight after creation:
- `initialize` => HTTP 200, protocol `2025-06-18`
- `tools/list` => exact tools `analyze_url`, `analyze_text`, `verify_ledger`, `explain_signal`
- all four descriptors expose `securitySchemes: [{"type":"noauth"}]`
- read-only annotations remain explicit

The OpenAI submission docs require a public production MCP Server URL for Universal MCP submissions. This endpoint is now the dedicated portal candidate rather than reusing the staging-labelled URL.

Independent GitHub Actions conformance is required before promotion. Domain verification remains fail-closed until the OpenAI portal actually issues a token.

No OpenAI submission, approval, publication, billing change, paid plan, credit purchase, or auto-recharge change is claimed.
