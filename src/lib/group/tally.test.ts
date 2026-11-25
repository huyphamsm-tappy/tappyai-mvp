import { describe, it, expect } from 'vitest'
import { tally } from './tally'

// Owner 20/11: one vote per person, changeable; the group decides by MAJORITY: a place is chosen as soon as MORE THAN HALF of the participants (the creator and the accepted members) vote for it.
// When everyone has voted and nobody has a majority, the leader chooses among the places (the leader never skips a majority).
const v = (user: string, option: string) => ({ user_id: user, option_id: option })

describe('tally: who has how many votes, and is there a majority', () => {
  it('counts the votes per option, one per person (a person who changed their mind counts once, as the last vote)', () => {
    const t = tally(5, [v('a', '1'), v('b', '2'), v('c', '1')], ['1', '2', '3'])
    expect(t.counts).toEqual({ '1': 2, '2': 1, '3': 0 })
    expect(t.voted).toBe(3)
  })
  it('a majority is MORE than half of the participants: 3 of 5, 2 of 3, 2 of 4 is not enough, 3 of 4 is, 1 of 1 is', () => {
    expect(tally(5, [v('a', '1'), v('b', '1'), v('c', '1')], ['1', '2']).majority).toBe('1')
    expect(tally(3, [v('a', '2'), v('b', '2')], ['1', '2']).majority).toBe('2')
    expect(tally(4, [v('a', '1'), v('b', '1')], ['1', '2']).majority).toBeNull()
    expect(tally(4, [v('a', '1'), v('b', '1'), v('c', '1')], ['1', '2']).majority).toBe('1')
    expect(tally(1, [v('a', '3')], ['1', '2', '3']).majority).toBe('3')
  })
  it('everyone voted and nobody has a majority: the leader must choose (allVoted, no majority)', () => {
    const t = tally(4, [v('a', '1'), v('b', '1'), v('c', '2'), v('d', '2')], ['1', '2', '3'])
    expect(t.majority).toBeNull()
    expect(t.allVoted).toBe(true)
    expect(tally(4, [v('a', '1')], ['1', '2']).allVoted).toBe(false)
  })
  it('a vote for a place that is not an option, and a second vote of the same person, are ignored', () => {
    const t = tally(3, [v('a', '9'), v('b', '1'), v('b', '2')], ['1', '2'])
    expect(t.counts).toEqual({ '1': 0, '2': 1 })
    expect(t.voted).toBe(1)
  })
  it('no participants or no options never claims a majority', () => {
    expect(tally(0, [], ['1']).majority).toBeNull()
    expect(tally(3, [v('a', '1')], []).majority).toBeNull()
  })
})
