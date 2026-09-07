# V11 — Destination idempotency and reconciliation

Date: 2026-09-07

## Problem

V10 distinguishes `RESERVED`, `STARTED`, and terminal local execution states, but a crash or network failure after `STARTED` can still leave a remote side effect ambiguous. Blindly retrying that effect can duplicate an external mutation.

## Contract

V11 adds an explicit destination adapter contract for side-effecting tools whose downstream system supports idempotency and lookup/reconciliation.

A destination adapter must declare:

- stable `adapterId`;
- `supportsIdempotency: true`;
- `execute(input, context)`;
- `reconcile(context)`.

The dispatcher derives a deterministic idempotency key from authorization id, signed action digest, signed tool binding digest, and adapter id. Adapter identity is also included in the tool binding digest used by the signed action, preventing adapter substitution under the same tool/effect/implementation.

Authorization consumption, execution `RESERVED`, and destination `PENDING` records are committed in one SQLite transaction by `SQLiteExecutionStoreV11`.

## Execution semantics

- the dispatcher atomically claims `RESERVED -> STARTED` before calling the destination adapter;
- `execute()` receives the exact derived idempotency key;
- destination evidence must echo the exact adapter id and idempotency key;
- definitive `SUCCEEDED` or `FAILED` evidence is persisted together with the execution terminal state;
- mismatched or malformed evidence is classified `FAILED_OR_UNKNOWN` rather than accepted as success;
- adapter exceptions and `PENDING`/`UNKNOWN` responses never cause a blind retry;
- a `STARTED` + destination `PENDING` execution can only be closed through `reconcileStarted()` or conservative operator classification.

## Reconciliation

`reconcileStarted()` never invokes the mutating `execute()` method. It calls only the adapter's `reconcile()` method and requires a separate host `authorizeReconciliation()` decision.

- `SUCCEEDED` => persist terminal success;
- `FAILED` => persist terminal failure;
- `UNKNOWN` => persist `FAILED_OR_UNKNOWN`;
- `PENDING` => leave the execution `STARTED` and destination `PENDING`;
- reconciliation exceptions or invalid evidence => leave state unchanged and report uncertainty.

Changed adapter identity or changed tool implementation cannot reconcile an existing execution.

## Exactly-once boundary

V11 does not manufacture exactly-once semantics. It only enables duplicate-resistant delivery and post-crash reconciliation when the destination actually honors the supplied idempotency key and exposes reliable status lookup. Destinations without those properties remain in the V10 `FAILED_OR_UNKNOWN` boundary and require explicit operator reconciliation/new authorization.

The design follows the distributed-systems constraint that a local transactional outbox cannot atomically commit an unrelated remote side effect; duplicate-safe consumers/destinations must implement idempotency themselves.
