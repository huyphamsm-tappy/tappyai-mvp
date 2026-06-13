'use client'

import { useChat } from 'ai/react'
import { useEffect, useRef } from 'react'
import { Send, Loader2, Sparkles } from 'lucide-react'
import { cn, CATEGORIES, type CategoryId } from '@/lib/utils'

const QUICK_PROMPTS: Record<string, string[]> = {
  food: ['Quán bún bò ngon ở TP.HCM?', 'Cafe view đẹp Hà Nội?', 'Nhà hàng hải sản tươi sống?'],
  shopping: ['Trung tâm mua sắm lớn Sài Gòn?', 'Mua đồ hiệu uy tín?', 'Chợ đêm lưu niệm?'],
  entertainment: ['Rạp chiếu phim IMAX?', 'Quán karaoke bao phòng?', 'Bar rooftop view đẹp?'],
  travel: ['Lịch trình Đà Nẵng 3 ngày?', 'Khách sạn Phú Quốc 1 triệu?', 'Địa điểm check-in Hội An?'],
  spa: ['Spa massage giá bình dân?', 'Nail salon gel tốt?', 'Trung tâm dưỡng da uy tín?'],
  general: ['Ăn gì ngon hôm nay?', 'Cuối tuần đi đâu vui?', 'Quán cafe làm việc yên tĩnh?'],
}

interface ChatInterfaceProps {
  initialMessage?: string
  initialCategory?: string
  conversationId?: string
  savedMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  onSave?: (messages: Array<{ role: string; content: string }>, title: string) => void
}

function formatMessage(content: string) {
  return content
    // Markdown links [text](url) -> clickable <a> that opens in new tab/app
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary-600 dark:text-primary-400 underline font-medium break-all">$1</a>')
    // Bare URLs (not already inside an href) -> clickable links
    .replace(/(^|[^"'>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary-600 dark:text-primary-400 underline break-all">$2</a>')
    // Headings
    .replace(/^### (.+)$\n?/gm, '<div class="font-semibold mt-3 mb-1">$1</div>')
    .replace(/^## (.+)$\n?/gm, '<div class="font-semibold text-base mt-3 mb-1">$1</div>')
    // Bold / italic
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Numbered list items "1. text"
    .replace(/^(\d+)\.\s+(.+)$\n?/gm, '<div class="flex gap-2 my-1"><span class="text-gray-400 dark:text-gray-500 tabular-nums flex-shrink-0">$1.</span><span>$2</span></div>')
    // Bullet list items, grouped into <ul>
    .replace(/^- (.+)$\n?/gm, '<li>$1</li>')
    .replace(/(?:<li>.*?<\/li>)+/g, (m) => `<ul class="list-disc pl-5 my-2 space-y-1">${m}</ul>`)
}

export default function ChatInterface({
  initialMessage,
  initialCategory = 'general',
  conversationId,
  savedMessages,
  onSave,
}: ChatInterfaceProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const category = initialCategory as CategoryId
  const catInfo = CATEGORIES.find(c => c.id === category)

  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput } = useChat({
    api: '/api/chat',
    initialMessages: savedMessages?.map((m, i) => ({ id: String(i), role: m.role, content: m.content })),
    onFinish: async (message) => {
      if (onSave) {
        const all = [...messages, message]
        await onSave(all.map(m => ({ role: m.role, content: m.content })), all[0]?.content?.slice(0, 50) || 'Chat')
      }
    },
  })

  useEffect(() => {
    if (initialMessage && messages.length === 0) {
      setInput(initialMessage)
      setTimeout(() => {
        const form = document.getElementById('chat-form') as HTMLFormElement
        form?.requestSubmit()
      }, 100)
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const quickPrompts = QUICK_PROMPTS[category] || QUICK_PROMPTS.general

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-4 py-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-fade-in">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <span className="text-3xl">{catInfo?.emoji || '🤖'}</span>
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{catInfo?.label || 'TappyAI'}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Tôi có thể giúp bạn tìm thông tin chính xác</p>
              </div>
              <div className="w-full space-y-2">
                {quickPrompts.map((prompt) => (
                  <button key={prompt} onClick={() => { setInput(prompt); inputRef.current?.focus() }} className="w-full text-left px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bo-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm transition-all border border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <Sparkles size={14} className="text-primary-400 flex-shrink-0" />
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className={cn('animate-slide-up flex', msg.role === 'user' ? 'justify-end' : 'gap-3')}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-[11px] font-bold">T</span>
                  </div>
                )}
                <div className={cn(
                  'text-[15px] leading-[1.6]',
                  msg.role === 'user'
                    ? 'max-w-[85%] bg-primary-500 text-white rounded-2xl rounded-br-md px-4 py-2.5'
                    : 'flex-1 min-w-0 text-gray-800 dark:text-gray-100 pt-0.5'
                )}>
                  <div className="message-content whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 animate-fade-in">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-[11px] font-bold">T</span>
                </div>
                <div className="flex items-center h-7 gap-1">
                  <span className="typing-dot text-gray-400" />
                  <span className="typing-dot text-gray-400" />
                  <span className="typing-dot text-gray-400" />
                </div>
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
        <form id="chat-form" onSubmit={handleSubmit} className="max-w-2xl mx-auto w-full flex gap-2 items-end">
          <input ref={inputRef} value={input} onChange={handleInputChange} placeholder="Nhắn tin với TappyAI..." disabled={isLoading} className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 resize-none transition-all" />
          <button type="submit" disabled={isLoading || !input.trim()} className="w-11 h-11 rounded-2xl bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all flex-shrink-0">{isLoading ? <Loader2 size={18} className="text-white animate-spin" /> : <Send size={18} className="text-white" />}</button>
        </form>
      </div>
    </div>
  )
}
