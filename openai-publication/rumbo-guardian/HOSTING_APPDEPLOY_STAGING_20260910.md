# RUMBO Guardian MCP — AppDeploy staging receipt — 2026-09-10

## Source binding

Repository: `RUMBO-IA/rumbo-guardian`

GitHub source receipt: `5720a1c752b80f08abf8ac69e908738ec3e4ee31`

Canonical candidate branch at source capture: `fix/mcp-vercel-stateless-adapter-v1`

The AppDeploy staging host mirrors the bounded Guardian MCP source files used by that commit and records the source SHA in the UI and backend health metadata.

## Deployment

App id: `rumbo-guardian-mcp-aaqycs`

Public URL: `https://rumbo-guardian-mcp-aaqycs.v2.appdeploy.ai/`

Deployment state observed from AppDeploy: `ready`

QA snapshot reported zero frontend errors and zero network errors.

Public root readback independently returned title `RUMBO Guardian MCP` and the source receipt `5720a1c752b80f08abf8ac69e908738ec3e4ee31`.

## Provider fallback attempts

Render: service creation blocked before provisioning with HTTP 402 / payment information required.

Railway: project creation blocked because the account trial has expired and a plan is required.

No billing mutation was performed on either provider.

## Conformance boundary

A paid TinyFish browser automation attempt for the three live UI/MCP checks was not started because the connected TinyFish wallet balance was insufficient. This is not treated as a protocol failure.

The public root is proven reachable. Full external POST `/mcp` conformance is still `NOT_PROVEN` until an independent HTTP-capable verifier executes initialize, tools/list, tools/call negative guard, and notification semantics against the public host.

`DEDICATED_STAGING_HOST = PASS`

`PUBLIC_ROOT_HTTPS = PASS`

`SOURCE_SHA_READBACK = PASS`

`HOSTED_MCP_POST_CONFORMANCE = NOT_PROVEN`

`PUBLISHER_SUPPORT_SEMANTIC_GATE = BLOCKED`

`OPENAI_SUBMISSION = NO`

`PRODUCTION = NO_GO`
