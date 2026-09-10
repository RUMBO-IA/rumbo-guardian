# RUMBO Guardian — OpenAI Plugin Submission Control

State: TECHNICAL_AND_PUBLISHER_CONTENT_READY / ACCOUNT_AND_PORTAL_GATES_PENDING / NOT_SUBMITTED / NOT_PUBLISHED

## Public purpose
A narrow defensive-security assistant for user-supplied inputs: analyze suspicious URLs/text locally, explain Guardian signals, and verify supplied Evidence Ledger hash chains.

## Frozen candidate architecture
- Submission type: With MCP / Universal URL.
- Public MCP staging: `https://rumbo-guardian-mcp.val.run/`.
- Protocol: MCP `2025-06-18`.
- Exact tools: `analyze_url`, `analyze_text`, `verify_ledger`, `explain_signal`.
- All four tools are read-only, non-destructive, and closed-world; they do not browse or fetch supplied destinations.
- Hosted tools explicitly declare `securitySchemes: [{ type: "noauth" }]`.
- No credential harvesting, page submission, exploitation, stealth, malware, third-party scanning, autonomous browsing, or external side effects.

## Proven technical gates
- Public HTTPS MCP reachable: PASS.
- Exact four-tool discovery: PASS.
- Tool annotations: PASS.
- Explicit noauth metadata: PASS.
- Unknown-tool guard: PASS.
- Notification semantics (`202` empty): PASS.
- Hostile Origin rejection: PASS.
- Functional parity smoke for all four tools: PASS.
- Independent GitHub Actions hosted conformance: PASS.
- Publisher support semantic verifier: PASS on alternate zero-spend support URL.
- Submission packet: exactly 5 positive + 3 negative reviewer cases.
- Output schemas: present on all four canonical MCP tool descriptors.

## Domain verification readiness
OpenAI domain verification is conditional on the portal presenting a challenge. The candidate exposes `/.well-known/openai-apps-challenge` with fail-closed behavior: no configured token returns an empty 404; when a real token is configured in the canonical Node adapter it returns only that token as plaintext with `Cache-Control: no-store`. No verification token is fabricated or stored in source.

## Publisher surfaces
- Website: `https://rumbo.verso.fans/`.
- Support candidate: `https://rumbo-openai-support.val.run/` — semantic CI PASS.
- Privacy: `https://rumbo.verso.fans/openai-privacy`.
- Terms: `https://rumbo.verso.fans/openai-terms`.
- The original `https://rumbo.verso.fans/openai-support` remains a separate semantic defect and is not represented as fixed.

## Remaining external publication gates
- Apps Management Write access in the publishing OpenAI organization: UNVERIFIED.
- Verified developer/business identity matching the listing: UNVERIFIED.
- Availability countries/regions: UNSET_FAIL_CLOSED; publisher decision required.
- Platform Scan Tools / validation: NOT_EXECUTED.
- Real domain token installation: ONLY IF PORTAL ISSUES CHALLENGE.
- OpenAI review: NOT_EXECUTED.
- Explicit publish after approval: NOT_EXECUTED.

## Budget and authority boundary
`MONEY_SPEND=0` is mandatory. No purchases, billing changes, paid plans, domains, API credits, or auto-recharge are authorized. Technical PASS does not authorize production promotion, OpenAI submission, approval, billing, or publication.
