import { createAnthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SYSTEM_PROMPT = 'You are TappyAI - a Vietnamese AI assistant specialized in services in Vietnam. Respond in Vietnamese, provide specific info: name, address, price, hours. Be helpful and accurate.'

export const maxDuration = 30

export async function POST(req: Request) {
  const { messages } = await req.json()
  const result = await streamText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: SYSTEM_PROMPT,
    messages,
    maxTokens: 1024,
  })
  return result.toDataStreamResponse()
}
