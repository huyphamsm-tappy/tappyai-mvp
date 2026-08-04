import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the service-role client: from('platform_owner').select().eq().maybeSingle()
const h = vi.hoisted(() => ({ maybeSingle: vi.fn(), fromSpy: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      h.fromSpy(table)
      return { select: () => ({ eq: () => ({ maybeSingle: h.maybeSingle }) }) }
    },
  }),
}))

import {
  resolvePlatformOwnerId,
  isPlatformOwner,
  checkOwnerGate,
  invalidateOwnerCache,
} from './owner'

const OWNER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  invalidateOwnerCache()
  delete process.env.PLATFORM_OWNER_USER_ID
  h.maybeSingle.mockResolvedValue({ data: { user_id: OWNER }, error: null })
})

describe('resolvePlatformOwnerId', () => {
  it('reads the active owner from platform_owner, never from admin_roles', async () => {
    await expect(resolvePlatformOwnerId()).resolves.toBe(OWNER)
    expect(h.fromSpy).toHaveBeenCalledWith('platform_owner')
    expect(h.fromSpy).not.toHaveBeenCalledWith('admin_roles')
  })

  it('returns null when no owner row exists', async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(resolvePlatformOwnerId()).resolves.toBeNull()
  })

  // Deploying code before applying the migration must not take the back office
  // down — the table is simply unreadable and we degrade to "no owner".
  it('degrades to null (does not throw) when the table does not exist', async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: { message: 'relation does not exist', code: '42P01' } })
    await expect(resolvePlatformOwnerId()).resolves.toBeNull()
  })

  it('caches the lookup (one query for repeated calls)', async () => {
    await resolvePlatformOwnerId()
    await resolvePlatformOwnerId()
    await resolvePlatformOwnerId()
    expect(h.maybeSingle).toHaveBeenCalledTimes(1)
  })

  it('re-queries after invalidation (break-glass / bootstrap)', async () => {
    await resolvePlatformOwnerId()
    invalidateOwnerCache()
    await resolvePlatformOwnerId()
    expect(h.maybeSingle).toHaveBeenCalledTimes(2)
  })
})

describe('isPlatformOwner', () => {
  it('true only for the active owner', async () => {
    await expect(isPlatformOwner(OWNER)).resolves.toBe(true)
    await expect(isPlatformOwner(OTHER)).resolves.toBe(false)
  })

  it('false for everyone when no owner is assigned', async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(isPlatformOwner(OWNER)).resolves.toBe(false)
  })
})

describe('checkOwnerGate — boot-time assertion', () => {
  // Rollout semantics: unset env keeps the gate inert so deploy-then-configure
  // is safe. Privilege escalation is blocked in the DB regardless of this gate.
  it('is inert when PLATFORM_OWNER_USER_ID is unset', async () => {
    await expect(checkOwnerGate()).resolves.toEqual({ ok: true, enforced: false })
    expect(h.maybeSingle).not.toHaveBeenCalled()
  })

  it('passes and reports enforced when env matches the active owner', async () => {
    process.env.PLATFORM_OWNER_USER_ID = OWNER
    await expect(checkOwnerGate()).resolves.toEqual({ ok: true, enforced: true })
  })

  // Transferring ownership must require BOTH the database AND the environment.
  it('fails when env names a different user than the DB', async () => {
    process.env.PLATFORM_OWNER_USER_ID = OTHER
    await expect(checkOwnerGate()).resolves.toEqual({ ok: false, reason: 'ENV_MISMATCH' })
  })

  it('fails when env is set but no owner row exists', async () => {
    process.env.PLATFORM_OWNER_USER_ID = OWNER
    h.maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(checkOwnerGate()).resolves.toEqual({ ok: false, reason: 'ENV_SET_BUT_NO_OWNER' })
  })

  it('tolerates surrounding whitespace in the env value', async () => {
    process.env.PLATFORM_OWNER_USER_ID = `  ${OWNER}  `
    await expect(checkOwnerGate()).resolves.toEqual({ ok: true, enforced: true })
  })
})
