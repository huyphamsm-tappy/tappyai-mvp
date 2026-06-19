'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

type Grid = (number | null)[][]

const SIZE = 4

const TILE_COLORS: Record<number, { bg: string; text: string; shadow?: string }> = {
  2:    { bg: '#eee4da', text: '#776e65' },
  4:    { bg: '#ede0c8', text: '#776e65' },
  8:    { bg: '#f2b179', text: '#fff' },
  16:   { bg: '#f59563', text: '#fff' },
  32:   { bg: '#f67c5f', text: '#fff' },
  64:   { bg: '#f65e3b', text: '#fff' },
  128:  { bg: '#edcf72', text: '#fff', shadow: '0 0 20px rgba(237,207,114,0.5)' },
  256:  { bg: '#edcc61', text: '#fff', shadow: '0 0 24px rgba(237,204,97,0.6)' },
  512:  { bg: '#edc850', text: '#fff', shadow: '0 0 28px rgba(237,200,80,0.7)' },
  1024: { bg: '#edc53f', text: '#fff', shadow: '0 0 32px rgba(237,197,63,0.8)' },
  2048: { bg: '#edc22e', text: '#fff', shadow: '0 0 40px rgba(237,194,46,1)' },
}

function emptyGrid(): Grid {
  return Array(SIZE).fill(null).map(() => Array(SIZE).fill(null))
}

function addRandom(grid: Grid): Grid {
  const empty: [number, number][] = []
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (!grid[r][c]) empty.push([r, c])
  if (!empty.length) return grid
  const [r, c] = empty[Math.floor(Math.random() * empty.length)]
  const ng = grid.map(row => [...row])
  ng[r][c] = Math.random() < 0.9 ? 2 : 4
  return ng
}

function initGrid(): Grid {
  return addRandom(addRandom(emptyGrid()))
}

function slideRow(row: (number | null)[]): { row: (number | null)[]; score: number } {
  const nums = row.filter(Boolean) as number[]
  let score = 0
  const merged: (number | null)[] = []
  let i = 0
  while (i < nums.length) {
    if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
      const val = nums[i] * 2
      merged.push(val)
      score += val
      i += 2
    } else {
      merged.push(nums[i])
      i++
    }
  }
  while (merged.length < SIZE) merged.push(null)
  return { row: merged, score }
}

function moveGrid(grid: Grid, dir: 'left' | 'right' | 'up' | 'down'): { grid: Grid; score: number; moved: boolean } {
  let totalScore = 0
  let moved = false
  let ng = grid.map(row => [...row])

  const rotate = (g: Grid) => g[0].map((_, i) => g.map(r => r[i]).reverse())
  const rotateBack = (g: Grid) => g[0].map((_, i) => g.map(r => r[r.length - 1 - i]))

  if (dir === 'right') ng = ng.map(r => [...r].reverse())
  if (dir === 'up') ng = rotate(ng)
  if (dir === 'down') ng = rotateBack(ng)

  ng = ng.map(row => {
    const { row: nr, score } = slideRow(row)
    totalScore += score
    if (nr.some((v, i) => v !== row[i])) moved = true
    return nr
  })

  if (dir === 'right') ng = ng.map(r => [...r].reverse())
  if (dir === 'up') ng = rotateBack(ng)
  if (dir === 'down') ng = rotate(ng)

  return { grid: ng, score: totalScore, moved }
}

function isGameOver(grid: Grid): boolean {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (!grid[r][c]) return false
      if (c + 1 < SIZE && grid[r][c] === grid[r][c + 1]) return false
      if (r + 1 < SIZE && grid[r][c] === grid[r + 1][c]) return false
    }
  return true
}

export default function HopNhatPage() {
  const [grid, setGrid] = useState<Grid>(emptyGrid)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'over' | 'won'>('idle')
  const [wonDismissed, setWonDismissed] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('2048-best')
    if (saved) setBest(Number(saved))
  }, [])

  const startGame = useCallback(() => {
    const g = initGrid()
    setGrid(g)
    setScore(0)
    setPhase('playing')
    setWonDismissed(false)
    posthog.capture('game_started', { game: 'hop-nhat' })
  }, [])

  const move = useCallback((dir: 'left' | 'right' | 'up' | 'down') => {
    if (phase !== 'playing') return
    setGrid(prev => {
      const { grid: ng, score: gained, moved } = moveGrid(prev, dir)
      if (!moved) return prev
      const withNew = addRandom(ng)
      setScore(s => {
        const ns = s + gained
        setBest(b => {
          const nb = Math.max(b, ns)
          localStorage.setItem('2048-best', String(nb))
          return nb
        })
        return ns
      })
      const has2048 = withNew.some(row => row.some(v => v === 2048))
      if (has2048 && !wonDismissed) {
        setPhase('won')
        posthog.capture('game_won', { game: 'hop-nhat' })
      } else if (isGameOver(withNew)) {
        setPhase('over')
        setScore(s => {
          posthog.capture('game_over', { game: 'hop-nhat', score: s })
          return s
        })
      }
      return withNew
    })
  }, [phase, wonDismissed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, 'left' | 'right' | 'up' | 'down'> = {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
        a: 'left', d: 'right', w: 'up', s: 'down',
      }
      const d = map[e.key]
      if (d) { e.preventDefault(); move(d) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move])

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(dx) < 15 && Math.abs(dy) < 15) return
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left')
    else move(dy > 0 ? 'down' : 'up')
  }

  const tileStyle = (val: number | null) => {
    if (!val) return { background: 'rgba(255,255,255,0.05)', color: 'transparent' }
    const c = TILE_COLORS[val] || { bg: '#3c3a32', text: '#fff' }
    return { background: c.bg, color: c.text, boxShadow: c.shadow }
  }

  const fontSize = (val: number | null) => {
    if (!val) return '1.5rem'
    if (val >= 1000) return '1rem'
    if (val >= 100) return '1.2rem'
    return '1.5rem'
  }

  return (
    <div className="min-h-dvh bg-[#faf8ef] dark:bg-gray-950 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <Link href="/game" className="flex items-center gap-1 text-primary-500 text-sm font-medium">
          <ChevronLeft size={18} /> Game
        </Link>
        <h1 className="text-gray-900 dark:text-white font-bold text-base">🔢 Hợp Nhất 2048</h1>
        <div className="text-right">
          <div className="text-xs text-gray-500">ĐIỂM</div>
          <div className="text-amber-600 dark:text-amber-400 font-black text-lg leading-tight">{score}</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">
        {/* Best score */}
        <div className="flex gap-3">
          <div className="bg-[#bbada0] rounded-xl px-4 py-2 text-center">
            <div className="text-[#eee4da] text-[10px] font-bold">TỐT NHẤT</div>
            <div className="text-white font-black text-lg leading-tight">{best}</div>
          </div>
          <div className="bg-[#bbada0] rounded-xl px-4 py-2 text-center">
            <div className="text-[#eee4da] text-[10px] font-bold">ĐIỂM</div>
            <div className="text-white font-black text-lg leading-tight">{score}</div>
          </div>
        </div>

        {/* Grid */}
        <div
          className="relative rounded-2xl p-3 touch-none select-none"
          style={{ background: '#bbada0', touchAction: 'none' }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}>
            {grid.map((row, r) =>
              row.map((val, c) => (
                <div
                  key={`${r}-${c}`}
                  className="rounded-xl flex items-center justify-center font-black transition-all duration-100"
                  style={{
                    width: 72, height: 72,
                    fontSize: fontSize(val),
                    ...tileStyle(val),
                  }}
                >
                  {val || ''}
                </div>
              ))
            )}
          </div>

          {/* Overlay states */}
          {phase === 'idle' && (
            <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
              <p className="text-white text-xl font-black mb-4">Hợp Nhất 2048</p>
              <p className="text-gray-300 text-sm mb-6 text-center px-4">Trượt để ghép các ô số — đạt 2048!</p>
              <button onClick={startGame} className="bg-amber-500 hover:bg-amber-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">
                Bắt đầu
              </button>
            </div>
          )}
          {phase === 'over' && (
            <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
              <p className="text-white text-xl font-bold mb-1">Game Over!</p>
              <p className="text-amber-400 text-3xl font-black mb-6">{score}</p>
              <button onClick={startGame} className="bg-amber-500 hover:bg-amber-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">
                Chơi lại
              </button>
            </div>
          )}
          {phase === 'won' && (
            <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="text-4xl mb-2">🎉</div>
              <p className="text-white text-xl font-bold mb-1">Đạt 2048!</p>
              <p className="text-amber-400 text-2xl font-black mb-4">{score} điểm</p>
              <div className="flex gap-3">
                <button onClick={() => { setWonDismissed(true); setPhase('playing') }} className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors">
                  Tiếp tục
                </button>
                <button onClick={startGame} className="bg-amber-500 hover:bg-amber-400 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors">
                  Chơi lại
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-gray-500 dark:text-gray-400 text-xs text-center">
          Trượt ngón tay hoặc dùng phím mũi tên
        </p>
      </div>
    </div>
  )
}
