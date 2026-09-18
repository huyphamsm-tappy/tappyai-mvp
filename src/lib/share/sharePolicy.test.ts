import { describe, it, expect } from 'vitest'
import { decideSharePolicy } from './sharePolicy'
import { SHARE_DAILY_LIMIT, SHARE_DAILY_LIMIT_ANON } from '@/lib/config/product'

// Who may publish, under which cap. The second generation of the loop hinges
// on the anonymous branch: allowed ONLY as a child of an existing public share.

const account = { id: 'u1', is_anonymous: false }
const anon = { id: 'a1', is_anonymous: true }
const parentOk = async (slug: string) => (slug === 'AbCdEfGh12' ? { id: 'parent-id' } : null)

describe('decideSharePolicy', () => {
  it('a real account shares under the account cap, listed, with optional ancestry', async () => {
    expect(await decideSharePolicy(account, undefined, parentOk)).toEqual({ ok: true, ownerIsAnonymous: false, parentId: null, dailyLimit: SHARE_DAILY_LIMIT, limitKey: 'share-daily:uid:u1' })
    expect(await decideSharePolicy(account, 'AbCdEfGh12', parentOk)).toMatchObject({ ok: true, ownerIsAnonymous: false, parentId: 'parent-id' })
  })

  it('an anonymous session cannot publish from scratch', async () => {
    expect(await decideSharePolicy(anon, undefined, parentOk)).toEqual({ ok: false, code: 'account_required' })
  })

  it('an anonymous session may share a child of an existing public share — unlisted, under the small cap', async () => {
    expect(await decideSharePolicy(anon, 'AbCdEfGh12', parentOk)).toEqual({ ok: true, ownerIsAnonymous: true, parentId: 'parent-id', dailyLimit: SHARE_DAILY_LIMIT_ANON, limitKey: 'share-daily:anon:a1' })
    expect(SHARE_DAILY_LIMIT_ANON).toBeLessThan(SHARE_DAILY_LIMIT)
  })

  it('a parent that does not resolve (unknown or withdrawn) is refused for everyone', async () => {
    expect(await decideSharePolicy(anon, 'ZzZzZzZzZ9', parentOk)).toEqual({ ok: false, code: 'parent_not_found' })
    expect(await decideSharePolicy(account, 'ZzZzZzZzZ9', parentOk)).toEqual({ ok: false, code: 'parent_not_found' })
  })
})
