# Guardian CI — provider-independent Turborepo fallback

Legacy PR #43 targets Vercel CI Beta, which on 2026-11-09 remains unsupported for public GitHub repositories per https://vercel.com/changelog/vercel-ci-no-longer-requires-a-linked-vercel-project (2026-11-03).

This reconciled successor moves *only* the reusable, lockfile-pinned Turborepo workflow to **existing GitHub Actions** on current main. Neither Vercel CI activation nor a linked Vercel project is required or claimed.

- Preserve all existing Guardian CI permissions (`contents: read`), SHA-pinned checkout/setup-node, PR/push triggers and original full `npm test` regression.
- `npm ci --ignore-scripts --no-audit --no-fund` installs the exact dev-only `turbo@2.11.10` lockfile; `npx --no-install` prevents ad-hoc tool downloads at execution.
- Only the existing syntax/check task is executed through Turborepo. All original tests still run separately. Caching is disabled so stale task results cannot hide failures.
- No Vercel `ci` tags, no remote cache token or remote compute, no repository visibility changes, no changed product version, installer, production pipeline, model APIs, billing or secrets.
- This does **not** validate native Vercel CI; that original provider gate remains ineligible until confirmed otherwise.

Historical source: https://github.com/RUMBO-IA/rumbo-guardian/pull/43
