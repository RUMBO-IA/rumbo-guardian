# Guardian Product Registry evidence gate — R42

## Reproduced defect
The R40 validator only detected `PASS` and boolean `true` in release evidence. Missing `evidence` blocks and misleading strings such as `VERIFIED`, `PROVEN` and `PENDING` could pass validation. Existing tests covered some optimistic claims but not missing evidence or alternative positive wording.

## Corrective change
The two currently recognized records (historical 1.0.0 and unpromoted DRAFT 1.1.0-rc.1) require exactly the five evidence fields: `sbom`, `provenance`, `install`, `upgrade`, `rollback`. Every field must be the exact string `NOT_PROVEN` until independent, authorized evidence and an explicit contract version for promotion are created. Unknown, missing or overstated evidence fails CI. Negative mutation coverage includes missing blocks, malformed types, unknown keys and misleading values.

The historical source and artifact SHA references are *recorded receipts*, not independent byte/hash verification in this change. No approval, promotion, installer execution, Vercel CI activation, permissions change or production authorization.

## Independent governance gate
GitHub issue #35 remains open. The connected GitHub App returns 403 on branch-protection details and cannot prove that code-owner approval or admin bypass are configured. Do not represent source/test success as enforcement of admin protection.

Origin: https://github.com/RUMBO-IA/rumbo-guardian/issues/35
