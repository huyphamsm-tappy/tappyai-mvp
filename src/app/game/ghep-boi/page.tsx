'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

const GRID_SIZE = 7
const SYMBOLS = ['🔮', '⭐', '🌙', '🌊', '🔥', '🌸']
const SYMBOL_COLORS = ['#a855f7', '#eab308', '#6366f1', '#3b82f6', '#ef4444', '#ec4899']

type Cell = { sym: string; color: string; id: number; removing?: boolean; falling?: boolean }
let nextId = 1

function rndCell(): Cell {
  const i = Math.floor(Math.random() * SYMBOLS.length)
  return { sym: SYMBOLS[i], color: SYMBOL_COLORS[i], id: nextId++ }
}

function makeGrid(): Cell[][] {
  return Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null).map(rndCell))
}

function findMatches(grid: Cell[][]): [number, number][] {
  const matched = new Set<string>()
  const key = (r: number, c: number) => `${r},${c}`

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c <= GRID_SIZE - 3; c++) {
      if (grid[r][c].sym === grid[r][c+1].sym && grid[r][c].sym === grid[r][c+2].sym) {
        let end = c + 2
        while (end + 1 < GRID_SIZE && grid[r][end+1].sym === grid[r][c].sym) end++
        for (let i = c; i <= end; i++) matched.add(key(r, i))
      }
    }
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    for (let r = 0; r <= GRID_SIZE - 3; r++) {
      if (grid[r][c].sym === grid[r+1][c].sym && grid[r][c].sym === grid[r+2][c].sym) {
        let end = r + 2
        while (end + 1 < GRID_SIZE && grid[end+1][c].sym === grid[r][c].sym) end++
        for (let i = r; i <= end; i++) matched.add(key(i, c))
      }
    }
  }
  return [...matched].map(k => k.split(',').map(Number) as [number, number])
}

function applyGravity(grid: Cell[][]): Cell[][] {
  return Array(GRID_SIZE).fill(null).map((_, c) => {
    const col = Array(GRID_SIZE).fill(null).map((__, r) => grid[r][c]).filter(Boolean)
    while (col.length < GRID_SIZE) col.unshift(rndCell())
    return col
  }).reduce((acc, col, c) => {
    col.forEach((cell, r) => { acc[r][c] = cell })
    return acc
  }, Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)))
}

export default function GhepBoiPage() {
  const [grid, setGrid] = useState<Cell[][]>([])
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [score, setScore] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'animating'>('idle')
  const [removing, setRemoving] = useState<Set<string>>(new Set())
  const [combo, setCombo] = useState(0)
  const [showCombo, setShowCombo] = useState(false)
  const [moves, setMoves] = useState(30)
  const [gameOver, setGameOver] = useState(false)
  const comboRef = useRef(0)

  const startGame = useCallback(() => {
    nextId = 1
    setGrid(makeGrid())
    setSelected(null)
    setScore(0)
    setMoves(30)
    setCombo(0)
    setGameOver(false)
    setPhase('playing')
    setRemoving(new Set())
    posthog.capture('game_started', { game: 'ghep-boi' })
  }, [])

  const processMatches = useCallback((g: Cell[][], comboN: number) => {
    const matches = findMatches(g)
    if (matches.length === 0) {
      comboRef.current = 0
      setCombo(0)
      setPhase('playing')
      return
    }

    const keys = new Set(matches.map(([r, c]) => `${r},${c}`))
    setRemoving(keys)
    const gained = matches.length * 10 * Math.max(1, comboN)
    setScore(s => s + gained)
    if (comboN >= 2) { setCombo(comboN); setShowCombo(true); setTimeout(() => setShowCombo(false), 800) }

    setTimeout(() => {
      setRemoving(new Set())
      const newGrid = applyGravity(g.map((row, r) =>
        row.map((cell, c) => keys.has(`${r},${c}`) ? null as unknown as Cell : cell)
      ))
      setGrid(newGrid)
      processMatches(newGrid, comboN + 1)
    }, 350)
  }, [])

  const swap = useCallback((r1: number, c1: number, r2: number, c2: number) => {
    setGrid(prev => {
      const ng = prev.map(row => [...row])
      ;[ng[r1][c1], ng[r2][c2]] = [ng[r2][c2], ng[r1][c1]]

      const matches = findMatches(ng)
      if (matches.length === 0) {
        // Swap back (no match)
        ;[ng[r1][c1], ng[r2][c2]] = [ng[r2][c2], ng[r1][c1]]
        return ng
      }

      setMoves(m => {
        const nm = m - 1
        if (nm <= 0) {
          setPhase('idle')
          setGameOver(true)
          posthog.capture('game_over', { game: 'ghep-boi', score })
        }
        return nm
      })
      setPhase('animating')
      comboRef.current = 1
      setTimeout(() => processMatches(ng, 1), 50)
      return ng
    })
  }, [processMatches, score])

  const tap = useCallback((r: number, c: number) => {
    if (phase === 'animating') return
    if (!selected) { setSelected([r, c]); return }
    const [sr, sc] = selected
    if (sr === r && sc === c) { setSelected(null); return }
    const adj = (Math.abs(sr - r) + Math.abs(sc - c)) === 1
    if (adj) { setSelected(null); swap(sr, sc, r, c) }
    else setSelected([r, c])
  }, [selected, phase, swap])

  useEffect(() => {
    if (grid.length === 0) return
    // ensure no initial matches on start
    const m = findMatches(grid)
    if (m.length > 0) { processMatches(grid, 1) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-dvh bg-gradient-to-b from-purple-950 to-violet-950 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <Link href="/game" className="flex items-center gap-1 text-purple-300 text-sm font-medium">
          <ChevronLeft size={18} /> Game
        </Link>
        <h1 className="text-white font-bold text-base">🔮 Ghép Bói</h1>
        <div className="text-purple-300 font-bold text-sm text-right">
          <div>{score}</div>
          <div className="text-xs text-purple-400">{moves} bước</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4 gap-4 relative">
        {/* Combo flash */}
        {showCombo && (
          <div className="absolute top-8 z-10 pointer-events-none animate-[fadeIn_0.1s_ease-in]">
            <div className="bg-amber-400 text-white font-black text-2xl px-6 py-2 rounded-full shadow-lg">
              x{combo} COMBO! 🔥
            </div>
          </div>
        )}

        {phase === 'idle' && !gameOver && (
          <div className="flex flex-col items-center gap-5">
            <div className="text-6xl">🔮</div>
            <div className="text-center">
              <p className="text-white text-2xl font-black mb-2">Ghép Bói</p>
              <p className="text-purple-300 text-sm leading-relaxed">Hoán đổi các ký hiệu bói toán<br />để ghép 3 cùng loại — ghi điểm cao!</p>
            </div>
            <button onClick={startGame} className="bg-purple-500 hover:bg-purple-400 text-white font-bold px-10 py-3.5 rounded-2xl text-base transition-colors">
              Bắt đầu
            </button>
          </div>
        )}

        {gameOver && (
          <div className="flex flex-col items-center gap-4">
            <div className="text-5xl">🔮</div>
            <p className="text-white text-xl font-bold">Hết lượt!</p>
            <p className="text-purple-300 text-3xl font-black">{score} điểm</p>
            <button onClick={startGame} className="bg-purple-500 hover:bg-purple-400 text-white font-bold px-10 py-3.5 rounded-2xl text-base transition-colors">
              Chơi lại
            </button>
          </div>
        )}

        {/* Grid */}
        {grid.length > 0 && !gameOver && phase !== 'idle' && (
          <div
            className="rounded-2xl p-2 shadow-2xl"
            style={{ background: 'rgba(88,28,135,0.4)', border: '1px solid rgba(168,85,247,0.3)' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, gap: 4 }}>
              {grid.map((row, r) =>
                row.map((cell, c) => {
                  const isSelected = selected?.[0] === r && selected?.[1] === c
                  const isRemoving = removing.has(`${r},${c}`)
                  return (
                    <button
                      key={cell.id}
                      onClick={() => tap(r, c)}
                      className="flex items-center justify-center rounded-xl transition-all duration-150"
                      style={{
                        width: 42, height: 42,
                        background: isSelected
                          ? 'rgba(255,255,255,0.35)'
                          : 'rgba(255,255,255,0.1)',
                        boxShadow: isSelected ? `0 0 12px ${cell.color}` : undefined,
                        transform: isRemoving ? 'scale(0)' : isSelected ? 'scale(1.12)' : 'scale(1)',
                        opacity: isRemoving ? 0 : 1,
                        fontSize: 22,
                        border: isSelected ? `2px solid ${cell.color}` : '2px solid transparent',
                      }}
                    >
                      {cell.sym}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* Moves bar */}
        {!gameOver && phase !== 'idle' && (
          <div className="w-full max-w-xs">
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${(moves / 30) * 100}%`, background: moves > 10 ? '#a855f7' : '#ef4444' }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
