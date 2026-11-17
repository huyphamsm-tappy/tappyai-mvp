// 16/11 (owner's mockup, tab 2): the gallery block - the model names what to show and the words to find it; no address, no picture comes from the model.
import { describe, it, expect } from 'vitest'
import { parsePresentation } from './contract'
import { validateDeclared, ResultLedger } from './declare'

const wrap = (blocks: unknown[]) => ({ v: 1, blocks })
const shot = (caption: string, query: string) => ({ caption, query })

describe('gallery block', () => {
  it('two or three shots, each a caption and search words, kept in order', () => {
    const p = parsePresentation(wrap([{ id: 'g', type: 'gallery', title: 'Hình ảnh', images: [shot('Tesla Roadster 2008', 'Tesla Roadster 2008 first generation'), shot('Model S', 'Tesla Model S'), shot('Model 3', 'Tesla Model 3'), shot('Cybertruck', 'Tesla Cybertruck')] }]))
    expect(p?.blocks[0]).toMatchObject({ type: 'gallery', title: 'Hình ảnh' })
    const items = (p!.blocks[0] as { items: Array<{ caption: string }> }).items
    expect(items.map(i => i.caption)).toEqual(['Tesla Roadster 2008', 'Model S', 'Model 3']) // at most three
  })

  it('a parsed gallery parses again: the server sends the contract (items) and the client reads it back (the pictures never appeared when only the declared field name was read)', () => {
    const once = parsePresentation(wrap([{ id: 'g', type: 'gallery', images: [shot('A', 'a car'), shot('B', 'b place')] }]))!
    const twice = parsePresentation(JSON.parse(JSON.stringify(once)))
    expect(twice).toEqual(once)
    expect(twice?.blocks[0]).toMatchObject({ type: 'gallery', items: [{ caption: 'A', query: 'a car' }, { caption: 'B', query: 'b place' }] })
  })

  it('fewer than two usable shots is no gallery; a repeated caption, an empty field or a link in the query is dropped', () => {
    expect(parsePresentation(wrap([{ id: 'g', type: 'gallery', images: [shot('A', 'a car')] }]))).toBeNull()
    expect(parsePresentation(wrap([{ id: 'g', type: 'gallery', images: [shot('A', 'https://evil.example.com/a.jpg'), shot('B', 'b place')] }]))).toBeNull()
    expect(parsePresentation(wrap([{ id: 'g', type: 'gallery', images: [shot('A', 'a car'), shot('a', 'again'), shot('', 'x'), shot('B', '')] }]))).toBeNull()
    expect(parsePresentation(wrap([{ id: 'g', type: 'gallery' }]))).toBeNull()
  })

  it('a text marker inside a caption makes the shot unusable', () => {
    expect(parsePresentation(wrap([{ id: 'g', type: 'gallery', images: [shot('[TAPPY_PLAN]x', 'a'), shot('B', 'b place')] }]))).toBeNull()
  })

  it('travels through the declared-blocks check with the other blocks', () => {
    const out = validateDeclared(wrap([
      { id: 'g', type: 'gallery', images: [shot('A', 'a car'), shot('B', 'b place')] },
      { id: 'p', type: 'profiles', items: [{ name: 'X', points: [{ text: 'a' }] }, { name: 'Y', points: [{ text: 'b' }] }] },
    ]), new ResultLedger(), new Set())
    expect(out?.blocks.map(b => b.type)).toEqual(['gallery', 'profiles'])
  })
})
