'use client'

import { useChat } from 'ai/react'
import { useEffect, useRef } from 'react'
import { Send, Loader2, Sparkles } from 'lucide-react'
import { cn, CATEGORIES, type CategoryId } from '@/lib/utils'

const QUICK_PROMPTS: Record<string, string[]> = {
  food: ['Quan bun bo ngon o TP.HCM?', 'Cafe view dep Ha Noi?', 'Nha hang hai san tuoi song?'],
  shopping: ['Trung tam mua sam lon Sai Gon?', 'Mua do hieu uy tin?', 'Cho dem luu niem?'],
  entertainment: ['Rap chieu phim IMAX?', 'Quan karaoke bao phong?', 'Bar rooftop view dep?'],
  travel: ['Lich trinh Da Nang 3 ngay?', 'Khach san Phu Quoc 1 trieu?', 'Dia diem check-in Hoi An?'],
  spa: ['Spa massage gia binh dan?', 'Nail salon gel tot?', 'Trung tam duong da uy tin?'],
  general: ['An gi ngon hom nay?', 'Cuoi tuan di dau vui?', 'Quan cafe lam viec yen tinh?'],
}

interface ChatInterfaceProps {
  initialMessage?: string
  initialCategory?: string
  conversationId?: string
  savedMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  onSave?: (messages: Array<{ role: string; content: string }>, title: string) => void
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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-6 animate-fade-in">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <span className="text-3xl">{catInfo?.emoji || '🤖'}</span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{catInfo?.label || 'TappyAI'}</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Toi co the giup ban tim thong tin chinh xac</p>
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
        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex gap-2 animate-slide-up', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (<div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-auto"><span className="text-white text-xs font-bold">T</span></div>)}
            <div className={cn('max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed', msg.role === 'user' ? 'bg-primary-500 text-white rounded-br-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md')}>
              <div className="message-content whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/^- (.+)$/gm, '<li>$1</li>') }} />
            </div>
          </div>
        ))}
        {isLoading && (<div className="flex gap-2 justify-start animate-fade-in"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0"><span className="text-white text-xs font-bold">T</span></div><div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3"><div className="flex gap-1 items-center h-4"><span className="typing-dot text-gray-400" /><span className="typing-dot text-gray-400" /><span className="typing-dot text-gray-400" /></div></div></div>)}
        <div ref={bottomRef} />
      </div>
      <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
        <form id="chat-form" onSubmit={handleSubmit} className="flex gap-2 items-end">
          <input ref={inputRef} value={input} onChange={handleInputChange} placeholder="Nhan tin voi TappyAI..." disabled={isLoading} className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 resize-none transition-all" />
          <button type="submit" disabled={isLoading || !input.trim()} className="w-11 h-11 rounded-2xl bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all flex-shrink-0">{isLoading ? <Loader2 size={18} className="text-white animate-spin" /> : <Send size={18} className="text-white" />}</button>
        </form>
      </div>
    </div>
  )
}
