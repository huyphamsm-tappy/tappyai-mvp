import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { en, vi } from './legal'

// The legal pages must describe what the product really does (owner 02/10): no mention of a payment processor or a paid plan that is not
// for sale, deletion described as immediate and in-app, moderation and appeals present, Community Guidelines linked from the terms.
// This is a guard on WORDING, not legal advice: the texts still need a review by someone who knows Vietnamese law.

const pick = (d: Record<string, string>, prefix: string) => Object.entries(d).filter(([k]) => k.startsWith(prefix))

describe('legal copy — the privacy policy, terms and delete page', () => {
  it('privacy, terms and the delete page carry the same keys in both languages', () => {
    for (const p of ['legal.privacy.', 'legal.terms.', 'legal.delete.']) {
      expect(pick(en, p).map(([k]) => k).sort()).toEqual(pick(vi, p).map(([k]) => k).sort())
    }
  })

  it('no mention of Stripe or of a paid plan on the privacy policy, the terms or the delete page', () => {
    for (const d of [en, vi]) {
      const text = [...pick(d, 'legal.privacy.'), ...pick(d, 'legal.terms.'), ...pick(d, 'legal.delete.')].map(([, v]) => v).join('\n')
      expect(text).not.toMatch(/stripe/i)
      expect(text).not.toMatch(/paid plan|gói trả phí|credit còn lại|subscribe to a|đăng ký gói/i)
    }
  })

  it('account deletion is described as immediate, in the app or at /delete-account — not as "contact support"', () => {
    expect(en['legal.privacy.s5.b3']).toMatch(/at once|right away/i)
    expect(en['legal.privacy.s5.b3']).toMatch(/delete-account/)
    expect(vi['legal.privacy.s5.b3']).toMatch(/ngay/)
    expect(vi['legal.privacy.s5.b3']).toMatch(/delete-account/)
    expect(en['legal.privacy.s5.b3']).not.toMatch(/contacting our support|contact our support/i)
    expect(vi['legal.privacy.s5.b3']).not.toMatch(/liên hệ đội ngũ hỗ trợ/i)
  })

  it('the privacy policy says photos go to OpenAI, names reports / blocking / moderation / appeals, and points to the guidelines and support', () => {
    expect(en['legal.privacy.s3.b1']).toMatch(/photos/i)
    expect(vi['legal.privacy.s3.b1']).toMatch(/ảnh/i)
    for (const d of [en, vi]) {
      const sec = pick(d, 'legal.privacy.s8.').map(([, v]) => v).join(' ')
      expect(sec).toContain('community-guidelines')
      expect(sec).toContain('support@tappyai.com')
    }
    expect(en['legal.privacy.s1.b9']).toMatch(/18/)
    expect(vi['legal.privacy.s1.b9']).toMatch(/18/)
  })

  it('Scam Shield: the QR picture is not uploaded and nothing is stored (privacy rule shared with Android and iOS)', () => {
    expect(en['legal.privacy.s3.p4']).toMatch(/read on your device/)
    expect(en['legal.privacy.s3.p4']).toMatch(/do not store/)
    expect(vi['legal.privacy.s3.p4']).toMatch(/ngay trên thiết bị/)
    expect(vi['legal.privacy.s3.p4']).toMatch(/không lưu/)
  })

  it('the terms link to the Community Guidelines and require 18+', () => {
    const page = readFileSync('src/app/terms/page.tsx', 'utf8')
    expect(page).toContain("href: '/community-guidelines'")
    expect(en['legal.terms.s2.p1']).toMatch(/18/)
    expect(vi['legal.terms.s2.p1']).toMatch(/18/)
  })

  it('no legal claim about a specific statute is made on the pages (needs a lawyer first)', () => {
    for (const d of [en, vi]) {
      const text = [...pick(d, 'legal.privacy.'), ...pick(d, 'legal.terms.'), ...pick(d, 'legal.delete.')].map(([, v]) => v).join('\n')
      expect(text).not.toMatch(/Nghị định|Decree|GDPR|PDPA|Luật (bảo vệ|an ninh)/i)
    }
  })
})
