# Backend (Express + TypeScript + Mongoose; `agent/` = Python Google ADK)
Rules here add to the workspace CLAUDE.md (scope law, token rules, no guessing). Contract: `openapi.yaml`.

Run: `npm run dev` · `npm run check` (types+guard+tests) · `npm run seed` · `docker compose up -d mongo agent` · offline agent: `npm run mock-agent`
Layout: `src/modules/<feature>/{routes.ts,service.ts}` · `src/models.ts` · `src/http/` (middleware, defineRoute, idempotency) · `src/lib/` · `src/jobs/` · `agent/<name>/` · `tests/`

## Rules
1. Routes only through `defineRoute()` in `src/modules/*/routes.ts`: set `scope` (MUST id), `auth`, zod `body`/`query`, and add the operation to `openapi.yaml` with the same `x-scope`. `npm test` + `npm run guard` fail otherwise. New slice: `node scripts/new-feature.mjs Mx slug` (from the workspace root).
2. Handlers stay thin. Logic in `service.ts`. DB only through models in `src/models.ts` (declare indexes there).
3. Errors: throw `HttpError` helpers (`src/http/errors.ts`). Never hand-write 500s, never leak stack traces or internals. Shape is always `{error:{code,message,requestId}}`.
4. Create/mutate endpoints: `idempotent: true`. Anything slower than ~10 s is a job (`src/lib/scheduler.ts`) or queue, not a request.
5. Auth is cookie-based (httpOnly + CSRF header). Protect with `auth: 'user' | { roles: [...] }`. Never log secrets or PII.
6. Every collection needs a retention rule: update `src/jobs/retention.ts` and `../docs/DATA_POLICY.md`.
7. External calls need timeout + capped retries + a typed error (pattern: `modules/agents/client.ts`).
8. New agent: folder in `agent/`, entry in `modules/agents/registry.ts` (zod schema), 6+ cases in `agent/evals/cases.json`. Agents are read-only; risky actions are proposals for human approval.
9. New env var: `src/config.ts` (zod) + `.env.example` + RUNBOOK table. Secrets never in code.
10. Tests (vitest + supertest + in-memory Mongo, `tests/helpers.ts`): every route covers 401, 403 or 400, and the happy path.
11. No new dependency without user approval (`node scripts/dep.mjs approve backend <pkg>`).
