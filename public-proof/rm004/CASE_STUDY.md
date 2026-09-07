# RUMBO RM-004 — Public Technical Case

## Evidence before authority

### Failure mode
Agent systems can emit convincing completion statements that are not bound to sufficient evidence or to an explicit gate policy.

### Control
RUMBO evaluates three surfaces independently:

1. claim;
2. evidence;
3. gate.

### Negative path
Free-form or insufficient evidence remains fail-closed.

Expected classification: `NO_GO / UNPROVEN`

### Positive path
Structured claims + named evidence + coherent gate policy can produce: `GO / PROVEN`

This result is bounded to the evaluated scope.

### Observed semantic runtime
- V1.3.12 + valtown-adapter.2
- runtime IDs: 5/5 PASS
- live acceptance: 29/29 PASS

### Authority boundary
`GLOBAL_PRODUCTION=NO_GO`

This page does not claim global canonical acceptance, production authorization, OpenAI endorsement/approval/certification/employment/publication, or public directory presence without independent readback.
