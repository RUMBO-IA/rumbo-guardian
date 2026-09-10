# RUMBO No-Spend Resource Policy V1

Status: ACTIVE

## Objective

Advance RUMBO publication and reliability work using only already-connected or free resources. No purchase, billing mutation, paid plan activation, domain purchase, credit purchase, or automatic recharge is authorized by this policy.

## Allowed resources

- GitHub repository, pull requests, issues, and GitHub Actions within existing account limits.
- OpenAI Platform organization/project inspection and existing connected capabilities.
- Existing Vercel Hobby team/projects and read-only deployment/runtime inspection.
- Existing Val Town staging already provisioned for RUMBO Guardian.
- Local/remote Desktop Commander only when transport is actually reachable.
- Existing ChatGPT/OpenAI documentation and public resources.

## Explicitly prohibited

- Adding payment methods.
- Enabling paid plans or trials that require payment.
- Buying domains.
- Purchasing API credits.
- Enabling auto-recharge.
- Creating paid infrastructure.
- Treating a payment-gated provider as available.

## Promotion rules

A resource is usable only when its access state is proven by a successful tool operation. `online`, `configured`, or `created` without a successful readback is not execution evidence.

A deployment is never promoted solely because another RUMBO project is healthy. Repository, commit SHA, endpoint, and runtime identity must match the candidate.

## OpenAI API usage

API-key creation is not itself evidence of spend authorization. No API key is created by this policy unless a separate explicit user request requires it. No paid API call is intentionally initiated under this policy.

## Stop conditions

Stop and record a gate when a provider requires payment, the connected transport times out, identity cannot be verified, or a write would weaken an existing security/ruleset control.

## Current known gates

- Render: payment information required; no service created.
- Railway: trial/plan gate; no project created.
- Desktop Commander: transport/liveness must be proven before remote execution.
- OpenAI publication: account-side publication gates remain separate from technical MCP conformance.
