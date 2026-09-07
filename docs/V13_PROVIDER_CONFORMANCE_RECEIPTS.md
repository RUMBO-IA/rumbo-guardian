# V13 — Provider conformance receipts

Date: 2026-09-07

## Problem

V12 moved destination idempotency trust from the adapter into a host-managed capability manifest. That still left a different trust gap: a host capability can authorize a protocol that is documented by a provider without proving that our concrete adapter/provider combination was actually exercised.

V13 separates **provider documentation** from **provider conformance evidence**.

## External grounding

Stripe is a concrete candidate for a future live conformance run because its official API documentation states that POST requests accept idempotency keys, repeated requests with the same key return the saved result, parameters are compared for reuse, and PaymentIntents can be retrieved by ID for status inspection.

No Stripe test credential was available in the execution environment used to implement V13. Therefore this version does not claim that Stripe, OpenAI, or any other remote provider was tested live.

## V13 conformance profile

A provider conformance profile binds:

- schema `rumbo.provider-conformance-profile.v1`;
- provider identity;
- adapter identity;
- provider protocol version;
- V12 capability digest;
- conformance suite version;
- evidence digest;
- result `PASS`.

The profile is exact-schema and data-only. Unknown fields, symbols, accessors, non-string field values, or malformed values fail closed. JCS + SHA-256 produces a stable `providerConformanceProfileDigest`.

The profile digest is included in the tool binding digest and is therefore transitively covered by the signed action digest.

## Signed freshness receipt

A separate receipt binds the stable profile digest to a bounded observation window:

- schema `rumbo.provider-conformance-receipt.v1`;
- profile digest;
- observed-at timestamp;
- expires-at timestamp;
- evaluator key ID;
- canonical Ed25519 signature.

The receipt is also exact-schema/data-only: primitive strings are required and accessors or coercion objects are rejected without invoking them. The maximum receipt validity window is seven days. Receipts that are expired, too far in the future, too long-lived, malformed, signed by an untrusted evaluator, or cryptographically invalid fail closed.

A receipt can be renewed without changing the profile digest. This is deliberate: a pending V13 execution may be recovered or reconciled using a new fresh receipt for the exact same tested profile. If the provider, protocol, capability, suite, or evidence digest changes, the profile digest changes and the old execution is not reinterpreted.

## Durable binding

`destination_idempotency` now stores `provider_conformance_profile_digest` alongside the destination capability digest and idempotency key. Older databases migrate by adding the nullable column.

Recovery and reconciliation enforce symmetric bindings:

- persisted V13 + no current conformance => `provider_conformance_downgrade`;
- current V13 + old row without conformance => `provider_conformance_binding_missing`;
- changed profile => `provider_conformance_profile_mismatch`;
- expired/invalid current receipt => fail closed before execute/reconcile.

## Compatibility

V12 behavior without a provider conformance receipt is available only through explicit `allowCapabilityWithoutProviderConformance:true` compatibility mode. V11 self-asserted behavior remains behind its separate explicit legacy switch.

Neither compatibility mode is the V13 default.

## Audit findings fixed before merge

1. The first expiry regression accidentally combined an unavailable destination store with an expired receipt. The oracle was corrected to use a valid signed V13 action and store while moving only the receipt clock.
2. Post-CI static audit found implicit `String(...)` coercions and a pre-validation property read in profile digest calculation. A malicious `toString()` or getter could therefore run during validation. V13 now requires primitive strings, validates before field access, and has a dedicated data-only regression suite proving getters/coercion objects are not executed.

## Boundary

V13 creates a cryptographic and durable gate for real provider evidence; it does not fabricate that evidence. A live provider run must still generate the evidence artifact and have a trusted evaluator sign its digest/profile.

A future Stripe conformance run should at minimum test same-key/same-parameters replay, same-key/different-parameters rejection, lost-response retry behavior, object/status lookup, key retention assumptions, and evidence capture without storing API secrets.

V13 remains single-host for transactional execution state. Multi-host execution still requires shared transactional coordination.
