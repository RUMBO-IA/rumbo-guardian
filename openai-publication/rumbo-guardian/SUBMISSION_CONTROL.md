# RUMBO Guardian — OpenAI Plugin Submission Control

State: PACKAGING_CANDIDATE / NOT_SUBMITTED / NOT_PUBLISHED

## Public purpose
A narrow defensive-security assistant for user-supplied or explicitly authorized inputs: analyze suspicious URLs/text, explain evidence, and verify exported Evidence Ledgers.

## Candidate architecture
- Read-only-first tool surface.
- Suggested tools: analyze_url, analyze_text, verify_ledger, explain_signal.
- No credential harvesting, page submission, exploitation, stealth, malware, or autonomous browsing.
- Deterministic/inspectable evidence remains distinct from contextual trust.
- Skills-only is permitted only if hosting the local engine is unnecessary; otherwise use bounded MCP.

## Required publication gates
- Freeze the minimal defensive tool catalog and annotations.
- Decide skills-only vs MCP from privacy/runtime evidence.
- If MCP: stable HTTPS endpoint + health/readiness + narrow CSP/domains.
- Add listing metadata, logo/screenshots, support/privacy/terms and defensive-use language.
- Add at least 5 positive and 3 negative reviewer cases, including misuse/refusal cases.
- Validate false-positive/false-negative boundaries, retries, MCP Inspector where applicable, ChatGPT E2E and hosted readback.
- Produce exact source/runtime receipt before portal submission.

## Authority boundary
Technical PASS does not authorize third-party scanning, production deployment, OpenAI submission, approval, billing, or publication.