# RUMBO PR readiness audit — read-only

Cross-repository GitHub PR triage; no mutation or merge authority. Tests in `tests/test_pr_readiness_audit.py`.

## Commands

```sh
python -m unittest discover -s tests -p 'test_pr_readiness_audit.py' -v
python -m py_compile tools/pr_readiness_audit.py
python tools/pr_readiness_audit.py --org RUMBO-IA --max-prs 50 --max-requests 250
python tools/pr_readiness_audit.py --org RUMBO-IA --all --max-requests 2500 > local-readiness.json
```

Set GITHUB_TOKEN or GH_TOKEN only in an authorized local shell; never paste tokens in chat/PR/CI. The scanner cannot reuse the ChatGPT GitHub connector credential. Standard Python library only.

All GitHub requests are GET and bounded. The GitHub Bearer credential is sent only on the initial API request via an unredirected authorization header; HTTP redirects are refused rather than followed (no token forwarding or redirected response trust). On 403/transport/rate exhaustion/cap, the report is partial (complete=false, exit 2). Malformed JSON payloads and malformed repository, PR (including head), check-run, status and review records fail closed with a partial report rather than an unhandled exception; such failures do not authorize merge. Token-visible repositories are not proof of complete org permissions.

The scanner collects check-runs and classic commit statuses for the exact observed SHA; latest classic status by context wins, while conflicting check-run conclusions remain visible. Missing, nonpositive or repeated check-run IDs across REST pages, missing or inconsistent check-run `total_count`, missing or blank check-run names, and any supplied check-run `head_sha` that contradicts the PR HEAD fail closed. An omitted `head_sha` in an individual check-run is not an exact-HEAD provenance attestation. Observed check conclusions are not signed exact-HEAD workflow provenance. A green check is GREEN_UNATTESTED, not permission to merge. Duplicate check names are retained, including a failure alongside success. Latest submitted review per reviewer wins, keyed by positive integer GitHub user ID when supplied, or case-insensitive login for legacy records lacking an ID; mixing ID-bound and ID-less records for the same login fails closed because account identity is ambiguous. Identity continuity across renamed logins is reliable only when user ID is supplied. Review recency is ordered by timezone-aware UTC instant. Approval-relevant reviews without a valid timezone-aware submission timestamp fail closed. Conflicting review states or commit bindings from the same reviewer at the same instant are rejected as ambiguous instead of relying on REST response order. Draft, stacked base, missing checks, failed checks and changed-request reviews are blockers.

After reading checks, classic commit statuses and reviews, the scanner re-fetches the PR and rejects changes to HEAD SHA, base, draft status, state or update timestamp. At least four API requests per PR are needed (checks, statuses, reviews, readback), plus paginated org and PR listings; a 400-PR scan requires roughly 1,600+ requests before extra pages/retries. Size --max-requests accordingly and preserve complete=false on budget exhaustion. A changed PR yields a partial report rather than stale merge-readiness evidence. Duplicate repository names or PR numbers encountered across REST pages (including case-only repository aliases) also fail closed with `complete=false` and preserve previously collected rows; a shifting paginated view must not inflate a complete audit.

Every row reports merge_authorized=false. A separate governed process must establish exact-head checks, branch rules, trusted runners, merge-queue attestations and required reviewer approvals. No production or billing action is implemented.
