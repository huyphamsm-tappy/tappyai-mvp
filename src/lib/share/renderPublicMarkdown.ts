// A server-safe renderer for the public result body.
//
// The chat's `formatMessage` lives in a 'use client' module and renders image
// strips; the public body has already had its images lifted out by the
// sanitizer, so this handles prose only. Same escaping discipline: every `<`,
// `>`, `"` and `&` is escaped BEFORE any markdown transform, so nothing in the
// frozen payload can become markup. Links open in a new tab with `noopener`.

import { balanceBoldPerLine } from '@/lib/chat/markdownNormalize'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const LINK_CLASS = 'text-primary-600 dark:text-primary-400 underline font-medium break-all'

/**
 * 18/11: a markdown table (a header row, a `---` separator row, body rows) of the ALREADY ESCAPED text becomes one <table> on a single line (the container keeps line breaks, so none are
 * emitted inside it). A report's tables were printed as rows of pipes. Not a table (no separator row) = untouched. Pure.
 */
function tablesToHtml(escaped: string): string {
  const lines = escaped.split('\n')
  const out: string[] = []
  const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
  const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l)
  const isSep = (l: string) => isRow(l) && cells(l).every(c => /^:?-{3,}:?$/.test(c))
  for (let i = 0; i < lines.length; i++) {
    if (isRow(lines[i]) && i + 1 < lines.length && isSep(lines[i + 1])) {
      const head = cells(lines[i])
      let j = i + 2
      const body: string[][] = []
      while (j < lines.length && isRow(lines[j]) && !isSep(lines[j])) { body.push(cells(lines[j])); j++ }
      out.push(`<div class="overflow-x-auto my-3"><table class="w-full text-sm border-collapse"><thead><tr>${head.map(h => `<th class="text-left font-semibold p-2 border-b border-gray-300 dark:border-gray-600">${h}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td class="p-2 border-b border-gray-200 dark:border-gray-700 align-top">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      i = j - 1
    } else out.push(lines[i])
  }
  return out.join('\n')
}

export function renderPublicMarkdown(content: string): string {
  // UAT 2026-09-28: an unpaired "**" is dropped, never printed (same rule as the chat renderer).
  return tablesToHtml(escapeHtml(balanceBoldPerLine(content)))
    // Any image markdown that survived (it should not) renders as its alt text, never as an <img>.
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, `<a href="$2" target="_blank" rel="noopener noreferrer nofollow" class="${LINK_CLASS}">$1</a>`)
    .replace(/(^|[^"'>])(https?:\/\/[^\s<]+)/g, `$1<a href="$2" target="_blank" rel="noopener noreferrer nofollow" class="${LINK_CLASS}">$2</a>`)
    // 18/11: a report opens with "# title"; a citation mark "[3]" is a small raised number, not bracketed text in the line
    .replace(/^# (.+)$\n?/gm, '<h1 class="font-bold text-xl mt-2 mb-2">$1</h1>')
    // outside the tags only: a "[12]" inside an already built href must stay part of the address
    .replace(/(<[^>]*>)|(?<!\w)\[(\d{1,3})\](?!\()/g, (m, tag: string | undefined, n: string | undefined) => (tag ? tag : `<sup class="text-gray-400 text-[0.7em]">${n}</sup>`))
    .replace(/^### (.+)$\n?/gm, '<h3 class="font-semibold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$\n?/gm, '<h2 class="font-semibold text-lg mt-4 mb-1">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(>])\*(?!\*)([^*\n]+?)\*(?=[\s.,;:!?)<]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(>])_(?!_)([^_\n]+?)_(?=[\s.,;:!?)<]|$)/g, '$1<em>$2</em>')
    .replace(/^(\d+)\.\s+(.+)$\n?/gm, '<div class="flex gap-2 my-1"><span class="text-gray-400 tabular-nums flex-shrink-0">$1.</span><span>$2</span></div>')
    .replace(/^- (.+)$\n?/gm, '<li>$1</li>')
    .replace(/(?:<li>.*?<\/li>)+/g, (m) => `<ul class="list-disc pl-5 my-2 space-y-1">${m}</ul>`)
}
