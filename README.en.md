# MCP-Proxy-Service

English | [한국어](./README.md)

**REST API → MCP conversion platform.** Feed it a REST API document (OpenAPI URL/file, or unstructured
HTML/PDF/Markdown) and it automates the whole flow: analyze → normalize → generate & deploy a
**zero-code (proxy-by-spec) MCP server** → emit a client registration guide.

> **Core invariant**: runtime code is fixed. Behavior is determined solely by the **OpenAPI spec + manifest**
> (exposed operations, auth, field policy). Zero per-API custom code. Design doc: [`.doc/PRD-Adv-2nd.md`](./.doc/PRD-Adv-2nd.md).

## Features

- **Declarative proxy**: onboard a new API by swapping the per-API manifest — one shared runtime
- **OpenAPI → MCP tool auto-mapping**: `$ref` resolution, parameter/requestBody merge, single input-schema synthesis
- **Automatic risky-endpoint exclusion**: blocks `/admin`·`/internal`·sensitive tags·`DELETE` (reason recorded)
- **Agent-friendly response reduction**: field filter (`fields`/allow-list), forced pagination, long-string truncation, nesting-depth cap
- **Auth**: securitySchemes parsing (apiKey/Bearer/Basic/OAuth2/OIDC), header/query/cookie injection, secrets via external reference (`${ENV}`·`secretRef`)
- **Structured errors**: `INVALID_API_KEY`·`MISSING_SCOPE`·`AUTH_EXPIRED`·`UPSTREAM_AUTH_UNAVAILABLE`·`TIMEOUT`
- **Two transports**: stdio (local host) + Streamable HTTP/SSE (remote·multi-agent) + `/health`
- **HTML API doc auto-handling** *(P1)*: URLs returning Swagger UI / Redoc HTML can be registered directly — spec auto-extracted via 3-stage discovery: ① JS `url: "..."` pattern → ② `<a href>` JSON/YAML links → ③ 8 common origin paths (`/openapi.json`, `/v3/api-docs`, etc.)
- **Unstructured extraction**: LLM draft + static validation + confidence/unresolved (Python)

## Layout

| Path | Role |
|------|------|
| `apps/api` | Zero-code Proxy MCP runtime (stdio + Streamable HTTP/SSE) |
| `apps/web` | Conversion platform UI (Next.js) |
| `packages/manifest` | manifest schema·validation·policy (zod) |
| `packages/converter` | OpenAPI normalization·mapping·metadata·auth parsing |
| `packages/extractor` | Unstructured-doc extraction orchestration (TS) |
| `python/extractor` | LLM spec-extraction batch·static validation (FastAPI/uv) |
| `test/` | Test scenarios·suites·results ([SCENARIOS](./test/SCENARIOS.md) · [RESULTS](./test/RESULTS.md)) |

Stack: node-next-nest (pnpm monorepo) + Python (uv). Standard details: [`AGENTS.md`](./AGENTS.md).

## Getting started

```bash
make install   # pnpm install + uv sync
make dev       # full dev (parallel)
make seed      # apply apps/web/seed/*.json (accounts·docs·usage) to DB (idempotent)
make up        # docker compose (postgres + redis + services)
```

### Run the proxy runtime

```bash
# stdio (Claude Desktop / Cursor)
TRANSPORT=stdio SPEC_PATH=spec.json MANIFEST_PATH=manifest.json node apps/api/dist/main.js

# HTTP/SSE (remote·multi-agent)
TRANSPORT=http PORT=8080 SPEC_PATH=spec.json MANIFEST_PATH=manifest.json node apps/api/dist/main.js
curl localhost:8080/health
```

### Manifest example

```json
{
  "name": "petstore",
  "baseUrl": "https://api.example.com/v1",
  "runtimeAuthPolicy": { "secretRef": "PETSTORE_API_KEY" },
  "fieldsPolicy": { "defaultLimit": 20, "truncateBytes": 2048, "maxDepth": 4 },
  "exclude": ["/internal"]
}
```

Never store plaintext secrets in the manifest — use `secretRef` (env key) or `${ENV}` references only.
The runtime rejects manifests that look like they contain a plaintext secret.

## Web auth & workflow (apps/web)

Signup·login·TOTP(2FA)·**org-based RBAC & approval workflow**. Roles: **SUPERVISOR** (default admin) > **ADMIN** > **USER**.
SUPERVISOR is auto-created once on first boot from `.env`. Built on: bcrypt · otplib(QR) · jose(JWT) · `node:sqlite` (builtin).

**Signup·approval chain**
- ADMIN signup → **creates an Organization** (dup-check) → `pending` → **SUPERVISOR approves** → `active`
- USER signup → **searches an org** (text input) → `pending` → that org's **ADMIN approves** → `active`
- Both must be `active` for normal use. SUPERVISOR can change role/status directly.

**API doc (OpenAPI) registration·approval** (PRD §4.1 A1) — **two modes**
- ① **Schema link**: register an OpenAPI URL (e.g. `…/openapi.json`, `…/v3/api-docs`)
  - **HTML response auto-handling** (P1): URLs returning Swagger UI / Redoc HTML are supported. 3-stage auto-discovery: ① JS `url: "..."` pattern → ② `<a href>` JSON/YAML links → ③ 8 common origin paths (`/openapi.json`, `/v3/api-docs`, etc.). If all fail, returns a descriptive error prompting for the direct spec URL.
- ② **Per-endpoint**: add individual REST endpoints (method+path) one by one (Swagger-style) → OpenAPI spec auto-synthesized. `{param}` in the path becomes a path parameter automatically.
- Common: USER **creates·edits·deletes** (any change → `pending`) → ADMIN/SUPERVISOR **reviews the request** (URL fetch/synthesis + conversion preview) → **approve** if normal / **reject** with reason. ADMIN = same org, SUPERVISOR = all.
- **Auto-launch proxy on approval**: on approve → **auto-assign a free port ≥20000** (excludes duplicates and OS-in-use ports, persisted in DB) → write spec.json·manifest.json then **auto-spawn** `apps/api/dist/main.js` with `TRANSPORT=http`. Auto-stopped on reject/edit/delete; **reconciled** (restarted, reusing the stored port) for approved docs on web boot. Status at `GET /api/apidocs/:id/proxy`. → no manual run needed for "Server disconnected".
- **Post-approval MCP guide**: "Guide" in the doc list → **dynamically generated** from the registered baseUrl·port + **live proxy status** (running ✓). Copy manifest.json · mcp.json(stdio) · HTTP run/config + download the spec. Clients connect to the proxy port. Claude Desktop doesn't accept `{url}` → **`mcp-remote` bridge** (stdio command) form; Cursor and other HTTP-native clients get the `{url}` form — both provided.

**Endpoints**: `/api/auth/{register,login,me,totp/qr,totp/enable}` · `/api/orgs/{check,search}` ·
`/api/users`(list)·`/api/users/:id/{approve,reject}`·`PATCH /api/users/:id`(SUPERVISOR role·status / ADMIN org-USER status) ·
`/api/apidocs`(CRUD)·`/api/apidocs/:id/{preview,approve,reject,openapi.json}`·`/api/apidocs/:id/endpoints`(per-endpoint)

**Role-based dashboard (graphical)** — **Shadcn UI Chart (recharts) + Tailwind CSS**, chart-first / minimal text, single screen.
- **8 donuts** (no legend — shown on hover): top 4 — MCP status (ok/fail)·API request/approval (approved/pending/rejected)·org users (active/pending)·logins (by role USER/ADMIN); bottom 4 — by API(tool)·by caller·doc status·by region
- **Hourly heatmap**: **popup** opened from the **“시간대별”** link top-right of the API(tool) card (x = top-7 calls, y = hour 0–23, color = frequency)
- **World map**: a **static local PNG** (`apps/web/public/world-map.png`, grayscale labeled world map) with request-location markers (size·color = frequency) — coordinates measured directly from the map pixels, hover tooltip (region·count), **click to zoom fullscreen**
- **API request history**: shown **only when docs exist** (approval status·reject reason, notify when not approved, expandable **MCP call history** for approved APIs)
- **Theme mode**: icon **cycle toggle** next to the account at bottom-left (system🖥→light☀️→dark🌙). No fixed top bar
- **Notifications**: shown **only when present** as a bottom-right **popup on the dashboard** (ADMIN/SUPERVISOR, 15s poll, confirm·close) — ref: Eden-FP notifications-card
- **Unified theme**: Tailwind + Shadcn HSL tokens (CSS variables) applied to nav·content·charts·auth pages, light/dark via `data-theme`
- Notification flow: USER→org ADMIN, ADMIN→SUPERVISOR (sent when pending). MCP calls are logged when the proxy has `USAGE_REPORT_URL`+`USAGE_TOKEN` (+`USAGE_REGION`/`USAGE_CALLER`); aggregated at `/api/stats/usage`.

**Settings·account**: change own **password** (current verified) + TOTP enroll. SUPERVISOR/ADMIN can **reset passwords** in user management (ADMIN = same-org USER, SUPERVISOR = anyone). Left nav **collapse toggle** (persisted in localStorage).

**Member invite** (SUPERVISOR/ADMIN, user management → "멤버 초대"): ① **email** invite → SMTP send (`.env`); falls back to returning the link when SMTP is unset. ② **invite link** (30-min) scoped to an org + allowed email domain. Accept at `/invite/[token]` → account created `active`. ADMIN invites USER into own org; SUPERVISOR invites USER/ADMIN into any org. Email template is Claude-style HTML.

**Pages**: `/login` `/register`(role·org) · `/(app)/{dashboard,apidocs,approvals,users,settings}`
(`apidocs` = 2-mode register/edit; `approvals` = user+doc review with preview modal)

**Dev test accounts & demo data** — data lives in [`apps/web/seed/`](./apps/web/seed) JSON (`accounts`·`apidocs`·`usage`), not code. Auto-seeded on first boot when `SEED_TEST_ACCOUNTS=true`, or run `make seed` manually (idempotent). Rule: abbrev+1234.
`supervisor@example.com/supervisor1234`(SUPERVISOR, via `.env`) · `ad@x.com/ad1234`(ADMIN, demo-org) · `us@x.com/us1234`(USER, demo-org). All active. Includes approved demo doc `demo-bookcollection` + 60 chart usage rows. Edit the JSON then `make seed` to change accounts/docs/distribution.

**Sample APIs for conversion**: [`api-samples/`](./api-samples) — FastAPI(`:8000/openapi.json`)·Spring Boot(`:8080/v3/api-docs`) CRUD. Feed into "schema link" mode to verify conversion.

## Environment variables

Root `.env.{local,dev,staging,prod}` (proxy·infra) + `apps/web/.env.local` (web). Templates: `.env.example`, `apps/web/.env.example`.

| Key | Purpose | local/dev | staging | prod |
|-----|---------|-----------|---------|------|
| `TRANSPORT`·`PORT` | MCP transport·port | stdio·http / 8080 | http | http |
| `DATABASE_URL` | proxy metadata DB | sqlite | postgresql | (injected) |
| `SUPERVISOR_EMAIL`·`SUPERVISOR_PASSWORD` | **default-admin bootstrap** (created once on first boot when both set) | demo values | `__INJECT__` | (injected) |
| `JWT_SECRET`·`JWT_EXPIRES_IN` | JWT signing·expiry | dev values | `__INJECT__` | (injected) |
| `BCRYPT_ROUNDS` | hash rounds | 10 | 12 | (injected) |
| `TOTP_ISSUER` | authenticator label | MCP-Proxy | MCP-Proxy | (injected) |
| `SQLITE_PATH` | user DB path | `./var/app.db` | `./var/app.db` | (injected) |
| `SEED_TEST_ACCOUNTS` | dev test-account seed | true | false | false |
| `USAGE_TOKEN` | shared token for MCP usage reporting | dev value | `__INJECT__` | (injected) |
| `APP_BASE_URL` | base URL for invite links | localhost:3000 | `__INJECT__` | (injected) |
| `SMTP_HOST/PORT/USER/PASS/FROM` | invite email SMTP (unset → link fallback) | unset | `__INJECT__` | (injected) |

> Rule: only `.env.local`·`.env.dev` hold real dev values. `.env.staging` uses `__INJECT__` for secrets, `.env.prod` is **keys only** (Secret Manager injection). `.env.*` is gitignored; only `.env.example` is committed.

## Tests

```bash
pnpm test                              # vitest (96: convert/proxy/auth/workflow/dashboard/invite)
python3 test/python/test_extractor.py  # python (5)
tsc -b apps/api                        # build check
```

Current status — vitest 96 + python 5 + live smoke PASS:
- convert·proxy [RESULTS.md](./test/RESULTS.md)
- auth [RESULTS-auth.md](./test/RESULTS-auth.md)
- org·approval workflow [RESULTS-workflow.md](./test/RESULTS-workflow.md)

## CI/CD

GitHub Actions workflow [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) — **currently disabled (fully commented out)**. Does not run on push/PR.
Defined jobs: node (`pnpm lint`·`test`·`build`) + python (`ruff`·`pytest`).

**To re-enable** — uncomment every line from `name:` to the end (strip leading `# `), then push:

```bash
# delete the top notice block (─── divider) first, then
sed -i '' 's/^# //' .github/workflows/ci.yml
git add .github/workflows/ci.yml && git commit -m "ci: enable" && git push
```

Or in VS Code select the `name:`–end block → `Cmd+/` (toggle comment). To disable again, comment the whole file back.

## License

Review the licenses of adopted open source (e.g. `mcp-openapi-server`) before forking/embedding. See PRD §10.
