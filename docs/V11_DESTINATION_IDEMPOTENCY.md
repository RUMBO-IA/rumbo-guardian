# V11 — Destination idempotency and reconciliation

Date: 2026-09-07

## Problem

V10 distinguishes `RESERVED`, `STARTED`, and terminal local execution states, but a crash or network failure after `STARTED` can still leave a remote side effect ambiguous. Blindly retrying that effect can duplicate an external mutation.

## Contract

V11 adds an explicit destination adapter contract for side-effecting tools whose downstream system supports idempotency and lookup/reconciliation.

A destination adapter must declare a stable `adapterId`, `supportsIdempotency: true`, `execute(input, context)`, and `reconcile(context)`.

The dispatcher derives a deterministic idempotency key from authorization id, signed action digest, signed tool binding digest, and adapter id. Adapter identity is also included in the tool binding digest used by the signed action, preventing adapter substitution under the same tool/effect/implementation.

Authorization consumption, execution `RESERVED`, and destination `PENDING` records are committed in one SQLite transaction by `SQLiteExecutionStoreV11`.

## Execution semantics

- the dispatcher atomically claims `RESERVED -> STARTED` before calling the destination adapter;
- `execute()` receives the exact derived idempotency key;
- destination evidence must echo the exact adapter id and idempotency key;
- definitive `SUCCEEDED` or `FAILED` evidence is persisted together with the execution terminal state;
- execute exceptions, malformed/mismatched evidence, and `PENDING`/`UNKNOWN` responses conservatively move local execution to `FAILED_OR_UNKNOWN` while destination state stays `PENDING`;
- none of those uncertain outcomes triggers a blind retry;
- a destination execution still in `STARTED` is treated as potentially live and cannot be reconciled.

A crash after atomic reservation but before `STARTED` remains recoverable. `resumeReserved()` may claim and execute a destination-backed `RESERVED` row only when the exact implementation, adapter, parameter digest, stored idempotency key, and host recovery authority still match. It reuses the original idempotency key and does not mint a new authorization.

## Reconciliation anti-race gate

`reconcileUnknown()` operates only on execution state `FAILED_OR_UNKNOWN` with destination state `PENDING`. It never invokes the mutating `execute()` method; it calls only the adapter's `reconcile()` method and requires a separate host `authorizeReconciliation()` decision.

This is intentionally stricter than reconciling a live `STARTED` row. A concurrent reconciliation against an active mutating request could observe `FAILED` while the original request subsequently succeeds. V11 therefore requires the local execution to stop being considered live first. An adapter exception or uncertain return does this immediately. After an actual process crash, an explicit stale-execution recovery cutoff may classify `STARTED -> FAILED_OR_UNKNOWN`; only then may reconciliation run.

Reconciliation outcomes are:

- `SUCCEEDED` => persist terminal success;
- `FAILED` => persist terminal failure;
- `UNKNOWN` => persist terminal `FAILED_OR_UNKNOWN` evidence;
- `PENDING` => leave execution `FAILED_OR_UNKNOWN` and destination `PENDING`;
- reconciliation exceptions or invalid evidence => leave state unchanged and report uncertainty.

Changed adapter identity or changed tool implementation cannot recover or reconcile an existing execution.

## Exactly-once boundary

V11 does not manufacture exactly-once semantics. It enables duplicate-resistant delivery and post-crash reconciliation only when the destination actually honors the supplied idempotency key and exposes reliable status lookup. Destinations without those properties remain at the V10 uncertainty boundary and require explicit operator reconciliation or a new authorization.

The design follows the distributed-systems constraint that a local transactional outbox cannot atomically commit an unrelated remote side effect; duplicate-safe consumers/destinations must implement idempotency themselves.
