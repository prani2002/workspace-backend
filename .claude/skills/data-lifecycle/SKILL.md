---
name: data-lifecycle
description: Use when adding a collection or any stored personal or business data (retention, deletion, backups, indexes).
---
1. Declare indexes in `src/models.ts`; TTL index for short-lived data, retention job for the rest (`src/jobs/retention.ts`).
2. Update `../docs/DATA_POLICY.md` (field, classification, retention, deletion path).
3. Soft delete first, hard delete in the retention job. Deleting a user must revoke sessions (see `scripts/user-delete.ts`).
4. Never put PII in logs or in agent prompts without redaction.
5. Add a retention test in `tests/platform.test.ts` style (old row deleted, new row kept).
