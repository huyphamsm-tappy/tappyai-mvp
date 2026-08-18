# Runbook — Publication Boundary, Phase 0

**Status:** ✅ **EXECUTED on production 2026-08-18** — see §9 · **Gate:** ACTIVE (unchanged by this)

> The procedure below is kept verbatim as it was authorised and run. It is now a
> record as much as an instruction: §2's preflight gates are the ones that were
> actually checked, and §4's expectations are the ones that were actually met.
> §9 records what happened.

> This runbook applies two migrations that make the content safety gate a database
> boundary instead of an application convention. It publishes nothing, restricts
> nothing, reclassifies nothing and deletes nothing. It changes the visibility of
> exactly **one review** and **one music track**, both of which are the same held
> clip.

---

## 0. Frozen artefacts

| File | SHA-256 (first 16) |
|---|---|
| `supabase/migrations/20260818_publication_boundary_rls.sql` | `86cddc1b79548627` |
| `supabase/migrations/20260818b_music_tracks_publication_boundary.sql` | `1c27a4091aa87cef` |
| `supabase/tests/publication_boundary_rls.test.ts` | `f2e18369d7c02be1` |
| `supabase/tests/music_tracks_boundary_rls.test.ts` | `67f77bbcaf0c7698` |

Local evidence at freeze: **207/207 tests** across the two boundary suites plus
`src/lib/safety` and the sound route · **20/20 mutations killed** (5 reviews
policy, 8 sound route, 7 music policy) · tsc 0 · ESLint clean.

---

## 1. What is being applied, and in what order

**Two separate transactions, verified between them.** They are independent — the
music policy does not require the reviews policy — but the reviews boundary is the
primary one and its blast radius is larger, so it goes first and is proven before
the second is touched.

| # | Migration | Effect |
|---|---|---|
| 1 | `20260818_publication_boundary_rls.sql` | RESTRICTIVE SELECT policy on `public.reviews` |
| 2 | `20260818b_music_tracks_publication_boundary.sql` | SECURITY DEFINER predicate + RESTRICTIVE SELECT policy on `public.music_tracks` |

Channel: Supabase Management API (`POST /v1/projects/<ref>/database/query`),
`ref` pinned to **`fwznnobrdctuskgrvuik`** (production). The account holds two
projects; never take the ref from a parameter.

---

## 2. PREFLIGHT — run every query, stop on any 🛑

These are the reads that have been blocked for four sessions. They must succeed
before anything is written.

### 2.1 The precondition that can make the design fail OPEN

```sql
SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class WHERE relname IN ('reviews','music_tracks');
```

🛑 **STOP if `reviews.relforcerowsecurity` is true.** With FORCE row security the
SECURITY DEFINER function's owner is subject to `reviews` policies too. An owner
satisfying no permissive SELECT policy would read zero rows, take the orphan
branch, and serve held media — a silent failure in the dangerous direction. With
FORCE off (the default) the owner is exempt and the question does not arise.

### 2.2 The policy set nobody has read yet

```sql
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('reviews','music_tracks','content_reports')
 ORDER BY tablename, policyname;
```

Record it verbatim. Two things to look for:

🛑 **STOP if a policy named `reviews_publication_boundary` or
`music_tracks_publication_boundary` already exists.** Both migrations begin with
`DROP POLICY IF EXISTS` on those exact names; a pre-existing policy under either
name would be silently replaced.

⚠️ **Note any existing RESTRICTIVE SELECT policy.** Restrictive policies AND
together, so an unknown one narrows the result further than modelled.

### 2.3 Name collision on the function

```sql
SELECT p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname = 'fn_original_sound_is_servable';
```

🛑 **STOP if it already exists** — the migration uses `CREATE OR REPLACE`.

### 2.4 Baseline the numbers

```sql
SELECT count(*) FILTER (WHERE publication_state IS NULL)           AS legacy,
       count(*) FILTER (WHERE publication_state = 'PUBLISHED')     AS published,
       count(*) FILTER (WHERE publication_state = 'UNDER_REVIEW')  AS under_review,
       count(*) FILTER (WHERE publication_state = 'RESTRICTED')    AS restricted,
       count(*)                                                    AS total
  FROM public.reviews;

SELECT music_type, count(*) FROM public.music_tracks GROUP BY music_type;
```

Expected at freeze time: reviews `5 / 0 / 1 / 0 / 6` · tracks
`royalty_free 103`, `original_sound 10`.

🛑 **STOP if these differ** — the impact calculation below was computed against
those exact rows.

---

## 3. APPLY

Each file as **one transaction**, verbatim, no edits:

```
BEGIN;  <contents of 20260818_publication_boundary_rls.sql>   COMMIT;
```

Then §4.1. Only if it passes:

```
BEGIN;  <contents of 20260818b_music_tracks_publication_boundary.sql>  COMMIT;
```

Then §4.2.

---

## 4. POST-APPLY VERIFICATION

### 4.1 After migration 1 — `reviews`

```sql
-- the policy exists and is RESTRICTIVE, SELECT, scoped to the two request roles
SELECT policyname, permissive, cmd, roles::text, qual
  FROM pg_policies
 WHERE schemaname='public' AND tablename='reviews'
   AND policyname='reviews_publication_boundary';
```

Then, with the **anon key** (not service role), over PostgREST:

| Check | Expected |
|---|---|
| `GET /rest/v1/reviews?select=id` | **5 rows** (was 6) |
| `GET /rest/v1/reviews?select=id&id=eq.82ee2711-877c-4f7d-a84e-4813db2649f3` | **`[]`** |
| same query with the **service-role key** | **1 row** — backend unaffected |
| `GET https://www.tappyai.com/api/reviews/feed?page=0&limit=12` | still returns reviews |

🚨 **Feed pages from 0.** `?page=1` asks for rows 12–23 of a 5-row set and returns
`[]`, which looks exactly like an outage. Always check `page=0`.

### 4.2 After migration 2 — `music_tracks`

```sql
SELECT policyname, permissive, cmd, roles::text FROM pg_policies
 WHERE schemaname='public' AND tablename='music_tracks'
   AND policyname='music_tracks_publication_boundary';

-- 🚨 the grant that must NOT be revoked
SELECT has_function_privilege('anon','public.fn_original_sound_is_servable(uuid)','EXECUTE') AS anon_ok,
       has_function_privilege('authenticated','public.fn_original_sound_is_servable(uuid)','EXECUTE') AS auth_ok;
```

Both must be `true`. If either is false, every read of `music_tracks` fails with
`42501` and the music library, the sound pages and the composer picker are down.

Anon key, over PostgREST and HTTP:

| Check | Expected |
|---|---|
| `GET /rest/v1/music_tracks?select=id` | **112 rows** (was 113) |
| `GET /rest/v1/music_tracks?id=eq.e182484c-6155-4f17-b045-72ead9faf1e4` | **`[]`** |
| `GET /api/music/tracks?q=Âm thanh gốc` | must **not** contain `YSw3eCw4lKFCfCfw4wBcfvCk.mp4` |
| `GET /api/music/tracks?limit=200` | **112 tracks**, none of them the held one |
| `GET /api/sound/e182484c-6155-4f17-b045-72ead9faf1e4` | **404** |

Then walk every original sound. Get the list — do not transcribe ids by hand:

```sql
SELECT t.id,
       (SELECT count(*) FROM public.reviews r
         WHERE r.music->>'trackId' = t.id::text
           AND r.music->>'origin'  = 'original')                         AS origin_clips,
       (SELECT count(*) FROM public.reviews r
         WHERE r.music->>'trackId' = t.id::text
           AND r.music->>'origin'  = 'original'
           AND (r.publication_state IS NULL
                OR r.publication_state = 'PUBLISHED'))                   AS publishable_origins
  FROM public.music_tracks t
 WHERE t.music_type = 'original_sound'
 ORDER BY origin_clips, t.id;
```

Measured at freeze: 10 rows — **5 with `origin_clips = 0`** (orphans),
**4 with `publishable_origins >= 1`**, **1 with `origin_clips = 1` and
`publishable_origins = 0`** (`e182484c…`, the held one).

| Row shape | `GET /api/sound/<id>` must be |
|---|---|
| `origin_clips = 0` (the 5 orphans) | **200** — Option A |
| `publishable_origins >= 1` (the 4) | **200** |
| `origin_clips >= 1, publishable_origins = 0` (the 1) | **404** |

🚨 The five orphans returning 200 is the regression this design was rewritten to
avoid. If any of them 404s, the orphan branch is not doing its job — roll back.

### 4.3 The check only the Owner can run

🔴 **Post one real clip.** `POST /api/reviews` does
`.insert(reviewData).select('id')`, and PostgreSQL applies SELECT policies to the
new row of an `INSERT … RETURNING`. The gate writes every new row
`UNDER_REVIEW`, so the owner branch `user_id = auth.uid()` is the only reason the
returning clause sees anything. It is covered by a test on a real PostgreSQL, but
**only a real post proves it against production's actual policy set.**

If posting fails after migration 1, roll back migration 1 immediately (§5).

---

## 5. ROLLBACK

Configuration only. Deletes nothing, reclassifies nothing, touches no user data.

```sql
-- migration 2
DROP POLICY   IF EXISTS music_tracks_publication_boundary ON public.music_tracks;
DROP FUNCTION IF EXISTS public.fn_original_sound_is_servable(uuid);

-- migration 1
DROP POLICY   IF EXISTS reviews_publication_boundary ON public.reviews;
```

After rollback the held review and its track are visible again, exactly as today.
No row is removed; `publication_state` is untouched.

---

## 6. Expected impact, computed on the real rows

| | Before | After |
|---|---|---|
| anon reads `reviews` | 6 | **5** |
| anon reads `music_tracks` | 113 | **112** |
| service_role reads | 6 / 113 | **6 / 113** — unchanged |
| author of the held clip reads their own review | 6 | **6** |
| non-original tracks blocked | — | **0** |

Exactly one review (`82ee2711`) and one track (`e182484c`) change visibility, and
they are the same clip.

---

## 7. What this does NOT close

Deliberately out of scope. None of these are made worse by applying it.

1. **GCS bucket is public-read** (`allUsers:objectViewer`). Anyone who already
   captured a media URL keeps it. Closing this means signed URLs or an ACL change.
2. **Web music picker** calls PostgREST directly from the browser
   (`useMusic.ts` → `musicRepository`), so it never passes an API route — it is
   covered by migration 2 and by nothing else. This is why M3 alone was rejected
   as a substitute.
3. **`UNDER_REVIEW` has no exit path** (Phase 1). No reviewer, no appeal, no
   re-evaluation wiring. Every new upload is held permanently.
4. **The author cannot see their own held post** on the web profile feed
   (Phase 2), nor their own original sound in the music library.
5. **`reviewer` / `admin` roles do not exist.** Internal access is service-role.

---

## 8. Standing hazards for whoever maintains this

- 🚨 **Do not revoke `EXECUTE` on `fn_original_sound_is_servable` from `anon` /
  `authenticated`.** It is a policy predicate, not an RPC. An RLS expression runs
  with the querying role's privileges, so revoking it does not harden anything —
  it returns `42501` for every read of the table. A SECURITY DEFINER exposure
  sweep will flag this function; the answer is "intentional, see the migration".
- 🚨 **Do not add a `music_type` short-circuit to the policy.** `music_type` is
  writable by the uploader (`"Uploader can deactivate own track"` is a whole-row
  UPDATE), so any predicate branching on it can be turned off by the person being
  held.
- 🚨 **Do not replace the SECURITY DEFINER call with an inline `EXISTS`.** A
  subquery in a policy is filtered by the querying role's row security, so it
  reports a held clip as an orphan — and it gets worse, not better, as `reviews`
  is secured.
- 🚨 **Do not remove the orphan branch.** Five of ten production original sounds
  have no originating clip; they return 200 today and Owner decided (Option A)
  that this gate does not touch them.

---

## 9. Execution record — production, 2026-08-18

Both migrations were applied to production **before** they reached this
repository, which is why this file and the two `supabase/migrations/*.sql`
alongside it were committed together afterwards. **They must not be applied
again**: `CREATE POLICY` is not idempotent on its own, and both files open with
`DROP POLICY IF EXISTS` precisely so a re-run replaces rather than errors — but a
re-run is still a production write with no reason to happen.

### Preflight (§2) — all gates passed

| Gate | Observed |
|---|---|
| §2.1 `reviews.relforcerowsecurity` | **`false`** — all three tables `rowsecurity=true, force=false` |
| §2.2 policy set | `reviews`: **5 policies, all PERMISSIVE, roles `{public}`** — `Read visible reviews (NOT is_hidden)`, `Owners can see own reviews`, update/delete/insert own. `music_tracks`: 3 PERMISSIVE. `content_reports`: 1 INSERT policy for `authenticated`. **No RESTRICTIVE policy existed** — the two added here are the first |
| §2.2b policy-name collision | 0 |
| §2.3 function-name collision | 0 |
| §2.4 baselines | reviews `6 / 5 legacy / 0 published / 1 under_review / 0 restricted`; tracks `royalty_free 103 · original_sound 10` |
| §2.4b original sounds | **5 orphan · 4 publishable · 1 held** |

The §2.2 reading also confirmed on production the hazard §8 warns about:
`"Uploader can deactivate own track"` is a whole-row `UPDATE` with no column
restriction, so `music_type` really is writable by the person being held.

### Apply (§3)

| Migration | SHA-256 sent | Result |
|---|---|---|
| `20260818_publication_boundary_rls.sql` (4282 B) | `86cddc1b79548627` | HTTP 201 |
| `20260818b_music_tracks_publication_boundary.sql` (8629 B) | `1c27a4091aa87cef` | HTTP 201 |

Channel: Supabase Management API, one `BEGIN … COMMIT` per file, ref pinned to
production.

### Verification (§4) — all criteria met

```
anon reviews          6 → 5          service_role reviews        6 (unchanged)
anon music_tracks   113 → 112        service_role music_tracks 113 (unchanged)
held review / held track            invisible to anon
music browse / search               no held media
5 orphan original sounds            200      4 publishable originals   200
/api/reviews/feed?page=0            still returns reviews
EXECUTE on fn_original_sound_is_servable   anon=true, authenticated=true
```

### One thing the runbook did not predict

`GET /api/sound/<held>` and `GET /api/music/tracks/<held>` kept returning **200
with the held media** after the boundary was in place, while the database
returned nothing to four different anonymous query shapes — including a
byte-identical replay of the failing call's own request URL.

Cause: `getTrackById` used `.maybeSingle()`, which asks PostgREST for a singular
object, so a zero-row result came back as **HTTP 406 / PGRST116** rather than an
empty list. An error response does not replace a stored success, so the last
good `200` kept being served. Fixed in **PR #89** (`82e332a`) by switching that
lookup to `.limit(1)` with explicit zero-row handling; both endpoints returned
`404` on the first request after deployment, with no collateral to the nine other
original sounds.

🔑 **The lesson generalises beyond this file:** any `.maybeSingle()` lookup on a
table behind a publication boundary turns "hidden" into "error", and an error is
not a value a cache will replace a success with. Prefer `.limit(1)`.

Rollback (§5) was **not** used and is not needed. Rolling back would widen
exposure, not reduce it — it reopens PostgREST, browse and search.
