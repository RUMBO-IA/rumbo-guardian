# V15 — distributed execution fencing

V15 defines a shared-store fencing primitive for multi-host execution. A lease is not an authorization and does not by itself guarantee exactly-once effects. Each successful acquisition receives a monotonically increasing fencing token bound to resource, execution and owner identity. Destinations that can enforce version/fencing semantics must reject stale tokens before mutating state.

## Contract

- acquire is mutually exclusive for an active resource lease;
- successful reacquisition after expiry increments the fencing token;
- renew/release/validate require the exact owner, execution and token;
- stale owners cannot execute or reconcile;
- fencing binding is derived with JCS + SHA-256 and can be included in destination evidence;
- leases have an explicit upper TTL bound (`MAX_TTL_MS=300000`);
- the adapter interface is intentionally small so a production implementation can map it to etcd, Postgres, Redis-with-CAS, or another strongly consistent shared store;
- V15 does not claim the in-memory implementation is distributed; it is the deterministic behavioral model used by CI.

## Mutation-boundary requirement

Validating a fencing token immediately before invoking a handler is insufficient: the lease can expire after validation and another host can acquire a newer token while the old handler is still running.

For state-changing destinations, use `createAtomicFencedDestination()` and require the destination's authoritative mutation primitive to return `fencingAccepted=true`. The destination must compare the supplied fencing token atomically with its own current resource version as part of the mutation. A destination that cannot prove this property must fail closed with `fencing_not_enforced_at_mutation_boundary`.

## Security invariant

If host A owns token N and its lease expires, host B may obtain token N+1. Even if host A is still alive and attempts to act, a resource enforcing the token must reject N as stale. This is the fencing property; a lease alone is not sufficient.

The fencing binding is different for every token and includes resource, execution and owner identity, preventing a stale token from being replayed against another execution.

## Boundary

A future production adapter must provide atomic acquisition/renewal/validation from a strongly consistent shared store and must enforce the fencing token at the mutation boundary. The repository's in-memory implementation and deterministic tests do not constitute production multi-host evidence. Production conformance requires at least two independent processes/hosts using the same live shared coordinator and destination, with contention, lease expiry, stale-token rejection, restart recovery and evidence capture.
