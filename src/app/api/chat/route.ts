import { createAnthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SYSTEM_PROMPT = `You are TappyAI - a Vietnamese AI assistant specialized in services in Vietnam.

Specialties: Food (nha hang, quan cafe), Shopping (cua hang, trung tam mua sam), Entertainment (cinema, karaoke), Travel (khach san, dia diem), Spa & Beauty (salon, spa).

Instructions:
- Respond primarily in Vietnamese, friendly tone
- Provide SPECIFIC information: name, address, price, hours, phone
- DO NOT use vague price ranges - if unknown, say so clearly
- Suggest 1-2 alternatives when relevant
- Prioritize HCMC and Hanoi unless specified otherwise
- Be honest when you don't know specific information`

export const maxDuration = 30

export async function POST(req: Request) {
  const { messages } = await req.json()
  const result = streamText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: SYSTEM_PROMPT,
    messages,
    maxTokens: 1024,
  })
  return result.toDataStreamResponse()
}
