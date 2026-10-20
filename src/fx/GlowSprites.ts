import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three'

export interface EmitOptions {
  size?: number
  life?: number
  drag?: number
  gravity?: number
  /** final size multiplier */
  grow?: number
  alpha?: number
}

const _c = new Color()

/**
 * Camera-facing additive glow quads rendered in a single instanced draw call.
 * Used for particles, sparks, projectiles and impact flashes.
 */
export class GlowSprites {
  readonly mesh: Mesh
  readonly capacity: number
  count = 0
  private pos: Float32Array
  private vel: Float32Array
  private col: Float32Array
  private life: Float32Array
  private maxLife: Float32Array
  private size: Float32Array
  private grow: Float32Array
  private drag: Float32Array
  private grav: Float32Array
  private alpha: Float32Array
  private aPos: InstancedBufferAttribute
  private aCol: InstancedBufferAttribute
  private aSize: InstancedBufferAttribute
  private geometry: InstancedBufferGeometry

  constructor(capacity: number, softness = 1) {
    this.capacity = capacity
    this.pos = new Float32Array(capacity * 3)
    this.vel = new Float32Array(capacity * 3)
    this.col = new Float32Array(capacity * 3)
    this.life = new Float32Array(capacity)
    this.maxLife = new Float32Array(capacity)
    this.size = new Float32Array(capacity)
    this.grow = new Float32Array(capacity)
    this.drag = new Float32Array(capacity)
    this.grav = new Float32Array(capacity)
    this.alpha = new Float32Array(capacity)

    const base = new PlaneGeometry(1, 1)
    const g = new InstancedBufferGeometry()
    g.index = base.index
    g.setAttribute('position', base.getAttribute('position'))
    this.aPos = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage)
    this.aCol = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage)
    this.aSize = new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage)
    g.setAttribute('iPos', this.aPos)
    g.setAttribute('iCol', this.aCol)
    g.setAttribute('iSize', this.aSize)
    g.instanceCount = 0
    this.geometry = g

    const mat = new ShaderMaterial({
      uniforms: { uSoft: { value: softness } },
      vertexShader: /* glsl */ `
        attribute vec3 iPos;
        attribute vec4 iCol;
        attribute float iSize;
        varying vec2 vUv;
        varying vec4 vCol;
        void main() {
          vUv = position.xy;
          vCol = iCol;
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          mv.xy += position.xy * iSize;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uSoft;
        varying vec2 vUv;
        varying vec4 vCol;
        void main() {
          float d = length(vUv) * 2.0;
          if (d > 1.0) discard;
          float a = 1.0 - d;
          a = pow(a, 1.0 + uSoft);
          float core = pow(max(0.0, 1.0 - d * 2.2), 2.0);
          vec3 c = vCol.rgb * a + vec3(core) * vCol.a * 0.9;
          gl_FragColor = vec4(c * vCol.a, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    })
    this.mesh = new Mesh(g, mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 10
  }

  emit(p: Vector3, v: Vector3 | null, color: Color | string | number, o: EmitOptions = {}) {
    if (this.count >= this.capacity) return -1
    const i = this.count++
    const i3 = i * 3
    this.pos[i3] = p.x
    this.pos[i3 + 1] = p.y
    this.pos[i3 + 2] = p.z
    this.vel[i3] = v ? v.x : 0
    this.vel[i3 + 1] = v ? v.y : 0
    this.vel[i3 + 2] = v ? v.z : 0
    const c = color instanceof Color ? color : _c.set(color)
    this.col[i3] = c.r
    this.col[i3 + 1] = c.g
    this.col[i3 + 2] = c.b
    this.life[i] = this.maxLife[i] = o.life ?? 0.6
    this.size[i] = o.size ?? 0.03
    this.grow[i] = o.grow ?? 0.2
    this.drag[i] = o.drag ?? 1.5
    this.grav[i] = o.gravity ?? 0
    this.alpha[i] = o.alpha ?? 1
    return i
  }

  burst(p: Vector3, color: Color | string | number, n: number, speed: number, o: EmitOptions = {}) {
    const v = new Vector3()
    for (let k = 0; k < n; k++) {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      if (v.lengthSq() > 1) v.normalize()
      v.multiplyScalar(speed * (0.4 + Math.random() * 0.6))
      this.emit(p, v, color, { ...o, life: (o.life ?? 0.6) * (0.6 + Math.random() * 0.6) })
    }
  }

  update(dt: number) {
    let n = this.count
    const { pos, vel, life } = this
    for (let i = 0; i < n; i++) {
      life[i] -= dt
      if (life[i] <= 0) {
        n--
        if (i !== n) {
          this.copy(n, i)
          i--
        }
        continue
      }
      const i3 = i * 3
      const dr = Math.max(0, 1 - this.drag[i] * dt)
      vel[i3] *= dr
      vel[i3 + 1] = vel[i3 + 1] * dr - this.grav[i] * dt
      vel[i3 + 2] *= dr
      pos[i3] += vel[i3] * dt
      pos[i3 + 1] += vel[i3 + 1] * dt
      pos[i3 + 2] += vel[i3 + 2] * dt
    }
    this.count = n
    const ap = this.aPos.array as Float32Array
    const ac = this.aCol.array as Float32Array
    const as = this.aSize.array as Float32Array
    for (let i = 0; i < n; i++) {
      const i3 = i * 3
      const t = life[i] / this.maxLife[i]
      ap[i3] = pos[i3]
      ap[i3 + 1] = pos[i3 + 1]
      ap[i3 + 2] = pos[i3 + 2]
      const fade = Math.min(1, t * 2.5) * this.alpha[i]
      ac[i * 4] = this.col[i3]
      ac[i * 4 + 1] = this.col[i3 + 1]
      ac[i * 4 + 2] = this.col[i3 + 2]
      ac[i * 4 + 3] = fade
      as[i] = this.size[i] * (this.grow[i] + (1 - this.grow[i]) * t)
    }
    this.geometry.instanceCount = n
    if (n > 0) {
      this.aPos.addUpdateRange(0, n * 3)
      this.aCol.addUpdateRange(0, n * 4)
      this.aSize.addUpdateRange(0, n)
      this.aPos.needsUpdate = true
      this.aCol.needsUpdate = true
      this.aSize.needsUpdate = true
    }
  }

  /** Adjust the position of an alive sprite (used for projectiles). */
  setPosition(i: number, p: Vector3) {
    if (i < 0 || i >= this.count) return
    this.pos[i * 3] = p.x
    this.pos[i * 3 + 1] = p.y
    this.pos[i * 3 + 2] = p.z
  }

  clear() {
    this.count = 0
    this.geometry.instanceCount = 0
  }

  private copy(from: number, to: number) {
    const f3 = from * 3
    const t3 = to * 3
    for (let k = 0; k < 3; k++) {
      this.pos[t3 + k] = this.pos[f3 + k]
      this.vel[t3 + k] = this.vel[f3 + k]
      this.col[t3 + k] = this.col[f3 + k]
    }
    this.life[to] = this.life[from]
    this.maxLife[to] = this.maxLife[from]
    this.size[to] = this.size[from]
    this.grow[to] = this.grow[from]
    this.drag[to] = this.drag[from]
    this.grav[to] = this.grav[from]
    this.alpha[to] = this.alpha[from]
  }
}

/**
 * Immediate-mode glow quads: callers submit sprites each frame (projectiles, muzzles, markers).
 */
export class GlowBatch {
  readonly mesh: Mesh
  private sprites: GlowSprites
  constructor(capacity: number) {
    this.sprites = new GlowSprites(capacity, 0.6)
    this.mesh = this.sprites.mesh
  }
  begin() {
    this.sprites.clear()
  }
  add(p: Vector3, color: Color | string | number, size: number, alpha = 1) {
    this.sprites.emit(p, null, color, { size, life: 1, grow: 1, alpha, drag: 0 })
  }
  end() {
    this.sprites.update(0)
  }
}
