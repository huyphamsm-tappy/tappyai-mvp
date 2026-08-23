import { describe, it, expect } from 'vitest'
import type { DepartmentContext, DepartmentMembership } from '../types'
// RED: this module does not exist yet. D14 authorizes it.
import { resolveEntryContext } from '../entryContext'

// Controller V2.2 — Owner Decision D14: the department ENTRY decision.
//
// 🔑 WHAT THIS FILE DEFENDS, AND WHY IT IS A PURE MODULE.
//
// D14 permits a chooser at entry and nothing else. The dangerous failure is not
// "the chooser looks wrong" — it is the chooser quietly becoming an authority.
// So the decision of WHAT CONTEXT AN ACTOR ENTERS WITH is a pure function over
// data the server already has: no request, no client, no database, no Actor
// mutation. That keeps it testable exhaustively and keeps it impossible for a
// URL parameter to reach an authorization path, because this function returns
// PRESENTATION context and nothing else.
//
// ⚠️ THE VALIDATION HERE IS CONTEXT VALIDATION, NOT RESOURCE AUTHORIZATION.
// It decides what an actor is SHOWN. `requirePermission()` / the PDP remain the
// sole authority over what an actor may DO, and `Actor` still carries no
// department field. A test below pins that this module cannot widen anything.

const m = (departmentId: string): DepartmentMembership =>
  ({ userId: 'u1', departmentId, orgRole: 'DEPARTMENT_HEAD', scope: 'own', status: 'active' }) as never

const ctx = (over: Partial<DepartmentContext> = {}): DepartmentContext =>
  ({
    isOwner: false,
    scope: { isGlobal: false, departmentIds: ['marketing', 'finance'] },
    memberships: [m('marketing'), m('finance')],
    allowedModules: [],
    ...over,
  }) as never

describe('D14 — who is offered a choice at all', () => {
  it('Flow B — the Platform Owner is NEVER shown a chooser', () => {
    // The Owner is global by `Actor.isOwner`, not by membership. Asking them to
    // pick one of 15 departments would narrow a reach that is deliberately
    // unnarrowed, and D14 says "no chooser" for this flow in as many words.
    const out = resolveEntryContext(ctx({ isOwner: true, scope: { isGlobal: true, departmentIds: [] } as never, memberships: [] }), undefined)
    expect(out.kind).toBe('enter')
    expect(out.selectedDepartmentId).toBeNull()
  })

  it('🔑 the Owner is not asked EVEN IF they also hold memberships', () => {
    // Found by mutation M4. The first version of the Owner test used an Owner
    // with zero memberships, so deleting the `isOwner` branch entirely still
    // passed — the actor simply fell through to the zero-membership path and
    // produced the same answer. The branch was therefore untested.
    //
    // An Owner who also holds two memberships is the case that separates them:
    // without the branch they would be handed a chooser, which would narrow a
    // reach that comes from `Actor.isOwner` and is deliberately global.
    const out = resolveEntryContext(ctx({ isOwner: true }), undefined)
    expect(out.kind).toBe('enter')
    expect(out.selectedDepartmentId).toBeNull()
    expect(out.choosable).toEqual([])
  })

  it('Flow C — exactly one membership enters directly, no chooser', () => {
    // A one-option dialog is a click that teaches the operator their choices do
    // not matter. The single membership IS the context.
    const out = resolveEntryContext(ctx({ scope: { isGlobal: false, departmentIds: ['marketing'] } as never, memberships: [m('marketing')] }), undefined)
    expect(out.kind).toBe('enter')
    expect(out.selectedDepartmentId).toBe('marketing')
  })

  it('Flow D — multiple memberships and no choice yet ⇒ chooser', () => {
    const out = resolveEntryContext(ctx(), undefined)
    expect(out.kind).toBe('choose')
  })

  it('Flow E — zero memberships keeps the existing `none` behaviour', () => {
    // Must NOT fabricate a department, and must not become a chooser with an
    // empty list, which would be a dead end wearing a decision.
    const out = resolveEntryContext(ctx({ scope: { isGlobal: false, departmentIds: [] } as never, memberships: [] }), undefined)
    expect(out.kind).toBe('enter')
    expect(out.selectedDepartmentId).toBeNull()
  })
})

describe('D14 — the requested department is validated against real membership', () => {
  it('Flow D1 — a department the actor belongs to is accepted', () => {
    const out = resolveEntryContext(ctx(), 'finance')
    expect(out.kind).toBe('enter')
    expect(out.selectedDepartmentId).toBe('finance')
  })

  it('🔑 Flow D2 — a department the actor does NOT belong to FAILS CLOSED', () => {
    // The URL is attacker-controlled input. Accepting `?dept=finance` from a
    // marketing-only member would not grant access — the PDP still decides
    // everything — but it WOULD show them a workspace framed as theirs, which
    // is a presentation lie. Fail closed: refuse the value, do not enter it.
    const out = resolveEntryContext(
      ctx({ scope: { isGlobal: false, departmentIds: ['marketing'] } as never, memberships: [m('marketing')] }),
      'finance'
    )
    expect(out.selectedDepartmentId).not.toBe('finance')
  })

  it('an unknown/garbage id fails closed too', () => {
    for (const bad of ['', '   ', 'not-a-department', '../admin', 'MARKETING; DROP', '<script>']) {
      const out = resolveEntryContext(ctx(), bad)
      expect(out.selectedDepartmentId, `accepted ${JSON.stringify(bad)}`).not.toBe(bad)
    }
  })

  it('a suspended membership does not qualify as a workspace', () => {
    // `authorizedScopes` already filters to active; entry must agree with it
    // rather than quietly using a different definition of membership.
    const suspended = { ...m('finance'), status: 'suspended' as const }
    const out = resolveEntryContext(
      ctx({ scope: { isGlobal: false, departmentIds: ['marketing'] } as never, memberships: [m('marketing'), suspended as never] }),
      'finance'
    )
    expect(out.selectedDepartmentId).not.toBe('finance')
  })

  it('an invalid id for a MULTI-member actor returns them to the chooser, not into a wrong workspace', () => {
    const out = resolveEntryContext(ctx(), 'engineering')
    expect(out.kind).toBe('choose')
  })
})

describe('D14 — this is presentation context, never authorization', () => {
  it('🔑 the choosable set is a SUBSET of existing memberships — it can only narrow', () => {
    // The one property that makes a URL parameter safe here: nothing this
    // function returns can name a department the actor was not already a
    // member of, so it is arithmetically incapable of widening reach.
    const c = ctx()
    const out = resolveEntryContext(c, undefined)
    const owned = new Set(c.memberships.filter((x) => x.status === 'active').map((x) => x.departmentId))
    for (const d of out.choosable) expect(owned.has(d)).toBe(true)
  })

  it('returns no permission, role, capability or authorization field', () => {
    // If an authorization-shaped key ever appears in this return value, the
    // entry layer has started deciding something it must never decide.
    const out = resolveEntryContext(ctx(), 'marketing')
    const keys = Object.keys(out).join(' ').toLowerCase()
    for (const forbidden of ['permission', 'role', 'capabilit', 'authoriz', 'grant', 'allow']) {
      expect(keys, `entry context exposes "${forbidden}"`).not.toContain(forbidden)
    }
  })

  it('is pure — the same inputs give the same answer, and inputs are not mutated', () => {
    const c = ctx()
    const before = JSON.stringify(c)
    const a = resolveEntryContext(c, 'marketing')
    const b = resolveEntryContext(c, 'marketing')
    expect(a).toEqual(b)
    expect(JSON.stringify(c)).toBe(before)
  })
})
