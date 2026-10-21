// RETRIEVAL_V5 · a tool call written as TEXT never reaches the user (owner task 20/10/2026, sửa đổi 1).
//
// Measured (cổng 2 lần 1, u28): the round after the research was made final (no tools offered); the model still wanted to search and wrote the
// call as text — `{"queries":[…]}\nto=functions.web_search …` — which went out as the answer. The stream gate already drops the provider's
// `<invoke>` scaffolding; this covers every other text shape of a tool call:
//   · `to=functions.NAME` / `functions.NAME(` / a channel or call marker `<|…|>`;
//   · a tool-call tag (`<tool_call>`, `<function_call>`, `<invoke …>`, `<parameter …>`);
//   · a line that is a JSON object whose first key is a tool argument or call field (`queries`, `query`, `urls`, `tool_calls`, `recipient_name`,
//     `name` + `arguments`, `kind` + `queries`);
// outside ``` code fences (a coding answer may show JSON or a function name). On a line while streaming: the gate stops releasing (the line is
// never shown). On the final text: one rewrite without tools; still there → the fixed line `fallback`.

const PATTERNS: readonly RegExp[] = [
  /\bto=functions\.[A-Za-z_][\w.]*/,
  /\bfunctions\.[a-z_][a-z0-9_]*\s*[({]/,
  /<\|\s*(?:call|tool|channel|im_start|im_end|constrain|message|start|end)\b[^|]*\|>/i,
  /<\/?\s*(?:tool_call|tool_calls|function_call|function_calls|invoke|parameter)\b/i,
  /^\s*\{\s*"(?:queries|query|urls|tool_calls|tool_call|recipient_name|tool_uses)"\s*:/,
  /^\s*\{\s*"name"\s*:\s*"[a-z_]+"\s*,\s*"(?:arguments|parameters|args)"\s*:/,
  /^\s*\{\s*"kind"\s*:\s*"(?:web|news)"\s*,\s*"quer(?:y|ies)"\s*:/,
]

/** One line (outside a code fence) carries a tool call written as text. */
export function isToolSyntaxLine(line: string): boolean {
  return PATTERNS.some(re => re.test(line))
}

/** The lines of `text` outside ``` fences, with their offsets. */
function proseLines(text: string): Array<{ line: string; at: number }> {
  const out: Array<{ line: string; at: number }> = []
  let inFence = false, at = 0
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence
    else if (!inFence) out.push({ line, at })
    at += line.length + 1
  }
  return out
}

/** The text carries a tool call written as text (outside code fences). */
export function hasToolSyntax(text: string): boolean {
  return proseLines(text).some(x => isToolSyntaxLine(x.line))
}

/** The text up to (not including) the first line with a tool call written as text — what may still be shown. */
export function cutAtToolSyntax(text: string): string {
  const hit = proseLines(text).find(x => isToolSyntaxLine(x.line))
  return hit ? text.slice(0, hit.at).replace(/\s+$/, '') : text
}

export interface ToolSyntaxGuard {
  detect: (text: string) => boolean
  detectLine: (line: string) => boolean
  cut: (text: string) => string
  retryNote: string
  fallback: string
}

export function toolSyntaxGuard(lang: string): ToolSyntaxGuard {
  const en = lang === 'en'
  return {
    detect: hasToolSyntax,
    detectLine: isToolSyntaxLine,
    cut: cutAtToolSyntax,
    retryNote: en
      ? '\n\n===== TOOLS ARE NOT AVAILABLE =====\nYour last reply was a tool call written as text. No tool can be called now. Write ONLY the answer for the user, in plain prose, from the search results and pages above (cite [S#]). Never write a tool call, JSON arguments or "to=functions".'
      : '\n\n===== KHÔNG CÒN CÔNG CỤ =====\nLần trả lời vừa rồi là một lệnh gọi công cụ viết thành chữ. Bây giờ không gọi được công cụ nào. Chỉ viết câu trả lời cho người dùng, bằng văn xuôi, từ kết quả tìm và các trang ở trên (ghi [S#]). Không bao giờ viết lệnh gọi công cụ, JSON tham số hay "to=functions".',
    fallback: en
      ? "Sorry — I couldn't put the answer together just now. Please send your question again."
      : 'Xin lỗi, mình chưa soạn được câu trả lời lúc này. Bạn gửi lại câu hỏi giúp mình nhé.',
  }
}
