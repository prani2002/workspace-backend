# Backend

Express + TypeScript + Mongoose API with cookie auth (JWT + rotating refresh), CSRF, RBAC, idempotency, audit log, metrics, maintenance mode, scheduler and a Google ADK agent service (`agent/`).

```bash
cp .env.example .env          # set JWT_SECRET (openssl rand -base64 48), ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up -d mongo agent   # needs GOOGLE_API_KEY in your shell; or `npm run mock-agent` for an offline agent on :8000
npm install && npm run seed && npm run dev      # http://localhost:4000  (GET /openapi.yaml)
npm run check                 # typecheck + guard + tests
```

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | 32+ chars, per environment |
| `MONGODB_URI` | Atlas or local |
| `CORS_ORIGINS`, `COOKIE_SAMESITE`, `COOKIE_DOMAIN` | Cookie/CORS behaviour (see `.env.example`) |
| `AGENT_URL`, `AGENT_TIMEOUT_MS`, `AGENT_RETRIES` | Agent service |
| `MAINTENANCE_MODE`, `RUN_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS` | Operations |
| `RATE_LIMIT_PER_MIN`, `LOGIN_RATE_LIMIT_PER_15MIN` | Abuse protection |

Endpoints: see `openapi.yaml` (source of truth). Branches: `develop` deploys staging, `main` production (`.github/workflows`).
