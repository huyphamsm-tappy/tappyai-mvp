# FOUNDATION-10C — Option B: Trusted Corporate Identity Boundary

**Owner decision (2026-08-09): OPTION B** — a trusted-layer `@tappyai.com` claim
check *on top of* the canonical PDP authorization chain.

**Status: IMPLEMENTED AND PROVEN. Activation verdict: 🚫 BLOCKED — OWNER ACTION REQUIRED.**

The boundary itself is built, mutation-proven and fully green. It is blocked on
one measured fact, not on an unknown: **the production Platform Owner does not
hold an `@tappyai.com` identity**, so deploying this change as written would lock
the only Owner and only admin out of the live Controller. See §11.

Production remains `department_membership = 0`,
`CONTROLLER_ORG_MEMBERSHIP_ENABLED = OFF`, `platform_owner` unchanged, Controller
V2 foundation undeployed. Nothing was committed, pushed, merged or deployed. No
Supabase Auth configuration was changed.

---

## 1. Architecture decision

Option B is implemented as **one pure policy module consumed at the single Actor
construction site**. It is authentication, never authorization.

```
authentication (Supabase Auth, verified over the network)
  ↓
verified corporate identity      ← NEW (FOUNDATION-10C)
  ↓  NO → fail closed (403 / redirect out of the Controller)
Actor
  ↓
canonical PDP (permissionEngine)  ← unchanged, still the ONE authority
  ↓
membership → department scope → role constraints → resource permission
  ↓
Controller
```

**What was NOT created:** no second PDP, no second RBAC engine, no second
navigation authority, no second audit writer, no new environment variable, no new
migration, no Supabase Auth configuration change. Statically asserted in
`corporateBoundary.test.ts` (exactly one `permissionEngine`, exactly one
`writeAuditLog`).

**Email domain is not a grant.** The policy module reads no role, membership,
department or permission — asserted by test. A verified `@tappyai.com` identity
with no membership still reaches nothing (§7, matrix row 3).

---

## 2. The exact trusted boundary

`src/lib/admin/rbac.ts` → `resolveActorForUser()`, the file's own documented
"THE SINGLE Actor construction site", **before** `resolvePrincipal()` runs.

Chosen there rather than in middleware or in each guard because it makes the
boundary **structural instead of remembered**: an identity that fails it never
becomes an `Actor`, so every current and future Controller surface inherits it
and none can opt out. The three trusted entry points all funnel through it:

| Surface | Entry point | Denial |
|---|---|---|
| `/api/admin/*` | `requirePermission` → `resolveActor` | throws `AdminError` → uniform **403** envelope |
| `/admin/*` pages | `requirePagePermission` → `resolveActorForPage` | **redirect** out of the Controller |
| `/admin` layout | `resolveActorForPage` | **redirect** out of the Controller |

**Middleware was deliberately NOT used as the boundary.** `middleware.ts` is
shared with the consumer app, its matcher covers every route, and Next.js
middleware has a documented history of bypass. It remains authentication-only, as
the Phase-0 owner decision specifies. Putting the policy there would have added a
second evaluation site with no security gain, since the authoritative layer
already fails closed.

**The signature change IS the security property.** `resolveActorForUser` used to
take `(userId: string, email: string | null)`. It now takes the verified `User`
object. A caller no longer has an email parameter to forge — the only thing it
can pass is an object it obtained from Supabase Auth.

---

## 3. Authentication source audit (MEASURED)

| Question | Finding | How measured |
|---|---|---|
| Where does the email come from? | `supabase.auth.getUser()` | source read: `middleware.ts:58`, `layout.tsx:18`, `guards.ts:128`, `getRequestUser.ts:33,38` |
| Is `getUser()` a local JWT decode? | **No.** `_getUser()` always issues `GET <auth-url>/user` with the access token; there is no local-decode path in either the jwt or session branch | read `@supabase/auth-js@2.108.2` `dist/main/GoTrueClient.js:2611-2635` |
| Does the native/Bearer path verify too? | **Yes** — `getRequestUser` calls `auth.getUser(bearerToken)`, the same round-trip. A self-minted JWT is rejected by the Auth server | `getRequestUser.ts:24-34` |
| Is the address confirmed? | `email_confirmed_at` is read — **not** `confirmed_at`, which coalesces email *and phone* confirmation | policy module + test M-C3 |
| Is the Supabase project shared with the consumer app? | **Yes** — `disable_signup:false`, providers `anonymous_users, facebook, google, email` | `GET /auth/v1/settings`, re-measured 2026-08-09 |

**Conclusion:** the Supabase JWT/auth model *does* provide a sufficiently trusted
identity claim for a Controller server boundary, because the Controller never
trusts the JWT itself — it trusts the Auth server's answer about that JWT. And
the boundary is implementable **entirely in the Controller trusted layer**, with
zero change to global consumer authentication.

---

## 4. Code changes

| File | Change |
|---|---|
| `src/lib/controller/auth/corporateIdentity.ts` | **NEW.** Pure, fail-closed policy. Imports one type, nothing else. |
| `src/lib/admin/rbac.ts` | `resolveActorForUser` takes the verified `User`; enforces the boundary before `resolvePrincipal`; `resolveActor` passes the verified object through. |
| `src/lib/admin/permissions/guards.ts` | **NEW** `resolveActorForPage` — the one page-surface denial path (throw → redirect). `requirePagePermission` uses it. |
| `src/app/admin/layout.tsx` | Uses `resolveActorForPage`. |
| `src/lib/controller/auth/__tests__/corporateIdentity.test.ts` | **NEW** — 44 tests, the adversarial policy matrix. |
| `src/lib/controller/auth/__tests__/corporateBoundary.test.ts` | **NEW** — 35 tests, static single-boundary / no-second-authority guards. |
| `src/lib/controller/auth/__tests__/corporateChain.test.ts` | **NEW** — 18 tests, the composed chain end to end. |
| `src/lib/admin/rbac.test.ts` | Fixture is now a verified corporate identity; +7 boundary tests. |
| `guards.test.ts`, `singleDecisionPath.test.ts` | Assertions retargeted (see §9 M-C7). |

No migration. No env var. No change to the PDP, the audit writer, the navigation
authority, the org/membership layer, or any consumer-app code.

---

## 5. Security rationale for the specific choices

- **Exact domain equality, never `endsWith`.** `endsWith('tappyai.com')` accepts
  `evil@nottappyai.com`; `endsWith('.tappyai.com')` accepts an attacker
  subdomain. Both are tested.
- **ASCII charset checked on the RAW domain, before lower-casing.** Found while
  testing: U+212A KELVIN SIGN lower-cases to ASCII `k`, so a charset check
  performed *after* normalisation can be laundered by a code point that folds
  into ASCII. No such character can spell `tappyai.com` today — but that is a
  property of the word, not of the check. Checking the raw input makes it
  structural.
- **`email_confirmed_at`, not `confirmed_at`.** The latter is Supabase's coalesce
  of email *or phone* confirmation; reading it would let a phone-confirmed
  account assert an unconfirmed corporate address.
- **Domain is a source constant, not an env var.** An env-configurable boundary
  can be silently weakened — or pointed at an attacker-controlled domain — by a
  deploy that never touches the file. Asserted by test.
- **Denial is a throw, not a boolean.** A returned flag can be ignored; a throw
  cannot.
- **The denial is deliberately not written to the authorization audit log.**
  `auditAuthorizationDecision` records PDP decisions and requires an Actor, which
  by construction does not exist at this point. Routing it there would create the
  second audit writer the architecture forbids. It is logged.
- **Control-character check written as a code-point scan, not a regex class.**
  This project has twice shipped source where an escape collapsed into a literal
  control byte, leaving a guard inert. During this session the first draft was
  corrupted in exactly that way — the written class was `[NUL–DEL]`, i.e. *every*
  ASCII character, which would have rejected every address. Caught by an explicit
  byte scan before any test ran. There is now no escape sequence to corrupt, and
  a test asserts the file contains no stray control characters.

---

## 6. Threat model — adversarial results

All DENIED, each with a test:

| Attack | Result |
|---|---|
| Forged email in request body / headers | Inert by construction — no parameter accepts one (`rbac.test.ts`) |
| Forged / self-signed JWT claims | Rejected by the Auth server; `getUser()` is a round-trip, not a decode |
| Unverified email (`email_confirmed_at` null) | `EMAIL_UNVERIFIED` |
| Phone-confirmed account asserting a corporate address | `EMAIL_UNVERIFIED` (M-C3) |
| Missing identity / expired session | `NO_IDENTITY` (no user object) |
| Consumer Google/Facebook OAuth identity | `NON_CORPORATE_DOMAIN` |
| Anonymous sign-in | `ANONYMOUS_IDENTITY` |
| Case variations (`Staff@TappyAI.COM`) | ALLOWED (correct — same mailbox) |
| Plus-alias (`ops+x@tappyai.com`) | ALLOWED (correct — same mail domain; still needs membership) |
| `evil@nottappyai.com` (suffix) | `NON_CORPORATE_DOMAIN` |
| `evil@mail.tappyai.com` (subdomain) | `NON_CORPORATE_DOMAIN` |
| `evil@tappyai.com.attacker.io` (prefix) | `NON_CORPORATE_DOMAIN` |
| `evil@tappyai.com.` (trailing dot) | `NON_CORPORATE_DOMAIN` |
| Cyrillic homoglyph `tаppyai.com` | `MALFORMED_EMAIL` |
| Punycode `xn--tppyai-5wa.com` | `NON_CORPORATE_DOMAIN` |
| Fullwidth / zero-width / Turkish İ / Kelvin K | `MALFORMED_EMAIL` |
| Two `@` signs, empty local, empty domain | `MALFORMED_EMAIL` |
| Leading/trailing space, newline, CR, tab, NUL | `MALFORMED_EMAIL` (never normalised into acceptance) |
| Email change after authentication (`new_email`) | Ignored — only the confirmed address counts |
| Direct API access | Same boundary (`requirePermission` → `resolveActor`) |
| Direct route access | Same boundary (`resolveActorForPage`) |
| Middleware bypass | Middleware is not the boundary; the server layer is |
| SSR / server-component bypass | Same boundary (single construction site) |
| PDP / membership / cross-department bypass | Unchanged from F-06…F-10B; re-proven composed in `corporateChain.test.ts` |

---

## 7. Test matrix (owner's 13 rows)

| # | Case | Result | Where |
|---|---|---|---|
| 1 | Verified `@tappyai.com` + valid authorization | **ALLOW** | `corporateChain.test.ts` |
| 2 | Verified non-`@tappyai.com` | **DENY** at the authentication boundary | `rbac.test.ts`, `corporateChain.test.ts` |
| 3 | `@tappyai.com`, no membership | **DENY** (`NO_MEMBERSHIP`) | `corporateChain.test.ts` |
| 4 | `@tappyai.com`, wrong department scope | **DENY** (`SCOPE_DENIED`) | `corporateChain.test.ts` |
| 5 | `@tappyai.com` Manager → membership admin | **DENY** | `corporateChain.test.ts` |
| 6 | `@tappyai.com` Employee → membership admin | **DENY** | `corporateChain.test.ts` |
| 7 | `@tappyai.com` Head → cross-department admin | **DENY** | `corporateChain.test.ts` |
| 8 | `@tappyai.com` Head → GLOBAL scope | **DENY** | `corporateChain.test.ts` |
| 9 | `@tappyai.com` Owner | **Existing behaviour preserved** (GLOBAL, no membership needed) | `corporateChain.test.ts` |
| 10 | Forged client-supplied email | **Cannot reach the decision** | `rbac.test.ts` |
| 11 | Direct API request | **Same enforcement as UI** | `rbac.test.ts` (`resolveActor`) |
| 12 | Direct Controller route | **Same enforcement as API** | `corporateBoundary.test.ts` |
| 13 | Consumer user of the shared project | **DENY**, even holding a real `super_admin` row | `corporateChain.test.ts` |

No production users were created. Fixtures mirror the real verified identity
shape (`id`, `email`, `email_confirmed_at`, `is_anonymous`) as returned by
`auth.getUser()`.

---

## 8. Test results — MEASURED NOW

| Gate | Result |
|---|---|
| `tsc --noEmit` | **0 errors** |
| `vitest run` (full) | **1119 / 1119 passed, 90 files** (F-10B baseline 1015 / 87) |
| New tests | **+104** (44 policy + 35 boundary + 18 chain + 7 rbac) |
| Architecture Guard | **8 / 8 passed** |
| SQL Grant Guard | **0 errors** (9 info, 6 pinned legacy — unchanged) |
| `next lint` | **0 errors** (warnings pre-existing) |
| `next build` | **PASS** — all 8 `/admin` pages + 10 `/api/admin/*` routes `ƒ`; `/admin` 6.37 kB (unchanged) |
| Stray control characters in new source | **0** |

`/api/subscription` emits a pre-existing `Dynamic server usage` build log. It is
unrelated: that route imports none of the changed modules (verified by grep).

---

## 9. Mutation results — MEASURED NOW, 8/8 RED, all restores byte-exact

| ID | Mutation | Result |
|---|---|---|
| M-C1 | exact domain equality → `endsWith` | **RED** (7) |
| M-C2 | drop the email-verification requirement | **RED** (2) |
| M-C3 | read `confirmed_at` (email OR phone) instead of `email_confirmed_at` | **RED** (48) |
| M-C4 | ASCII charset checked *after* lower-casing | **RED** (1) |
| M-C5 | accept an anonymous identity | **RED** (1) |
| M-C6 | remove the boundary from the single Actor construction site | **RED** (10) |
| M-C7 | page surface swaps the wrapper for the throwing resolver | **RED** (2) |
| M-C8 | **true bypass** — layout builds an Actor literal | **RED** (2) |

🚨 **M-C7 STAYED GREEN on its first run, and that was a real defect in the
tests.** Two assertions — the pre-existing one in `singleDecisionPath.test.ts`
and my new one in `corporateBoundary.test.ts` — matched the resolver name
anywhere in the file, and the **import statement alone satisfied them**. Swapping
the call left both green. Both now assert the CALL (`await resolveActorForPage(`).
The pre-existing assertion had the same weakness before this change.

The security impact of M-C7 is honestly narrow: `resolveActorForUser` still
enforces the boundary, so the swap produces a 500 instead of a redirect — still
fail-closed, no access granted. M-C8 is the true-bypass mutation, and it is RED.

---

## 10. Production state — MEASURED NOW (read-only), unchanged

```
platform_owner            = 1  (unchanged, same user id)
admin_roles               = 1  (super_admin, the Owner)
organization              = 1  (tappyai)
department                = 15
department_membership     = 0
CONTROLLER_ORG_MEMBERSHIP_ENABLED = OFF (not set anywhere)
Supabase Auth: disable_signup=false; anonymous_users/google/facebook/email all enabled
```

Consumer authentication is **byte-for-byte untouched**: no provider disabled, no
signup change, no hook, no redirect change, no global Auth configuration touched.
Nothing committed, nothing pushed, nothing merged, nothing deployed, no migration
applied, no user or membership created.

---

## 11. 🚨 THE BLOCKER — the Platform Owner is not a corporate identity

**MEASURED (read-only, Auth Admin API, 2026-08-09):** the active
`platform_owner` — who is also the *only* row in `admin_roles` — authenticates
with a **`gmail.com` Google identity** (`email_verified: true`,
`is_anonymous: false`, provider `google`).

Consequences, stated plainly:

1. `/admin` **is already live in production** (Components 1–4 and 7 shipped). The
   corporate boundary applies to it the moment this branch deploys.
2. Option B as specified has **no Owner exception** — the owner's own contract
   says a corporate identity is required to authenticate and that authorization
   never substitutes for it. Adding an exception for the Owner would put the
   bypass exactly where it matters most.
3. Therefore **deploying this change today locks the only Owner and only admin
   out of the production Controller**, with no in-app recovery path (recovery
   would require a code revert and redeploy).

This is not a defect in the implementation and not something to paper over. It is
a provisioning prerequisite.

**OWNER ACTION REQUIRED — choose one before activation:**

- **B-1 (recommended):** provision `<owner>@tappyai.com` as a Google Workspace
  identity, sign in to Supabase with it once so the account exists and
  `email_confirmed_at` is set, then re-point `platform_owner` (and
  `PLATFORM_OWNER_USER_ID`) at that user id. The Owner Gate deliberately requires
  **both** the DB row and the env var, so this is a two-key operation — plan it
  as one change.
- **B-2:** ratify a documented, audited break-glass exception for the Owner
  identity only. *Not recommended* — it is a permanent hole at the highest
  privilege level, and the boundary's whole value is that it has no exceptions.

Until one is chosen and executed, the verdict stays **BLOCKED**.

---

## 12. Remaining Supabase configuration dependency

**None for this boundary.** It requires no Supabase Auth configuration, no hook,
no domain allowlist and no Management-API access. That is the point of Option B:
the shared consumer project keeps open signup, Google, Facebook, email OTP and
anonymous sign-ins exactly as they are.

One dependency is *operational*, not configuration: the boundary's strength rests
on **control of the `tappyai.com` mail domain**, because Supabase confirms an
address by delivering to it. Per existing project knowledge that domain runs on
Cloudflare Email Routing + Brevo SMTP under owner control. Anyone able to receive
mail at a `@tappyai.com` address can obtain a corporate *identity* — and still
gets **no authorization** without a membership, scope, role and permission.

---

## 13. Updated activation prerequisites

Replaces F-10B §3 PHASE A item 1.

1. ✅ **Auth-boundary decision made** — Option B, decided 2026-08-09.
2. ✅ **Option B implemented and proven** — this document.
3. 🚫 **Owner holds a verified `@tappyai.com` identity** — **BLOCKED**, §11.
4. ⏳ First Head account selected + verified `@tappyai.com` — NOT SELECTED.
5. ⏳ First department selected — NOT SELECTED.
6. ⏳ Membership-authority policy ratified (F-10A Decision 1) — awaiting owner.
7. ⏳ Explicit activation authorization — NOT GIVEN.
8. ℹ️ Owner Gate: `PLATFORM_OWNER_USER_ID` must be updated **together with** the
   `platform_owner` row if the Owner identity is re-pointed (item 3).

Unchanged and still required: org schema verified, RLS verified,
`department_membership = 0` at start, flag OFF at start, rollback ready.

---

## 14. FINAL VERDICT

**Option B implementation: READY** — built, adversarially tested, 8/8 mutations
RED, full regression green, production untouched, consumer app unaffected.

**Controller V2 activation: 🚫 BLOCKED — OWNER ACTION REQUIRED.**

The single blocker is §11: the production Platform Owner authenticates with a
consumer `gmail.com` identity, and Option B has no Owner exception by design.
Activation must not proceed until the Owner holds a verified `@tappyai.com`
identity (B-1) or explicitly ratifies a break-glass exception (B-2).

No PASS is claimed for activation, and none of the F-10 activation steps
(first Head, first membership, flag enablement, deploy, production UAT) were
performed.
