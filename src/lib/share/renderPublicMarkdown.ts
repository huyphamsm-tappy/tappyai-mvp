// A server-safe renderer for the public result body.
//
// The chat's `formatMessage` lives in a 'use client' module and renders image
// strips; the public body has already had its images lifted out by the
// sanitizer, so this handles prose only. Same escaping discipline: every `<`,
// `>`, `"` and `&` is escaped BEFORE any markdown transform, so nothing in the
// frozen payload can become markup. Links open in a new tab with `noopener`.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const LINK_CLASS = 'text-primary-600 dark:text-primary-400 underline font-medium break-all'

export function renderPublicMarkdown(content: string): string {
  return escapeHtml(content)
    // Any image markdown that survived (it should not) renders as its alt text, never as an <img>.
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, `<a href="$2" target="_blank" rel="noopener noreferrer nofollow" class="${LINK_CLASS}">$1</a>`)
    .replace(/(^|[^"'>])(https?:\/\/[^\s<]+)/g, `$1<a href="$2" target="_blank" rel="noopener noreferrer nofollow" class="${LINK_CLASS}">$2</a>`)
    .replace(/^### (.+)$\n?/gm, '<h3 class="font-semibold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$\n?/gm, '<h2 class="font-semibold text-lg mt-4 mb-1">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(>])\*(?!\*)([^*\n]+?)\*(?=[\s.,;:!?)<]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(>])_(?!_)([^_\n]+?)_(?=[\s.,;:!?)<]|$)/g, '$1<em>$2</em>')
    .replace(/^(\d+)\.\s+(.+)$\n?/gm, '<div class="flex gap-2 my-1"><span class="text-gray-400 tabular-nums flex-shrink-0">$1.</span><span>$2</span></div>')
    .replace(/^- (.+)$\n?/gm, '<li>$1</li>')
    .replace(/(?:<li>.*?<\/li>)+/g, (m) => `<ul class="list-disc pl-5 my-2 space-y-1">${m}</ul>`)
}
