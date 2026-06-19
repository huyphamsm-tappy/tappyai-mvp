'use client'

import { useEffect, useRef } from 'react'
import posthog from 'posthog-js'

export type GamePhase = 'start' | 'playing' | 'gameover' | 'victory'

// ── Geometry ─────────────────────────────────────────────────────────────────
const GW = 480     // game logical width
const GH = 480     // game logical height
const GROUND = 380 // y of ground surface
const GRAV = 0.55
const JUMP = -13
const SPD = 4.5
const LW = 4800    // level width

// ── Types ─────────────────────────────────────────────────────────────────────
interface Player {
  x: number; y: number; vx: number; vy: number
  w: number; h: number; hp: number; maxHp: number
  inv: number; facing: 1 | -1
  shootCD: number; animF: number; animT: number; onGround: boolean
}
interface Bullet { x: number; y: number; vx: number; vy: number; ally: boolean; alive: boolean }
interface Enemy {
  kind: 'grunt' | 'turret'; x: number; y: number; w: number; h: number
  vx: number; hp: number; maxHp: number; alive: boolean
  shootCD: number; facing: 1 | -1; animF: number; animT: number
}
interface Plat { x: number; y: number; w: number; h: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; ml: number; col: string; r: number }

// ── Helpers ───────────────────────────────────────────────────────────────────
const overlap = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) =>
  ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by

function burst(pts: Particle[], x: number, y: number, col: string, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.6
    const s = 1.5 + Math.random() * 3
    pts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 30 + Math.random() * 20, ml: 50, col, r: 3 + Math.random() * 3 })
  }
}

// ── Level ─────────────────────────────────────────────────────────────────────
function mkLevel() {
  const plats: Plat[] = [
    { x: 0, y: GROUND + 40, w: LW, h: 80 },
    { x: 300, y: 305, w: 160, h: 18 }, { x: 600, y: 265, w: 140, h: 18 },
    { x: 900, y: 315, w: 120, h: 18 }, { x: 1200, y: 275, w: 180, h: 18 },
    { x: 1600, y: 305, w: 130, h: 18 }, { x: 1900, y: 255, w: 160, h: 18 },
    { x: 2200, y: 315, w: 140, h: 18 }, { x: 2600, y: 285, w: 200, h: 18 },
    { x: 2900, y: 245, w: 150, h: 18 }, { x: 3200, y: 305, w: 130, h: 18 },
    { x: 3500, y: 265, w: 170, h: 18 }, { x: 3800, y: 315, w: 160, h: 18 },
    { x: 4100, y: 275, w: 200, h: 18 },
  ]
  const G = GROUND + 8
  const enemies: Enemy[] = [
    { kind: 'grunt', x: 500, y: G, w: 28, h: 36, vx: -1.2, hp: 2, maxHp: 2, alive: true, shootCD: 0, facing: -1, animF: 0, animT: 0 },
    { kind: 'grunt', x: 700, y: G, w: 28, h: 36, vx: -1.2, hp: 2, maxHp: 2, alive: true, shootCD: 0, facing: -1, animF: 0, animT: 0 },
    { kind: 'turret', x: 820, y: GROUND + 2, w: 30, h: 38, vx: 0, hp: 3, maxHp: 3, alive: true, shootCD: 120, facing: -1, animF: 0, animT: 0 },
    { kind: 'grunt', x: 1000, y: G, w: 28, h: 36, vx: -1.3, hp: 2, maxHp: 2, alive: true, shootCD: 0, facing: -1, animF: 0, animT: 0 },
    { kind: 'grunt', x: 1100, y: 270, w: 28, h: 36, vx: -1.3, hp: 2, maxHp: 2, alive: true, shootCD: 0, facing: -1, animF: 0, animT: 0 },
    { kind: 'turret', x: 1350, y: GROUND + 2, w: 30, h: 38, vx: 0, hp: 3, maxHp: 3, alive: true, shootCD: 100, facing: -1, animF: 0, animT: 0 },
    { kind: 'grunt', x: 1500, y: G, w: 28, h: 36, vx: -1.4, hp: 2, maxHp: 2, alive: true, shootCD: 0, facing: -1, animF: 0, animT: 0 },
    { kind: 'grunt', x: 1750, y: G, w: 28, h: 36, vx: -1.4, hp: 2, maxHp: 2, alive: true, shootCD: 0, facing: -1, animF: 0, animT: 0 },
    { kind: 'turret', x: 1950, y: 215, w: 30, h: 38, vx: 0, hp: 3, maxHp: 3, alive: true, shootCD: 90, facing: -1, animF: 0, animT: 0 },
    { kind: 'grunt', x: 2100, y: G, w: 28, h: 36, vx: -1.5, hp: 2, maxHp: 2, alive: true, shootCD: 0, facing: -1, animF: 0, animT: 0 },
    { kind: 'grunt', x: 2300, y: G, w: 28, h: 36, vx: -1.5, hp: 2, maxHp: 2, alive: true, shootCD: 0, facing: -1, animF: 0, animT: 0 },
    { kind: 'turret', x: 2500, y: GROUND + 2, w: 30, h: 38, vx: 0, hp: 3, maxHp: 3, alive: true, shootCD: 80, facing: -1, animF: 0, animT: 0 },
    { kind: 'grunt', x: 2700, y: G, w: 28, h: 36, vx: -1.6, hp: 2, maxHp: 2, alive: true, shootCD: 0, facing: -1, animF: 0, animT: 0 },
    { kind: 'grunt', x: 2850, y: 205, w: 28, h: 36, vx: -1.6, hp: 2, maxHp: 2, alive: true, shootCD: 0, facing: -1, animF: 0, animT: 0 },
    { kind: 'turret', x: 3100, y: GROUND + 2, w: 30, h: 38, vx: 0, hp: 3, maxHp: 3, alive: true, shootCD: 75, facing: -1, animF: 0, animT: 0 },
    { kind: 'grunt', x: 3300, y: G, w: 28, h: 36, vx: -1.8, hp: 2, maxHp: 2, alive: true, shootCD: 0, facing: -1, animF: 0, animT: 0 },
    { kind: 'grunt', x: 3450, y: G, w: 28, h: 36, vx: -1.8, hp: 2, maxHp: 2, alive: true, shootCD: 0, facing: -1, animF: 0, animT: 0 },
    { kind: 'turret', x: 3700, y: 275, w: 30, h: 38, vx: 0, hp: 3, maxHp: 3, alive: true, shootCD: 70, facing: -1, animF: 0, animT: 0 },
    { kind: 'grunt', x: 3900, y: G, w: 28, h: 36, vx: -2, hp: 2, maxHp: 2, alive: true, shootCD: 0, facing: -1, animF: 0, animT: 0 },
    { kind: 'turret', x: 4100, y: GROUND + 2, w: 30, h: 38, vx: 0, hp: 3, maxHp: 3, alive: true, shootCD: 65, facing: -1, animF: 0, animT: 0 },
    { kind: 'grunt', x: 4350, y: G, w: 28, h: 36, vx: -1.5, hp: 2, maxHp: 2, alive: true, shootCD: 0, facing: -1, animF: 0, animT: 0 },
    { kind: 'turret', x: 4500, y: GROUND + 2, w: 40, h: 50, vx: 0, hp: 10, maxHp: 10, alive: true, shootCD: 45, facing: -1, animF: 0, animT: 0 },
    { kind: 'grunt', x: 4540, y: G, w: 28, h: 36, vx: -2, hp: 3, maxHp: 3, alive: true, shootCD: 0, facing: -1, animF: 0, animT: 0 },
    { kind: 'grunt', x: 4640, y: G, w: 28, h: 36, vx: -2, hp: 3, maxHp: 3, alive: true, shootCD: 0, facing: -1, animF: 0, animT: 0 },
  ]
  return { plats, enemies, endX: 4700 }
}

// ── Draw helpers ──────────────────────────────────────────────────────────────
function drawPlayer(c: CanvasRenderingContext2D, p: Player, cx: number) {
  if (p.inv > 0 && Math.floor(p.inv / 4) % 2) return
  const x = p.x - cx, y = p.y
  // legs
  const lo = p.onGround ? Math.sin(p.animF * 0.4) * 4 : 0
  c.fillStyle = '#166534'; c.fillRect(x + 4, y + 34, 10, 12 + lo); c.fillRect(x + 14, y + 34, 10, 12 - lo)
  c.fillStyle = '#92400e'; c.fillRect(x + 2, y + 44 + lo, 12, 5); c.fillRect(x + 14, y + 44 - lo, 12, 5)
  // body
  c.fillStyle = '#22c55e'; c.fillRect(x + 4, y + 14, 20, 22)
  // head
  c.fillStyle = '#fbbf24'; c.beginPath(); c.arc(x + 14, y + 9, 9, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#15803d'; c.beginPath(); c.arc(x + 14, y + 7, 9, Math.PI, 0); c.fill()
  c.fillRect(x + 5, y + 6, 18, 5)
  c.fillStyle = '#1e293b'; c.beginPath(); c.arc(x + 14 + (p.facing === 1 ? 4 : -2), y + 9, 2, 0, Math.PI * 2); c.fill()
  // gun
  c.fillStyle = '#374151'
  if (p.facing === 1) c.fillRect(x + 20, y + 18, 12, 5)
  else c.fillRect(x - 4, y + 18, 12, 5)
}

function drawGrunt(c: CanvasRenderingContext2D, e: Enemy, cx: number) {
  const x = e.x - cx, y = e.y
  const lo = Math.sin(e.animF * 0.5) * 3
  c.fillStyle = '#991b1b'; c.fillRect(x + 4, y + 22, 10, 10 + lo); c.fillRect(x + 14, y + 22, 10, 10 - lo)
  c.fillStyle = '#7f1d1d'; c.fillRect(x + 2, y + 30 + lo, 12, 5); c.fillRect(x + 14, y + 30 - lo, 12, 5)
  c.fillStyle = '#dc2626'; c.fillRect(x + 4, y + 10, 20, 14)
  c.fillStyle = '#fca5a5'; c.beginPath(); c.arc(x + 14, y + 6, 8, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#7f1d1d'; c.beginPath(); c.arc(x + 14, y + 4, 8, Math.PI, 0); c.fill()
  c.fillRect(x + 6, y + 3, 16, 5)
  c.fillStyle = '#1e293b'; c.beginPath(); c.arc(x + 14 + (e.facing === 1 ? 3 : -3), y + 6, 2, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#374151'
  if (e.facing === -1) c.fillRect(x - 4, y + 12, 10, 4)
  else c.fillRect(x + 22, y + 12, 10, 4)
}

function drawTurret(c: CanvasRenderingContext2D, e: Enemy, cx: number) {
  const x = e.x - cx, y = e.y
  const boss = e.maxHp > 5
  const cx2 = x + e.w / 2
  c.fillStyle = boss ? '#78350f' : '#374151'; c.fillRect(x + 3, y + e.h * 0.5, e.w - 6, e.h * 0.5)
  c.fillStyle = boss ? '#b45309' : '#6b7280'; c.beginPath(); c.arc(cx2, y + e.h * 0.42, boss ? 17 : 13, 0, Math.PI * 2); c.fill()
  c.fillStyle = boss ? '#92400e' : '#1f2937'
  c.fillRect(e.facing === -1 ? x - (boss ? 14 : 9) : x + e.w, y + e.h * 0.35, boss ? 14 : 9, boss ? 9 : 7)
  c.fillStyle = boss ? '#fbbf24' : '#ef4444'; c.beginPath(); c.arc(cx2 - (boss ? 6 : 4), y + e.h * 0.42, boss ? 5 : 4, 0, Math.PI * 2); c.fill()
  if (boss) {
    c.fillStyle = '#fbbf24'; c.font = 'bold 9px sans-serif'; c.textAlign = 'center'
    c.fillText('BOSS', cx2, y - 8)
    c.fillStyle = '#1f2937'; c.fillRect(x - 5, y - 22, e.w + 10, 8)
    c.fillStyle = '#ef4444'; c.fillRect(x - 5, y - 22, (e.w + 10) * e.hp / e.maxHp, 8)
  }
}

function drawBG(c: CanvasRenderingContext2D, cx: number) {
  const sky = c.createLinearGradient(0, 0, 0, GH * 0.75)
  sky.addColorStop(0, '#0f172a'); sky.addColorStop(0.5, '#1e3a5f'); sky.addColorStop(1, '#0e4d3a')
  c.fillStyle = sky; c.fillRect(0, 0, GW, GH)
  // stars
  c.fillStyle = 'rgba(255,255,255,0.8)'
  const sp = (cx * 0.04) % GW
  for (const [sx, sy] of [[80,25],[200,45],[350,15],[430,55],[55,75],[280,10],[410,40],[140,65],[370,30],[240,50]]) {
    c.beginPath(); c.arc(((sx - sp + GW * 3) % GW), sy, 1.2, 0, Math.PI * 2); c.fill()
  }
  // far mountains
  c.fillStyle = '#1a3a2a'
  const mo = (cx * 0.18) % (GW * 2)
  for (const [mx, mh, mw] of [[0,80,200],[180,105,220],[380,88,180],[560,110,240],[760,82,200],[950,95,220]]) {
    const rx = ((mx - mo + GW * 4) % (GW * 2)) - GW * 0.5
    c.beginPath(); c.moveTo(rx, GROUND + 40); c.lineTo(rx + mw / 2, GROUND + 40 - mh); c.lineTo(rx + mw, GROUND + 40); c.fill()
  }
  // trees
  const to = (cx * 0.5) % (GW * 2)
  for (const tx of [50,160,290,420,540,660,780]) {
    const rx = ((tx - to + GW * 4) % (GW * 2)) - GW * 0.3
    c.fillStyle = '#5c3d1e'; c.fillRect(rx + 8, GROUND + 5, 8, 30)
    c.fillStyle = '#14532d'; c.beginPath(); c.arc(rx + 12, GROUND - 4, 20, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#166534'; c.beginPath(); c.arc(rx + 12, GROUND - 15, 14, 0, Math.PI * 2); c.fill()
  }
  // ground
  const gg = c.createLinearGradient(0, GROUND + 40, 0, GH)
  gg.addColorStop(0, '#365314'); gg.addColorStop(0.3, '#3f6212'); gg.addColorStop(1, '#1a2e05')
  c.fillStyle = gg; c.fillRect(0, GROUND + 40, GW, GH - GROUND - 40)
  c.fillStyle = '#4ade80'; c.fillRect(0, GROUND + 38, GW, 5)
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props { playing: boolean; onEnd: (phase: GamePhase, score: number) => void; runKey: number }

export default function GameCanvas({ playing, onEnd, runKey }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!playing) return
    const canvas = ref.current
    if (!canvas) return
    const c = canvas.getContext('2d')
    if (!c) return

    posthog.capture('game_started', { game: 'biet-kich-sam-set' })

    const { plats, enemies, endX } = mkLevel()
    const bullets: Bullet[] = []
    const particles: Particle[] = []
    let score = 0
    let camX = 0
    let alive = true

    const P: Player = { x: 80, y: GROUND - 30, vx: 0, vy: 0, w: 28, h: 48, hp: 5, maxHp: 5, inv: 0, facing: 1, shootCD: 0, animF: 0, animT: 0, onGround: false }

    const keys: Record<string, boolean> = {}
    const touch = { left: false, right: false, jump: false, shoot: false }

    const kd = (e: KeyboardEvent) => { keys[e.code] = true; if (['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault() }
    const ku = (e: KeyboardEvent) => { keys[e.code] = false }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)

    const btnMap: [string, keyof typeof touch][] = [['btn-left','left'],['btn-right','right'],['btn-jump','jump'],['btn-shoot','shoot']]
    const cleanFns: (() => void)[] = []
    for (const [id, k] of btnMap) {
      const el = document.getElementById(id)
      if (!el) continue
      const on = (e: Event) => { e.preventDefault(); touch[k] = true }
      const off = (e: Event) => { e.preventDefault(); touch[k] = false }
      el.addEventListener('touchstart', on, { passive: false }); el.addEventListener('touchend', off, { passive: false })
      el.addEventListener('mousedown', on); el.addEventListener('mouseup', off)
      cleanFns.push(() => { el.removeEventListener('touchstart', on); el.removeEventListener('touchend', off); el.removeEventListener('mousedown', on); el.removeEventListener('mouseup', off) })
    }

    const left = () => keys['ArrowLeft'] || keys['KeyA'] || touch.left
    const right = () => keys['ArrowRight'] || keys['KeyD'] || touch.right
    const jump = () => keys['ArrowUp'] || keys['KeyW'] || keys['Space'] || touch.jump
    const shoot = () => keys['KeyZ'] || keys['KeyX'] || keys['ControlLeft'] || touch.shoot

    let jumpHeld = false, shootHeld = false
    let raf = 0

    const end = (phase: GamePhase) => {
      if (!alive) return
      alive = false
      posthog.capture(phase === 'victory' ? 'game_won' : 'game_over', { game: 'biet-kich-sam-set', score })
      onEnd(phase, score)
    }

    const tick = () => {
      if (!alive) return

      // ── Input ──────────────────────────────────────────────────────────────
      if (left()) { P.vx = -SPD; P.facing = -1 } else if (right()) { P.vx = SPD; P.facing = 1 } else P.vx *= 0.8
      if (jump() && !jumpHeld && P.onGround) { P.vy = JUMP; jumpHeld = true }
      if (!jump()) jumpHeld = false
      if (shoot() && !shootHeld && P.shootCD <= 0) {
        bullets.push({ x: P.x + (P.facing === 1 ? P.w + 2 : -10), y: P.y + 18, vx: 13 * P.facing, vy: 0, ally: true, alive: true })
        P.shootCD = 13; shootHeld = true
      }
      if (!shoot()) shootHeld = false
      if (P.shootCD > 0) P.shootCD--

      // ── Physics ────────────────────────────────────────────────────────────
      P.vy += GRAV; P.x += P.vx; P.y += P.vy
      if (P.x < 0) P.x = 0
      P.onGround = false
      for (const pl of plats) {
        if (P.x + P.w > pl.x && P.x < pl.x + pl.w && P.y + P.h > pl.y && P.y + P.h < pl.y + pl.h + P.vy + 2 && P.vy >= 0) {
          P.y = pl.y - P.h; P.vy = 0; P.onGround = true
        }
      }
      if (P.y > GH + 60) {
        P.hp--
        if (P.hp <= 0) { end('gameover'); return }
        P.x = Math.max(80, camX + 60); P.y = GROUND - 50; P.vy = 0; P.inv = 120
      }
      P.animT++; if (P.animT > 6) { P.animT = 0; P.animF++ }
      if (P.inv > 0) P.inv--
      camX = Math.max(0, Math.min(P.x - GW * 0.35, LW - GW))

      // ── Bullets ────────────────────────────────────────────────────────────
      for (const b of bullets) {
        b.x += b.vx; b.y += b.vy
        if (b.x < camX - 60 || b.x > camX + GW + 60 || b.y < -60 || b.y > GH + 60) { b.alive = false; continue }
        for (const pl of plats) {
          if (b.ally && overlap(b.x - 3, b.y - 3, 6, 6, pl.x, pl.y, pl.w, pl.h)) { b.alive = false; burst(particles, b.x, b.y, '#86efac', 4) }
        }
      }

      // ── Enemies ────────────────────────────────────────────────────────────
      for (const e of enemies) {
        if (!e.alive) continue
        const dist = Math.abs(e.x - P.x)
        if (dist > GW * 1.6) continue

        if (e.kind === 'grunt') {
          e.x += e.vx; e.facing = e.vx < 0 ? -1 : 1
          let grnd = false
          for (const pl of plats) {
            if (e.x + e.w > pl.x && e.x < pl.x + pl.w && e.y + e.h >= pl.y && e.y + e.h <= pl.y + 12) grnd = true
          }
          if (!grnd || e.x < 5 || e.x > LW - 5) e.vx *= -1
          e.facing = P.x < e.x ? -1 : 1
          e.animT++; if (e.animT > 6) { e.animT = 0; e.animF++ }
        } else {
          e.facing = P.x < e.x ? -1 : 1
          e.shootCD--
          if (e.shootCD <= 0 && dist < GW * 1.2) {
            const boss = e.maxHp > 5
            const s = boss ? 5.5 : 4
            bullets.push({ x: e.x + (e.facing === -1 ? -5 : e.w + 5), y: e.y + 17, vx: s * e.facing, vy: 0, ally: false, alive: true })
            e.shootCD = boss ? 38 : 78
          }
        }

        // ally bullets hit enemy
        for (const b of bullets) {
          if (!b.ally || !b.alive) continue
          if (overlap(b.x - 4, b.y - 3, 8, 6, e.x, e.y, e.w, e.h)) {
            b.alive = false; e.hp--; burst(particles, b.x, b.y, '#fca5a5', 6)
            if (e.hp <= 0) { e.alive = false; score += e.kind === 'turret' ? (e.maxHp > 5 ? 500 : 200) : 100; burst(particles, e.x + e.w / 2, e.y + e.h / 2, '#fbbf24', 14) }
          }
        }

        // enemy bullets / contact hit player
        if (P.inv <= 0) {
          for (const b of bullets) {
            if (b.ally || !b.alive) continue
            if (overlap(b.x - 3, b.y - 3, 6, 6, P.x + 4, P.y + 4, P.w - 8, P.h - 8)) { b.alive = false; P.hp--; P.inv = 90; burst(particles, P.x + 14, P.y + 24, '#86efac', 8); if (P.hp <= 0) { end('gameover'); return } }
          }
          if (overlap(P.x + 4, P.y + 4, P.w - 8, P.h - 8, e.x, e.y, e.w, e.h)) { P.hp--; P.inv = 90; burst(particles, P.x + 14, P.y + 24, '#86efac', 8); if (P.hp <= 0) { end('gameover'); return } }
        }
      }

      bullets.splice(0, bullets.length, ...bullets.filter(b => b.alive))
      for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life-- }
      particles.splice(0, particles.length, ...particles.filter(p => p.life > 0))

      if (P.x >= endX) { score += 1000; end('victory'); return }

      // ── Draw ───────────────────────────────────────────────────────────────
      drawBG(c, camX)

      // platforms
      for (const pl of plats) {
        if (pl.x + pl.w < camX - 20 || pl.x > camX + GW + 20 || pl.h >= 50) continue
        const px = pl.x - camX
        c.fillStyle = '#166534'; c.fillRect(px, pl.y, pl.w, pl.h)
        c.fillStyle = '#4ade80'; c.fillRect(px, pl.y, pl.w, 4)
      }

      // end flag
      if (endX - camX > -60 && endX - camX < GW + 60) {
        const fx = endX - camX
        c.fillStyle = '#fbbf24'; c.fillRect(fx - 2, GROUND - 60, 5, 70)
        c.fillStyle = '#f59e0b'; c.fillRect(fx + 3, GROUND - 60, 26, 18)
        c.fillStyle = '#fde68a'; c.font = 'bold 9px sans-serif'; c.textAlign = 'left'; c.fillText('END', fx + 5, GROUND - 47)
      }

      // enemies
      for (const e of enemies) {
        if (!e.alive || e.x + e.w < camX - 20 || e.x > camX + GW + 20) continue
        if (e.kind === 'grunt') drawGrunt(c, e, camX)
        else drawTurret(c, e, camX)
      }

      // bullets
      for (const b of bullets) {
        c.fillStyle = b.ally ? '#86efac' : '#fca5a5'
        c.beginPath(); c.ellipse(b.x - camX, b.y, 6, 3, 0, 0, Math.PI * 2); c.fill()
        c.fillStyle = b.ally ? 'rgba(134,239,172,0.25)' : 'rgba(252,165,165,0.25)'
        c.beginPath(); c.ellipse(b.x - camX, b.y, 10, 5, 0, 0, Math.PI * 2); c.fill()
      }

      // particles
      for (const p of particles) {
        c.globalAlpha = p.life / p.ml
        c.fillStyle = p.col; c.beginPath(); c.arc(p.x - camX, p.y, p.r * (p.life / p.ml), 0, Math.PI * 2); c.fill()
      }
      c.globalAlpha = 1

      drawPlayer(c, P, camX)

      // HUD – health
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(8, 8, 108, 22)
      for (let i = 0; i < P.maxHp; i++) {
        c.fillStyle = i < P.hp ? '#22c55e' : '#374151'; c.beginPath(); c.arc(20 + i * 20, 19, 7, 0, Math.PI * 2); c.fill()
      }
      // score
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(GW - 118, 8, 110, 22)
      c.fillStyle = '#fbbf24'; c.font = 'bold 13px monospace'; c.textAlign = 'right'; c.fillText(`${score}`, GW - 13, 23)
      c.fillStyle = '#d1d5db'; c.font = '9px monospace'; c.fillText('SCORE', GW - 13, 34); c.textAlign = 'left'
      // progress
      const prog = Math.min(P.x / endX, 1)
      c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(GW / 2 - 80, 11, 160, 8)
      c.fillStyle = '#22c55e'; c.fillRect(GW / 2 - 80, 11, 160 * prog, 8)
      c.fillStyle = '#fff'; c.font = '8px monospace'; c.textAlign = 'center'; c.fillText(`${Math.round(prog * 100)}%`, GW / 2, 18); c.textAlign = 'left'

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      cleanFns.forEach(fn => fn())
    }
  }, [playing, onEnd, runKey])

  return (
    <canvas
      ref={ref}
      width={GW}
      height={GH}
      className="w-full max-h-[58vh] object-contain rounded-2xl bg-[#0f172a] block"
      style={{ imageRendering: 'pixelated', touchAction: 'none' }}
    />
  )
}
