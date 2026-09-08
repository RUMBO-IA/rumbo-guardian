# V15 — distributed execution fencing

V15 defines a shared-store fencing primitive for multi-host execution. A lease is not an authorization and does not by itself guarantee exactly-once effects. Each successful acquisition receives a monotonically increasing fencing token bound to resource, execution and owner identity. Destinations that can enforce version/fencing semantics must reject stale tokens before mutating state.

## Contract

- acquire is mutually exclusive for an active resource lease;
- successful reacquisition after expiry increments the fencing token;
- renew/release/validate require the exact owner, execution and token;
- stale owners cannot execute or reconcile;
- fencing binding is derived with JCS + SHA-256 and can be included in destination evidence;
- the adapter interface is intentionally small so a production implementation can map it to etcd, Postgres, Redis-with-CAS, or another strongly consistent shared store;
- V15 does not claim the in-memory implementation is distributed; it is the deterministic behavioral model used by CI.

## Security invariant

If host A owns token N and its lease expires, host B may obtain token N+1. Even if host A is still alive and attempts to act, a resource enforcing the token must reject N as stale. This is the fencing property; a lease alone is not sufficient.

## Boundary

A future production adapter must provide atomic acquisition/renewal/validation from a strongly consistent shared store and must enforce the fencing token at the mutation boundary. This module does not manufacture those guarantees for an external destination that ignores the token.
