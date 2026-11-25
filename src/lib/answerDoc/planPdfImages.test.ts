import { describe, it, expect } from 'vitest'
import { planPhotoList } from './planPdfImages'

const plan = (items: Array<Record<string, unknown>>) => ({ type: 'trip', title: 'T', days: [{ label: 'D1', items }, { label: 'D2', items: [{ name: 'Z', photo_url: 'https://lh3.googleusercontent.com/p/z' }] }] }) as never

describe('planPhotoList: the pictures a plan PDF may carry', () => {
  it('takes a stop own photo first, else the one found for it, in plan order, one entry per picture', () => {
    const stopImages = new Map([['b', 'https://img.example/b.jpg']])
    const list = planPhotoList(plan([{ name: 'A', photo_url: 'https://lh3.googleusercontent.com/p/a' }, { name: 'B' }, { name: 'C' }]), stopImages, k => k.toLowerCase())
    expect(list).toEqual([
      { name: 'A', url: 'https://lh3.googleusercontent.com/p/a' },
      { name: 'B', url: 'https://img.example/b.jpg' },
      { name: 'Z', url: 'https://lh3.googleusercontent.com/p/z' },
    ])
  })
  it('skips a stop with no picture, an unsafe address and a picture already listed; keeps at most 8', () => {
    const items = [
      { name: 'A', photo_url: 'http://insecure.example/a.jpg' },
      { name: 'B', photo_url: 'https://lh3.googleusercontent.com/p/same' },
      { name: 'B2', photo_url: 'https://lh3.googleusercontent.com/p/same' },
      ...Array.from({ length: 12 }, (_, i) => ({ name: `S${i}`, photo_url: `https://lh3.googleusercontent.com/p/${i}` })),
    ]
    const list = planPhotoList(plan(items), undefined, k => k)
    expect(list.some(x => x.name === 'A')).toBe(false)
    expect(list.filter(x => x.url.endsWith('/same'))).toHaveLength(1)
    expect(list).toHaveLength(8)
  })
  it('a plan with no pictures has an empty list', () => {
    expect(planPhotoList({ title: 'T', days: [{ label: 'D', items: [{ name: 'A' }] }] } as never, undefined, k => k)).toEqual([])
  })
})
