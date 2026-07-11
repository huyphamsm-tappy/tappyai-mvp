import { AI } from '@/lib/ai/llm'

export interface ContentMeta {
  caption: string
  hashtags: string[]
  category: string
  location: string
}

interface ProcessOpts {
  thumbnailUrl?: string
  caption?: string
  title?: string
}

// Run ONCE on upload — never during feed load or scroll
export async function processContent(opts: ProcessOpts): Promise<ContentMeta> {
  const { thumbnailUrl, caption, title } = opts
  try {
    // User provided caption: trust it, just extract hashtags + category (text-only, cheaper)
    if (caption?.trim()) {
      const contextLine = title?.trim() ? `\nTieu de: "${title.trim()}"` : ''
      const { text } = await AI.generate({
        role: 'fast',
        maxTokens: 150,
        prompt: `Caption: "${caption.trim()}"${contextLine}\nTra ve JSON (khong them text): {"hashtags":["tag1","tag2","tag3"],"category":"food|cafe|spa|entertainment|travel|shopping|other","location":"khu vuc neu ro, khong thi de trong"}`,
      })
      const match = text.match(/\{[\s\S]*\}/)
      const p = match ? JSON.parse(match[0]) : {}
      return {
        caption: caption.trim().slice(0, 200),
        hashtags: Array.isArray(p.hashtags) ? p.hashtags.slice(0, 5).map(String) : [],
        category: typeof p.category === 'string' ? p.category : 'other',
        location: typeof p.location === 'string' ? p.location.slice(0, 100) : '',
      }
    }

    // No caption: generate one from title and/or thumbnail
    if (!title?.trim() && !thumbnailUrl) return fallback('')

    // Text-only when title available but no thumbnail
    if (title?.trim() && !thumbnailUrl) {
      const { text } = await AI.generate({
        role: 'fast',
        maxTokens: 200,
        prompt: `Tieu de video: "${title.trim()}"\nTra ve JSON (khong them text):\n{"caption":"caption tieng Viet tu nhien 1-2 cau","hashtags":["tag1","tag2","tag3"],"category":"food|cafe|spa|entertainment|travel|shopping|other","location":"khu vuc neu ro, khong thi de trong"}`,
      })
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) return fallback(title)
      const p = JSON.parse(match[0])
      return {
        caption: typeof p.caption === 'string' ? p.caption.slice(0, 200) : title.slice(0, 200),
        hashtags: Array.isArray(p.hashtags) ? p.hashtags.slice(0, 5).map(String) : [],
        category: typeof p.category === 'string' ? p.category : 'other',
        location: typeof p.location === 'string' ? p.location.slice(0, 100) : '',
      }
    }

    // Thumbnail (with optional title as hint)
    const titleHint = title?.trim() ? `Tieu de: "${title.trim()}"\n` : ''
    const { text } = await AI.vision({
      role: 'fast',
      maxTokens: 200,
      image: new URL(thumbnailUrl!),
      prompt: `${titleHint}Phan tich anh, tra ve JSON ngan gon (khong them text):\n{"caption":"caption tieng Viet tu nhien 1-2 cau","hashtags":["tag1","tag2","tag3"],"category":"food|cafe|spa|entertainment|travel|shopping|other","location":"khu vuc neu ro, khong thi de trong"}`,
    })
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return fallback(title || '')
    const p = JSON.parse(match[0])
    return {
      caption: typeof p.caption === 'string' ? p.caption.slice(0, 200) : '',
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.slice(0, 5).map(String) : [],
      category: typeof p.category === 'string' ? p.category : 'other',
      location: typeof p.location === 'string' ? p.location.slice(0, 100) : '',
    }
  } catch {
    return fallback(caption || title || '')
  }
}

function fallback(hint = ''): ContentMeta {
  return { caption: hint, hashtags: [], category: 'other', location: '' }
}
