import { Camera, Color, Group, Matrix4, Mesh, Object3D, Plane, Quaternion, Ray, Raycaster, Vector3 } from 'three'
import { Beams } from '../fx/Beams'
import { CoreVisual } from '../fx/Core'
import { DamageNumbers } from '../fx/DamageNumbers'
import { EnemyRenderer } from '../fx/Enemies'
import { GlowBatch, GlowSprites } from '../fx/GlowSprites'
import { createRiftVisual, type RiftVisual } from '../fx/Rift'
import { createTowerModel, disposeTowerModel, setTowerLevelVisual, type TowerModel } from '../fx/Towers'
import { sfx } from './audio'
import {
  buildWave,
  ENEMIES,
  GAME,
  hpScale,
  MAX_TOWER_LEVEL,
  TOWER_ORDER,
  TOWERS,
  type EnemyDef,
  type EnemyType,
  type SpawnEvent,
  type TowerType,
} from './config'
import { NavGrid } from './nav'
import { createFallbackRoomModel, createVirtualRoomModel, type RoomModel } from './room'
import { useUI, type Phase, type UIState } from './uiStore'

type EnemyState = 'emerge' | 'fall' | 'walk' | 'assault' | 'fly' | 'dying'
type DamageKind = 'laser' | 'tesla' | 'mortar' | 'frost' | 'blaster' | 'orbital'

export interface Enemy {
  id: number
  type: EnemyType
  def: EnemyDef
  hp: number
  maxHp: number
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

interface Rift {
  center: Vector3
  normal: Vector3
  width: number
  height: number
  drop: Vector3
  visual: RiftVisual
  open: number
  pulse: number
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

export interface XRHitSample {
  valid: boolean
  matrix: Matrix4
  time: number
}

const _v1 = new Vector3()
const _v2 = new Vector3()
const _v3 = new Vector3()
const _muzzle = new Vector3()
const _m = new Matrix4()
const _q = new Quaternion()
const _s = new Vector3()
const _ray = new Ray()
const _plane = new Plane()
const UP = new Vector3(0, 1, 0)
const tmp2 = { x: 0, z: 0 }

const KIND_COLOR: Record<DamageKind, string> = {
  laser: '#ff7ab8',
  tesla: '#8fd8ff',
  mortar: '#ffc06a',
  frost: '#c6f6ff',
  blaster: '#c9ff5a',
  orbital: '#ffffff',
}

let nextId = 1

export class Game {
  readonly root = new Group()
  readonly towerGroup = new Group()
  readonly riftGroup = new Group()
  readonly particles = new GlowSprites(1800, 1)
  readonly glow = new GlowBatch(500)
  readonly beams = new Beams(800)
  readonly numbers = new DamageNumbers(28)
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
  /** meshes that count as placeable / aimable real or virtual surfaces */
  readonly surfaces = new Set<Object3D>()
  /** interactive UI meshes – aiming at them suppresses world actions */
  readonly uiObjects = new Set<Object3D>()

  phase: Phase = 'menu'
  mode: 'desktop' | 'xr' = 'desktop'
  room: RoomModel = createVirtualRoomModel()
  credits = GAME.startCredits
  coreHp = GAME.coreHp
  wave = 0
  selected: TowerType = 'laser'
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
  playerPos = new Vector3()
  hoverInfo = ''
  orbitalArmed = false

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
  private flowDirty = false
  private camera: Camera | null = null

  constructor() {
    this.root.name = 'game-root'
    this.root.add(this.riftGroup, this.towerGroup, this.enemyRenderer.group, this.core.group, this.particles.mesh, this.glow.mesh, this.beams.mesh, this.numbers.group)
  }

  // ---------------------------------------------------------------- lifecycle

  reset() {
    for (const t of this.towers) {
      this.towerGroup.remove(t.model.root)
      disposeTowerModel(t.model)
    }
    this.towers = []
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
    this.ult = 0
    this.heat = 0
    this.overheated = false
    this.orbitalArmed = false
    this.kills = 0
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
    this.reset()
    this.mode = 'desktop'
    this.setRoom(createVirtualRoomModel())
    this.setPhase('menu')
  }

  restart() {
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
    const a = this.aim
    return a.hit && a.horizontal && a.surfaceH < 1.3 && !a.ui
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
    this.setPhase('build')
    sfx.play('riftOpen', this.toWorld(this.corePos))
    this.particles.burst(_v1.copy(this.corePos).setY(this.corePos.y + 0.15), '#5ff6ff', 60, 1.2, { size: 0.03, life: 0.9, gravity: 0.5 })
    this.say('Die Risse öffnen sich! Baue Türme und starte die erste Welle.')
  }

  private clearRifts() {
    for (const r of this.rifts) {
      this.riftGroup.remove(r.visual.group, r.visual.floorGlow)
      r.visual.group.traverse((o) => {
        const m = o as Mesh
        m.geometry?.dispose()
      })
      r.visual.floorGlow.geometry.dispose()
    }
    this.rifts = []
  }

  private createRifts() {
    this.clearRifts()
    const floorY = this.room.floorY
    const core = this.corePos
    const chosen: Array<{ center: Vector3; normal: Vector3; width: number; height: number }> = []
    const walls = [...this.room.walls].filter((w) => w.width >= 0.7 && w.height >= 1.1).sort((a, b) => b.width - a.width)
    for (const w of walls) {
      if (chosen.length >= 3) break
      const c = this.toLocal(w.center)
      const n = w.normal.clone().setY(0).normalize()
      // make sure the normal faces the core
      if (_v1.subVectors(core, c).setY(0).dot(n) < 0) n.negate()
      c.y = Math.min(Math.max(floorY + 1.15, w.bottom + 0.75), w.bottom + w.height - 0.55)
      if (Math.hypot(c.x - core.x, c.z - core.z) < 1.0) continue
      if (chosen.some((o) => o.center.distanceTo(c) < 1.1)) continue
      chosen.push({ center: c, normal: n, width: Math.min(0.85, w.width * 0.45), height: Math.min(1.25, w.height * 0.55) })
    }
    if (chosen.length < 2) {
      const base = _v2.subVectors(core, this.toLocal(this.playerPos)).setY(0)
      if (base.lengthSq() < 0.01) base.set(0, 0, -1)
      base.normalize()
      const angles = chosen.length === 0 ? [-1.0, 0, 1.0] : [-1.1, 1.1]
      for (const a of angles) {
        if (chosen.length >= 3) break
        const dir = base.clone().applyAxisAngle(UP, a)
        const c = core.clone().addScaledVector(dir, 1.9)
        c.y = floorY + 1.2
        const b = this.room.bounds
        c.x = Math.min(Math.max(c.x, b.minX + 0.3), b.maxX - 0.3)
        c.z = Math.min(Math.max(c.z, b.minZ + 0.3), b.maxZ - 0.3)
        if (chosen.some((o) => o.center.distanceTo(c) < 0.9)) continue
        const n = _v1.subVectors(core, c).setY(0).normalize().clone()
        chosen.push({ center: c, normal: n, width: 0.8, height: 1.2 })
      }
    }
    for (const c of chosen) {
      const visual = createRiftVisual(c.width, c.height)
      visual.group.position.copy(c.center).addScaledVector(c.normal, 0.01)
      visual.group.rotation.set(0, Math.atan2(c.normal.x, c.normal.z), 0)
      visual.floorGlow.position.set(c.center.x + c.normal.x * 0.35, floorY + 0.006, c.center.z + c.normal.z * 0.35)
      visual.floorGlow.rotation.z = -Math.atan2(c.normal.x, c.normal.z)
      this.riftGroup.add(visual.group, visual.floorGlow)
      const drop = c.center.clone().addScaledVector(c.normal, 0.45)
      drop.y = floorY
      this.rifts.push({ center: c.center, normal: c.normal, width: c.width, height: c.height, drop, visual, open: 0, pulse: 0 })
      sfx.startDrone(this.toWorld(c.center))
    }
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
      const hits = rc.intersectObjects([...this.uiObjects].filter(isVisible), false)
      if (hits.length) {
        uiDist = hits[0].distance
        a.ui = true
      }
    }
    // tower picking (generous sphere around the tower body)
    let best = Infinity
    _ray.set(a.origin, a.dir)
    for (const t of this.towers) {
      this.toWorld(_v1.copy(t.pos).setY(t.pos.y + t.model.height * 0.5), _v2)
      const along = _v3.subVectors(_v2, a.origin).dot(a.dir)
      if (along < 0) continue
      const d2 = _ray.distanceSqToPoint(_v2)
      if (d2 < 0.13 * 0.13 && along < best) {
        best = along
        a.tower = t
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
    if (!a.hit && this.surfaces.size) {
      const hits = rc.intersectObjects([...this.surfaces].filter(isVisibleDeep), false)
      if (hits.length) {
        const h = hits[0]
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
    this.hoverInfo = a.tower ? this.towerInfo(a.tower) : ''
  }

  clearAim() {
    this.aim.active = false
    this.aim.hit = false
    this.aim.tower = null
    this.hoverInfo = ''
  }

  towerInfo(t: Tower) {
    const def = TOWERS[t.type]
    if (t.level >= MAX_TOWER_LEVEL) return `${def.name} Lv${t.level} · MAX`
    return `${def.name} Lv${t.level} → Upgrade ${def.upgradeCost[t.level - 1]}`
  }

  /** Trigger / pinch / click on the world. */
  primaryAction() {
    const a = this.aim
    if (a.ui) return
    switch (this.phase) {
      case 'placeCore':
        if (this.canPlaceCore()) this.placeCore(a.point)
        else {
          sfx.play('denied')
          this.say('Ziele auf eine waagerechte Fläche (Boden oder Tisch)')
        }
        return
      case 'build':
      case 'wave': {
        if (this.orbitalArmed) {
          if (a.hit) this.orbitalStrike(a.point)
          return
        }
        if (a.tower) {
          this.upgradeTower(a.tower)
          return
        }
        if (a.hit) {
          this.placeTower(this.selected, a.point, a.normal)
          return
        }
        sfx.play('denied')
        return
      }
      default:
        return
    }
  }

  secondaryAction() {
    if (this.aim.tower && (this.phase === 'build' || this.phase === 'wave')) this.sellTower(this.aim.tower)
  }

  selectTower(type: TowerType) {
    this.selected = type
    sfx.play('click')
    this.syncUI(true)
  }

  cycleTower(dir: number) {
    const i = TOWER_ORDER.indexOf(this.selected)
    this.selectTower(TOWER_ORDER[(i + dir + TOWER_ORDER.length) % TOWER_ORDER.length])
  }

  // ---------------------------------------------------------------- towers

  towerRangeAt(type: TowerType, level: number, surfaceH: number) {
    const def = TOWERS[type]
    return def.range * (1 + 0.12 * (level - 1)) * (1 + Math.min(Math.max(surfaceH, 0), 1.2) * 0.35)
  }

  checkPlacement(type: TowerType, pointWorld: Vector3, normalWorld: Vector3): { ok: boolean; reason: string } {
    if (!this.corePlaced) return { ok: false, reason: 'Zuerst den Kern platzieren' }
    if (normalWorld.y < 0.8) return { ok: false, reason: 'Nur auf waagerechten Flächen' }
    const p = this.toLocal(pointWorld, _v1)
    const h = p.y - this.room.floorY
    if (h > 2.0) return { ok: false, reason: 'Zu hoch' }
    if (h < -0.15) return { ok: false, reason: 'Ungültige Position' }
    if (Math.hypot(p.x - this.corePos.x, p.z - this.corePos.z) < 0.3 && Math.abs(p.y - this.corePos.y) < 0.4)
      return { ok: false, reason: 'Zu nah am Kern' }
    for (const t of this.towers) {
      if (Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < 0.2 && Math.abs(t.pos.y - p.y) < 0.3) return { ok: false, reason: 'Zu nah an einem Turm' }
    }
    for (const r of this.rifts) {
      if (Math.hypot(r.drop.x - p.x, r.drop.z - p.z) < 0.3) return { ok: false, reason: 'Blockiert einen Riss' }
    }
    if (this.credits < TOWERS[type].cost) return { ok: false, reason: 'Nicht genug Credits' }
    return { ok: true, reason: '' }
  }

  placeTower(type: TowerType, pointWorld: Vector3, normalWorld: Vector3) {
    const check = this.checkPlacement(type, pointWorld, normalWorld)
    if (!check.ok) {
      sfx.play('denied')
      this.say(check.reason)
      return false
    }
    const pos = this.toLocal(pointWorld)
    const surfaceH = pos.y - this.room.floorY
    let cells: number[] = []
    if (surfaceH < 0.12) {
      cells = this.nav.markTower(pos.x, pos.z, 0.12)
      this.nav.computeFlow(this.corePos.x, this.corePos.z, GAME.coreRadius + 0.12)
      const blocked = this.rifts.some((r) => !Number.isFinite(this.nav.distAt(r.drop.x, r.drop.z)))
      if (blocked) {
        this.nav.unmark(cells)
        this.nav.computeFlow(this.corePos.x, this.corePos.z, GAME.coreRadius + 0.12)
        sfx.play('denied')
        this.say('Der Turm würde den Weg komplett blockieren')
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
    }
    setTowerLevelVisual(model, 1, def.color)
    this.towers.push(tower)
    this.credits -= def.cost
    sfx.play('build', pointWorld)
    if (surfaceH > 0.3) this.say(`Erhöhte Position: +${Math.round(Math.min(surfaceH, 1.2) * 35)}% Reichweite`)
    this.syncUI(true)
    return true
  }

  upgradeTower(t: Tower) {
    const def = TOWERS[t.type]
    if (t.level >= MAX_TOWER_LEVEL) {
      sfx.play('denied')
      this.say(`${def.name} ist bereits auf Maximalstufe`)
      return
    }
    const cost = def.upgradeCost[t.level - 1]
    if (this.credits < cost) {
      sfx.play('denied')
      this.say(`Upgrade kostet ${cost} Credits`)
      return
    }
    this.credits -= cost
    t.invested += cost
    t.level++
    setTowerLevelVisual(t.model, t.level, def.color)
    t.buildT = Math.min(t.buildT, 0.35)
    sfx.play('upgrade', this.toWorld(t.pos))
    this.particles.burst(_v1.copy(t.pos).setY(t.pos.y + 0.15), def.color, 40, 0.9, { size: 0.025, life: 0.8 })
    this.say(`${def.name} auf Stufe ${t.level} verbessert`)
    this.syncUI(true)
  }

  sellTower(t: Tower) {
    const refund = Math.round(t.invested * GAME.sellRefund)
    this.credits += refund
    this.towers = this.towers.filter((o) => o !== t)
    this.towerGroup.remove(t.model.root)
    disposeTowerModel(t.model)
    if (t.cells.length) {
      this.nav.unmark(t.cells)
      this.nav.computeFlow(this.corePos.x, this.corePos.z, GAME.coreRadius + 0.12)
    }
    sfx.play('sell', this.toWorld(t.pos))
    this.particles.burst(_v1.copy(t.pos).setY(t.pos.y + 0.1), '#6ff4ff', 30, 0.7, { size: 0.02, life: 0.6 })
    this.say(`Turm verkauft (+${refund})`)
    this.syncUI(true)
  }

  // ---------------------------------------------------------------- waves

  startWave() {
    if (this.phase !== 'build') return
    this.wave++
    this.queue = buildWave(this.wave, this.rifts.length)
    this.waveTime = 0
    this.setPhase('wave')
    sfx.play('waveStart')
    for (const r of this.rifts) r.pulse = 1
    this.say(this.wave === GAME.totalWaves ? 'Finale Welle – ein Koloss bricht durch!' : `Welle ${this.wave} beginnt`)
  }

  private waveComplete() {
    const bonus = GAME.waveBonusBase + GAME.waveBonusPerWave * this.wave
    this.credits += bonus
    if (this.wave >= GAME.totalWaves) {
      this.setPhase('victory')
      sfx.play('victory')
      this.say('Sieg! Alle Risse wurden versiegelt.')
      for (const r of this.rifts) r.pulse = 1
      return
    }
    this.setPhase('build')
    sfx.play('waveClear')
    this.say(`Welle ${this.wave} abgewehrt · +${bonus} Credits`)
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
      sfx.play('denied')
      this.say(`Orbitalschlag lädt … ${Math.floor(this.ult * 100)}%`)
      return
    }
    this.orbitalArmed = true
    this.say('Ziel wählen: Trigger / Pinch auf eine Fläche')
  }

  orbitalStrike(pointWorld: Vector3 | null) {
    this.orbitalArmed = false
    if (this.phase !== 'wave' && this.phase !== 'build') return
    if (this.ult < 1) {
      sfx.play('denied')
      this.say(`Orbitalschlag lädt … ${Math.floor(this.ult * 100)}%`)
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
    this.say('Orbitalschlag angefordert!')
  }

  // ---------------------------------------------------------------- enemies

  private spawn(type: EnemyType, riftIndex: number, at?: Vector3) {
    const def = ENEMIES[type]
    const e = this.pool.pop() ?? ({ pos: new Vector3(), vel: new Vector3(), normal: new Vector3() } as Enemy)
    e.id = nextId++
    e.type = type
    e.def = def
    e.maxHp = e.hp = Math.round(def.hp * hpScale(Math.max(1, this.wave)))
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
    e.spawnTimer = 4
    e.rewarded = false
    e.vel.set(0, 0, 0)
    if (at) {
      e.pos.copy(at)
      e.state = 'walk'
      e.scale = 0.2
      e.normal.set(0, 0, 1)
    } else {
      const r = this.rifts[riftIndex % this.rifts.length]
      if (!r) return
      const side = _v1.crossVectors(UP, r.normal).normalize()
      e.pos
        .copy(r.center)
        .addScaledVector(side, (Math.random() - 0.5) * r.width * 0.45)
        .addScaledVector(UP, (Math.random() - 0.5) * r.height * 0.3)
      e.normal.copy(r.normal)
      e.state = 'emerge'
      e.scale = 0.15
      e.yaw = Math.atan2(r.normal.x, r.normal.z)
      r.pulse = Math.min(1, r.pulse + 0.4)
      this.particles.burst(e.pos, '#c04bff', 10, 0.5, { size: 0.03, life: 0.5 })
    }
    this.enemies.push(e)
  }

  private damage(e: Enemy, amount: number, kind: DamageKind) {
    if (e.state === 'dying') return
    const armor = e.def.armor * (kind === 'mortar' || kind === 'orbital' ? 0.4 : 1)
    const dmg = amount * (1 - armor)
    e.hp -= dmg
    e.flash = kind === 'laser' ? Math.max(e.flash, 0.25) : 1
    e.dmgAcc += dmg
    if (kind !== 'laser' || (e.dmgAccT <= 0 && e.dmgAcc >= 5) || e.hp <= 0) {
      const big = e.dmgAcc >= 40
      this.numbers.spawn(_v1.copy(e.pos).setY(e.pos.y + e.def.height * 2 + 0.08), String(Math.max(1, Math.round(e.dmgAcc))), KIND_COLOR[kind], big ? 1.35 : 1)
      e.dmgAcc = 0
      e.dmgAccT = 0.28
    }
    if (e.hp <= 0) this.kill(e, true)
  }

  private kill(e: Enemy, reward: boolean) {
    e.state = 'dying'
    e.t = 0
    const glow = e.type === 'swarmer' ? '#ff4fe0' : e.type === 'tank' ? '#ff9a3a' : e.type === 'flyer' ? '#4ff4ff' : '#ff3d5c'
    const center = _v1.copy(e.pos).setY(e.pos.y + e.def.height)
    if (reward && !e.rewarded) {
      e.rewarded = true
      this.credits += e.def.reward
      this.kills++
      this.ult = Math.min(1, this.ult + GAME.ultimate.chargePerKill * (e.type === 'boss' ? 20 : e.type === 'tank' ? 2.5 : 1))
      this.numbers.spawn(_v2.copy(center).setY(center.y + 0.12), `+${e.def.reward}`, '#ffe36a', 0.8)
    }
    const big = e.type === 'boss'
    this.particles.burst(center, glow, big ? 160 : e.type === 'tank' ? 45 : 24, big ? 2.4 : 1.1, { size: big ? 0.06 : 0.028, life: big ? 1.4 : 0.7, gravity: 1.2 })
    this.particles.burst(center, '#ffffff', big ? 40 : 6, big ? 1.5 : 0.6, { size: 0.02, life: 0.3 })
    sfx.play(big ? 'bossDeath' : 'enemyDeath', this.toWorld(center))
  }

  private coreHit(e: Enemy) {
    this.coreHp = Math.max(0, this.coreHp - e.def.coreDamage)
    this.core.hit(e.pos)
    sfx.play('coreHit', this.toWorld(this.corePos))
    this.particles.burst(e.pos, '#5ff6ff', 30, 1.2, { size: 0.025, life: 0.5 })
    this.numbers.spawn(_v1.copy(this.corePos).setY(this.corePos.y + 0.5), `-${e.def.coreDamage}`, '#ff4d6a', 1.3)
    e.rewarded = true
    this.kill(e, false)
    if (this.coreHp <= 0 && this.phase === 'wave') {
      this.setPhase('gameover')
      sfx.play('gameOver')
      this.say('Der Kern ist gefallen …')
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
      const slowMul = 1 - e.slowF
      const sp = e.def.speed * e.speedMul * slowMul
      if (e.state === 'dying') {
        if (e.t > 0.75) {
          list.splice(i, 1)
          this.pool.push(e)
        }
        continue
      }
      if (e.state !== 'emerge') e.scale = Math.min(1, e.scale + dt * 3)
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
              e.state = 'fall'
              e.vel.copy(e.normal).multiplyScalar(0.55).setY(0.6)
            }
          }
          break
        }
        case 'fall': {
          e.vel.y -= 9.8 * dt
          e.pos.addScaledVector(e.vel, dt)
          if (e.pos.y <= floorY) {
            e.pos.y = floorY
            e.state = 'walk'
            e.vel.set(e.normal.x * sp, 0, e.normal.z * sp)
            const big = e.type === 'boss' || e.type === 'tank'
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
          if (e.type === 'boss') {
            e.spawnTimer -= dt
            if (e.spawnTimer <= 0) {
              e.spawnTimer = 5
              for (let s = 0; s < 3; s++) {
                const p = _v2.copy(e.pos).add(_v3.set(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(0.5))
                if (this.nav.isFree(p.x, p.z)) this.spawn('swarmer', 0, p)
              }
              this.particles.burst(_v2.copy(e.pos).setY(e.pos.y + 0.25), '#ff3d8b', 40, 1, { size: 0.03, life: 0.6 })
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

  private renderEnemies() {
    const r = this.enemyRenderer
    r.begin(this.time)
    for (const e of this.enemies) {
      let bank = 0
      if (e.type === 'flyer') bank = Math.sin(this.time * 2 + e.phase) * 0.35
      _q.setFromAxisAngle(UP, e.yaw)
      if (bank) _q.multiply(new Quaternion().setFromAxisAngle(_v1.set(0, 0, 1), bank))
      if (e.state === 'fall' || e.state === 'emerge') {
        const tilt = e.state === 'emerge' ? -0.5 : Math.min(0.6, e.t * 2) - 0.3
        _q.multiply(new Quaternion().setFromAxisAngle(_v1.set(1, 0, 0), tilt))
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
    let bestP = Infinity
    const r2 = range * range
    for (const e of this.enemies) {
      if (e.state === 'dying' || e.state === 'emerge') continue
      if (e.def.flying && !hitsAir) continue
      if (!e.def.flying && t.type === 'mortar' && e.state === 'fall') continue
      const d2 = _v1.copy(e.pos).setY(e.pos.y + e.def.height).distanceToSquared(origin)
      if (d2 > r2) continue
      if (t.type === 'mortar' && d2 < 0.3 * 0.3) continue
      if (e.progress < bestP) {
        bestP = e.progress
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
      for (const h of model.holo) {
        h.visible = holoOpacity > 0
        ;(h.material as { opacity: number }).opacity = holoOpacity
      }
      for (const s of model.spin) s.rotation.y += dt * (t.type === 'tesla' ? 2.5 : 0.8)
      if (t.buildT < 1 || !active) continue

      const muzzle = this.toLocal(model.muzzle.getWorldPosition(_muzzle), _muzzle)
      const range = this.towerRangeAt(t.type, t.level, t.surfaceH)
      const dmgMul = 1 + (t.level - 1) * 0.55
      t.cooldown -= dt
      if (t.target && (t.target.state === 'dying' || this.enemyCenter(t.target, _v1).distanceTo(muzzle) > range || !this.enemies.includes(t.target))) {
        t.target = null
      }
      if (!t.target || t.type === 'mortar') t.target = this.findTarget(t, muzzle, range, def.hitsAir)
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
          this.beams.add(muzzle, c, 0.006 * pulse * (1 + (t.level - 1) * 0.3), def.color, 1)
          this.beams.add(muzzle, c, 0.0022, '#ffffff', 0.9)
          this.glow.add(c, def.color, 0.07 * pulse)
          this.glow.add(muzzle, '#ffd0e8', 0.05)
          if (Math.random() < dt * 30) {
            this.particles.emit(c, _v1.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5), def.color, { size: 0.015, life: 0.3, gravity: 1.5 })
          }
          this.damage(target, def.damage * dmgMul * dt, 'laser')
          t.soundT -= dt
          if (t.soundT <= 0) {
            t.soundT = 0.22
            sfx.play('laser', this.toWorld(muzzle, _v1))
          }
          break
        }
        case 'tesla': {
          if (!target || t.cooldown > 0) break
          t.cooldown = def.interval * (1 - (t.level - 1) * 0.1)
          const chain = 3 + (t.level - 1)
          const hit: Enemy[] = [target]
          let last = target
          for (let k = 1; k < chain; k++) {
            let next: Enemy | null = null
            let bd = 0.6 * 0.6
            for (const e of this.enemies) {
              if (e.state === 'dying' || hit.includes(e)) continue
              const d2 = e.pos.distanceToSquared(last.pos)
              if (d2 < bd) {
                bd = d2
                next = e
              }
            }
            if (!next) break
            hit.push(next)
            last = next
          }
          let from = muzzle.clone()
          hit.forEach((e, k) => {
            const to = this.enemyCenter(e, new Vector3())
            this.arcs.push({ a: from, b: to, life: 0.16, color: new Color(def.color) })
            this.particles.burst(to, '#bfe8ff', 6, 0.6, { size: 0.018, life: 0.25 })
            this.damage(e, def.damage * dmgMul * Math.pow(0.82, k), 'tesla')
            from = to
          })
          this.glow.add(muzzle, '#bfe8ff', 0.12)
          sfx.play('tesla', this.toWorld(muzzle, _v1))
          break
        }
        case 'mortar': {
          if (!target || t.cooldown > 0) break
          t.cooldown = def.interval * (1 - (t.level - 1) * 0.12)
          const c = this.enemyCenter(target, _v3)
          const dist = Math.hypot(c.x - muzzle.x, c.z - muzzle.z)
          const T = Math.min(1.5, Math.max(0.7, dist / 1.5))
          const pred = c.clone().addScaledVector(target.vel, T * 0.9)
          pred.y = target.def.flying ? c.y : this.room.floorY + 0.02
          const g = 9.8 * 0.55
          const vel = new Vector3((pred.x - muzzle.x) / T, (pred.y - muzzle.y + 0.5 * g * T * T) / T, (pred.z - muzzle.z) / T)
          this.shells.push({ pos: muzzle.clone(), vel, t: 0, T, damage: def.damage * dmgMul, splash: 0.34 + (t.level - 1) * 0.05 })
          this.particles.burst(muzzle, '#ffb35a', 12, 0.7, { size: 0.03, life: 0.35 })
          sfx.play('mortarLaunch', this.toWorld(muzzle, _v1))
          break
        }
        case 'frost': {
          if (!target || t.cooldown > 0) break
          t.cooldown = def.interval
          const slow = 0.42 + (t.level - 1) * 0.1
          for (const e of this.enemies) {
            if (e.state === 'dying') continue
            if (this.enemyCenter(e, _v1).distanceTo(muzzle) > range) continue
            e.slowT = 2.2
            e.slowF = Math.max(e.slowF, slow)
            this.damage(e, def.damage * dmgMul, 'frost')
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
          this.damage(e, GAME.blaster.damage, 'blaster')
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
          for (const e of this.enemies) {
            if (e.state === 'dying') continue
            const dh = Math.hypot(e.pos.x - s.pos.x, e.pos.z - s.pos.z)
            if (dh < GAME.ultimate.radius + e.def.radius) this.damage(e, GAME.ultimate.damage, 'orbital')
          }
          this.particles.burst(_v2.copy(s.pos).setY(s.pos.y + 0.05), '#ffffff', 80, 2.8, { size: 0.05, life: 0.8, gravity: 1 })
          this.particles.burst(_v2, '#ff5af0', 120, 2.2, { size: 0.06, life: 1.2, gravity: 0.6 })
          for (let j = 0; j < 48; j++) {
            const a = (j / 48) * Math.PI * 2
            this.particles.emit(_v2, _v3.set(Math.cos(a) * 2.6, 0.05, Math.sin(a) * 2.6), '#ffb8ff', { size: 0.07, life: 0.6, drag: 3 })
          }
          sfx.play('orbitalImpact', this.toWorld(s.pos, _v3))
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
    for (const r of this.rifts) {
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

    if (this.flowDirty) {
      this.flowDirty = false
      this.nav.computeFlow(this.corePos.x, this.corePos.z, GAME.coreRadius + 0.12)
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
    const next: Partial<UIState> = {
      phase: this.phase,
      xr: this.mode === 'xr',
      wave: this.wave,
      totalWaves: GAME.totalWaves,
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

function isVisibleDeep(o: Object3D) {
  return isVisible(o)
}

function easeOutBack(x: number) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

export const game = new Game()
