---
name: add-endpoint
description: Use when adding or changing an HTTP endpoint in the backend (route, validation, OpenAPI, test).
---
1. Confirm the MUST id. Add the operation to `openapi.yaml` first (operationId, `x-scope`, request/response schemas, error responses).
2. Route in `src/modules/<feature>/routes.ts` via `defineRoute` (auth, zod, `idempotent` for create/mutate). Logic in `service.ts`; model in `src/models.ts`.
3. Test in `tests/<feature>.test.ts`: 401, 400/403, happy path (+ replay for idempotent routes).
4. `npm run check`. Then tell the frontend side: `npm run api:sync` there.
