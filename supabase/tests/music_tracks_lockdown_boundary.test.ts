import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// music_tracks lockdown — ordinary roles can neither read nor write the borrowed-
// track catalogue after music reuse is retired; the data is kept and service_role
// keeps access. Proves the forward migration closes the surface and the rollback
// reopens it, on a DB that models Supabase's default grants (so the REVOKE isn't
// vacuous — the same guard 20260818b/ADR-019 use).

const REPO = join(__dirname, '..', '..')
const FORWARD = readFileSync(join(REPO, 'supabase/migrations/20260921_music_tracks_lockdown.sql'), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20260921_music_tracks_lockdown_rollback.sql'), 'utf8')
const PORT = 54363

// Models the pre-migration state: the table born fully open (Supabase default
// grants to anon/authenticated/service_role), then the four ordinary-role policies.
const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;

  -- The restrictive policy the rollback recreates depends on this; a stub is enough here.
  CREATE FUNCTION public.fn_original_sound_is_servable(p_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $fn$ SELECT true $fn$;

  CREATE TABLE public.music_tracks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL DEFAULT 't',
    is_active boolean NOT NULL DEFAULT true,
    uploaded_by uuid,
    music_type text NOT NULL DEFAULT 'royalty_free',
    rights_confirmed boolean NOT NULL DEFAULT false
  );
  ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;
  INSERT INTO public.music_tracks (title) VALUES ('kept-row');

  CREATE POLICY "Anyone can read active music tracks" ON public.music_tracks FOR SELECT USING (is_active);
  CREATE POLICY music_tracks_publication_boundary ON public.music_tracks AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (public.fn_original_sound_is_servable(id));
  CREATE POLICY "Users publish own original sound" ON public.music_tracks FOR INSERT WITH CHECK (auth.uid() = uploaded_by AND music_type = 'original_sound' AND rights_confirmed = true);
  CREATE POLICY "Uploader can deactivate own track" ON public.music_tracks FOR UPDATE USING (auth.uid() = uploaded_by) WITH CHECK (auth.uid() = uploaded_by);
`

let pg: EmbeddedPostgres
let db: Client
let dataDir: string
const one = async <T>(sql: string): Promise<T> => (await db.query(sql)).rows[0] as T

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-mtl-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

beforeEach(async () => {
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
})

const priv = () => one<Record<string, boolean>>(`SELECT
  has_table_privilege('anon','public.music_tracks','SELECT') anon_sel,
  has_table_privilege('authenticated','public.music_tracks','SELECT') auth_sel,
  has_table_privilege('authenticated','public.music_tracks','INSERT') auth_ins,
  has_table_privilege('authenticated','public.music_tracks','UPDATE') auth_upd,
  has_table_privilege('service_role','public.music_tracks','SELECT') svc_sel,
  has_table_privilege('service_role','public.music_tracks','INSERT') svc_ins`)
const policyCount = () => one<{ n: string }>(`SELECT count(*) n FROM pg_policies WHERE tablename='music_tracks'`).then(r => Number(r.n))
const rowCount = () => one<{ n: string }>(`SELECT count(*) n FROM public.music_tracks`).then(r => Number(r.n))

describe('the pre-migration state is open (so the REVOKE is not vacuous)', () => {
  it('anon/authenticated can read + write, and four policies exist', async () => {
    expect(await priv()).toEqual({ anon_sel: true, auth_sel: true, auth_ins: true, auth_upd: true, svc_sel: true, svc_ins: true })
    expect(await policyCount()).toBe(4)
  })
})

describe('forward — music_tracks is closed to ordinary roles, kept for service_role', () => {
  beforeEach(async () => { await db.query(FORWARD); await db.query(FORWARD) /* idempotent */ })
  it('anon/authenticated hold no read or write privilege; service_role still does', async () => {
    expect(await priv()).toEqual({ anon_sel: false, auth_sel: false, auth_ins: false, auth_upd: false, svc_sel: true, svc_ins: true })
  })
  it('no policy remains (deny-by-default under RLS)', async () => {
    expect(await policyCount()).toBe(0)
    expect((await one<{ rls: boolean }>(`SELECT relrowsecurity rls FROM pg_class WHERE oid='public.music_tracks'::regclass`)).rls).toBe(true)
  })
  it('the data is retained, not deleted', async () => {
    expect(await rowCount()).toBe(1)
  })
})

describe('rollback — the ordinary-role policies and grants come back', () => {
  it('restores read/write privilege and the four policies', async () => {
    await db.query(FORWARD)
    await db.query(ROLLBACK); await db.query(ROLLBACK) /* idempotent */
    expect(await priv()).toEqual({ anon_sel: true, auth_sel: true, auth_ins: true, auth_upd: true, svc_sel: true, svc_ins: true })
    expect(await policyCount()).toBe(4)
    expect(await rowCount()).toBe(1)
  })
})
