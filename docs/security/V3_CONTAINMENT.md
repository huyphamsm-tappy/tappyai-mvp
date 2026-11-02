# V3 — Final Containment Review: credentials, service role, drift

Continues `V3_THREAT_MODEL.md` and `V3_BLAST_RADIUS.md`. Tree: `integration/v3-foundation`.

The question is no longer "can we be compromised" but "when one layer is, does it take the rest
with it".

---

## 1. Credential inventory

| Credential | Provider | Stored | Plaintext | Read by | AI sees | Client sees |
| --- | --- | --- | --- | --- | --- | --- |
| Google Calendar access + refresh token | Google | `user_integrations` | **Yes** | `googleCalendar.ts`, callback | **No** | **No** |
| Zalo access token | Zalo | `user_integrations` | **Yes** | zalo routes | **No** | **No** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Vercel env | Yes | `supabase/admin.ts` only | No | No |
| `ANTHROPIC_API_KEY` | Anthropic | Vercel env | Yes | provider adapter only | No | No |
| `GOOGLE_CLIENT_SECRET` | Google | Vercel env | Yes | OAuth callback + refresh | No | No |
| `CRON_SECRET` | self | Vercel env | Yes | 10 cron routes | No | No |
| Stripe keys / webhook secret | Stripe | Vercel env | Yes | stripe routes | No | No |
| Supabase **anon** key | Supabase | Vercel env | Yes (**public by design**) | everywhere | n/a | **Yes — shipped to browser and iOS** |
| Session JWT | Supabase Auth | cookie / Bearer | n/a | `getRequestUser` | No | Own only |

**The AI never receives any credential.** Traced, not assumed: in `googleCalendar.ts` the token
reaches Google's API only, and the prompt block is built from `summary`/`date`/`location` and
fenced as `calendar_events`. No credential appears in any prompt, log, error, or client response.
`/api/integrations` selects `provider, metadata, connected_at, expires_at` and never the tokens.

---

## 2. OAuth token lifecycle

| Stage | Finding |
| --- | --- |
| Authorization | `state = user.id`, and the callback re-derives the user from the session and rejects `user.id !== state`. An attacker cannot bind their grant to a victim, or a victim's to themselves. **Sound.** |
| Token exchange | Server-side; `client_secret` never leaves the server. |
| Storage | `user_integrations`, **plaintext**, RLS `FOR ALL USING (auth.uid() = user_id)`. |
| Retrieval | Own row only, or service role for the refresh. |
| Refresh | Rotates `access_token`; a rotated *refresh* token from Google is not stored (minor, Google usually reissues the same one). |
| **Revocation / disconnect** | **Was the gap — now fixed (C-1).** |
| Deletion | Row deleted on disconnect and cascaded on account delete. |

### C-1 · "Disconnect" did not disconnect — MEDIUM — FIXED

Both integrations deleted the `user_integrations` row and stopped there. That removes **our** copy
of the credential; it does nothing to Google's grant, and a Google refresh token stays valid until
revoked or six months unused.

The consequence that matters is not the live database — it is every **copy** of it. A backup, a
replica, or a leak taken before the disconnect still holds a *working* credential to the user's
calendar, and a `DELETE` cannot reach into a copy we do not control. **Revoking at the provider
invalidates the token everywhere at once**, which is the only lever we have over data that has
already left.

Fixed for Google: `revokeGoogleToken` POSTs the refresh token (Google treats it as the grant, so
issued access tokens die with it) to `https://oauth2.googleapis.com/revoke`, before the delete.
Best-effort and fail-safe — the row is deleted either way, because disconnecting is the user's
instruction and a Google outage must not trap them in a connection they asked to end. The token
is sent in the **body**, never the URL, so a revocation cannot become a disclosure through proxy
logs.

**Zalo is deliberately not changed.** Zalo's OAuth documentation does not establish a revocation
endpoint that this repository can verify, and inventing a URL would be worse than the gap.
**OPERATIONAL FOLLOW-UP:** confirm whether Zalo offers one; if it does, the same two lines apply.

### The question that matters most

> If the database is copied tomorrow, can an attacker use it to access Google/Zalo as the user?

**Google: yes, for currently-connected users — and now no longer for users who disconnected.**
The tokens are plaintext and directly usable against the Calendar API (scope
`calendar.readonly`). Practical exploitability is high: no cracking, no second factor, paste and
use. Containment achieved so far is the revocation on disconnect, which shrinks the live set to
"users connected at the moment of the leak" rather than "every user who ever connected".

**Zalo: yes**, same reasoning, with no revocation available.

**This is the strongest remaining argument for encrypting these two columns** — see §4.

---

## 3. Vault / secret-storage evaluation

Assessed against what this repository can actually establish, not against what would look best.

| Option | Blast-radius gain | Complexity | Failure modes | Verdict |
| --- | --- | --- | --- | --- |
| **A · Current plaintext column** | none | none | — | The status quo. Leak ⇒ live credentials. |
| **B · Supabase Vault** | **Real but partial.** A read-only DB leak (dump, replica, backup) no longer yields usable tokens, because the decryption key is held by the platform outside the table. It does **not** help against service-role compromise or RCE: the same code path that reads the token today would decrypt it. | Moderate — migration of existing rows, changed read path in 4 files, key management becomes an operational dependency | Vault unavailable ⇒ calendar breaks; key loss ⇒ every integration must be re-consented | **Recommended, but as owner-decided work.** Whether Vault is enabled on this project is not knowable from the repository. **OPERATIONAL VERIFICATION REQUIRED.** |
| **C · External secret manager** | Similar to B | High — new vendor, new failure domain, new cost | Network dependency on every calendar read | **Not justified** at this size. |
| **D · Application-level encryption with a key in Vercel env** | **Marginal.** Defeats a pure DB leak, but the key sits in the same process as the service role, so RCE gets both. Trades one plaintext store for a key that lives beside the data's reader. | Low | Key rotation is a migration | Honest assessment: **mostly theatre against the threat that matters**, unless paired with separating the privileged worker. |

**Recommendation: B, decided by the owner, with C rejected and D not mistaken for a fix.** No
infrastructure was added in this session.

---

## 4. Service role — can the blast radius actually be reduced?

| Option | Practical? | Assessment |
| --- | --- | --- |
| **1 · Keep current architecture** | — | Residual risk: RCE in *any* function ⇒ full database. Quantified below. |
| **2 · Separate privileged functions in the same Vercel project** | **No** | Vercel environment variables are scoped per project and environment, not per function. `vercel.json` has no `env`/`functions` block, and none is available. Every function's `process.env` contains the key regardless of whether its code uses it. **This option does not exist on this platform.** |
| **3 · Separate Vercel project for privileged jobs** | **Yes, and it is the real answer** | Crons and admin move to their own deployment that alone holds the service-role key; user-facing routes keep only the anon key and operate under RLS. Cost: a second project, a shared-secret call path for the few user-facing routes that genuinely need elevation (`/api/group`, `/api/users/search`, the OAuth callbacks — chat is no longer among them, see §7), and a deployment-coupling change. **Meaningful containment, real migration risk, owner decision.** |
| **4 · Supabase scoped keys** | **Unknown** | Supabase has been rolling out a publishable/secret key model with narrower scopes. This project is on `@supabase/supabase-js ^2.45.0`; whether the project is opted in cannot be determined from the repository. **OPERATIONAL VERIFICATION REQUIRED** — if available, this is the cheapest real improvement. |

**Honest conclusion:** the credential is already contained *in code* — one construction module, an
architecture rule, no second factory — and that containment does nothing for RCE. Reducing call
sites is not a security measure. The only options that move the needle are 3 and 4, and both are
infrastructure decisions rather than Phase 3 changes. **No architectural change was made here.**

### What normal request handling actually needs

Of the user-facing routes, only a few use elevated access, each for a narrow reason:
`/api/group` (serve a share-link holder by UUID), `/api/users/search` (`auth.admin.listUsers` for
exact email/phone), and `/api/chat` (one memory upsert, id from the verified session). Everything
else that touches user data uses the caller's own client under RLS. That is a good baseline for
option 3 if it is ever taken: the privileged surface of the user-facing tier is small and named.

---

## 5. Production-only RLS — what CI can and cannot see

`conversations`, `user_memory` and `profiles` have RLS only in production. Two removal paths, and
they are now treated differently:

- **In a migration** — covered. The new **G6** rule fails CI when a sensitive table has RLS
  disabled, or loses a policy with nothing replacing it in the same file. A DROP paired with a
  CREATE is a replace and passes, which is the legitimate shape. Verified both ways.
- **In the Supabase dashboard** — **not detectable from CI.** This is an infrastructure limitation,
  stated rather than papered over. The owner verification query is in `V3_THREAT_MODEL.md` §D I-1.

Together with **G5** (a world-readable SELECT policy on a non-allowlisted table is an error), the
realistic in-repo regressions for S-1's and I-1's classes now fail the build with the reason
attached.

---

## 6. Database leak — damage tiers

| Tier | Data | Extra protection beyond DB/RLS |
| --- | --- | --- |
| **1 · Live credentials** | `user_integrations.access_token` / `refresh_token` (Google, Zalo) | **None.** Revocation on disconnect (C-1) now bounds the *set*, not the exposure. |
| **2 · Highly sensitive personal** | `group_members.dietary_restrictions` + name + area; calendar-derived memory | RLS only (S-1 closed the anon path) |
| **3 · Private conversations / memory** | `conversations.messages`, `user_memory` | RLS only — and that RLS is production-only (§5) |
| **4 · Business-sensitive** | `audit_log`, analytics rollups, moderation | RLS + RBAC; audit chain is hash-linked |
| **5 · Ordinary personal** | profile rows, preferences, price watches | RLS |
| **6 · Public** | reviews, comments, likes, follows, music catalogue | intentionally public |

Only Tier 1 is a *secondary* breach — data that opens a door somewhere else. That is why it is the
one ranked above private conversations here, despite conversations being more voluminous and more
intimate.

---

## 7. Closure pass — what changed, and what could not

### The chat route no longer performs a privileged operation

`/api/chat` held one `createAdminClient()` call: the memory upsert. It is now the request-scoped
client (`evidenceDb`) that `getRequestUser` already built — the same client this route has used
for the evidence RPCs all along.

The original comment justified the service role with "a fresh cookie client would have no session
under Bearer-token auth". That is true of `createClient()` and not of the request-scoped client,
which carries the caller's session on both the cookie and the Bearer path.

**Safe by evidence rather than by hope:** `/api/onboarding` already creates a user's FIRST memory
row under RLS, and `/api/memory` PATCH updates one. Owner INSERT and UPDATE therefore both work
in production today; this route was the outlier.

Two things it buys, and neither is "it stops an RCE" — the key is still in the process env:

1. **Memory writes now have two layers instead of one.** Previously the sole guarantee against a
   cross-user memory write here was `updateMemory` spreading the patch *before* pinning `user_id`.
   That ordering is correct and tested, but it was alone. Under the caller's client, RLS refuses a
   row that is not theirs even if that ordering were ever broken.
2. **It makes the separate-deployment option real for the route that matters most.** While chat
   needed the service role, the most-attacked surface in the product could not have moved to a
   tier that does not hold it.

Locked by the `no-privileged-client-in-chat` architecture rule, verified to fire: restoring the
call reports one violation.

### What could NOT be verified from the repository

| Question | Status |
| --- | --- |
| Does this Supabase project support scoped/secret keys, restricted keys, or Vault? | **REQUIRES LIVE SUPABASE PROJECT VERIFICATION.** The repository shows `@supabase/supabase-js ^2.45.0` and a single service-role credential. Nothing here establishes which key models the project is opted into, and I will not infer it. |
| Can privileged functions be split within this Vercel project? | **No — established, not assumed.** Vercel scopes env vars per project/environment; `vercel.json` has no `env` or `functions` block and none is available. |
| Does Zalo offer token revocation? | **UNVERIFIED.** No endpoint invented. |
| Has production RLS drifted on `conversations` / `user_memory` / `profiles`? | **Not detectable from CI.** Owner query in `V3_THREAT_MODEL.md` §D I-1. |

### Operational follow-ups, in priority order

1. **Check whether Supabase scoped/secret keys are available on this project.** One dashboard
   look. If they are, it is the cheapest material reduction of the RCE blast radius available —
   a key that cannot bypass RLS for the user-facing tier.
2. **Run the RLS verification query** for the three production-only tables.
3. **Decide on Vault** for `user_integrations.access_token` / `refresh_token`. It defeats a
   read-only database or backup leak — the threat that actually matters for these two columns —
   and does not defeat RCE or service-role compromise, because the same code path would decrypt.
4. **Consider a separate deployment** for crons + admin. The user-facing privileged surface is now
   `/api/group`, `/api/users/search`, and the OAuth callbacks — chat is out of that set as of this
   pass.
5. **Confirm Zalo revocation** and, if it exists, mirror the Google change.
