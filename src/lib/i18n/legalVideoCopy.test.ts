import { describe, it, expect } from 'vitest'
import { vi, en } from './legal'

// Explore video: the privacy policy and the terms must say what the consent dialog says (owner-approved wording, 05/11/2026).
describe('legal copy for posted clips', () => {
  it('privacy (English): frames, speech and on-screen text go to the AI provider only for moderation before publishing, after agreement; originals are private', () => {
    const b1 = en['legal.privacy.s3.b1']
    expect(b1).toContain('some frames, the speech and the on-screen text of a clip are sent to OpenAI solely to review the clip before it is published')
    expect(b1).toContain('only after you agree')
    expect(en['legal.privacy.s3.b8']).toContain('stored privately')
    expect(en['legal.terms.s4.p2']).toContain('reviewed before it is published')
  })
  it('privacy (Vietnamese) says the same', () => {
    const b1 = vi['legal.privacy.s3.b1']
    expect(b1).toContain('một số khung hình, lời nói và chữ trong clip được gửi tới OpenAI chỉ để kiểm duyệt clip trước khi đăng')
    expect(b1).toContain('chỉ sau khi bạn đồng ý')
    expect(vi['legal.privacy.s3.b8']).toContain('lưu riêng tư')
    expect(vi['legal.terms.s4.p2']).toContain('kiểm duyệt trước khi đăng')
  })
})
