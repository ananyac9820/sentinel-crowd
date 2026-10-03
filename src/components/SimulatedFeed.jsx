import { useEffect, useRef } from 'react'
import { ROWS, COLS, ZONE_COUNT } from '../lib/risk.js'

// Animated top-down view of a station platform. Each zone holds as many
// "people" as the simulation says; they wander, arrive and leave toward the gates.

const GATES = [0.15, 0.42, 0.85]
const MARGIN = 0.02

const zoneBounds = (i) => {
  const c = i % COLS
  const r = Math.floor(i / COLS)
  return {
    x0: c / COLS + MARGIN,
    x1: (c + 1) / COLS - MARGIN,
    y0: r / ROWS.length + MARGIN + (r === 0 ? 0.07 : 0),
    y1: (r + 1) / ROWS.length - MARGIN,
  }
}
const rand = (a, b) => a + Math.random() * (b - a)

function drawBackground(ctx, W, H) {
  ctx.fillStyle = '#202326'
  ctx.fillRect(0, 0, W, H)
  // Tracks along the top edge
  ctx.fillStyle = '#17191c'
  ctx.fillRect(0, 0, W, H * 0.06)
  ctx.strokeStyle = '#4a4f55'
  ctx.lineWidth = Math.max(1, W / 600)
  for (const y of [0.018, 0.042]) {
    ctx.beginPath()
    ctx.moveTo(0, H * y)
    ctx.lineTo(W, H * y)
    ctx.stroke()
  }
  // Yellow tactile safety line
  ctx.strokeStyle = '#8f7a3a99'
  ctx.setLineDash([W / 120, W / 160])
  ctx.lineWidth = Math.max(1.5, W / 400)
  ctx.beginPath()
  ctx.moveTo(0, H * 0.075)
  ctx.lineTo(W, H * 0.075)
  ctx.stroke()
  ctx.setLineDash([])
  // Floor tiles
  ctx.strokeStyle = '#ffffff08'
  ctx.lineWidth = 1
  for (let x = 0; x <= W; x += W / 24) {
    ctx.beginPath()
    ctx.moveTo(x, H * 0.08)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = H * 0.08; y <= H; y += H / 14) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  // Pillars
  ctx.fillStyle = '#2b2f34'
  const p = W / 70
  for (const x of [0.25, 0.5, 0.75]) for (const y of [0.33, 0.66]) ctx.fillRect(W * x - p / 2, H * y - p / 2, p, p)
  // Staircase near zone C3
  const sx = W * 0.56,
    sy = H * 0.86,
    sw = W * 0.13,
    sh = H * 0.14
  ctx.fillStyle = '#26292d'
  ctx.fillRect(sx, sy, sw, sh)
  ctx.strokeStyle = '#3a3f45'
  for (let i = 1; i < 7; i++) {
    ctx.beginPath()
    ctx.moveTo(sx, sy + (sh * i) / 7)
    ctx.lineTo(sx + sw, sy + (sh * i) / 7)
    ctx.stroke()
  }
  // Gates on the bottom edge
  ctx.font = `600 ${Math.max(9, W / 85)}px 'IBM Plex Mono', monospace`
  ctx.textAlign = 'center'
  GATES.forEach((gx, i) => {
    ctx.fillStyle = '#4a7fab55'
    ctx.fillRect(W * gx - W * 0.045, H - H * 0.012, W * 0.09, H * 0.012)
    ctx.fillStyle = '#7fa3c2'
    ctx.fillText(`GATE ${i + 1}`, W * gx, H - H * 0.025)
  })
  ctx.fillStyle = '#7a8189'
  ctx.fillText('STAIRS', sx + sw / 2, sy - H * 0.012)
}

export default function SimulatedFeed({ countsRef, running }) {
  const canvasRef = useRef(null)
  const runningRef = useRef(running)
  runningRef.current = running

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const bg = document.createElement('canvas')
    const zones = Array.from({ length: ZONE_COUNT }, () => [])
    const leaving = []
    let W = 0,
      H = 0,
      raf,
      last = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = canvas.getBoundingClientRect()
      W = Math.max(1, Math.round(r.width * dpr))
      H = Math.max(1, Math.round(r.height * dpr))
      canvas.width = bg.width = W
      canvas.height = bg.height = H
      drawBackground(bg.getContext('2d'), W, H)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const newTarget = (a) => {
      const b = zoneBounds(a.zone)
      a.tx = rand(b.x0, b.x1)
      a.ty = rand(b.y0, b.y1)
    }

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const counts = countsRef.current
      const moving = runningRef.current

      // Reconcile agents with target counts.
      zones.forEach((list, i) => {
        const target = counts[i] ?? 0
        while (list.length < target) {
          const b = zoneBounds(i)
          const a = { zone: i, x: rand(b.x0, b.x1), y: rand(b.y0, b.y1), alpha: 0, speed: rand(0.015, 0.035) }
          newTarget(a)
          list.push(a)
        }
        while (list.length > target) {
          const a = list.splice(Math.floor(Math.random() * list.length), 1)[0]
          const gx = GATES.reduce((g, x) => (Math.abs(x - a.x) < Math.abs(g - a.x) ? x : g), GATES[0])
          a.tx = gx
          a.ty = 1.05
          a.speed = 0.08
          leaving.push(a)
        }
      })

      ctx.drawImage(bg, 0, 0)
      const s = W / 900
      const draw = (a) => {
        ctx.globalAlpha = a.alpha
        ctx.fillStyle = '#c9cdd1'
        ctx.beginPath()
        ctx.arc(a.x * W, a.y * H, 3.4 * s, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(201,205,209,0.35)'
        ctx.lineWidth = Math.max(1, s)
        ctx.strokeRect(a.x * W - 6 * s, a.y * H - 8 * s, 12 * s, 16 * s)
      }
      const move = (a) => {
        if (!moving) return
        const dx = a.tx - a.x
        const dy = a.ty - a.y
        const d = Math.hypot(dx, dy)
        if (d < 0.01) return newTarget(a)
        const step = Math.min(d, a.speed * dt)
        a.x += (dx / d) * step
        a.y += (dy / d) * step
      }

      for (const list of zones)
        for (const a of list) {
          a.alpha = Math.min(1, a.alpha + dt * 1.5)
          move(a)
          draw(a)
        }
      for (let k = leaving.length - 1; k >= 0; k--) {
        const a = leaving[k]
        a.alpha -= dt * 0.8
        move(a)
        if (a.alpha <= 0) leaving.splice(k, 1)
        else draw(a)
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [countsRef])

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
}
