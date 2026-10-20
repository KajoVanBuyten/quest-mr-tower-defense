import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three'

export const FONT = '"Segoe UI", "SF Pro Display", system-ui, -apple-system, sans-serif'

/** Offscreen canvas wrapped in a texture; redrawn only when its content changes. */
export class CanvasPanel {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  readonly texture: CanvasTexture
  private signature = ''

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    this.ctx = this.canvas.getContext('2d')!
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.texture.minFilter = LinearMipmapLinearFilter
    this.texture.magFilter = LinearFilter
    this.texture.anisotropy = 4
  }

  /** Calls draw only if the signature changed. */
  update(signature: string, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    if (signature === this.signature) return
    this.signature = signature
    this.ctx.clearRect(0, 0, this.width, this.height)
    draw(this.ctx, this.width, this.height)
    this.texture.needsUpdate = true
  }

  dispose() {
    this.texture.dispose()
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function glassPanel(ctx: CanvasRenderingContext2D, w: number, h: number, accent = '#5ff6ff', radius = 28) {
  roundRect(ctx, 4, 4, w - 8, h - 8, radius)
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, 'rgba(14, 18, 38, 0.92)')
  g.addColorStop(1, 'rgba(6, 8, 20, 0.92)')
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = accent
  ctx.shadowColor = accent
  ctx.shadowBlur = 16
  ctx.stroke()
  ctx.shadowBlur = 0
}

export function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, color: string, bg = 'rgba(255,255,255,0.08)') {
  roundRect(ctx, x, y, w, h, h / 2)
  ctx.fillStyle = bg
  ctx.fill()
  const f = Math.max(0, Math.min(1, frac))
  if (f > 0.001) {
    roundRect(ctx, x, y, Math.max(h, w * f), h, h / 2)
    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 12
    ctx.fill()
    ctx.shadowBlur = 0
  }
}

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight = 700, align: CanvasTextAlign = 'left', glow = 0) {
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  if (glow) {
    ctx.shadowColor = color
    ctx.shadowBlur = glow
  }
  ctx.fillText(s, x, y)
  ctx.shadowBlur = 0
}

export function hpColor(frac: number) {
  return frac > 0.6 ? '#4ff7c8' : frac > 0.3 ? '#ffd24f' : '#ff4d6a'
}
