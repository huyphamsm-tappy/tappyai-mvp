'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

const COLS = 15, ROWS = 18
const CS = 24
const CW = COLS * CS // 360
const CH = ROWS * CS // 432
const W = 360, H = 580
const HUD_H = H - CH // 148

type CellType = 'wall' | 'floor' | 'exit' | 'chest'
type EnemyKind = 'goblin' | 'skeleton' | 'ogre'
type ItemKind = 'potion_s' | 'potion_l' | 'sword' | 'shield' | 'bomb'

interface Cell { type: CellType }
interface EnemyE { id: number; col: number; row: number; hp: number; maxHp: number; kind: EnemyKind; atk: number; alert: boolean; moveTimer: number }
interface ItemE { id: number; col: number; row: number; kind: ItemKind }
interface FloatText { id: number; x: number; y: number; text: string; life: number; color: string }

const ENEMY_DEF: Record<EnemyKind, { emoji: string; hp: number; atk: number; color: string; name: string }> = {
  goblin:   { emoji: '👺', hp: 4,  atk: 1, color: '#22c55e', name: 'Quái Lùn' },
  skeleton: { emoji: '💀', hp: 6,  atk: 2, color: '#94a3b8', name: 'Xương Khô' },
  ogre:     { emoji: '👹', hp: 12, atk: 3, color: '#ef4444', name: 'Quái Khổng Lồ' },
}
const ITEM_DEF: Record<ItemKind, { emoji: string; name: string; color: string }> = {
  potion_s: { emoji: '🧪', name: '+3 HP',   color: '#22c55e' },
  potion_l: { emoji: '⚗️', name: '+6 HP',   color: '#34d399' },
  sword:    { emoji: '⚔️', name: '+2 ATK',  color: '#fbbf24' },
  shield:   { emoji: '🛡️', name: '+1 DEF',  color: '#60a5fa' },
  bomb:     { emoji: '💣', name: 'Nổ AoE',  color: '#f97316' },
}

let _id = 0; const uid = () => ++_id

function buildDungeon(): { grid: Cell[][]; enemies: EnemyE[]; items: ItemE[]; px: number; py: number } {
  const grid: Cell[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ type: 'wall' as CellType })))

  // Simple BSP-like room carving
  const rooms: { c1: number; r1: number; c2: number; r2: number }[] = []
  const tryRoom = (c1: number, r1: number, w: number, h: number) => {
    const c2 = c1 + w - 1, r2 = r1 + h - 1
    if (c2 >= COLS - 1 || r2 >= ROWS - 1) return
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) grid[r][c].type = 'floor'
    rooms.push({ c1, r1, c2, r2 })
  }

  tryRoom(1, 1, 4, 4)
  tryRoom(6, 1, 5, 4)
  tryRoom(11, 1, 3, 4)
  tryRoom(1, 7, 4, 5)
  tryRoom(6, 6, 5, 5)
  tryRoom(11, 6, 3, 5)
  tryRoom(1, 13, 4, 4)
  tryRoom(6, 12, 5, 5)
  tryRoom(11, 13, 3, 4)

  // Connect rooms with corridors
  const connect = (r1: typeof rooms[0], r2: typeof rooms[0]) => {
    const mc1 = Math.floor((r1.c1 + r1.c2) / 2), mr1 = Math.floor((r1.r1 + r1.r2) / 2)
    const mc2 = Math.floor((r2.c1 + r2.c2) / 2), mr2 = Math.floor((r2.r1 + r2.r2) / 2)
    let c = mc1, r = mr1
    while (c !== mc2) { grid[r][c].type = 'floor'; c += c < mc2 ? 1 : -1 }
    while (r !== mr2) { grid[r][c].type = 'floor'; r += r < mr2 ? 1 : -1 }
  }
  for (let i = 0; i < rooms.length - 1; i++) connect(rooms[i], rooms[i + 1])
  connect(rooms[0], rooms[rooms.length - 1])

  // Player start
  const sr = rooms[0]; const px = Math.floor((sr.c1 + sr.c2) / 2), py = Math.floor((sr.r1 + sr.r2) / 2)

  // Exit in last room
  const lr = rooms[rooms.length - 1]
  grid[lr.r2 - 1][Math.floor((lr.c1 + lr.c2) / 2)].type = 'exit'

  const enemies: EnemyE[] = []
  const items: ItemE[] = []
  const used = new Set<string>()
  used.add(`${px},${py}`)

  const kinds: EnemyKind[] = ['goblin', 'goblin', 'goblin', 'skeleton', 'skeleton', 'ogre']
  const ikinds: ItemKind[] = ['potion_s', 'potion_s', 'potion_l', 'sword', 'shield', 'bomb']

  for (let i = 1; i < rooms.length; i++) {
    const rm = rooms[i]
    const ek = kinds[i % kinds.length]
    const def = ENEMY_DEF[ek]
    let ec = 0, er = 0
    do { ec = rm.c1 + 1 + Math.floor(Math.random() * (rm.c2 - rm.c1 - 1)); er = rm.r1 + 1 + Math.floor(Math.random() * (rm.r2 - rm.r1 - 1)) } while (used.has(`${ec},${er}`))
    used.add(`${ec},${er}`)
    enemies.push({ id: uid(), col: ec, row: er, hp: def.hp, maxHp: def.hp, kind: ek, atk: def.atk, alert: false, moveTimer: 0 })
  }

  for (let i = 0; i < ikinds.length; i++) {
    const rm = rooms[(i + 2) % rooms.length]
    let ic = 0, ir = 0
    do { ic = rm.c1 + Math.floor(Math.random() * (rm.c2 - rm.c1 + 1)); ir = rm.r1 + Math.floor(Math.random() * (rm.r2 - rm.r1 + 1)) }
    while (used.has(`${ic},${ir}`) || grid[ir]?.[ic]?.type !== 'floor')
    used.add(`${ic},${ir}`)
    items.push({ id: uid(), col: ic, row: ir, kind: ikinds[i] })
  }

  return { grid, enemies, items, px, py }
}

export default function DungeonPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'dead' | 'won'>('idle')
  const [hud, setHud] = useState({ hp: 10, maxHp: 10, atk: 2, def: 0, items: [] as string[] })
  const [log, setLog] = useState('Tiến về phía trước!')
  const animFrame = useRef<number>(0)

  const gs = useRef({
    grid: [] as Cell[][], enemies: [] as EnemyE[], items: [] as ItemE[], floats: [] as FloatText[],
    px: 0, py: 0, hp: 10, maxHp: 10, atk: 2, def: 0, phase: 'idle',
    camCol: 0, camRow: 0, animTick: 0,
  })

  const visibleCols = Math.floor(CW / CS), visibleRows = Math.floor(CH / CS)

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const g = gs.current
    ctx.fillStyle = '#0a0a0f'; ctx.fillRect(0, 0, W, H)

    const camC = Math.max(0, Math.min(COLS - visibleCols, g.px - Math.floor(visibleCols / 2)))
    const camR = Math.max(0, Math.min(ROWS - visibleRows, g.py - Math.floor(visibleRows / 2)))

    // Draw grid
    for (let r = 0; r < visibleRows; r++) {
      for (let c = 0; c < visibleCols; c++) {
        const gc = c + camC, gr = r + camR
        if (gc < 0 || gc >= COLS || gr < 0 || gr >= ROWS) continue
        const cell = g.grid[gr]?.[gc]
        if (!cell) continue
        const sx = c * CS, sy = r * CS
        if (cell.type === 'wall') {
          ctx.fillStyle = '#1e293b'; ctx.fillRect(sx, sy, CS, CS)
          ctx.fillStyle = '#0f172a'; ctx.fillRect(sx + 1, sy + 1, CS - 2, CS - 2)
          // stone texture
          if ((gc + gr) % 3 === 0) { ctx.fillStyle = '#162032'; ctx.fillRect(sx + 4, sy + 4, CS - 8, CS - 8) }
        } else if (cell.type === 'floor') {
          ctx.fillStyle = '#1a1a2e'; ctx.fillRect(sx, sy, CS, CS)
          ctx.fillStyle = '#16213e'; ctx.fillRect(sx + 1, sy + 1, CS - 2, CS - 2)
        } else if (cell.type === 'exit') {
          ctx.fillStyle = '#1a1a2e'; ctx.fillRect(sx, sy, CS, CS)
          // portal
          ctx.fillStyle = '#7c3aed'; ctx.beginPath(); ctx.arc(sx + CS / 2, sy + CS / 2, 8, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = '#a78bfa'; ctx.beginPath(); ctx.arc(sx + CS / 2, sy + CS / 2, 4, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = '#e2e8f0'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
          ctx.fillText('出', sx + CS / 2, sy + CS / 2 + 4)
        }
      }
    }

    // Items
    for (const item of g.items) {
      const sc = item.col - camC, sr2 = item.row - camR
      if (sc < 0 || sc >= visibleCols || sr2 < 0 || sr2 >= visibleRows) continue
      const sx = sc * CS + CS / 2, sy = sr2 * CS + CS / 2
      ctx.font = '16px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(ITEM_DEF[item.kind].emoji, sx, sy + 6)
    }

    // Enemies
    for (const e of g.enemies) {
      const sc = e.col - camC, sr2 = e.row - camR
      if (sc < 0 || sc >= visibleCols || sr2 < 0 || sr2 >= visibleRows) continue
      const sx = sc * CS + CS / 2, sy = sr2 * CS + CS / 2
      // Alert glow
      if (e.alert) { ctx.fillStyle = 'rgba(239,68,68,0.3)'; ctx.beginPath(); ctx.arc(sx, sy, CS * 0.8, 0, Math.PI * 2); ctx.fill() }
      ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(ENEMY_DEF[e.kind].emoji, sx, sy + 6)
      // HP bar
      const bw = CS - 2; ctx.fillStyle = '#334155'; ctx.fillRect(sx - bw / 2, sy - CS / 2 - 5, bw, 3)
      ctx.fillStyle = '#ef4444'; ctx.fillRect(sx - bw / 2, sy - CS / 2 - 5, bw * (e.hp / e.maxHp), 3)
    }

    // Player
    {
      const sc = g.px - camC, sr2 = g.py - camR
      const sx = sc * CS + CS / 2, sy = sr2 * CS + CS / 2
      ctx.fillStyle = 'rgba(59,130,246,0.3)'; ctx.beginPath(); ctx.arc(sx, sy, CS * 0.7, 0, Math.PI * 2); ctx.fill()
      ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🧙', sx, sy + 6)
    }

    // Float texts
    for (const f of g.floats) {
      ctx.globalAlpha = f.life
      ctx.fillStyle = f.color; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(f.text, f.x, f.y)
      ctx.globalAlpha = 1
    }

    // HUD
    const hudY = CH
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, hudY, W, HUD_H)
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, hudY); ctx.lineTo(W, hudY); ctx.stroke()

    // HP bar
    const hpBarW = 200
    ctx.fillStyle = '#1e293b'; ctx.fillRect(12, hudY + 12, hpBarW, 14)
    const hpRatio = Math.max(0, g.hp / g.maxHp)
    ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#f59e0b' : '#ef4444'
    ctx.fillRect(12, hudY + 12, hpBarW * hpRatio, 14)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`${g.hp}/${g.maxHp}`, 12 + hpBarW / 2, hudY + 23)

    ctx.fillStyle = '#fbbf24'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`⚔️ ${g.atk}  🛡️ ${g.def}`, 12, hudY + 44)
    ctx.fillStyle = '#94a3b8'; ctx.font = '11px sans-serif'
    ctx.fillText('← → ↑ ↓ để di chuyển / chạm D-pad', 12, hudY + 60)
  }, [visibleCols, visibleRows])

  const tryMove = useCallback((dc: number, dr: number) => {
    const g = gs.current
    if (g.phase !== 'playing') return
    const nc = g.px + dc, nr = g.py + dr
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) return
    const cell = g.grid[nr]?.[nc]
    if (!cell || cell.type === 'wall') return

    // Check enemy
    const enemy = g.enemies.find(e => e.col === nc && e.row === nr)
    if (enemy) {
      const dmg = Math.max(1, g.atk - 0)
      enemy.hp -= dmg
      const fsx = (nc - Math.max(0, Math.min(COLS - visibleCols, g.px - Math.floor(visibleCols / 2)))) * CS + CS / 2
      const fsy = (nr - Math.max(0, Math.min(ROWS - visibleRows, g.py - Math.floor(visibleRows / 2)))) * CS + CS / 2
      g.floats.push({ id: uid(), x: fsx, y: fsy - 8, text: `-${dmg}`, life: 1, color: '#fbbf24' })
      if (enemy.hp <= 0) {
        g.enemies = g.enemies.filter(e => e.id !== enemy.id)
        setLog(`Hạ gục ${ENEMY_DEF[enemy.kind].name}!`)
      } else {
        setLog(`Tấn công ${ENEMY_DEF[enemy.kind].name} (-${dmg} HP)`)
      }
      // Enemy counter-attack
      const eAtk = Math.max(0, enemy.atk - g.def)
      g.hp -= eAtk
      if (eAtk > 0) { g.floats.push({ id: uid(), x: (g.px - Math.max(0, Math.min(COLS - visibleCols, g.px - Math.floor(visibleCols / 2)))) * CS + CS / 2, y: (g.py - Math.max(0, Math.min(ROWS - visibleRows, g.py - Math.floor(visibleRows / 2)))) * CS + CS / 2 - 8, text: `-${eAtk}`, life: 1, color: '#ef4444' }) }
      setHud({ hp: g.hp, maxHp: g.maxHp, atk: g.atk, def: g.def, items: [] })
      if (g.hp <= 0) { g.phase = 'dead'; setPhase('dead'); posthog.capture('game_over', { game: 'hang-dong-bi-an' }); return }
      return
    }

    // Move
    g.px = nc; g.py = nr

    // Pick up item
    const itemIdx = g.items.findIndex(i => i.col === nc && i.row === nr)
    if (itemIdx !== -1) {
      const item = g.items[itemIdx]
      g.items.splice(itemIdx, 1)
      const idef = ITEM_DEF[item.kind]
      if (item.kind === 'potion_s') { g.hp = Math.min(g.maxHp, g.hp + 3); setLog(`Uống ${idef.name}`) }
      else if (item.kind === 'potion_l') { g.hp = Math.min(g.maxHp, g.hp + 6); setLog(`Uống ${idef.name}`) }
      else if (item.kind === 'sword') { g.atk += 2; setLog(`Trang bị ${idef.name}`) }
      else if (item.kind === 'shield') { g.def += 1; setLog(`Trang bị ${idef.name}`) }
      else if (item.kind === 'bomb') {
        const before = g.enemies.length
        g.enemies = g.enemies.filter(e => Math.abs(e.col - nc) > 1 || Math.abs(e.row - nr) > 1)
        setLog(`Bom nổ! Tiêu diệt ${before - g.enemies.length} quái!`)
      }
      setHud({ hp: g.hp, maxHp: g.maxHp, atk: g.atk, def: g.def, items: [] })
    }

    // Check exit
    if (cell.type === 'exit') { g.phase = 'won'; setPhase('won'); posthog.capture('game_won', { game: 'hang-dong-bi-an' }); return }

    // Enemy AI: enemies adjacent to player become alert, then move toward player
    for (const e of g.enemies) {
      const dist = Math.abs(e.col - g.px) + Math.abs(e.row - g.py)
      if (dist <= 3) e.alert = true
      if (!e.alert) continue
      e.moveTimer++
      if (e.moveTimer < 2) continue
      e.moveTimer = 0
      const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]
      const sorted = dirs.sort((a, b) => {
        const da = Math.abs(e.col + a[0] - g.px) + Math.abs(e.row + a[1] - g.py)
        const db = Math.abs(e.col + b[0] - g.px) + Math.abs(e.row + b[1] - g.py)
        return da - db
      })
      for (const [ddc, ddr] of sorted) {
        const nnc = e.col + ddc, nnr = e.row + ddr
        if (nnc < 0 || nnc >= COLS || nnr < 0 || nnr >= ROWS) continue
        if (g.grid[nnr]?.[nnc]?.type === 'wall') continue
        if (g.enemies.some(o => o.id !== e.id && o.col === nnc && o.row === nnr)) continue
        if (nnc === g.px && nnr === g.py) break // will attack
        e.col = nnc; e.row = nnr; break
      }
    }
  }, [visibleCols, visibleRows])

  const startGame = useCallback(() => {
    const { grid, enemies, items, px, py } = buildDungeon()
    const g = gs.current
    Object.assign(g, { grid, enemies, items, px, py, hp: 10, maxHp: 10, atk: 2, def: 0, floats: [], phase: 'playing' })
    setPhase('playing')
    setHud({ hp: 10, maxHp: 10, atk: 2, def: 0, items: [] })
    setLog('Tiến về phía trước!')
    posthog.capture('game_started', { game: 'hang-dong-bi-an' })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault() }
      if (e.key === 'ArrowUp')    tryMove(0, -1)
      if (e.key === 'ArrowDown')  tryMove(0, 1)
      if (e.key === 'ArrowLeft')  tryMove(-1, 0)
      if (e.key === 'ArrowRight') tryMove(1, 0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tryMove])

  // Render loop
  useEffect(() => {
    let running = true
    const loop = () => {
      if (!running) return
      const g = gs.current
      for (const f of g.floats) { f.y -= 0.4; f.life -= 0.025 }
      g.floats = g.floats.filter(f => f.life > 0)
      draw()
      animFrame.current = requestAnimationFrame(loop)
    }
    animFrame.current = requestAnimationFrame(loop)
    return () => { running = false; cancelAnimationFrame(animFrame.current) }
  }, [draw])

  // D-pad touch controls
  const Btn = ({ label, dc, dr }: { label: string; dc: number; dr: number }) => (
    <button
      onTouchStart={e => { e.preventDefault(); tryMove(dc, dr) }}
      onClick={() => tryMove(dc, dr)}
      className="w-12 h-12 bg-gray-800 active:bg-gray-600 rounded-xl text-white text-xl flex items-center justify-center border border-gray-700 select-none"
    >{label}</button>
  )

  return (
    <div className="min-h-dvh bg-gray-950 flex flex-col items-center">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/game" className="text-gray-400 hover:text-white"><ChevronLeft size={22} /></Link>
          <h1 className="text-white font-bold text-lg flex-1">⚔️ Hang Động Bí Ẩn</h1>
        </div>

        <div className="relative px-2">
          <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-2xl border border-gray-800" />

          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 rounded-2xl">
              <div className="text-6xl mb-3">⚔️</div>
              <h2 className="text-white text-2xl font-black mb-2">Hang Động Bí Ẩn</h2>
              <p className="text-gray-300 text-sm text-center px-6 mb-4">Khám phá hang động, chiến đấu quái vật, nhặt vật phẩm và tìm lối ra!</p>
              <div className="text-gray-400 text-xs text-center space-y-1 mb-6">
                <p>👺 Quái Lùn — 🔵 Xương Khô — 👹 Quái Khổng Lồ</p>
                <p>🧪 Bình máu · ⚔️ Kiếm · 🛡️ Giáp · 💣 Bom</p>
              </div>
              <button onClick={startGame} className="bg-violet-500 hover:bg-violet-400 text-white font-bold px-8 py-3 rounded-2xl text-lg">Bắt Đầu</button>
            </div>
          )}
          {phase === 'dead' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 rounded-2xl">
              <div className="text-5xl mb-3">💀</div>
              <h2 className="text-red-400 text-2xl font-black mb-1">Anh Hùng Gục Ngã!</h2>
              <p className="text-gray-400 text-sm mb-4">{log}</p>
              <button onClick={startGame} className="bg-red-500 hover:bg-red-400 text-white font-bold px-8 py-3 rounded-2xl text-lg">Thử Lại</button>
            </div>
          )}
          {phase === 'won' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 rounded-2xl">
              <div className="text-5xl mb-3">🏆</div>
              <h2 className="text-yellow-400 text-2xl font-black mb-1">Thoát Khỏi Hang Động!</h2>
              <p className="text-gray-300 text-sm mb-4">Chiến binh dũng cảm!</p>
              <button onClick={startGame} className="bg-yellow-500 hover:bg-yellow-400 text-white font-bold px-8 py-3 rounded-2xl text-lg">Chơi Lại</button>
            </div>
          )}
        </div>

        {/* Log + D-pad */}
        {phase === 'playing' && (
          <div className="px-4 mt-2">
            <p className="text-gray-400 text-xs text-center mb-2 truncate">{log}</p>
            <div className="flex flex-col items-center gap-1">
              <Btn label="↑" dc={0} dr={-1} />
              <div className="flex gap-4">
                <Btn label="←" dc={-1} dr={0} />
                <Btn label="↓" dc={0} dr={1} />
                <Btn label="→" dc={1} dr={0} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
