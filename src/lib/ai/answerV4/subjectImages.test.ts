import { describe, it, expect } from 'vitest'
import { resolveSubjectImages, resolveGalleryImages, MAX_SUBJECT_LOOKUPS } from './subjectImages'
import type { MediaEntity } from '@/lib/media/mediaHosts'
import type { ImageToCheck } from './imageSense'

const article = (image?: string): MediaEntity => ({ name: 'x', summary: 's', href: 'https://vi.wikipedia.org/wiki/x', source: 'Wikipedia', ...(image ? { image } : {}) })
/** the model's look at the pictures, replaced: every picture confirmed */
const yes = async (xs: ImageToCheck[]) => xs.map(() => true)

describe('resolveSubjectImages', () => {
  it('a subject Wikipedia can illustrate costs no web search; one it cannot gets one safe picture, searched by its name and the comparison title', async () => {
    const queries: string[] = []
    const out = await resolveSubjectImages([{ name: 'Grab', hint: 'Grab và Be' }, { name: 'Be', hint: 'Grab và Be' }], 'vi', {
      wiki: async s => (s === 'Grab' ? article('https://upload.wikimedia.org/g.png') : article()),
      webImages: async q => { queries.push(q); return ['http://insecure.example.com/a.jpg', 'https://img.example.com/be.jpg'] },
      verify: yes,
    })
    expect(queries).toEqual(['Be Grab và Be'])
    expect(out).toEqual([{ name: 'Be', src: 'https://img.example.com/be.jpg' }])
  })

  it('no usable picture, a failing lookup or a too short name: no picture, never an error', async () => {
    const out = await resolveSubjectImages([{ name: 'A' }, { name: 'Python' }, { name: 'Ruby' }], 'vi', {
      wiki: async () => { throw new Error('down') },
      webImages: async q => { if (q === 'Ruby') throw new Error('boom'); return ['http://x.example.com/a.jpg'] },
      verify: yes,
    })
    expect(out).toEqual([])
  })

  it('looks up at most a few subjects and gives up at the deadline', async () => {
    const asked: string[] = []
    await resolveSubjectImages(Array.from({ length: 9 }, (_, i) => ({ name: `Subject ${i}` })), 'vi', { wiki: async () => null, webImages: async q => { asked.push(q); return [] }, verify: yes })
    expect(asked.length).toBe(MAX_SUBJECT_LOOKUPS)
    const slow = await resolveSubjectImages([{ name: 'Slow' }], 'vi', { wiki: async () => null, webImages: () => new Promise(r => setTimeout(() => r(['https://img.example.com/s.jpg']), 200)), verify: yes, timeoutMs: 20 })
    expect(slow).toEqual([])
  })

  it('a picture the check does not confirm is dropped; the check sees the subject and its topic', async () => {
    let seen: ImageToCheck[] = []
    const out = await resolveSubjectImages([{ name: 'Be', hint: 'Grab và Be' }, { name: 'Python', hint: 'học lập trình' }], 'vi', {
      wiki: async () => null,
      webImages: async q => [`https://img.example.com/${encodeURIComponent(q)}.jpg`],
      verify: async xs => { seen = xs; return xs.map(x => x.label.startsWith('Python')) },
    })
    expect(seen.map(s => s.label).sort()).toEqual(['Be (Grab và Be)', 'Python (học lập trình)'])
    expect(out.map(o => o.name)).toEqual(['Python'])
  })

  it('a failing check confirms nothing: a missing picture costs less than a wrong one', async () => {
    const out = await resolveSubjectImages([{ name: 'Be' }], 'vi', { wiki: async () => null, webImages: async () => ['https://img.example.com/be.jpg'], verify: async () => { throw new Error('vision down') } })
    expect(out).toEqual([])
  })
})

describe('resolveGalleryImages', () => {
  it('a gallery shot is searched by the model\'s own words and keeps its caption; a shot with no safe picture is left out', async () => {
    const queries: string[] = []
    const out = await resolveGalleryImages([{ caption: 'Roadster 2008', query: 'Tesla Roadster 2008' }, { caption: 'Model S', query: 'Tesla Model S' }, { caption: 'Lost', query: 'nothing' }], {
      webImages: async q => { queries.push(q); return q === 'nothing' ? ['http://insecure.example.com/x.jpg'] : [`https://img.example.com/${encodeURIComponent(q)}.jpg`] },
      verify: yes,
    })
    expect(queries.sort()).toEqual(['Tesla Model S', 'Tesla Roadster 2008', 'nothing'])
    expect(out.map(o => o.name).sort()).toEqual(['Model S', 'Roadster 2008'])
  })

  it('the check sees each caption with its search words, and only the confirmed pictures stay', async () => {
    let seen: ImageToCheck[] = []
    const out = await resolveGalleryImages([{ caption: 'Roadster 2008', query: 'Tesla Roadster 2008' }, { caption: 'Model S', query: 'Tesla Model S' }], {
      webImages: async q => [`https://img.example.com/${encodeURIComponent(q)}.jpg`],
      verify: async xs => { seen = xs; return xs.map(x => x.label.startsWith('Model S')) },
    })
    expect(seen.map(s => s.label).sort()).toEqual(['Model S (Tesla Model S)', 'Roadster 2008 (Tesla Roadster 2008)'])
    expect(out.map(o => o.name)).toEqual(['Model S'])
  })

  it('asks the search for a few candidates and keeps the FIRST one the check confirms for each shot', async () => {
    const out = await resolveGalleryImages([{ caption: 'Cybertruck', query: 'Tesla Cybertruck' }, { caption: 'Roadster', query: 'Tesla Roadster' }], {
      webImages: async q => [1, 2, 3, 4].map(n => `https://img.example.com/${encodeURIComponent(q)}-${n}.jpg`),
      verify: async xs => xs.map(x => /-2\.jpg$/.test(x.src) || /Roadster-3\.jpg$/.test(x.src)),
    })
    expect(out.map(o => o.src)).toEqual(['https://img.example.com/Tesla%20Cybertruck-2.jpg', 'https://img.example.com/Tesla%20Roadster-2.jpg'])
  })

  it('a failing search, a failing check or a slow one is silence', async () => {
    expect(await resolveGalleryImages([{ caption: 'A', query: 'a' }], { webImages: async () => { throw new Error('x') }, verify: yes })).toEqual([])
    expect(await resolveGalleryImages([{ caption: 'A', query: 'a' }], { webImages: async () => ['https://img.example.com/a.jpg'], verify: async () => { throw new Error('x') } })).toEqual([])
    expect(await resolveGalleryImages([{ caption: 'A', query: 'a' }], { webImages: () => new Promise(r => setTimeout(() => r(['https://img.example.com/a.jpg']), 200)), verify: yes, timeoutMs: 20 })).toEqual([])
  })
})
