'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

const W = 360, H = 580
const COLS = 9, ROWS = 12
const CS = Math.floor(W / COLS) // 40
const GRID_H = ROWS * CS // 480
const HUD_H = H - GRID_H // 100

// Path: list of [col, row] grid cells enemies walk through
const PATH: [number, number][] = [
  [0,1],[1,1],[2,1],[3,1],[3,2],[3,3],[3,4],[4,4],[5,4],[6,4],[6,3],[6,2],[6,1],[7,1],[8,1],
  [8,2],[8,3],[8,4],[8,5],[8,6],[7,6],[6,6],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],[1,7],[2,7],[3,7],[3,8],[3,9],[4,9],[5,9],[6,9],[6,8],[6,7],[7,7],[8,7],
  [8,8],[8,9],[8,10],[7,10],[6,10],[5,10],[4,10],[3,10],[2,10],[1,10],[0,10],[0,11],
]

const pathSet = new Set(PATH.map(([c, r]) => `${c},${r}`))
const isPath = (c: number, r: number) => pathSet.has(`${c},${r}`)

type TowerType = 'rapid' | 'cannon' | 'splash'

interface Tower {
  id: number; col: number; row: number; type: TowerType
  cooldown: number; level: number
}
interface Enemy {
  id: number; pathIdx: number; x: number; y: number
  hp: number; maxHp: number; spd: number; reward: number; slow: number
}
interface Projectile {
  id: number; x: number; y: number; tx: number; ty: number
  spd: number; dmg: number; enemyId: number; splash: number; color: string
}
interface FloatText { id: number; x: number; y: number; text: string; life: number; color: string }

const TOWER_DEF: Record<TowerType, { name: string; cost: number; color: string; range: number; cd: number; dmg: number; splash: number; slow: number; emoji: string }> = {
  rapid:  { name: 'Súng Nhanh',  cost: 40,  color: '#38bdf8', range: 2.5, cd: 12, dmg: 1,  splash: 0,   slow: 0,   emoji: '🔵' },
  cannon: { name: 'Đại Bác',     cost: 80,  color: '#fb923c', range: 3,   cd: 40, dmg: 6,  splash: 0,   slow: 0,   emoji: '🟠' },
  splash: { name: 'Nổ Diện',     cost: 120, color: '#a78bfa', range: 2,   cd: 50, dmg: 4,  splash: 1.2, slow: 0.4, emoji: '🟣' },
}

const WAVES = [
  { count: 6,  hp: 3,  spd: 0.6, reward: 5  },
  { count: 8,  hp: 5,  spd: 0.7, reward: 6  },
  { count: 10, hp: 8,  spd: 0.75, reward: 7 },
  { count: 12, hp: 12, spd: 0.8, reward: 8  },
  { count: 10, hp: 18, spd: 0.85, reward: 10 },
  { count: 14, hp: 22, spd: 0.9, reward: 11 },
  { count: 8,  hp: 40, spd: 0.7, reward: 20 },
]

let _id = 0
const uid = () => ++_id

export default function TowerDefensePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'dead' | 'won'>('idle')
  const [selectedTower, setSelectedTower] = useState<TowerType>('rapid')
  const [hudData, setHudData] = useState({ gold: 120, lives: 20, wave: 0, maxWave: WAVES.length })

  const gs = useRef({
    gold: 120, lives: 20, wave: 0, waveTimer: 0, spawnIdx: 0, spawnTimer: 0, waveActive: false,
    towers: [] as Tower[], enemies: [] as Enemy[], projectiles: [] as Projectile[], floats: [] as FloatText[],
    frame: 0, selected: 'rapid' as TowerType, phase: 'idle' as string,
    tapHighlight: null as { col: number; row: number; alpha: number } | null,
  })
  const selectedRef = useRef<TowerType>('rapid')

  const pathPixel = useCallback((pathIdx: number): { x: number; y: number } => {
    if (pathIdx >= PATH.length) return { x: PATH[PATH.length - 1][0] * CS + CS / 2, y: PATH[PATH.length - 1][1] * CS + CS / 2 }
    const [c, r] = PATH[pathIdx]
    return { x: c * CS + CS / 2, y: r * CS + CS / 2 }
  }, [])

  const spawnWave = useCallback((waveIdx: number) => {
    const g = gs.current
    g.spawnIdx = 0; g.spawnTimer = 0; g.waveActive = true
    const start = pathPixel(0)
    const wdef = WAVES[waveIdx]
    for (let i = 0; i < wdef.count; i++) {
      g.enemies.push({ id: uid(), pathIdx: 0, x: start.x - i * 60, y: start.y, hp: wdef.hp, maxHp: wdef.hp, spd: wdef.spd, reward: wdef.reward, slow: 0 })
    }
  }, [pathPixel])

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const g = gs.current

    // Background
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H)

    // Grid
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * CS, y = r * CS
        if (isPath(c, r)) {
          ctx.fillStyle = '#334155'
          ctx.fillRect(x + 1, y + 1, CS - 2, CS - 2)
          // path arrows
          ctx.fillStyle = '#475569'
          ctx.font = '10px sans-serif'
          ctx.textAlign = 'center'
        } else {
          ctx.fillStyle = '#1e293b'
          ctx.fillRect(x + 1, y + 1, CS - 2, CS - 2)
          // Grass texture
          ctx.fillStyle = '#1a2e1a'
          ctx.fillRect(x + 2, y + 2, CS - 4, CS - 4)
        }
      }
    }

    // Path markers
    const [sc, sr] = PATH[0]; const [ec, er] = PATH[PATH.length - 1]
    ctx.fillStyle = '#22c55e'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('▶', sc * CS + CS / 2, sr * CS + CS / 2 + 5)
    ctx.fillStyle = '#ef4444'
    ctx.fillText('⚑', ec * CS + CS / 2, er * CS + CS / 2 + 5)

    // Tap-down highlight
    if (g.tapHighlight && g.tapHighlight.alpha > 0) {
      const { col, row, alpha } = g.tapHighlight
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.28})`
      ctx.beginPath(); ctx.roundRect(col * CS + 2, row * CS + 2, CS - 4, CS - 4, 4); ctx.fill()
    }

    // Towers
    for (const t of g.towers) {
      const x = t.col * CS + CS / 2, y = t.row * CS + CS / 2
      const def = TOWER_DEF[t.type]
      // base
      ctx.fillStyle = def.color
      ctx.beginPath(); ctx.arc(x, y, CS / 2 - 3, 0, Math.PI * 2); ctx.fill()
      // inner
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(x, y, CS / 2 - 8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = def.color
      ctx.font = '14px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(def.emoji.includes('🔵') ? '⚡' : t.type === 'cannon' ? '💣' : '💫', x, y + 5)
    }

    // Projectiles
    for (const p of g.projectiles) {
      ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(p.x, p.y, p.splash > 0 ? 5 : 3, 0, Math.PI * 2); ctx.fill()
    }

    // Enemies
    for (const e of g.enemies) {
      if (e.pathIdx >= PATH.length) continue
      const bw = CS - 6, bh = 10
      const bx = e.x - bw / 2, by = e.y - CS / 2 - 4
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 10, 8, 3, 0, 0, Math.PI * 2); ctx.fill()
      // body
      ctx.fillStyle = e.slow > 0 ? '#a78bfa' : '#ef4444'
      ctx.beginPath(); ctx.arc(e.x, e.y, 10, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('👾', e.x, e.y + 4)
      // HP bar
      ctx.fillStyle = '#1e293b'; ctx.fillRect(bx, by, bw, bh)
      ctx.fillStyle = e.hp / e.maxHp > 0.5 ? '#22c55e' : e.hp / e.maxHp > 0.25 ? '#f59e0b' : '#ef4444'
      ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), bh)
    }

    // Float texts
    for (const f of g.floats) {
      ctx.globalAlpha = f.life
      ctx.fillStyle = f.color; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(f.text, f.x, f.y)
      ctx.globalAlpha = 1
    }

    // HUD panel
    const hudY = GRID_H
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, hudY, W, HUD_H)
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, hudY); ctx.lineTo(W, hudY); ctx.stroke()

    // HUD text
    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`💰 ${g.gold}`, 8, hudY + 20)
    ctx.fillStyle = '#ef4444'
    ctx.fillText(`❤️ ${g.lives}`, 80, hudY + 20)
    ctx.fillStyle = '#94a3b8'
    ctx.fillText(`Đợt ${g.wave + 1}/${WAVES.length}`, 160, hudY + 20)

    // Tower selection buttons
    const btns = Object.entries(TOWER_DEF) as [TowerType, typeof TOWER_DEF[TowerType]][]
    const bw2 = 108
    btns.forEach(([type, def], i) => {
      const bx = i * bw2, by2 = hudY + 30
      const active = g.selected === type
      ctx.fillStyle = active ? def.color + '33' : '#1e293b'
      ctx.strokeStyle = active ? def.color : '#334155'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(bx + 4, by2, bw2 - 8, 50, 8); ctx.fill(); ctx.stroke()
      ctx.fillStyle = active ? def.color : '#94a3b8'
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(def.emoji + ' ' + def.name, bx + bw2 / 2, by2 + 16)
      ctx.fillStyle = '#fbbf24'; ctx.font = '11px sans-serif'
      ctx.fillText(`💰${def.cost}`, bx + bw2 / 2, by2 + 30)
      ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif'
      ctx.fillText(`R:${def.range} D:${def.dmg}`, bx + bw2 / 2, by2 + 44)
    })
  }, [])

  const tick = useCallback(() => {
    const g = gs.current
    if (g.phase !== 'playing') { draw(); return }
    g.frame++

    // Spawn enemies with spacing
    if (g.waveActive && g.wave < WAVES.length) {
      const wdef = WAVES[g.wave]
      // enemies are pre-spawned but offset on path
    }

    // Move enemies
    const toRemove = new Set<number>()
    for (const e of g.enemies) {
      if (e.slow > 0) e.slow -= 0.016
      const spd = e.slow > 0 ? e.spd * 0.4 : e.spd
      const target = pathPixel(e.pathIdx + 1)
      if (!target) { g.lives -= 1; toRemove.add(e.id); continue }
      const dx = target.x - e.x, dy = target.y - e.y
      const dist = Math.hypot(dx, dy)
      if (dist < spd * 2) {
        e.pathIdx++
        if (e.pathIdx >= PATH.length - 1) { g.lives -= 1; toRemove.add(e.id) }
      } else {
        e.x += (dx / dist) * spd * 2
        e.y += (dy / dist) * spd * 2
      }
    }
    g.enemies = g.enemies.filter(e => !toRemove.has(e.id))

    // Tower shooting
    for (const t of g.towers) {
      t.cooldown = Math.max(0, t.cooldown - 1)
      if (t.cooldown > 0) continue
      const def = TOWER_DEF[t.type]
      const tx = t.col * CS + CS / 2, ty = t.row * CS + CS / 2
      let best: Enemy | null = null; let bestDist = def.range * CS * 2
      for (const e of g.enemies) {
        if (e.pathIdx >= PATH.length) continue
        const d = Math.hypot(e.x - tx, e.y - ty)
        if (d < bestDist) { best = e; bestDist = d }
      }
      if (best) {
        t.cooldown = def.cd
        g.projectiles.push({ id: uid(), x: tx, y: ty, tx: best.x, ty: best.y, spd: 8, dmg: def.dmg, enemyId: best.id, splash: def.splash, color: def.color })
      }
    }

    // Move projectiles
    const hitProj = new Set<number>()
    for (const p of g.projectiles) {
      const dx = p.tx - p.x, dy = p.ty - p.y
      const dist = Math.hypot(dx, dy)
      if (dist < p.spd) {
        // hit
        hitProj.add(p.id)
        if (p.splash > 0) {
          for (const e of g.enemies) {
            const d = Math.hypot(e.x - p.tx, e.y - p.ty)
            if (d < p.splash * CS) {
              e.hp -= p.dmg; e.slow = 1.5
              g.floats.push({ id: uid(), x: e.x, y: e.y - 16, text: `-${p.dmg}`, life: 1, color: '#a78bfa' })
            }
          }
        } else {
          const target = g.enemies.find(e => e.id === p.enemyId)
          if (target) {
            target.hp -= p.dmg
            g.floats.push({ id: uid(), x: target.x, y: target.y - 16, text: `-${p.dmg}`, life: 1, color: '#fbbf24' })
          }
        }
        // remove dead enemies
        const killed = g.enemies.filter(e => e.hp <= 0)
        for (const k of killed) { g.gold += k.reward; g.floats.push({ id: uid(), x: k.x, y: k.y - 20, text: `+${k.reward}💰`, life: 1, color: '#22c55e' }) }
        g.enemies = g.enemies.filter(e => e.hp > 0)
      } else {
        p.x += (dx / dist) * p.spd; p.y += (dy / dist) * p.spd
        // update target to current enemy pos
        const e = g.enemies.find(en => en.id === p.enemyId)
        if (e) { p.tx = e.x; p.ty = e.y }
      }
    }
    g.projectiles = g.projectiles.filter(p => !hitProj.has(p.id))

    // Float texts
    for (const f of g.floats) { f.y -= 0.5; f.life -= 0.03 }
    g.floats = g.floats.filter(f => f.life > 0)

    // Fade tap highlight
    if (g.tapHighlight) {
      g.tapHighlight.alpha -= 0.06
      if (g.tapHighlight.alpha <= 0) g.tapHighlight = null
    }

    // Wave management
    if (g.wave < WAVES.length && !g.waveActive) {
      g.waveTimer--
      if (g.waveTimer <= 0) { spawnWave(g.wave); g.waveActive = true }
    }
    if (g.waveActive && g.enemies.length === 0) {
      g.waveActive = false
      g.wave++
      if (g.wave >= WAVES.length) {
        g.phase = 'won'; setPhase('won')
        posthog.capture('game_won', { game: 'phong-thu-thanh-tri' })
        return
      }
      g.waveTimer = 180 // 3 sec between waves
    }

    // Check lives
    if (g.lives <= 0) {
      g.phase = 'dead'; setPhase('dead')
      posthog.capture('game_over', { game: 'phong-thu-thanh-tri', wave: g.wave })
    }

    setHudData({ gold: g.gold, lives: g.lives, wave: g.wave, maxWave: WAVES.length })
    draw()
    rafRef.current = requestAnimationFrame(tick)
  }, [draw, spawnWave, pathPixel])

  const startGame = useCallback(() => {
    const g = gs.current
    Object.assign(g, { gold: 120, lives: 20, wave: 0, waveTimer: 120, spawnIdx: 0, spawnTimer: 0, waveActive: false, towers: [], enemies: [], projectiles: [], floats: [], frame: 0, phase: 'playing' })
    setPhase('playing')
    setHudData({ gold: 120, lives: 20, wave: 0, maxWave: WAVES.length })
    posthog.capture('game_started', { game: 'phong-thu-thanh-tri' })
    spawnWave(0)
    g.waveActive = true
    rafRef.current = requestAnimationFrame(tick)
  }, [tick, spawnWave])

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const g = gs.current
    if (g.phase !== 'playing') return
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const scaleX = W / rect.width, scaleY = H / rect.height
    const t = e.touches[0]
    const cx = (t.clientX - rect.left) * scaleX
    const cy = (t.clientY - rect.top) * scaleY
    if (cy < GRID_H) {
      const col = Math.floor(cx / CS), row = Math.floor(cy / CS)
      if (!isPath(col, row) && !g.towers.some(tw => tw.col === col && tw.row === row)) {
        g.tapHighlight = { col, row, alpha: 0.8 }
      }
    }
  }, [])

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const g = gs.current
    if (g.phase !== 'playing') return
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const scaleX = W / rect.width, scaleY = H / rect.height
    const cx = (e.clientX - rect.left) * scaleX
    const cy = (e.clientY - rect.top) * scaleY
    if (cy >= GRID_H) {
      // HUD click — select tower
      const bw = W / 3
      const idx = Math.floor(cx / bw)
      const types: TowerType[] = ['rapid', 'cannon', 'splash']
      if (idx >= 0 && idx < 3) { g.selected = types[idx]; setSelectedTower(types[idx]) }
      return
    }
    const col = Math.floor(cx / CS), row = Math.floor(cy / CS)
    if (isPath(col, row)) return
    if (g.towers.some(t => t.col === col && t.row === row)) return
    const def = TOWER_DEF[g.selected]
    if (g.gold < def.cost) { g.floats.push({ id: uid(), x: cx, y: cy, text: '💰 Không đủ vàng!', life: 1.5, color: '#ef4444' }); return }
    g.gold -= def.cost
    g.towers.push({ id: uid(), col, row, type: g.selected, cooldown: 0, level: 1 })
  }, [])

  const handleTouchClick = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const g = gs.current
    if (g.phase !== 'playing') return
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const scaleX = W / rect.width, scaleY = H / rect.height
    const t = e.changedTouches[0]
    const cx = (t.clientX - rect.left) * scaleX
    const cy = (t.clientY - rect.top) * scaleY
    if (cy >= GRID_H) {
      const bw = W / 3; const idx = Math.floor(cx / bw)
      const types: TowerType[] = ['rapid', 'cannon', 'splash']
      if (idx >= 0 && idx < 3) { g.selected = types[idx]; setSelectedTower(types[idx]) }
      return
    }
    const col = Math.floor(cx / CS), row = Math.floor(cy / CS)
    if (isPath(col, row)) return
    if (g.towers.some(t2 => t2.col === col && t2.row === row)) return
    const def = TOWER_DEF[g.selected]
    if (g.gold < def.cost) { g.floats.push({ id: uid(), x: cx, y: cy, text: '💰 Không đủ vàng!', life: 1.5, color: '#ef4444' }); return }
    g.gold -= def.cost
    g.towers.push({ id: uid(), col, row, type: g.selected, cooldown: 0, level: 1 })
  }, [])

  useEffect(() => {
    draw()
    return () => { cancelAnimationFrame(rafRef.current) }
  }, [draw])

  return (
    <div className="min-h-dvh bg-gray-950 flex flex-col items-center">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/game" className="text-gray-400 hover:text-white"><ChevronLeft size={22} /></Link>
          <h1 className="text-white font-bold text-lg flex-1">🏰 Phòng Thủ Thành Trì</h1>
        </div>

        {/* Canvas */}
        <div className="relative px-2">
          <canvas
            ref={canvasRef} width={W} height={H}
            className="w-full rounded-2xl border border-gray-800 touch-none"
            onClick={handleCanvasClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={e => { e.preventDefault(); handleTouchClick(e) }}
          />

          {/* Overlays */}
          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-2xl">
              <div className="text-6xl mb-4">🏰</div>
              <h2 className="text-white text-2xl font-black mb-2">Phòng Thủ Thành Trì</h2>
              <p className="text-gray-300 text-sm text-center px-8 mb-6">
                Đặt tháp để ngăn quái vật qua đường — 7 đợt tấn công!
              </p>
              <div className="text-gray-400 text-xs text-center mb-6 space-y-1">
                <p>🔵 Súng Nhanh: bắn nhanh, damage thấp</p>
                <p>🟠 Đại Bác: bắn chậm, damage cao</p>
                <p>🟣 Nổ Diện: bắn chậm damage AoE + làm chậm</p>
              </div>
              <button onClick={startGame} className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-8 py-3 rounded-2xl text-lg transition-colors">
                Bắt Đầu
              </button>
            </div>
          )}

          {phase === 'dead' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 rounded-2xl">
              <div className="text-5xl mb-3">💀</div>
              <h2 className="text-red-400 text-2xl font-black mb-1">Thất Bại!</h2>
              <p className="text-gray-300 text-sm mb-1">Đợt {hudData.wave + 1}/{WAVES.length}</p>
              <button onClick={startGame} className="mt-4 bg-red-500 hover:bg-red-400 text-white font-bold px-8 py-3 rounded-2xl text-lg transition-colors">
                Thử Lại
              </button>
            </div>
          )}

          {phase === 'won' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 rounded-2xl">
              <div className="text-5xl mb-3">🏆</div>
              <h2 className="text-yellow-400 text-2xl font-black mb-1">Chiến Thắng!</h2>
              <p className="text-gray-300 text-sm mb-1">Phòng thủ hoàn hảo 7 đợt!</p>
              <button onClick={startGame} className="mt-4 bg-yellow-500 hover:bg-yellow-400 text-white font-bold px-8 py-3 rounded-2xl text-lg transition-colors">
                Chơi Lại
              </button>
            </div>
          )}
        </div>

        <p className="text-gray-500 text-xs text-center mt-3 pb-4">Chạm ô trống để đặt tháp · Chạm HUD để đổi loại tháp</p>
      </div>
    </div>
  )
}
