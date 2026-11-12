import { beforeEach, describe, expect, it, vi } from 'vitest'
import { v206Store as s } from '@/lib/chat/v206Store'
import type { EntityProfile, PlanTip } from '@/lib/chat/v206'

const tip = (id: string, text = id): PlanTip => ({ id, text, source: 'answer' })
const profile: EntityProfile = { key: 'a', title: 'A', facts: [], links: [] }

describe('v206Store', () => {
  beforeEach(() => s.reset())

  it('publishes the tips of each message and flattens them with unique ids', () => {
    s.publishTips('m1', [tip('a')]); s.publishTips('m2', [tip('a')])
    expect(s.getSnapshot().tips.map(t => t.id)).toEqual(['m1:a', 'm2:a'])
  })
  it('a message with no tips takes its entry back', () => {
    s.publishTips('m1', [tip('a')]); s.publishTips('m1', [])
    expect(s.getSnapshot().tips).toEqual([])
  })
  it('the same tips again do not notify (no render loop)', () => {
    const l = vi.fn(); const off = s.subscribe(l)
    s.publishTips('m1', [tip('a')]); s.publishTips('m1', [tip('a')])
    expect(l).toHaveBeenCalledTimes(1); off()
  })
  it('the drawers are mutually exclusive: opening one replaces the other', () => {
    s.publishTips('m1', [tip('a')])
    s.openTips(); expect(s.getSnapshot().drawer).toEqual({ kind: 'tips' })
    s.openEntity(profile); expect(s.getSnapshot().drawer).toEqual({ kind: 'entity', profile })
    s.openTips(); expect(s.getSnapshot().drawer).toEqual({ kind: 'tips' })
  })
  it('the tips drawer does not open when there are no tips (the control is hidden, not faked)', () => {
    s.openTips(); expect(s.getSnapshot().drawer).toBeNull()
  })
  it('the tips drawer closes when the last tips leave; an entity drawer stays', () => {
    s.publishTips('m1', [tip('a')]); s.openTips(); s.clearTips('m1')
    expect(s.getSnapshot().drawer).toBeNull()
    s.openEntity(profile); s.publishTips('m2', [tip('b')]); s.clearTips('m2')
    expect(s.getSnapshot().drawer).toEqual({ kind: 'entity', profile })
  })
  it('reset clears everything', () => {
    s.publishTips('m1', [tip('a')]); s.openTips(); s.reset()
    expect(s.getSnapshot()).toMatchObject({ tips: [], drawer: null })
  })
})
