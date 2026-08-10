import { describe, it, expect } from 'vitest'
import { shouldExtractMemory } from './memoryGate'
import { classifyIntent, detectForcedTool } from './intent'

// The gate decides whether a turn is worth a THIRD LLM call (memory extraction).
// It is deliberately biased towards extracting: a skipped call saves ~$0.0004,
// a wrongly skipped preference is lost forever. Measured 2026-08-10, the gate it
// replaces (`lastText.length > 20`) was wrong in BOTH directions — it fired on
// weather/gold/news lookups that store nothing, and dropped
// "Tôi ăn chay." (12 chars), "Mình thích cay" (14) and "Nhà mình ở Quận 3." (18).
// The first of those is a hard dietary constraint the system prompt treats as
// absolute, and it never reached memory.

/** Call it the way the route does, deriving intent and forcedTool from the text. */
const gate = (text: string) => shouldExtractMemory({
  text,
  intent: classifyIntent(text),
  forcedTool: detectForcedTool(text),
})

describe('shouldExtractMemory', () => {
  describe('SKIP — nothing durable to store', () => {
    for (const t of [
      // chitchat
      'Cảm ơn bạn.', 'thanks', 'Chào Tappy', 'ok', 'hello', 'tạm biệt',
      // ephemeral lookups, VI
      'Hôm nay thời tiết Hà Nội thế nào?', 'Giá vàng hôm nay bao nhiêu?',
      'Tin tức mới nhất là gì?', 'Tỷ giá USD hôm nay', 'Dự báo thời tiết Đà Nẵng',
      'Giá xăng hôm nay', 'Nhiệt độ ở Sapa bao nhiêu độ',
      // ephemeral lookups, EN — must skip in English too, or the saving is
      // Vietnamese-only and EN users pay for calls VI users don't.
      'What is the gold price today?', 'What is the weather in Da Nang today',
      'latest news headlines', 'current USD exchange rate',
    ]) {
      it(`"${t}"`, () => expect(gate(t)).toBe(false))
    }
  })

  describe('EXTRACT — durable information, VI', () => {
    for (const t of [
      'Tôi thích món ăn ít cay.',
      'Tôi thường đi du lịch với hai con gái.',
      'Từ giờ ưu tiên khách sạn dưới 2 triệu.',
      'Nhớ giúp tôi là tôi thích ngồi ngoài trời.',
      'Tôi ăn chay.',                       // 12 chars — the old gate dropped this
      'Mình thích cay',                     // 14 chars — dropped
      'Nhà mình ở Quận 3.',                 // 18 chars — dropped
      'Mình bị dị ứng hải sản',
      'Tôi không thích đồ ngọt',
      'Gia đình mình thường đi ăn cuối tuần',
      'Ngân sách của mình khoảng 500k',
      'Vợ mình không ăn được cay',
    ]) {
      it(`"${t}"`, () => expect(gate(t)).toBe(true))
    }
  })

  describe('EXTRACT — durable information, EN', () => {
    for (const t of [
      'I am allergic to peanuts.',
      'From now on prefer hotels under 2 million VND.',
      'I like quiet cafes',
      'I usually travel with my family',
      'Remember that I am vegetarian',
      'My budget is around 500k',
      "I don't like spicy food",
    ]) {
      it(`"${t}"`, () => expect(gate(t)).toBe(true))
    }
  })

  describe('EXTRACT — ordinary requests still carry location/budget signal', () => {
    // Measured: these really do yield memory — t16 returned
    // [location_base, budget, history], t17 returned [location_base, ...].
    // Defaulting to extract here is what keeps that working.
    for (const t of [
      'Gợi ý quán ăn ngon ở Quận 1 giá dưới 200k',
      'Suggest a good seafood restaurant in Da Nang',
      'Tìm khách sạn ở Đà Nẵng cho 2 người',
      'Lên lịch trình du lịch Đà Nẵng 3 ngày ngân sách 5 triệu',
    ]) {
      it(`"${t}"`, () => expect(gate(t)).toBe(true))
    }
  })

  describe('EXTRACT — short requests with no first-person marker still carry signal', () => {
    // These match no DURABLE_SIGNAL phrase, so only the length floor stands
    // between them and being skipped. Extraction measurably pulls location_base
    // out of exactly this shape, which is why the floor is 12 and not the old 20
    // — at 21 every one of these silently stops being remembered.
    for (const t of [
      'Quán ăn Quận 7',        // 14
      'Cafe ở Đà Nẵng',        // 14
      'Spa tốt ở Hà Nội',      // 16
      'Hotels in Da Nang',     // 17
    ]) {
      it(`"${t}" (${t.length} chars)`, () => expect(gate(t)).toBe(true))
    }
  })

  it('a durable statement wins even when the turn looks ephemeral', () => {
    // The category check must never override a real preference. detectForcedTool
    // returns get_weather here, but the user also stated something durable.
    expect(gate('Thời tiết Hà Nội thế nào? Mà mình thích quán ngoài trời')).toBe(true)
    expect(gate('Giá vàng hôm nay? Tôi ăn chay nhé')).toBe(true)
  })

  it('is not fooled by text too short to carry anything', () => {
    expect(gate('ừ')).toBe(false)
    expect(gate('sao')).toBe(false)
    expect(gate('123')).toBe(false)
  })

  it('treats an empty or whitespace message as nothing to store', () => {
    expect(gate('')).toBe(false)
    expect(gate('    ')).toBe(false)
  })
})
