import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// MUSIC_TRACKS PUBLICATION BOUNDARY (M1) — on a real PostgreSQL.
//
// An original sound IS its clip: `music_tracks.audio_url` is that clip's video
// file. Production, anonymous, 2026-08-18: the held clip's mp4 came back from
// /api/music/tracks?q=…, from /api/music/tracks?limit=200 and from PostgREST
// directly, all while `reviews.publication_state` already said UNDER_REVIEW.
//
// This suite exists to pin down THREE things, two of which are counter-intuitive
// enough that the first drafted migration got them wrong:
//
//   1. the containment itself, and the orphan carve-out (Owner, Option A)
//   2. SECURITY DEFINER is load-bearing — an inline EXISTS leaks, and leaks
//      MORE the safer `reviews` becomes
//   3. EXECUTE must stay GRANTED — revoking it does not harden anything, it
//      takes the whole music library down with 42501
//
// Both migrations are loaded together, because the interesting failure mode of
// (2) only appears once `reviews` has its own boundary.
//
// 🚨 Same caveat as publication_boundary_rls.test.ts: `reviews` and
// `music_tracks` have no CREATE TABLE in this repository, so the BASELINE below
// RECONSTRUCTS the documented production shape. This proves behaviour, not
// production's policy set — which nobody has been able to read.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const REVIEWS_BOUNDARY = readFileSync(
  join(REPO, 'supabase/migrations/20260818_publication_boundary_rls.sql'), 'utf8')
const MUSIC_BOUNDARY = readFileSync(
  join(REPO, 'supabase/migrations/20260818b_music_tracks_publication_boundary.sql'), 'utf8')

// 🚨 C52 — was 54350, the SAME port `c8_event_outbox.test.ts` uses. Vitest runs suites in
// parallel, so whichever started second found the port held by the first, its `beforeAll` threw,
// and the whole file failed — intermittently, depending on scheduling. Two consecutive full runs
// of an unchanged tree reported different results because of this.
//
// Every other embedded-Postgres suite already has its own port; this one was the duplicate.
const PORT = 54351

const HELD_TRACK = '11111111-1111-4111-8111-111111111111'
const ORPHAN_TRACK = '22222222-2222-4222-8222-222222222222'
const PUB_TRACK = '33333333-3333-4333-8333-333333333333'
const LEGACY_TRACK = '44444444-4444-4444-8444-444444444444'
const LIBRARY_TRACK = '55555555-5555-4555-8555-555555555555'
const NULLTYPE_TRACK = '66666666-6666-4666-8666-666666666666'
const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const OTHER = 'f9077a52-b0f3-453a-a497-97da115ae386'

const NAME: Record<string, string> = {
  [HELD_TRACK]: 'HELD', [ORPHAN_TRACK]: 'ORPHAN', [PUB_TRACK]: 'PUBLISHABLE',
  [LEGACY_TRACK]: 'LEGACY', [LIBRARY_TRACK]: 'LIBRARY', [NULLTYPE_TRACK]: 'NULL_TYPE',
}

const BASELINE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;

  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  CREATE TABLE public.reviews (
    id uuid PRIMARY KEY, user_id uuid NOT NULL, music jsonb,
    is_hidden boolean DEFAULT false,
    publication_state text CHECK (publication_state IN ('UNDER_REVIEW','PUBLISHED','RESTRICTED')));

  -- Column set from the live production schema (PostgREST OpenAPI, 2026-08-18).
  CREATE TABLE public.music_tracks (
    id uuid PRIMARY KEY, title text, artist text, duration_sec integer,
    audio_url text, preview_url text, cover_url text,
    is_active boolean NOT NULL DEFAULT true, music_type text,
    uploaded_by uuid, rights_confirmed boolean NOT NULL DEFAULT false);

  ALTER TABLE public.reviews      ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;
  GRANT SELECT ON public.reviews, public.music_tracks TO anon, authenticated, service_role;

  -- Reconstructed production baseline.
  CREATE POLICY "Read visible reviews"       ON public.reviews FOR SELECT USING (NOT is_hidden);
  CREATE POLICY "Owners can see own reviews" ON public.reviews FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY "Anyone can read active music tracks"
    ON public.music_tracks FOR SELECT USING (is_active);

  INSERT INTO public.reviews (id, user_id, music, publication_state) VALUES
    (gen_random_uuid(), '${OWNER}', '{"trackId":"${HELD_TRACK}","origin":"original"}'::jsonb,  'UNDER_REVIEW'),
    (gen_random_uuid(), '${OTHER}', '{"trackId":"${PUB_TRACK}","origin":"original"}'::jsonb,   'PUBLISHED'),
    (gen_random_uuid(), '${OTHER}', '{"trackId":"${LEGACY_TRACK}","origin":"original"}'::jsonb, NULL),
    -- a borrower, not an originator: must never keep a held sound alive
    (gen_random_uuid(), '${OTHER}', '{"trackId":"${HELD_TRACK}","origin":"attached"}'::jsonb,  'PUBLISHED');
  -- ORPHAN_TRACK deliberately has NO originating review at all.

  INSERT INTO public.music_tracks (id, music_type, audio_url) VALUES
    ('${HELD_TRACK}',     'original_sound', 'held.mp4'),
    ('${ORPHAN_TRACK}',   'original_sound', 'orphan.mp4'),
    ('${PUB_TRACK}',      'original_sound', 'pub.mp4'),
    ('${LEGACY_TRACK}',   'original_sound', 'legacy.mp4'),
    ('${LIBRARY_TRACK}',  'royalty_free',   'library.mp3'),
    ('${NULLTYPE_TRACK}',  NULL,            'untyped.mp3');
`

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgmusic-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('music')
  db = pg.getPgClient('music')
  await db.connect()
}, 240_000)

afterAll(async () => {
  try { await db?.end() } catch { /* already closed */ }
  try { await pg?.stop() } catch { /* already stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

beforeEach(async () => {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE;')
  await db.query(BASELINE)
  // The reviews boundary is always in force here: the point of this suite is
  // how music_tracks behaves NEXT TO it, not instead of it.
  await db.query(REVIEWS_BOUNDARY)
})

const applyMusicBoundary = () => db.query(MUSIC_BOUNDARY)

async function tracksAs(
  role: 'anon' | 'authenticated' | 'service_role',
  uid: string | null = null,
): Promise<{ ok: true; names: string[] } | { ok: false; error: string }> {
  await db.query('BEGIN')
  try {
    await db.query(`SET LOCAL ROLE ${role}`)
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    const r = await db.query('SELECT id FROM public.music_tracks ORDER BY id')
    return { ok: true, names: r.rows.map((x) => NAME[x.id] ?? x.id).sort() }
  } catch (e: any) {
    return { ok: false, error: `${e.code} ${e.message}` }
  } finally {
    await db.query('ROLLBACK')
  }
}

const namesOf = (r: Awaited<ReturnType<typeof tracksAs>>) => (r.ok ? r.names : [`ERROR ${r.error}`])

// ---------------------------------------------------------------------------
// RED
// ---------------------------------------------------------------------------

describe('RED — music_tracks is a second door onto held media', () => {
  it('anon reads the held original sound even though the review is already contained', async () => {
    // The reviews boundary is applied in beforeEach, so the held REVIEW is
    // already invisible here. The track still is not.
    const held = await db.query(
      `SELECT count(*)::int AS n FROM public.reviews WHERE publication_state = 'UNDER_REVIEW'`)
    expect(held.rows[0].n, 'fixture sanity: a held review exists').toBe(1)

    expect(namesOf(await tracksAs('anon')), 'this is the production defect').toContain('HELD')
  })
})

// ---------------------------------------------------------------------------
// GREEN — the three cases
// ---------------------------------------------------------------------------

describe('GREEN — with the music boundary applied', () => {
  beforeEach(applyMusicBoundary)

  it('CASE held — an original sound whose clip is held is not served', async () => {
    expect(namesOf(await tracksAs('anon'))).not.toContain('HELD')
  })

  it('CASE orphan — an original sound with no originating clip keeps working', async () => {
    // 5 of production's 10 original sounds are orphans and all 5 return 200
    // today. Owner decision (Option A): this gate does not touch them.
    expect(namesOf(await tracksAs('anon'))).toContain('ORPHAN')
  })

  it('CASE publishable — PUBLISHED and legacy NULL origins are both served', async () => {
    const names = namesOf(await tracksAs('anon'))
    expect(names).toContain('PUBLISHABLE')
    expect(names).toContain('LEGACY')
  })

  it('a library track is untouched — holding a borrower must not take a song down', async () => {
    expect(namesOf(await tracksAs('anon'))).toContain('LIBRARY')
  })

  it('a NULL music_type with no originating clip is served', async () => {
    expect(namesOf(await tracksAs('anon'))).toContain('NULL_TYPE')
  })

  it('🚨 an uploader cannot escape the boundary by rewriting their own music_type', async () => {
    // `20260711_music_ugc_combined.sql` gives the uploader a WHOLE-ROW UPDATE
    // on their own track ("Uploader can deactivate own track", no column
    // restriction). So `music_type` is attacker-controlled, and any predicate
    // that short-circuits on it is a bypass with extra steps. Mutation testing
    // surfaced this: weakening the branch to `<>` changed nothing observable.
    for (const forged of ['royalty_free', null]) {
      await db.query(`UPDATE public.music_tracks SET music_type = $1 WHERE id = $2`,
        [forged, HELD_TRACK])
      expect(
        namesOf(await tracksAs('anon')),
        `music_type = ${forged} must not unlock a held clip's media`,
      ).not.toContain('HELD')
    }
  })

  it('a PUBLISHED borrower does not keep a held original sound alive', async () => {
    // The fixture has a published clip using HELD_TRACK with origin='attached'.
    // Only the ORIGINATOR decides: the media belongs to the held clip either way.
    expect(namesOf(await tracksAs('anon'))).not.toContain('HELD')
  })

  it('an authenticated non-owner is treated exactly like anon', async () => {
    const names = namesOf(await tracksAs('authenticated', OTHER))
    expect(names).not.toContain('HELD')
    expect(names).toContain('ORPHAN')
  })

  it('service_role still reads everything — backend operations are unaffected', async () => {
    const names = namesOf(await tracksAs('service_role'))
    for (const n of ['HELD', 'ORPHAN', 'PUBLISHABLE', 'LEGACY', 'LIBRARY', 'NULL_TYPE']) {
      expect(names, `service_role must still read ${n}`).toContain(n)
    }
  })

  it('the author of the held clip does NOT get their own sound back', async () => {
    // Documented, not accidental: the predicate takes no account of auth.uid().
    // Consistent with today (the author cannot see their held review either).
    // Changing it is a Phase 2 decision about owner visibility, not Phase 0.
    expect(namesOf(await tracksAs('authenticated', OWNER))).not.toContain('HELD')
  })
})

// ---------------------------------------------------------------------------
// Why the design is shaped the way it is
// ---------------------------------------------------------------------------

describe('SECURITY DEFINER is load-bearing, not style', () => {
  it('the obvious inline-EXISTS policy LEAKS, and leaks because reviews is contained', async () => {
    // 🚨 This is the trap the first draft fell into. A subquery inside a policy
    // is evaluated with the QUERYING role's row security applied to the
    // referenced table. anon cannot see the held review, so the subquery reports
    // "no originating clip" — i.e. ORPHAN — and serves the track. The safer
    // `reviews` gets, the more this leaks.
    await db.query(`
      CREATE POLICY naive_boundary ON public.music_tracks
        AS RESTRICTIVE FOR SELECT TO anon, authenticated
        USING (
          music_type IS DISTINCT FROM 'original_sound'
          OR NOT EXISTS (SELECT 1 FROM public.reviews r
                          WHERE r.music->>'trackId' = music_tracks.id::text
                            AND r.music->>'origin' = 'original')
          OR EXISTS (SELECT 1 FROM public.reviews r
                      WHERE r.music->>'trackId' = music_tracks.id::text
                        AND r.music->>'origin' = 'original'
                        AND (r.publication_state IS NULL OR r.publication_state = 'PUBLISHED')));`)

    expect(
      namesOf(await tracksAs('anon')),
      'without SECURITY DEFINER the held track is still served',
    ).toContain('HELD')
  })

  it('the definer function sees what the querying role cannot', async () => {
    await applyMusicBoundary()
    await db.query('BEGIN')
    await db.query('SET LOCAL ROLE anon')
    await db.query(`SELECT set_config('request.jwt.claim.sub', '', true)`)
    const visible = await db.query('SELECT count(*)::int AS n FROM public.reviews')
    const verdict = await db.query(
      `SELECT public.fn_original_sound_is_servable($1::uuid) AS servable`, [HELD_TRACK])
    await db.query('ROLLBACK')

    expect(visible.rows[0].n, 'anon cannot see the held review').toBe(3)
    expect(verdict.rows[0].servable, 'yet the predicate still knows it is held').toBe(false)
  })
})

describe('EXECUTE must stay granted — revoking it is an outage, not a hardening', () => {
  beforeEach(applyMusicBoundary)

  it('the grant is present after the migration', async () => {
    const r = await db.query(
      `SELECT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_ok,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='fn_original_sound_is_servable'`)
    expect(r.rows[0]).toEqual({ anon_ok: true, auth_ok: true })
  })

  it('revoking EXECUTE breaks EVERY read of music_tracks with 42501', async () => {
    // 🚨 The standing rule "revoke SECURITY DEFINER functions from anon,
    // authenticated" does NOT apply to a policy predicate. A policy expression
    // runs with the querying role's privileges, so the revoke does not harden
    // the function — it removes the caller's ability to be evaluated at all.
    await db.query(
      `REVOKE EXECUTE ON FUNCTION public.fn_original_sound_is_servable(uuid) FROM anon, authenticated;`)

    const r = await tracksAs('anon')
    expect(r.ok, 'a revoke here takes the whole music library down').toBe(false)
    if (!r.ok) expect(r.error).toContain('42501')
  })

  it('the function is granted to nobody wider than anon/authenticated', async () => {
    const r = await db.query(
      `SELECT COALESCE(array_to_string(p.proacl, ' '), '<default>') AS acl
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='fn_original_sound_is_servable'`)
    expect(r.rows[0].acl, 'PUBLIC must have been revoked').not.toMatch(/(^| )=X/)
  })
})

describe('mechanism and reversibility', () => {
  beforeEach(applyMusicBoundary)

  it('the policy is RESTRICTIVE and scoped to the two request roles', async () => {
    const r = await db.query(
      `SELECT permissive, cmd, roles::text FROM pg_policies
        WHERE schemaname='public' AND tablename='music_tracks'
          AND policyname='music_tracks_publication_boundary'`)
    expect(r.rows[0]?.permissive).toBe('RESTRICTIVE')
    expect(r.rows[0]?.cmd).toBe('SELECT')
    expect(r.rows[0]?.roles).toContain('anon')
    expect(r.rows[0]?.roles).toContain('authenticated')
  })

  it('it narrows a permissive policy it has never heard of', async () => {
    await db.query(`CREATE POLICY "some policy nobody told us about"
                      ON public.music_tracks FOR SELECT USING (true)`)
    expect(namesOf(await tracksAs('anon'))).not.toContain('HELD')
  })

  it('the migration is re-runnable', async () => {
    await applyMusicBoundary()
    await applyMusicBoundary()
    expect(namesOf(await tracksAs('anon'))).not.toContain('HELD')
  })

  it('rollback restores the previous behaviour and deletes no row', async () => {
    await db.query(`
      DROP POLICY IF EXISTS music_tracks_publication_boundary ON public.music_tracks;
      DROP FUNCTION IF EXISTS public.fn_original_sound_is_servable(uuid);`)
    expect(namesOf(await tracksAs('anon'))).toContain('HELD')
    const n = await db.query('SELECT count(*)::int AS n FROM public.music_tracks')
    expect(n.rows[0].n).toBe(6)
  })
})

describe('FORCE ROW LEVEL SECURITY — the stated precondition', () => {
  it('containment holds while the function owner is exempt from reviews RLS', async () => {
    // Production's relforcerowsecurity is UNKNOWN (pg_class unreadable), so the
    // migration states this as a precondition to check at apply time. Here the
    // owner is a BYPASSRLS role, which is the case the migration assumes.
    await db.query('ALTER TABLE public.reviews FORCE ROW LEVEL SECURITY')
    await applyMusicBoundary()
    expect(namesOf(await tracksAs('anon'))).not.toContain('HELD')
  })
})
