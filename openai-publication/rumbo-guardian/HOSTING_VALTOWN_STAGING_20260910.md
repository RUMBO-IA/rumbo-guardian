# RUMBO Guardian — Val Town hosting receipt — 2026-09-10

Canonical OpenAI submission val: `sebas1/rumbo-guardian-openai`.

Public MCP endpoint: `https://rumbo-guardian-openai.val.run/`.

Access: public HTTP, no authentication required for the bounded read-only tool surface.

Deployed runtime source receipt: `89cbd20685604a01be8b17a09584a1e7364b4fb0`.

The Val Town implementation is a staging/submission port of the Guardian contract. It is not byte-identical to the GitHub CommonJS runtime; this distinction is deliberate and recorded.

## Independent hosted verification

GitHub Actions `Hosted MCP Conformance` verifies the public endpoint from an independent runner.

Verified behavior includes:
- MCP protocol `2025-06-18`;
- exact four-tool catalog: `analyze_url`, `analyze_text`, `verify_ledger`, `explain_signal`;
- explicit read-only / non-destructive / closed-world annotations;
- explicit `noauth` security scheme;
- `outputSchema` present on all four public tools;
- unknown-tool rejection;
- `notifications/initialized` -> HTTP 202 with empty body;
- hostile Origin -> HTTP 403;
- functional parity smoke for all four tool families;
- domain challenge without a portal-issued token -> HTTP 404 empty body.

Latest exact branch-head verification receipt before this documentation-only update:
- source head `ff85394809bcb24ac5286973eacb286e03b8ebf8`;
- Guardian CI run `34459012192`: SUCCESS;
- Hosted MCP Conformance run `34459012115`: SUCCESS;
- OpenAI Plugin Contract run `34459012164`: SUCCESS.

Publisher support semantic verification is part of the hosted workflow and passes against `https://rumbo-openai-support.val.run/`.

## Zero-spend evidence

`MONEY_SPEND = 0`.

Val Town hosting and the support surface were created with existing free resources. Render was rejected before provisioning by a payment-information gate and Railway by a plan/trial gate; neither caused billing mutation. No API credits, paid plan, domain purchase, or auto-recharge was enabled.

## Remaining gates

`APPS_MANAGEMENT_WRITE = UNVERIFIED_ACCOUNT_GATE`

`PUBLISHER_IDENTITY = UNVERIFIED_ACCOUNT_GATE`

`AVAILABILITY = UNSET_FAIL_CLOSED`

`PORTAL_SCAN_TOOLS = NOT_EXECUTED`

`DOMAIN_CHALLENGE = INSTALL_ONLY_IF_PORTAL_ISSUES_TOKEN`

`POLICY_ATTESTATIONS = NOT_EXECUTED`

`OPENAI_SUBMISSION = NO`

`PUBLISHED = NO`

`PRODUCTION = NO_GO`
