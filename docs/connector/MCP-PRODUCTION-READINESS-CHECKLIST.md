# Tappy MCP gateway — production readiness checklist (PREPARED 23/11/2026, NOTHING APPLIED)

Purpose: everything that must be true before `https://<production domain>/api/mcp` can be submitted to the Anthropic connector directory (and later OpenAI's). This file only lists and orders the work. No production change, deploy, migration or env edit has been made. Every step marked OWNER needs the owner's explicit go-ahead at that moment.

Source of truth in code: `src/lib/mcp/` (gateway, identity, clientApproval, spendPool), `src/app/api/mcp`, `src/app/oauth/consent`, `src/app/api/oauth/client-approval`, `src/app/.well-known/oauth-protected-resource`. Branch `feat/brain-r13-p1` (commits up to `663ee77`). Reaches `main` only by PR that the owner merges.

## 0. Decisions the owner must make first

| # | Decision | Why it blocks |
|---|----------|---------------|
| D1 | Production hostname for the connector (suggest the existing site origin, so `https://tappyai.com/api/mcp`) | Directory requires a stable HTTPS URL on the service's own domain; the slug is permanent |
| D2 | Do the itinerary job tools ship? (see 3) | The directory requires every tool to succeed with valid input. With jobs off, `create_itinerary_job`, `get_itinerary_job_status/result`, `cancel_itinerary_job` return "unavailable" and would be flagged |
| D3 | How the data sources are declared (Agoda = partner; places/shopping = third-party search provider) and confirmation of the right to serve that data through a public listing | Directory "first-party / proxied with permission" rule |
| D4 | Legal company name, website and primary contact for the listing | Required field; not invented |
| D5 | Which Hosts are allowed at launch (default rules: Claude, ChatGPT, Cursor; others stay unapproved) | `MCP_REDIRECT_RULES` / default rules decide which OAuth clients are approved |

## 1. Runtime switches (Vercel production env) — OWNER applies

| Variable | Value | Note |
|----------|-------|------|
| `MCP_GATEWAY` | `1` | Also locked off in a production runtime unless the name is listed in `CONSULT_PRODUCTION_ALLOW` (see below) |
| `CONSULT_PRODUCTION_ALLOW` | append `MCP_GATEWAY` | Append only that name; keep every existing entry; check the current value first |
| `MCP_RESOURCE_URL` | `https://<domain>/api/mcp` | Must equal the URL submitted to the directory (it is the token audience) |
| `MCP_RESOURCE_METADATA_URL` | `https://<domain>/.well-known/oauth-protected-resource` | RFC 9728 |
| `MCP_AUTH_SERVER_URL` | `https://<production supabase ref>.supabase.co/auth/v1` | PRODUCTION project, never the UAT ref `zdapr…` |
| `MCP_ATTRIBUTION_SECRET` | new random 32-byte hex, generated for production | Never reuse the UAT value |
| `MCP_POOL_DAILY_USD`, `_HOST_USD`, `_INSTALL_USD`, `_PRINCIPAL_USD`, `_TOOL_USD`, `_REQUEST_USD` | owner sets the spend ceilings | A shared store is needed or the pool is per instance |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | the production shared store (Upstash) | Needed for the spend pool and rate limits to be shared across instances |
| `MCP_ALLOWED_ORIGINS` | only the Host web origins that call the gateway from a browser, if any | Leave empty if none |
| `MCP_REDIRECT_RULES` | leave UNSET | Defaults approve only Claude, ChatGPT and Cursor callbacks. NEVER enable `loopback` in production (it is for the owner's PC tests only) |
| `MCP_OAUTH_CLIENTS` | leave UNSET | Hand-listed test client (UAT only) |
| `CCP_REALTIME_AGODA_LITE` | `1`, with the Agoda Lite credentials already used by the app | Without it `search_hotels` returns no price |
| `MCP_JOBS_ENABLED` | `1` only if D2 = ship jobs | Requires the migration in 3 |

Rollback for all of the above: unset `MCP_GATEWAY` (the route answers 404 again). No data migration to undo.

## 2. Supabase production (OAuth Server) — OWNER (dashboard or approved API)

- Enable the OAuth Server; set the authorization path / consent URL to `https://<domain>/oauth/consent`.
- Enable dynamic client registration (the Hosts register themselves). The gateway and the consent screen only trust a client whose redirect URIs all belong to ONE known Host (`clientApproval.ts`); any other client is denied at the consent screen and its token is refused at the gateway.
- Check Site URL and redirect allow-list do not need changes for the connector (Hosts redirect to their own callbacks).
- Confirm tokens carry `client_id` (the app relies on it to keep Host tokens out of every non-MCP route: `oauthClientToken.ts`).
- Hardening to decide before launch: whether to keep dynamic registration open on production (the approval-by-redirect rule is the compensating control) and how clients are cleaned up.

## 3. Database

- `supabase/migrations/20261121_mcp_jobs.sql` is NOT applied on production. It is only needed if D2 = ship jobs (and then also the `mcp-jobs` cron and `MCP_JOBS_ENABLED=1`). If D2 = no jobs (DECIDED 27/11/2026: no jobs at launch), the job-dependent tools are HIDDEN, not deleted: `create_itinerary` AND the four job tools (five in all, since `create_itinerary` also creates a job) are neither listed nor callable while the job store is the unavailable default (`MCP_JOBS_ENABLED` unset). The definitions are unchanged, so the pinned full-catalog fingerprint in `schemaConformance.test.ts` still holds; turning jobs on later needs only `MCP_JOBS_ENABLED=1` plus the migration. Launch catalog = the five search tools.
- If applied: named-file apply only, per `KE-HOACH-AP-MIGRATION-PRODUCTION-20261122.md`; backup first; `20261001e` stays out.

## 4. Code and tests (do before the PR)

- Full app test run green, `node scripts/architecture/check.mjs` green, `tsc` clean (last full run: one fixed failure, one flaky failure not yet identified).
- Re-run `search_places`, `search_restaurants`, `search_attractions`, `search_shopping`, `search_hotels` (with dates) and, if shipped, the job tools through MCP Inspector against the PRODUCTION URL with a production test account.
- `/privacy` must describe the connector's data (account identifier received through sign-in, the query text, no conversation history). Review before submission.
- Public documentation page for setup and usage (English copy in `docs/connector/`); needs a page on the site.

## 5. Order of operations (each step stops for the owner's go-ahead)

1. Owner answers D1–D5.
2. PR from `feat/brain-r13-p1` to `main` (owner merges). Web is frozen at `web-freeze-20261121`: confirm with the owner that the connector files may ride in that release.
3. Backup, then migration only if D2 = jobs.
4. Supabase production OAuth Server settings (section 2).
5. Vercel env (section 1) and redeploy.
6. Smoke test on production: metadata endpoint, 401 challenge, full OAuth flow with a test account in Claude.ai as a custom connector, all tools.
7. Create a reviewer test account on production (Anthropic asks by email; no credentials in the portal).
8. Fill and submit the portal form (`ANTHROPIC-DIRECTORY-SUBMISSION-DOSSIER.md`); the owner ticks the seven compliance acknowledgments.

## 6. Known risks

- The temporary tunnel used on the owner's PC proves the flow, not production behaviour (cold starts, rate limits, shared store).
- Hotel prices depend on the Agoda Lite credentials and quotas in production.
- Places/shopping depend on a paid third-party search provider; the spend pool caps cost, but caps must be set.
- ChatGPT's app is not tested end to end (the owner's plan has no custom connector); only OpenAI API/Playground was.
- Logo: Claude.ai does not show a server-provided icon for custom connectors; the listing icon is uploaded in the portal.
