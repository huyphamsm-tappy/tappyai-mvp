import { describe, it, expect } from 'vitest'
import { routeConsult } from './consultRouter'
import { askAreaOf, askIconOf, askStepKind } from '@/lib/structuredContent/askCardModel'

// Owner 30/09 (R25 follow-up): a fare link is route + date, and "vé máy bay đi Đà Nẵng" never asked where from — TP.HCM was
// assumed for everyone. The origin is asked in the SAME quick-ask card (the new frame) unless the words already say it.
const route = (msgs: Array<{ role: string; content: string }>) => routeConsult(msgs, { hasGps: true, lang: 'vi' }).decision
const ids = (d: ReturnType<typeof route>) => d.ask?.questions.map(q => q.id)

describe('flight ask — where from?', () => {
  it('"vé máy bay đi Đà Nẵng" asks date, ORIGIN and party (time last, dropped from a full card)', () => {
    const d = route([{ role: 'user', content: 'vé máy bay đi Đà Nẵng' }])
    expect(d.turn).toBe('ask')
    expect(ids(d)).toEqual(['date', 'origin', 'party'])
    const o = d.ask!.questions.find(q => q.id === 'origin')!
    expect(o.q).toBe('Bay từ đâu?')
    expect(o.options).toEqual(['Từ TP.HCM', 'Từ Hà Nội', 'Từ nơi khác']) // Đà Nẵng is the destination, never offered as the origin
  })
  it('the destination is never offered as the origin either way', () => {
    const d = route([{ role: 'user', content: 'vé máy bay ra Hà Nội' }])
    expect(d.ask!.questions.find(q => q.id === 'origin')!.options).toEqual(['Từ TP.HCM', 'Từ Đà Nẵng', 'Từ nơi khác'])
  })
  it('a route in the user\'s words asks nothing about the origin (behaviour unchanged)', () => {
    const d = route([{ role: 'user', content: 'vé máy bay hà nội đi đà nẵng' }])
    expect(ids(d)).toEqual(['date', 'party', 'time'])
    expect(route([{ role: 'user', content: 'vé máy bay từ hà nội đến đà nẵng' }]).ask?.questions.map(q => q.id)).toEqual(['date', 'party', 'time'])
  })
  it('a date but no origin still asks the origin (not a silent TP.HCM)', () => {
    const d = route([{ role: 'user', content: 'vé máy bay đi Đà Nẵng 15/10' }])
    expect(d.turn).toBe('ask')
    expect(ids(d)?.[0]).toBe('origin')
  })
  it('the answer to the card reads "Từ Hà Nội" back as the origin', () => {
    const d = route([
      { role: 'user', content: 'vé máy bay đi Đà Nẵng' },
      { role: 'assistant', content: 'Để tìm chuyến bay hợp nhất:\n\n[TAPPY_ASK]{"v":1,"questions":[{"id":"date","q":"Ngày bay?","options":["Cuối tuần này","Tuần sau"]},{"id":"origin","q":"Bay từ đâu?","options":["Từ TP.HCM","Từ Hà Nội"]},{"id":"party","q":"Mấy người?","options":["1 người","2 người"]}]}[/TAPPY_ASK]' },
      { role: 'user', content: 'Cuối tuần này · Từ Hà Nội · 1 người' },
    ])
    expect(d.turn).toBe('pick')
    expect(d.known).toMatchObject({ xuat_phat: 'Hà Nội', diem_den: 'Đà Nẵng', so_nguoi: '1 người' })
  })
  it('the new ask card frame shows it as a travel card: date, a map-pin origin, party', () => {
    const qs = route([{ role: 'user', content: 'vé máy bay đi Đà Nẵng' }]).ask!.questions
    expect(askAreaOf(qs)).toBe('travel')
    expect(qs.map(q => askStepKind(q))).toEqual(['time', 'other', 'party'])
    const o = qs[1]
    expect(o.options.map(x => askIconOf(x, askStepKind(o), o.q))).toEqual(['MapPin', 'MapPin', 'MapPin'])
  })
})
