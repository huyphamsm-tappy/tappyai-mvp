import { AI } from '@/lib/ai/llm'
import { fenceUntrusted } from '@/lib/ai/security/fence'

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

// ── P3-F3: the caller's text is DATA, and it is bounded ──────────────────────
//
// `caption` and `title` arrive in a request body and used to be interpolated
// straight into the prompt inside double quotes. Two things followed from that.
//
// INJECTION — a `"` and a newline end the quoted span, so the remainder was read
// as instruction. Every other untrusted value in this codebase goes through
// `fenceUntrusted`; these two were simply never wired to it. The fence is the
// existing mechanism, not a new one: content cannot reproduce the markers, so it
// cannot close its span or relabel its provenance.
//
// COST — neither value was capped. The route limits how MANY times an account
// may call this (20/min) but not how BIG one call is, so a single multi-megabyte
// caption bought a multi-megabyte prompt twenty times a minute. `maxTokens`
// bounds only the reply; nothing bounded the request.
//
// The caps are generous against real use: a caption is stored at 200 chars and a
// title is a video title. They exist to make the prompt a function of a constant
// rather than of the caller.
const MAX_CAPTION_INPUT = 2000
const MAX_TITLE_INPUT = 500

/** Bounded, fenced, and labelled with where it came from. */
const asData = (value: string, limit: number) =>
  fenceUntrusted('explore_content', value.slice(0, limit))

/**
 * The model returns a category as free text; it is declared as one of seven
 * values. Anything else — including a value injected content talked it into — is
 * not a category, so it becomes `other` rather than being stored as written.
 */
const CATEGORIES = ['food', 'cafe', 'spa', 'entertainment', 'travel', 'shopping', 'other'] as const

function asCategory(value: unknown): string {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value) ? value : 'other'
}

// Run ONCE on upload — never during feed load or scroll
export async function processContent(opts: ProcessOpts): Promise<ContentMeta> {
  const { thumbnailUrl, caption, title } = opts
  try {
    // User provided caption: trust it, just extract hashtags + category (text-only, cheaper)
    if (caption?.trim()) {
      const contextLine = title?.trim() ? `\nTieu de:\n${asData(title.trim(), MAX_TITLE_INPUT)}` : ''
      const { text } = await AI.generate({
        role: 'fast',
        maxTokens: 150,
        prompt: `Caption:\n${asData(caption.trim(), MAX_CAPTION_INPUT)}${contextLine}\nTra ve JSON (khong them text): {"hashtags":["tag1","tag2","tag3"],"category":"food|cafe|spa|entertainment|travel|shopping|other","location":"khu vuc neu ro, khong thi de trong"}`,
      })
      const match = text.match(/\{[\s\S]*\}/)
      const p = match ? JSON.parse(match[0]) : {}
      return {
        caption: caption.trim().slice(0, 200),
        hashtags: Array.isArray(p.hashtags) ? p.hashtags.slice(0, 5).map(String) : [],
        category: asCategory(p.category),
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
        prompt: `Tieu de video:\n${asData(title.trim(), MAX_TITLE_INPUT)}\nTra ve JSON (khong them text):\n{"caption":"caption tieng Viet tu nhien 1-2 cau","hashtags":["tag1","tag2","tag3"],"category":"food|cafe|spa|entertainment|travel|shopping|other","location":"khu vuc neu ro, khong thi de trong"}`,
      })
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) return fallback(title)
      const p = JSON.parse(match[0])
      return {
        caption: typeof p.caption === 'string' ? p.caption.slice(0, 200) : title.slice(0, 200),
        hashtags: Array.isArray(p.hashtags) ? p.hashtags.slice(0, 5).map(String) : [],
        category: asCategory(p.category),
        location: typeof p.location === 'string' ? p.location.slice(0, 100) : '',
      }
    }

    // Thumbnail (with optional title as hint)
    const titleHint = title?.trim() ? `Tieu de:\n${asData(title.trim(), MAX_TITLE_INPUT)}\n` : ''
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
      category: asCategory(p.category),
      location: typeof p.location === 'string' ? p.location.slice(0, 100) : '',
    }
  } catch {
    return fallback(caption || title || '')
  }
}

function fallback(hint = ''): ContentMeta {
  return { caption: hint, hashtags: [], category: 'other', location: '' }
}
