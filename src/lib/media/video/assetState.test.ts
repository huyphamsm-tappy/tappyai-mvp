import { describe, it, expect } from 'vitest'
import {
  VIDEO_ASSET_STATES,
  MODERATION_STATES,
  TRANSITIONS,
  canTransition,
  assertTransition,
  isTerminalState,
  isPubliclyViewable,
  InvalidVideoTransitionError,
} from './assetState'

describe('video asset lifecycle (VID-05)', () => {
  it('knows exactly the eleven states of the plan', () => {
    expect([...VIDEO_ASSET_STATES].sort()).toEqual(
      ['deleted', 'draft', 'failed', 'moderating', 'processing', 'published', 'ready', 'rejected', 'review_required', 'uploaded', 'uploading'].sort(),
    )
    expect([...MODERATION_STATES].sort()).toEqual(['approved', 'pending', 'rejected', 'review_required'])
  })

  it('has an entry for every state and never points at an unknown state', () => {
    for (const s of VIDEO_ASSET_STATES) {
      expect(TRANSITIONS[s], s).toBeDefined()
      for (const to of TRANSITIONS[s]) expect(VIDEO_ASSET_STATES, `${s} -> ${to}`).toContain(to)
    }
  })

  it('walks the happy path in the order of the plan: transcode to staging BEFORE the moderation check', () => {
    const path = ['draft', 'uploading', 'uploaded', 'processing', 'moderating', 'ready', 'published'] as const
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1]), `${path[i]} -> ${path[i + 1]}`).toBe(true)
  })

  it('never lets a video skip processing or moderation on its way to ready/published', () => {
    expect(canTransition('draft', 'published')).toBe(false)
    expect(canTransition('draft', 'ready')).toBe(false)
    expect(canTransition('uploading', 'ready')).toBe(false)
    expect(canTransition('uploaded', 'ready')).toBe(false)
    expect(canTransition('uploaded', 'published')).toBe(false)
    expect(canTransition('processing', 'ready')).toBe(false)
    expect(canTransition('processing', 'published')).toBe(false)
    expect(canTransition('moderating', 'published')).toBe(false)
    expect(canTransition('review_required', 'published')).toBe(false)
    expect(canTransition('failed', 'ready')).toBe(false)
    expect(canTransition('failed', 'published')).toBe(false)
    expect(canTransition('rejected', 'published')).toBe(false)
  })

  it('only a reviewed or auto-approved video can become ready', () => {
    const into = VIDEO_ASSET_STATES.filter(from => canTransition(from, 'ready'))
    expect(into.sort()).toEqual(['moderating', 'review_required'])
  })

  it('only a ready video can be published', () => {
    const into = VIDEO_ASSET_STATES.filter(from => canTransition(from, 'published'))
    expect(into).toEqual(['ready'])
  })

  it('a published video can be pulled back (report, takedown) or deleted', () => {
    expect(canTransition('published', 'review_required')).toBe(true)
    expect(canTransition('published', 'rejected')).toBe(true)
    expect(canTransition('published', 'deleted')).toBe(true)
  })

  it('a failed step can be retried from the step that failed, never skipped past it', () => {
    expect(canTransition('failed', 'uploaded')).toBe(true)
    expect(canTransition('failed', 'processing')).toBe(true)
    expect(canTransition('failed', 'moderating')).toBe(true)
  })

  it('a rejected video can be appealed back into review, and nothing leaves deleted', () => {
    expect(canTransition('rejected', 'review_required')).toBe(true)
    expect(isTerminalState('deleted')).toBe(true)
    expect(TRANSITIONS.deleted).toEqual([])
    for (const s of VIDEO_ASSET_STATES) if (s !== 'deleted') expect(isTerminalState(s), s).toBe(false)
  })

  it('every non-deleted state can be deleted (the owner can always remove a post)', () => {
    for (const s of VIDEO_ASSET_STATES) if (s !== 'deleted') expect(canTransition(s, 'deleted'), s).toBe(true)
  })

  it('a state does not "transition" to itself (a retry of the same step is handled as a no-op elsewhere)', () => {
    for (const s of VIDEO_ASSET_STATES) expect(canTransition(s, s), s).toBe(false)
  })

  it('assertTransition throws a typed error that names both states', () => {
    expect(() => assertTransition('uploaded', 'published')).toThrow(InvalidVideoTransitionError)
    try {
      assertTransition('uploaded', 'published')
    } catch (e) {
      expect((e as InvalidVideoTransitionError).from).toBe('uploaded')
      expect((e as InvalidVideoTransitionError).to).toBe('published')
    }
    expect(() => assertTransition('uploaded', 'processing')).not.toThrow()
  })

  it('is publicly viewable ONLY when published AND approved AND not deleted', () => {
    expect(isPubliclyViewable({ state: 'published', moderationState: 'approved', deletedAt: null })).toBe(true)
    expect(isPubliclyViewable({ state: 'published', moderationState: 'pending', deletedAt: null })).toBe(false)
    expect(isPubliclyViewable({ state: 'published', moderationState: 'review_required', deletedAt: null })).toBe(false)
    expect(isPubliclyViewable({ state: 'published', moderationState: 'rejected', deletedAt: null })).toBe(false)
    expect(isPubliclyViewable({ state: 'ready', moderationState: 'approved', deletedAt: null })).toBe(false)
    expect(isPubliclyViewable({ state: 'moderating', moderationState: 'approved', deletedAt: null })).toBe(false)
    expect(isPubliclyViewable({ state: 'published', moderationState: 'approved', deletedAt: '2026-11-05T00:00:00Z' })).toBe(false)
  })
})
