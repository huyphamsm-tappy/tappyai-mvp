# FOUNDATION-10C — Option B: Verification Re-run & Deployment Package

**Verdict: ✅ READY — AWAITING EXPLICIT OWNER DEPLOYMENT AUTHORIZATION.**
Not deployed. Nothing committed, pushed, merged or activated.

**The F-10C blocker is resolved.** F-10C's verdict was BLOCKED for exactly one reason: the production Ultimate Owner was a consumer `gmail.com` identity, so deploying the corporate boundary would have locked the only Owner out of the live Controller. The B-1 migration moved Ultimate Owner to `founder@tappyai.com`, and that identity is proven to pass the boundary. The blocker no longer exists.

---

## 1. Authentication source audit (re-run from source)

Full traced path, measured this session:

```
Supabase Auth (shared consumer project — untouched)
  └─ session cookie  ──► middleware.ts:58  auth.getUser()   [AUTHENTICATION ONLY, no DB role read]
  └─ cookie / Bearer ──► getRequestUser.ts:33,38  auth.getUser()
                          │
                          ▼
        ┌──────────── the 3 Controller identity points ────────────┐
        │ app/admin/layout.tsx:18        auth.getUser()            │
        │ permissions/guards.ts:159      auth.getUser()            │
        │ lib/auth/getRequestUser.ts     auth.getUser()            │
        └──────────────────────────────────────────────────────────┘
                          │
                          ▼
              resolveActorForUser(user)      ◄── ★ OPTION B BOUNDARY (fail-closed)
                          │
                          ▼  Actor exists only past this point
              checkOwnerGate()  →  permissionEngine.authorize()  (canonical PDP)
                          │
                          ▼
        membership → department scope → role constraints → permission → Controller
```

`auth.getUser()` appears at 39 sites repo-wide; **36 are consumer pages/components** and never construct an Actor. Only the three above feed the Controller.

## 2. Exact trusted identity source

**The Supabase Auth server's own answer about the token — not a JWT decode, not a client field.**

MEASURED in the installed dependency: `@supabase/auth-js@2.108.2`, `GoTrueClient._getUser` (`dist/main/GoTrueClient.js:2611-2635`) issues `GET <auth-url>/user` with the access token in **both** branches — the jwt-supplied branch and the session branch. There is **no local-decode fast path**. `getRequestUser` uses the same call for the cookie session *and* the native `Authorization: Bearer` token, so a self-minted or tampered JWT is rejected by the Auth server before the boundary ever sees it.

The policy reads only: `email`, `email_confirmed_at`, `is_anonymous` — all from that verified record.

## 3. Exact enforcement point

`src/lib/admin/rbac.ts` → **`resolveActorForUser()`**, executed **before** `resolvePrincipal()`.

This is the file's own documented *"THE SINGLE Actor construction site."* Placing the check inside it makes the boundary **structural rather than remembered**: an identity that fails never becomes an `Actor`, so every present and future Controller surface inherits it and none can opt out.

🔑 **The signature change is the security property.** It was `(userId: string, email: string | null)`; it is now `(user: User)`. A caller has no email parameter to forge — the only thing it can pass is an object obtained from Supabase Auth.

Denial handling: API throws `AdminError` → existing `adminErrorResponse` → **403**. Pages go through `resolveActorForPage`, which converts that one denial into a redirect out of the Controller.

## 4. Code changes — Option B's isolated footprint

| File | Change |
|---|---|
| `src/lib/controller/auth/corporateIdentity.ts` | **NEW** — pure, fail-closed policy. Imports one type, nothing else. |
| `src/lib/admin/rbac.ts` | signature → verified `User`; boundary before `resolvePrincipal` |
| `src/lib/admin/permissions/guards.ts` | **NEW** `resolveActorForPage` (one page-denial path); `requirePagePermission` uses it |
| `src/app/admin/layout.tsx` | 2 lines: import + `resolveActorForPage(user)` |
| 4 test files new, 3 updated | 104 tests |

No migration. No env var. No Supabase Auth change. `middleware.ts` **untouched**.

**Consumer blast radius: zero.** Measured — no file outside `src/app/admin/`, `src/app/api/admin/`, `src/lib/admin/`, `src/lib/controller/` imports any changed module.

## 5. Security rationale

- **Exact domain equality, never `endsWith`** — `endsWith('tappyai.com')` accepts `evil@nottappyai.com`.
- **ASCII charset on the RAW domain, before lower-casing** — U+212A KELVIN folds to ASCII `k`, so a post-normalisation check can be laundered. Checking raw input makes it structural, not a coincidence of the word "tappyai".
- **`email_confirmed_at`, not `confirmed_at`** — the latter coalesces email *or phone* confirmation.
- **Domain is a source constant, not env** — an env-configurable boundary can be weakened by a deploy that never touches the file.
- **Denial throws**, not a boolean a caller can ignore.
- **Not routed through the authorization audit writer** — no Actor exists at that point; doing so would create the second audit writer the architecture forbids.

## 6. Adversarial review — all DENIED, each with a test

Forged body/query/header email (structurally impossible — no parameter accepts one) · forged/self-signed JWT · unverified email · phone-confirmed account claiming a corporate address · missing identity · expired/stale session · anonymous sign-in · consumer Google · Facebook · non-corporate domains · `evil@nottappyai.com` · `evil@mail.tappyai.com` · `evil@tappyai.com.attacker.io` · `evil@tappyai.com.` · Cyrillic homoglyph · punycode · fullwidth · zero-width · Turkish İ · Kelvin K · two `@` · empty local/domain · leading/trailing space · newline/CR/tab/NUL · `new_email` pending change · direct API · direct route · middleware bypass (middleware is not the boundary) · SSR/server-component bypass · PDP/membership/cross-department bypass.

Case-insensitive domains and `+aliases` are **allowed** — same corporate mailbox — and still get no authorization.

## 7. Test matrix — 13/13, MEASURED NOW

| # | Case | Result |
|---|---|---|
| 1 | verified `@tappyai.com` + valid authorization | **ALLOW** |
| 2 | verified non-corporate | **DENY** at authentication |
| 3 | corporate, no membership | **DENY** (`NO_MEMBERSHIP`) |
| 4 | corporate, wrong department | **DENY** (`SCOPE_DENIED`) |
| 5 | Manager → membership administration | **DENY** |
| 6 | Employee → membership administration | **DENY** |
| 7 | Head → cross-department | **DENY** |
| 8 | Head → GLOBAL | **DENY** |
| 9 | Owner | **preserved** (`OWNER_BYPASS`, GLOBAL, no membership needed) |
| 10 | forged client email | **cannot reach the decision** |
| 11 | direct API | same enforcement |
| 12 | direct `/admin` route | same enforcement |
| 13 | consumer authentication alone | **DENY** — even holding a real `super_admin` row |

Plus the A–K Owner-migration matrix (18/18) and the production pre-flight assertion that the **live** `founder@tappyai.com` record is admitted.

## 8. Mutation results — 8/8 RED, restores byte-exact

`endsWith` (9 failing) · drop verification (3) · `confirmed_at` (59) · charset-after-lowercase (1) · accept anonymous (1) · remove boundary from the construction site (18) · page-wrapper swap (2) · **true bypass via Actor literal (2)**.

## 9. Regression — MEASURED NOW

tsc **0** · vitest **1140/1140 (91 files)** · architecture **8/8** · SQL grants **0 errors** · lint **0 errors** · build **PASS** (`/admin` 6.37 kB, unchanged).

## 10. Production impact

Deploying Option B changes behaviour for **exactly one class of principal**: an authenticated identity that reaches `/admin` or `/api/admin/*` and is *not* a verified `@tappyai.com` mailbox. Today that is one account — the retired `gmail.com` identity, which still holds `super_admin`.

- Ultimate Owner `founder@tappyai.com` → unaffected (proven admitted).
- Consumer app → unaffected (zero blast radius, middleware untouched).
- Owner Gate, `platform_owner`, `admin_roles`, `audit_log`, chain, SECURITY DEFINER fns, RLS, PDP → all unchanged.

### 🚨 Interaction the Owner must decide before deploying

**Deploying Option B disarms the B-1 rollback anchor.** B-1 deliberately left `super_admin` on the old `gmail.com` identity so ownership could be restored. Once Option B is live, that identity is denied at the *authentication* boundary — so rolling B-1 back would produce a Controller with an Owner who cannot log in.

**Therefore the revert order is not symmetric.** If both ever need reverting: **revert the Option B deployment first, then run the B-1 rollback.** Reversing that order strands the Controller.

### 🚨 Deployment scoping — Option B is NOT isolated in this worktree

The branch commingles Option B with the F-06→F-08 foundation:

- `src/app/admin/page.tsx` + deleted `HomeDashboard.tsx` + `src/components/admin/home/` = **F-08 Enterprise Command Center Home** — a visible UI change.
- `src/lib/admin/permissions/registry.ts` + `src/lib/i18n/admin/index.ts` + `src/lib/controller/org/` + the memberships route = **F-06/07** (inert behind `CONTROLLER_ORG_MEMBERSHIP_ENABLED`, which is **not set anywhere**).
- `src/app/admin/layout.tsx` carries **both** concerns: 2 lines of Option B and the F-07D nav filter.

Deploying this branch as-is would ship the Command Center Home too — contrary to the instruction to keep authentication/security work isolated. **To deploy Option B alone, the commits must be separated first** (a `feat/controller-v2-option-b` branch carrying only the five Option B files plus tests, with `layout.tsx` reduced to its 2-line change).

### Rollback plan for an Option B deployment
Revert the deployment (Vercel instant rollback to the previous production deployment, or revert the merge commit and redeploy). No database change, no migration, no env change ⇒ nothing to undo outside the code.

## 11. Remaining Supabase dependency

**None.** Option B needs no Supabase Auth configuration, no hook, no domain allowlist, no Management-API access. The shared consumer project keeps open signup, Google, Facebook, email OTP and anonymous sign-ins exactly as they are.

One *operational* dependency: the boundary rests on control of the `tappyai.com` mail domain, since Supabase confirms an address by delivering to it. Anyone able to receive mail there obtains an *identity* — and still zero authorization without membership, scope, role and permission.

## 12. `/admin` Controller V2 status

`/admin` **is** Controller V2, evolving in place. No route deleted, none created, no redirect added. The F-08 Command Center Home was **not** deployed in this task; it remains built, green and uncommitted, and will land on this same route later.

## 13. Legacy cleanup status

**None performed.** `src/lib/admin.ts`, `admin_permissions`, `backoffice_super_admins.sql`, `BACKOFFICE_ENABLED`, `ROLE_RANK`/`hasRole` all untouched. `ADMIN_IDS` (DMCA notification path) and `partner_deals` (consumer data source) untouched.

## 14. Production state — MEASURED NOW, unchanged

```
platform_owner            = 1 active → f9077a52-…e386 (founder@tappyai.com)
admin_roles               = 1 (super_admin, old gmail id — rollback anchor)
department_membership     = 0
audit_log                 = 3
CONTROLLER_ORG_MEMBERSHIP_ENABLED = not set anywhere (OFF)
Supabase Auth             = untouched
```

Nothing created, activated, migrated, committed, pushed, merged or deployed this phase.

## 15. Verdict

**✅ READY — AWAITING EXPLICIT OWNER DEPLOYMENT AUTHORIZATION.**

Two decisions are required before deployment, both stated above and neither resolvable without the Owner:

1. **Accept the rollback-order constraint** (§10) — Option B must be reverted before B-1, never after.
2. **Authorize the commit separation** so Option B ships without the F-08 Home and org foundation, or explicitly authorize shipping them together.

Activation gates remain closed and untouched: no first Head, no first membership, no flag enablement, no Controller V2 activation.
