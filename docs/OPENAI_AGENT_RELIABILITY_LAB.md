# OpenAI Agent Reliability Lab — 2026-09-07

## Objective

Turn RUMBO Guardian from a phishing-only portfolio signal into a small, falsifiable agent-safety/reliability experiment that maps to current OpenAI work on Codex Core Agents, API Agents, Agent Post-Training, Agent Safety, Connectors, and Frontier Evals.

This is not an OpenAI internal project and does not claim access to OpenAI private systems. It is an independent public demonstration built from public role descriptions and public developer tooling.

## Public problem signals observed

OpenAI's current public career pages repeatedly emphasize these problems:

- dependable long-running agents that use tools and execute safely;
- turning ambiguous production failures into concrete hypotheses, evals, and durable fixes;
- reliable orchestration, sandboxing, observability, cost/latency and production behavior;
- agent safety mechanisms that preserve useful autonomy while preventing unintended consequential actions;
- connectors and software integrations that let agents act across professional tools while respecting user intent and permissions;
- frontier evals/environments that expose failures and convert them into training or product improvements.

Public references checked on 2026-09-07:

- https://openai.com/careers/software-engineer-codex-core-agents-san-francisco/
- https://openai.com/careers/ai-systems-engineer-codex-agents-san-francisco/
- https://openai.com/careers/software-engineer-api-agents-san-francisco/
- https://openai.com/careers/agent-post-training-connectors-research-san-francisco/
- https://openai.com/careers/research-engineer-frontier-evals-and-environments-san-francisco/
- https://openai.com/careers/researcher-agent-safety-training-and-evaluations-san-francisco/
- https://openai.com/careers/researcher-agent-safety-oversight-and-system-mitigations-san-francisco/
- https://openai.com/index/the-next-evolution-of-the-agents-sdk/

## Implemented experiment

`agent-action-gate.js` is a deterministic, local, fail-closed policy layer for proposed agent actions. It does not make model calls and does not execute actions. It classifies a proposal as `ALLOW`, `REVIEW`, or `DENY` and records explicit reasons and unresolved gates.

V1 established the baseline: unknown effects fail closed, explicit intent alignment is required, external effects require explicit and fresh authorization, targets/evidence are checked, destructive actions require confirmation, unsafe secret destinations and overspend are denied, and replay signals propagate through compound plans.

### V2 — authorization binding

The V1 audit exposed a concrete confused-deputy/reuse weakness: authorization state was fresh but not cryptographically bound to the semantic action that would later execute. A caller could conceptually reuse a prior authorization after mutating the destination, purpose, effect or purchase amount.

V2 closes that class of bypass by canonicalizing the action and binding authorization to a SHA-256 digest over stable execution-relevant fields:

- action id;
- effect;
- target;
- purpose;
- reversibility;
- secret-handling and trusted-destination state;
- purchase amount and spend limit.

For external effects, an executable authorization now carries a stable `authorizationId`, exact `actionDigest`, and `expiresAt`. The gate independently recomputes the digest in Node.js. If digest verification is unavailable, the action cannot reach `ALLOW`. Target, purpose or amount mutation after approval causes `authorization_action_mismatch` and `DENY`. Expired, overlong or replayed authorization envelopes also deny.

The authorization envelope is intentionally separate from `explicitAuthorization`: a boolean alone is no longer sufficient for execution. This makes the transition from user permission to concrete tool dispatch falsifiable and inspectable.

## Recruited agent roles

For subsequent OpenAI Agents SDK/Codex experiments, use a deliberately small team rather than uncontrolled agent proliferation:

1. **Scout** — turns an observed failure into a minimal reproducible case and evidence bundle.
2. **Hypothesis Engineer** — proposes the smallest falsifiable root-cause hypothesis.
3. **Fix Agent** — implements the smallest correction in an isolated branch/sandbox.
4. **Adversarial Auditor** — searches for bypasses, replay problems, authorization confusion, and fail-open behavior.
5. **Evidence Reporter** — records test commands, results, commit identifiers, unresolved gates, and rollback information.

No agent may authorize its own consequential external action. Authorization and execution are separate states.

## Evaluation contract

The current deterministic suite covers read-only work, absent intent, unbound authorization, exact bound authorization, target/purpose/amount mutation, expired and overlong authorization windows, authorization-id replay, destructive actions, unsafe secret destinations, evidence requirements, stale timestamps, spend limits, legacy replay keys, unknown effects, digest sensitivity, unavailable digest verification, and compound-plan propagation.

A future model-backed harness should add prompt injection, malformed structured outputs, tool-result spoofing, cross-agent confused-deputy behavior, and real trace assertions. Success means the actual tool-dispatch path remains fail-closed and emits inspectable evidence for every consequential decision.

## Boundaries

V2 is still a policy primitive, not a security proof. SHA-256 binds the authorization envelope to the action representation, but V2 does not authenticate the human authorizer, sign authorization envelopes, persist replay state, verify real-world target identity, provide a sandbox, or enforce the decision at an operating-system/network boundary.

Those omissions are explicit gates; they are not implied capabilities.

## Next technical gates

- sign authorization envelopes or bind them to a trusted authenticated principal;
- persist authorization/replay identifiers in an append-only or transactionally protected store;
- add structured schema validation and property-based fuzzing;
- integrate the gate before tool dispatch, not after execution;
- connect eval cases to the real agent path with traces;
- run adversarial tests for prompt injection and cross-agent confused-deputy behavior;
- compare policy precision/recall on synthetic safe vs unsafe agent workflows.
