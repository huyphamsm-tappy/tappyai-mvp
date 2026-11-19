// 19/11 final UAT: the answer named three pho places in bold, the cards showed two. The third place came back from the search twice under the very same name
// (two branches), the match found two candidates and dropped it as ambiguous.
import { describe, it, expect } from 'vitest'
import { rankingFromProse } from './proseRanking'

const candidates = [{ name: 'Pho Thin Bo Ho' }, { name: 'Pho bung Hang Trong' }, { name: 'Pho Thin Bo Ho' }, { name: 'Pho Ga Huyen Huong' }]
const text = '- **Pho bung Hang Trong** - old town style\n- **Pho Ga Huyen Huong** - chicken pho\n- **Pho Thin Bo Ho** - open late'

describe('rankingFromProse: a name two listings share', () => {
  it('is the same pick, the first listing, so every named place gets its card', () => {
    const r = rankingFromProse(text, candidates)
    expect(r?.picks.map(p => p.name)).toEqual(['Pho bung Hang Trong', 'Pho Ga Huyen Huong', 'Pho Thin Bo Ho'])
  })
  it('two branches of one name: the branch whose street the answer says is the pick', () => {
    const c = [{ name: 'Pho Thin Bo Ho', detail: '19 P. Hang Voi, Hoan Kiem' }, { name: 'Pho Thin Bo Ho', detail: '1 P. Hang Tre, Pho co' }]
    const r = rankingFromProse('I choose **Pho Thin Bo Ho**, 1 Hang Tre - near the lake', c)
    expect(r?.picks.map(p => p.name)).toEqual(['Pho Thin Bo Ho'])
    expect(r?.picks).toHaveLength(1)
  })
  it('a venue named in plain text (not bold) gets its card too, in the order of the text', () => {
    const c = [{ name: 'On Time Cau Giay' }, { name: 'Study-ik Coworking Books Coffee' }, { name: 'Other Place Far Away' }]
    const r = rankingFromProse('I lean to Study-ik Coworking Books Coffee; On Time Cau Giay is the second choice.', c)
    expect(r?.picks.map(p => p.name)).toEqual(['Study-ik Coworking Books Coffee', 'On Time Cau Giay'])
  })
  it('two branches of one name written in plain text: the branch whose street follows the name is the pick', () => {
    const c = [{ name: 'Pho Thin Bo Ho', detail: '19 P. Hang Voi, Hoan Kiem' }, { name: 'Pho Thin Bo Ho', detail: '1 P. Hang Tre, Pho co' }]
    const r = rankingFromProse('I choose Pho Thin Bo Ho, 1 Hang Tre - near the lake', c)
    expect(r?.picks).toHaveLength(1)
    expect(r?.picks[0].name).toBe('Pho Thin Bo Ho')
    expect(r?.picks[0].at).toBe(1) // the second listing: the one on Hang Tre
    expect(rankingFromProse('I choose Pho Thin Bo Ho, 19 Hang Voi', c)?.picks[0].at).toBe(0)
    expect(rankingFromProse('I choose Pho Thin Bo Ho, somewhere', c)).toBeNull()
  })
  it('the words most listings share do not make a match: another hotel in the same city is not the one named', () => {
    const c = [{ name: 'Khach san Sai Gon - Quy Nhon' }, { name: 'Khach san Mira Quy Nhon' }, { name: 'Khach san Sala Quy Nhon' }, { name: 'Khach san Menora Quy Nhon' }]
    const r = rankingFromProse('Tonight **Khach san Menora Quy Nhon** has a room.', c)
    expect(r?.picks.map(p => p.name)).toEqual(['Khach san Menora Quy Nhon'])
    expect(rankingFromProse('Tonight **Khach san Lotus Quy Nhon** has a room.', c)).toBeNull()
  })
  it('a shorter mention that is the start of a longer name already picked is not another card', () => {
    const c = [{ name: 'Bun Bo Hue O Lac CN 2' }, { name: 'Bun Bo Hue O Lac' }]
    const r = rankingFromProse('Start with **Bun Bo Hue O Lac CN 2**; Bun Bo Hue O Lac CN 2 opens early.', c)
    expect(r?.picks.map(p => p.name)).toEqual(['Bun Bo Hue O Lac CN 2'])
  })
  it('a name two listings share is not picked from plain text (ambiguous), a short generic name is not either', () => {
    expect(rankingFromProse('try Pho Thin Bo Ho today', [{ name: 'Pho Thin Bo Ho' }, { name: 'Pho Thin Bo Ho' }])).toBeNull()
    expect(rankingFromProse('try Cafe today', [{ name: 'Cafe' }])).toBeNull()
  })
  it('the listing whose whole name is the bold name wins over a longer listing that contains it', () => {
    const r = rankingFromProse('- **Pho Thin Bo Ho** - open late', [{ name: 'Pho Thin Bo Ho (Hang Voi) Chon pho gan Ho' }, { name: 'Pho Thin Bo Ho' }])
    expect(r?.picks.map(p => p.name)).toEqual(['Pho Thin Bo Ho'])
  })
})
