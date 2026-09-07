# OpenAI Agent Reliability Lab — 2026-09-07

## Objective

Turn RUMBO Guardian from a phishing-only portfolio signal into a small, falsifiable agent-safety/reliability experiment that maps to current OpenAI work on Codex Core Agents, API Agents, Agent Post-Training, Agent Safety, Agent Security, Connectors, and Frontier Evals.

This is not an OpenAI internal project and does not claim access to OpenAI private systems. It is an independent public demonstration built from public role descriptions and public developer tooling.

## Public problem signals observed

OpenAI's current public career pages repeatedly emphasize these problems:

- dependable long-running agents that use tools and execute safely;
- identity-, runtime-, and policy-level defenses for agentic systems;
- turning ambiguous production failures into concrete hypotheses, evals, and durable fixes;
- reliable orchestration, sandboxing, observability, cost/latency and production behavior;
- agent safety mechanisms that preserve useful autonomy while preventing unintended consequential actions;
- connectors and software integrations that let agents act across professional tools while respecting user intent and permissions;
- frontier evals/environments that expose failures and convert them into training or product improvements.

Public references checked on 2026-09-07 include Codex Core Agents, AI Systems Engineer — Codex Agents, Frontier Evals & Environments, Agent Safety, and Security Engineer — Agent Security.

## Implemented experiment

`agent-action-gate.js` is the deterministic fail-closed policy layer. V1 established explicit intent/authorization checks. V2 bound authorization to the semantic action using a SHA-256 digest and bounded expiry.

### V3 — signed principal + durable replay consumption

V2 still trusted an authorization envelope without authenticating who produced it, and replay state could be supplied by the caller rather than consumed durably at dispatch time.

V3 adds three separate components:

- `agent-authorization-v3.js` verifies Ed25519 authorization signatures against an out-of-band `keyId -> trusted public key` map. The signed bytes bind `authorizationId`, `actionDigest`, observation time, expiry, and `keyId`.
- `authorization-replay-store.js` implements a local append-only JSONL consumption ledger guarded by an exclusive lock file. Duplicate authorization IDs, lock contention, malformed ledger state, and invalid identifiers fail closed.
- `agent-authorized-dispatch.js` composes policy evaluation, signature verification, and atomic replay reservation before producing an execution ticket. It does not execute the external action itself.

The trust root is intentionally external to the authorization envelope: presenting a different public key inside an action cannot establish trust. The trusted key map must come from operator/runtime configuration.

## Recruited agent roles

1. **Scout** — turns an observed failure into a minimal reproducible case and evidence bundle.
2. **Hypothesis Engineer** — proposes the smallest falsifiable root-cause hypothesis.
3. **Fix Agent** — implements the smallest correction in an isolated branch/sandbox.
4. **Adversarial Auditor** — searches for bypasses, replay problems, authorization confusion, and fail-open behavior.
5. **Evidence Reporter** — records test commands, results, commit identifiers, unresolved gates, and rollback information.

No agent may authorize its own consequential external action. Authorization, policy decision, replay reservation, and execution are separate states.

## Evaluation contract

The deterministic suites cover read-only work, absent intent, exact digest binding, target/purpose/amount mutation, expiry, replay, destructive actions, unsafe secret destinations, spend limits, normalization idempotence, valid signed authorization, invalid signatures, untrusted key IDs, trusted-key substitution, persistent replay across store instances, lock contention, and corrupted replay state.

A future model-backed harness should add prompt injection, malformed structured outputs, tool-result spoofing, cross-agent confused-deputy behavior, and real trace assertions.

## Boundaries

V3 authenticates authorization against configured public keys and durably reserves authorization IDs on a local filesystem, but it is still not a complete security boundary. It does not provision or rotate identity keys, attest the human identity behind a key, solve distributed multi-host consensus, verify real-world destination ownership, sandbox execution, or enforce network/OS policy after an execution ticket is issued.

The lock strategy intentionally fails closed if a lock is left behind after a crash; recovery requires operator inspection rather than unsafe automatic lock breaking.

## Next technical gates

- bind trusted authorizer keys to an authenticated account/principal lifecycle and rotation policy;
- move replay consumption to a transactional shared store for multi-host execution;
- add structured schema validation and property-based fuzzing;
- integrate the V3 dispatcher immediately before actual tool dispatch;
- connect eval cases to the real Agents SDK path with traces;
- add prompt-injection and cross-agent confused-deputy adversarial evals;
- add sandbox/runtime enforcement so a caller cannot bypass the dispatch preflight.
