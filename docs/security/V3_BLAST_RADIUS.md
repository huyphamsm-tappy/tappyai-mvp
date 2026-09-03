# V3 — Service-Role Blast Radius & Sensitive Data Boundaries

Continues `V3_THREAT_MODEL.md`. Audited tree: `integration/v3-foundation` @ `558ba49`.

---

## 1. The service-role question, answered honestly

**The credential is already well contained in code, and that containment does not reduce RCE
blast radius at all.** Both halves matter.

What is genuinely good: `SUPABASE_SERVICE_ROLE_KEY` is read in exactly **one** module
(`src/lib/supabase/admin.ts`), enforced by the `no-adhoc-service-role-client` architecture rule,
with one documented exception that only reads the flag. There is no second admin factory.

What that does **not** buy: on Vercel, environment variables are project-scoped, not
function-scoped. Every serverless function in the deployment — `/api/chat`, every cron, every
admin route, and every route that never touches the database — has `SUPABASE_SERVICE_ROLE_KEY`
in `process.env`. Code execution inside *any* handler can therefore write four lines and hold a
client that bypasses RLS on every table.

So the honest statement is:

> Reducing the *number of call sites* does not reduce the blast radius. The blast radius is set
> by the process boundary, and on Vercel the process boundary is the whole deployment.

Refactoring 76 call sites down to 10 would look like progress and change nothing. The only real
mitigations are architectural or operational — a separate deployment for privileged jobs, or
Supabase-side scoped keys — and neither is a Phase 3 change. **Recorded as accepted structural
risk, not patched.**

### Where the service role is used, and whether the usage itself is scoped

| Component | Needs it? | Why | Scope of the call |
| --- | --- | --- | --- |
| `/api/chat` | Yes (one call) | Memory upsert must work under Bearer-token auth | `updateMemory(authedUserId, …)` — id from the verified session, `user_id` pinned after the patch spread |
| `savePriceWatch` (the one AI write) | Yes | Insert + per-user cap | **Table and operation are literals**; `userId` comes from `runAiWriteAction`'s verified actor |
| 10 crons | Yes | Operate across users by definition | Each filters to a user list it derived itself |
| 30 admin routes | Yes | Administrative reads/writes | RBAC on every route; audited |
| `/api/group` (new) | Yes | Serve a share-link holder by UUID | Both reads pinned to the one supplied id |
| `/api/users/search` | Yes | `auth.admin.listUsers` for exact email/phone | Exact match only; now throttled on a derived IP |

**The chat route's own privileged surface is one memory upsert.** It is not reachable with a
model-chosen table, id or user.

---

## 2. The dangerous chain — answered

```
prompt injection → AI → tool → privileged DB → another user's data → external egress
```

**Not possible. Broken in three independent places, each with a test:**

1. **Tool selection is a closed set.** `AI_TOOLS` is a registry a test checks against the route;
   the model cannot invent a tool name.
2. **The one write tool cannot choose its target.** In `savePriceWatch`, the table
   (`price_watches`) and the operation are literals, and `userId` comes from the verified
   session — never from arguments. `actionBoundary.test.ts:154` proves a model-supplied
   `user_id`/`userId` is **ignored**, and Phase 1 mutation MU21 ("the write boundary stops
   requiring an authenticated actor") is KILLED.
3. **Even with data in hand, it cannot leave.** All five rendering channels are
   provenance-guarded (P3-F2/F4/F5), and no tool exposes a URL or host parameter, so the model
   has no network sink of its own.

The residual outbound path is model-chosen **query text to a fixed third party** (Serper/Google).
The attacker cannot read those logs, so it is a privacy consideration, not exfiltration.

---

## 3. Findings this pass

### S-2 · The account-existence oracle was not actually throttled — **MEDIUM** — FIXED

`GET /api/users/search?q=<exact email>` answers "does this address have a TappyAI account?".
That is deliberate friend-search, built carefully: auth required, **exact** match so a partial
value cannot enumerate, 30 lookups/minute.

The cap **is** the control — and it was keyed on
`req.headers.get('x-forwarded-for').split(',')[0]`: text the caller writes. Rotating the header
minted a fresh bucket per request, so an attacker with any account could test an entire address
book against the user base.

P3-F1 had fixed this class centrally in `clientIp()`; this was the **last route still reading the
header itself**, and it was the worst possible one. Fixed to use `clientIp`, plus:

- **`no-adhoc-forwarded-ip`** architecture rule — only `src/lib/security/rateLimit.ts` may name
  a forwarded-IP header. Verified to fire: restoring the old line reports 1 violation.
- `enumerationThrottle.test.ts` — drives the real handler 40 times with a rotating forged hop and
  a fixed platform header. Vulnerable version allows **40/40**; fixed version allows exactly 30.

### G5 · A guard so S-1's class cannot recur — **preventive**

`check-sql-grants.mjs` gained a rule: a `FOR SELECT USING (true)` policy on any table not on an
explicit `PUBLIC_CONTENT_TABLES` allowlist is an error. It is drop-aware — a policy a later
migration removes is not a live grant, which is what lets the correct fix (drop + re-create
scoped) pass. Verified to fire on a new world-readable policy and to pass when clean.

This is the durable answer to S-1: the next `USING (true)` on personal data fails CI with the
reason attached.

### I-4 · Third-party OAuth tokens are stored in plaintext — **INFORMATIONAL / OPERATIONAL**

`user_integrations.access_token` / `refresh_token` hold Google Calendar and Zalo credentials.
The schema says so itself: *"encrypted at rest via Supabase Vault ideally; store here for MVP"*.

Bounded by: RLS `FOR ALL USING (auth.uid() = user_id)`; `/api/integrations` selects only
`provider, metadata, connected_at, expires_at` and **never** the tokens.

**The AI never sees them** — traced in `googleCalendar.ts`: the token is used only to call
Google's API, and the prompt block is built from `summary`/`date`/`location` and fenced as
`calendar_events`. No token reaches a prompt or a log.

This is the clearest candidate for future encryption/Vault work. **OPERATIONAL FOLLOW-UP.**

---

## 4. AI provider data inventory

| Data | Sent? | Necessary | Sensitive |
| --- | --- | --- | --- |
| System rulebook (~11k tokens) | **Definitely** | Yes | No |
| User's message | **Definitely** | Yes | Can be |
| Trimmed history (last 10) | **Definitely** | Yes | Can be |
| Memory (fenced) | Conditional — account, non-anonymous | Personalisation | **Yes** |
| Stored preferences (fenced) | Conditional | Yes | Moderate |
| Calendar summary (fenced) | Conditional — integration connected | Yes | **Yes** |
| GPS coords + address label (fenced) | Conditional — client sends location | Yes | **Yes** |
| `needBrief` | Conditional — decision turns | Yes | Derived, closed vocabulary |
| Tool results | Conditional | Yes | Third-party content |
| Google `place_id` / `website_uri` | Conditional | Yes — late photo resolution | No (public ids) |
| **User id / email / phone** | **NOT SENT** | — | — |
| **OAuth or API tokens** | **NOT SENT** | — | — |
| **Other users' data** | **NOT SENT** | — | — |

**Data minimisation on identity is genuinely good**: `user.id` is used only server-side to fetch
context; no user identifier is interpolated into any prompt. The model personalises without ever
learning who it is talking to.

**Retention, training use, and regional processing: OPERATIONAL / LEGAL VERIFICATION REQUIRED.**
Nothing in this repository establishes them, and no compliance claim is made here.

---

## 5. Verification gaps

| Gap | Status |
| --- | --- |
| `conversations` / `user_memory` / `profiles` RLS exists only in production | **Still open.** Live introspection (`05_DATABASE_CONTRACT.md:228,269`) records them as self-scoped. Not reconstructible in CI without inventing a schema the repo does not own. G5 now catches the realistic regression — a *new* widening policy — but cannot see a policy dropped in the dashboard. Owner query is in `V3_THREAT_MODEL.md` §D I-1. |
| AI provider retention / training terms | **OPERATIONAL / LEGAL.** |
| Log retention and access control | **OPERATIONAL.** Relevant to M-1. |
| At-rest encryption beyond Supabase defaults | **OPERATIONAL.** Relevant to I-4. |

---

## 6. Blast radius — six answers

1. **One user account.** Their own data, public social content, public profile columns. Cross-user
   private data: none found. **Bounded.**
2. **One application component (RCE).** Full database authority via the ambient service-role key —
   read every conversation, memory, integration token, and billing row; write anything; delete
   anything. **Not bounded, structural, Vercel-wide.** See §1.
3. **One compromised AI interaction.** Only the current user's own context. Cannot reach another
   user, cannot pick a network destination, cannot publish a URL it was not given. **Bounded.**
4. **One compromised AI provider.** A rolling window of each user's assistant usage — messages,
   fenced memory, preferences, calendar summary, GPS label, tool results, replies. **No identity,
   no tokens.** Retention: UNKNOWN.
5. **One leaked database.** Conversations (full history), memory, **plaintext OAuth tokens**,
   billing links, audit log, all social content. `profiles` no longer holds email or Stripe ids.
   The tokens are the most damaging item because they are live credentials to *other* systems.
6. **One compromised admin credential.** Every admin route's capability: read any user's profile
   and notes, ban/suspend, moderate, broadcast notifications, read the audit log. Actions are
   audited with a server-derived actor, and the audit chain is hash-linked — so the damage is
   visible even though it is broad. **Broad but attributable.**
