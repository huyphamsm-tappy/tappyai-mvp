'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

const GRID = 20
const CELL = 20
const W = GRID * CELL
const H = GRID * CELL
const SPEED_START = 150
const SPEED_MIN = 60

type Dir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
type Pt = { x: number; y: number; dir?: string }

function rnd(max: number) { return Math.floor(Math.random() * max) }

function spawnFood(snake: Pt[]): Pt {
  let p: Pt
  do { p = { x: rnd(GRID), y: rnd(GRID) } }
  while (snake.some(s => s.x === p.x && s.y === p.y))
  return p
}

export default function SnakePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({
    snake: [{ x: 10, y: 10 }] as Pt[],
    dir: 'RIGHT' as Dir,
    nextDir: 'RIGHT' as Dir,
    food: { x: 15, y: 10 },
    score: 0,
    running: false,
    dead: false,
    started: false,
  })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [score, setScore] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'dead'>('idle')
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const st = stateRef.current

    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, W, H)

    // Grid dots
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        ctx.beginPath()
        ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, 1, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Food (pulsing circle with glow)
    const food = st.food
    const grd = ctx.createRadialGradient(
      food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, 2,
      food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 1
    )
    grd.addColorStop(0, '#fff')
    grd.addColorStop(1, '#f97316')
    ctx.shadowBlur = 12
    ctx.shadowColor = '#f97316'
    ctx.fillStyle = grd
    ctx.beginPath()
    ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Snake
    st.snake.forEach((seg, i) => {
      const pct = i / st.snake.length
      const r = 16 - Math.round(pct * 6)
      const g = 185 - Math.round(pct * 40)
      const b = 129 - Math.round(pct * 60)
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.shadowBlur = i === 0 ? 8 : 0
      ctx.shadowColor = '#10b981'
      ctx.beginPath()
      ctx.roundRect(
        seg.x * CELL + 2, seg.y * CELL + 2,
        CELL - 4, CELL - 4, i === 0 ? 6 : 4
      )
      ctx.fill()
    })
    ctx.shadowBlur = 0

    // Eyes on head
    const head = st.snake[0]
    ctx.fillStyle = '#fff'
    const ex = head.dir === 'LEFT' ? -3 : head.dir === 'RIGHT' ? 3 : 0
    const ey = head.dir === 'UP' ? -3 : head.dir === 'DOWN' ? 3 : 0
    ctx.beginPath()
    ctx.arc(head.x * CELL + CELL / 2 + ex + (st.dir === 'UP' || st.dir === 'DOWN' ? -3 : 0), head.y * CELL + CELL / 2 + ey + (st.dir === 'LEFT' || st.dir === 'RIGHT' ? -3 : 0), 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(head.x * CELL + CELL / 2 + ex + (st.dir === 'UP' || st.dir === 'DOWN' ? 3 : 0), head.y * CELL + CELL / 2 + ey + (st.dir === 'LEFT' || st.dir === 'RIGHT' ? 3 : 0), 2, 0, Math.PI * 2)
    ctx.fill()
  }, [])

  const tick = useCallback(() => {
    const st = stateRef.current
    if (!st.running) return

    st.dir = st.nextDir
    const head = st.snake[0]
    const next = { x: head.x, y: head.y }
    if (st.dir === 'UP') next.y--
    else if (st.dir === 'DOWN') next.y++
    else if (st.dir === 'LEFT') next.x--
    else next.x++

    if (next.x < 0 || next.x >= GRID || next.y < 0 || next.y >= GRID ||
        st.snake.some(s => s.x === next.x && s.y === next.y)) {
      st.running = false
      st.dead = true
      setPhase('dead')
      posthog.capture('game_over', { game: 'ran-san-moi', score: st.score })
      draw()
      return
    }

    const ate = next.x === st.food.x && next.y === st.food.y
    st.snake = [next, ...st.snake]
    if (ate) {
      st.score++
      setScore(st.score)
      st.food = spawnFood(st.snake)
    } else {
      st.snake.pop()
    }

    draw()
    const speed = Math.max(SPEED_MIN, SPEED_START - st.score * 3)
    timerRef.current = setTimeout(tick, speed)
  }, [draw])

  const startGame = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const st = stateRef.current
    st.snake = [{ x: 10, y: 10 }]
    st.dir = 'RIGHT'
    st.nextDir = 'RIGHT'
    st.food = spawnFood([{ x: 10, y: 10 }])
    st.score = 0
    st.running = true
    st.dead = false
    st.started = true
    setScore(0)
    setPhase('playing')
    posthog.capture('game_started', { game: 'ran-san-moi' })
    timerRef.current = setTimeout(tick, SPEED_START)
    draw()
  }, [tick, draw])

  useEffect(() => {
    draw()
    const onKey = (e: KeyboardEvent) => {
      const st = stateRef.current
      const map: Record<string, Dir> = {
        ArrowUp: 'UP', w: 'UP', W: 'UP',
        ArrowDown: 'DOWN', s: 'DOWN', S: 'DOWN',
        ArrowLeft: 'LEFT', a: 'LEFT', A: 'LEFT',
        ArrowRight: 'RIGHT', d: 'RIGHT', D: 'RIGHT',
      }
      const d = map[e.key]
      if (!d) return
      e.preventDefault()
      if (!st.running && !st.dead) { startGame(); return }
      if (st.running) {
        const opp = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' } as const
        if (opp[d] !== st.dir) st.nextDir = d
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [draw, startGame])

  const onTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault()
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
    const st = stateRef.current
    if (!st.running && !st.dead) { startGame(); return }
    const opp = { UP: 'DOWN' as Dir, DOWN: 'UP' as Dir, LEFT: 'RIGHT' as Dir, RIGHT: 'LEFT' as Dir }
    let d: Dir
    if (Math.abs(dx) > Math.abs(dy)) d = dx > 0 ? 'RIGHT' : 'LEFT'
    else d = dy > 0 ? 'DOWN' : 'UP'
    if (st.running && opp[d] !== st.dir) st.nextDir = d
  }

  const dpadPress = (d: Dir) => {
    const st = stateRef.current
    if (!st.running && !st.dead) { startGame(); return }
    const opp = { UP: 'DOWN' as Dir, DOWN: 'UP' as Dir, LEFT: 'RIGHT' as Dir, RIGHT: 'LEFT' as Dir }
    if (st.running && opp[d] !== st.dir) st.nextDir = d
  }

  return (
    <div className="min-h-dvh bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <Link href="/game" className="flex items-center gap-1 text-primary-400 text-sm font-medium">
          <ChevronLeft size={18} /> Game
        </Link>
        <h1 className="text-white font-bold text-base">🐍 Rắn Săn Mồi</h1>
        <div className="text-emerald-400 font-bold text-base min-w-[3rem] text-right">{score}</div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 py-4">
        <div className="relative" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="rounded-2xl border border-gray-800 touch-none"
            style={{ maxWidth: '100%', maxHeight: '55vw' }}
          />
          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm">
              <div className="text-5xl mb-3">🐍</div>
              <p className="text-white text-xl font-bold mb-1">Rắn Săn Mồi</p>
              <p className="text-gray-400 text-sm mb-6 text-center px-6">Dùng mũi tên / WASD hoặc vuốt màn hình để điều khiển</p>
              <button onClick={startGame} className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-8 py-3 rounded-2xl text-base transition-colors">
                Bắt đầu
              </button>
            </div>
          )}
          {phase === 'dead' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
              <div className="text-4xl mb-2">💀</div>
              <p className="text-white text-xl font-bold mb-1">Game Over!</p>
              <p className="text-emerald-400 text-2xl font-black mb-6">Điểm: {score}</p>
              <button onClick={startGame} className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-8 py-3 rounded-2xl text-base transition-colors">
                Chơi lại
              </button>
            </div>
          )}
        </div>

        {/* D-Pad */}
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div />
          <button onPointerDown={() => dpadPress('UP')} className="w-14 h-14 rounded-2xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white text-xl font-bold transition-colors select-none">▲</button>
          <div />
          <button onPointerDown={() => dpadPress('LEFT')} className="w-14 h-14 rounded-2xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white text-xl font-bold transition-colors select-none">◀</button>
          <button onPointerDown={() => dpadPress('DOWN')} className="w-14 h-14 rounded-2xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white text-xl font-bold transition-colors select-none">▼</button>
          <button onPointerDown={() => dpadPress('RIGHT')} className="w-14 h-14 rounded-2xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white text-xl font-bold transition-colors select-none">▶</button>
        </div>
      </div>
    </div>
  )
}
