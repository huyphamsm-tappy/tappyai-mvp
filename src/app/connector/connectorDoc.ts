import { bullets, type LegalDoc } from '@/components/legal/legalDoc'

// Document structure for /connector, the public setup guide of the TappyAI connector for AI assistants (27/11/2026). Every string lives in src/lib/i18n/legal.ts
// (`legal.connector.*`), so the English and Vietnamese editions share one shape. A plain module, like /support, so the copy test renders THIS shape.
//
// What it says is limited to what the connector does today: nine read-only tools, no booking, payment or purchase, OAuth sign-in, the three assistants approved at launch.
export const CONNECTOR_DOC: LegalDoc = {
  titleKey: 'legal.connector.title',
  effectiveKey: 'legal.connector.effective',
  sections: [
    {
      id: 'what-it-is',
      headingKey: 'legal.connector.s1.heading',
      blocks: [
        { kind: 'p', key: 'legal.connector.s1.p1' },
        { kind: 'p', key: 'legal.connector.s1.p2' },
      ],
    },
    {
      id: 'server-address',
      headingKey: 'legal.connector.s2.heading',
      blocks: [
        { kind: 'p', key: 'legal.connector.s2.p1' },
        { kind: 'p', key: 'legal.connector.s2.p2' },
        { kind: 'p', key: 'legal.connector.s2.p3' },
      ],
    },
    {
      id: 'how-to-connect',
      headingKey: 'legal.connector.s3.heading',
      blocks: [
        { kind: 'steps', keys: ['legal.connector.s3.step1', 'legal.connector.s3.step2', 'legal.connector.s3.step3', 'legal.connector.s3.step4'] },
        { kind: 'p', key: 'legal.connector.s3.p1' },
      ],
    },
    {
      id: 'what-it-can-do',
      headingKey: 'legal.connector.s4.heading',
      blocks: [{ kind: 'bullets', keys: bullets('legal.connector.s4.b', 9) }],
    },
    {
      id: 'your-data',
      headingKey: 'legal.connector.s5.heading',
      blocks: [{ kind: 'link', key: 'legal.connector.s5.p1', labelKey: 'legal.connector.s5.link', href: '/privacy' }],
    },
    {
      id: 'help',
      headingKey: 'legal.connector.s6.heading',
      blocks: [
        { kind: 'p', key: 'legal.connector.s6.p1' },
        { kind: 'contact' },
      ],
    },
  ],
}
