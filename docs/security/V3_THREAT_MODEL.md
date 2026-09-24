# TappyAI V3 — Threat Model & Data Protection Audit

Audited tree: `integration/v3-foundation` @ `66e4c46` (Phase 0 + 1 + 2 + 3).
Phase 4 audited read-only at `design/v3-phase4` @ `30a1471`.

The repository and its tests are the source of truth. Where a fact could only be established
operationally, it is marked **UNKNOWN — NEEDS OPERATIONAL VERIFICATION** rather than assumed.

---

## A. Executive assessment

**Strong on the AI boundary, with one real data-exposure defect found and fixed, and known
operational gaps.**

The AI/egress boundary is genuinely well built: identity is server-derived, the model cannot
choose a network destination, every write goes through one audited action boundary, and all
five output channels that can render a URL are provenance-checked. That work holds up under
adversarial reading.

The defect found was **not** in the AI layer. It was an RLS policy — `group_members` published
every participant's name, area, budget and dietary restrictions to the open internet with
`USING (true)`. The lesson is the one the codebase already learned once on `reviews` in August:
**the anon key is public, so RLS is the only boundary, and `USING (true)` is not "share by
link" — it is "readable by anyone, all rows at once".**

---

## B. Attack surface map

| Surface | Reachable by | Boundary |
| --- | --- | --- |
| PostgREST with the **public anon key** | Unauthenticated internet | **RLS only** — no application code runs |
| `/api/chat` (streaming, tools, memory) | Anonymous session + accounts | JWT, quota, AI action boundary, egress guards |
| Public model endpoints (`/translate`, `/scan`, `/viet-content`) | Unauthenticated | Distributed rate limit keyed on derived IP |
| Social/content routes (reviews, comments, likes, follows) | Accounts | App checks + RLS |
| Group share-link routes | Anyone with the UUID | Capability URL + (now) scoped RLS |
| Uploads (review/audio/video/deal) | Accounts / admin | Content-type allowlist, size cap, safe keys |
| `/api/admin/*` (30 routes) | Controller roles | RBAC on every route (verified) |
| `/api/cron/*` (10 routes) | Vercel scheduler | `CRON_SECRET`, fail-closed |
| AI provider (Anthropic) | — | Receives prompt + tool results |
| Search provider (Serper/Google) | — | Receives model-chosen query text |

---

## C. Data flow and trust boundaries

```
Client (UNTRUSTED — assume fully modified)
  │  JWT ─────────────────► getRequestUser  ◄── identity is derived here, only here
  ▼
/api/chat
  │  memory / prefs / calendar / GPS  ── fenced as DATA ──┐
  │  needBrief (closed vocabulary) ──────────────────────┤
  ▼                                                      ▼
Tools (10; 9 read, 1 write) ──► runAiWriteAction ──► DB   AI PROVIDER  ◄── TRUST BOUNDARY
  │        no URL/host parameter exists                       │
  ▼                                                           ▼
Tool results (JSON, tool-role) ─────────────────────────► model output
                                                              │
                                                    ┌─────────┴─────────┐
                                                    ▼                   ▼
                                          prose (image + link      structured blocks
                                          provenance guard)        (CTA / plan host policy)
                                                    └─────────┬─────────┘
                                                              ▼
                                                     Client render  ◄── NOT a security boundary
```

Trust boundaries, in order of consequence: **client→server** (identity), **server→AI provider**
(data leaves the system), **model→output channels** (data can leave to any host), **app→database**
(RLS is the last line), **server→third-party APIs** (query text leaves).

---

## D. Findings

### S-1 · Group membership readable in bulk by the open internet — **HIGH** — FIXED

- **Component:** `supabase/migrations/add_groups.sql:10,24`; `/api/group`.
- **Boundary crossed:** unauthenticated → every user's private attributes.
- **Data at risk:** per participant — `name`, `area`, `budget`, `food_preferences`,
  **`dietary_restrictions`** (health- and religion-adjacent), plus `user_id` since
  `add_group_members_auth.sql`, which ties all of it to an account. Also every group's name and
  stored AI `suggestion`.
- **Attack:** the anon key ships in the browser bundle and the iOS app. With it,
  `GET /rest/v1/group_members?select=name,area,budget,dietary_restrictions` returns every row
  on the platform. No account, no app code, no link required — PostgREST takes the filter from
  the caller, and `USING (true)` grants the row to everyone.
- **Preconditions:** none.
- **Existing mitigation and why it was insufficient:** the application only ever read one group
  by id, so the code looked correct. RLS was the only thing standing between the table and the
  internet, and it said `true`. This same mechanism was **measured** against `reviews` on
  2026-08-18, and `add_group_members_auth.sql` had already closed the INSERT half of this very
  table under the heading "Security Issue (High)" — it simply never touched SELECT.
- **Fix:** `20260904_group_read_boundary.sql` scopes SELECT to the group's creator and its
  members, `TO authenticated` (so `anon` is out of the policy entirely), via a SECURITY DEFINER
  participant test that breaks the mutual `groups`↔`group_members` policy recursion. The share
  link keeps working because `/api/group?id=…` now reads through the service role keyed by the
  UUID it was given — the capability becomes the unguessable id, which is what the feature
  always meant.
- **Regression test:** `supabase/tests/group_read_boundary.test.ts` — 11 cases across the four
  real callers (anon, outsider, member, creator), including "knowing the id must not help".
- **Residual risk:** anyone holding the share link still sees the group. That is the feature.

### M-1 · User search queries and locations written to production logs — **MEDIUM** — reported, not changed

- **Component:** `src/app/api/chat/route.ts:916` (`tappyai_tool_called` logs `query` and
  `location`); `src/lib/ai/tools/weather.ts:73` logs the requested place.
- **Data at risk:** search intent and approximate location — in this product that includes
  dietary, medical and religious searches — correlatable per request.
- **Why it matters:** the codebase deliberately built an allow-listed telemetry vocabulary and
  calls it "a privacy surface". A raw `console.log` bypasses that discipline entirely, and log
  retention/access is not defined anywhere in the repository.
- **Recommendation:** drop the raw `query`/`location` values, keep tool name and
  `hasLocationBias`. **Not changed here** because it removes a diagnostic the team may rely on —
  that is an operational decision, not a security-forced one.

### L-1 · Group member fields reach a model prompt unfenced — **LOW**

- **Component:** `/api/group/[id]/suggest` interpolates member `name`/`budget`/
  `food_preferences`/`dietary_restrictions`/`area` raw into the prompt.
- **Assessed and bounded:** any authenticated group member controls these, so injection is
  possible — but the result renders as **plain text** (`whitespace-pre-wrap`, React-escaped, no
  markdown, no `dangerouslySetInnerHTML`), so there is no link, image or button channel. Blast
  radius is "a group member can make the suggestion say something odd to the creator".
- **Recommendation:** fence with `fenceUntrusted` if this output ever becomes markdown.

### I-1 · Three sensitive tables have no RLS in the repository — **INFORMATIONAL**

`conversations` (full chat history), `user_memory` and `profiles` have **no `CREATE TABLE`, no
`ENABLE ROW LEVEL SECURITY` and no policy anywhere in the repo** — they were applied out-of-band.
`docs/ios/05_DATABASE_CONTRACT.md:228,269` records, from **live introspection**, that
`conversations` has `Users can manage own conversations FOR ALL self` and that `user_memory` is
self-scoped. So this is not a known exposure — it is an unverifiable and untested one: nothing in
CI would notice if those policies were dropped, and 23 db boundary tests cover other tables.

**UNKNOWN — NEEDS OPERATIONAL VERIFICATION.** Owner query:

```sql
SELECT c.relname, c.relrowsecurity, p.polname, pg_get_expr(p.polqual, p.polrelid) AS using_expr
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname IN ('conversations','user_memory','profiles')
ORDER BY c.relname, p.polname;
```

### I-2 · `profiles` is world-readable by design — **INFORMATIONAL**

Two prod-only policies (`qual=true`, role `public`) make `username`, `full_name`, `avatar_url`,
counts, language and `onboarded` readable by `anon`. Documented and deliberate; `email` and
`stripe_customer_id` were moved out precisely because of it. Recorded so it is a decision on the
record, not a surprise.

### I-3 · Cron secret compared non-constant-time — **INFORMATIONAL**

`req.headers.get('authorization') !== \`Bearer ${secret}\`` is a short-circuiting comparison.
Over HTTP with network jitter this is not realistically exploitable for a high-entropy token.
Noted, not changed.

### Checked and found sound (no finding)

Identity derivation · the 10-tool registry (no URL/host parameter exists, so the model has no
network sink) · `runAiWriteAction` · memory ownership (caller set unchanged since Phase 0, all
session-derived) · all 30 admin routes gated · all 10 cron routes fail closed · uploads
(content-type allowlist, extension from the allowlisted type not the filename, size caps, safe
key segments) · the other seven `USING (true)` tables (genuinely public social content) ·
IDOR sweep of user routes (`price_watches`, `conversations`, `reviews` all double-scoped and
none report success on zero rows) · SSRF (`safeFetch`/`addressPolicy`) · telemetry allowlist ·
error messages (tools return localized product strings; exception text stays in server logs) ·
Phase 4 (adds **no new marker**; its comparison block is a pure re-presentation of the server's
own payload with no URL surface).

---

## E. The five blast-radius answers

**1. One normal user account is compromised — what is the maximum data obtainable?**
Their own data (conversations, memory, preferences, price watches, subscription), plus all
public social content, plus the public columns of every profile. Cross-user private data: none
found — every user-owned query is double-scoped and RLS is a second layer. Before S-1 they could
also read every group member's name/area/budget/dietary restrictions; after it, only groups they
belong to. **Bounded.**

**2. One application component is compromised — what is the maximum data obtainable?**
Depends entirely on which. A component holding `SUPABASE_SERVICE_ROLE_KEY` — the chat route,
crons, admin routes — bypasses RLS completely and can read **every table for every user**. There
is no per-component compartmentalisation: the service role is one credential with total database
authority, available to any code path in the same process. **This is the largest single blast
radius in the system, and it is structural.** Realistic mitigation is not "more RLS" — it is
limiting which code paths hold the key. Recorded as an architectural risk, not patched.

**3. The AI is fully manipulated by prompt injection — what can it expose?**
To the *current user*: whatever is already in that user's own context (their memory, preferences,
calendar, GPS label) — which is theirs. To an *attacker*: nothing, provided the egress guards
hold. It cannot reach another user's data (authorization is outside the model), cannot choose a
network destination (no tool exposes a URL parameter), and cannot publish a URL it was not given
across any of the five rendering channels. The one remaining outbound path is model-chosen
**query text to a fixed third party** (Serper/Google) — the attacker cannot read those logs, so
it is a privacy consideration, not an exfiltration path.

**4. The AI provider is compromised — what could it possess?**
Everything sent per turn: the system rulebook, the user's message, their fenced memory,
preferences, calendar summary and GPS label, tool results, and the model's replies. Effectively a
rolling window of the user's assistant usage. **UNKNOWN — NEEDS OPERATIONAL/LEGAL VERIFICATION:**
provider retention and training terms are not established anywhere in this repository, and I will
not assert them.

**5. The database is leaked — what is exposed?**
The most sensitive corpus in the system: `conversations` (complete chat history, prompts and
replies, as JSONB), `user_memory` (inferred personal facts), `user_preferences`,
`user_integrations` (third-party tokens), `billing_customers`/`subscriptions`, `user_events`,
`audit_log`, and all social content. `profiles` no longer holds `email` or Stripe ids (moved out
deliberately). No application-level encryption exists for any of it — **UNKNOWN** whether
at-rest encryption/key management beyond Supabase defaults is configured.

---

## F. Security invariants

1. User A cannot read User B's private data.
2. Merchant/tenant separation is enforced in Controller; the AI path has no tenant dimension.
3. The AI cannot bypass authorization — it supplies arguments, never the actor.
4. The client cannot bypass authorization — identity is server-derived from a verified JWT.
5. Memory access is scoped to the authenticated owner.
6. The AI cannot create arbitrary external egress (image, link, bare URL, CTA, plan).
7. Server-side network access cannot reach private, loopback, link-local or metadata addresses.
8. Secrets never enter AI or user-visible output.
9. Security-critical failures fail closed (crons, rate limiter, URL judgement).
10. Structured UI content is not an authorization bypass — rendering is not a boundary.
11. Logs must not carry unnecessary user data. *(M-1 is currently an exception.)*
12. One compromised account has bounded blast radius.
13. **One compromised service-role component does NOT have bounded blast radius.** (See E-2.)
14. A new Phase 4 marker cannot silently bypass the egress controls.
15. **`USING (true)` is never an access-control decision for a table holding personal data** —
    it grants the row to the open internet, because the anon key is public. *(New, from S-1.)*

---

## G. Phase 4 security contract

Phase 4 must not:

- render an image, link or button from any payload the server has not filtered;
- introduce a structured marker without adding it to `STRUCTURED_MARKERS` (otherwise the prose
  guards run over its JSON and corrupt it — this happened during Phase 3);
- widen the CTA/plan schema with new URL-bearing fields without extending `guardCtaButtons` /
  `guardPlanLinks`;
- add `dangerouslySetInnerHTML` on a new surface without escaping first;
- treat any client-supplied structured content as authoritative;
- add a table or policy with `USING (true)` for anything holding personal data.
