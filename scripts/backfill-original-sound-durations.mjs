#!/usr/bin/env node
/**
 * Bug #13 — one-off data backfill: correct the historical `original_sound`
 * durations that were seeded to a hardcoded 15s by the 2026-07-11 music backfill
 * migration (supabase/migrations/20260711_music_ugc_combined.sql:158).
 *
 * The real durations were never stored (the `reviews` table has no duration
 * column), so we re-derive each clip's true length from its media file by parsing
 * the MP4/MOV `mvhd` movie-header atom (dependency-free — no ffprobe/ffmpeg).
 *
 * SCOPE (matches the approved Bug #13 ticket): DATA ONLY. This script touches
 * exactly the seeded rows and nothing else. It does NOT change the upload
 * pipeline, getVideoDuration, the server `|| 15` fallback, APIs, or UI — those are
 * a separate Technical-Debt ticket.
 *
 * Target predicate (deterministic, re-checked at write time):
 *   music_type = 'original_sound' AND duration_sec = 15 AND created_at < 2026-07-12
 *
 * Usage:
 *   node scripts/backfill-original-sound-durations.mjs            # DRY-RUN (default): probe + print, NO writes
 *   node scripts/backfill-original-sound-durations.mjs --apply    # write the corrected durations (guarded)
 *
 * Safety:
 *   - Dry-run is the default; --apply is required to write.
 *   - Every write is guarded (id + still-equals-15) so it is idempotent and cannot
 *     touch a row that was already corrected or that isn't a seeded 15.
 *   - A rollback snapshot (id -> old duration_sec) is written before any --apply.
 *   - A row whose duration can't be parsed is SKIPPED and logged (never guessed).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const CUTOFF = '2026-07-12'        // exclusive upper bound → isolates the 07-11 backfill batch
const PLACEHOLDER = 15             // the hardcoded seed value we are correcting
const MAX_BYTES = 100 * 1024 * 1024 // safety cap on media download (one-off, short clips)

// ── env (service role, read from .env.local) ─────────────────────────────────
function readEnv(key) {
  if (process.env[key]) return process.env[key]
  try {
    const raw = readFileSync(join(HERE, '..', '.env.local'), 'utf8')
    const line = raw.split(/\r?\n/).find(l => l.startsWith(key + '='))
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '')
  } catch { /* ignore */ }
  return null
}
const URL = readEnv('NEXT_PUBLIC_SUPABASE_URL')
const KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY')
if (!URL || !KEY) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

// ── dependency-free MP4/MOV duration via the `mvhd` movie-header atom ─────────
function mvhdSeconds(buf) {
  const i = buf.indexOf(Buffer.from('mvhd'))
  if (i < 0) return null                 // not an mp4/mov (e.g. webm) → caller skips
  const v = buf[i + 4]                   // version byte follows the 4-byte type
  let timescale, duration
  if (v === 1) {                         // 64-bit times
    if (i + 4 + 28 > buf.length) return null
    timescale = buf.readUInt32BE(i + 4 + 20)
    duration = Number(buf.readBigUInt64BE(i + 4 + 24))
  } else {                               // version 0, 32-bit times
    if (i + 4 + 20 > buf.length) return null
    timescale = buf.readUInt32BE(i + 4 + 12)
    duration = buf.readUInt32BE(i + 4 + 16)
  }
  if (!timescale || !duration || !isFinite(duration)) return null
  return duration / timescale
}

async function probeDuration(mediaUrl) {
  const head = await fetch(mediaUrl, { method: 'HEAD' }).catch(() => null)
  const len = head && Number(head.headers.get('content-length') || 0)
  if (len && len > MAX_BYTES) throw new Error(`media too large (${len} bytes) — skipped by safety cap`)
  const res = await fetch(mediaUrl)
  if (!res.ok) throw new Error(`fetch ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const secs = mvhdSeconds(buf)
  if (secs == null) throw new Error('no mvhd atom (unsupported container?)')
  return secs
}

// ── main ─────────────────────────────────────────────────────────────────────
const q = `music_type=eq.original_sound&duration_sec=eq.${PLACEHOLDER}&created_at=lt.${CUTOFF}` +
          `&select=id,duration_sec,created_at,audio_url&order=created_at`
const targets = await fetch(`${URL}/rest/v1/music_tracks?${q}`, { headers: H }).then(r => r.json())

console.log(`\nBug #13 backfill — mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}`)
console.log(`Targets: ${targets.length} original_sound rows (duration_sec=${PLACEHOLDER}, before ${CUTOFF})\n`)

const plan = []
for (const t of targets) {
  let derived = null, note = ''
  try {
    const secs = await probeDuration(t.audio_url)
    derived = Math.max(1, Math.round(secs))
    note = `${secs.toFixed(2)}s → ${derived}s`
  } catch (e) { note = `SKIP: ${e.message}` }
  plan.push({ id: t.id, old: t.duration_sec, new: derived, note })
  console.log(`${t.id}  ${String(t.old ?? t.duration_sec).padStart(3)}s → ${derived == null ? ' (skip)' : String(derived).padStart(3) + 's'}   ${note}`)
}

const changes = plan.filter(p => p.new != null && p.new !== p.old)
console.log(`\n${changes.length} row(s) would change; ${plan.length - changes.length} unchanged/skipped.`)

if (!APPLY) {
  console.log('\nDRY-RUN only. Re-run with --apply to write. Nothing was modified.')
  process.exit(0)
}

// snapshot BEFORE writing (rollback source of truth)
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const snapPath = join(HERE, `backfill-bug13-${stamp}.snapshot.json`)
writeFileSync(snapPath, JSON.stringify(plan, null, 2))
console.log(`\nRollback snapshot written: ${snapPath}`)

let ok = 0, fail = 0
for (const c of changes) {
  // guarded + idempotent: only writes if the row is STILL the seeded 15
  const url = `${URL}/rest/v1/music_tracks?id=eq.${c.id}&duration_sec=eq.${PLACEHOLDER}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ duration_sec: c.new }),
  })
  const rows = res.ok ? await res.json() : []
  if (res.ok && rows.length === 1) { ok++; console.log(`  ✓ ${c.id} → ${c.new}s`) }
  else { fail++; console.log(`  ✗ ${c.id} (${res.status}, matched ${rows.length})`) }
}
console.log(`\nApplied: ${ok} updated, ${fail} failed. Rollback: restore duration_sec from ${snapPath}.`)
