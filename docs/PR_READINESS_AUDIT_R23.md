# RUMBO PR readiness audit — read-only

Cross-repository GitHub PR triage; no mutation or merge authority. Tests in `tests/test_pr_readiness_audit.py`.

## Commands

```sh
python -m unittest discover -s tests -p 'test_pr_readiness_audit.py' -v
python -m py_compile tools/pr_readiness_audit.py
python tools/pr_readiness_audit.py --org RUMBO-IA --max-prs 50 --max-requests 200
python tools/pr_readiness_audit.py --org RUMBO-IA --all --max-requests 1500 > local-readiness.json
```

Set GITHUB_TOKEN or GH_TOKEN only in an authorized local shell; never paste tokens in chat/PR/CI. The scanner cannot reuse the ChatGPT GitHub connector credential. Standard Python library only.

All GitHub requests are GET and bounded. On 403/transport/rate exhaustion/cap, the report is partial (complete=false, exit 2). Token-visible repositories are not proof of complete org permissions.

Observed check conclusions are not signed exact-HEAD workflow provenance. A green check is GREEN_UNATTESTED, not permission to merge. Duplicate check names are retained, including a failure alongside success. Latest submitted review per reviewer wins. Draft, stacked base, missing checks, failed checks and changed-request reviews are blockers.

After reading checks and reviews, the scanner re-fetches the PR and rejects changes to HEAD SHA, base, draft status, state or update timestamp. This adds one GitHub GET per PR; keep --max-requests high enough for a full 407-PR scan (roughly 1,250 calls before any extra paginated results). A changed PR yields a partial report rather than stale merge-readiness evidence.

Every row reports merge_authorized=false. A separate governed process must establish exact-head checks, branch rules, trusted runners, merge-queue attestations and required reviewer approvals. No production or billing action is implemented.
