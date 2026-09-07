# V8 — JCS-bound parameter canonicalization

Date: 2026-09-07

## Problem

The tool parameter digest is embedded in the action digest that is authorized and signed. V7 made the sandbox JSON wire strict, but host-originated parameter objects were still canonicalized by repository-specific logic that did not explicitly reject invalid Unicode. In particular, ECMAScript `JSON.stringify()` can serialize lone UTF-16 surrogates, while RFC 8785 requires a compliant JCS implementation to terminate on invalid Unicode because it can break signature interoperability.

## Standards contract

V8 follows the relevant RFC 8785/JCS requirements for the JSON data subset accepted by this harness:

- I-JSON-compatible data only;
- no NaN or Infinity;
- no lone UTF-16 surrogates in keys or values;
- Unicode is preserved as-is; no normalization;
- ECMAScript/IEEE-754 number serialization via `JSON.stringify(Number)`;
- recursive object property sorting by raw UTF-16 code units;
- array element order preserved;
- no emitted whitespace;
- UTF-8 bytes are used for SHA-256.

The implementation additionally keeps the repository's defensive limits: depth 64, 10,000 nodes, plain data objects only, dense arrays, no symbols/accessors/functions/bigints/cycles.

## Implementation

`jcs-canonicalize-v8.js` implements the bounded canonicalizer. `agent-tool-dispatcher-v4.js` delegates `canonicalize()` and `computeParametersDigest()` to it, so V8 is on the actual authorization path rather than a sidecar verifier. Receipts identify `RUMBO_AGENT_TOOL_DISPATCH_V8_JCS_BOUND`.

## Verification sources

Tests are grounded in RFC 8785 Sections 3.1–3.2 and the public `cyberphone/json-canonicalization` test data. They include the RFC primitive example, UTF-16 property ordering, Unicode non-normalization, IEEE-754 edge values, invalid-surrogate rejection, digest equivalence, limits, and deterministic property-order probes.

## Boundary

This does not claim arbitrary JSON text is JCS-safe by itself; V7 remains the strict parser for sandbox wire text. It also does not create OS isolation or solve distributed replay. A production cross-language implementation should continue validating against broader JCS vectors and maintain the exact runtime/version contract for number serialization.
