import { describe, it, expect } from 'vitest'
import { counterBumpsFrom, identityLinksFrom } from './g1Ingestion'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('G1 ingestion — anon→user stitching', () => {
  it('links an authenticated event that still carries the browser anon_id', () => {
    expect(identityLinksFrom([{ event_type: 'query', user_id: 'u1', anon_id: A, metadata: null }])).toEqual([{ anon_id: A, user_id: 'u1' }])
  })
  it('never links from an anonymous-only or a malformed row, and dedups a batch', () => {
    expect(identityLinksFrom([
      { event_type: 'query', user_id: null, anon_id: A, metadata: null },
      { event_type: 'query', user_id: 'u1', anon_id: 'junk', metadata: null },
      { event_type: 'query', user_id: 'u1', anon_id: B, metadata: null },
      { event_type: 'page_view', user_id: 'u1', anon_id: B, metadata: null },
    ])).toEqual([{ anon_id: B, user_id: 'u1' }])
  })
})

describe('G1 ingestion — shared-result counters', () => {
  it('aggregates raw views per slug and ignores non-slugs', () => {
    expect(counterBumpsFrom([
      { event_type: 'share_viewed', user_id: null, anon_id: A, metadata: { slug: 'AbCdEfGh12' } },
      { event_type: 'share_viewed', user_id: null, anon_id: B, metadata: { slug: 'AbCdEfGh12' } },
      { event_type: 'share_viewed', user_id: null, anon_id: B, metadata: { slug: '../../etc' } },
      { event_type: 'query', user_id: null, anon_id: B, metadata: { slug: 'AbCdEfGh12' } },
    ])).toEqual([{ slug: 'AbCdEfGh12', kind: 'view', by: 2 }])
  })
})
