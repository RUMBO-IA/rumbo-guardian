# V7 — Strict JSON Wire Contract

Date: 2026-09-07

## Problem

V6 used native `JSON.parse` at the sandbox/tool wire boundary. Native parsers commonly accept duplicate object names with last-value-wins behavior, so the same wire text can be interpreted differently by another implementation or by validation/signing layers. That is unsafe for a cross-language authorization boundary.

RFC 8785 JSON Canonicalization Scheme constrains inputs to I-JSON and explicitly requires that JSON objects do not contain duplicate property names. V7 adopts that property for the RUMBO Guardian sandbox/tool wire.

## Implementation

`strict-json-wire-v7.js` is a dependency-free recursive-descent JSON parser for security-boundary messages. It:

- rejects duplicate object keys after escape decoding, including aliases such as `"a"` and `"\\u0061"`;
- creates null-prototype objects so `__proto__` is data, not prototype mutation;
- rejects malformed JSON, non-finite numeric results, and unpaired UTF-16 surrogates;
- preserves JSON strings without Unicode normalization;
- enforces 1 MiB, depth 64, and 10,000-node budgets;
- returns only JSON data primitives, arrays, and null-prototype objects.

`agent-capability-runtime-v5.js` now routes both sandbox tool proposals and sandbox results through this parser before host-side dispatch or result handling. Runtime policy version is `RUMBO_AGENT_CAPABILITY_RUNTIME_V7_STRICT_WIRE`.

## Evaluation

`tests/strict-json-wire-v7.test.js` covers direct/nested/escape-equivalent duplicate keys, prototype-pollution-shaped keys, malformed JSON, unpaired surrogates, depth/node/byte limits, runtime integration, 500 deterministic valid-message fuzz round-trips, and 100 duplicate-key probes.

## Boundary

This is a strict JSON parser and wire ambiguity control, not a complete implementation of RFC 8785 canonical serialization. V4 action-parameter hashing remains the repository's existing deterministic canonicalizer. Cross-language production use should either verify that canonicalizer against JCS vectors or migrate signed payloads to a fully specified canonical encoding.

This change does not create OS-level hostile-code isolation. Arbitrary-code execution remains fail-closed unless a trusted external sandbox adapter and independent attestation are present.
