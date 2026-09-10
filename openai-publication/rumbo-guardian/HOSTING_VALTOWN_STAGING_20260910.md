# RUMBO Guardian — Val Town staging receipt — 2026-09-10

Canonical staging val: `sebas1/rumbo-guardian-mcp`

Public MCP endpoint: `https://rumbo-guardian-mcp.val.run/`

Access: `privacy=public`, `httpPrivacy=public`.

Source receipt exposed by the staging server: `c7e1483dcf5a40c2efa0ee6c45b2b91dc534ddc1`.

The Val Town implementation is a staging port/adaptation of the bounded Guardian contract. It is not byte-identical to the GitHub CommonJS runtime.

## Independent hosted verification

GitHub Actions workflow: `Hosted MCP Conformance`.

Run #8 / id `34440140703`: PASS for remote initialize, exact four-tool catalog, read-only annotations, unknown-tool rejection, HTTP 202 empty notification semantics, and hostile-Origin HTTP 403.

Run #12 / id `34440399123`: PASS after adding functional smoke probes.

Functional smoke probes passed:
- `analyze_url("javascript:alert(1)")` => danger + `active_content_scheme`;
- `analyze_text(...)` => nonzero risk with `urgency` + `credentials`;
- `explain_signal("active_content_scheme")` => `supported=true`;
- `verify_ledger({})` => `valid=false`, `reason=missing_history`.

Repository verification on head `ff0ce54fba686b7ab56a81ef6952dc5c1986337b` also passed Guardian CI #174 and OpenAI Plugin Contract #36.

## Superseded hosting observations

AppDeploy remains useful as a public UI staging surface, but independent GitHub Actions received HTTP 403 HTML from its `/mcp` and `/api/mcp` paths. It is therefore not canonical remote MCP hosting evidence.

Render was blocked before provisioning by a payment-information gate. Railway was blocked by an expired-trial/plan gate. Neither caused a billing mutation.

## Classification

`STAGING_HOSTED_CONFORMANCE = PASS`

`HOSTED_FUNCTIONAL_PARITY_SMOKE = PASS`

`BYTE_IDENTICAL_RUNTIME = NO`

`PUBLISHER_SUPPORT_SEMANTIC = BLOCKED`

`OPENAI_SUBMISSION = NO`

`PRODUCTION = NO_GO`
