# V15 — Multi-host coordinator

## Purpose

V9–V14 provide durable authorization, replay, execution journaling, destination idempotency and provider-conformance gates. Their remaining structural limit is coordination across independent hosts. A local SQLite writer cannot by itself serialize claims made by multiple machines.

V15 defines the shared-coordinator contract without pretending that an in-process model is a production distributed database.

## Contract

A shared coordinator owns the authoritative execution row. It must provide atomic:

- `reserve(execution)` — creates exactly one execution record;
- `acquireLease(executionId, ownerId)` — grants a lease and a strictly increasing fencing token;
- `renewLease(executionId, ownerId, fencingToken)` — extends only the current lease;
- `markUnknown(executionId, ownerId, fencingToken)` — records an uncertain outcome;
- `complete(executionId, ownerId, fencingToken, result)` — closes the execution only with the current fencing token;
- `reconcileUnknown(executionId, ownerId, fencingToken, result)` — closes an uncertain execution only after external status lookup.

## Fencing

Every successful lease acquisition receives a monotonically increasing fencing token. The token is part of the downstream execution context and is hashed with execution identity to form a `fencingDigest`.

A stale host may still exist after its lease expires, but its old fencing token must be rejected by the coordinator and by any downstream adapter that supports fencing. This prevents a split-brain worker from completing an execution after another host has legitimately acquired a newer lease.

Lease renewal is only accepted for the current owner/token and only while the lease is still valid.

## Recovery semantics

`STARTED`/`LEASED` is intentionally not directly reconcilable. A recovery controller must first establish that the prior owner is no longer active and classify the execution as `FAILED_OR_UNKNOWN`. Only then may `reconcileUnknown()` consult the destination.

A failed reconciliation does not execute the mutation again and does not make the execution terminal.

## Reference PostgreSQL schema

Production multi-host deployments should use a genuinely shared transactional database or consensus-backed coordinator. PostgreSQL is a reference target because row-level locking, unique constraints and transactional compare-and-set can provide the required atomic primitives.

```sql
CREATE TABLE IF NOT EXISTS rumbo_execution_v15 (
  execution_id TEXT PRIMARY KEY,
  action_digest TEXT NOT NULL,
  tool_binding_digest TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  provider_conformance_profile_digest TEXT,
  state TEXT NOT NULL CHECK (state IN ('RESERVED','LEASED','SUCCEEDED','FAILED','FAILED_OR_UNKNOWN')),
  owner_id TEXT,
  fencing_token BIGINT NOT NULL DEFAULT 0,
  lease_until_ms BIGINT NOT NULL DEFAULT 0,
  result_digest TEXT,
  error TEXT,
  version BIGINT NOT NULL DEFAULT 1,
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS rumbo_execution_v15_lease_idx
  ON rumbo_execution_v15(state, lease_until_ms);
```

Lease acquisition must be performed in a transaction that serializes the target row and increments `fencing_token` in the same write. Completion/renewal must use a compare-and-set predicate over `execution_id + owner_id + fencing_token + state`.

## Production boundary

The repository includes an in-memory shared-coordinator model solely for deterministic adversarial tests. It is **not** evidence of multi-host production correctness. A production receipt requires a real shared coordinator exercised by at least two independent processes/hosts, including contention, lease expiry, stale-token rejection and restart recovery.
