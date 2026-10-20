import { Camera, Color, Group, Matrix4, Object3D, Plane, Quaternion, Ray, Raycaster, Vector3, type Intersection } from 'three'
import { Beams } from '../fx/Beams'
import { CoreVisual } from '../fx/Core'
import { DamageNumbers } from '../fx/DamageNumbers'
import { EnemyRenderer } from '../fx/Enemies'
import { GlowBatch, GlowSprites } from '../fx/GlowSprites'
import { createRiftVisual, disposeRiftVisual, type RiftVisual } from '../fx/Rift'
import { createTowerModel, disposeTowerModel, setTowerLevelVisual, type TowerModel } from '../fx/Towers'
import { sfx } from './audio'
import {
  buildWave,
  ENEMIES,
  GAME,
  hpScale,
  MAX_TOWER_LEVEL,
  rewardScale,
  TARGET_LABEL,
  TARGET_MODES,
  TOWER_ORDER,
  TOWERS,
  towerStats,
  wavePreview,
  type EnemyDef,
  type EnemyType,
  type SpawnEvent,
  type TargetMode,
  type TowerStats,
  type TowerType,
  type WavePreview,
} from './config'
import { NavGrid } from './nav'
import { createFallbackRoomModel, createVirtualRoomModel, pointInPolygon, type RoomModel } from './room'
import { useUI, type Phase, type UIState } from './uiStore'

type EnemyState = 'emerge' | 'fall' | 'walk' | 'assault' | 'fly' | 'dying'
type DamageKind = 'laser' | 'tesla' | 'mortar' | 'frost' | 'blaster' | 'orbital'

export interface Enemy {
  id: number
  type: EnemyType
  def: EnemyDef
  hp: number
  maxHp: number
  shield: number
  shieldMax: number
  shieldT: number
  pos: Vector3
  vel: Vector3
  yaw: number
  state: EnemyState
  t: number
  slowT: number
  slowF: number
  flash: number
  phase: number
  speedMul: number
  scale: number
  normal: Vector3
  dmgAcc: number
  dmgAccT: number
  progress: number
  orbitSign: number
  spawnTimer: number
  healT: number
  rift: number
  rewarded: boolean
}

export interface Tower {
  id: number
  type: TowerType
  level: number
  pos: Vector3
  surfaceH: number
  model: TowerModel
  cooldown: number
  target: Enemy | null
  buildT: number
  cells: number[]
  invested: number
  soundT: number
  yaw: number
  targeting: TargetMode
  stats: TowerStats
  /** 1 right after an upgrade, decays to 0 */
  pulse: number
  levelScale: number
}

interface Shell {
  pos: Vector3
  vel: Vector3
  t: number
  T: number
  damage: number
  splash: number
}

interface Bolt {
  pos: Vector3
  dir: Vector3
  life: number
  maxDist: number
  travelled: number
}

interface Arc {
  a: Vector3
  b: Vector3
  life: number
  color: Color
}

interface Strike {
  pos: Vector3
  t: number
  fired: boolean
}

export interface Rift {
  index: number
  center: Vector3
  normal: Vector3
  width: number
  height: number
  drop: Vector3
  visual: RiftVisual
  open: number
  pulse: number
  /** seconds after core placement until this rift tears open */
  delay: number
  opened: boolean
  /** true once the player has looked at it */
  seen: boolean
  /** > 0 while the off-screen indicator should point at it */
  attention: number
  floating: boolean
}

export interface AimState {
  active: boolean
  origin: Vector3
  dir: Vector3
  hit: boolean
  point: Vector3
  normal: Vector3
  horizontal: boolean
  surfaceH: number
  tower: Tower | null
  ui: boolean
  fromHitTest: boolean
}

export interface PlacementState {
  /** an aim point exists */
  has: boolean
  ok: boolean
  reason: string
  /** world-space point on top of the resolved surface */
  point: Vector3
  surfaceH: number
  /** the point was lifted onto the top of furniture */
  snapped: boolean
}

export interface XRHitSample {
  valid: boolean
  matrix: Matrix4
  time: number
}

const _v1 = new Vector3()
const _v2 = new Vector3()
const _v3 = new Vector3()
const _v4 = new Vector3()
const _n = new Vector3()
const _muzzle = new Vector3()
const _m = new Matrix4()
const _q = new Quaternion()
const _q2 = new Quaternion()
const _s = new Vector3()
const _ray = new Ray()
const _plane = new Plane()
const UP = new Vector3(0, 1, 0)
const DOWN = new Vector3(0, -1, 0)
const AXIS_X = new Vector3(1, 0, 0)
const AXIS_Z = new Vector3(0, 0, 1)
const tmp2 = { x: 0, z: 0 }
const _stats = {} as TowerStats

const KIND_COLOR: Record<DamageKind, string> = {
  laser: '#ff7ab8',
  tesla: '#8fd8ff',
  mortar: '#ffc06a',
  frost: '#c6f6ff',
  blaster: '#c9ff5a',
  orbital: '#ffffff',
}

const HS_KEY = 'rift-defense-highscore-v2'

let nextId = 1

export class Game {
  readonly root = new Group()
  readonly towerGroup = new Group()
  readonly riftGroup = new Group()
  readonly particles = new GlowSprites(2000, 1)
  readonly glow = new GlowBatch(600)
  readonly beams = new Beams(900)
  readonly numbers = new DamageNumbers(32)
  readonly enemyRenderer = new EnemyRenderer()
  readonly core = new CoreVisual()
  readonly nav = new NavGrid()
  readonly aim: AimState = {
    active: false,
    origin: new Vector3(),
    dir: new Vector3(0, 0, -1),
    hit: false,
    point: new Vector3(),
    normal: new Vector3(0, 1, 0),
    horizontal: false,
    surfaceH: 0,
    tower: null,
    ui: false,
    fromHitTest: false,
  }
  readonly placement: PlacementState = { has: false, ok: false, reason: '', point: new Vector3(), surfaceH: 0, snapped: false }
  /** meshes that count as placeable / aimable real or virtual surfaces */
  readonly surfaces = new Set<Object3D>()
  /** furniture volumes (scanned meshes, virtual sofa base): towers are lifted onto their top */
  readonly furniture = new Set<Object3D>()
  /** interactive UI meshes – aiming at them suppresses world actions */
  readonly uiObjects = new Set<Object3D>()

  phase: Phase = 'menu'
  mode: 'desktop' | 'xr' = 'desktop'
  room: RoomModel = createVirtualRoomModel()
  credits = GAME.startCredits
  coreHp = GAME.coreHp
  wave = 0
  endless = false
  score = 0
  highScore = 0
  highWave = 0
  selected: TowerType = 'laser'
  selectedTower: Tower | null = null
  ult = 0
  heat = 0
  overheated = false
  corePlaced = false
  readonly corePos = new Vector3()
  enemies: Enemy[] = []
  towers: Tower[] = []
  rifts: Rift[] = []
  kills = 0
  time = 0
  introT = 0
  playerPos = new Vector3()
  hoverInfo = ''
  orbitalArmed = false
  /** time of the last refused action – UI flashes red */
  deniedAt = -10
  /** set by the XR input layer to pulse the active controller */
  onHaptic: ((intensity: number, ms: number) => void) | null = null

  private pool: Enemy[] = []
  private shells: Shell[] = []
  private bolts: Bolt[] = []
  private arcs: Arc[] = []
  private strikes: Strike[] = []
  private queue: SpawnEvent[] = []
  private waveTime = 0
  private blasterCd = 0
  private lastShot = 0
  private scanT = 0
  private uiT = 0
  private message = ''
  private messageKey = 0
  private raycaster = new Raycaster()
  private probe = new Raycaster()
  private objs: Object3D[] = []
  private hits: Intersection[] = []
  private camera: Camera | null = null
  private previewCache: WavePreview | null = null

  constructor() {
    this.root.name = 'game-root'
    this.root.add(this.riftGroup, this.towerGroup, this.enemyRenderer.group, this.core.group, this.particles.mesh, this.glow.mesh, this.beams.mesh, this.numbers.group)
    this.loadHighScore()
  }

  // ---------------------------------------------------------------- lifecycle

  reset() {
    for (const t of this.towers) {
      this.towerGroup.remove(t.model.root)
      disposeTowerModel(t.model)
    }
    this.towers = []
    this.selectedTower = null
    this.enemies.forEach((e) => this.pool.push(e))
    this.enemies = []
    this.shells = []
    this.bolts = []
    this.arcs = []
    this.strikes = []
    this.queue = []
    this.clearRifts()
    this.core.hide()
    this.corePlaced = false
    this.credits = GAME.startCredits
    this.coreHp = GAME.coreHp
    this.wave = 0
    this.endless = false
    this.score = 0
    this.ult = 0
    this.heat = 0
    this.overheated = false
    this.orbitalArmed = false
    this.kills = 0
    this.introT = 0
    this.particles.clear()
    this.numbers.clear()
    this.root.matrixAutoUpdate = true
    this.root.position.set(0, 0, 0)
    this.root.quaternion.identity()
    this.root.scale.set(1, 1, 1)
    this.root.updateMatrix()
    sfx.stopDrones()
  }

  startDesktop() {
    this.reset()
    this.mode = 'desktop'
    this.setRoom(createVirtualRoomModel())
    this.setPhase('placeCore')
    this.say('Klicke auf den Boden oder einen Tisch, um den Kern zu platzieren')
  }

  startXR(ar: boolean) {
    this.reset()
    this.mode = 'xr'
    this.scanT = 0
    if (!ar) {
      // immersive VR: play inside the virtual apartment
      this.room = createVirtualRoomModel()
      this.setPhase('placeCore')
      this.say('Ziele auf den Boden und drücke den Trigger, um den Kern zu platzieren')
      return
    }
    this.room = createFallbackRoomModel(new Vector3(), 0)
    this.setPhase('scan')
    this.say('Raum wird erfasst …')
  }

  exitXR() {
    this.commitScore()
    this.reset()
    this.mode = 'desktop'
    this.setRoom(createVirtualRoomModel())
    this.setPhase('menu')
  }

  restart() {
    this.commitScore()
    const mode = this.mode
    const room = this.room
    this.reset()
    this.mode = mode
    this.setRoom(room)
    this.setPhase('placeCore')
    this.say(mode === 'xr' ? 'Ziele auf Boden oder Tisch und drücke den Trigger' : 'Klicke auf den Boden oder einen Tisch')
  }

  setPhase(p: Phase) {
    this.phase = p
    this.syncUI(true)
  }

  say(text: string) {
    this.message = text
    this.messageKey++
    this.syncUI(true)
  }

  setRoom(room: RoomModel) {
    this.room = room
    if (this.corePlaced) this.rebuildNav()
    this.syncUI(true)
  }

  haptic(intensity: number, ms: number) {
    this.onHaptic?.(intensity, ms)
  }

  private deny(text: string) {
    sfx.play('denied')
    this.deniedAt = this.time
    this.haptic(0.25, 40)
    this.say(text)
  }

  // ---------------------------------------------------------------- score

  private loadHighScore() {
    try {
      const raw = localStorage.getItem(HS_KEY)
      if (!raw) return
      const v = JSON.parse(raw) as { score?: number; wave?: number }
      this.highScore = Math.max(0, Number(v.score) || 0)
      this.highWave = Math.max(0, Number(v.wave) || 0)
    } catch {
      /* storage unavailable */
    }
  }

  /** Persists a new record. Returns true if the current run beat the stored one. */
  private commitScore() {
    let changed = false
    if (this.score > this.highScore) {
      this.highScore = this.score
      changed = true
    }
    if (this.wave > this.highWave && this.corePlaced) {
      this.highWave = this.wave
      changed = true
    }
    if (changed) {
      try {
        localStorage.setItem(HS_KEY, JSON.stringify({ score: this.highScore, wave: this.highWave }))
      } catch {
        /* storage unavailable */
      }
    }
    return changed
  }

  // ---------------------------------------------------------------- coords

  toLocal(world: Vector3, out = new Vector3()) {
    return this.root.worldToLocal(out.copy(world))
  }

  toWorld(local: Vector3, out = new Vector3()) {
    return this.root.localToWorld(out.copy(local))
  }

  get floorY() {
    return this.room.floorY
  }

  // ---------------------------------------------------------------- core + rifts

  canPlaceCore() {
    return this.placement.has && this.placement.ok && !this.aim.ui
  }

  placeCore(pointWorld: Vector3) {
    if (this.corePlaced) return
    if (this.mode === 'xr' && this.room.source === 'fallback') {
      // without room data, centre the virtual play area on the chosen spot
      this.room = createFallbackRoomModel(pointWorld, this.room.floorY)
    }
    this.toLocal(pointWorld, this.corePos)
    this.corePlaced = true
    this.core.group.position.copy(this.corePos)
    this.core.show()
    this.createRifts()
    this.rebuildNav()
    this.introT = 0
    this.setPhase('build')
    sfx.play('build', this.toWorld(this.corePos))
    this.haptic(0.7, 80)
    this.particles.burst(_v1.copy(this.corePos).setY(this.corePos.y + 0.15), '#5ff6ff', 60, 1.2, { size: 0.03, life: 0.9, gravity: 0.5 })
    this.say(`Achtung – ${this.rifts.length} Risse öffnen sich! Folge den Pfeilen.`)
  }

  private clearRifts() {
    for (const r of this.rifts) {
      this.riftGroup.remove(r.visual.group, r.visual.floorGlow)
      disposeRiftVisual(r.visual)
    }
    this.rifts = []
  }

  /**
   * Picks rift spots on the detected walls: inside each wall's outline, at chest height,
   * not hidden behind furniture, spread around the core and preferably in the player's view.
   * Several rifts may share a long wall; without enough wall space rifts float inside the room.
   */
  private planRifts(count: number) {
    const floorY = this.room.floorY
    const core = this.corePos
    const player = this.toLocal(this.playerPos, new Vector3())
    const view = _v4.subVectors(core, player).setY(0)
    if (view.lengthSq() < 1e-4) view.set(0, 0, -1)
    view.normalize()
    type Spot = { center: Vector3; normal: Vector3; width: number; height: number; wall: number; score: number; floating: boolean }
    const cands: Spot[] = []
    const obstacles = this.room.obstacles
    this.room.walls.forEach((w, wi) => {
      if (w.width < 0.8 || w.height < 1.2) return
      const n = w.normal.clone().setY(0)
      if (n.lengthSq() < 1e-4) return
      n.normalize()
      const c0 = this.toLocal(w.center, new Vector3())
      let flip = 1
      if (_v1.subVectors(core, c0).setY(0).dot(n) < 0) {
        n.negate()
        flip = -1
      }
      const right = new Vector3(n.z, 0, -n.x)
      const poly: Array<[number, number]> = w.poly
        ? w.poly.map(([u, v]) => [u * flip, v] as [number, number])
        : [
            [-w.width / 2, w.bottom],
            [w.width / 2, w.bottom],
            [w.width / 2, w.bottom + w.height],
            [-w.width / 2, w.bottom + w.height],
          ]
      const rw = Math.min(0.85, Math.max(0.55, w.width * 0.4))
      const rh = Math.min(1.1, Math.max(0.7, w.height * 0.45))
      let cy = Math.min(Math.max(floorY + 1.3, floorY + 1.0), floorY + 1.6)
      cy = Math.min(cy, w.bottom + w.height - rh / 2 - 0.06)
      cy = Math.max(cy, w.bottom + rh / 2 + 0.05)
      const half = Math.max(0, w.width / 2 - rw / 2 - 0.08)
      for (let u = -half; u <= half + 1e-6; u += half > 0 ? Math.max(0.2, half / 6) : 1) {
        const corners: Array<[number, number]> = [
          [u - rw * 0.42, cy - rh * 0.42],
          [u + rw * 0.42, cy - rh * 0.42],
          [u + rw * 0.42, cy + rh * 0.42],
          [u - rw * 0.42, cy + rh * 0.42],
        ]
        if (!corners.every(([a, b]) => pointInPolygon(a, b, poly))) continue
        const pos = c0.clone().addScaledVector(right, u)
        pos.y = cy
        const dist = Math.hypot(pos.x - core.x, pos.z - core.z)
        if (dist < 1.0) continue
        // furniture standing in front of the spot would hide the rift
        const bottom = cy - rh / 2
        let hidden = false
        for (const o of obstacles) {
          if (o.top < bottom + 0.15) continue
          for (const d of [0.12, 0.4]) {
            for (const s of [-0.4, 0, 0.4]) {
              const x = pos.x + n.x * d + right.x * s * rw
              const z = pos.z + n.z * d + right.z * s * rw
              if (x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ) hidden = true
            }
          }
          if (hidden) break
        }
        if (hidden) continue
        const toSpot = _v2.subVectors(pos, player).setY(0).normalize()
        const facing = _v3.subVectors(player, pos).setY(0).normalize().dot(n)
        const score = -Math.abs(dist - 2.2) * 0.5 + toSpot.dot(view) * 0.8 + facing * 0.3 - (Math.abs(u) / Math.max(1, w.width)) * 0.3
        cands.push({ center: pos, normal: n, width: rw, height: rh, wall: wi, score, floating: false })
      }
    })

    const chosen: Spot[] = []
    const spread = (p: Vector3) => {
      if (!chosen.length) return 0
      let min = Math.PI
      const a = Math.atan2(p.x - core.x, p.z - core.z)
      for (const o of chosen) {
        let d = Math.abs(a - Math.atan2(o.center.x - core.x, o.center.z - core.z))
        if (d > Math.PI) d = Math.PI * 2 - d
        min = Math.min(min, d)
      }
      return min
    }
    while (chosen.length < count) {
      let best: Spot | null = null
      let bestS = -Infinity
      for (const c of cands) {
        if (chosen.some((o) => o.center.distanceTo(c.center) < 1.3)) continue
        let s = c.score + Math.min(spread(c.center), 2.0) * 0.9
        if (chosen.some((o) => o.wall === c.wall)) s -= 1.2
        if (s > bestS) {
          bestS = s
          best = c
        }
      }
      if (!best) break
      chosen.push(best)
    }

    // not enough wall space: rifts hover inside the room, never outside of it
    if (chosen.length < count) {
      const b = this.room.bounds
      const poly = this.room.floorPolygon
      const baseAngle = Math.atan2(view.x, view.z)
      for (let pass = 0; pass < 2 && chosen.length < count; pass++) {
        while (chosen.length < count) {
          let best: Spot | null = null
          let bestS = -Infinity
          for (let i = 0; i < 18; i++) {
            const ang = baseAngle + (i / 18) * Math.PI * 2
            for (const r of pass === 0 ? [2.2, 1.8, 1.5] : [1.2, 1.0]) {
              const p = new Vector3(core.x + Math.sin(ang) * r, floorY + 1.25, core.z + Math.cos(ang) * r)
              const margin = 0.35
              if (p.x < b.minX + margin || p.x > b.maxX - margin || p.z < b.minZ + margin || p.z > b.maxZ - margin) continue
              if (poly && !pointInPolygon(p.x, p.z, poly)) continue
              if (this.room.obstacles.some((o) => p.x > o.minX - 0.2 && p.x < o.maxX + 0.2 && p.z > o.minZ - 0.2 && p.z < o.maxZ + 0.2)) continue
              if (chosen.some((o) => o.center.distanceTo(p) < (pass === 0 ? 1.3 : 0.9))) continue
              const vis = _v2.subVectors(p, player).setY(0).normalize().dot(view)
              const s = Math.min(spread(p), 2.0) * 1.2 + vis * 0.6 + r * 0.1
              if (s > bestS) {
                bestS = s
                best = { center: p, normal: new Vector3(core.x - p.x, 0, core.z - p.z).normalize(), width: 0.75, height: 1.0, wall: -1, score: s, floating: true }
              }
            }
          }
          if (!best) break
          chosen.push(best)
        }
      }
    }
    // tiny or unknown room: last resort around the core
    for (let i = 0; chosen.length < count && i < count; i++) {
      const ang = Math.atan2(view.x, view.z) + (i - 1) * 1.1
      const p = new Vector3(core.x + Math.sin(ang) * 1.1, floorY + 1.2, core.z + Math.cos(ang) * 1.1)
      chosen.push({ center: p, normal: new Vector3(core.x - p.x, 0, core.z - p.z).normalize(), width: 0.6, height: 0.85, wall: -1, score: 0, floating: true })
    }
    return chosen
  }

  private createRifts() {
    this.clearRifts()
    const floorY = this.room.floorY
    const spots = this.planRifts(3)
    // open the most visible rift first, then sweep around the player
    const player = this.toLocal(this.playerPos, new Vector3())
    const view = _v4.subVectors(this.corePos, player).setY(0).normalize()
    spots.sort((a, b) => _v2.subVectors(b.center, player).setY(0).normalize().dot(view) - _v3.subVectors(a.center, player).setY(0).normalize().dot(view))
    spots.forEach((c, i) => {
      const visual = createRiftVisual(c.width, c.height)
      // a few centimetres in front of the wall so neither the wall occluder nor depth sensing cuts it
      const center = c.center.clone().addScaledVector(c.normal, c.floating ? 0 : 0.06)
      visual.group.position.copy(center)
      visual.group.rotation.set(0, Math.atan2(c.normal.x, c.normal.z), 0)
      visual.group.visible = false
      visual.floorGlow.position.set(center.x + c.normal.x * 0.35, floorY + 0.008, center.z + c.normal.z * 0.35)
      visual.floorGlow.rotation.z = -Math.atan2(c.normal.x, c.normal.z)
      visual.floorGlow.visible = false
      this.riftGroup.add(visual.group, visual.floorGlow)
      const drop = center.clone().addScaledVector(c.normal, 0.45)
      drop.y = floorY
      this.rifts.push({
        index: i,
        center,
        normal: c.normal,
        width: c.width,
        height: c.height,
        drop,
        visual,
        open: 0,
        pulse: 0,
        delay: 0.8 + i * 1.6,
        opened: false,
        seen: false,
        attention: 0,
        floating: c.floating,
      })
    })
    // fallback rooms grow to contain all rifts
    if (this.room.source !== 'xr') {
      const b = { ...this.room.bounds }
      for (const r of this.rifts) {
        b.minX = Math.min(b.minX, r.drop.x - 0.4)
        b.maxX = Math.max(b.maxX, r.drop.x + 0.4)
        b.minZ = Math.min(b.minZ, r.drop.z - 0.4)
        b.maxZ = Math.max(b.maxZ, r.drop.z + 0.4)
      }
      this.room = { ...this.room, bounds: b }
    }
  }

  /** True while the rifts are still tearing open after the core was placed. */
  get introActive() {
    return this.corePlaced && this.rifts.some((r) => !r.opened || r.open < 0.5)
  }

  private rebuildNav() {
    this.nav.buildFromRoom(this.room, GAME.cellSize)
    for (const t of this.towers) {
      if (t.surfaceH < 0.12) t.cells = this.nav.markTower(t.pos.x, t.pos.z, 0.12)
    }
    this.nav.computeFlow(this.corePos.x, this.corePos.z, GAME.coreRadius + 0.12)
    for (const r of this.rifts) {
      this.nav.nearestFree(r.drop.x, r.drop.z, tmp2)
      r.drop.x = tmp2.x
      r.drop.z = tmp2.z
    }
  }

  // ---------------------------------------------------------------- aiming

  private visibleList(set: Set<Object3D>, out: Object3D[]) {
    for (const o of set) if (isVisible(o)) out.push(o)
    return out
  }

  /** Updates the shared aim state from a world-space ray (mouse or controller). */
  updateAim(origin: Vector3, dir: Vector3, hit: XRHitSample | null) {
    const a = this.aim
    a.active = true
    a.origin.copy(origin)
    a.dir.copy(dir).normalize()
    a.hit = false
    a.ui = false
    a.tower = null
    a.fromHitTest = false
    const rc = this.raycaster
    rc.set(a.origin, a.dir)
    rc.far = 15
    let uiDist = Infinity
    if (this.uiObjects.size) {
      this.objs.length = 0
      this.hits.length = 0
      rc.intersectObjects(this.visibleList(this.uiObjects, this.objs), false, this.hits)
      if (this.hits.length) {
        uiDist = this.hits[0].distance
        a.ui = true
      }
    }
    // tower picking (generous capsule around the tower body)
    let best = Infinity
    _ray.set(a.origin, a.dir)
    for (const t of this.towers) {
      const h = t.model.height
      for (let k = 0; k < 2; k++) {
        this.toWorld(_v1.copy(t.pos).setY(t.pos.y + h * (k === 0 ? 0.3 : 0.75)), _v2)
        const along = _v3.subVectors(_v2, a.origin).dot(a.dir)
        if (along < 0) continue
        const d2 = _ray.distanceSqToPoint(_v2)
        const r = 0.09 + Math.min(0.06, along * 0.015)
        if (d2 < r * r && along < best) {
          best = along
          a.tower = t
        }
      }
    }
    if (best > uiDist) a.tower = null
    let surfDist = Infinity
    if (hit && hit.valid) {
      a.point.setFromMatrixPosition(hit.matrix)
      a.normal.setFromMatrixColumn(hit.matrix, 1).normalize()
      surfDist = a.point.distanceTo(a.origin)
      a.hit = true
      a.fromHitTest = true
    }
    if (!a.hit && (this.surfaces.size || this.furniture.size)) {
      this.objs.length = 0
      this.hits.length = 0
      this.visibleList(this.surfaces, this.objs)
      this.visibleList(this.furniture, this.objs)
      rc.intersectObjects(this.objs, false, this.hits)
      if (this.hits.length) {
        const h = this.hits[0]
        a.point.copy(h.point)
        if (h.face) a.normal.copy(h.face.normal).transformDirection(h.object.matrixWorld)
        else a.normal.set(0, 1, 0)
        surfDist = h.distance
        a.hit = true
      }
    }
    if (!a.hit && a.dir.y < -0.05) {
      _plane.set(UP, -this.toWorld(_v1.set(0, this.room.floorY, 0)).y)
      if (_ray.intersectPlane(_plane, _v2)) {
        a.point.copy(_v2)
        a.normal.set(0, 1, 0)
        surfDist = a.point.distanceTo(a.origin)
        a.hit = surfDist < 12
      }
    }
    if (a.tower && best > surfDist + 0.2) a.tower = null
    if (uiDist < surfDist) a.hit = false
    a.horizontal = a.hit && a.normal.y > 0.8
    a.surfaceH = a.hit ? this.toLocal(a.point, _v1).y - this.room.floorY : 0
    this.resolvePlacement()
    this.hoverInfo = a.tower ? this.towerInfo(a.tower) : ''
  }

  clearAim() {
    this.aim.active = false
    this.aim.hit = false
    this.aim.tower = null
    this.placement.has = false
    this.hoverInfo = ''
  }

  /**
   * Finds the top of whatever surface the ray hit. A probe ray is cast straight down from
   * above the aim point against detected planes and furniture volumes: aiming at the front
   * of a sofa or at its seat yields the top of the sofa volume, so towers never end up
   * inside furniture (where the furniture's own occluder would hide them).
   */
  private probeTop(point: Vector3, normal: Vector3, out: Vector3) {
    const lift = 1.3
    _v1.copy(point)
    if (normal.y < 0.8) {
      // nudge into the object that was hit so the probe lands on its top
      _v1.x -= normal.x * 0.04
      _v1.z -= normal.z * 0.04
    }
    _v1.y += lift
    this.probe.set(_v1, DOWN)
    this.probe.far = lift + 0.2
    this.objs.length = 0
    this.hits.length = 0
    this.visibleList(this.surfaces, this.objs)
    this.visibleList(this.furniture, this.objs)
    this.probe.intersectObjects(this.objs, false, this.hits)
    for (const h of this.hits) {
      if (!h.face) continue
      _n.copy(h.face.normal).transformDirection(h.object.matrixWorld)
      const furniture = this.furniture.has(h.object)
      // planes are single sided (a ceiling faces down); scanned volumes may have any winding
      if ((furniture ? Math.abs(_n.y) : _n.y) < 0.75) continue
      const above = h.point.y - point.y
      // a table top far above the aim point means we aim underneath it – keep the lower surface
      if (above > 0.6 && !furniture) continue
      // the underside of a volume we started inside of is not a top
      if (furniture && above < -0.05) continue
      out.copy(h.point)
      return true
    }
    return false
  }

  private resolvePlacement() {
    const P = this.placement
    const a = this.aim
    const placing = this.phase === 'placeCore' || ((this.phase === 'build' || this.phase === 'wave') && !this.orbitalArmed)
    P.has = a.hit && placing && !a.ui && !a.tower
    P.ok = false
    P.snapped = false
    P.reason = ''
    if (!P.has) return
    let upright = a.normal.y > 0.8
    P.point.copy(a.point)
    if (this.probeTop(a.point, a.normal, _v3)) {
      if (_v3.y > a.point.y + 0.02) P.snapped = true
      // on a side face only a top at or above the aim point counts (never the floor inside a cabinet)
      if (_v3.y > a.point.y - 0.05 || (upright && _v3.y > a.point.y - 0.15)) {
        P.point.copy(_v3)
        upright = true
      }
    }
    // tiny lift so the base never z-fights with the surface occluder
    P.point.y += 0.003
    const local = this.toLocal(P.point, _v2)
    P.surfaceH = Math.max(0, local.y - this.room.floorY)
    if (!upright) {
      P.reason = 'Nur auf waagerechten Flächen'
      return
    }
    if (this.phase === 'placeCore') {
      if (P.surfaceH > 1.3) P.reason = 'Zu hoch für den Kern'
      else P.ok = true
      return
    }
    P.reason = this.checkPlacement(this.selected, local, P.surfaceH)
    P.ok = P.reason === ''
  }

  towerInfo(t: Tower) {
    const def = TOWERS[t.type]
    if (t.level >= MAX_TOWER_LEVEL) return `${def.name} Stufe ${t.level} · MAX`
    return `${def.name} Stufe ${t.level} · Upgrade ◆${this.upgradeCost(t)}`
  }

  upgradeCost(t: Tower) {
    return t.level >= MAX_TOWER_LEVEL ? 0 : TOWERS[t.type].upgradeCost[t.level - 1]
  }

  sellValue(t: Tower) {
    return Math.round(t.invested * GAME.sellRefund)
  }

  /** Trigger / pinch / click on the world. */
  primaryAction() {
    const a = this.aim
    if (a.ui) return
    switch (this.phase) {
      case 'placeCore':
        if (this.canPlaceCore()) this.placeCore(this.placement.point)
        else this.deny(this.placement.reason || 'Ziele auf eine waagerechte Fläche (Boden oder Tisch)')
        return
      case 'build':
      case 'wave': {
        if (this.orbitalArmed) {
          if (a.hit) this.orbitalStrike(a.point)
          return
        }
        if (a.tower) {
          this.selectTowerInstance(a.tower)
          return
        }
        if (this.selectedTower) {
          this.selectTowerInstance(null)
          return
        }
        if (this.placement.has) {
          this.placeTower(this.selected)
          return
        }
        this.deny('Ziele auf eine Fläche')
        return
      }
      default:
        return
    }
  }

  /** B button / right click: close the info card. */
  secondaryAction() {
    if (this.selectedTower) this.selectTowerInstance(null)
    else if (this.aim.tower && (this.phase === 'build' || this.phase === 'wave')) this.selectTowerInstance(this.aim.tower)
  }

  selectTower(type: TowerType) {
    this.selected = type
    this.selectedTower = null
    sfx.play('click')
    this.syncUI(true)
  }

  cycleTower(dir: number) {
    const i = TOWER_ORDER.indexOf(this.selected)
    this.selectTower(TOWER_ORDER[(i + dir + TOWER_ORDER.length) % TOWER_ORDER.length])
  }

  selectTowerInstance(t: Tower | null) {
    if (t === this.selectedTower) return
    this.selectedTower = t
    if (t) {
      sfx.play('select', this.toWorld(t.pos))
      this.haptic(0.3, 25)
    } else sfx.play('click')
    this.syncUI(true)
  }

  cycleTargeting(t: Tower) {
    const i = TARGET_MODES.indexOf(t.targeting)
    t.targeting = TARGET_MODES[(i + 1) % TARGET_MODES.length]
    t.target = null
    sfx.play('click')
    this.say(`Zielmodus: ${TARGET_LABEL[t.targeting]}`)
  }

  // ---------------------------------------------------------------- towers

  towerRangeAt(type: TowerType, level: number, surfaceH: number) {
    return towerStats(type, level, surfaceH, _stats).range
  }

  /** Returns '' when the tower may be built at `p` (root-local coordinates). */
  checkPlacement(type: TowerType, p: Vector3, surfaceH: number): string {
    if (!this.corePlaced) return 'Zuerst den Kern platzieren'
    if (surfaceH > 2.0) return 'Zu hoch'
    if (p.y - this.room.floorY < -0.15) return 'Ungültige Position'
    if (Math.hypot(p.x - this.corePos.x, p.z - this.corePos.z) < 0.3 && Math.abs(p.y - this.corePos.y) < 0.4) return 'Zu nah am Kern'
    for (const t of this.towers) {
      if (Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < 0.2 && Math.abs(t.pos.y - p.y) < 0.3) return 'Zu nah an einem Turm'
    }
    for (const r of this.rifts) {
      if (Math.hypot(r.drop.x - p.x, r.drop.z - p.z) < 0.3) return 'Blockiert einen Riss'
    }
    if (this.credits < TOWERS[type].cost) return `Zu wenig Credits (◆${TOWERS[type].cost})`
    return ''
  }

  placeTower(type: TowerType) {
    const P = this.placement
    if (!P.ok) {
      this.deny(P.reason || 'Hier kann nicht gebaut werden')
      return false
    }
    const pos = this.toLocal(P.point)
    const surfaceH = P.surfaceH
    let cells: number[] = []
    if (surfaceH < 0.12) {
      cells = this.nav.markTower(pos.x, pos.z, 0.12)
      this.nav.computeFlow(this.corePos.x, this.corePos.z, GAME.coreRadius + 0.12)
      const blocked = this.rifts.some((r) => !Number.isFinite(this.nav.distAt(r.drop.x, r.drop.z)))
      if (blocked) {
        this.nav.unmark(cells)
        this.nav.computeFlow(this.corePos.x, this.corePos.z, GAME.coreRadius + 0.12)
        this.deny('Der Turm würde den Weg komplett blockieren')
        return false
      }
    }
    const def = TOWERS[type]
    const model = createTowerModel(type)
    model.root.position.copy(pos)
    this.towerGroup.add(model.root)
    const tower: Tower = {
      id: nextId++,
      type,
      level: 1,
      pos,
      surfaceH,
      model,
      cooldown: 0.5,
      target: null,
      buildT: 0,
      cells,
      invested: def.cost,
      soundT: 0,
      yaw: Math.random() * Math.PI * 2,
      targeting: type === 'mortar' ? 'strong' : 'first',
      stats: towerStats(type, 1, surfaceH),
      pulse: 0,
      levelScale: 1,
    }
    setTowerLevelVisual(model, 1, def.color)
    this.towers.push(tower)
    this.credits -= def.cost
    sfx.play('build', P.point)
    this.haptic(0.6, 60)
    // landing ring where the hologram starts to assemble
    for (let k = 0; k < 28; k++) {
      const ang = (k / 28) * Math.PI * 2
      this.particles.emit(_v1.copy(pos).setY(pos.y + 0.01), _v2.set(Math.cos(ang) * 0.6, 0.05, Math.sin(ang) * 0.6), '#7ff6ff', { size: 0.02, life: 0.45, drag: 3 })
    }
    if (surfaceH > 0.3) this.say(`${def.name} gebaut · erhöhte Position: +${Math.round(Math.min(surfaceH, 1.2) * 35)}% Reichweite`)
    else this.say(`${def.name} gebaut`)
    this.syncUI(true)
    return true
  }

  upgradeTower(t: Tower) {
    const def = TOWERS[t.type]
    if (t.level >= MAX_TOWER_LEVEL) {
      this.deny(`${def.name} ist bereits auf Maximalstufe`)
      return
    }
    const cost = this.upgradeCost(t)
    if (this.credits < cost) {
      this.deny(`Zu wenig Credits – Upgrade kostet ◆${cost}`)
      this.numbers.spawn(_v1.copy(t.pos).setY(t.pos.y + t.model.height + 0.08), `◆${cost - this.credits} fehlen`, '#ff4d6a', 1.1)
      return
    }
    this.credits -= cost
    t.invested += cost
    t.level++
    setTowerLevelVisual(t.model, t.level, def.color)
    t.levelScale = t.model.root.scale.x
    t.stats = towerStats(t.type, t.level, t.surfaceH)
    t.pulse = 1
    sfx.play('upgrade', this.toWorld(t.pos))
    this.haptic(0.8, 90)
    const top = _v1.copy(t.pos).setY(t.pos.y + t.model.height * 0.6)
    this.particles.burst(top, def.color, 50, 1.0, { size: 0.026, life: 0.8, gravity: -0.3 })
    this.particles.burst(top, '#ffffff', 16, 0.6, { size: 0.02, life: 0.4 })
    for (let k = 0; k < 36; k++) {
      const ang = (k / 36) * Math.PI * 2
      this.particles.emit(_v2.copy(t.pos).setY(t.pos.y + 0.02), _v3.set(Math.cos(ang) * 1.1, 0.1, Math.sin(ang) * 1.1), k % 2 ? def.color : '#ffffff', {
        size: 0.024,
        life: 0.5,
        drag: 2.6,
      })
    }
    for (let k = 0; k < 14; k++) {
      this.particles.emit(_v2.copy(t.pos).setY(t.pos.y + 0.02 + k * 0.03), _v3.set(0, 0.6 + k * 0.05, 0), def.color, { size: 0.03, life: 0.55, drag: 1 })
    }
    this.say(`${def.name} auf Stufe ${t.level} verbessert`)
    this.syncUI(true)
  }

  sellTower(t: Tower) {
    const refund = this.sellValue(t)
    this.credits += refund
    this.towers = this.towers.filter((o) => o !== t)
    if (this.selectedTower === t) this.selectedTower = null
    this.towerGroup.remove(t.model.root)
    disposeTowerModel(t.model)
    if (t.cells.length) {
      this.nav.unmark(t.cells)
      this.nav.computeFlow(this.corePos.x, this.corePos.z, GAME.coreRadius + 0.12)
    }
    sfx.play('sell', this.toWorld(t.pos))
    this.haptic(0.4, 50)
    this.particles.burst(_v1.copy(t.pos).setY(t.pos.y + 0.1), '#6ff4ff', 30, 0.7, { size: 0.02, life: 0.6 })
    this.numbers.spawn(_v1.copy(t.pos).setY(t.pos.y + 0.25), `+◆${refund}`, '#ffe36a', 1)
    this.say(`Turm verkauft (+${refund})`)
    this.syncUI(true)
  }

  // ---------------------------------------------------------------- waves

  get nextWave() {
    return this.phase === 'wave' ? this.wave : this.wave + 1
  }

  /** Composition of the running wave (during a wave) or the next one. */
  get preview(): WavePreview {
    const w = Math.max(1, this.nextWave)
    if (!this.previewCache || this.previewCache.wave !== w) this.previewCache = wavePreview(w)
    return this.previewCache
  }

  startWave() {
    if (this.phase !== 'build') return
    if (this.introActive) {
      this.deny('Die Risse öffnen sich noch …')
      return
    }
    this.wave++
    this.queue = buildWave(this.wave, this.rifts.length)
    this.waveTime = 0
    this.selectedTower = null
    const pv = this.preview
    this.setPhase('wave')
    sfx.play(pv.tag === 'BOSS' || pv.tag === 'MINI-BOSS' ? 'bossWarn' : 'waveStart')
    for (const r of this.rifts) {
      r.pulse = 1
      r.attention = 6
    }
    const fresh = pv.fresh.length ? ` · Neu: ${pv.fresh.map((t) => `${ENEMIES[t].name} (${ENEMIES[t].hint})`).join(', ')}` : ''
    const head = pv.tag === 'BOSS' ? 'BOSS-WELLE' : pv.tag === 'MINI-BOSS' ? 'Mini-Boss-Welle' : `Welle ${this.wave}`
    this.say(`${head}: ${pv.name}${fresh}`)
  }

  continueEndless() {
    if (this.phase !== 'victory') return
    this.endless = true
    for (const r of this.rifts) {
      r.open = 0.2
      r.pulse = 1
    }
    this.setPhase('build')
    sfx.play('waveStart')
    this.say('Endlos-Modus: Wie lange hältst du durch?')
  }

  private waveComplete() {
    const bonus = GAME.waveBonusBase + GAME.waveBonusPerWave * Math.min(this.wave, 60)
    this.credits += bonus
    this.score += 50 * this.wave
    if (!this.endless && this.wave >= GAME.totalWaves) {
      this.score += 5000
      this.commitScore()
      this.setPhase('victory')
      sfx.play('victory')
      this.say('Sieg! Alle 50 Wellen abgewehrt. Weiter im Endlos-Modus?')
      for (const r of this.rifts) r.pulse = 1
      return
    }
    const record = this.commitScore()
    this.setPhase('build')
    sfx.play('waveClear')
    const next = this.preview
    const warn = next.tag === 'BOSS' ? ' · Achtung: Boss naht!' : next.tag === 'MINI-BOSS' ? ' · Achtung: Mini-Boss naht!' : ''
    this.say(`Welle ${this.wave} abgewehrt · +${bonus} Credits${record && this.endless ? ' · Neuer Rekord!' : ''}${warn}`)
  }

  // ---------------------------------------------------------------- player weapons

  fireBlaster(originWorld: Vector3, dirWorld: Vector3, maxDist = 12) {
    if (this.phase !== 'wave' && this.phase !== 'build') return false
    if (this.overheated || this.blasterCd > 0) return false
    this.blasterCd = 1 / GAME.blaster.rate
    this.lastShot = this.time
    this.heat = Math.min(1, this.heat + GAME.blaster.heatPerShot)
    if (this.heat >= 1) {
      this.overheated = true
      sfx.play('overheat', originWorld)
      this.say('Blaster überhitzt!')
    }
    const o = this.toLocal(originWorld)
    const tip = this.toLocal(_v1.copy(originWorld).add(dirWorld))
    const dir = tip.sub(o).normalize()
    this.bolts.push({ pos: o, dir, life: 1.4, maxDist, travelled: 0 })
    sfx.play('blaster', originWorld)
    this.particles.emit(o, null, '#d8ff6a', { size: 0.05, life: 0.08, grow: 1.5 })
    return true
  }

  /** Next world click / trigger fires the orbital strike at the aim point. */
  armOrbital() {
    if (this.ult < 1) {
      this.deny(`Orbitalschlag lädt … ${Math.floor(this.ult * 100)}%`)
      return
    }
    this.orbitalArmed = true
    this.selectedTower = null
    this.say('Ziel wählen: Trigger / Pinch / Klick auf eine Fläche')
  }

  orbitalStrike(pointWorld: Vector3 | null) {
    this.orbitalArmed = false
    if (this.phase !== 'wave' && this.phase !== 'build') return
    if (this.ult < 1) {
      this.deny(`Orbitalschlag lädt … ${Math.floor(this.ult * 100)}%`)
      return
    }
    if (!pointWorld) {
      sfx.play('denied')
      return
    }
    const p = this.toLocal(pointWorld)
    p.y = Math.max(p.y, this.room.floorY)
    this.ult = 0
    this.strikes.push({ pos: p, t: 0, fired: false })
    sfx.play('orbitalCharge', pointWorld)
    this.haptic(1, 120)
    this.say('Orbitalschlag angefordert!')
  }

  // ---------------------------------------------------------------- enemies

  private spawn(type: EnemyType, riftIndex: number, at?: Vector3) {
    const def = ENEMIES[type]
    const e = this.pool.pop() ?? ({ pos: new Vector3(), vel: new Vector3(), normal: new Vector3() } as Enemy)
    e.id = nextId++
    e.type = type
    e.def = def
    const w = Math.max(1, this.wave)
    const bossMul = def.boss === 2 ? 0.8 : def.boss === 1 ? 0.85 : 1
    e.maxHp = e.hp = Math.round(def.hp * hpScale(w) * bossMul)
    e.shieldMax = e.shield = Math.round(e.maxHp * def.shield)
    e.shieldT = 0
    e.yaw = 0
    e.t = 0
    e.slowT = 0
    e.slowF = 0
    e.flash = 0
    e.phase = Math.random() * 6.28
    e.speedMul = 0.9 + Math.random() * 0.2
    e.dmgAcc = 0
    e.dmgAccT = 0
    e.progress = 1e6
    e.orbitSign = Math.random() < 0.5 ? -1 : 1
    e.spawnTimer = def.boss === 2 ? 4 : 6
    e.healT = 1 + Math.random()
    e.rift = 0
    e.rewarded = false
    e.vel.set(0, 0, 0)
    if (at) {
      e.pos.copy(at)
      e.state = def.flying ? 'fly' : 'walk'
      e.scale = 0.2
      e.normal.set(0, 0, 1)
    } else {
      const ri = riftIndex % Math.max(1, this.rifts.length)
      const r = this.rifts[ri]
      if (!r) return
      e.rift = ri
      const side = _v1.crossVectors(UP, r.normal).normalize()
      e.pos
        .copy(r.center)
        .addScaledVector(side, (Math.random() - 0.5) * r.width * 0.45)
        .addScaledVector(UP, (Math.random() - 0.5) * r.height * 0.3)
      e.normal.copy(r.normal)
      e.state = 'emerge'
      e.scale = 0.15
      e.yaw = Math.atan2(r.normal.x, r.normal.z)
      r.pulse = Math.min(1, r.pulse + (def.boss ? 1 : 0.4))
      this.particles.burst(e.pos, def.boss ? '#ff3d8b' : '#c04bff', def.boss ? 40 : 10, def.boss ? 1 : 0.5, { size: 0.03, life: 0.5 })
    }
    this.enemies.push(e)
  }

  private damage(e: Enemy, amount: number, kind: DamageKind) {
    if (e.state === 'dying') return
    let shown = 0
    if (e.shield > 0) {
      const mul = kind === 'tesla' ? 2 : kind === 'frost' ? 0.5 : 1
      const absorbed = Math.min(e.shield, amount * mul)
      e.shield -= absorbed
      e.shieldT = 0
      amount -= absorbed / mul
      shown += absorbed
      if (e.shield <= 0) {
        e.shield = 0
        this.particles.burst(this.enemyCenter(e, _v1), '#7fd8ff', 24, 0.9, { size: 0.022, life: 0.5 })
        sfx.play('shieldBreak', this.toWorld(_v1, _v2))
      }
    }
    if (amount > 0) {
      const armor = e.def.armor * (kind === 'mortar' || kind === 'orbital' ? 0.4 : 1)
      const dmg = amount * (1 - armor)
      e.hp -= dmg
      shown += dmg
    }
    e.flash = kind === 'laser' ? Math.max(e.flash, 0.25) : 1
    e.dmgAcc += shown
    if (kind !== 'laser' || (e.dmgAccT <= 0 && e.dmgAcc >= 5) || e.hp <= 0) {
      const big = e.dmgAcc >= 40
      const color = e.shield > 0 ? '#7fd8ff' : KIND_COLOR[kind]
      this.numbers.spawn(_v1.copy(e.pos).setY(e.pos.y + e.def.height * 2 + 0.08), String(Math.max(1, Math.round(e.dmgAcc))), color, big ? 1.35 : 1)
      e.dmgAcc = 0
      e.dmgAccT = 0.28
    }
    if (e.hp <= 0) this.kill(e, true)
  }

  private kill(e: Enemy, reward: boolean) {
    e.state = 'dying'
    e.t = 0
    const center = _v1.copy(e.pos).setY(e.pos.y + e.def.height)
    if (reward && !e.rewarded) {
      e.rewarded = true
      const gain = Math.round(e.def.reward * rewardScale(this.wave))
      this.credits += gain
      this.kills++
      this.score += gain * 10
      this.ult = Math.min(1, this.ult + GAME.ultimate.chargePerKill * e.def.ult)
      this.numbers.spawn(_v2.copy(center).setY(center.y + 0.12), `+${gain}`, '#ffe36a', 0.8)
      if (e.def.split > 0) {
        for (let s = 0; s < e.def.split; s++) {
          const a = (s / e.def.split) * Math.PI * 2 + Math.random()
          const p = _v3.copy(e.pos).add(_v4.set(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08))
          if (!this.nav.isFree(p.x, p.z)) p.copy(e.pos)
          this.spawn('mite', 0, p)
        }
        sfx.play('split', this.toWorld(center, _v2))
      }
    }
    const big = e.def.boss > 0
    const glow = e.def.color
    this.particles.burst(center, glow, big ? 160 : e.type === 'tank' || e.type === 'shielded' ? 45 : 24, big ? 2.4 : 1.1, { size: big ? 0.06 : 0.028, life: big ? 1.4 : 0.7, gravity: 1.2 })
    this.particles.burst(center, '#ffffff', big ? 40 : 6, big ? 1.5 : 0.6, { size: 0.02, life: 0.3 })
    sfx.play(big ? 'bossDeath' : 'enemyDeath', this.toWorld(center))
    if (big) this.haptic(0.9, 200)
  }

  private coreHit(e: Enemy) {
    this.coreHp = Math.max(0, this.coreHp - e.def.coreDamage)
    this.core.hit(e.pos)
    sfx.play('coreHit', this.toWorld(this.corePos))
    this.haptic(0.5, 70)
    this.particles.burst(e.pos, '#5ff6ff', 30, 1.2, { size: 0.025, life: 0.5 })
    this.numbers.spawn(_v1.copy(this.corePos).setY(this.corePos.y + 0.5), `-${e.def.coreDamage}`, '#ff4d6a', 1.3)
    e.rewarded = true
    this.kill(e, false)
    if (this.coreHp <= 0 && this.phase === 'wave') {
      this.commitScore()
      this.setPhase('gameover')
      sfx.play('gameOver')
      this.say(this.endless ? `Endlos-Modus beendet: Welle ${this.wave} erreicht` : 'Der Kern ist gefallen …')
      this.particles.burst(_v1.copy(this.corePos).setY(this.corePos.y + 0.2), '#ff3d5c', 200, 2.2, { size: 0.05, life: 1.5, gravity: 0.4 })
      this.core.hide()
    }
  }

  private updateEnemies(dt: number) {
    const floorY = this.room.floorY
    const core = this.corePos
    const coreCenterY = core.y + 0.17
    const list = this.enemies
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i]
      e.t += dt
      e.flash = Math.max(0, e.flash - dt * 5)
      e.dmgAccT -= dt
      if (e.slowT > 0) {
        e.slowT -= dt
        if (e.slowT <= 0) e.slowF = 0
      }
      const slowMul = 1 - e.slowF * (e.def.boss ? 0.5 : 1)
      const sp = e.def.speed * e.speedMul * slowMul
      if (e.state === 'dying') {
        if (e.t > 0.75) {
          list.splice(i, 1)
          this.pool.push(e)
        }
        continue
      }
      if (e.state !== 'emerge') e.scale = Math.min(1, e.scale + dt * 3)
      // energy shield regenerates after a few quiet seconds
      if (e.shieldMax > 0) {
        e.shieldT += dt
        if (e.shieldT > 3 && e.shield < e.shieldMax) e.shield = Math.min(e.shieldMax, e.shield + e.shieldMax * 0.12 * dt)
        if (e.shield > 0) {
          const f = e.shield / e.shieldMax
          this.glow.add(this.enemyCenter(e, _v1), '#3fa8ff', e.def.radius * 2.6 * e.scale, 0.12 + 0.25 * f)
        }
      }
      if (e.def.heal > 0 && e.state !== 'emerge' && e.state !== 'fall') this.updateHealer(e, dt)
      switch (e.state) {
        case 'emerge': {
          e.scale = Math.min(1, 0.15 + e.t * 1.4)
          e.pos.addScaledVector(e.normal, dt * 0.3)
          if (e.t > 0.65) {
            e.t = 0
            if (e.def.flying) {
              e.state = 'fly'
              e.vel.copy(e.normal).multiplyScalar(0.4)
            } else {
              // jump so the creature lands exactly on the free floor spot below its rift
              e.state = 'fall'
              const r = this.rifts[e.rift]
              const vy = 0.6
              const h = Math.max(0, e.pos.y - floorY)
              const tFall = (vy + Math.sqrt(vy * vy + 2 * 9.8 * h)) / 9.8
              let tx = e.pos.x + e.normal.x * 0.4
              let tz = e.pos.z + e.normal.z * 0.4
              if (r) {
                const side = (Math.random() - 0.5) * 0.18
                tx = r.drop.x - r.normal.z * side
                tz = r.drop.z + r.normal.x * side
                if (!this.nav.isFree(tx, tz)) {
                  tx = r.drop.x
                  tz = r.drop.z
                }
              }
              e.vel.set((tx - e.pos.x) / tFall, vy, (tz - e.pos.z) / tFall)
            }
          }
          break
        }
        case 'fall': {
          e.vel.y -= 9.8 * dt
          e.pos.addScaledVector(e.vel, dt)
          if (e.pos.y <= floorY) {
            e.pos.y = floorY
            if (this.nav.isStaticBlocked(e.pos.x, e.pos.z)) {
              this.nav.nearestFree(e.pos.x, e.pos.z, tmp2)
              e.pos.x = tmp2.x
              e.pos.z = tmp2.z
            }
            e.state = 'walk'
            e.vel.set(e.normal.x * sp, 0, e.normal.z * sp)
            const big = e.def.boss > 0 || e.type === 'tank' || e.type === 'shielded'
            this.particles.burst(e.pos, '#9a6bff', big ? 24 : 8, big ? 0.9 : 0.4, { size: big ? 0.04 : 0.02, life: 0.5 })
            sfx.play('land', this.toWorld(e.pos), big ? 3 : 1)
          }
          break
        }
        case 'walk': {
          let tx = core.x
          let tz = core.z
          if (this.nav.steer(e.pos.x, e.pos.z, tmp2)) {
            tx = tmp2.x
            tz = tmp2.z
          }
          let dx = tx - e.pos.x
          let dz = tz - e.pos.z
          const len = Math.hypot(dx, dz) || 1
          dx /= len
          dz /= len
          const k = Math.min(1, dt * 7)
          e.vel.x += (dx * sp - e.vel.x) * k
          e.vel.z += (dz * sp - e.vel.z) * k
          e.vel.y = 0
          e.pos.addScaledVector(e.vel, dt)
          e.pos.y = floorY
          const d = Math.hypot(core.x - e.pos.x, core.z - e.pos.z)
          const nd = this.nav.distAt(e.pos.x, e.pos.z)
          e.progress = Number.isFinite(nd) ? nd * this.nav.cell : d
          if (d < GAME.coreRadius + e.def.radius + 0.18 || nd === 0) {
            e.state = 'assault'
            e.t = 0
          }
          if (e.def.boss > 0) {
            e.spawnTimer -= dt
            if (e.spawnTimer <= 0) {
              const boss = e.def.boss === 2
              e.spawnTimer = boss ? 5 : 6
              const kind: EnemyType = boss ? 'swarmer' : 'mite'
              for (let s = 0; s < (boss ? 3 : 2); s++) {
                const p = _v2.copy(e.pos).add(_v3.set(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(0.5))
                if (this.nav.isFree(p.x, p.z)) this.spawn(kind, 0, p)
              }
              this.particles.burst(_v2.copy(e.pos).setY(e.pos.y + 0.25), e.def.color, 40, 1, { size: 0.03, life: 0.6 })
            }
          }
          break
        }
        case 'assault': {
          _v1.set(core.x, coreCenterY - 0.1, core.z)
          _v2.subVectors(_v1, e.pos)
          const d = _v2.length()
          e.progress = d * 0.5
          if (d < GAME.coreRadius * 0.8 + e.def.radius) {
            this.coreHit(e)
            break
          }
          _v2.divideScalar(d || 1)
          const k = Math.min(1, dt * 6)
          e.vel.x += (_v2.x * sp - e.vel.x) * k
          e.vel.y += (_v2.y * sp - e.vel.y) * k
          e.vel.z += (_v2.z * sp - e.vel.z) * k
          e.pos.addScaledVector(e.vel, dt)
          if (e.pos.y < floorY) e.pos.y = floorY
          break
        }
        case 'fly': {
          _v1.set(core.x - e.pos.x, 0, core.z - e.pos.z)
          const d = _v1.length() || 1
          _v1.divideScalar(d)
          _v2.set(-_v1.z, 0, _v1.x).multiplyScalar(e.orbitSign)
          const cruise = floorY + 1.0 + 0.3 * Math.sin(e.t * 1.3 + e.phase)
          const alt = d < 0.9 ? coreCenterY + (cruise - coreCenterY) * (d / 0.9) : cruise
          const orbit = Math.min(1, d / 1.4) * 0.75
          const k = Math.min(1, dt * 2.5)
          e.vel.x += ((_v1.x * 0.85 + _v2.x * orbit) * sp - e.vel.x) * k
          e.vel.z += ((_v1.z * 0.85 + _v2.z * orbit) * sp - e.vel.z) * k
          e.vel.y += ((alt - e.pos.y) * 1.6 - e.vel.y) * k
          e.pos.addScaledVector(e.vel, dt)
          const d3 = Math.hypot(core.x - e.pos.x, coreCenterY - e.pos.y, core.z - e.pos.z)
          e.progress = d3
          if (d3 < this.core.shieldRadius + e.def.radius * 0.5) this.coreHit(e)
          break
        }
      }
      if ((e.state as EnemyState) !== 'dying' && (e.vel.x !== 0 || e.vel.z !== 0)) {
        const targetYaw = Math.atan2(e.vel.x, e.vel.z)
        let dy = targetYaw - e.yaw
        dy = Math.atan2(Math.sin(dy), Math.cos(dy))
        e.yaw += dy * Math.min(1, dt * 8)
      }
    }
  }

  private updateHealer(e: Enemy, dt: number) {
    e.healT -= dt
    const c = this.enemyCenter(e, _v1)
    this.glow.add(_v2.copy(c).setY(c.y + 0.05), '#5aff9a', 0.05 + 0.02 * Math.sin(this.time * 6 + e.phase), 0.8)
    if (e.healT > 0) return
    e.healT = 2.4
    const r2 = 0.7 * 0.7
    let healed = 0
    for (const o of this.enemies) {
      if (o === e || o.state === 'dying' || o.hp >= o.maxHp) continue
      if (o.pos.distanceToSquared(e.pos) > r2) continue
      o.hp = Math.min(o.maxHp, o.hp + o.maxHp * e.def.heal)
      healed++
      this.particles.burst(this.enemyCenter(o, _v3), '#5aff9a', 6, 0.4, { size: 0.02, life: 0.5, gravity: -0.6 })
    }
    if (healed) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2
        this.particles.emit(_v3.copy(e.pos).setY(e.pos.y + 0.03), _v4.set(Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2), '#5aff9a', { size: 0.022, life: 0.45, drag: 2.5 })
      }
      sfx.play('heal', this.toWorld(c, _v2))
    }
  }

  private renderEnemies() {
    const r = this.enemyRenderer
    r.begin(this.time)
    for (const e of this.enemies) {
      _q.setFromAxisAngle(UP, e.yaw)
      if (e.type === 'flyer') _q.multiply(_q2.setFromAxisAngle(AXIS_Z, Math.sin(this.time * 2 + e.phase) * 0.35))
      if (e.state === 'fall' || e.state === 'emerge') {
        const tilt = e.state === 'emerge' ? -0.5 : Math.min(0.6, e.t * 2) - 0.3
        _q.multiply(_q2.setFromAxisAngle(AXIS_X, tilt))
      }
      const s = e.scale
      _s.set(s, s, s)
      _m.compose(e.pos, _q, _s)
      const dissolve = e.state === 'dying' ? Math.min(1, e.t / 0.7) * 1.05 : 0
      r.push(e.type, _m, dissolve, e.flash, e.phase, e.slowF > 0 ? 1 : 0)
    }
    r.end()
  }

  // ---------------------------------------------------------------- towers update

  private findTarget(t: Tower, origin: Vector3, range: number, hitsAir: boolean): Enemy | null {
    let best: Enemy | null = null
    let bestS = Infinity
    const r2 = range * range
    const mode = t.targeting
    for (const e of this.enemies) {
      if (e.state === 'dying' || e.state === 'emerge') continue
      if (e.def.flying && !hitsAir) continue
      if (!e.def.flying && t.type === 'mortar' && e.state === 'fall') continue
      const d2 = _v1.copy(e.pos).setY(e.pos.y + e.def.height).distanceToSquared(origin)
      if (d2 > r2) continue
      if (t.type === 'mortar' && d2 < 0.3 * 0.3) continue
      const s = mode === 'first' ? e.progress : mode === 'last' ? -e.progress : mode === 'strong' ? -(e.hp + e.shield) : d2
      if (s < bestS) {
        bestS = s
        best = e
      }
    }
    return best
  }

  private enemyCenter(e: Enemy, out: Vector3) {
    return out.copy(e.pos).setY(e.pos.y + e.def.height * e.scale + 0.01)
  }

  private updateTowers(dt: number) {
    const active = this.phase === 'wave' || this.phase === 'build'
    for (const t of this.towers) {
      const def = TOWERS[t.type]
      const model = t.model
      if (t.buildT < 1) {
        t.buildT = Math.min(1, t.buildT + dt / 1.15)
        if (t.buildT >= 1) {
          this.particles.burst(_v1.copy(t.pos).setY(t.pos.y + model.height * 0.6), '#7ff6ff', 26, 0.7, { size: 0.02, life: 0.5 })
        }
      }
      model.build.value = t.buildT
      model.baseY.value = this.toWorld(t.pos, _v1).y
      const holoOpacity = t.buildT < 1 ? 0.75 : 0
      for (const h of model.holo) h.visible = holoOpacity > 0
      for (const s of model.spin) s.rotation.y += dt * (t.type === 'tesla' ? 2.5 : 0.8)
      model.orbit.rotation.y += dt * 1.4
      // hover / selection highlight and upgrade bounce
      const hl = t === this.selectedTower ? 1 : t === this.aim.tower ? 0.6 : 0
      model.highlight += (hl - model.highlight) * Math.min(1, dt * 10)
      model.accent.emissiveIntensity = (2.6 + (t.level - 1) * 0.9) * (1 + model.highlight * 0.7 + t.pulse * 1.5)
      if (t.pulse > 0) {
        t.pulse = Math.max(0, t.pulse - dt * 1.8)
        model.root.scale.setScalar(t.levelScale * (1 + 0.18 * Math.sin(t.pulse * Math.PI)))
      }
      if (t.buildT < 1 || !active) continue

      const muzzle = this.toLocal(model.muzzle.getWorldPosition(_muzzle), _muzzle)
      const st = t.stats
      const range = st.range
      t.cooldown -= dt
      if (t.target && (t.target.state === 'dying' || this.enemyCenter(t.target, _v1).distanceTo(muzzle) > range || !this.enemies.includes(t.target))) {
        t.target = null
      }
      if (!t.target || t.type === 'mortar' || t.targeting !== 'first') t.target = this.findTarget(t, muzzle, range, def.hitsAir)
      const target = t.target
      if (target) {
        const c = this.enemyCenter(target, _v3)
        const yaw = Math.atan2(c.x - t.pos.x, c.z - t.pos.z)
        let dy = yaw - t.yaw
        dy = Math.atan2(Math.sin(dy), Math.cos(dy))
        t.yaw += dy * Math.min(1, dt * 10)
        if (t.type === 'laser') {
          const horiz = Math.hypot(c.x - muzzle.x, c.z - muzzle.z)
          model.barrel.rotation.x = -Math.atan2(c.y - muzzle.y, horiz)
        }
      } else {
        t.yaw += dt * 0.3
      }
      if (t.type !== 'tesla' && t.type !== 'frost') model.turret.rotation.y = t.yaw

      switch (t.type) {
        case 'laser': {
          if (!target) break
          const c = this.enemyCenter(target, _v3)
          const pulse = 0.75 + 0.25 * Math.sin(this.time * 40)
          this.beams.add(muzzle, c, 0.006 * pulse * (1 + (t.level - 1) * 0.25), def.color, 1)
          this.beams.add(muzzle, c, 0.0022, '#ffffff', 0.9)
          this.glow.add(c, def.color, 0.07 * pulse)
          this.glow.add(muzzle, '#ffd0e8', 0.05)
          if (Math.random() < dt * 30) {
            this.particles.emit(c, _v1.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5), def.color, { size: 0.015, life: 0.3, gravity: 1.5 })
          }
          this.damage(target, st.damage * dt, 'laser')
          t.soundT -= dt
          if (t.soundT <= 0) {
            t.soundT = 0.22
            sfx.play('laser', this.toWorld(muzzle, _v1))
          }
          break
        }
        case 'tesla': {
          if (!target || t.cooldown > 0) break
          t.cooldown = st.interval
          const chain = st.chain
          let last = target
          let from = _v2.copy(muzzle)
          for (let k = 0; k < chain; k++) {
            const e = k === 0 ? target : this.nearestUnchained(last, t.id)
            if (!e) break
            const to = this.enemyCenter(e, new Vector3())
            this.arcs.push({ a: from.clone(), b: to, life: 0.16, color: new Color(def.color) })
            this.particles.burst(to, '#bfe8ff', 6, 0.6, { size: 0.018, life: 0.25 })
            this.damage(e, st.damage * Math.pow(0.82, k), 'tesla')
            this.chainMark.set(e, t.id)
            from = _v2.copy(to)
            last = e
          }
          this.chainMark.clear()
          this.glow.add(muzzle, '#bfe8ff', 0.12)
          sfx.play('tesla', this.toWorld(muzzle, _v1))
          break
        }
        case 'mortar': {
          if (!target || t.cooldown > 0) break
          t.cooldown = st.interval
          const c = this.enemyCenter(target, _v3)
          const dist = Math.hypot(c.x - muzzle.x, c.z - muzzle.z)
          const T = Math.min(1.5, Math.max(0.7, dist / 1.5))
          const pred = c.clone().addScaledVector(target.vel, T * 0.9)
          pred.y = target.def.flying ? c.y : this.room.floorY + 0.02
          const g = 9.8 * 0.55
          const vel = new Vector3((pred.x - muzzle.x) / T, (pred.y - muzzle.y + 0.5 * g * T * T) / T, (pred.z - muzzle.z) / T)
          this.shells.push({ pos: muzzle.clone(), vel, t: 0, T, damage: st.damage, splash: st.splash })
          this.particles.burst(muzzle, '#ffb35a', 12, 0.7, { size: 0.03, life: 0.35 })
          sfx.play('mortarLaunch', this.toWorld(muzzle, _v1))
          break
        }
        case 'frost': {
          if (!target || t.cooldown > 0) break
          t.cooldown = st.interval
          for (const e of this.enemies) {
            if (e.state === 'dying') continue
            if (this.enemyCenter(e, _v1).distanceTo(muzzle) > range) continue
            e.slowT = 2.2
            e.slowF = Math.max(e.slowF, st.slow)
            this.damage(e, st.damage, 'frost')
            this.particles.burst(_v1, '#dffbff', 4, 0.4, { size: 0.02, life: 0.5, gravity: 0.6 })
          }
          // expanding ring of ice shards
          const n = 34
          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2
            _v1.set(Math.cos(a), 0, Math.sin(a))
            this.particles.emit(_v3.copy(t.pos).setY(t.pos.y + 0.04), _v1.multiplyScalar(range * 1.6), k % 3 ? '#9ef0ff' : '#ffffff', {
              size: 0.03,
              life: 0.55,
              drag: 2.2,
            })
          }
          this.glow.add(muzzle, '#c8f8ff', 0.14)
          sfx.play('frost', this.toWorld(muzzle, _v1))
          break
        }
      }
    }
  }

  private chainMark = new Map<Enemy, number>()

  private nearestUnchained(from: Enemy, towerId: number) {
    let next: Enemy | null = null
    let bd = 0.6 * 0.6
    for (const e of this.enemies) {
      if (e.state === 'dying' || e === from || this.chainMark.get(e) === towerId) continue
      const d2 = e.pos.distanceToSquared(from.pos)
      if (d2 < bd) {
        bd = d2
        next = e
      }
    }
    return next
  }

  private updateProjectiles(dt: number) {
    const g = 9.8 * 0.55
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i]
      s.t += dt
      s.vel.y -= g * dt
      s.pos.addScaledVector(s.vel, dt)
      this.glow.add(s.pos, '#ffb04a', 0.07)
      this.glow.add(s.pos, '#ffffff', 0.025)
      if (Math.random() < 0.8) this.particles.emit(s.pos, null, '#ff8a2a', { size: 0.03, life: 0.35, grow: 0 })
      if (s.t >= s.T || s.pos.y < this.room.floorY) {
        this.shells.splice(i, 1)
        for (const e of this.enemies) {
          if (e.state === 'dying') continue
          const d = this.enemyCenter(e, _v1).distanceTo(s.pos)
          if (d < s.splash + e.def.radius) this.damage(e, s.damage * (1 - (d / (s.splash + e.def.radius)) * 0.5), 'mortar')
        }
        this.particles.burst(s.pos, '#ffb04a', 46, 1.6, { size: 0.04, life: 0.6, gravity: 2 })
        this.particles.burst(s.pos, '#ff5a1f', 20, 0.9, { size: 0.06, life: 0.4 })
        this.particles.emit(s.pos, null, '#fff2c0', { size: s.splash * 2.2, life: 0.18, grow: 1.4 })
        sfx.play('explosion', this.toWorld(s.pos, _v1))
      }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      const step = GAME.blaster.speed * dt
      const start = _v3.copy(b.pos)
      b.pos.addScaledVector(b.dir, step)
      b.travelled += step
      b.life -= dt
      let consumed = false
      for (const e of this.enemies) {
        if (e.state === 'dying' || e.state === 'emerge') continue
        const c = this.enemyCenter(e, _v1)
        _ray.set(start, b.dir)
        const along = _v2.subVectors(c, start).dot(b.dir)
        if (along < -0.05 || along > step + 0.05) continue
        const r = e.def.radius * e.scale + 0.035
        if (_ray.distanceSqToPoint(c) < r * r) {
          this.damage(e, GAME.blaster.damage * (1 + Math.min(this.wave, 50) * 0.04), 'blaster')
          this.particles.burst(c, '#d8ff6a', 10, 0.8, { size: 0.02, life: 0.3 })
          consumed = true
          break
        }
      }
      if (!consumed && b.travelled >= b.maxDist) {
        this.particles.burst(b.pos, '#d8ff6a', 6, 0.5, { size: 0.018, life: 0.25 })
        consumed = true
      }
      if (consumed || b.life <= 0) {
        this.bolts.splice(i, 1)
        continue
      }
      _v1.copy(b.pos).addScaledVector(b.dir, -0.14)
      this.beams.add(_v1, b.pos, 0.006, '#c9ff5a', 1)
      this.glow.add(b.pos, '#d8ff6a', 0.05)
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i]
      a.life -= dt
      if (a.life <= 0) {
        this.arcs.splice(i, 1)
        continue
      }
      this.beams.lightning(a.a, a.b, a.color, 0.004, 8, 0.06, Math.min(1, a.life * 10))
      this.beams.lightning(a.a, a.b, '#ffffff', 0.0018, 8, 0.05, 0.8)
    }
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i]
      s.t += dt
      const top = _v1.copy(s.pos).setY(this.room.floorY + 3.2)
      if (!s.fired) {
        const k = s.t / GAME.ultimate.delay
        const n = 24
        for (let j = 0; j < n; j++) {
          const a = (j / n) * Math.PI * 2 + s.t * 2
          _v2.set(s.pos.x + Math.cos(a) * GAME.ultimate.radius * (1.2 - k * 0.3), s.pos.y + 0.02, s.pos.z + Math.sin(a) * GAME.ultimate.radius * (1.2 - k * 0.3))
          this.glow.add(_v2, '#ff5af0', 0.05 + k * 0.04)
        }
        this.beams.add(s.pos, top, 0.004 + k * 0.01, '#ffd6ff', 0.4 + k * 0.6)
        if (s.t >= GAME.ultimate.delay) {
          s.fired = true
          s.t = 0
          const dmg = GAME.ultimate.damage * hpScale(Math.max(1, this.wave)) * 0.8
          for (const e of this.enemies) {
            if (e.state === 'dying') continue
            const dh = Math.hypot(e.pos.x - s.pos.x, e.pos.z - s.pos.z)
            if (dh < GAME.ultimate.radius + e.def.radius) this.damage(e, dmg, 'orbital')
          }
          this.particles.burst(_v2.copy(s.pos).setY(s.pos.y + 0.05), '#ffffff', 80, 2.8, { size: 0.05, life: 0.8, gravity: 1 })
          this.particles.burst(_v2, '#ff5af0', 120, 2.2, { size: 0.06, life: 1.2, gravity: 0.6 })
          for (let j = 0; j < 48; j++) {
            const a = (j / 48) * Math.PI * 2
            this.particles.emit(_v2, _v3.set(Math.cos(a) * 2.6, 0.05, Math.sin(a) * 2.6), '#ffb8ff', { size: 0.07, life: 0.6, drag: 3 })
          }
          sfx.play('orbitalImpact', this.toWorld(s.pos, _v3))
          this.haptic(1, 250)
        }
      } else {
        const k = 1 - s.t / 0.6
        if (k <= 0) {
          this.strikes.splice(i, 1)
          continue
        }
        this.beams.add(s.pos, top, 0.16 * k + 0.02, '#ff5af0', k)
        this.beams.add(s.pos, top, 0.06 * k + 0.01, '#ffffff', k)
        this.glow.add(_v2.copy(s.pos).setY(s.pos.y + 0.1), '#ffffff', 0.9 * k)
      }
    }
  }

  private updateRifts(dt: number) {
    const n = this.rifts.length
    for (const r of this.rifts) {
      r.attention = Math.max(0, r.attention - dt)
      if (!r.opened) {
        if (this.introT < r.delay) continue
        // tear open: sound from the rift's direction, flash, indicator
        r.opened = true
        r.attention = 7
        r.pulse = 1
        r.visual.group.visible = true
        r.visual.floorGlow.visible = true
        const world = this.toWorld(r.center)
        sfx.play('riftOpen', world)
        sfx.startDrone(world)
        this.haptic(0.5, 120)
        this.particles.burst(_v1.copy(r.center).addScaledVector(r.normal, 0.05), '#d58bff', 70, 1.4, { size: 0.03, life: 0.9 })
        this.particles.burst(_v1, '#ffffff', 20, 0.8, { size: 0.025, life: 0.4 })
        this.say(n > 1 ? `Riss ${r.index + 1} von ${n} öffnet sich${r.floating ? ' (schwebend)' : ''}` : 'Ein Riss öffnet sich')
        if (r.index === n - 1) window.setTimeout(() => this.phase === 'build' && this.say('Alle Risse sind offen. Baue Türme und starte die erste Welle!'), 2600)
      }
      r.open = Math.min(1, r.open + dt * 0.45)
      r.pulse = Math.max(0, r.pulse - dt * 0.8)
      const closing = this.phase === 'victory'
      const u = r.visual.uniforms
      u.uTime.value += dt
      u.uOpen.value = closing ? Math.max(0, u.uOpen.value - dt * 0.35) : easeOutBack(r.open)
      u.uPulse.value = r.pulse
      if (!closing && r.open < 1 && Math.random() < dt * 30) {
        _v1.copy(r.center).add(_v2.set((Math.random() - 0.5) * r.width, (Math.random() - 0.5) * r.height, 0).applyAxisAngle(UP, Math.atan2(r.normal.x, r.normal.z)))
        this.particles.emit(_v1, _v2.copy(r.normal).multiplyScalar(0.3).setY(-0.2), '#b46bff', { size: 0.025, life: 0.6 })
      }
      if (!closing && Math.random() < dt * 4) {
        _v1.copy(r.center).addScaledVector(r.normal, 0.04)
        this.particles.emit(
          _v1.add(_v2.set((Math.random() - 0.5) * r.width * 0.6, (Math.random() - 0.5) * r.height * 0.6, 0).applyAxisAngle(UP, Math.atan2(r.normal.x, r.normal.z))),
          _v3.copy(r.normal).multiplyScalar(0.1 + Math.random() * 0.15),
          Math.random() < 0.5 ? '#ff4fe0' : '#7f5bff',
          { size: 0.02, life: 1.2, drag: 0.5 },
        )
      }
    }
  }

  // ---------------------------------------------------------------- frame

  update(dtRaw: number, camera: Camera) {
    const dt = Math.min(dtRaw, 1 / 20)
    this.time += dt
    this.camera = camera
    camera.getWorldPosition(this.playerPos)
    sfx.updateListener(camera)

    if (this.phase === 'scan') {
      this.scanT += dt
      const ready = this.room.source === 'xr' && (this.scanT > 1.5 || this.room.walls.length > 0)
      if (ready || this.scanT > 5) {
        if (this.room.source !== 'xr') {
          this.room = createFallbackRoomModel(this.playerPos, 0)
          this.say('Keine Raumdaten – virtuelle Spielfläche aktiv. Ziele auf den Boden und drücke den Trigger.')
        } else {
          this.say(`Raum erkannt (${this.room.walls.length} Wände, ${this.room.obstacles.length} Möbel). Platziere den Kern!`)
        }
        this.setPhase('placeCore')
      }
    }

    if (this.corePlaced) this.introT += dt

    if (this.phase === 'wave') {
      this.waveTime += dt
      while (this.queue.length && this.queue[0].t <= this.waveTime) {
        const ev = this.queue.shift()!
        this.spawn(ev.type, ev.rift)
      }
      this.ult = Math.min(1, this.ult + GAME.ultimate.chargePerSecond * dt)
    }

    this.blasterCd -= dt
    if (this.time - this.lastShot > 0.18) this.heat = Math.max(0, this.heat - GAME.blaster.coolRate * dt)
    if (this.overheated && this.heat < 0.3) this.overheated = false

    this.beams.begin(this.time)
    this.glow.begin()

    this.updateRifts(dt)
    this.updateEnemies(dt)
    this.updateTowers(dt)
    this.updateProjectiles(dt)
    this.renderEnemies()

    if (this.corePlaced) this.core.update(dt, this.coreHp / GAME.coreHp)

    this.particles.update(dt)
    this.glow.end()
    this.beams.end()
    this.numbers.update(dt)

    if (this.phase === 'wave' && this.queue.length === 0 && !this.enemies.some((e) => e.state !== 'dying')) {
      this.waveComplete()
    }

    this.uiT -= dtRaw
    if (this.uiT <= 0) {
      this.uiT = 0.1
      this.syncUI(false)
    }
  }

  get aliveCount() {
    let n = 0
    for (const e of this.enemies) if (e.state !== 'dying') n++
    return n + this.queue.length
  }

  syncUI(force: boolean) {
    const s = useUI.getState()
    const pv = this.corePlaced ? this.preview : null
    const sel = this.selectedTower
    const next: Partial<UIState> = {
      phase: this.phase,
      xr: this.mode === 'xr',
      wave: this.wave,
      totalWaves: GAME.totalWaves,
      endless: this.endless,
      credits: this.credits,
      coreHp: Math.ceil(this.coreHp),
      coreMax: GAME.coreHp,
      selected: this.selected,
      ult: Math.floor(this.ult * 100) / 100,
      heat: Math.round(this.heat * 20) / 20,
      overheated: this.overheated,
      enemiesAlive: this.aliveCount,
      kills: this.kills,
      towers: this.towers.length,
      hoverInfo: this.hoverInfo,
      message: this.message,
      messageKey: this.messageKey,
      roomSource: this.room.source,
      score: this.score,
      highScore: this.highScore,
      highWave: this.highWave,
      preview: pv,
      selectedTowerId: sel ? sel.id : 0,
      selectedTowerLevel: sel ? sel.level : 0,
      intro: this.introActive,
      orbitalArmed: this.orbitalArmed,
    }
    let changed = force
    for (const k in next) {
      if ((s as unknown as Record<string, unknown>)[k] !== (next as Record<string, unknown>)[k]) {
        changed = true
        break
      }
    }
    if (changed) useUI.setState(next)
  }

  /** world-space camera, available after the first frame */
  get activeCamera() {
    return this.camera
  }
}

function isVisible(o: Object3D) {
  let p: Object3D | null = o
  while (p) {
    if (!p.visible) return false
    p = p.parent
  }
  return true
}

function easeOutBack(x: number) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

export const game = new Game()
