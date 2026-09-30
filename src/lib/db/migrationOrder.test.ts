/**
 * security-audit M2 — the migration apply order is a checked-in fact, not a file-name accident.
 *
 * 22 legacy migrations (add_*.sql) have no date prefix. Replayed by FILE NAME they run after every
 * dated migration, which reopens policies the history closed — e.g. group_members
 * "Anyone can join a group" WITH CHECK (true) — and turns SECURITY DEFINER counter functions back
 * into INVOKER. They are applied in production and are not renamed; supabase/MIGRATION_ORDER.txt is
 * the order to use instead, and this suite keeps it complete and safe.
 *
 * The replay here is static (CREATE/DROP POLICY and CREATE FUNCTION, in textual order per file):
 * enough to see which policies and function modes survive a given order, without a database.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MANIFEST_FILE = 'supabase/MIGRATION_ORDER.txt'
const MIGRATIONS_DIR = 'supabase/migrations'

/** Frozen: the legacy files without a date prefix. A NEW undated migration fails the naming test. */
const LEGACY_UNDATED = [
  'add_billing_customers_isolation.sql', 'add_counter_security_definer.sql', 'add_event_type_check.sql',
  'add_explore_upgrade.sql', 'add_gatea_db_hardening.sql', 'add_group_members_auth.sql', 'add_groups.sql',
  'add_memory_columns.sql', 'add_message_feedback.sql', 'add_music_attribution.sql', 'add_original_sound_ugc.sql',
  'add_phase4.sql', 'add_phase4_hardening.sql', 'add_preferences.sql', 'add_price_watches.sql', 'add_profile_edit.sql',
  'add_profiles_email_isolation.sql', 'add_review_social.sql', 'add_social_week2.sql', 'add_tracking_integrations.sql',
  'add_user_language_preference.sql', 'add_user_preference_profile.sql',
]
/** YYYYMMDD or a Supabase CLI timestamp YYYYMMDDHHMMSS, an optional letter, then a snake_case name. */
const DATED = /^\d{8}(\d{6})?[a-z]?_[a-z0-9_]+\.sql$/

/**
 * Frozen: what replaying by FILE NAME gets wrong today, all caused by the legacy files above.
 * Each entry is closed in manifest order (asserted below). Anything NOT on these lists that a
 * file-name replay reopens is a NEW hazard and fails the build.
 */
const KNOWN_NAME_ORDER_REOPENS = [
  'group_members/anyone can join a group',        // WITH CHECK (true)  — add_groups.sql vs add_group_members_auth.sql
  'group_members/anyone can read group members',  // USING (true)       — add_groups.sql vs 20260904_group_read_boundary.sql
  'groups/anyone can read groups',                // USING (true)       — same
  'music_tracks/uploader can deactivate own track', // UGC write        — add_original_sound_ugc.sql vs the music lockdown
  'music_tracks/users publish own original sound',  // UGC write        — same
  'review_likes/anyone can read likes',           // USING (true)       — add_review_social.sql vs 20260915b_review_likes_private.sql
]
const KNOWN_NAME_ORDER_INVOKER = [
  'update_follow_counts', 'update_review_comment_count', 'update_review_like_count', 'update_review_save_count',
]

const read = (f: string) => fs.readFileSync(f, 'utf8')
const manifest = read(MANIFEST_FILE).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
const onDisk = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))

type Replay = { policies: Map<string, string>; definer: Map<string, boolean> }

/** Replays policies and function security modes over `files`, statements in textual order per file. */
function replay(files: string[]): Replay {
  const policies = new Map<string, string>()
  const definer = new Map<string, boolean>()
  for (const f of files) {
    const sql = read(f).replace(/--[^\n]*/g, ' ').toLowerCase()
    const events: Array<{ at: number; drop: boolean; key: string; body: string }> = []
    for (const m of sql.matchAll(/create\s+policy\s+("[^"]+"|[a-z_0-9]+)\s+on\s+(?:public\.)?"?([a-z_0-9]+)"?([\s\S]*?);/g)) {
      events.push({ at: m.index!, drop: false, key: `${m[2]}/${m[1].replace(/"/g, '')}`, body: m[3].replace(/\s+/g, ' ').trim() })
    }
    for (const m of sql.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?("[^"]+"|[a-z_0-9]+)\s+on\s+(?:public\.)?"?([a-z_0-9]+)"?/g)) {
      events.push({ at: m.index!, drop: true, key: `${m[2]}/${m[1].replace(/"/g, '')}`, body: '' })
    }
    for (const e of events.sort((a, b) => a.at - b.at)) {
      if (e.drop) policies.delete(e.key)
      else policies.set(e.key, e.body)
    }
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)(\$\w*\$)([\s\S]*?)\3([^;]*);/g)) {
      definer.set(m[1], /security\s+definer/.test(`${m[2]} ${m[5]}`))
    }
  }
  return { policies, definer }
}

const byManifest = replay(manifest)
const byName = replay(['supabase-schema.sql', ...[...onDisk].sort().map((f) => `${MIGRATIONS_DIR}/${f}`)])

describe('the manifest is complete', () => {
  it('starts with the base schema, then lists every migration exactly once', () => {
    expect(manifest[0]).toBe('supabase-schema.sql')
    const listed = manifest.slice(1)
    expect(new Set(listed).size, 'a migration is listed twice').toBe(listed.length)
    expect(listed.map((p) => path.posix.basename(p)).sort()).toEqual([...onDisk].sort())
    for (const p of listed) expect(p.startsWith(`${MIGRATIONS_DIR}/`), p).toBe(true)
  })
})

describe('naming — every new migration carries a date prefix', () => {
  it('the only undated migrations are the frozen legacy files', () => {
    expect(onDisk.filter((f) => !DATED.test(f)).sort()).toEqual([...LEGACY_UNDATED].sort())
  })

  it('dated migrations appear in the manifest in name order (new ones are appended)', () => {
    const dated = manifest.slice(1).map((p) => path.posix.basename(p)).filter((f) => DATED.test(f))
    expect(dated).toEqual([...dated].sort())
  })
})

describe('order — building by file name must not reopen anything new', () => {
  it('replaying the MANIFEST keeps every closed policy closed', () => {
    for (const key of KNOWN_NAME_ORDER_REOPENS) expect(byManifest.policies.has(key), key).toBe(false)
    const openToAll = [...byManifest.policies].filter(([key, body]) =>
      /^(groups|group_members|review_likes)\//.test(key) && /(using|check)\s*\(\s*true\s*\)/.test(body))
    expect(openToAll).toEqual([])
  })

  it('replaying the MANIFEST keeps the counter functions SECURITY DEFINER', () => {
    for (const fn of KNOWN_NAME_ORDER_INVOKER) expect(byManifest.definer.get(fn), fn).toBe(true)
  })

  it('file-name order reopens ONLY the known legacy policies — a new hazard fails here', () => {
    const reopened = [...byName.policies.keys()].filter((k) => !byManifest.policies.has(k)).sort()
    expect(reopened).toEqual([...KNOWN_NAME_ORDER_REOPENS].sort())
  })

  it('file-name order demotes ONLY the known legacy functions to INVOKER', () => {
    const demoted = [...byManifest.definer].filter(([fn, d]) => d && byName.definer.get(fn) === false).map(([fn]) => fn).sort()
    expect(demoted).toEqual([...KNOWN_NAME_ORDER_INVOKER].sort())
  })

  it('the two orders agree on everything else', () => {
    const onlyInManifest = [...byManifest.policies.keys()].filter((k) => !byName.policies.has(k))
    const changedBody = [...byManifest.policies].filter(([k, body]) => byName.policies.has(k) && byName.policies.get(k) !== body).map(([k]) => k)
    expect(onlyInManifest).toEqual([])
    expect(changedBody).toEqual([])
  })
})
