import { CanvasTexture, Group, LinearFilter, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from 'three'

interface Entry {
  sprite: Sprite
  ctx: CanvasRenderingContext2D
  tex: CanvasTexture
  life: number
  vel: Vector3
  baseScale: number
}

/** Pool of floating combat text sprites, each with its own small canvas. */
export class DamageNumbers {
  readonly group = new Group()
  private pool: Entry[] = []
  private cursor = 0

  constructor(size = 28) {
    for (let i = 0; i < size; i++) {
      const canvas = document.createElement('canvas')
      canvas.width = 160
      canvas.height = 64
      const ctx = canvas.getContext('2d')!
      const tex = new CanvasTexture(canvas)
      tex.colorSpace = SRGBColorSpace
      tex.minFilter = LinearFilter
      tex.generateMipmaps = false
      const mat = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })
      const sprite = new Sprite(mat)
      sprite.visible = false
      sprite.renderOrder = 30
      this.group.add(sprite)
      this.pool.push({ sprite, ctx, tex, life: 0, vel: new Vector3(), baseScale: 0.1 })
    }
  }

  spawn(pos: Vector3, text: string, color: string, scale = 1) {
    const e = this.pool[this.cursor]
    this.cursor = (this.cursor + 1) % this.pool.length
    const { ctx } = e
    ctx.clearRect(0, 0, 160, 64)
    ctx.font = '800 44px "Segoe UI", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 7
    ctx.strokeStyle = 'rgba(5,0,20,0.85)'
    ctx.strokeText(text, 80, 34)
    ctx.shadowColor = color
    ctx.shadowBlur = 12
    ctx.fillStyle = color
    ctx.fillText(text, 80, 34)
    ctx.shadowBlur = 0
    e.tex.needsUpdate = true
    e.sprite.position.copy(pos)
    e.sprite.visible = true
    e.life = 0.9
    e.baseScale = 0.11 * scale
    e.vel.set((Math.random() - 0.5) * 0.15, 0.35 + Math.random() * 0.1, (Math.random() - 0.5) * 0.15)
  }

  update(dt: number) {
    for (const e of this.pool) {
      if (!e.sprite.visible) continue
      e.life -= dt
      if (e.life <= 0) {
        e.sprite.visible = false
        continue
      }
      e.sprite.position.addScaledVector(e.vel, dt)
      e.vel.multiplyScalar(1 - 2.5 * dt)
      const t = e.life / 0.9
      const pop = t > 0.8 ? 1 + (t - 0.8) * 3 : 1
      const s = e.baseScale * pop
      e.sprite.scale.set(s * 2.5, s, 1)
      ;(e.sprite.material as SpriteMaterial).opacity = Math.min(1, t * 2.2)
    }
  }

  clear() {
    for (const e of this.pool) e.sprite.visible = false
  }
}
