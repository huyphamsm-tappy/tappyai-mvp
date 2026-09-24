#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// SQL Grant Guard — Platform Hardening Phase 0
// Policy: docs/architecture/ADR-019-supabase-grant-model.md
//
// WHY THIS EXISTS
// On Supabase, `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS
// TO anon, authenticated, service_role` gives every new function an EXPLICIT
// grant to `anon` and `authenticated`, on top of PostgreSQL's PUBLIC default.
// `REVOKE ... FROM PUBLIC` removes only the latter. A SECURITY DEFINER function
// that says nothing about grants is therefore OPEN, not closed.
//
// This guard is deliberately SEPARATE from scripts/architecture/check.mjs: that
// one walks `src/` and matches content regexes against source files. Grant
// analysis needs statement-level pairing inside SQL, which is a different shape.
//
// TEMPORAL ENFORCEMENT — the policy is not retroactive.
//   ERROR  a migration created or modified in the current changeset
//   INFO   a historical migration, unchanged in the current changeset
// A legacy file becomes ERROR the moment someone touches it. That is how the
// debt retires without a mass rewrite.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

// ── G3: two allowlists, kept strictly separate ───────────────────────────────
//
// They are different KINDS of thing and must never be merged:
//   INTENTIONAL_ANON    — FUNCTION NAMES deliberately callable by `anon`.
//   LEGACY_UNCOMPLIANT  — FILE PATHS predating ADR-019.
//
// Recording a legacy file as "intentional" would write a false statement into
// the guard. The guard validates the separation itself (see validateConfig).

/** Functions deliberately reachable by `anon`. Each needs a reason. */
const INTENTIONAL_ANON = new Map([
  ['increment_deal_click', 'public deal click counter — 20260724_partner_deals_hardening.sql:76'],
  ['music_increment_play', 'public play counter — 20260711_music_ugc_combined.sql:37'],
  ['music_saved_count', 'public aggregate read — 20260706b_add_music_count_fns.sql:9'],
  ['music_followed_count', 'public aggregate read — 20260706b_add_music_count_fns.sql:14'],
  ['plan_share_public', 'public read of one published plan snapshot by capability id — 20260913_plan_shares.sql'],
  ['review_likers', 'public like list of ONE readable review, no per-user collection — 20260915b_review_likes_private.sql'],
  ['hot_places_24h', 'public aggregate read (place name + count, no user ids) — 20260915b_review_likes_private.sql'],
])

/**
 * Files that predate ADR-019 and do not meet it. Reported as INFO, never
 * blocking, and subject to the G4 ratchet: this list may shrink, never grow.
 */
const LEGACY_UNCOMPLIANT = new Set([
  // Pinned 2026-08-07 by running this guard with an empty set and recording what
  // it found. Six files, nine findings. Trigger-only migrations are absent
  // because G1 exempts trigger functions.
  //
  // These entries describe FILE compliance, not runtime privileges. Platform
  // Hardening Phase 0's migration closes four of these functions on the live
  // database; the creating files still do not declare their grants, which is
  // exactly what ADR-019's legacy transition policy permits.
  'supabase/migrations/20260711_anon_chat_usage.sql',       // REVOKE FROM PUBLIC only — the pattern Component 7 copied
  'supabase/migrations/20260713_auth_daily_rollup.sql',     // fn_sync_last_login — no GRANT/REVOKE at all
  'supabase/migrations/20260803_platform_owner.sql',        // 3 fns granted service_role only (BL-C7-01)
  'supabase/migrations/add_counter_security_definer.sql',   // sync_review_watch_stats granted authenticated only
  'supabase/migrations/add_phase4_hardening.sql',           // get_interaction_avgs — no GRANT/REVOKE at all
  'supabase/migrations/add_phase4.sql',                     // increment_review_view — closed later by add_gatea_db_hardening.sql:12
])

// ── Base reference ───────────────────────────────────────────────────────────

/** Run git, returning trimmed stdout, or null when the command fails. */
function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/**
 * PH0_GUARD_BASE_REF → origin/main → FAIL CLOSED.
 *
 * A guard that cannot tell which files changed must not silently decide that
 * nothing changed. That is an inert guard, and this repository has shipped one
 * before (Component 9a, a heredoc turned `\b` into U+0008 and CI reported 8/8
 * over a live violation).
 */
function resolveBaseRef() {
  const verify = (ref) => git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])

  // An EXPLICIT override must resolve or the guard stops. Falling back to
  // origin/main here would silently check a different diff than the operator
  // asked for — a wrong answer delivered confidently, which is worse than no
  // answer at all.
  const override = process.env.PH0_GUARD_BASE_REF
  if (override) {
    const sha = verify(override)
    return sha ? { ref: override, sha } : { failed: override }
  }

  const sha = verify('origin/main')
  return sha ? { ref: 'origin/main', sha } : { failed: 'origin/main' }
}

/**
 * Files changed against the base: committed on this branch, plus anything
 * uncommitted or untracked in the working tree. The second half exists so a
 * developer sees the verdict before committing, not after CI does.
 */
function changedFiles(baseRef) {
  const changed = new Set()

  const committed = git(['diff', '--name-only', `${baseRef}...HEAD`])
  if (committed) for (const f of committed.split('\n')) if (f) changed.add(f)

  const working = git(['status', '--porcelain', '--untracked-files=all'])
  if (working) {
    for (const line of working.split('\n')) {
      if (!line) continue
      const path = line.slice(3).trim()
      // Renames appear as "old -> new"; the new path is what we check.
      const arrow = path.indexOf(' -> ')
      changed.add(arrow === -1 ? path : path.slice(arrow + 4))
    }
  }
  return changed
}

// ── SQL parsing ──────────────────────────────────────────────────────────────

/**
 * Remove `--` line comments and block comments so documentation cannot be
 * mistaken for a statement. Limitation, stated rather than hidden: a `--`
 * inside a dollar-quoted function BODY is also stripped. Every construct this
 * guard inspects lives outside function bodies, so that is harmless here.
 */
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

/** Every SECURITY DEFINER function created in this SQL, with its return kind. */
function createdSecurityDefiners(sql) {
  const found = []
  const create = /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi
  let match
  while ((match = create.exec(sql)) !== null) {
    // The header runs from CREATE to the body delimiter. Everything the guard
    // needs — RETURNS, LANGUAGE, SECURITY DEFINER — is inside it, and nothing
    // from the body can leak in.
    const rest = sql.slice(match.index)
    const bodyAt = rest.search(/\bAS\s+\$/i)
    const header = bodyAt === -1 ? rest.slice(0, 2000) : rest.slice(0, bodyAt)

    if (!/\bSECURITY\s+DEFINER\b/i.test(header)) continue

    found.push({
      name: match[1],
      isTrigger: /\bRETURNS\s+TRIGGER\b/i.test(header),
      line: sql.slice(0, match.index).split('\n').length,
    })
  }
  return found
}

/** Every REVOKE in this SQL, with its target function and grantee list. */
function revokes(sql) {
  const found = []
  const revoke = /\bREVOKE\b([\s\S]*?);/gi
  let match
  while ((match = revoke.exec(sql)) !== null) {
    const statement = match[0]
    const target = /\bON\s+FUNCTION\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/i.exec(statement)
    const fromAt = statement.search(/\bFROM\b/i)
    const grantees = fromAt === -1 ? '' : statement.slice(fromAt + 4)

    found.push({
      fn: target ? target[1] : null,
      grantees: grantees.toLowerCase(),
      line: sql.slice(0, match.index).split('\n').length,
    })
  }
  return found
}

const namesRole = (grantees, role) => new RegExp(`\\b${role}\\b`).test(grantees)

// ── Rules ────────────────────────────────────────────────────────────────────

/**
 * G1 — a SECURITY DEFINER function created in this file must have, in the SAME
 * file, a REVOKE naming both `anon` and `authenticated`.
 *
 * Trigger functions are exempt: a direct call raises "trigger functions can only
 * be called as triggers" regardless of privilege, so a REVOKE there is a no-op
 * that would imply a hole existed (ADR-019, SECURITY DEFINER policy).
 */
function ruleG1(sql) {
  const findings = []
  const allRevokes = revokes(sql)

  for (const fn of createdSecurityDefiners(sql)) {
    if (fn.isTrigger) continue
    if (INTENTIONAL_ANON.has(fn.name)) continue

    const closed = allRevokes.some(
      (r) => r.fn === fn.name && namesRole(r.grantees, 'anon') && namesRole(r.grantees, 'authenticated')
    )
    if (!closed) {
      findings.push({
        ruleId: 'sql-security-definer-must-declare-roles',
        line: fn.line,
        text: `${fn.name}() is SECURITY DEFINER with no REVOKE naming anon and authenticated`,
        hint: `add: REVOKE EXECUTE ON FUNCTION ${fn.name}(...) FROM PUBLIC, anon, authenticated; then GRANT to only the roles that call it. See ADR-019.`,
      })
    }
  }
  return findings
}

/**
 * G2 — a REVOKE that names PUBLIC but names neither `anon` nor `authenticated`.
 *
 * Scope of this rule, stated honestly: it fires only when BOTH Supabase roles
 * are absent. `FROM PUBLIC, anon` passes, because naming `anon` shows the author
 * knows the platform model, and omitting `authenticated` is sometimes correct —
 * 20260807_platform_hardening_phase0.sql does exactly that for
 * sync_review_watch_stats, whose only caller runs as `authenticated`. A guard
 * cannot read intent; G1 is the strict rule, G2 catches the classic mistake.
 */
function ruleG2(sql) {
  const findings = []
  for (const r of revokes(sql)) {
    if (!namesRole(r.grantees, 'public')) continue
    if (namesRole(r.grantees, 'anon') || namesRole(r.grantees, 'authenticated')) continue

    findings.push({
      ruleId: 'sql-revoke-public-is-not-enough',
      line: r.line,
      text: `REVOKE ... FROM PUBLIC without naming anon or authenticated${r.fn ? ` (${r.fn})` : ''}`,
      hint: 'on Supabase this closes nothing — default privileges grant anon and authenticated explicitly. Name them. Worked example: add_gatea_db_hardening.sql:12.',
    })
  }
  return findings
}

/** G3 — the two allowlists must stay separate and well-formed. */
// ── G5: a world-readable SELECT policy on a table holding personal data ──────
//
// 🚨 THIS RULE EXISTS BECAUSE OF S-1. `add_groups.sql` published
// `group_members` — name, area, budget, dietary_restrictions, and later a
// user_id — with `FOR SELECT USING (true)`, and it read as "share by link"
// to everyone who saw it.
//
// It is not. The anon key is PUBLIC: it ships in the browser bundle and the iOS
// app. PostgREST takes the filter from the CALLER, so RLS cannot tell "asked for
// one id" from "asked for every row" — only the predicate decides, and `true`
// decides nothing. `USING (true)` therefore means "readable by anyone on the
// internet, all rows at once". The identical mechanism was MEASURED against
// `reviews` on 2026-08-18.
//
// The allowlist below is the set of tables where that is the INTENT: catalogue
// and social content that is already public in the product. Anything else must
// name a predicate. Temporal enforcement (G4) applies — historical files are
// INFO, a file you touch becomes an ERROR.

/** Tables whose rows are public product content by design. Each needs a reason. */
const PUBLIC_CONTENT_TABLES = new Map([
  ['place_photos', 'cached place imagery, no personal data'],
  ['music_categories', 'public catalogue'],
  ['music_providers', 'public catalogue'],
  ['music_tracks', 'public catalogue'],
  ['comment_reactions', 'public social signal on public comments'],
  ['review_milestones', 'public social signal'],
  ['review_likes', 'public social signal'],
  ['review_comments', 'public social content'],
  ['user_follows', 'the social graph is public in this product'],
  // 2026-09-25 (merge-loss recovery): one global row (`reachability`), no personal data, and
  // 20260906_phase6_messenger_reachability.sql REVOKEs every anon grant on the table.
  ['chat_settings', 'single global messaging-rule row, no personal data; anon has no SELECT grant'],
])

/**
 * Every `DROP POLICY <name> ON <table>` across the whole migration set, as
 * `table::name`.
 *
 * A policy a later migration removes is not a live grant, and flagging it would
 * make the guard un-silenceable: migrations are never edited retroactively, so
 * the only way to "fix" a historical `USING (true)` is exactly what
 * 20260904_group_read_boundary.sql does — drop it and create a scoped one. The
 * guard has to be able to see that, or the correct fix still fails CI.
 */
let droppedPolicies = null
function allDroppedPolicies() {
  if (droppedPolicies) return droppedPolicies
  droppedPolicies = new Set()
  for (const file of sqlFiles(MIGRATIONS)) {
    const sql = stripComments(readFileSync(file, 'utf8'))
    const re = /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|(\S+))\s+ON\s+(?:public\.)?("?[a-z_]+"?)/gi
    let m
    while ((m = re.exec(sql)) !== null) {
      const name = (m[1] ?? m[2]).replace(/"/g, '')
      droppedPolicies.add(`${m[3].replace(/"/g, '')}::${name}`)
    }
  }
  return droppedPolicies
}

function ruleG5(sql) {
  const findings = []
  const stripped = stripComments(sql)
  const dropped = allDroppedPolicies()
  // CREATE POLICY <name> ON [public.]<table> ... FOR SELECT ... USING (true)
  const re = /CREATE\s+POLICY\s+(?:"([^"]+)"|(\S+))\s+ON\s+(?:public\.)?("?[a-z_]+"?)([\s\S]*?);/gi
  let m
  while ((m = re.exec(stripped)) !== null) {
    const policy = (m[1] ?? m[2]).replace(/"/g, '')
    const table = m[3].replace(/"/g, '')
    const body = m[4]
    const isSelect = /FOR\s+SELECT/i.test(body) || !/FOR\s+(INSERT|UPDATE|DELETE)/i.test(body)
    const worldReadable = /USING\s*\(\s*true\s*\)/i.test(body)
    if (!isSelect || !worldReadable) continue
    if (PUBLIC_CONTENT_TABLES.has(table)) continue
    if (dropped.has(`${table}::${policy}`)) continue // superseded by a later migration
    findings.push({
      ruleId: 'sql-world-readable-select',
      line: stripped.slice(0, m.index).split('\n').length,
      text: `${table} gets a SELECT policy with USING (true) — readable by anon, in bulk`,
      hint: `the anon key is public, so this grants every row to the open internet (S-1). Scope the predicate to the owner/participant, or add "${table}" to PUBLIC_CONTENT_TABLES with a reason if it really is public product content.`,
    })
  }
  return findings
}

// ── G6: sensitive-table isolation may not be removed by a migration ──────────
//
// `conversations`, `user_memory` and `profiles` carry the most sensitive data in
// the product and their RLS lives ONLY in production — applied out of band, so
// there is no policy text in this repository to test against
// (docs/ios/05_DATABASE_CONTRACT.md §Clients records it from live introspection).
//
// That leaves two ways isolation could disappear, and they are not equally
// visible:
//
//   · someone drops or disables it IN THE DASHBOARD — CI cannot see this at all,
//     and it stays an infrastructure limitation with an owner verification query
//     recorded in V3_THREAT_MODEL.md;
//   · someone drops or disables it IN A MIGRATION — which is exactly what this
//     rule makes impossible to do quietly.
//
// A DROP paired with a CREATE on the same table in the same file is a REPLACE,
// which is the legitimate shape (20260904_group_read_boundary.sql does it). A
// DROP with nothing putting a policy back is a removal.

/** Tables whose row isolation is load-bearing. Removing it is never routine. */
const SENSITIVE_TABLES = new Set([
  'conversations', 'user_memory', 'profiles', 'user_integrations',
  'billing_customers', 'subscriptions', 'price_watches', 'user_preferences',
  'user_events', 'user_notes', 'audit_log', 'account_status',
  'groups', 'group_members', 'decision_evidence', 'notification_subscriptions',
])

function ruleG6(sql) {
  const findings = []
  const stripped = stripComments(sql)
  const lineOf = (i) => stripped.slice(0, i).split('\n').length

  const disable = /ALTER\s+TABLE\s+(?:public\.)?("?[a-z_]+"?)\s+DISABLE\s+ROW\s+LEVEL\s+SECURITY/gi
  let m
  while ((m = disable.exec(stripped)) !== null) {
    const table = m[1].replace(/"/g, '')
    if (!SENSITIVE_TABLES.has(table)) continue
    findings.push({
      ruleId: 'sql-sensitive-isolation-removed',
      line: lineOf(m.index),
      text: `${table} has ROW LEVEL SECURITY disabled`,
      hint: 'the anon key is public, so disabling RLS publishes this table to the internet. If this is genuinely intended, it needs an owner decision on the record — not a migration.',
    })
  }

  // Which tables does this file put a policy back on?
  const replaced = new Set()
  const create = /CREATE\s+POLICY\s+(?:"[^"]+"|\S+)\s+ON\s+(?:public\.)?("?[a-z_]+"?)/gi
  while ((m = create.exec(stripped)) !== null) replaced.add(m[1].replace(/"/g, ''))

  const drop = /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?(?:"[^"]+"|\S+)\s+ON\s+(?:public\.)?("?[a-z_]+"?)/gi
  while ((m = drop.exec(stripped)) !== null) {
    const table = m[1].replace(/"/g, '')
    if (!SENSITIVE_TABLES.has(table) || replaced.has(table)) continue
    findings.push({
      ruleId: 'sql-sensitive-isolation-removed',
      line: lineOf(m.index),
      text: `${table} loses a policy with nothing replacing it in this file`,
      hint: 'a DROP paired with a CREATE on the same table is a replace and passes. A DROP on its own removes isolation from a table holding sensitive data — restate the policy, or make the removal an explicit owner decision.',
    })
  }
  return findings
}

function validateConfig() {
  const problems = []
  for (const name of INTENTIONAL_ANON.keys()) {
    if (name.includes('/') || name.endsWith('.sql')) {
      problems.push(`INTENTIONAL_ANON contains what looks like a FILE ("${name}"). It holds function names only.`)
    }
    if (LEGACY_UNCOMPLIANT.has(name)) {
      problems.push(`"${name}" appears in BOTH allowlists. A legacy file is not an intentional grant.`)
    }
  }
  for (const file of LEGACY_UNCOMPLIANT) {
    if (!file.endsWith('.sql')) {
      problems.push(`LEGACY_UNCOMPLIANT contains what looks like a FUNCTION ("${file}"). It holds file paths only.`)
    }
  }
  return problems
}

// ── Walk ─────────────────────────────────────────────────────────────────────

function* sqlFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* sqlFiles(full)
    else if (entry.endsWith('.sql')) yield full
  }
}

const toPosix = (p) => p.split(sep).join('/')

// ── Run ──────────────────────────────────────────────────────────────────────

console.log('SQL Grant Guard — Supabase grant model (docs/architecture/ADR-019-supabase-grant-model.md)')
console.log('')

const configProblems = validateConfig()
if (configProblems.length > 0) {
  console.log('  ✖ [sql-grant-allowlist-integrity] the guard is misconfigured')
  for (const p of configProblems) console.log(`      ${p}`)
  console.log('')
  console.log('Result: guard configuration is invalid. Nothing was checked.')
  process.exit(1)
}

const base = resolveBaseRef()
if (base.failed) {
  console.log('  ✖ [sql-grant-base-ref] cannot resolve a base reference')
  console.log(`      unresolvable: "${base.failed}"${process.env.PH0_GUARD_BASE_REF ? ' (from PH0_GUARD_BASE_REF)' : ' (default)'}`)
  console.log('')
  console.log('      This guard FAILS CLOSED. Without a base reference it cannot tell which')
  console.log('      migrations changed, and a guard that assumes "nothing changed" is inert.')
  console.log('      Set PH0_GUARD_BASE_REF, or fetch origin so origin/main resolves.')
  console.log('')
  console.log('Result: base reference unresolved.')
  process.exit(1)
}

if (!existsSync(MIGRATIONS)) {
  console.log(`  ✖ [sql-grant-scan] ${toPosix(relative(ROOT, MIGRATIONS))} does not exist`)
  console.log('')
  process.exit(1)
}

const changed = changedFiles(base.ref)
const errors = []
const info = []
const legacySeen = new Set()

for (const full of sqlFiles(MIGRATIONS)) {
  const file = toPosix(relative(ROOT, full))
  const sql = stripComments(readFileSync(full, 'utf8'))
  const findings = [...ruleG1(sql), ...ruleG2(sql), ...ruleG5(sql), ...ruleG6(sql)]
  if (findings.length === 0) continue

  const isChanged = changed.has(file)
  if (isChanged) {
    for (const f of findings) errors.push({ ...f, file })
    continue
  }

  legacySeen.add(file)
  if (LEGACY_UNCOMPLIANT.has(file)) {
    for (const f of findings) info.push({ ...f, file })
  } else {
    // G4 ratchet: an unchanged file that is non-compliant and not pinned means
    // the legacy set grew. It may only shrink.
    for (const f of findings) {
      errors.push({
        ...f,
        file,
        ruleId: 'sql-grant-legacy-ratchet',
        hint: `this file is not in LEGACY_UNCOMPLIANT. The legacy set may shrink, never grow. Either fix the file, or justify and pin it — see ADR-019, CI policy.`,
      })
    }
  }
}

// Shrinkage is allowed and worth surfacing so the pinned list does not rot.
const retired = [...LEGACY_UNCOMPLIANT].filter((f) => !legacySeen.has(f)).sort()

const byRule = new Map()
for (const e of errors) {
  if (!byRule.has(e.ruleId)) byRule.set(e.ruleId, [])
  byRule.get(e.ruleId).push(e)
}

for (const [ruleId, list] of byRule) {
  console.log(`  ✖ [${ruleId}] ${list.length} violation(s) in changed migrations`)
  for (const v of list.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    console.log(`      ${v.file}:${v.line}  ${v.text}`)
  }
  console.log(`      → Fix: ${list[0].hint}`)
  console.log('')
}

if (info.length > 0) {
  const files = [...new Set(info.map((i) => i.file))].sort()
  console.log(`  ℹ legacy (pinned, not blocking): ${info.length} finding(s) across ${files.length} file(s)`)
  for (const f of files) console.log(`      ${f}`)
  console.log('      → These predate ADR-019. Touching one makes it an ERROR.')
  console.log('')
}

if (retired.length > 0) {
  console.log(`  ℹ ${retired.length} pinned legacy file(s) now compliant or gone — remove from LEGACY_UNCOMPLIANT:`)
  for (const f of retired) console.log(`      ${f}`)
  console.log('')
}

console.log(`Base ref: ${base.ref} (${base.sha.slice(0, 7)})  ·  changed files in scope: ${[...changed].filter((f) => f.startsWith('supabase/migrations/')).length}`)
console.log(`Rules: G1 declare-roles · G2 revoke-public-is-not-enough · G3 allowlist-integrity · G4 legacy-ratchet · G5 world-readable-select · G6 sensitive-isolation`)
console.log(`Result: ${errors.length} error(s), ${info.length} info, ${LEGACY_UNCOMPLIANT.size} pinned legacy file(s).`)

process.exit(errors.length === 0 ? 0 : 1)
