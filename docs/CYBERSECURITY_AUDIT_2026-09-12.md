# RUMBO Guardian Cybersecurity Audit — 2026-09-12

## Scope and authority

Audit target: `RUMBO-IA/rumbo-guardian` canonical `main` at `d21cb5fa531fe07be686bc4d57a559517587e8cb` plus the current GitHub Actions workflows and agent-safety documentation.

This audit authorizes only a reversible candidate branch/PR. It does **not** authorize merge, production deployment, billing changes, credential changes, external provider changes, or relaxation of branch protections.

## Reconciled security baseline

The repository already contains meaningful fail-closed controls:

- local-first Guardian analysis with explicit browser actions and no broad persistent host permissions;
- explainable evidence and a SHA-256 tamper-evident local ledger;
- deterministic agent action policy with intent/effect/target/authorization checks;
- Ed25519-signed authorization envelopes and trusted-key verification;
- durable authorization replay consumption;
- tool/effect/parameter binding before side effects;
- strict structured-input handling and complexity bounds;
- sandbox capability admission that refuses to treat the Node permission model as a hostile-code sandbox;
- destination idempotency, trusted destination capability binding and provider-conformance receipts;
- V15 distributed execution fencing with explicit mutation-boundary enforcement requirements.

The V15 documentation correctly states that the in-memory fencing implementation is only a behavioral model. Production multi-host safety remains `NOT_PROVEN` until a strongly consistent shared coordinator and destination demonstrate contention, expiry, stale-token rejection, restart recovery and evidence capture.

## Confirmed finding SEC-2026-001 — mutable GitHub Actions references

**Severity:** High for CI/CD supply-chain integrity.

`ci.yml` and `pages.yml` referenced third-party GitHub Actions by movable major tags (`@v4`, `@v5`, `@v3`). GitHub's secure-use guidance states that pinning an action to a full commit SHA is the immutable form and recommends least-privilege workflow permissions.

Candidate remediation in `security/github-actions-supply-chain-r1`:

- pin every external action to a verified 40-character commit SHA;
- keep version comments for maintainability;
- set `persist-credentials: false` on checkout because these jobs do not push repository content;
- bound CI/Pages jobs with `timeout-minutes: 15`;
- add `tests/github-actions-supply-chain.test.js` so a future tag-based `uses:` reference fails CI.

Current pin set, resolved from the upstream action repositories on 2026-09-12:

- `actions/checkout` v4 -> `11d5960a326750d5838078e36cf38b85af677262`
- `actions/setup-node` v4 -> `49933ea5288caeca8642d1e84afbd3f7d6820020`
- `actions/configure-pages` v5 -> `983d7736d9b0ae728b81ab479565c72886d7745b`
- `actions/upload-pages-artifact` v3 -> `56afc609e74202658d3ffba0e8f6dda462b719fa`
- `actions/deploy-pages` v4 -> `d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e`

## Confirmed finding GOV-2026-002 — governance is protected but not absolute

`main` is protected and currently requires `verify`, `Analyze (javascript-typescript)` and `Analyze (actions)`. Repository rulesets currently return an empty set. The visible required-status-check protection reports enforcement for `non_admins`; therefore this audit does not claim a cryptographically or policy-enforced no-bypass path for administrators.

Status: `OPEN / HARDENING_REQUIRED`, separate from SEC-2026-001.

## Confirmed finding EVID-2026-003 — assurance-document freshness drift

`SECURITY.md` and `EVIDENCE.md` still describe the public Guardian V1.0.0 security/evidence baseline, while current `main` contains the later agent authorization/dispatch/capability/conformance/fencing chain through V15. This is primarily an assurance/documentation gap, not evidence of a runtime bypass.

Status: `OPEN / DOCUMENTATION_RECONCILIATION_REQUIRED`.

## Agentic-AI threat mapping

Current RUMBO controls align materially with the direction of the OWASP Top 10 for Agentic Applications 2026 and the OWASP Agent Control Standard: actions should be inspectable, traceable, privilege-bounded and runtime-controlled. OpenAI's 2026 prompt-injection guidance likewise emphasizes constraining impact even when malicious external content reaches the model, rather than relying only on input filtering.

RUMBO's existing signed authorization, tool binding, replay defense, capability confinement, destination binding and fencing are therefore the correct architectural direction. Remaining production gates are real external isolation/attestation, lifecycle/rotation of trust roots, shared transactional replay/fencing, adversarial prompt-injection/tool-result/cross-agent evals, and canonical evidence freshness.

References:
- https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- https://genai.owasp.org/resource/agent-control-standard-acs/
- https://docs.github.com/en/actions/reference/security/secure-use
- https://openai.com/index/designing-agents-to-resist-prompt-injection/

## Gate result

`SEC_2026_001_SOURCE_REMEDIATION=IMPLEMENTED_CANDIDATE`
`SEC_2026_001_REMOTE_CI=NOT_YET_PROVEN`
`GUARDIAN_MAIN_PROTECTION=PROVEN_CLASSIC_PROTECTION`
`GUARDIAN_RULESETS=NONE`
`ADMIN_NO_BYPASS=NOT_PROVEN`
`V15_PRODUCTION_MULTIHOST=NOT_PROVEN`
`MERGE=NO_GO`
`PRODUCTION=NO_GO`
