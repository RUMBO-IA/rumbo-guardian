# OpenAI Agent Reliability Lab — 2026-09-07

## Objective

Turn RUMBO Guardian from a phishing-only portfolio signal into a small, falsifiable agent-safety/reliability experiment that maps to current OpenAI work on Codex Core Agents, API Agents, Agent Safety, Agent Security, Connectors, and Frontier Evals.

This is not an OpenAI internal project and does not claim access to OpenAI private systems. It is an independent public demonstration built from public role descriptions and public developer tooling.

## Public problem signals observed

OpenAI's current public career pages repeatedly emphasize dependable long-running agents, safe tool execution, sandboxing/isolation, identity/runtime/policy defenses, reliable orchestration, and evals that expose failures and turn them into durable fixes. The updated Agents SDK likewise exposes controlled sandbox environments as a first-class execution layer for long-horizon agents.

References checked 2026-09-07:

- https://openai.com/careers/security-engineer-agent-security-san-francisco/
- https://openai.com/careers/software-engineer-codex-core-agents-san-francisco/
- https://openai.com/careers/ai-systems-engineer-codex-agents-san-francisco/
- https://openai.com/index/the-next-evolution-of-the-agents-sdk/
- https://nodejs.org/docs/latest-v22.x/api/permissions.html

## Implemented experiment

`agent-action-gate.js` is the deterministic fail-closed policy layer. V1 established explicit intent/authorization checks. V2 bound authorization to semantic action fields using SHA-256 and bounded expiry.

### V3 — signed principal + durable replay consumption

V3 authenticates authorization envelopes with Ed25519 against an out-of-band trusted public-key map, persists authorization consumption in an append-only replay ledger, and requires policy ALLOW + signature verification + successful replay reservation before producing an execution ticket.

### V4 — enforced tool-dispatch boundary + parameter binding

V4 binds exact canonical tool parameters into the signed action digest, derives effect from the registered tool rather than caller claims, keeps handlers private, freezes the exact hashed input before invocation, consumes authorization before side effects, and emits execution receipts. A second adversarial pass found and fixed a sparse-array canonicalization collision before merge.

### V5 — fail-closed capability confinement contract

V4 still proved enforcement only inside the dispatcher abstraction. Arbitrary code running in the same host process could bypass it if given direct filesystem, network, child-process, or library capabilities.

V5 closes the framework-level capability leak without pretending Node.js itself is a hostile-code sandbox:

- `node-permission-probe-v5.js` measures the concrete host runtime instead of assuming isolation properties. On the repository's Node 22.23.2 baseline, `--permission` blocks ordinary filesystem access, child processes, and workers but does not provide network isolation. The runtime is therefore classified `partial_confinement_only`, never hard sandboxed.
- `agent-capability-runtime-v5.js` refuses arbitrary-code execution when no trusted external sandbox adapter is configured.
- sandbox adapters are trust-rooted out of band by adapter id and require an independent attestation verifier; an adapter cannot establish trust merely by self-reporting an isolation object.
- every execution receives a fresh random nonce. The attestation must bind that nonce and explicitly assert hard, network, filesystem, process, and host-process isolation plus `mediated-only` tool access.
- tool calls from the sandbox cross a JSON-text wire. The host reparses the message and only then routes it through V4. No handler function or host object reference is exposed through the capability interface.
- sandbox results must also cross as JSON text. Host objects, functions, getters, symbols, sparse arrays, cyclic values, non-finite numbers, and non-plain objects are rejected fail-closed.
- direct trusted-host proposals remain available for deterministic tests and integrations, but the untrusted-sandbox boundary itself is wire-only.

This architecture deliberately separates **policy**, **authorization**, **dispatch**, **sandbox trust**, and **execution**. A local Node permission flag that cannot satisfy the full confinement profile is evidence for denial, not a reason to weaken the profile.

## Recruited agent roles

1. **Scout** — turns an observed failure into a minimal reproducible case and evidence bundle.
2. **Hypothesis Engineer** — proposes the smallest falsifiable root-cause hypothesis.
3. **Fix Agent** — implements the smallest correction in an isolated branch/sandbox.
4. **Adversarial Auditor** — searches for bypasses, replay problems, authorization confusion, TOCTOU mutation, host-reference leakage, and fail-open behavior.
5. **Evidence Reporter** — records test commands, results, commit identifiers, unresolved gates, and rollback information.

No agent may authorize its own consequential external action. Authorization, policy decision, sandbox admission, replay reservation, and execution are separate states.

## Evaluation contract

The deterministic suites cover intent, digest binding, target/purpose/amount mutation, expiry, replay, destructive actions, secrets, spend limits, signed authorization, key substitution, persistent replay, lock contention, corrupted replay state, unknown tools, effect confusion, parameter mutation, canonicalization, prompt-injection-shaped tool input, handler failure, sparse arrays, capability absence, untrusted sandbox adapters, nonce mismatch, incomplete isolation claims, missing/failed attestation verification, JSON-only tool mediation, malformed sandbox results, accessors/symbol properties, and a live Node 22 permission-capability probe.

## Boundaries

V5 does **not** implement a kernel/container/hypervisor sandbox inside this repository. It creates a fail-closed trust and capability contract for such a sandbox and refuses to label the current Node 22 permission model as sufficient. Node's own documentation explicitly states its Permission Model is not a security guarantee against malicious code and documents additional bypass/limitation cases.

A production adapter must provide real isolation outside the untrusted process boundary and an independently verifiable attestation. Until such an adapter is connected, arbitrary-code execution remains `DENY` by design.

V5 also does not provision/rotate human identity keys, solve distributed replay consensus, verify destination ownership, or integrate a model-backed Agents SDK path.

## Next technical gates

- implement/connect a real external sandbox adapter with independently verifiable isolation attestation;
- add property-based/schema fuzzing for JSON wire and canonicalization;
- test concurrent/multi-process replay races against a transactional shared store;
- integrate the same dispatch/capability contract into an OpenAI Agents SDK harness with traces/evals once API credentials/budget are explicitly available;
- add prompt-injection, tool-result spoofing, and cross-agent confused-deputy evals;
- bind trusted authorizer keys and sandbox identities to lifecycle/rotation policy.
