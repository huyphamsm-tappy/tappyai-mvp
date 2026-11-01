// 01/11 (owner UAT, PDFs before/after the 02/11 fixes: the plan card is accurate but reads bland - "Nghỉ ngơi, dạo khu khách sạn", "ăn mì Quảng
// ở khu trung tâm (chưa xác minh)", only "Kinh nghiệm chung" tips). The model fills present_plan from that tool's own description and fields,
// which only said "3-6 items, a real place". The description now says what makes a plan worth following; general principles, no topic or place.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { PRESENT_PLAN_DESCRIPTION, PRESENT_PLAN_FIELD_NOTES, THINK_DEEPER_DESCRIPTION } from './oneBrain'

describe('present_plan description', () => {
  it('asks for a theme per day and a day kept inside one area', () => {
    expect(PRESENT_PLAN_DESCRIPTION).toMatch(/theme/i)
    expect(PRESENT_PLAN_DESCRIPTION).toMatch(/one area|same area|inside one/i)
  })
  it('asks for the specific venue and the thing to try, with the reason it is on the plan', () => {
    expect(PRESENT_PLAN_DESCRIPTION).toMatch(/specific/i)
    expect(PRESENT_PLAN_DESCRIPTION).toMatch(/dish|try/i)
    expect(PRESENT_PLAN_DESCRIPTION).toMatch(/why/i)
  })
  it('asks for how long to stay and how to get between stops, and no filler slots', () => {
    expect(PRESENT_PLAN_DESCRIPTION).toMatch(/how long/i)
    expect(PRESENT_PLAN_DESCRIPTION).toMatch(/get (from|to)|travel between|how to get/i)
    expect(PRESENT_PLAN_DESCRIPTION).toMatch(/free time|filler/i)
  })
  it('keeps what it said before: once, after looking things up, then only a short summary', () => {
    expect(PRESENT_PLAN_DESCRIPTION).toMatch(/once/i)
    expect(PRESENT_PLAN_DESCRIPTION).toMatch(/after looking things up/i)
    expect(PRESENT_PLAN_DESCRIPTION).toMatch(/short summary/i)
  })
  it('names no place, dish, product or language', () => {
    expect(PRESENT_PLAN_DESCRIPTION).not.toMatch(/Hà Nội|Đà Nẵng|Quy Nhơn|Tokyo|New York|phở|mì Quảng/i)
  })
})

describe('present_plan fields', () => {
  it('a stop is named by its own name and says why it is there', () => {
    expect(PRESENT_PLAN_FIELD_NOTES.name).toMatch(/own name/i)
    expect(PRESENT_PLAN_FIELD_NOTES.description).toMatch(/why/i)
  })
})

describe('think_deeper', () => {
  it('always applies to a plan or itinerary the person will act on', () => {
    expect(THINK_DEEPER_DESCRIPTION).toMatch(/itinerar/i)
    expect(THINK_DEEPER_DESCRIPTION).toMatch(/always/i)
  })
  it('names advice the person will act on and recent or uncertain information as reasons to think', () => {
    expect(THINK_DEEPER_DESCRIPTION).toMatch(/advice/i)
    expect(THINK_DEEPER_DESCRIPTION).toMatch(/recent|current/i)
    expect(THINK_DEEPER_DESCRIPTION).toMatch(/not (be )?sure|uncertain|cannot be sure/i)
  })
  it('stays a principle: it names no topic, place, product or language, and keeps its limits', () => {
    expect(THINK_DEEPER_DESCRIPTION).not.toMatch(/Hà Nội|Đà Nẵng|Tokyo|Shopee|phở|tiếng Việt/i)
    expect(THINK_DEEPER_DESCRIPTION).toMatch(/greeting/i)
    expect(THINK_DEEPER_DESCRIPTION).toMatch(/not from single words/i)
  })
})

describe('the chat route', () => {
  const ROUTE = readFileSync('src/app/api/chat/route.ts', 'utf8')
  it('gives present_plan the description and the field notes from oneBrain.ts', () => {
    expect(ROUTE).toContain('description: PRESENT_PLAN_DESCRIPTION')
    expect(ROUTE).toContain('PRESENT_PLAN_FIELD_NOTES.name')
    expect(ROUTE).toContain('PRESENT_PLAN_FIELD_NOTES.description')
  })
})
