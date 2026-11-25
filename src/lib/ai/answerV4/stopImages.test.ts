// 16/11 (owner's mockup: every stop of the itinerary has its photo): the stops no place card could illustrate get a web picture, confirmed by looking at it.
import { describe, it, expect } from 'vitest'
import { planStopsWithoutPhoto, resolveStopImages, MAX_STOP_LOOKUPS } from './subjectImages'
import { sanitizeSubjectImages, SUBJECT_IMAGES_KIND, stopImageMap } from '@/lib/answerDoc/subjectImages'

const plan = (days: unknown[]) => `Mở đầu.\n[TAPPY_PLAN]\n${JSON.stringify({ type: 'trip', title: 'Đà Lạt', days })}\n[/TAPPY_PLAN]\nKết.`

describe('planStopsWithoutPhoto', () => {
  it('real places with no photo of their own, in plan order: a stop with an address, a map link or a place id; transfers and "a meal downtown" are not places', () => {
    const text = plan([{ label: 'Ngày 1', items: [
      { name: 'Bánh căn Dốc Ga', address: '18 Nguyễn Trãi, Đà Lạt' },
      { name: 'Hồ Xuân Hương', maps_link: 'https://maps.google.com/?cid=1' },
      { name: 'Thác Datanla', place_id: 'abc' },
      { name: 'Đồi chè Cầu Đất', category: 'activity' },
      { name: 'Bữa trưa ở trung tâm', category: 'food' },
      { name: 'Chợ Đêm', address: 'Phường 1', photo_url: 'https://img.example.com/a.jpg' },
      { name: 'Bữa trưa món địa phương ở trung tâm' },
      { name: 'Rời Đà Lạt', address: 'Xem bản đồ' },
      { name: 'Bánh căn Dốc Ga', address: '18 Nguyễn Trãi, Đà Lạt' },
    ] }])
    expect(planStopsWithoutPhoto(text)).toEqual([{ name: 'Bánh căn Dốc Ga', hint: '18 Nguyễn Trãi, Đà Lạt' }, { name: 'Hồ Xuân Hương' }, { name: 'Thác Datanla' }, { name: 'Đồi chè Cầu Đất' }])
  })
  it('at most MAX_STOP_LOOKUPS stops; no plan, a malformed plan or an unclosed one gives none', () => {
    const many = plan([{ label: 'd', items: Array.from({ length: 20 }, (_, i) => ({ name: `Điểm ${i}`, address: 'x' })) }])
    expect(planStopsWithoutPhoto(many)).toHaveLength(MAX_STOP_LOOKUPS)
    expect(planStopsWithoutPhoto('chỉ là văn bản')).toEqual([])
    expect(planStopsWithoutPhoto('[TAPPY_PLAN]{không phải json}[/TAPPY_PLAN]')).toEqual([])
    expect(planStopsWithoutPhoto('[TAPPY_PLAN]{"days":[]}')).toEqual([])
  })
})

describe('resolveStopImages', () => {
  const searched: string[] = []
  const web = async (q: string) => { searched.push(q); return ['https://img.example.com/1.jpg', 'http://insecure.example.com/2.jpg', 'https://img.example.com/3.jpg'] }
  it('searches by the stop\'s name and where it is, keeps only the safe https candidates and the first one the check confirms', async () => {
    searched.length = 0
    const out = await resolveStopImages([{ name: 'Bánh căn Dốc Ga', hint: '18 Nguyễn Trãi' }], { webImages: web, verify: async items => items.map((_, k) => k === 1) })
    expect(searched).toEqual(['Bánh căn Dốc Ga 18 Nguyễn Trãi'])
    expect(out).toEqual([{ name: 'Bánh căn Dốc Ga', src: 'https://img.example.com/3.jpg' }])
  })
  it('a check that confirms nothing, or fails, leaves the stop without a picture: a missing picture costs less than a wrong one', async () => {
    expect(await resolveStopImages([{ name: 'A' }], { webImages: web, verify: async items => items.map(() => false) })).toEqual([])
    expect(await resolveStopImages([{ name: 'A' }], { webImages: web, verify: async () => { throw new Error('down') } })).toEqual([])
  })
})

describe('the annotation carries the stops', () => {
  it('stops are kept (at most ten, https only) beside the subject images and read back by name, accents and case aside', () => {
    const stops = Array.from({ length: 12 }, (_, i) => ({ name: `Điểm ${i}`, src: `https://img.example.com/${i}.jpg` }))
    const a = sanitizeSubjectImages({ kind: SUBJECT_IMAGES_KIND, v: 1, images: [], stops: [...stops, { name: 'Xấu', src: 'http://x.example.com/a.jpg' }] })
    expect(a?.stops).toHaveLength(10)
    expect(stopImageMap(a).get('diem 3')).toBe('https://img.example.com/3.jpg')
    expect(sanitizeSubjectImages({ kind: SUBJECT_IMAGES_KIND, v: 1, images: [], stops: [{ name: 'Xấu', src: 'http://x.example.com/a.jpg' }] })).toBeNull()
  })
})
