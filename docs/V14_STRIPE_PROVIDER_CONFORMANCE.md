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
- pins the origin to `https://api.stripe.com`;
- pins Stripe API version `2026-02-25.clover`;
- refuses HTTP redirects while carrying credentials;
- restricts the transport to PaymentIntent create/retrieve endpoints needed by the suite;
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

## Evidence and provenance

The runner emits a JCS-hashed evidence object containing:

- evidence schema;
- provider ID;
- Stripe API version;
- suite version;
- execution mode;
- random run ID;
- observation time;
- overall PASS/FAIL;
- sanitized per-check metadata.

Execution mode is one of:

- `BEHAVIORAL_MODEL` when an injected transport/model is used;
- `LIVE_STRIPE_TEST_API` only when the runner uses its pinned native-fetch Stripe transport without an injected fetch implementation.

A behavioral-model PASS proves the harness logic only. It is intentionally not promotable through `buildV13Profile()`. Only an in-process PASS produced by the live Stripe transport is eligible for V13 profile construction, and the evidence digest is recomputed before promotion. A copied, fabricated, failed, missing-credential, or modeled result cannot be promoted.

The host process and its native networking implementation remain trusted computing base. V14 is not a network-attestation system; the trusted V13 evaluator must still review/sign the live evidence profile.

## CI strategy

CI uses deterministic in-process Stripe behavioral models and injected fetch implementations. Those runs are labeled `BEHAVIORAL_MODEL` and never claim remote Stripe conformance. The tests verify replay divergence, changed-parameter acceptance, lost-response divergence, wrong-object retrieval, live-mode responses, secret leakage, accessor execution, fabricated/cloned PASS rejection, pinned origin/version, redirect denial and endpoint allowlisting.

The real provider gate remains separate: `STRIPE_SECRET_KEY=sk_test_... npm run conformance:stripe:v14` must run in an authorized secret-bearing environment and its evidence must then be reviewed and signed by the trusted V13 evaluator.

## Boundary

V14 proves that the conformance harness is fail-closed and that it can generate promotable evidence only through its live Stripe test-mode path. Until a live test credential is supplied and the CLI exits PASS with `executionMode: LIVE_STRIPE_TEST_API`, Stripe conformance remains `NOT_PROVEN`.
