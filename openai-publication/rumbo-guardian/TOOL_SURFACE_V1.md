# RUMBO Guardian — Defensive Tool Surface V1

State: DESIGN_CANDIDATE / NOT_DEPLOYED / NOT_SUBMITTED

## Public tools
- `analyze_url`: analyze one user-supplied URL locally/deterministically where possible; readOnly=true, destructive=false, openWorld=false by default.
- `analyze_text`: inspect user-supplied text for phishing/fraud/impersonation indicators; readOnly=true, destructive=false, openWorld=false.
- `verify_ledger`: verify structure and SHA-256 chain integrity of a supplied Evidence Ledger; readOnly=true, destructive=false, openWorld=false.
- `explain_signal`: explain one previously returned signal/risk factor without taking action; readOnly=true, destructive=false, openWorld=false.

## Explicit exclusions
No autonomous browsing, credential capture, form submission, phishing generation, malware, exploitation, stealth, scanning of third-party systems, account takeover workflows, or destructive actions.

## Evidence contract
Outputs must separate observed indicators from contextual trust and unsupported certainty. Risk scores are advisory evidence summaries, not guarantees that a URL/person/account is safe or malicious.

## Retry and privacy invariants
Calls are idempotent for identical supplied inputs. No background collection, broad host permissions, hidden network crawl, or retention beyond documented product behavior. Any future network-enabled enrichment must be separately annotated as open-world and reviewed before inclusion.