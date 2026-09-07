# V10 — Crash-aware execution journal

Date: 2026-09-07

## Problem

V9 makes authorization consumption transactional across processes, but authorization is consumed before the external tool handler runs. A process can therefore crash after reservation commit and before (or during) the side effect. Replay protection remains safe, but the system previously could not distinguish a definitely-not-started effect from one that may have started.

## Contract

V10 stores authorization consumption and an execution record in the same SQLite transaction when the replay store supports `consumeWithExecution()`.

Execution states are:

- `RESERVED`: authorization was durably consumed and the execution binding was durably recorded, but no process has claimed the handler invocation. This state is safe to resume without a new signed authorization if the recovery authority approves and the exact tool, implementation id, and parameter digest still match.
- `STARTED`: a process atomically claimed the execution before invoking the handler. After a crash, this state is not automatically retryable because the external effect may already have happened.
- `SUCCEEDED`: the handler returned successfully and the terminal state was persisted.
- `FAILED`: the handler threw and that terminal observation was persisted. It does not prove an external side effect did not partially occur.
- `FAILED_OR_UNKNOWN`: recovery conservatively classified an interrupted/stale `STARTED` execution as outcome-unknown. It is never automatically retried.

## Safety invariants

- authorization consumption and `RESERVED` journal creation are one SQLite transaction;
- execution identity is bound to authorization id, action id/digest, tool, effect, explicit `implementationId`, and parameter digest;
- `RESERVED -> STARTED` is an atomic compare-and-set transition;
- exactly one concurrent process can claim a reserved execution;
- terminal states cannot transition back to `STARTED`;
- resumption requires the exact original implementation id and recomputed parameter digest;
- resumption also requires a host-supplied `authorizeRecovery()` decision; the sandbox is not given that authority;
- `STARTED`, `FAILED`, and `FAILED_OR_UNKNOWN` are never automatically replayed;
- journal finalization failure after a handler return is reported as `FAILED_OR_UNKNOWN`, not falsely as confirmed success.

## Recovery

`resumeReserved()` is a narrow recovery path for executions proven to remain `RESERVED`. It does not mint a new authorization: the original signed authorization was already durably consumed in the same transaction that created the exact execution binding. A recovery policy must still explicitly approve the resume.

`recoverInterruptedStarted(before)` can conservatively move stale `STARTED` rows to `FAILED_OR_UNKNOWN`. This is classification, not retry. Operators or higher-level reconciliation must determine the downstream side effect before any new authorization is issued.

## Exactly-once boundary

V10 does **not** claim exactly-once external effects. SQLite can make the local journal transaction atomic and durable, but it cannot atomically commit an unrelated remote API side effect. Exactly-once behavior requires cooperation from the downstream system, such as a durable idempotency key, transactional destination, or explicit reconciliation protocol.

## Runtime scope

The journal is single-host SQLite coordination. It does not provide distributed consensus across independent hosts or network filesystems. Multi-host deployments need an equivalent shared transactional journal plus destination-level idempotency/reconciliation semantics.
