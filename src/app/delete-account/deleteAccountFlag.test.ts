// /delete-account must describe the flow the app ships in THIS environment (Play compares them).
// ACCOUNT_SELF_DELETE_ENABLED off → request-by-email copy; on → in-app deletion copy.
import { describe, it, expect, afterEach } from 'vitest'
import DeleteAccountPage from './page'
import { en, vi } from '@/lib/i18n/legal'

type Doc = { titleKey: string; sections: Array<{ headingKey: string; blocks: Array<{ key?: string; keys?: string[] }> }> }
const docOf = () => (DeleteAccountPage() as unknown as { props: { doc: Doc } }).props.doc
const keysOf = (d: Doc) => [d.titleKey, ...d.sections.flatMap(s => [s.headingKey, ...s.blocks.flatMap(b => b.keys ?? (b.key ? [b.key] : []))])]

afterEach(() => { delete process.env.ACCOUNT_SELF_DELETE_ENABLED })

describe('/delete-account follows ACCOUNT_SELF_DELETE_ENABLED', () => {
  it('flag off (production today): the request-by-email flow', () => {
    delete process.env.ACCOUNT_SELF_DELETE_ENABLED
    const d = docOf()
    expect(d.titleKey).toBe('legal.deleteReq.title')
    expect(en['legal.deleteReq.s1.step3']).toBe('Choose Request account deletion.')
    expect(vi['legal.deleteReq.s1.step3']).toBe('Chọn Yêu cầu xóa tài khoản.')
    for (const k of keysOf(d)) { expect(en[k], k).toBeTruthy(); expect(vi[k], k).toBeTruthy() }
  })

  it('flag on: the in-app deletion flow', () => {
    process.env.ACCOUNT_SELF_DELETE_ENABLED = 'true'
    const d = docOf()
    expect(d.titleKey).toBe('legal.delete.title')
    for (const k of keysOf(d)) { expect(en[k], k).toBeTruthy(); expect(vi[k], k).toBeTruthy() }
  })
})
