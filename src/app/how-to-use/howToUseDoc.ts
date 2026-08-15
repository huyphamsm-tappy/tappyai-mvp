import { type LegalDoc, bullets } from '@/components/legal/legalDoc'

// Structure only — every string lives in src/lib/i18n/guide/index.ts. Kept out of
// page.tsx so the guidance test can import it and assert that every key it names
// really exists in BOTH locales; a doc that only the page could see would let a
// missing translation ship as a blank line.
export const HOW_TO_USE_DOC: LegalDoc = {
  titleKey: 'guide.title',
  effectiveKey: 'guide.intro',
  sections: [
    {
      id: 'chat',
      headingKey: 'guide.chat.heading',
      blocks: [
        { kind: 'p', key: 'guide.chat.what' },
        { kind: 'steps', keys: bullets('guide.chat.s', 4) },
        { kind: 'p', key: 'guide.chat.result' },
        { kind: 'bullets', keys: bullets('guide.chat.b', 2) },
        { kind: 'note', key: 'guide.chat.nodata' },
        { kind: 'p', key: 'guide.chat.lang' },
      ],
    },
    {
      id: 'food',
      headingKey: 'guide.food.heading',
      blocks: [
        { kind: 'p', key: 'guide.food.what' },
        { kind: 'steps', keys: bullets('guide.food.s', 3) },
        { kind: 'p', key: 'guide.food.result' },
        { kind: 'bullets', keys: bullets('guide.food.b', 3) },
        { kind: 'note', key: 'guide.food.nodata' },
      ],
    },
    {
      id: 'travel',
      headingKey: 'guide.travel.heading',
      blocks: [
        { kind: 'p', key: 'guide.travel.what' },
        { kind: 'steps', keys: bullets('guide.travel.s', 3) },
        { kind: 'p', key: 'guide.travel.result' },
        { kind: 'bullets', keys: bullets('guide.travel.b', 2) },
        { kind: 'note', key: 'guide.travel.nodata' },
      ],
    },
    {
      id: 'shopping',
      headingKey: 'guide.shop.heading',
      blocks: [
        { kind: 'p', key: 'guide.shop.what' },
        { kind: 'steps', keys: bullets('guide.shop.s', 3) },
        { kind: 'p', key: 'guide.shop.result' },
        { kind: 'bullets', keys: bullets('guide.shop.b', 1) },
        { kind: 'note', key: 'guide.shop.nodata' },
      ],
    },
    {
      id: 'listening',
      headingKey: 'guide.voice.heading',
      blocks: [
        { kind: 'p', key: 'guide.voice.what' },
        { kind: 'steps', keys: bullets('guide.voice.s', 3) },
        { kind: 'p', key: 'guide.voice.result' },
        { kind: 'note', key: 'guide.voice.nodata' },
      ],
    },
    {
      id: 'notifications',
      headingKey: 'guide.notif.heading',
      blocks: [
        { kind: 'p', key: 'guide.notif.what' },
        { kind: 'steps', keys: bullets('guide.notif.s', 3) },
        { kind: 'p', key: 'guide.notif.result' },
        { kind: 'p', key: 'guide.notif.identity' },
        { kind: 'p', key: 'guide.notif.android' },
        { kind: 'note', key: 'guide.notif.nodata' },
      ],
    },
    {
      id: 'reviews',
      headingKey: 'guide.reviews.heading',
      blocks: [
        { kind: 'p', key: 'guide.reviews.what' },
        { kind: 'steps', keys: bullets('guide.reviews.s', 3) },
        { kind: 'p', key: 'guide.reviews.result' },
        { kind: 'note', key: 'guide.reviews.nodata' },
      ],
    },
    {
      id: 'saved',
      headingKey: 'guide.saved.heading',
      blocks: [
        { kind: 'p', key: 'guide.saved.what' },
        { kind: 'steps', keys: bullets('guide.saved.s', 2) },
        { kind: 'p', key: 'guide.saved.result' },
        { kind: 'note', key: 'guide.saved.nodata' },
      ],
    },
    {
      id: 'tools',
      headingKey: 'guide.tools.heading',
      blocks: [
        { kind: 'p', key: 'guide.tools.what' },
        { kind: 'bullets', keys: bullets('guide.tools.b', 4) },
        { kind: 'note', key: 'guide.tools.nodata' },
      ],
    },
    {
      id: 'account',
      headingKey: 'guide.account.heading',
      blocks: [
        { kind: 'p', key: 'guide.account.what' },
        { kind: 'bullets', keys: bullets('guide.account.b', 2) },
        { kind: 'note', key: 'guide.account.nodata' },
      ],
    },
    {
      id: 'what-to-keep-in-mind',
      headingKey: 'guide.limits.heading',
      blocks: [{ kind: 'bullets', keys: bullets('guide.limits.b', 4) }],
    },
  ],
}
