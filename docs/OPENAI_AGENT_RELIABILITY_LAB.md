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
- https://openai.com/index/the-next-evolution-of-the-agents-sdk/

## Implemented experiment

`agent-action-gate.js` is a deterministic, local, fail-closed policy layer for proposed agent actions. It does not make model calls and does not execute actions. It classifies a proposal as `ALLOW`, `REVIEW`, or `DENY` and records explicit reasons and unresolved gates.

The V1 experiment checks:

- unknown effects fail closed;
- external side effects require explicit authorization;
- intent mismatch denies the action;
- unverified targets require review;
- high-risk actions require supporting evidence;
- destructive/irreversible actions require fresh confirmation;
- secrets may not flow to an untrusted destination;
- purchase amount may not exceed the explicit spend limit;
- stale authorization requires renewal;
- replay keys prevent duplicate execution;
- a denied/review child action propagates to a compound plan.

## Recruited agent roles

For subsequent OpenAI Agents SDK/Codex experiments, use a deliberately small team rather than uncontrolled agent proliferation:

1. **Scout** — turns an observed failure into a minimal reproducible case and evidence bundle.
2. **Hypothesis Engineer** — proposes the smallest falsifiable root-cause hypothesis.
3. **Fix Agent** — implements the smallest correction in an isolated branch/sandbox.
4. **Adversarial Auditor** — searches for bypasses, replay problems, authorization confusion, and fail-open behavior.
5. **Evidence Reporter** — records test commands, results, commit identifiers, unresolved gates, and rollback information.

No agent may authorize its own consequential external action. Authorization and execution are separate states.

## Evaluation contract

A future model-backed harness should evaluate behavior rather than exact prose. Minimum cases:

- read-only happy path;
- external send without authorization;
- authorized verified send;
- stale authorization;
- irreversible deletion without fresh confirmation;
- secret transfer to an untrusted destination;
- purchase above spend limit;
- unknown action type;
- replay of an already executed action;
- mixed compound plan with one denied child;
- prompt-injected claim that policy checks should be skipped;
- malformed or missing policy fields.

Success means the real execution path remains fail-closed under these cases and produces inspectable evidence for every gate decision.

## Boundaries

This V1 is a policy primitive, not a security proof. It does not authenticate users, cryptographically bind authorization to an action, persist replay state, verify target identity, provide a sandbox, or enforce the decision at an operating-system/network boundary. Those are explicit next gates, not implied capabilities.

## Next technical gates

- bind authorization to action digest + target + purpose + expiry;
- persist replay keys in an append-only or transactionally protected store;
- add structured schema validation and property-based fuzzing;
- integrate the gate before tool dispatch, not after execution;
- connect eval cases to the real agent path with traces;
- run adversarial tests for prompt injection and confused-deputy behavior;
- compare policy precision/recall on synthetic safe vs unsafe agent workflows.
