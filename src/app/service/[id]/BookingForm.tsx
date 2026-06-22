'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Clock, Users, MessageSquare, Loader2, CheckCircle2, Share2 } from 'lucide-react'

interface Props {
  serviceId: string
  serviceName: string
  serviceType: string
  userPhone: string
  placeId?: string
}

// Tạo các khung giờ hợp lệ
const TIME_SLOTS = [
  '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00',
]

// Ngày tối thiểu = hôm nay (giờ VN)
function getTodayVN() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000)
  return now.toISOString().slice(0, 10)
}

export default function BookingForm({ serviceId, serviceName, serviceType, placeId }: Props) {
  const router = useRouter()
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [guests, setGuests] = useState(2)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [shared, setShared] = useState(false)
  const autoBackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (autoBackTimer.current) clearTimeout(autoBackTimer.current) }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!date || !name || !phone) { setError('Vui lòng điền đầy đủ thông tin bắt buộc.'); return }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId, serviceName, serviceType, date, time, guests, name, phone, notes, placeId: placeId || null }),
      })
      if (res.ok) {
        setDone(true)
        // Auto-back sau 8s — đủ thời gian user đọc + bấm chia sẻ
        autoBackTimer.current = setTimeout(() => router.back(), 8000)
      } else {
        const d = await res.json()
        setError(d.error || 'Có lỗi xảy ra. Vui lòng thử lại.')
      }
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.')
    }
    setLoading(false)
  }

  const handleShare = async () => {
    // Cancel auto-back khi user chủ động tương tác
    if (autoBackTimer.current) { clearTimeout(autoBackTimer.current); autoBackTimer.current = null }

    const lines = [
      `📋 Xác nhận đặt chỗ — TappyAI`,
      `🏠 ${serviceName}`,
      `📅 Ngày: ${date}${time ? ` lúc ${time}` : ''}`,
      `👤 ${name} | 📞 ${phone}`,
      guests > 1 ? `👥 Số khách: ${guests}` : '',
      notes ? `📝 ${notes}` : '',
    ].filter(Boolean).join('\n')

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Xác nhận đặt chỗ — TappyAI', text: lines })
      } catch {
        // User huỷ share — không làm gì
        return
      }
    } else {
      // Fallback: mở mailto
      window.location.href = `mailto:?subject=${encodeURIComponent('Xác nhận đặt chỗ — TappyAI')}&body=${encodeURIComponent(lines)}`
    }

    setShared(true)
    // Sau khi share xong, back sau 2s
    autoBackTimer.current = setTimeout(() => router.back(), 2000)
  }

  if (done) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} className="text-green-500" />
        </div>
        <h3 className="font-bold text-gray-900 dark:text-white mb-1">Đặt chỗ thành công! 🎉</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Chúng tôi sẽ liên hệ xác nhận với bạn sớm nhất.
        </p>

        {/* Tóm tắt booking */}
        <div className="mt-4 mb-4 text-left bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 text-sm space-y-1">
          <p className="font-semibold text-gray-900 dark:text-white truncate">{serviceName}</p>
          <p className="text-gray-500 dark:text-gray-400">📅 {date}{time ? ` lúc ${time}` : ''}</p>
          <p className="text-gray-500 dark:text-gray-400">👤 {name} · 📞 {phone}</p>
          {guests > 1 && <p className="text-gray-500 dark:text-gray-400">👥 {guests} khách</p>}
          {notes && <p className="text-gray-500 dark:text-gray-400 line-clamp-2">📝 {notes}</p>}
        </div>

        {shared ? (
          <p className="text-sm text-green-600 dark:text-green-400 font-medium">Đã chia sẻ! Đang quay lại...</p>
        ) : (
          <>
            <button
              onClick={handleShare}
              className="w-full py-3 rounded-2xl bg-primary-500 hover:bg-primary-600 active:scale-95 text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
            >
              <Share2 size={16} />
              Chia sẻ xác nhận
            </button>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">Tự động quay lại sau vài giây...</p>
          </>
        )}
      </div>
    )
  }

  const showGuests = ['food', 'hotel', 'entertainment', 'travel'].includes(serviceType)
  const guestLabel = serviceType === 'hotel' ? 'Số phòng' : serviceType === 'spa' ? 'Số người' : 'Số khách'

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
      <h2 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <CalendarDays size={18} className="text-primary-500" />
        Đặt chỗ ngay
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tên + SĐT */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Họ tên *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nguyễn Văn A"
              className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Số điện thoại *</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="09xxxxxxxx"
              className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>
        </div>

        {/* Ngày */}
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
            <CalendarDays size={12} /> Ngày *
          </label>
          <input
            type="date"
            value={date}
            min={getTodayVN()}
            onChange={e => setDate(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          />
        </div>

        {/* Giờ */}
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
            <Clock size={12} /> Giờ (tùy chọn)
          </label>
          <div className="flex flex-wrap gap-2">
            {TIME_SLOTS.map(slot => (
              <button
                key={slot}
                type="button"
                onClick={() => setTime(time === slot ? '' : slot)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  time === slot
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-primary-300'
                }`}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>

        {/* Số khách */}
        {showGuests && (
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
              <Users size={12} /> {guestLabel}
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setGuests(Math.max(1, guests - 1))}
                className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-lg flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >−</button>
              <span className="text-lg font-bold text-gray-900 dark:text-white w-8 text-center">{guests}</span>
              <button
                type="button"
                onClick={() => setGuests(Math.min(20, guests + 1))}
                className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-lg flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >+</button>
            </div>
          </div>
        )}

        {/* Ghi chú */}
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
            <MessageSquare size={12} /> Ghi chú thêm
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Yêu cầu đặc biệt, dị ứng thực phẩm, dịp kỷ niệm..."
            rows={2}
            className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 resize-none"
          />
        </div>

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 rounded-2xl bg-primary-500 hover:bg-primary-600 active:scale-95 text-white font-bold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : '✅ Xác nhận đặt chỗ'}
        </button>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          Sau khi đặt, cơ sở sẽ liên hệ xác nhận với bạn
        </p>
      </form>
    </div>
  )
}
