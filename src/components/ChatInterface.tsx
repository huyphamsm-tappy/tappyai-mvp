'use client'

import { useChat } from 'ai/react'
import { useEffect, useRef, useState, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Send, Sparkles, Mic, MicOff, Smile, Heart, X, Square, RotateCcw, Brain } from 'lucide-react'
import posthog from 'posthog-js'
import { useTTS } from '@/hooks/useTTS'
import MessageActionBar from '@/components/chat/MessageActionBar'
import { cn, CATEGORIES, type CategoryId } from '@/lib/utils'
import { getDynamicPrompts } from '@/lib/suggestedPrompts'
import TripPlanCard, { type TappyPlan } from '@/components/TripPlanCard'

const MOODS = [
  { emoji: '😊', label: 'Vui', prompt: 'Mình đang vui, Tappy gợi ý chỗ ăn uống hoặc vui chơi gì vibe hay không?' },
  { emoji: '😔', label: 'Buồn', prompt: 'Mình đang hơi buồn, Tappy gợi ý gì giúp mình cảm thấy tốt hơn không?' },
  { emoji: '😤', label: 'Stress', prompt: 'Mình đang stress cần được relax. Gợi ý spa hoặc cafe yên tĩnh gần đây giúp mình?' },
  { emoji: '😴', label: 'Mệt', prompt: 'Mình đang rất mệt, muốn đi đâu thư giãn nhẹ nhàng. Tappy gợi ý giúp mình nhé' },
  { emoji: '🥱', label: 'Chán', prompt: 'Mình đang chán, không biết làm gì. Tappy gợi ý gì vui và mới lạ không?' },
  { emoji: '🤩', label: 'Hứng', prompt: 'Mình đang rất hứng khởi, muốn làm gì đó thật đặc biệt. Tappy gợi ý không?' },
]

const EMOJIS = [
  '😀','😄','😂','🤣','😊','😍',
  '🥰','😘','😎','🤩','😋','😅',
  '😳','😬','🙈','🤭','🤔','😏',
  '😢','😭','😞','😤','😡','😱',
  '👍','❤️','🙏','🎉','🔥','💯',
]

const QUICK_PROMPTS: Record<string, string[]> = {
  food: ['Quán bún bò ngon ở TP.HCM?', 'Cafe view đẹp Hà Nội?', 'Nhà hàng hải sản tươi sống?'],
  shopping: ['Trung tâm mua sắm lớn Sài Gòn?', 'Mua đồ hiệu uy tín?', 'Chợ đêm lưu niệm?'],
  entertainment: ['Rạp chiếu phim IMAX?', 'Quán karaoke bao phòng?', 'Bar rooftop view đẹp?'],
  travel: ['Lịch trình Đà Nẵng 3 ngày 2 người budget 5 triệu', 'Lịch trình Phú Quốc 4 ngày 2 người budget 8 triệu', 'Lịch trình Hội An 2 ngày cuối tuần budget 3 triệu'],
  spa: ['Spa massage giá bình dân?', 'Nail salon gel tốt?', 'Trung tâm dưỡng da uy tín?'],
  general: ['🌙 Tối nay mình muốn spa + ăn tối ngon, 2 người budget 800k', 'Lịch trình Đà Nẵng 3 ngày 2 người budget 5 triệu', 'Ăn gì ngon hôm nay gần đây?'],
}

interface CTAButton {
  label: string
  type: 'maps' | 'call' | 'zalo' | 'website' | 'booking' | 'search' | 'internal_booking'
  url: string
  primary: boolean
}

interface ChatInterfaceProps {
  initialMessage?: string
  initialCategory?: string
  conversationId?: string
  savedMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  onSave?: (messages: Array<{ role: string; content: string }>, title: string) => void | Promise<void>
}

function parseCTA(content: string): { text: string; buttons: CTAButton[] } {
  // Match with closing tag, or fall back to bare [CTA_BUTTONS]{...} at end of content
  const withTag = /\[CTA_BUTTONS\]([\s\S]*?)\[\/CTA_BUTTONS\]/i
  const noTag   = /\[CTA_BUTTONS\](\{[\s\S]*\})\s*$/i

  const ctaMatch = content.match(withTag) ?? content.match(noTag)
  if (!ctaMatch) return { text: content, buttons: [] }

  const text = content
    .replace(withTag, '')
    .replace(noTag, '')
    .trimEnd()

  try {
    const parsed = JSON.parse(ctaMatch[1].trim())
    const buttons: CTAButton[] = Array.isArray(parsed.buttons) ? parsed.buttons : []
    return { text, buttons }
  } catch {
    return { text, buttons: [] }
  }
}

function parsePlan(content: string): { text: string; plan: TappyPlan | null } {
  const planMatch = content.match(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/i)
  if (!planMatch) return { text: content, plan: null }
  const text = content.replace(/\[TAPPY_PLAN\][\s\S]*?\[\/TAPPY_PLAN\]/i, '').trimEnd()
  try {
    const plan = JSON.parse(planMatch[1].trim()) as TappyPlan
    if (!plan.days || !Array.isArray(plan.days)) return { text: content, plan: null }
    return { text, plan }
  } catch {
    return { text: content, plan: null }
  }
}

// Optional follow-up suggestions the model may emit at the very end.
// Rendered as tappable chips (only on the latest reply) — a helpful next step,
// never a push. MFS 2.7.
function parseFollowups(content: string): { text: string; followups: string[] } {
  const m = content.match(/\[FOLLOWUPS\]([\s\S]*?)\[\/FOLLOWUPS\]/i)
  if (!m) return { text: content, followups: [] }
  const text = content.replace(/\[FOLLOWUPS\][\s\S]*?\[\/FOLLOWUPS\]/i, '').trimEnd()
  const followups = m[1].split('|').map(s => s.trim()).filter(Boolean).slice(0, 3)
  return { text, followups }
}

function parsePlaceFromUrl(url: string) {
  try {
    const u = new URL(url, 'http://localhost')
    return {
      placeId: u.searchParams.get('placeId') || '',
      name: u.searchParams.get('name') || '',
      address: u.searchParams.get('address') || '',
      type: u.searchParams.get('type') || '',
    }
  } catch {
    return { placeId: '', name: '', address: '', type: '' }
  }
}

function detectFirstPlaceName(text: string, buttons: CTAButton[]): string {
  const booking = buttons.find(b => b.type === 'internal_booking')
  if (booking) {
    const match = booking.url.match(/[?&]name=([^&]+)/)
    if (match) return decodeURIComponent(match[1].replace(/\+/g, ' '))
  }
  const boldMatch = text.match(/\*\*([^*]{3,40})\*\*/)
  if (boldMatch) return boldMatch[1]
  return ''
}

function SavePlaceButton({ text, buttons }: { text: string; buttons: CTAButton[] }) {
  const [open, setOpen] = useState(false)
  const [placeName, setPlaceName] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const detected = detectFirstPlaceName(text, buttons)

  const handleSave = async () => {
    if (!placeName.trim()) return
    setSaving(true)
    try {
      await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: `manual_${Date.now()}`,
          placeName: placeName.trim(),
          placeAddress: '',
          placeType: 'saved',
        }),
      })
      setSaved(true)
      setTimeout(() => { setOpen(false); setSaved(false) }, 1500)
    } catch {}
    setSaving(false)
  }

  if (open) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <input
          autoFocus
          value={placeName}
          onChange={e => setPlaceName(e.target.value)}
          placeholder="Tên địa điểm muốn lưu?"
          className="flex-1 text-xs px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setOpen(false) }}
        />
        <button
          onClick={handleSave}
          disabled={saving || !placeName.trim()}
          className="text-xs px-2.5 py-1.5 rounded-xl bg-primary-500 text-white disabled:opacity-50 hover:bg-primary-600 transition-colors"
        >
          {saved ? '✓' : saving ? '...' : 'Lưu'}
        </button>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5">
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => { setPlaceName(detected); setOpen(true) }}
      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-1 px-1.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      title="Lưu địa điểm"
    >
      🔖 Lưu địa điểm
    </button>
  )
}

function OnboardingModal({ onClose }: { onClose: (prefs: string[]) => void }) {
  const DISTRICTS = ['Quận 1', 'Quận 3', 'Bình Thạnh', 'Thủ Đức', 'Gò Vấp']
  const BUDGETS = ['Dưới 50k', '50–100k', '100–200k', 'Trên 200k']
  const DIETARY_OPTS = ['Ăn chay', 'Không hải sản', 'Không cay', 'Không gluten', 'Không có']
  const [district, setDistrict] = useState('')
  const [budget, setBudget] = useState('')
  const [dietary, setDietary] = useState<string[]>([])
  const [customDistrict, setCustomDistrict] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleDietary = (item: string) => {
    if (item === 'Không có') { setDietary(['Không có']); return }
    setDietary(prev => {
      const without = prev.filter(d => d !== 'Không có')
      return without.includes(item) ? without.filter(d => d !== item) : [...without, item]
    })
  }

  const handleSubmit = async () => {
    setSaving(true)
    const prefs: string[] = []
    const loc = district || (customDistrict.trim() ? customDistrict.trim() : '')
    if (loc) prefs.push(`Hay ở khu vực ${loc}`)
    if (budget) prefs.push(`Ngân sách ăn uống/bữa: ${budget}`)
    dietary.filter(d => d !== 'Không có').forEach(d => prefs.push(d))
    try {
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: prefs }),
      })
    } catch {}
    localStorage.setItem('tappy_onboarded', '1')
    setSaving(false)
    onClose(prefs)
  }

  const handleSkip = () => {
    localStorage.setItem('tappy_onboarded', '1')
    onClose([])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleSkip} />
      <div className="relative w-full max-w-md mx-auto bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-6 pb-8 space-y-5">
        <div className="text-center mb-1">
          <div className="text-3xl mb-2">👋</div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Tappy muốn hiểu bạn hơn!</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">3 câu hỏi nhanh để gợi ý chuẩn hơn.</p>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">1. Bạn thường ở khu vực nào?</p>
          <div className="flex flex-wrap gap-2 mb-2">
            {DISTRICTS.map(d => (
              <button key={d} onClick={() => { setDistrict(prev => prev === d ? '' : d); setCustomDistrict('') }}
                className={`px-3 py-1.5 rounded-full text-sm border transition-all ${district === d ? 'border-primary-500 bg-primary-500 text-white' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-300'}`}>
                {d}
              </button>
            ))}
          </div>
          <input
            value={customDistrict}
            onChange={e => { setCustomDistrict(e.target.value); setDistrict('') }}
            placeholder="Hoặc nhập khu vực khác..."
            className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">2. Ngân sách ăn uống/bữa?</p>
          <div className="flex flex-wrap gap-2">
            {BUDGETS.map(b => (
              <button key={b} onClick={() => setBudget(prev => prev === b ? '' : b)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-all ${budget === b ? 'border-primary-500 bg-primary-500 text-white' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-300'}`}>
                {b}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">3. Có kiêng cữ gì không?</p>
          <div className="flex flex-wrap gap-2">
            {DIETARY_OPTS.map(d => (
              <button key={d} onClick={() => toggleDietary(d)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-all ${dietary.includes(d) ? 'border-primary-500 bg-primary-500 text-white' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-300'}`}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full py-3.5 rounded-2xl font-bold text-base bg-primary-500 hover:bg-primary-600 text-white transition-all disabled:opacity-60"
        >
          {saving ? '⌛ Đang lưu...' : '🎉 Bắt đầu khám phá!'}
        </button>
        <button onClick={handleSkip} className="w-full text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 py-1">
          Bỏ qua
        </button>
      </div>
    </div>
  )
}

function FavoriteToggle({ placeId, placeName, placeAddress, placeType }: {
  placeId: string; placeName: string; placeAddress: string; placeType: string
}) {
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (loading || !placeId) return
    setLoading(true)
    setSaved(s => !s)
    try {
      await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId, placeName, placeAddress, placeType }),
      })
    } catch { setSaved(s => !s) }
    setLoading(false)
  }

  if (!placeId) return null
  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-red-300 dark:hover:border-red-700 transition-colors flex-shrink-0 disabled:opacity-50"
      aria-label={saved ? 'Đã lưu' : 'Lưu vào yêu thích'}
      title={saved ? 'Đã lưu' : 'Lưu vào yêu thích'}
    >
      <Heart size={14} className={saved ? 'fill-red-400 text-red-400' : 'text-gray-400 dark:text-gray-500'} />
    </button>
  )
}

function logCTAClick(button: CTAButton) {
  try {
    fetch('/api/cta-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: button.type, label: button.label, url: button.url, ts: Date.now() }),
    }).catch(() => {})
  } catch {}
}

// Escape HTML metacharacters BEFORE any markdown→HTML transform. This neutralizes
// raw `< > " &` coming from LLM output, tool results (untrusted external data), or the
// user's own message, preventing HTML/attribute injection when the result is rendered
// via dangerouslySetInnerHTML. Markdown syntax chars ([ ] ( ) * # - ! and the https://
// scheme) are NOT escaped, so every transform below still matches. `&`→`&amp;` inside a
// URL is the correct attribute encoding — the browser decodes it back when requesting.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatMessage(content: string) {
  // Images first — render before link processing to avoid conflicts. Group any run of
  // consecutive image lines (a place's photo gallery) into one horizontally-scrollable
  // strip instead of stacking them vertically, so 3 photos swipe left/right like a carousel.
  const withImages = escapeHtml(content).replace(
    /(?:!\[[^\]]*\]\(https?:\/\/[^\s)]+\)[ \t]*\n?)+/g,
    (block) => {
      const imgs = [...block.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g)]
      if (imgs.length === 0) return block
      const imgTags = imgs.map(([, alt, src]) =>
        `<img src="${src}" alt="${alt}" data-zoomable="true" style="width:200px;height:160px;object-fit:cover;border-radius:12px;flex-shrink:0;scroll-snap-align:start;cursor:zoom-in" loading="lazy" onerror="this.style.display='none'"/>`
      ).join('')
      return `\n<div style="display:flex;gap:8px;overflow-x:auto;margin:8px 0;padding-bottom:2px;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory">${imgTags}</div>\n`
    }
  )
  return withImages
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary-600 dark:text-primary-400 underline font-medium break-all">$1</a>')
    .replace(/(^|[^"'>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary-600 dark:text-primary-400 underline break-all">$2</a>')
    .replace(/^### (.+)$\n?/gm, '<div class="font-semibold mt-3 mb-1">$1</div>')
    .replace(/^## (.+)$\n?/gm, '<div class="font-semibold text-base mt-3 mb-1">$1</div>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^(\d+)\.\s+(.+)$\n?/gm, '<div class="flex gap-2 my-1"><span class="text-gray-400 dark:text-gray-500 tabular-nums flex-shrink-0">$1.</span><span>$2</span></div>')
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
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // Tracks the in-flight save so internal_booking clicks can await it before
  // navigating — prevents the race where the user clicks before router.replace
  // fires, which would leave /chat (not /chat/{id}) as the Back target.
  const savePromiseRef = useRef<Promise<void> | null>(null)
  // Set to true from the moment onFinish starts until the save completes.
  // Allows the CTA click handler to block even when savePromiseRef.current is
  // momentarily null (between onFinish being queued and it actually running).
  const savePendingRef = useRef(false)
  const category = initialCategory as CategoryId
  const catInfo = CATEGORIES.find(c => c.id === category)
  const [hasMemory, setHasMemory] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [showEmojiPanel, setShowEmojiPanel] = useState(false)
  const [userPreferences, setUserPreferences] = useState<string[]>([])
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  interface UserLocation { lat: number; lng: number; address: string; ts?: number }
  const [userLocation, setUserLocation] = useState<UserLocation | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const s = localStorage.getItem('tappy_location')
      return s ? (JSON.parse(s) as UserLocation) : null
    } catch { return null }
  })

  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput, append, reload, stop, error } = useChat({
    api: '/api/chat',
    body: {
      ...(userLocation ? { userLocation: { lat: userLocation.lat, lng: userLocation.lng, address: userLocation.address } } : {}),
      ...(userPreferences.length > 0 ? { userPreferences } : {}),
    },
    initialMessages: savedMessages?.map((m, i) => ({ id: String(i), role: m.role, content: m.content })),
    onFinish: async (message) => {
      const all = [...messages, message]
      if (onSave) {
        savePendingRef.current = true
        const p = Promise.resolve(onSave(all.map(m => ({ role: m.role, content: m.content })), all[0]?.content?.slice(0, 50) || 'Chat'))
        savePromiseRef.current = p
        await p
        savePromiseRef.current = null
        savePendingRef.current = false
      }
      fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: all.map(m => ({ role: m.role, content: m.content })) }),
      }).then(() => setHasMemory(true)).catch(() => {})
    },
  })

  // Khởi tạo SpeechRecognition (Web Speech API)
  const startVoice = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Trình duyệt không hỗ trợ nhận giọng nói. Hãy dùng Chrome hoặc Edge.')
      return
    }
    posthog.capture('mic_used')
    const recognition = new SpeechRecognition()
    recognition.lang = 'vi-VN'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript
      if (transcript.trim()) {
        posthog.capture('chat_message_sent', { input_method: 'voice' })
        append({ role: 'user', content: transcript.trim() })
      }
    }
    recognition.start()
  }, [append])

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const handleNearbySearch = useCallback(() => {
    const send = () => {
      posthog.capture('nearby_search_clicked')
      append({ role: 'user', content: 'Gợi ý quán ăn và địa điểm vui chơi gần mình nhé' })
    }

    if (userLocation) { send(); return }

    // Try localStorage first (set by LocationProvider but not yet in state)
    try {
      const stored = localStorage.getItem('tappy_location')
      if (stored) {
        const loc = JSON.parse(stored) as UserLocation
        flushSync(() => setUserLocation(loc))
        send(); return
      }
    } catch {}

    // Request fresh GPS
    if (!navigator.geolocation) { send(); return }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        let address = ''
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { headers: { 'Accept-Language': 'vi', 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' } }
          )
          if (resp.ok) { const d = await resp.json(); address = (d?.display_name as string) || '' }
        } catch {}
        const loc: UserLocation = { lat, lng, address, ts: Date.now() }
        localStorage.setItem('tappy_location', JSON.stringify(loc))
        flushSync(() => setUserLocation(loc))
        send()
      },
      () => send() // denied — send anyway
    )
  }, [userLocation, append])

  // TTS — managed by useTTS hook
  const tts = useTTS()

  useEffect(() => {
    fetch('/api/memory')
      .then(r => r.json())
      .then(d => { if (d.memory) setHasMemory(true) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/preferences')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        if (Array.isArray(d.preferences)) setUserPreferences(d.preferences)
        if (!localStorage.getItem('tappy_onboarded')) setShowOnboarding(true)
      })
      .catch(() => {})
  }, [])

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

  // Auto-focus input on mount and when conversationId changes
  useEffect(() => {
    inputRef.current?.focus()
  }, [conversationId])

  const insertEmoji = (emoji: string) => {
    const ta = inputRef.current
    if (!ta) {
      setInput(prev => prev + emoji)
      setShowEmojiPanel(false)
      return
    }
    const start = ta.selectionStart ?? input.length
    const end = ta.selectionEnd ?? input.length
    const newVal = input.slice(0, start) + emoji + input.slice(end)
    setInput(newVal)
    setShowEmojiPanel(false)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + emoji.length
      ta.selectionStart = pos
      ta.selectionEnd = pos
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
    })
  }

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const url = URL.createObjectURL(file)
    setImagePreviewUrl(url)
    // Reset so same file can be re-selected
    e.target.value = ''
  }, [])

  const clearImage = useCallback(() => {
    setImageFile(null)
    setImagePreviewUrl(null)
  }, [])

  // Revoke the object URL whenever it changes (re-selection) or on unmount, so a
  // selected-but-not-cleared image preview can never leak.
  useEffect(() => {
    if (!imagePreviewUrl) return
    return () => URL.revokeObjectURL(imagePreviewUrl)
  }, [imagePreviewUrl])

  const handleFormSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim() && !imageFile) return
    posthog.capture('chat_message_sent', { input_method: 'button', has_image: !!imageFile })
    if (imageFile) {
      const dt = new DataTransfer()
      dt.items.add(imageFile)
      handleSubmit(e, { experimental_attachments: dt.files })
      clearImage()
    } else {
      handleSubmit(e)
    }
  }, [input, imageFile, handleSubmit, clearImage])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if ((input.trim() || imageFile) && !isLoading) {
        posthog.capture('chat_message_sent', { input_method: 'keyboard', has_image: !!imageFile })
        const fakeForm = { preventDefault: () => {} } as React.FormEvent<HTMLFormElement>
        if (imageFile) {
          const dt = new DataTransfer()
          dt.items.add(imageFile)
          handleSubmit(fakeForm, { experimental_attachments: dt.files })
          clearImage()
        } else {
          handleSubmit(fakeForm)
        }
      }
    }
  }

  // Dynamic prompts cho 'general' (theo giờ VN), static cho các category cụ thể.
  // Khởi tạo bằng dữ liệu tĩnh (không phụ thuộc Date/Math.random) để khớp chính xác
  // giữa SSR và lần hydrate đầu tiên trên client, tránh hydration mismatch. Giá trị
  // "thật" (theo giờ VN, có random) chỉ được tính trong useEffect — chạy sau khi
  // hydrate xong, hoàn toàn ở client.
  const [quickPrompts, setQuickPrompts] = useState<string[]>(
    () => QUICK_PROMPTS[category] ?? QUICK_PROMPTS.general
  )

  useEffect(() => {
    if ((category as string) === 'general' || !QUICK_PROMPTS[category]) {
      const vnHour = (new Date().getUTCHours() + 7) % 24
      const vnDay = new Date().getUTCDay()
      setQuickPrompts(getDynamicPrompts(vnHour, vnDay, null, null, 3).map(p => p.text))
    } else {
      setQuickPrompts(QUICK_PROMPTS[category])
    }
  }, [category])

  return (
    <div className="flex flex-col h-full">
      {showOnboarding && (
        <OnboardingModal
          onClose={(prefs) => {
            setShowOnboarding(false)
            if (prefs.length > 0) setUserPreferences(prefs)
          }}
        />
      )}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-container-content mx-auto w-full px-4 py-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-fade-in">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <span className="text-3xl">{catInfo?.emoji || '🤖'}</span>
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{catInfo?.label || 'TappyAI'}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Tôi có thể giúp bạn tìm thông tin chính xác</p>
                {hasMemory && (
                  <Link
                    href="/profile/tappy-knows"
                    className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs font-medium hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
                  >
                    <Brain size={12} /> Tappy nhớ sở thích của bạn · Quản lý
                  </Link>
                )}
              </div>
              {/* Tappy Mood selector */}
              <div className="w-full">
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center mb-2">Hôm nay bạn cảm thấy thế nào?</p>
                <div className="flex justify-center gap-2 flex-wrap">
                  {MOODS.map((mood) => (
                    <button
                      key={mood.label}
                      type="button"
                      onClick={() => {
                        posthog.capture('mood_selected', { mood: mood.label })
                        append({ role: 'user', content: mood.prompt })
                      }}
                      className="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-primary-50 dark:hover:bg-primary-900/20 border border-gray-100 dark:border-gray-700 hover:border-primary-200 dark:hover:border-primary-800 transition-all active:scale-95"
                    >
                      <span className="text-2xl">{mood.emoji}</span>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{mood.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="w-full space-y-2">
                {quickPrompts.map((prompt) => (
                  <button key={prompt} onClick={() => { posthog.capture('chat_message_sent', { input_method: 'quick_prompt' }); append({ role: 'user', content: prompt }) }} className="w-full text-left px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm transition-all border border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <Sparkles size={14} className="text-primary-400 flex-shrink-0" />
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Memory / data transparency indicator — visible while chatting, links to review & control (MUXS 23) */}
          {hasMemory && messages.length > 0 && (
            <Link
              href="/profile/tappy-knows"
              className="flex items-center gap-1.5 mb-4 text-xs text-gray-400 dark:text-gray-500 hover:text-primary-500 dark:hover:text-primary-400 transition-colors w-fit"
            >
              <Brain size={12} /> Tappy đang dùng trí nhớ của bạn để trả lời · Xem &amp; quản lý
            </Link>
          )}
          <div
            className="space-y-6"
            onClick={(e) => {
              const target = e.target as HTMLElement
              if (target.tagName === 'IMG' && target.dataset.zoomable === 'true') {
                setZoomedImage((target as HTMLImageElement).src)
              }
            }}
          >
            {messages.map((msg, msgIdx) => {
              if (msg.role === 'assistant') {
                const { text: textAfterPlan, plan } = parsePlan(msg.content)
                const { text: textAfterCta, buttons } = parseCTA(textAfterPlan)
                const { text, followups } = parseFollowups(textAfterCta)
                const isLastMessage = msgIdx === messages.length - 1
                return (
                  <div key={msg.id} className="animate-slide-up flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-xs font-bold">T</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-base leading-[1.6] text-gray-800 dark:text-gray-100 pt-0.5">
                        <div className="message-content whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: formatMessage(text) }} />
                      </div>
                      {plan && <TripPlanCard plan={plan} />}
                      {/* Action bar: copy, share, like, dislike, TTS, regenerate, more */}
                      <MessageActionBar
                        msgId={msg.id}
                        messageIndex={msgIdx}
                        conversationId={conversationId}
                        text={text}
                        isThisSpeaking={tts.speakingId === msg.id}
                        isPaused={tts.isPaused}
                        ttsElapsed={tts.elapsed}
                        ttsTotal={tts.totalSecs}
                        ttsSpeed={tts.speed}
                        onSpeak={() => tts.speak(msg.id, text)}
                        onTTSPause={tts.togglePause}
                        onTTSSkipBack={tts.skipBack}
                        onTTSSkipForward={tts.skipForward}
                        onTTSSpeedChange={tts.changeSpeed}
                        onTTSStop={tts.stop}
                        onRegenerate={reload}
                      />
                      <SavePlaceButton text={text} buttons={buttons} />
                      {buttons.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {buttons.map((btn, i) => {
                            const place = btn.type === 'internal_booking' ? parsePlaceFromUrl(btn.url) : null
                            return (
                              <div key={i} className="inline-flex items-center gap-1">
                                <a
                                  href={btn.url}
                                  target={btn.type === 'internal_booking' ? undefined : '_blank'}
                                  rel={btn.type === 'internal_booking' ? undefined : 'noopener noreferrer'}
                                  onClick={async (e) => {
                                    logCTAClick(btn)
                                    if (btn.type === 'internal_booking') {
                                      e.preventDefault()
                                      if (savePendingRef.current || savePromiseRef.current) {
                                        const deadline = Date.now() + 2000
                                        while (savePendingRef.current && !savePromiseRef.current && Date.now() < deadline) {
                                          await new Promise(r => setTimeout(r, 20))
                                        }
                                        if (savePromiseRef.current) await savePromiseRef.current
                                      }
                                      router.refresh()
                                      router.push(btn.url)
                                    }
                                  }}
                                  className={cn(
                                    'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                                    btn.primary
                                      ? 'bg-primary-500 hover:bg-primary-600 text-white shadow-sm shadow-primary-200 dark:shadow-primary-900/30'
                                      : 'border border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20'
                                  )}
                                >
                                  {btn.label}
                                </a>
                                {place?.placeId && (
                                  <FavoriteToggle
                                    placeId={place.placeId}
                                    placeName={place.name}
                                    placeAddress={place.address}
                                    placeType={place.type}
                                  />
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {/* Optional follow-up suggestions — only on the latest reply, never a push (MFS 2.7) */}
                      {followups.length > 0 && isLastMessage && !isLoading && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {followups.map((f, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => { posthog.capture('followup_clicked'); append({ role: 'user', content: f }) }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              }
              const msgAttachments = (msg as any).experimental_attachments as Array<{ url: string; name?: string; contentType?: string }> | undefined
              return (
                <div key={msg.id} className="animate-slide-up flex justify-end">
                  <div className="max-w-[85%] md:max-w-[75%] flex flex-col items-end gap-1.5">
                    {msgAttachments?.filter(a => a.contentType?.startsWith('image/')).map((att, i) => (
                      <img
                        key={i}
                        src={att.url}
                        alt={att.name || 'Ảnh đính kèm'}
                        data-zoomable="true"
                        className="rounded-2xl rounded-br-md max-w-[240px] max-h-[280px] object-cover border border-white/20 shadow cursor-zoom-in"
                      />
                    ))}
                    {(typeof msg.content === 'string' ? msg.content : '').trim() && (
                      <div className="bg-primary-500 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-base leading-[1.6]">
                        <div className="message-content whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: formatMessage(typeof msg.content === 'string' ? msg.content : '') }} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {isLoading && (
              <div className="flex gap-3 animate-fade-in">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">T</span>
                </div>
                <div className="flex items-center h-7 gap-1">
                  <span className="typing-dot text-gray-400" />
                  <span className="typing-dot text-gray-400" />
                  <span className="typing-dot text-gray-400" />
                </div>
              </div>
            )}
            {/* Error recovery — explain plainly, preserve the user's message, offer a way forward (MUXS 8) */}
            {error && !isLoading && (
              <div className="flex gap-3 animate-fade-in">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">T</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                    <p className="leading-relaxed">Mình gặp trục trặc khi trả lời — tin nhắn của bạn vẫn được giữ nguyên. Bạn thử lại nhé?</p>
                    <button
                      type="button"
                      onClick={() => reload()}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition-colors"
                    >
                      <RotateCcw size={13} /> Thử lại
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
        {/* Emoji panel overlay — click outside to close */}
        {showEmojiPanel && (
          <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPanel(false)} />
        )}
        {/* Action chips */}
        <div className="max-w-container-content mx-auto w-full flex gap-2 mb-2 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={handleNearbySearch}
            disabled={isLoading}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-all disabled:opacity-40"
          >
            📍 Tìm quanh đây
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => { posthog.capture('chat_message_sent', { input_method: 'plan_chip' }); append({ role: 'user', content: 'Tối nay mình muốn spa thư giãn rồi ăn tối ngon, 2 người, budget khoảng 800k, gợi ý lịch trình giúp mình nhé' }) }}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 border border-accent-200 dark:border-accent-800 hover:bg-accent-100 dark:hover:bg-accent-900/50 transition-all disabled:opacity-40"
          >
            🌙 Tappy Tối Nay
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => { posthog.capture('chat_message_sent', { input_method: 'plan_chip' }); setInput('Lịch trình ') }}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all disabled:opacity-40"
          >
            ✈️ Lên kế hoạch trip
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => { posthog.capture('chat_message_sent', { input_method: 'price_watch_chip' }); setInput('Tappy theo dõi ') }}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/50 transition-all disabled:opacity-40"
          >
            🎯 Theo dõi giá
          </button>
        </div>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleImageSelect}
        />
        <form id="chat-form" onSubmit={handleFormSubmit} className="max-w-container-content mx-auto w-full flex flex-col gap-2">
          {/* Image preview */}
          {imagePreviewUrl && (
            <div className="relative inline-flex self-start ml-1">
              <img
                src={imagePreviewUrl}
                alt="Preview"
                className="h-20 w-20 rounded-xl object-cover border border-gray-200 dark:border-gray-700 shadow"
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-800 dark:bg-gray-600 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                aria-label="Xóa ảnh"
              >
                <X size={10} />
              </button>
            </div>
          )}
          <div className="flex gap-2 items-end">
          <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                handleInputChange(e)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
              }}
              onKeyDown={handleKeyDown}
              placeholder={imageFile ? 'Hỏi Tappy về ảnh này...' : 'Nhắn tin với TappyAI...'}
              disabled={isLoading}
              rows={1}
              className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 resize-none transition-all overflow-hidden"
            />
          {/* Camera button hidden for MVP */}
          {/* Nút emoji */}
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => { if (!showEmojiPanel) posthog.capture('emoji_panel_opened'); setShowEmojiPanel(v => !v) }}
              className={cn(
                'w-11 h-11 rounded-2xl flex items-center justify-center transition-all',
                showEmojiPanel
                  ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-500'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-accent-50 dark:hover:bg-accent-900/20 hover:text-accent-500'
              )}
              aria-label="Chọn emoji"
            >
              <Smile size={20} />
            </button>
            {/* Emoji panel */}
            {showEmojiPanel && (
              <div className="absolute bottom-14 right-0 z-20 w-64 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-200/60 dark:shadow-black/40 p-3">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-0.5">Chọn biểu cảm</p>
                <div className="grid grid-cols-6 gap-1">
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insertEmoji(emoji)}
                      className="w-9 h-9 flex items-center justify-center text-xl rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors active:scale-90"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Nút microphone màu cam #FF9500 */}
          <button
            type="button"
            onClick={isListening ? stopVoice : startVoice}
            disabled={isLoading}
            className={cn(
              'w-11 h-11 rounded-2xl flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-40',
              isListening
                ? 'bg-[#FF9500] animate-pulse shadow-lg shadow-orange-300/50'
                : 'bg-gray-100 dark:bg-gray-800 hover:bg-orange-50 dark:hover:bg-orange-900/20'
            )}
          >
            {isListening
              ? <MicOff size={18} className="text-white" />
              : <Mic size={18} className="text-[#FF9500]" />
            }
          </button>
          {isLoading ? (
            <button type="button" onClick={() => stop()} aria-label="Dừng trả lời" className="w-11 h-11 rounded-2xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center justify-center transition-all flex-shrink-0">
              <Square size={15} className="text-gray-700 dark:text-gray-200 fill-current" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim() && !imageFile} aria-label="Gửi" className="w-11 h-11 rounded-2xl bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all flex-shrink-0">
              <Send size={18} className="text-white" />
            </button>
          )}
          </div>
        </form>
      </div>
      {/* Image zoom lightbox — opens on click for any place photo or uploaded attachment */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setZoomedImage(null)}
        >
          <button
            type="button"
            onClick={() => setZoomedImage(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            aria-label="Đóng"
          >
            <X size={22} />
          </button>
          <img
            src={zoomedImage}
            alt="Ảnh phóng to"
            className="max-w-[92vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
