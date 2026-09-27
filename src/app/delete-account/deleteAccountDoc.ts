import { bullets, type LegalDoc, type LegalSection } from '@/components/legal/legalDoc'

// Document structure for /delete-account — every string lives in src/lib/i18n/legal.ts.
//
// Which routes the page describes follows the SAME switch the deletion API reads
// (`selfDeleteEnabled()`, lib/account/selfDelete.ts), so the public page can never promise a
// button the server refuses:
//
//   self-delete OFF → the request route only (what Android and iOS ship: Settings →
//                     "Request account deletion" → a prepared email to support).
//   self-delete ON  → the self-service route on the website first, then the same request route
//                     for apps that only offer the request, or for someone who cannot sign in.
//
// A plain module (not page.tsx) so the test renders exactly these shapes.

const REQUEST_STEPS = bullets('legal.delete.s1.step', 4)

const REMOVES: LegalSection = {
  id: 'what-deletion-removes',
  headingKey: 'legal.delete.s3.heading',
  blocks: [
    { kind: 'lead', key: 'legal.delete.s3.lead' },
    { kind: 'bullets', keys: bullets('legal.delete.s3.b', 6) },
  ],
}

const RETAINED: LegalSection = {
  id: 'data-we-may-retain',
  headingKey: 'legal.delete.s4.heading',
  blocks: [
    { kind: 'p', key: 'legal.delete.s4.p1' },
    { kind: 'p', key: 'legal.delete.s4.p2' },
  ],
}

const CONTACT: LegalSection = {
  id: 'contact',
  headingKey: 'legal.delete.s5.heading',
  blocks: [
    { kind: 'p', key: 'legal.delete.s5.p1' },
    { kind: 'contact' },
  ],
}

export function deleteAccountDoc(selfDelete: boolean): LegalDoc {
  const routes: LegalSection[] = selfDelete
    ? [
        {
          id: 'delete-your-account-yourself',
          headingKey: 'legal.delete.self.heading',
          blocks: [
            { kind: 'lead', key: 'legal.delete.self.lead' },
            { kind: 'steps', keys: bullets('legal.delete.self.step', 4) },
            { kind: 'p', key: 'legal.delete.self.p1' },
            { kind: 'p', key: 'legal.delete.self.p2' },
          ],
        },
        {
          id: 'how-to-request-account-deletion',
          headingKey: 'legal.delete.request.heading',
          blocks: [
            { kind: 'lead', key: 'legal.delete.request.lead' },
            { kind: 'steps', keys: REQUEST_STEPS },
            { kind: 'p', key: 'legal.delete.s2.p1' },
            { kind: 'p', key: 'legal.delete.s2.p2' },
          ],
        },
      ]
    : [
        {
          id: 'how-to-request-account-deletion',
          headingKey: 'legal.delete.s1.heading',
          blocks: [
            { kind: 'lead', key: 'legal.delete.s1.lead' },
            { kind: 'steps', keys: REQUEST_STEPS },
          ],
        },
        {
          id: 'what-happens-next',
          headingKey: 'legal.delete.s2.heading',
          blocks: [
            { kind: 'p', key: 'legal.delete.s2.p1' },
            { kind: 'p', key: 'legal.delete.s2.p2' },
          ],
        },
      ]

  return {
    titleKey: 'legal.delete.title',
    effectiveKey: 'legal.delete.effective',
    sections: [...routes, REMOVES, RETAINED, CONTACT],
  }
}
