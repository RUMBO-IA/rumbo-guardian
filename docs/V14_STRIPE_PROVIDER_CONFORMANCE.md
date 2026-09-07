# V14 — Stripe provider conformance runner

Date: 2026-09-07

## Purpose

V13 introduced a signed provider-conformance receipt gate but intentionally did not manufacture provider evidence. V14 adds a concrete runner for Stripe test mode so the evidence digest can come from a reproducible remote exercise rather than documentation alone.

## External contract being tested

Stripe documents that all POST requests accept idempotency keys, that the first status/body are saved and replayed for the same key, and that reusing a key with different parameters is rejected. Stripe also documents retrieval of an existing PaymentIntent by ID.

V14 targets API version `2026-02-25.clover` and suite version `rumbo.stripe.payment-intent-idempotency.v14`.

## Safety boundary

The live runner:

- accepts only `sk_test_...` credentials;
- explicitly rejects `sk_live_...`;
- reads the credential only from `STRIPE_SECRET_KEY` in the CLI path;
- never writes or prints the credential;
- never persists response bodies or `client_secret` values;
- records only sanitized metadata and SHA-256 body digests;
- creates PaymentIntents in Stripe test mode only;
- requires every observed successful object to have `livemode=false`.

Without a test credential the CLI emits `LIVE_PROVIDER_NOT_PROVEN` and exits non-zero. That state cannot be converted to a V13 PASS profile.

## Checks

A V14 PASS requires all five checks:

1. `same_key_same_parameters`: identical POST requests under the same idempotency key return the same PaymentIntent ID and exact response-body digest.
2. `same_key_different_parameters_rejected`: the same key with changed parameters returns an idempotency error rather than applying a second semantic request.
3. `lost_response_retry_same_result`: the transport receives the provider response, retains only its SHA-256 digest, deliberately raises a simulated client-side response-loss error, and the retry under the same key must return that exact digest.
4. `retrieve_by_id`: the PaymentIntent returned by the replay test can be retrieved through GET by its ID.
5. `test_mode_only`: all successful observed Stripe objects report `livemode=false`.

The response-loss test is deliberately described as a client-boundary loss simulation, not proof of every possible network partition or provider failure mode.

## Evidence

The runner emits an exact JCS-hashed evidence object containing:

- evidence schema;
- provider ID;
- Stripe API version;
- suite version;
- random run ID;
- observation time;
- overall PASS/FAIL;
- sanitized per-check metadata.

The SHA-256 evidence digest can feed `buildV13Profile()` only if the run is PASS. A failed, missing-credential, or unexecuted live run cannot produce a V13 PASS profile.

## CI strategy

CI uses a deterministic in-process Stripe behavioral model. It does not claim remote Stripe conformance. The model verifies that the runner detects replay divergence, changed-parameter acceptance, lost-response divergence, wrong-object retrieval, live-mode responses, secret leakage, and accessor execution.

The real provider gate remains separate: `STRIPE_SECRET_KEY=sk_test_... npm run conformance:stripe:v14` must run in an authorized secret-bearing environment and its evidence must then be reviewed and signed by the trusted V13 evaluator.

## Boundary

V14 proves that the conformance harness is fail-closed and that it can produce a V13-compatible evidence profile when a real test-mode provider run passes. Until a live test credential is supplied and the CLI exits PASS, Stripe conformance remains `NOT_PROVEN`.
