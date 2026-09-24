'use client'

// Dev-only environment badge (consolidation 2026-09-24). Shows worktree, branch,
// short SHA and the Supabase project ref so you always know WHICH code + WHICH
// database you are looking at. Turns RED when pointed at the production project.
//
// 🔒 ABSENT FROM PRODUCTION: this is only ever rendered inside a
// `process.env.NODE_ENV === 'development'` branch in the root layout, which Next
// constant-folds to `false` in a prod build, so both this component and the
// NEXT_PUBLIC_DEV_* values are dead-code-eliminated from the production bundle.

const PROD_SUPABASE_REF = 'fwznnobrdctuskgrvuik'

export default function DevEnvBadge() {
  if (process.env.NODE_ENV !== 'development') return null

  const ref = (String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/([a-z0-9]{20})\.supabase\.co/) || [])[1] || 'none'
  const isProd = ref === PROD_SUPABASE_REF
  const branch = process.env.NEXT_PUBLIC_DEV_GIT_BRANCH || 'unknown'
  const sha = process.env.NEXT_PUBLIC_DEV_GIT_SHA || 'unknown'
  const worktree = (process.env.NEXT_PUBLIC_DEV_WORKTREE || '').split(/[\\/]/).slice(-1)[0] || 'unknown'

  return (
    <div
      data-testid="dev-env-badge"
      title={process.env.NEXT_PUBLIC_DEV_WORKTREE || ''}
      style={{
        position: 'fixed', bottom: 8, left: 8, zIndex: 2147483647,
        font: '11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace',
        color: '#fff', background: isProd ? '#b00020' : 'rgba(20,20,25,0.88)',
        border: `1px solid ${isProd ? '#ff5252' : 'rgba(255,255,255,0.18)'}`,
        borderRadius: 8, padding: '5px 8px', maxWidth: 320, pointerEvents: 'none',
        boxShadow: '0 2px 10px rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
      }}
    >
      <div style={{ fontWeight: 700 }}>
        {isProd ? '🛑 PRODUCTION DB' : '🧪 audit dev'} · {worktree}
      </div>
      <div style={{ opacity: 0.9 }}>{branch} @ {sha}</div>
      <div style={{ opacity: 0.75 }}>supabase: {ref}</div>
    </div>
  )
}
