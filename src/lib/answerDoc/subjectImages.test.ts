import { describe, it, expect, beforeEach } from 'vitest'
import { galleryImageMap, SUBJECT_IMAGES_KIND, sanitizeSubjectImages, readSubjectImages, subjectImageMap, subjectKey, rememberSubjectImages, recallSubjectImages, __resetSubjectImagesCache, subjectImagesFrame } from './subjectImages'

const ann = (images: unknown[]) => ({ kind: SUBJECT_IMAGES_KIND, v: 1, images })

describe('subject images annotation', () => {
  beforeEach(() => __resetSubjectImagesCache())

  it('keeps only safe https pictures with a name, once per subject, at most six', () => {
    const out = sanitizeSubjectImages(ann([
      { name: 'Be', src: 'https://img.example.com/be.jpg' },
      { name: 'be', src: 'https://img.example.com/be2.jpg' },
      { name: 'X', src: 'http://img.example.com/x.jpg' },
      { name: 'Y', src: 'javascript:alert(1)' },
      { name: '', src: 'https://img.example.com/z.jpg' },
      ...Array.from({ length: 8 }, (_, i) => ({ name: `S${i}`, src: `https://img.example.com/${i}.jpg` })),
    ]))
    expect(out?.images.map(i => i.name)).toEqual(['Be', 'S0', 'S1', 'S2', 'S3', 'S4'])
  })

  it('refuses a wrong kind, a wrong version or nothing usable', () => {
    expect(sanitizeSubjectImages({ kind: 'other', v: 1, images: [] })).toBeNull()
    expect(sanitizeSubjectImages({ kind: SUBJECT_IMAGES_KIND, v: 2, images: [{ name: 'A', src: 'https://a.example.com/a.jpg' }] })).toBeNull()
    expect(sanitizeSubjectImages(ann([{ name: 'A', src: 'http://a.example.com/a.jpg' }]))).toBeNull()
    expect(sanitizeSubjectImages(null)).toBeNull()
  })

  it('the client reads the last valid annotation among the message annotations', () => {
    const got = readSubjectImages([{ kind: 'x' }, ann([{ name: 'A', src: 'https://a.example.com/a.jpg' }]), ann([{ name: 'B', src: 'https://b.example.com/b.jpg' }])])
    expect(got?.images[0].name).toBe('B')
    expect(readSubjectImages(undefined)).toBeNull()
  })

  it('matches a card to its picture by name, not by case, accents or spacing', () => {
    expect(subjectKey('  Đà  Lạt ')).toBe('da lat')
    const map = subjectImageMap(sanitizeSubjectImages(ann([{ name: 'Đà Lạt', src: 'https://a.example.com/a.jpg' }])))
    expect(map.get(subjectKey('da LAT'))).toBe('https://a.example.com/a.jpg')
    expect(subjectImageMap(null).size).toBe(0)
  })

  it('the gallery pictures are kept apart from the cards\' pictures, validated the same way, and matched by caption', () => {
    const a = sanitizeSubjectImages({ kind: SUBJECT_IMAGES_KIND, v: 1, images: [], gallery: [{ name: 'Model S', src: 'https://a.example.com/s.jpg' }, { name: 'Bad', src: 'http://a.example.com/b.jpg' }, { name: 'Model 3', src: 'https://a.example.com/3.jpg' }] })
    expect(a?.images).toEqual([])
    expect(a?.gallery?.map(g => g.name)).toEqual(['Model S', 'Model 3'])
    expect(galleryImageMap(a).get(subjectKey('MODEL s'))).toBe('https://a.example.com/s.jpg')
    expect(subjectImageMap(a).size).toBe(0)
    expect(sanitizeSubjectImages({ kind: SUBJECT_IMAGES_KIND, v: 1, images: [], gallery: [{ name: 'X', src: 'http://x.example.com/x.jpg' }] })).toBeNull()
  })

  it('is kept for the tab across the save navigation and sent as one live frame', () => {
    const a = sanitizeSubjectImages(ann([{ name: 'A', src: 'https://a.example.com/a.jpg' }]))!
    rememberSubjectImages('Nội dung câu trả lời dài đủ để làm khóa', a)
    expect(recallSubjectImages('Nội dung câu trả lời dài đủ để làm khóa')).toEqual(a)
    expect(subjectImagesFrame(a)).toBe('8:' + JSON.stringify([a]) + '\n')
  })
})
