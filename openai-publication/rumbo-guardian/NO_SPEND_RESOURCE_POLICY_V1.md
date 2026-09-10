# RUMBO OpenAI publication — zero-spend resource policy V1

## Hard constraint

`MONEY_SPEND = 0`.

This lane may use only already-connected or free resources. It must not purchase API credits, enable auto-recharge, enter or modify billing information, upgrade a provider plan, buy a domain, authorize a paid deployment, or create any other monetary obligation.

## Allowed execution

- Existing GitHub repositories, branches, pull requests, issues, and Actions already available to RUMBO.
- Existing OpenAI Platform organization/project readback and zero-cost configuration surfaces.
- Existing ChatGPT/Codex/Plugin capabilities included in the user's current access.
- Existing Val Town free-tier/public HTTP resources and other providers only while they remain zero-cost and do not request billing activation.
- Local execution on user-owned hardware when the remote bridge is actually reachable.
- Public documentation and independent HTTP verification.

## Fail-closed rules

1. A provider asking for payment information, plan upgrade, paid credits, or billing activation is a hard stop for that provider.
2. Never treat a trial, credit grant, coupon, or promotional balance as authorization to spend.
3. Never enable auto-recharge.
4. Never convert technical readiness into OpenAI submission, approval, or publication authority.
5. Never fabricate a domain-verification token, publisher identity, geographic availability decision, reviewer credential, or policy attestation.
6. Do not weaken repository identity protections, branch protection, approval rules, or security checks to make a gate pass.

## Current zero-spend surfaces

- Dedicated Guardian OpenAI submission host: Val Town public endpoint, zero spend.
- Dedicated RUMBO OpenAI support surface: Val Town public endpoint, zero spend.
- GitHub Actions independent hosted conformance and publisher-support semantic verification.
- OpenAI Platform target readback: organization `Rumbo`, project `Default project`; billing mutation is not required for the current Guardian submission preparation work.

## Promotion doctrine

`TECHNICAL_PASS != AUTHORIZATION != SUBMISSION != REVIEW_ACCEPTANCE != PUBLICATION`.

The candidate remains fail-closed on Apps Management Write, verified publisher identity, publisher-selected availability, portal Scan Tools/validation, conditional domain challenge, policy attestations, review, and explicit publication.
