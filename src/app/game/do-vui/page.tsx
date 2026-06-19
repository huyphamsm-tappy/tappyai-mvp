'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

interface Question {
  q: string
  opts: string[]
  ans: number
  cat: string
}

const QUESTIONS: Question[] = [
  // Zodiac / Astrology
  { q: 'Cung hoàng đạo nào được gọi là "Sư Tử"?', opts: ['Aries', 'Leo', 'Scorpio', 'Taurus'], ans: 1, cat: '♌ Chiêm tinh' },
  { q: 'Cung hoàng đạo "Thiên Bình" (Libra) bắt đầu từ tháng nào?', opts: ['Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11'], ans: 1, cat: '♎ Chiêm tinh' },
  { q: 'Nguyên tố của cung Song Tử (Gemini) là gì?', opts: ['Lửa', 'Đất', 'Khí', 'Nước'], ans: 2, cat: '♊ Chiêm tinh' },
  { q: 'Hành tinh cai quản cung Ma Kết (Capricorn) là?', opts: ['Sao Mộc', 'Sao Thổ', 'Sao Hỏa', 'Sao Kim'], ans: 1, cat: '♑ Chiêm tinh' },
  { q: 'Cung nào được xem là "nhạy cảm và mơ mộng" nhất?', opts: ['Song Ngư (Pisces)', 'Bọ Cạp (Scorpio)', 'Bạch Dương (Aries)', 'Kim Ngưu (Taurus)'], ans: 0, cat: '♓ Chiêm tinh' },
  { q: 'Tarot có bao nhiêu lá bài trong bộ Major Arcana?', opts: ['18', '20', '22', '24'], ans: 2, cat: '🔮 Tarot' },
  { q: 'Lá bài Tarot nào tượng trưng cho sự thay đổi và số phận?', opts: ['The Tower', 'Wheel of Fortune', 'The Moon', 'Judgement'], ans: 1, cat: '🔮 Tarot' },
  { q: 'Lá bài "The Sun" trong Tarot mang ý nghĩa gì?', opts: ['Nguy hiểm sắp đến', 'Niềm vui và thành công', 'Sự bí ẩn', 'Sự kết thúc'], ans: 1, cat: '🔮 Tarot' },
  { q: 'Lá bài số 0 trong bộ Tarot là lá nào?', opts: ['The Fool', 'The Magician', 'The World', 'The Star'], ans: 0, cat: '🔮 Tarot' },
  { q: 'Lá "The Tower" trong Tarot thường báo hiệu điều gì?', opts: ['Tình yêu mới', 'Sự đột phá bất ngờ', 'Thành công tài chính', 'Sức khỏe tốt'], ans: 1, cat: '🔮 Tarot' },
  // Con giáp
  { q: 'Theo vòng quay 12 năm, con giáp nào đứng đầu?', opts: ['Trâu', 'Chuột', 'Hổ', 'Rồng'], ans: 1, cat: '🐾 Con giáp' },
  { q: 'Người tuổi Rồng được sinh vào năm nào sau đây?', opts: ['1995', '1996', '1997', '1998'], ans: 1, cat: '🐾 Con giáp' },
  { q: 'Con giáp nào tượng trưng cho sự kiên nhẫn và bền bỉ?', opts: ['Ngựa', 'Trâu', 'Gà', 'Chó'], ans: 1, cat: '🐾 Con giáp' },
  { q: 'Người sinh năm 2000 thuộc con giáp nào?', opts: ['Rồng', 'Rắn', 'Ngựa', 'Thỏ'], ans: 0, cat: '🐾 Con giáp' },
  { q: 'Con giáp nào được xem là biểu tượng của sự may mắn trong văn hóa Á Đông?', opts: ['Hổ', 'Chuột', 'Rồng', 'Khỉ'], ans: 2, cat: '🐾 Con giáp' },
  // Fun/General
  { q: 'Hành tinh nào lớn nhất trong hệ Mặt Trời?', opts: ['Thổ Tinh', 'Mộc Tinh', 'Hải Vương', 'Thiên Vương'], ans: 1, cat: '🌌 Vũ trụ' },
  { q: 'Mặt Trăng cách Trái Đất bao xa (xấp xỉ)?', opts: ['38,000 km', '384,000 km', '3,840,000 km', '38,400 km'], ans: 1, cat: '🌌 Vũ trụ' },
  { q: 'Ánh sáng cần bao lâu để từ Mặt Trời đến Trái Đất?', opts: ['1 giây', '8 phút', '1 giờ', '1 ngày'], ans: 1, cat: '🌌 Vũ trụ' },
  { q: '"Năm âm lịch" của người Việt dựa theo chu kỳ của?', opts: ['Mặt Trời', 'Mặt Trăng và Mặt Trời', 'Mặt Trăng', 'Sao Hỏa'], ans: 1, cat: '📅 Văn hóa' },
  { q: 'Tết Nguyên Đán thường rơi vào tháng mấy âm lịch?', opts: ['Tháng Chạp (12)', 'Tháng Giêng (1)', 'Tháng Hai (2)', 'Tháng Ba (3)'], ans: 1, cat: '📅 Văn hóa' },
  { q: 'Con số nào được coi là may mắn nhất trong văn hóa Việt Nam?', opts: ['3', '6', '8', '9'], ans: 2, cat: '🔢 May mắn' },
  { q: 'Màu sắc nào tượng trưng cho sự may mắn và thịnh vượng?', opts: ['Trắng', 'Đen', 'Đỏ', 'Xanh'], ans: 2, cat: '🎨 Phong thủy' },
  { q: 'Trong phong thủy, hướng nào được coi là tốt nhất để đặt bàn thờ?', opts: ['Tây', 'Bắc', 'Nam', 'Đông'], ans: 2, cat: '🎨 Phong thủy' },
  { q: 'Đá quý nào được gắn với cung Bọ Cạp (Scorpio)?', opts: ['Ngọc lục bảo', 'Đá topaz', 'Ruby', 'Kim cương'], ans: 1, cat: '💎 Đá quý' },
  { q: 'Hoa nào tượng trưng cho sự may mắn và thịnh vượng trong dịp Tết?', opts: ['Hoa hồng', 'Hoa mai / đào', 'Hoa cúc', 'Hoa lan'], ans: 1, cat: '🌸 Văn hóa' },
  // More astrology
  { q: 'Cung Bạch Dương (Aries) được cai quản bởi hành tinh nào?', opts: ['Sao Kim', 'Sao Hỏa', 'Mặt Trăng', 'Sao Thủy'], ans: 1, cat: '♈ Chiêm tinh' },
  { q: 'Cung nào trong 12 cung hoàng đạo có biểu tượng là đôi cá?', opts: ['Bảo Bình', 'Song Ngư', 'Cự Giải', 'Ma Kết'], ans: 1, cat: '♓ Chiêm tinh' },
  { q: 'Năm Canh Tý theo can chi tương ứng với năm dương lịch nào?', opts: ['2018', '2019', '2020', '2021'], ans: 2, cat: '📅 Can chi' },
  { q: 'Ngũ hành gồm bao nhiêu yếu tố?', opts: ['3', '4', '5', '6'], ans: 2, cat: '☯ Ngũ hành' },
  { q: 'Trong ngũ hành, "Thủy" tương khắc với hành nào?', opts: ['Mộc', 'Kim', 'Hỏa', 'Thổ'], ans: 2, cat: '☯ Ngũ hành' },
  { q: 'Lá bài "The High Priestess" trong Tarot liên quan đến?', opts: ['Tiền tài', 'Trực giác và bí ẩn', 'Tình yêu', 'Sự nghiệp'], ans: 1, cat: '🔮 Tarot' },
  { q: 'Theo chiêm tinh, người Sư Tử (Leo) thường có tính cách gì?', opts: ['Rụt rè, hướng nội', 'Phóng khoáng, lãnh đạo', 'Cẩn thận, tỉ mỉ', 'Trầm tính, sâu sắc'], ans: 1, cat: '♌ Chiêm tinh' },
  { q: 'Vào ngày Rằm tháng Giêng, người Việt thường làm gì?', opts: ['Đón Giao Thừa', 'Lễ Vu Lan', 'Lễ Thượng Nguyên', 'Tết Đoan Ngọ'], ans: 2, cat: '📅 Văn hóa' },
  { q: 'Con giáp nào đứng thứ 7 trong 12 con giáp?', opts: ['Dê', 'Ngựa', 'Thỏ', 'Gà'], ans: 0, cat: '🐾 Con giáp' },
  { q: '"Mộc" trong ngũ hành tượng trưng cho?', opts: ['Nước', 'Cây cối, sinh trưởng', 'Lửa', 'Kim loại'], ans: 1, cat: '☯ Ngũ hành' },
  { q: 'Thần tài trong văn hóa Việt Nam được thờ ở đâu?', opts: ['Phòng ngủ', 'Nhà bếp', 'Phòng khách hoặc cửa hàng', 'Sân vườn'], ans: 2, cat: '🙏 Tín ngưỡng' },
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function DoVuiPage() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [qIndex, setQIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'result'>('idle')
  const [timeLeft, setTimeLeft] = useState(15)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [streak, setStreak] = useState(0)
  const [maxStreak, setMaxStreak] = useState(0)

  const Q_COUNT = 15

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  const nextQuestion = useCallback((idx: number, qs: Question[]) => {
    stopTimer()
    if (idx >= qs.length) {
      setPhase('result')
      setScore(s => {
        posthog.capture('game_over', { game: 'do-vui', score: s })
        return s
      })
      return
    }
    setQIndex(idx)
    setSelected(null)
    setTimeLeft(15)
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          stopTimer()
          setSelected(-1) // timeout
          setStreak(0)
          setTimeout(() => nextQuestion(idx + 1, qs), 1200)
          return 0
        }
        return t - 1
      })
    }, 1000)
  }, [stopTimer])

  const startGame = useCallback(() => {
    stopTimer()
    const qs = shuffle(QUESTIONS).slice(0, Q_COUNT)
    setQuestions(qs)
    setScore(0)
    setStreak(0)
    setMaxStreak(0)
    setPhase('playing')
    posthog.capture('game_started', { game: 'do-vui' })
    nextQuestion(0, qs)
  }, [stopTimer, nextQuestion])

  const answer = useCallback((optIdx: number) => {
    if (selected !== null) return
    stopTimer()
    setSelected(optIdx)
    const q = questions[qIndex]
    const correct = optIdx === q.ans
    if (correct) {
      setScore(s => s + (timeLeft >= 10 ? 3 : timeLeft >= 5 ? 2 : 1))
      setStreak(s => {
        const ns = s + 1
        setMaxStreak(m => Math.max(m, ns))
        return ns
      })
    } else {
      setStreak(0)
    }
    setTimeout(() => nextQuestion(qIndex + 1, questions), 1300)
  }, [selected, questions, qIndex, timeLeft, stopTimer, nextQuestion])

  useEffect(() => () => stopTimer(), [stopTimer])

  const q = questions[qIndex]
  const pct = ((qIndex) / Q_COUNT) * 100

  if (phase === 'idle') return (
    <div className="min-h-dvh bg-gradient-to-b from-violet-950 to-indigo-950 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <Link href="/game" className="flex items-center gap-1 text-violet-300 text-sm font-medium">
          <ChevronLeft size={18} /> Game
        </Link>
        <h1 className="text-white font-bold text-base">⭐ Đố Vui</h1>
        <div className="w-16" />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-7xl">⭐</div>
        <div className="text-center">
          <p className="text-white text-2xl font-black mb-2">Đố Vui Bói Toán</p>
          <p className="text-violet-300 text-sm leading-relaxed">
            {Q_COUNT} câu hỏi về chiêm tinh, tarot, con giáp và văn hóa.<br />
            Trả lời nhanh để ghi thêm điểm!
          </p>
        </div>
        <div className="flex gap-4">
          <div className="bg-white/10 rounded-2xl px-5 py-3 text-center">
            <div className="text-violet-300 text-xs">Câu hỏi</div>
            <div className="text-white font-black text-xl">{Q_COUNT}</div>
          </div>
          <div className="bg-white/10 rounded-2xl px-5 py-3 text-center">
            <div className="text-violet-300 text-xs">Thời gian/câu</div>
            <div className="text-white font-black text-xl">15s</div>
          </div>
        </div>
        <button onClick={startGame} className="bg-violet-500 hover:bg-violet-400 text-white font-bold px-12 py-4 rounded-2xl text-lg transition-colors">
          Bắt đầu! ⭐
        </button>
      </div>
    </div>
  )

  if (phase === 'result') return (
    <div className="min-h-dvh bg-gradient-to-b from-violet-950 to-indigo-950 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <Link href="/game" className="flex items-center gap-1 text-violet-300 text-sm font-medium">
          <ChevronLeft size={18} /> Game
        </Link>
        <h1 className="text-white font-bold text-base">⭐ Kết quả</h1>
        <div className="w-16" />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
        <div className="text-6xl">{score >= 35 ? '🏆' : score >= 20 ? '🥈' : '🎯'}</div>
        <p className="text-white text-2xl font-black">
          {score >= 35 ? 'Xuất sắc!' : score >= 20 ? 'Tốt lắm!' : 'Cố lên!'}
        </p>
        <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
          <div className="bg-white/10 rounded-2xl p-4 text-center">
            <div className="text-violet-300 text-xs mb-1">Điểm</div>
            <div className="text-white font-black text-2xl">{score}</div>
          </div>
          <div className="bg-white/10 rounded-2xl p-4 text-center">
            <div className="text-violet-300 text-xs mb-1">Combo</div>
            <div className="text-white font-black text-2xl">{maxStreak}</div>
          </div>
          <div className="bg-white/10 rounded-2xl p-4 text-center">
            <div className="text-violet-300 text-xs mb-1">Xếp loại</div>
            <div className="text-white font-black text-xl">{score >= 35 ? 'S' : score >= 25 ? 'A' : score >= 15 ? 'B' : 'C'}</div>
          </div>
        </div>
        <button onClick={startGame} className="bg-violet-500 hover:bg-violet-400 text-white font-bold px-10 py-3.5 rounded-2xl text-base transition-colors mt-2">
          Chơi lại
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh bg-gradient-to-b from-violet-950 to-indigo-950 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <Link href="/game" className="flex items-center gap-1 text-violet-300 text-sm font-medium">
          <ChevronLeft size={18} /> Game
        </Link>
        <h1 className="text-white font-bold text-base">⭐ Đố Vui</h1>
        <div className="text-violet-300 font-bold text-sm">{score} điểm</div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-white/10">
        <div className="h-full bg-violet-400 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex-1 flex flex-col px-4 py-5 gap-4">
        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-violet-400 text-sm">{q?.cat}</span>
          <div className="flex items-center gap-3">
            {streak >= 2 && <span className="text-amber-400 text-sm font-bold">🔥 x{streak}</span>}
            <div className={`text-white font-black text-xl w-10 h-10 rounded-full flex items-center justify-center transition-colors ${timeLeft <= 5 ? 'bg-red-600' : 'bg-violet-600'}`}>
              {timeLeft}
            </div>
          </div>
        </div>

        <div className="text-xs text-violet-400">Câu {qIndex + 1} / {Q_COUNT}</div>

        {/* Question */}
        {q && (
          <div className="bg-white/10 rounded-2xl p-5 flex-1 flex flex-col justify-between gap-4">
            <p className="text-white text-lg font-semibold leading-snug">{q.q}</p>

            <div className="space-y-2.5">
              {q.opts.map((opt, i) => {
                let cls = 'bg-white/10 border-white/20 text-white'
                if (selected !== null) {
                  if (i === q.ans) cls = 'bg-emerald-600/80 border-emerald-400 text-white'
                  else if (i === selected && selected !== q.ans) cls = 'bg-red-600/80 border-red-400 text-white'
                  else cls = 'bg-white/5 border-white/10 text-white/50'
                }
                return (
                  <button
                    key={i}
                    onClick={() => answer(i)}
                    disabled={selected !== null}
                    className={`w-full text-left px-4 py-3.5 rounded-xl border font-medium text-sm transition-all ${cls} ${selected === null ? 'hover:bg-white/20 active:scale-[0.98]' : ''}`}
                  >
                    <span className="text-violet-300 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                    {opt}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
