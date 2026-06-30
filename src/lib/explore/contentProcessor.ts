import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'

export interface ContentMeta {
  caption: string
  hashtags: string[]
  category: string
  location: string
}

// Run ONCE on upload — never during feed load or scroll
export async function processContent(thumbnailUrl: string, hint = ''): Promise<ContentMeta> {
  try {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5'),
      maxTokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: new URL(thumbnailUrl) },
            {
              type: 'text',
              text: `Phan tich anh, tra ve JSON ngan gon (khong them text):${hint ? '\nGoi y: ' + hint : ''}
{
  "caption": "caption tieng Viet tu nhien 1-2 cau phu hop mang xa hoi",
  "hashtags": ["tag1","tag2","tag3"],
  "category": "food|cafe|spa|entertainment|travel|shopping|other",
  "location": "khu vuc hoac chuoi rong neu khong ro"
}`,
            },
          ],
        },
      ],
    })

    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return fallback(hint)

    const p = JSON.parse(match[0])
    return {
      caption: typeof p.caption === 'string' ? p.caption.slice(0, 200) : '',
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.slice(0, 5).map(String) : [],
      category: typeof p.category === 'string' ? p.category : 'other',
      location: typeof p.location === 'string' ? p.location.slice(0, 100) : '',
    }
  } catch {
    return fallback(hint)
  }
}

function fallback(hint = ''): ContentMeta {
  return { caption: hint, hashtags: [], category: 'other', location: '' }
}
