import { describe, it, expect } from 'vitest'
import { cannedChitchat, cannedCarriedFact, cannedDataStreamResponse } from './cannedReply'
import { carriedFacts, priorVenuesIn } from './consultative/referenceResolver'

// Cost optimization item 8: greetings and carried-fact follow-ups need no model.

describe('cannedChitchat', () => {
  it('answers pure greetings / thanks / ok / bye in the reply language', () => {
    expect(cannedChitchat('xin chào', 'vi')).toContain('Chào bạn! Mình là Tappy')
    expect(cannedChitchat('Hello!', 'en')).toContain("I'm Tappy")
    expect(cannedChitchat('cảm ơn nhé', 'vi')).toContain('Không có gì')
    expect(cannedChitchat('ok', 'vi')).toContain('Ok!')
    expect(cannedChitchat('bye', 'en')).toContain('Bye')
  })
  it('identity questions and anything with content keep the model', () => {
    expect(cannedChitchat('bạn là ai', 'vi')).toBeNull()
    expect(cannedChitchat('hi, quán bún bò ngon gần đây?', 'vi')).toBeNull()
    expect(cannedChitchat('ok show me cafes', 'en')).toBeNull()
  })
})

describe('cannedCarriedFact', () => {
  const prior = 'Mình chọn **Tám Riêu - Phan Xích Long** cho bữa trưa — 4.8⭐ (2.106 đánh giá), cách bạn 2.9km, mở từ 10:30 đến 21:30. Địa chỉ: 235 Phan Xích Long, Phú Nhuận. Gọi 0334 626 060 để đặt bàn.\n\nNgoài ra **Ốc Đào** cũng ngon.'
  const venues = priorVenuesIn(prior)
  const carried = carriedFacts(prior, venues)
  it('reads hours / phone / address from the prior prose', () => {
    expect(carried[0]).toMatchObject({ name: 'Tám Riêu - Phan Xích Long', hours: '10:30–21:30', phone: '0334 626 060', address: '235 Phan Xích Long, Phú Nhuận' })
    expect(carried[1]).toMatchObject({ name: 'Ốc Đào', hours: null, phone: null, address: null })
  })
  it('answers "quán này mở mấy giờ?" from the carried hours, in the reply language', () => {
    const vi = cannedCarriedFact(['hours'], [venues[0]], carried, 'vi')
    expect(vi).toContain('**Tám Riêu - Phan Xích Long** mở cửa 10:30–21:30.')
    expect(vi).toContain('gọi xác nhận')
    expect(cannedCarriedFact(['phone', 'address'], [venues[0]], carried, 'en')).toContain('phone: **0334 626 060**')
  })
  it('a fact the prose lacks, two venues, or a non-fact question ⇒ the model', () => {
    expect(cannedCarriedFact(['hours'], [venues[1]], carried, 'vi')).toBeNull()
    expect(cannedCarriedFact(['hours'], venues, carried, 'vi')).toBeNull()
    expect(cannedCarriedFact(['crowd'], [venues[0]], carried, 'vi')).toBeNull()
    expect(cannedCarriedFact(['hours', 'price'], [venues[0]], carried, 'vi')).toBeNull()
    expect(cannedCarriedFact([], [venues[0]], carried, 'vi')).toBeNull()
  })
})

describe('cannedDataStreamResponse', () => {
  it('is one text frame and a finish frame in the AI SDK data-stream format', async () => {
    const res = cannedDataStreamResponse('Chào bạn!', { 'X-Decision-Evidence-Id': 'abc' })
    expect(res.headers.get('x-vercel-ai-data-stream')).toBe('v1')
    expect(res.headers.get('X-Decision-Evidence-Id')).toBe('abc')
    const body = await res.text()
    expect(body.split('\n').filter(Boolean)).toEqual(['0:"Chào bạn!"', 'd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}'])
  })
})
