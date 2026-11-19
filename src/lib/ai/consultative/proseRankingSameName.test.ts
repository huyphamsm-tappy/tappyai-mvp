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
  it('the listing whose whole name is the bold name wins over a longer listing that contains it', () => {
    const r = rankingFromProse('- **Pho Thin Bo Ho** - open late', [{ name: 'Pho Thin Bo Ho (Hang Voi) Chon pho gan Ho' }, { name: 'Pho Thin Bo Ho' }])
    expect(r?.picks.map(p => p.name)).toEqual(['Pho Thin Bo Ho'])
  })
})
