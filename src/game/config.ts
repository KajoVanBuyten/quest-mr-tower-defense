export type TowerType = 'laser' | 'tesla' | 'mortar' | 'frost'
export type EnemyType = 'swarmer' | 'runner' | 'tank' | 'shielded' | 'splitter' | 'mite' | 'healer' | 'flyer' | 'miniboss' | 'boss'
export type TargetMode = 'first' | 'last' | 'strong' | 'near'

export interface TowerDef {
  name: string
  short: string
  description: string
  color: string
  cost: number
  /** cost to reach level 2, 3, 4, 5 */
  upgradeCost: number[]
  range: number
  /** laser: damage per second, others: damage per shot */
  damage: number
  interval: number
  hitsAir: boolean
}

export const TOWER_ORDER: TowerType[] = ['laser', 'tesla', 'mortar', 'frost']
export const MAX_TOWER_LEVEL = 5

export const TOWERS: Record<TowerType, TowerDef> = {
  laser: {
    name: 'Laser',
    short: 'LSR',
    description: 'Dauerstrahl, hoher Einzelschaden',
    color: '#ff3d8b',
    cost: 60,
    upgradeCost: [50, 90, 150, 240],
    range: 1.45,
    damage: 34,
    interval: 0,
    hitsAir: true,
  },
  tesla: {
    name: 'Tesla',
    short: 'TSL',
    description: 'Kettenblitz, doppelter Schaden gegen Schilde',
    color: '#4fb8ff',
    cost: 85,
    upgradeCost: [70, 120, 190, 290],
    range: 1.2,
    damage: 24,
    interval: 0.9,
    hitsAir: true,
  },
  mortar: {
    name: 'Mörser',
    short: 'MRS',
    description: 'Plasma-Artillerie mit Flächenschaden',
    color: '#ffa53d',
    cost: 100,
    upgradeCost: [85, 140, 220, 330],
    range: 2.5,
    damage: 52,
    interval: 2.0,
    hitsAir: false,
  },
  frost: {
    name: 'Frost',
    short: 'FRS',
    description: 'Verlangsamt alles in Reichweite',
    color: '#9ef0ff',
    cost: 70,
    upgradeCost: [55, 95, 160, 250],
    range: 1.05,
    damage: 7,
    interval: 1.3,
    hitsAir: true,
  },
}

export const TARGET_MODES: TargetMode[] = ['first', 'last', 'strong', 'near']
export const TARGET_LABEL: Record<TargetMode, string> = { first: 'Erster', last: 'Letzter', strong: 'Stärkster', near: 'Nächster' }

export interface TowerStats {
  /** laser: per second, others: per hit */
  damage: number
  dps: number
  range: number
  interval: number
  chain: number
  slow: number
  splash: number
}

export function towerStats(type: TowerType, level: number, surfaceH: number, out: TowerStats = {} as TowerStats): TowerStats {
  const def = TOWERS[type]
  const l = level - 1
  const height = Math.min(Math.max(surfaceH, 0), 1.2)
  out.damage = def.damage * (1 + 0.6 * l + 0.08 * l * l)
  out.range = def.range * (1 + 0.08 * l) * (1 + height * 0.35)
  out.interval = def.interval * (1 - 0.07 * l)
  out.chain = 3 + l
  out.slow = Math.min(0.75, 0.4 + 0.07 * l)
  out.splash = 0.34 + 0.04 * l
  out.dps = out.interval > 0 ? out.damage / out.interval : out.damage
  return out
}

export interface EnemyDef {
  name: string
  hint: string
  hp: number
  speed: number
  /** fraction of incoming damage absorbed */
  armor: number
  reward: number
  radius: number
  coreDamage: number
  flying: boolean
  height: number
  color: string
  /** energy shield as a fraction of max hp, regenerates when not hit */
  shield: number
  /** number of mites released on death */
  split: number
  /** fraction of max hp restored to nearby creatures per pulse */
  heal: number
  /** orbital charge weight per kill */
  ult: number
  boss: 0 | 1 | 2
}

const base = { armor: 0, flying: false, shield: 0, split: 0, heal: 0, ult: 1, boss: 0 as 0 | 1 | 2 }

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  swarmer: { ...base, name: 'Schwärmer', hint: 'Krabbelt in Massen', hp: 32, speed: 0.4, reward: 5, radius: 0.085, coreDamage: 4, height: 0.07, color: '#ff4fe0' },
  runner: { ...base, name: 'Läufer', hint: 'Sehr schnell, wenig Leben', hp: 22, speed: 0.78, reward: 5, radius: 0.075, coreDamage: 3, height: 0.065, color: '#ffe14f' },
  tank: { ...base, name: 'Panzer', hint: 'Gepanzert – Mörser ignoriert Panzerung teilweise', hp: 230, speed: 0.19, armor: 0.45, reward: 18, radius: 0.17, coreDamage: 12, height: 0.14, color: '#ff9a3a', ult: 2.5 },
  shielded: { ...base, name: 'Schildträger', hint: 'Energieschild lädt sich auf – Tesla zerschmettert Schilde', hp: 120, speed: 0.26, armor: 0.1, reward: 14, radius: 0.13, coreDamage: 8, height: 0.1, color: '#4fb8ff', shield: 0.9, ult: 1.8 },
  splitter: { ...base, name: 'Teiler', hint: 'Zerfällt beim Tod in drei Milben', hp: 110, speed: 0.3, reward: 10, radius: 0.12, coreDamage: 6, height: 0.09, color: '#7dff5a', split: 3, ult: 1.5 },
  mite: { ...base, name: 'Milbe', hint: '', hp: 18, speed: 0.55, reward: 2, radius: 0.06, coreDamage: 2, height: 0.05, color: '#b6ff5a', ult: 0.4 },
  healer: { ...base, name: 'Heiler', hint: 'Heilt Kreaturen in der Nähe – zuerst ausschalten!', hp: 90, speed: 0.3, reward: 14, radius: 0.1, coreDamage: 5, height: 0.09, color: '#5aff9a', heal: 0.1, ult: 1.8 },
  flyer: { ...base, name: 'Flieger', hint: 'Fliegt – Mörser trifft ihn nicht', hp: 48, speed: 0.48, reward: 8, radius: 0.1, coreDamage: 6, flying: true, height: 0, color: '#4ff4ff' },
  miniboss: { ...base, name: 'Brutmutter', hint: 'Mini-Boss – brütet unterwegs Milben aus', hp: 1100, speed: 0.16, armor: 0.35, reward: 90, radius: 0.26, coreDamage: 25, height: 0.22, color: '#ff3dd0', ult: 10, boss: 1 },
  boss: { ...base, name: 'Koloss', hint: 'Boss – gewaltige Panzerung, brütet Schwärmer aus', hp: 2600, speed: 0.12, armor: 0.3, reward: 250, radius: 0.36, coreDamage: 45, height: 0.33, color: '#ff3d5c', ult: 20, boss: 2 },
}

/** Order used for previews and legends. */
export const ENEMY_ORDER: EnemyType[] = ['swarmer', 'runner', 'mite', 'splitter', 'healer', 'shielded', 'tank', 'flyer', 'miniboss', 'boss']

export const GAME = {
  startCredits: 260,
  coreHp: 100,
  totalWaves: 50,
  coreRadius: 0.2,
  waveBonusBase: 35,
  waveBonusPerWave: 7,
  sellRefund: 0.7,
  blaster: { damage: 16, rate: 7, speed: 9, heatPerShot: 0.075, coolRate: 0.45 },
  ultimate: { damage: 520, radius: 0.75, chargePerKill: 0.014, chargePerSecond: 0.006, delay: 1.1 },
  cellSize: 0.15,
}

export interface SpawnEvent {
  t: number
  type: EnemyType
  rift: number
}

/** [type, count, gap between spawns (s), start time (s), all from one rift] */
type Group = [EnemyType, number, number, number, boolean?]

interface WaveDesign {
  name: string
  groups: Group[]
}

/** First appearance of each creature (campaign). */
export const UNLOCK: Record<EnemyType, number> = {
  swarmer: 1,
  flyer: 3,
  tank: 4,
  miniboss: 5,
  runner: 6,
  shielded: 9,
  boss: 10,
  splitter: 12,
  mite: 12,
  healer: 16,
}

const FALLBACK: Partial<Record<EnemyType, EnemyType>> = { runner: 'swarmer', shielded: 'tank', splitter: 'swarmer', healer: 'swarmer', mite: 'swarmer' }

/** The first ten waves are fully hand-made; they introduce one idea at a time. */
const OPENING: WaveDesign[] = [
  { name: 'Erstkontakt', groups: [['swarmer', 8, 1.0, 1]] },
  { name: 'Vorhut', groups: [['swarmer', 12, 0.85, 1]] },
  { name: 'Aus der Luft', groups: [['swarmer', 10, 0.8, 1], ['flyer', 3, 1.6, 5]] },
  { name: 'Panzerung', groups: [['swarmer', 12, 0.75, 1], ['tank', 2, 4, 6]] },
  { name: 'Die Brutmutter', groups: [['swarmer', 14, 0.7, 1], ['flyer', 4, 1.4, 4], ['miniboss', 1, 0, 9]] },
  { name: 'Sprinter', groups: [['runner', 10, 0.5, 1], ['swarmer', 10, 0.8, 4]] },
  { name: 'Kolonne', groups: [['tank', 4, 3, 1], ['swarmer', 14, 0.6, 3], ['flyer', 5, 1.2, 8]] },
  { name: 'Blitzangriff', groups: [['runner', 16, 0.4, 1], ['flyer', 8, 0.6, 8, true]] },
  { name: 'Schildwall', groups: [['shielded', 4, 2.5, 1], ['swarmer', 16, 0.55, 2], ['tank', 2, 4, 10]] },
  { name: 'Der Koloss', groups: [['swarmer', 14, 0.55, 1], ['tank', 2, 4, 4], ['flyer', 5, 1, 6], ['boss', 1, 0, 10]] },
]

/**
 * Waves 11–50 follow a designed ten-wave arc that repeats with rising stakes:
 * opener, armour, air raid, splitters, mini-boss, rush, fortress, swarm, elite, boss.
 * `k` is the decade (1–4); counts grow with it, creature health grows with hpScale().
 */
function decadeWave(w: number): WaveDesign {
  const k = Math.floor((w - 1) / 10)
  const d = (w - 1) % 10
  const n = (base: number, per: number) => Math.round(base + per * k)
  switch (d) {
    case 0:
      return { name: 'Neue Front', groups: [['swarmer', n(14, 4), 0.5, 1], ['runner', n(8, 3), 0.45, 5], ['splitter', n(2, 1), 2.5, 9], ['flyer', n(4, 2), 1, 7]] }
    case 1:
      return { name: 'Panzerkolonne', groups: [['tank', n(4, 2), 2.6, 1], ['shielded', n(3, 2), 2.2, 4], ['healer', n(1, 1), 4, 7], ['swarmer', n(10, 3), 0.6, 3]] }
    case 2:
      return { name: 'Luftangriff', groups: [['flyer', n(10, 4), 0.35, 1, true], ['flyer', n(8, 3), 0.4, 8, true], ['runner', n(8, 3), 0.5, 4]] }
    case 3:
      return { name: 'Zellteilung', groups: [['splitter', n(5, 2), 1.6, 1], ['swarmer', n(14, 4), 0.45, 3], ['healer', n(1, 1), 3, 9]] }
    case 4:
      return {
        name: 'Brutmutter',
        groups: [['swarmer', n(14, 4), 0.5, 1], ['shielded', n(2, 1), 3, 4], ['flyer', n(5, 2), 0.8, 6], ['miniboss', k >= 3 ? 2 : 1, 7, 9]],
      }
    case 5:
      return { name: 'Sturmlauf', groups: [['runner', n(20, 5), 0.3, 1], ['runner', n(12, 4), 0.3, 9, true], ['tank', n(1, 1), 4, 5]] }
    case 6:
      return { name: 'Festung', groups: [['shielded', n(5, 2), 1.8, 1], ['tank', n(3, 1), 3, 3], ['healer', n(2, 1), 3, 6], ['swarmer', n(8, 3), 0.7, 5]] }
    case 7:
      return { name: 'Schwarm', groups: [['swarmer', n(24, 6), 0.3, 1], ['mite', n(16, 4), 0.25, 6, true], ['flyer', n(8, 3), 0.5, 4, true]] }
    case 8:
      return {
        name: 'Elite',
        groups: [['tank', n(3, 1), 3, 1], ['shielded', n(3, 2), 2.5, 2], ['splitter', n(3, 1), 2, 4], ['healer', n(2, 1), 3, 5], ['runner', n(10, 3), 0.4, 7], ['flyer', n(6, 2), 0.6, 8]],
      }
    default: {
      const groups: Group[] = [['swarmer', n(16, 4), 0.45, 1], ['shielded', n(3, 2), 2.4, 3], ['flyer', n(6, 2), 0.7, 5], ['boss', w >= 40 ? 2 : 1, 12, 9]]
      if (w >= 30) groups.push(['miniboss', w >= 50 ? 2 : 1, 8, 15])
      if (w >= 50) groups.push(['healer', 4, 2, 12], ['runner', 20, 0.3, 20])
      return { name: w >= 50 ? 'Finale: Die Rissfürsten' : 'Koloss-Angriff', groups }
    }
  }
}

/** Deterministic pseudo random generator so endless waves are reproducible. */
function rng(seed: number) {
  let s = seed * 2654435761 >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ENDLESS_POOL: EnemyType[] = ['swarmer', 'runner', 'tank', 'shielded', 'splitter', 'healer', 'flyer', 'mite']
const ENDLESS_NAMES = ['Endlose Flut', 'Rissbeben', 'Dunkle Welle', 'Leerensturm', 'Brutnest', 'Albtraum']

function endlessWave(w: number): WaveDesign {
  const r = rng(w)
  const over = w - GAME.totalWaves
  const mul = 1.35 + over * 0.05
  const groups: Group[] = []
  const kinds = 3 + Math.floor(r() * 3)
  let start = 1
  const pool = [...ENDLESS_POOL]
  for (let i = 0; i < kinds; i++) {
    const type = pool.splice(Math.floor(r() * pool.length), 1)[0]
    const heavy = type === 'tank' || type === 'shielded' || type === 'healer' || type === 'splitter'
    const count = Math.min(heavy ? 14 : 40, Math.round((heavy ? 3 + r() * 4 : 12 + r() * 14) * mul))
    groups.push([type, count, heavy ? 1.8 + r() : 0.25 + r() * 0.35, start, !heavy && r() < 0.3])
    start += 2 + r() * 5
  }
  if (w % 10 === 0) groups.push(['boss', 1 + Math.floor(over / 20), 10, 8])
  else if (w % 5 === 0) groups.push(['miniboss', 1 + Math.floor(over / 15), 6, 6])
  return { name: ENDLESS_NAMES[w % ENDLESS_NAMES.length], groups }
}

function design(w: number): WaveDesign {
  if (w <= OPENING.length) return OPENING[w - 1]
  if (w <= GAME.totalWaves) return decadeWave(w)
  return endlessWave(w)
}

function resolveType(type: EnemyType, w: number): EnemyType {
  if (w > GAME.totalWaves) return type
  let t = type
  while (UNLOCK[t] > w && FALLBACK[t]) t = FALLBACK[t]!
  return t
}

/** Procedural wave composition. Wave numbers start at 1. */
export function buildWave(wave: number, riftCount: number): SpawnEvent[] {
  const ev: SpawnEvent[] = []
  const rc = Math.max(1, riftCount)
  const tempo = Math.max(0.55, 1 - Math.max(0, wave - 10) * 0.01)
  let cursor = wave % rc
  design(wave).groups.forEach(([rawType, count, gap, start, burst], gi) => {
    const type = resolveType(rawType, wave)
    const fixedRift = (gi + wave) % rc
    let t = start
    for (let i = 0; i < count; i++) {
      const rift = burst ? fixedRift : (cursor = (cursor + 1) % rc)
      ev.push({ t, type, rift })
      t += gap * tempo * (i % 5 === 4 ? 1.8 : 1)
    }
  })
  ev.sort((a, b) => a.t - b.t)
  return ev
}

export interface WavePreview {
  wave: number
  name: string
  tag: '' | 'MINI-BOSS' | 'BOSS' | 'ENDLOS'
  entries: Array<{ type: EnemyType; count: number }>
  /** creature types appearing for the first time */
  fresh: EnemyType[]
}

export function wavePreview(wave: number): WavePreview {
  const counts = new Map<EnemyType, number>()
  const dsg = design(wave)
  for (const [rawType, count] of dsg.groups) {
    const t = resolveType(rawType, wave)
    counts.set(t, (counts.get(t) ?? 0) + count)
  }
  const entries = ENEMY_ORDER.filter((t) => counts.has(t)).map((type) => ({ type, count: counts.get(type)! }))
  const hasBoss = counts.has('boss')
  const hasMini = counts.has('miniboss')
  const fresh = wave <= GAME.totalWaves ? entries.map((e) => e.type).filter((t) => firstSeen().get(t) === wave) : []
  return {
    wave,
    name: dsg.name,
    tag: hasBoss ? 'BOSS' : hasMini ? 'MINI-BOSS' : wave > GAME.totalWaves ? 'ENDLOS' : '',
    entries,
    fresh,
  }
}

let firstSeenCache: Map<EnemyType, number> | null = null

/** Campaign wave in which each creature type first shows up. */
function firstSeen() {
  if (firstSeenCache) return firstSeenCache
  const m = new Map<EnemyType, number>()
  for (let w = 1; w <= GAME.totalWaves; w++) {
    for (const [rawType] of design(w).groups) {
      const t = resolveType(rawType, w)
      if (!m.has(t)) m.set(t, w)
    }
  }
  firstSeenCache = m
  return m
}

export function hpScale(wave: number) {
  const w = wave - 1
  const s = 1 + w * 0.11 + w * w * 0.0032
  return wave > GAME.totalWaves ? s * Math.pow(1.06, wave - GAME.totalWaves) : s
}

export function rewardScale(wave: number) {
  return 1 + Math.min(wave - 1, 60) * 0.025
}
