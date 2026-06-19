'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, RotateCw } from 'lucide-react'
import posthog from 'posthog-js'

const COLS = 10, ROWS = 20
const CELL = 28

const PIECES = [
  { shape: [[1,1,1,1]], color: '#06b6d4' },         // I
  { shape: [[1,1],[1,1]], color: '#eab308' },         // O
  { shape: [[0,1,0],[1,1,1]], color: '#a855f7' },     // T
  { shape: [[1,0],[1,0],[1,1]], color: '#f97316' },   // L
  { shape: [[0,1],[0,1],[1,1]], color: '#3b82f6' },   // J
  { shape: [[0,1,1],[1,1,0]], color: '#22c55e' },     // S
  { shape: [[1,1,0],[0,1,1]], color: '#ef4444' },     // Z
]

type Board = (string | null)[][]
type Piece = { shape: number[][]; color: string; x: number; y: number }

function emptyBoard(): Board {
  return Array(ROWS).fill(null).map(() => Array(COLS).fill(null))
}

function randomPiece(): Piece {
  const p = PIECES[Math.floor(Math.random() * PIECES.length)]
  return { ...p, shape: p.shape.map(r => [...r]), x: Math.floor(COLS / 2) - Math.ceil(p.shape[0].length / 2), y: 0 }
}

function rotate(shape: number[][]): number[][] {
  return shape[0].map((_, i) => shape.map(r => r[i]).reverse())
}

function collides(board: Board, piece: Piece, dx = 0, dy = 0, newShape?: number[][]): boolean {
  const sh = newShape || piece.shape
  for (let r = 0; r < sh.length; r++)
    for (let c = 0; c < sh[r].length; c++) {
      if (!sh[r][c]) continue
      const nx = piece.x + c + dx, ny = piece.y + r + dy
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true
      if (ny >= 0 && board[ny][nx]) return true
    }
  return false
}

function placePiece(board: Board, piece: Piece): Board {
  const nb = board.map(r => [...r])
  piece.shape.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v && piece.y + r >= 0) nb[piece.y + r][piece.x + c] = piece.color
    })
  )
  return nb
}

function clearLines(board: Board): { board: Board; cleared: number } {
  const remaining = board.filter(row => row.some(c => !c))
  const cleared = ROWS - remaining.length
  const empty = Array(cleared).fill(null).map(() => Array(COLS).fill(null))
  return { board: [...empty, ...remaining], cleared }
}

const SCORE_TABLE = [0, 100, 300, 500, 800]
const SPEED = [800, 700, 600, 500, 400, 320, 260, 210, 170, 140, 110]

export default function XepKhoiPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [lines, setLines] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'dead'>('idle')

  const gs = useRef({
    board: emptyBoard(),
    piece: randomPiece(),
    next: randomPiece(),
    score: 0,
    level: 1,
    lines: 0,
    running: false,
    flashRows: [] as number[],
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const g = gs.current
    const CW = COLS * CELL, CH = ROWS * CELL

    // BG
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, CW, CH)

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(CW, r * CELL); ctx.stroke() }
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, CH); ctx.stroke() }

    // Ghost piece
    let ghostY = g.piece.y
    while (!collides(g.board, g.piece, 0, ghostY - g.piece.y + 1)) ghostY++
    if (ghostY !== g.piece.y) {
      g.piece.shape.forEach((row, r) =>
        row.forEach((v, c) => {
          if (!v) return
          ctx.fillStyle = 'rgba(255,255,255,0.1)'
          ctx.beginPath()
          ctx.roundRect((g.piece.x + c) * CELL + 1, (ghostY + r) * CELL + 1, CELL - 2, CELL - 2, 4)
          ctx.fill()
        })
      )
    }

    // Board cells
    g.board.forEach((row, r) => {
      row.forEach((color, c) => {
        if (!color) return
        const isFlash = g.flashRows.includes(r)
        ctx.fillStyle = isFlash ? '#fff' : color
        ctx.shadowBlur = isFlash ? 0 : 6
        ctx.shadowColor = color
        ctx.beginPath()
        ctx.roundRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2, 4)
        ctx.fill()
        ctx.shadowBlur = 0
        // Shine
        if (!isFlash) {
          ctx.fillStyle = 'rgba(255,255,255,0.25)'
          ctx.beginPath()
          ctx.roundRect(c * CELL + 3, r * CELL + 3, CELL / 3, CELL / 3, 2)
          ctx.fill()
        }
      })
    })

    // Active piece
    g.piece.shape.forEach((row, r) =>
      row.forEach((v, c) => {
        if (!v) return
        ctx.fillStyle = g.piece.color
        ctx.shadowBlur = 10
        ctx.shadowColor = g.piece.color
        ctx.beginPath()
        ctx.roundRect((g.piece.x + c) * CELL + 1, (g.piece.y + r) * CELL + 1, CELL - 2, CELL - 2, 4)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.beginPath()
        ctx.roundRect((g.piece.x + c) * CELL + 3, (g.piece.y + r) * CELL + 3, CELL / 3, CELL / 3, 2)
        ctx.fill()
      })
    )
  }, [])

  const drop = useCallback(() => {
    const g = gs.current
    if (!g.running) return

    if (!collides(g.board, g.piece, 0, 1)) {
      g.piece.y++
    } else {
      // Place
      g.board = placePiece(g.board, g.piece)
      const { board: nb, cleared } = clearLines(g.board)

      if (cleared > 0) {
        // Flash effect
        const flashRows: number[] = []
        for (let r = 0; r < ROWS; r++) if (g.board[r].every(c => c)) flashRows.push(r)
        g.flashRows = flashRows
        setTimeout(() => { gs.current.flashRows = []; draw() }, 200)
      }

      g.board = nb
      g.score += SCORE_TABLE[cleared] * g.level
      g.lines += cleared
      g.level = Math.min(10, Math.floor(g.lines / 10) + 1)
      setScore(g.score); setLevel(g.level); setLines(g.lines)

      g.piece = g.next
      g.next = randomPiece()

      if (collides(g.board, g.piece)) {
        g.running = false
        setPhase('dead')
        posthog.capture('game_over', { game: 'xep-khoi', score: g.score })
        draw()
        return
      }
    }

    draw()
    const spd = SPEED[Math.min(g.level - 1, SPEED.length - 1)]
    timerRef.current = setTimeout(drop, spd)
  }, [draw])

  const startGame = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const g = gs.current
    g.board = emptyBoard(); g.piece = randomPiece(); g.next = randomPiece()
    g.score = 0; g.level = 1; g.lines = 0; g.running = true; g.flashRows = []
    setScore(0); setLevel(1); setLines(0); setPhase('playing')
    posthog.capture('game_started', { game: 'xep-khoi' })
    timerRef.current = setTimeout(drop, SPEED[0])
    draw()
  }, [drop, draw])

  const moveLeft = useCallback(() => {
    const g = gs.current
    if (!g.running || collides(g.board, g.piece, -1, 0)) return
    g.piece.x--; draw()
  }, [draw])

  const moveRight = useCallback(() => {
    const g = gs.current
    if (!g.running || collides(g.board, g.piece, 1, 0)) return
    g.piece.x++; draw()
  }, [draw])

  const rotatePiece = useCallback(() => {
    const g = gs.current
    if (!g.running) return
    const ns = rotate(g.piece.shape)
    if (!collides(g.board, g.piece, 0, 0, ns)) { g.piece.shape = ns; draw(); return }
    if (!collides(g.board, g.piece, 1, 0, ns)) { g.piece.shape = ns; g.piece.x++; draw(); return }
    if (!collides(g.board, g.piece, -1, 0, ns)) { g.piece.shape = ns; g.piece.x--; draw() }
  }, [draw])

  const hardDrop = useCallback(() => {
    const g = gs.current
    if (!g.running) return
    while (!collides(g.board, g.piece, 0, 1)) g.piece.y++
    if (timerRef.current) clearTimeout(timerRef.current)
    drop()
  }, [drop])

  const softDrop = useCallback(() => {
    const g = gs.current
    if (!g.running || collides(g.board, g.piece, 0, 1)) return
    g.piece.y++; draw()
  }, [draw])

  useEffect(() => {
    draw()
    const touchStart = { x: 0, y: 0, t: 0 }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); moveLeft() }
      if (e.key === 'ArrowRight') { e.preventDefault(); moveRight() }
      if (e.key === 'ArrowDown') { e.preventDefault(); softDrop() }
      if (e.key === 'ArrowUp' || e.key === 'x') { e.preventDefault(); rotatePiece() }
      if (e.key === ' ') { e.preventDefault(); hardDrop() }
    }

    const canvas = canvasRef.current
    const onTStart = (e: TouchEvent) => {
      e.preventDefault()
      touchStart.x = e.touches[0].clientX
      touchStart.y = e.touches[0].clientY
      touchStart.t = Date.now()
    }
    const onTEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStart.x
      const dy = e.changedTouches[0].clientY - touchStart.y
      const dt = Date.now() - touchStart.t
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && dt < 200) { rotatePiece(); return }
      if (Math.abs(dy) > Math.abs(dx) && dy > 40) { hardDrop(); return }
      if (Math.abs(dx) > 30) { if (dx > 0) moveRight(); else moveLeft() }
    }

    window.addEventListener('keydown', onKey)
    canvas?.addEventListener('touchstart', onTStart, { passive: false })
    canvas?.addEventListener('touchend', onTEnd, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKey)
      canvas?.removeEventListener('touchstart', onTStart)
      canvas?.removeEventListener('touchend', onTEnd)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [draw, moveLeft, moveRight, rotatePiece, hardDrop, softDrop])

  return (
    <div className="min-h-dvh bg-[#0f172a] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <Link href="/game" className="flex items-center gap-1 text-primary-400 text-sm font-medium">
          <ChevronLeft size={18} /> Game
        </Link>
        <h1 className="text-white font-bold text-base">🟦 Xếp Khối</h1>
        <div className="text-cyan-400 font-bold text-sm text-right">
          <div>{score}</div>
          <div className="text-xs text-gray-500">Lv.{level}</div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center gap-4 px-4 py-3">
        {/* Next piece preview */}
        <div className="flex flex-col gap-3">
          <div className="bg-gray-800/60 rounded-2xl p-3">
            <p className="text-gray-500 text-xs mb-2 text-center">Tiếp</p>
            <div className="w-16 h-16 flex items-center justify-center">
              {gs.current.next && (() => {
                const sh = gs.current.next.shape
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sh[0].length}, 1fr)`, gap: 2 }}>
                    {sh.map((row, r) => row.map((v, c) => (
                      <div key={`${r}-${c}`} style={{ width: 12, height: 12, borderRadius: 2, background: v ? gs.current.next.color : 'transparent' }} />
                    )))}
                  </div>
                )
              })()}
            </div>
          </div>
          <div className="bg-gray-800/60 rounded-2xl p-3 text-center">
            <p className="text-gray-500 text-xs">Điểm</p>
            <p className="text-white font-black">{score}</p>
          </div>
          <div className="bg-gray-800/60 rounded-2xl p-3 text-center">
            <p className="text-gray-500 text-xs">Hàng</p>
            <p className="text-white font-black">{lines}</p>
          </div>
        </div>

        {/* Game board */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={COLS * CELL}
            height={ROWS * CELL}
            className="rounded-2xl border border-gray-800"
            style={{ touchAction: 'none', maxHeight: '80vh', width: 'auto' }}
          />
          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
              <div className="text-5xl mb-3">🟦</div>
              <p className="text-white text-xl font-bold mb-2">Xếp Khối</p>
              <div className="text-gray-400 text-xs mb-6 text-center space-y-1">
                <p>← → Di chuyển</p>
                <p>↑ / Chạm: Xoay</p>
                <p>↓ / Vuốt xuống: Thả nhanh</p>
              </div>
              <button onClick={startGame} className="bg-cyan-500 hover:bg-cyan-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">
                Bắt đầu
              </button>
            </div>
          )}
          {phase === 'dead' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
              <div className="text-4xl mb-2">💀</div>
              <p className="text-white text-xl font-bold mb-1">Thua rồi!</p>
              <p className="text-cyan-400 text-2xl font-black mb-1">{score}</p>
              <p className="text-gray-400 text-sm mb-5">Cấp độ {level} · {lines} hàng</p>
              <button onClick={startGame} className="bg-cyan-500 hover:bg-cyan-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">
                Chơi lại
              </button>
            </div>
          )}
        </div>

        {/* Mobile controls */}
        <div className="flex flex-col gap-2">
          <button onPointerDown={rotatePiece} className="w-12 h-12 rounded-xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white transition-colors">
            <RotateCw size={18} />
          </button>
          <button onPointerDown={moveLeft} className="w-12 h-12 rounded-xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white text-xl transition-colors">◀</button>
          <button onPointerDown={softDrop} className="w-12 h-12 rounded-xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white text-xl transition-colors">▼</button>
          <button onPointerDown={moveRight} className="w-12 h-12 rounded-xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white text-xl transition-colors">▶</button>
          <button onPointerDown={hardDrop} className="w-12 h-12 rounded-xl bg-cyan-800 active:bg-cyan-700 flex items-center justify-center text-white text-xs font-bold transition-colors">DROP</button>
        </div>
      </div>
    </div>
  )
}
