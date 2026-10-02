import { describe, it, expect } from 'vitest'
import { normalizeHashtag, parseHashtags, mergeHashtags, HASHTAG_MAX_COUNT } from './hashtags'

describe('post hashtags', () => {
  it('the "##" bug: a tag that already carries # is stored without it', () => {
    expect(normalizeHashtag('#Bali')).toBe('Bali')
    expect(normalizeHashtag('##DuLichIndonesia')).toBe('DuLichIndonesia')
    expect(parseHashtags('##Bali ##DuLichIndonesia')).toEqual(['Bali', 'DuLichIndonesia'])
  })
  it('splits typed text on spaces, commas and semicolons, de-duplicates case-insensitively, keeps Vietnamese', () => {
    expect(parseHashtags('#ănngon, #Bali;#bali  #quánCafe')).toEqual(['ănngon', 'Bali', 'quánCafe'])
  })
  it('drops empties and symbols-only pieces', () => {
    expect(parseHashtags('# ## !!! , ,')).toEqual([])
  })
  it('caps at the server limit of 10 and merges lists with the first list leading', () => {
    const many = Array.from({ length: 15 }, (_, i) => `t${i}`).join(' ')
    expect(parseHashtags(many)).toHaveLength(HASHTAG_MAX_COUNT)
    expect(mergeHashtags(['#a', '##b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
  })
})
