# OpenAI Agent Reliability Lab — 2026-09-07

## Objective

Turn RUMBO Guardian from a phishing-only portfolio signal into a small, falsifiable agent-safety/reliability experiment that maps to current OpenAI work on Codex Core Agents, API Agents, Agent Post-Training, Agent Safety, Agent Security, Connectors, and Frontier Evals.

This is not an OpenAI internal project and does not claim access to OpenAI private systems. It is an independent public demonstration built from public role descriptions and public developer tooling.

## Public problem signals observed

OpenAI's current public career pages repeatedly emphasize dependable long-running agents, safe tool execution, identity/runtime/policy defenses, reliable orchestration, agent safety, connectors, and evals that expose failures and turn them into durable fixes.

## Implemented experiment

`agent-action-gate.js` is the deterministic fail-closed policy layer. V1 established explicit intent/authorization checks. V2 bound authorization to semantic action fields using SHA-256 and bounded expiry.

### V3 — signed principal + durable replay consumption

V3 authenticates authorization envelopes with Ed25519 against an out-of-band trusted public-key map, persists authorization consumption in an append-only replay ledger, and requires policy ALLOW + signature verification + successful replay reservation before producing an execution ticket.

### V4 — enforced tool-dispatch boundary + parameter binding

The V3 audit exposed two remaining structural gaps:

1. the authorization digest covered action metadata but not the concrete tool arguments consumed by a handler;
2. V3 produced a ticket but did not own the handler invocation, so there was no single framework-level execution path that necessarily consumed that ticket.

V4 closes both within this harness:

- `agent-action-gate.js` now includes `parametersDigest` in the canonical action payload;
- `agent-tool-dispatcher-v4.js` canonicalizes JSON-like tool input with sorted object keys, rejects cyclic/non-finite/non-plain input, computes SHA-256 over those exact parameters, and injects the digest before V3 preflight;
- the dispatcher derives the effect from the registered tool definition rather than trusting a model/caller-supplied effect;
- any caller-supplied conflicting effect fails closed;
- tool handlers are kept inside a private registry; the public surface exposes only metadata and `dispatch()`;
- the exact input that was hashed is deep-cloned and recursively frozen before being passed to the handler, preventing post-authorization mutation of the caller's original object;
- replay reservation happens before handler invocation, giving at-most-once authorization semantics even if the handler subsequently errors;
- every successful invocation returns a receipt binding tool name, effect, action digest, parameters digest, authorization id, and authorizer key id.

This is the first version in the lab where the authorization path and the actual handler invocation are composed in one module rather than merely producing a preflight ticket.

## Recruited agent roles

1. **Scout** — turns an observed failure into a minimal reproducible case and evidence bundle.
2. **Hypothesis Engineer** — proposes the smallest falsifiable root-cause hypothesis.
3. **Fix Agent** — implements the smallest correction in an isolated branch/sandbox.
4. **Adversarial Auditor** — searches for bypasses, replay problems, authorization confusion, TOCTOU mutation, and fail-open behavior.
5. **Evidence Reporter** — records test commands, results, commit identifiers, unresolved gates, and rollback information.

No agent may authorize its own consequential external action. Authorization, policy decision, replay reservation, and execution remain separate states with a single enforced transition path.

## Evaluation contract

The deterministic suites cover intent, digest binding, target/purpose/amount mutation, expiry, replay, destructive actions, secrets, spend limits, normalization idempotence, signed authorization, key substitution, persistent replay, lock contention, corrupted replay state, unknown tools, effect confusion, unsigned dispatch, parameter mutation, key-order canonicalization, prompt-injection-shaped tool input, handler failure with consumed authorization, unsupported/cyclic input, and handler encapsulation.

A future model-backed harness should add malformed structured outputs, tool-result spoofing, cross-agent confused-deputy behavior, concurrent multi-process dispatch, and trace assertions over a real Agents SDK tool path.

## Boundaries

V4 is still not an OS or network security boundary. Code outside this harness can invoke arbitrary external libraries if it is given those capabilities directly. The design therefore proves enforcement inside the dispatcher abstraction, not universal process confinement.

It also does not provision/rotate human identity keys, attest the real-world person behind a key, solve distributed multi-host replay consensus, verify destination ownership, or provide sandbox isolation.

## Next technical gates

- make the dispatcher the only capability-bearing component inside a sandboxed agent runtime;
- add property-based/schema fuzzing for canonicalization and structured tool calls;
- test concurrent/multi-process replay races against a transactional shared store;
- integrate the same dispatch contract into an OpenAI Agents SDK harness with traces/evals once API credentials/budget are explicitly available;
- add prompt-injection, tool-result spoofing, and cross-agent confused-deputy evals;
- bind trusted authorizer keys to an authenticated account/principal lifecycle and rotation policy.
