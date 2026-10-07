import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// apply-migration.sh refuses an UNLISTED file. On 30/09 the click-attribution migrations 7b/7c (Phương án C, R21) were
// missing from its policy table — the release run would have been refused at step 7b. Every migration of this release
// window (MIGRATION_ORDER.txt from 20260913 on) must carry a policy, and the security ones keep their order and gate.
const script = readFileSync('scripts/release/apply-migration.sh', 'utf8')
const policyBlock = script.slice(script.indexOf('policy_of() {'), script.indexOf('# ---------------- args'))
const listed = new Set(policyBlock.match(/[\w-]+\.sql/g) ?? [])
const policyOf = (file: string) => {
  const arms = policyBlock.split(/\n\s*echo /)
  for (let i = 0; i < arms.length - 1; i++) if ((arms[i].split(';;').pop() ?? '').includes(file)) return arms[i + 1].split(/\s/)[0]
  return 'UNLISTED'
}
const order = readFileSync('supabase/MIGRATION_ORDER.txt', 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l.endsWith('.sql')).map(l => l.split('/').pop()!)

describe('apply-migration.sh policy covers the release window', () => {
  it('every migration from 20260913 on is listed', () => {
    const window = order.filter(f => /^\d{8}/.test(f) && f >= '20260913')
    expect(window.length).toBeGreaterThan(20)
    expect(window.filter(f => !listed.has(f))).toEqual([])
  })
  it('7b / 7c apply before the deploy; H1 → M1 → the security branch migrations wait for the smoke', () => {
    expect(policyOf('20260929130000_commerce_click_attributions.sql')).toBe('APPLY')
    expect(policyOf('20260929140000_commerce_click_attributions_r21.sql')).toBe('APPLY')
    for (const f of ['20260927_owner_update_column_privileges.sql', '20260928_revoke_reviews_insert.sql', '20260928b_revoke_increment_deal_click_public.sql',
      '20260928c_review_comments_publication_boundary.sql', '20260930_content_reports_insert_check.sql', '20260930b_review_interactions_bounds.sql']) {
      expect(policyOf(f)).toBe('AFTER-SMOKE')
    }
    const sec = ['20260927_owner', '20260928_revoke', '20260928b', '20260928c', '20260930_content', '20260930b'].map(p => order.findIndex(f => f.startsWith(p)))
    expect(sec.every(i => i >= 0)).toBe(true)
    expect([...sec].sort((a, b) => a - b)).toEqual(sec)
  })
})
