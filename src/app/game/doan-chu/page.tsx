'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft, Delete } from 'lucide-react'
import posthog from 'posthog-js'

// ~60 common 4-letter Vietnamese words (no diacritics for simplicity — keyboard-friendly)
const WORDS = [
  'BIEN','TROI','NUOC','NANG','MURA','NUNG','LANH','XANH','VANG','HONG',
  'TRANG','XANH','SACH','BONG','HANH','NGON','NGHE','NGOT','CHUA','MAN',
  'TRUA','SANG','CHIEU','TIAM','BUON','VIET','PHAP','LOAN','DUNG','CANH',
  'DONG','XUAN','HA','THU','DONG','BIEN','NHAT','NGA','THAI','HAN',
  'NGAN','THANH','THICH','MUON','NHIN','NGHE','NOI','VIET','DOC','HIEU',
  'TOAN','LY','HOA','VAN','NHAC','PHIM','SACH','BAO','TIVI','GAME',
]

// Use 4-letter words for simplicity
const WORD_LIST = [...new Set(WORDS.filter(w => w.length === 4))]

const TRIES = 6
const LEN = 4

type LetterState = 'correct' | 'present' | 'absent' | 'empty' | 'pending'

interface GuessRow { letters: string[]; states: LetterState[] }

const KEYBOARD = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
]

export default function DoanChuPage() {
  const [target, setTarget] = useState('')
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [current, setCurrent] = useState('')
  const [phase, setPhase] = useState<'idle' | 'playing' | 'won' | 'lost'>('idle')
  const [shake, setShake] = useState(false)
  const [letterStates, setLetterStates] = useState<Record<string, LetterState>>({})
  const [message, setMessage] = useState('')

  const showMessage = useCallback((msg: string, dur = 1500) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), dur)
  }, [])

  const startGame = useCallback(() => {
    const w = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)]
    setTarget(w)
    setGuesses([])
    setCurrent('')
    setPhase('playing')
    setLetterStates({})
    setMessage('')
    posthog.capture('game_started', { game: 'doan-chu' })
  }, [])

  const evaluate = useCallback((guess: string, tgt: string): LetterState[] => {
    const states: LetterState[] = Array(LEN).fill('absent')
    const rem = tgt.split('')
    // Exact matches first
    guess.split('').forEach((l, i) => { if (l === tgt[i]) { states[i] = 'correct'; rem[i] = '_' } })
    // Present
    guess.split('').forEach((l, i) => {
      if (states[i] === 'correct') return
      const ri = rem.indexOf(l)
      if (ri !== -1) { states[i] = 'present'; rem[ri] = '_' }
    })
    return states
  }, [])

  const submit = useCallback(() => {
    if (current.length < LEN) { setShake(true); setTimeout(() => setShake(false), 400); showMessage('Thiếu chữ!'); return }
    const states = evaluate(current, target)
    const newRow: GuessRow = { letters: current.split(''), states }
    const newGuesses = [...guesses, newRow]
    setGuesses(newGuesses)
    setCurrent('')

    // Update letter states
    setLetterStates(prev => {
      const next = { ...prev }
      current.split('').forEach((l, i) => {
        const ns = states[i]
        const os = next[l]
        if (!os || (os === 'absent' && ns !== 'absent') || (os === 'present' && ns === 'correct')) {
          next[l] = ns
        }
      })
      return next
    })

    if (states.every(s => s === 'correct')) {
      setPhase('won')
      showMessage('Tuyệt vời! 🎉', 3000)
      posthog.capture('game_won', { game: 'doan-chu', tries: newGuesses.length })
    } else if (newGuesses.length >= TRIES) {
      setPhase('lost')
      showMessage(`Từ bí mật: ${target}`, 4000)
      posthog.capture('game_over', { game: 'doan-chu', score: 0 })
    }
  }, [current, target, guesses, evaluate, showMessage])

  const press = useCallback((key: string) => {
    if (phase !== 'playing') return
    if (key === 'ENTER') { submit(); return }
    if (key === '⌫' || key === 'Backspace') { setCurrent(c => c.slice(0, -1)); return }
    if (current.length < LEN && /^[A-Z]$/.test(key)) setCurrent(c => c + key)
  }, [phase, current, submit])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => press(e.key === 'Enter' ? 'ENTER' : e.key.toUpperCase())
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press])

  const cellColor = (s: LetterState) => ({
    correct: 'bg-emerald-600 border-emerald-500 text-white',
    present: 'bg-amber-500 border-amber-400 text-white',
    absent: 'bg-gray-700 border-gray-600 text-gray-300',
    empty: 'bg-transparent border-gray-700 text-transparent',
    pending: 'bg-transparent border-gray-500 text-white',
  }[s])

  const keyColor = (key: string) => {
    const s = letterStates[key]
    if (s === 'correct') return 'bg-emerald-600 text-white'
    if (s === 'present') return 'bg-amber-500 text-white'
    if (s === 'absent') return 'bg-gray-700 text-gray-400'
    return 'bg-gray-600 text-white'
  }

  // Build display grid
  const rows: GuessRow[] = [
    ...guesses,
    ...Array(TRIES - guesses.length).fill(null).map((_, i) => ({
      letters: i === 0 && phase === 'playing' ? [...current.padEnd(LEN, ' ')] : Array(LEN).fill(' '),
      states: Array(LEN).fill(i === 0 && phase === 'playing' ? 'pending' : 'empty') as LetterState[],
    })),
  ]

  return (
    <div className="min-h-dvh bg-gray-950 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <Link href="/game" className="flex items-center gap-1 text-primary-400 text-sm font-medium">
          <ChevronLeft size={18} /> Game
        </Link>
        <h1 className="text-white font-bold text-base">🔤 Đoán Chữ</h1>
        <div className="w-16" />
      </div>

      {/* Message toast */}
      <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 transition-all duration-200 ${message ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
        <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-semibold px-5 py-2.5 rounded-full shadow-lg text-sm">
          {message}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-between px-4 py-4 gap-4">
        {phase === 'idle' ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-5">
            <div className="text-6xl">🔤</div>
            <div className="text-center">
              <p className="text-white text-2xl font-black mb-2">Đoán Chữ</p>
              <p className="text-gray-400 text-sm leading-relaxed">
                Đoán từ 4 chữ tiếng Việt trong {TRIES} lần thử.<br />
                <span className="text-emerald-400">■ Xanh</span> = đúng vị trí &nbsp;
                <span className="text-amber-400">■ Vàng</span> = sai vị trí
              </p>
            </div>
            <button onClick={startGame} className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-10 py-3.5 rounded-2xl text-base transition-colors">
              Bắt đầu
            </button>
          </div>
        ) : (
          <>
            {/* Guess grid */}
            <div className={`flex flex-col gap-2 ${shake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
              {rows.map((row, ri) => (
                <div key={ri} className="flex gap-2">
                  {row.letters.map((l, ci) => (
                    <div
                      key={ci}
                      className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-xl font-black transition-all duration-300 ${cellColor(row.states[ci])}`}
                      style={{ transitionDelay: ri < guesses.length ? `${ci * 80}ms` : '0ms' }}
                    >
                      {l.trim()}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* End actions */}
            {(phase === 'won' || phase === 'lost') && (
              <button onClick={startGame} className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">
                Chơi lại
              </button>
            )}

            {/* Keyboard */}
            <div className="space-y-1.5 w-full max-w-sm">
              {KEYBOARD.map((row, ri) => (
                <div key={ri} className="flex justify-center gap-1">
                  {row.map(key => (
                    <button
                      key={key}
                      onClick={() => press(key)}
                      className={`rounded-lg font-bold text-sm transition-colors active:scale-95 ${
                        key === 'ENTER' || key === '⌫'
                          ? 'px-3 h-12 bg-gray-600 text-white text-xs'
                          : `w-9 h-12 ${keyColor(key)}`
                      }`}
                    >
                      {key === '⌫' ? <Delete size={14} className="mx-auto" /> : key}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
