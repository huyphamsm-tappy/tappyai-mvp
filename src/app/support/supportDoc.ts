import { type LegalDoc } from '@/components/legal/legalDoc'

// Document structure for /support — every string lives in src/lib/i18n/legal.ts.
//
// A plain module rather than a constant inside page.tsx so the localization test renders THIS
// shape instead of a hand-copied mirror of it (the copyright test's mirror can drift from its
// page; this one cannot).
//
// /support is the Support URL the App Store listing points at (Apple requires one that reaches
// real contact information). It answers only what the product actually does today — no
// feature here is described beyond what ships.
export const SUPPORT_DOC: LegalDoc = {
  titleKey: 'legal.support.title',
  effectiveKey: 'legal.support.effective',
  sections: [
    {
      id: 'contact-us',
      headingKey: 'legal.support.s1.heading',
      blocks: [
        { kind: 'p', key: 'legal.support.s1.p1' },
        { kind: 'contact' },
        { kind: 'p', key: 'legal.support.s1.p2' },
      ],
    },
    {
      id: 'faq',
      headingKey: 'legal.support.s2.heading',
      blocks: [
        {
          kind: 'faq',
          items: [
            { q: 'legal.support.faq.signIn.q', a: 'legal.support.faq.signIn.a' },
            { q: 'legal.support.faq.age.q', a: 'legal.support.faq.age.a' },
            { q: 'legal.support.faq.accuracy.q', a: 'legal.support.faq.accuracy.a' },
            { q: 'legal.support.faq.memory.q', a: 'legal.support.faq.memory.a' },
            { q: 'legal.support.faq.report.q', a: 'legal.support.faq.report.a' },
            { q: 'legal.support.faq.delete.q', a: 'legal.support.faq.delete.a' },
          ],
        },
      ],
    },
    {
      id: 'policies',
      headingKey: 'legal.support.s3.heading',
      blocks: [
        {
          kind: 'links',
          items: [
            { href: '/privacy', labelKey: 'legal.support.link.privacy' },
            { href: '/terms', labelKey: 'legal.support.link.terms' },
            { href: '/delete-account', labelKey: 'legal.support.link.delete' },
          ],
        },
      ],
    },
  ],
}
