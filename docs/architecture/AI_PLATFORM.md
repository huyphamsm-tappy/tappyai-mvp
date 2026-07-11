# TappyAI — AI Platform Architecture (LUẬT KIẾN TRÚC)

> **Trạng thái: ĐÓNG BĂNG (FROZEN).** Tài liệu này là luật cho mọi sprint về sau.
> Mọi thay đổi vi phạm các quy tắc dưới đây phải bị từ chối khi review — dù nó
> "chạy được". Kiến trúc này được thiết lập trong sprint refactor `20cd623`
> (2026-07-11), thay thế hoàn toàn kiến trúc cũ bị khóa chặt vào Anthropic.
>
> Áp dụng cho: Web (Next.js), cron jobs, và mọi bề mặt tương lai (Android, iOS,
> dashboard, merchant tools) gọi LLM qua backend này.

---

## 1. Sơ đồ AI Layer

```
┌─────────────────────────────────────────────────────────────┐
│  APPLICATION                                                │
│  routes (/api/chat, /api/scan, /api/translate, …)           │
│  libs   (memoryService, contentProcessor, …)                │
│  crons  (morning-brief, price-check, …)                     │
│                                                             │
│      import { AI } from '@/lib/ai/llm'   ← LỐI VÀO DUY NHẤT │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  AI CAPABILITY LAYER          src/lib/ai/llm/ai.ts          │
│  AI.generate() · AI.stream() · AI.vision()                  │
│  AI.isConfigured() · AI.providerId()                        │
│  — nhận "vai trò model" (role), KHÔNG nhận model id —       │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  PROVIDER REGISTRY            src/lib/ai/llm/registry.ts    │
│  Nơi DUY NHẤT khởi tạo provider. Đọc env:                   │
│  LLM_PROVIDER, LLM_FAST/SMART/PLANNING/VISION_MODEL         │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  PROVIDER ADAPTER (interface AIProvider)                    │
│  src/lib/ai/llm/providers/<id>.ts                           │
│  — nơi DUY NHẤT được biết vendor: SDK, model id, API key,   │
│    tối ưu riêng (prompt caching, beta headers…)             │
└──────┬───────────┬───────────┬──────────┬───────────────────┘
       ▼           ▼           ▼          ▼
   claude.ts   [openai]    [gemini]   [grok] [deepseek]
   (đã có)     (chỗ chờ — chưa cài, thêm khi cần)
```

**Nguyên tắc cốt lõi:** business code không bao giờ biết vendor nào đang phục vụ
nó. Đổi vendor = đổi cấu hình (env), không đổi code nghiệp vụ.

---

## 2. LUẬT — Quy tắc bắt buộc

1. **Mọi lời gọi LLM phải đi qua `AI.*`** — `AI.generate()`, `AI.stream()`,
   `AI.vision()` từ `@/lib/ai/llm`. Không có ngoại lệ, kể cả cron, script,
   route "thử nghiệm", hay tính năng "tạm".
2. **Chọn vai trò (role), không chọn model.** Business code chỉ được nói
   `role: 'fast' | 'smart' | 'planning' | 'vision'`. Model id cụ thể là việc
   của adapter + env.
   - `fast` — rẻ/nhanh: chat đơn giản, extraction, crons
   - `smart` — chất lượng chuẩn: chat chính, dịch, sinh nội dung
   - `planning` — đa bước/agentic: lập kế hoạch, chat nhiều tool
   - `vision` — hiểu ảnh: OCR, phân tích thumbnail
3. **Kiểm tra cấu hình bằng `AI.isConfigured()`** — không bao giờ kiểm tra
   `process.env.ANTHROPIC_API_KEY` (hay key của vendor nào khác) trong business code.
4. **Kết quả trả về là định dạng trung lập của AI SDK** (`result.text`,
   `result.toDataStreamResponse()`…). Không parse response thô của vendor
   (`msg.content[0].text` là dấu hiệu vi phạm).
5. **Tối ưu riêng của vendor sống trong adapter.** Prompt caching, beta
   headers, retry đặc thù… đặt ở `providers/<id>.ts` qua `decorateMessages()`,
   và phải trong suốt về ngữ nghĩa (cùng input → cùng output).
6. **Prompt là trung lập.** Không viết prompt kiểu "You are Claude…" hay dựa
   vào hành vi riêng của một vendor.

## 3. CẤM — Những điều không được làm

| ❌ Cấm | ✅ Thay bằng |
|---|---|
| `import { createAnthropic } from '@ai-sdk/anthropic'` trong route/lib/cron | `import { AI } from '@/lib/ai/llm'` |
| `new Anthropic()` / cài lại `@anthropic-ai/sdk` | `AI.generate()` (dep này đã bị GỠ — đừng thêm lại) |
| `import ... from '@ai-sdk/*'` ngoài `src/lib/ai/llm/providers/` | chỉ adapter được import SDK |
| Hardcode model id (`claude-…`, `gpt-…`, `gemini-…`) ngoài adapter | `role: 'fast' \| 'smart' \| 'planning' \| 'vision'` |
| Đọc `ANTHROPIC_API_KEY` (hoặc key vendor) trong business code | `AI.isConfigured()` |
| `providerOptions: { anthropic: … }` / `cacheControl` trong business code | để adapter `decorateMessages()` lo |
| Gọi thẳng `generateText`/`streamText` với model tự tạo trong route | `AI.generate()` / `AI.stream()` |
| Tạo provider ở chỗ thứ hai ngoài `registry.ts` | thêm case trong `getProvider()` |

**Ngoại lệ duy nhất:** file trong `src/lib/ai/llm/` (layer tự nó) và
`src/lib/ai/llm/providers/*` (adapter).

## 4. API tham khảo nhanh

```ts
import { AI } from '@/lib/ai/llm'

// Sinh text một lần (không stream, không tool)
const { text } = await AI.generate({
  role: 'fast',                 // mặc định 'fast'
  system: '...',                // tùy chọn
  prompt: '...',                // HOẶC messages: CoreMessage[]
  maxTokens: 500,
  temperature: 0.8,             // tùy chọn
})

// Stream + tool-calling (chat chính)
const result = AI.stream({
  role: 'smart',                // mặc định 'smart'
  system: systemPrompt,
  messages: trimmedMessages,
  tools: { ... },               // zod tools của AI SDK — trung lập sẵn
  maxSteps: 5,
  prepareStep: async ({ stepNumber }) => ({ toolChoice: ... }),
  onFinish: async ({ usage, finishReason, text }) => { ... },
})
return result.toDataStreamResponse()

// Ảnh → text (OCR, phân tích ảnh)
const { text } = await AI.vision({
  role: 'vision',               // mặc định 'vision'
  image: base64 | new URL(...) | bytes,
  mimeType: 'image/jpeg',       // tùy chọn
  prompt: '...',
  maxTokens: 2048,
})
```

## 5. Cấu hình (env)

| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `LLM_PROVIDER` | `claude` \| `openai` \| `gemini` \| `grok` \| `deepseek` | `claude` |
| `LLM_FAST_MODEL` | model id cho role `fast` | mặc định của adapter |
| `LLM_SMART_MODEL` | model id cho role `smart` | mặc định của adapter |
| `LLM_PLANNING_MODEL` | model id cho role `planning` | rơi về `LLM_SMART_MODEL` |
| `LLM_VISION_MODEL` | model id cho role `vision` | mặc định của adapter |
| `ANTHROPIC_API_KEY` | credential — CHỈ adapter claude đọc | — |

Model id mặc định của từng role nằm trong `DEFAULT_MODELS` của adapter
(vd. `providers/claude.ts`) — đó là nơi duy nhất được sửa khi nâng cấp model.

## 6. Cách thêm provider mới (vd. OpenAI)

Đúng 3 bước, **không đụng vào bất kỳ business code nào**:

```bash
npm i @ai-sdk/openai
```

**Bước 1** — tạo `src/lib/ai/llm/providers/openai.ts`:

```ts
import { createOpenAI } from '@ai-sdk/openai'
import type { AIProvider } from '../provider'
import type { ModelOverrides, ModelRole } from '../types'

const DEFAULT_MODELS: Record<ModelRole, string> = {
  fast:     'gpt-4o-mini',
  smart:    'gpt-4o',
  planning: 'gpt-4o',
  vision:   'gpt-4o',
}

export function createOpenAIProvider(overrides: ModelOverrides): AIProvider {
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  return {
    id: 'openai',
    isConfigured: () => !!process.env.OPENAI_API_KEY,
    model: (role) => openai(overrides[role] ?? DEFAULT_MODELS[role]),
    // không cần decorateMessages nếu không có tối ưu riêng
  }
}
```

**Bước 2** — đăng ký trong `registry.ts`: thay case `'openai'` đang throw bằng
`provider = createOpenAIProvider(modelOverridesFromEnv()); return provider`.

**Bước 3** — cấu hình: `LLM_PROVIDER=openai` (+ `OPENAI_API_KEY`). Xong.

Ghi chú:
- **Grok** và **DeepSeek** dùng API tương thích OpenAI → adapter là
  `createOpenAI({ baseURL: 'https://api.x.ai/v1', apiKey: XAI_API_KEY })`
  (DeepSeek: `https://api.deepseek.com/v1`).
- **Gemini** dùng `@ai-sdk/google`.
- Adapter phải trong suốt: không đổi prompt, không đổi hành vi nghiệp vụ.

## 7. Checklist review (chạy trước khi merge bất kỳ PR nào chạm AI)

Các lệnh sau phải trả về **rỗng** (ngoài `src/lib/ai/llm/`):

```bash
# SDK vendor lọt ra ngoài adapter? (bắt import thật, bỏ qua chữ trong comment;
# lưu ý: `ai` / `ai/react` / `@ai-sdk/react` là AI SDK trung lập — được phép)
grep -rn "from '@ai-sdk/\|from \"@ai-sdk/\|@anthropic-ai\|createAnthropic\|new Anthropic" src --include="*.ts" --include="*.tsx" | grep -v "src/lib/ai/llm"

# Model id hardcode ngoài adapter?
grep -rn "claude-\|gpt-4\|gpt-5\|gemini-\|grok-\|deepseek-" src --include="*.ts" | grep -v "src/lib/ai/llm/providers"

# Credential vendor trong business code?
grep -rn "ANTHROPIC_API_KEY\|OPENAI_API_KEY\|GOOGLE_.*_KEY\|XAI_API_KEY" src --include="*.ts" | grep -v "src/lib/ai/llm"

# Tối ưu vendor lọt vào business code?
grep -rn "cacheControl\|anthropic-beta\|providerOptions.*anthropic" src --include="*.ts" | grep -v "src/lib/ai/llm"
```

Nếu một lệnh có kết quả → PR vi phạm luật → sửa cho đi qua layer trước khi merge.

---

*Vi phạm tài liệu này không phải là "tranh luận kiến trúc" — nó là bug.*
