# V12 — Trusted destination capabilities

Date: 2026-09-07

## Problem

V11 added destination idempotency keys and reconciliation, but the adapter itself declared `supportsIdempotency: true`. That is a self-asserted capability. A misconfigured or substituted adapter could claim idempotency/reconciliation semantics that the host never approved.

## V12 trust contract

Destination-backed tools are fail-closed by default. A destination adapter can only be registered when the host supplies a matching trusted capability manifest in `trustedDestinationCapabilities`.

A trusted capability binds:

- schema: `rumbo.destination-capability.v1`;
- adapter identity;
- capability version;
- provider protocol version;
- idempotency mode: `destination-key`;
- reconciliation mode: `lookup-by-idempotency-key`;
- explicitly allowed tool implementation IDs.

The adapter must declare the exact provider protocol version. The implementation ID must be allowlisted by the host capability.

Capability manifests use an exact data-only schema. Unknown fields, symbol properties, accessors/getters, sparse/decorated implementation arrays, and non-string implementation entries are rejected. This prevents a newer policy from adding a security-critical field that an older runtime silently ignores and prevents capability evaluation from executing user-supplied accessors.

## Cryptographic binding

The trusted capability is canonicalized with the existing JCS implementation and SHA-256 hashed. `destinationCapabilityDigest` is included in the tool binding digest, which is already included in the action digest covered by the authorization signature.

Changing the host capability version therefore changes the signed action digest. An authorization created under one capability cannot be silently reinterpreted under another.

## Durable binding

For V12 reservations, `SQLiteExecutionStoreV11` persists the capability digest alongside adapter ID and idempotency key in `destination_idempotency`.

Recovery and reconciliation require the currently trusted capability digest to exactly match the persisted digest. This prevents a host policy rotation from reusing an old reservation or ambiguous remote execution under new semantics.

Existing V11 databases are migrated by adding a nullable `capability_digest` column. Legacy rows are not promoted to V12: a V12 recovery/reconciliation request against a row without a capability digest fails closed. The migration from an actual V11-shaped SQLite schema is covered in the V12 test suite.

## Compatibility and downgrade resistance

V11 self-asserted destination semantics remain available only through the explicit compatibility switch:

`allowLegacySelfAssertedDestinationCapabilities: true`

This is not the default and is labeled as legacy in receipts. It exists to preserve reproducibility of the V11 test contract, not as the recommended execution path.

A persisted V12 row cannot be reopened through a legacy dispatcher. If a row has a capability digest and the current dispatcher does not, recovery and reconciliation deny with `destination_capability_downgrade`. Conversely, strict V12 recovery/reconciliation against a legacy row with no digest fails with `destination_capability_binding_missing`.

## Adversarial evaluation

The V12 suite covers:

- destination adapter rejected when no host capability exists;
- trusted capability successful dispatch and persistence;
- provider protocol mismatch;
- untrusted implementation ID;
- unknown manifest field rejection;
- getter/accessor rejection without invocation;
- accessor-backed policy-map rejection without invocation;
- migration from the V11 SQLite destination schema;
- capability-version rotation invalidating an old signed action;
- recovery denied after capability rotation;
- reconciliation denied after capability rotation;
- recovery and reconciliation downgrade attempts through legacy mode;
- explicit legacy mode remains distinguishable from V12;
- discovery/receipt surfaces expose the trusted capability digest/version.

## Boundary

V12 proves host-side policy binding, not provider-side truth. It does not prove that a remote provider actually honors idempotency keys or offers a trustworthy lookup API. A real provider integration must separately validate those claims with provider-specific tests/evidence.

V12 remains single-host coordination. Multi-host execution still requires a shared transactional journal or equivalent distributed uniqueness/state primitive.
