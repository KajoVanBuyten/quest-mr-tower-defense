export type TowerType = 'laser' | 'tesla' | 'mortar' | 'frost'
export type EnemyType = 'swarmer' | 'tank' | 'flyer' | 'boss'

export interface TowerDef {
  name: string
  short: string
  description: string
  color: string
  cost: number
  upgradeCost: [number, number]
  range: number
  /** laser: damage per second, others: damage per shot */
  damage: number
  interval: number
  hitsAir: boolean
}

export const TOWER_ORDER: TowerType[] = ['laser', 'tesla', 'mortar', 'frost']

export const TOWERS: Record<TowerType, TowerDef> = {
  laser: {
    name: 'Laser',
    short: 'LSR',
    description: 'Dauerstrahl, hoher Einzelschaden',
    color: '#ff3d8b',
    cost: 60,
    upgradeCost: [55, 95],
    range: 1.45,
    damage: 34,
    interval: 0,
    hitsAir: true,
  },
  tesla: {
    name: 'Tesla',
    short: 'TSL',
    description: 'Kettenblitz über mehrere Ziele',
    color: '#4fb8ff',
    cost: 85,
    upgradeCost: [70, 120],
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
    upgradeCost: [80, 140],
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
    upgradeCost: [60, 100],
    range: 1.05,
    damage: 7,
    interval: 1.3,
    hitsAir: true,
  },
}

export const MAX_TOWER_LEVEL = 3

export interface EnemyDef {
  hp: number
  speed: number
  /** fraction of incoming damage absorbed */
  armor: number
  reward: number
  radius: number
  coreDamage: number
  flying: boolean
  height: number
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  swarmer: { hp: 32, speed: 0.4, armor: 0, reward: 5, radius: 0.085, coreDamage: 4, flying: false, height: 0.07 },
  tank: { hp: 230, speed: 0.19, armor: 0.45, reward: 18, radius: 0.17, coreDamage: 12, flying: false, height: 0.14 },
  flyer: { hp: 48, speed: 0.48, armor: 0, reward: 8, radius: 0.1, coreDamage: 6, flying: true, height: 0 },
  boss: { hp: 2600, speed: 0.12, armor: 0.3, reward: 250, radius: 0.36, coreDamage: 45, flying: false, height: 0.33 },
}

export const GAME = {
  startCredits: 240,
  coreHp: 100,
  totalWaves: 10,
  coreRadius: 0.2,
  waveBonusBase: 40,
  waveBonusPerWave: 10,
  sellRefund: 0.6,
  blaster: { damage: 16, rate: 7, speed: 9, heatPerShot: 0.075, coolRate: 0.45 },
  ultimate: { damage: 520, radius: 0.75, chargePerKill: 0.014, chargePerSecond: 0.006, delay: 1.1 },
  cellSize: 0.15,
}

export interface SpawnEvent {
  t: number
  type: EnemyType
  rift: number
}

/** Procedural wave composition. Wave numbers start at 1. */
export function buildWave(wave: number, riftCount: number): SpawnEvent[] {
  const ev: SpawnEvent[] = []
  const rc = Math.max(1, riftCount)
  let riftCursor = wave % rc
  const nextRift = () => (riftCursor = (riftCursor + 1) % rc)

  const swarmers = 6 + Math.round(wave * 2.6)
  const tanks = wave >= 3 ? Math.floor((wave - 1) / 2) + (wave === 5 ? 3 : 0) : 0
  const flyers = wave >= 2 ? 1 + Math.round(wave * 1.2) : 0
  const burst = Math.max(0.35, 1.05 - wave * 0.06)

  let t = 1.2
  for (let i = 0; i < swarmers; i++) {
    ev.push({ t, type: 'swarmer', rift: nextRift() })
    t += i % 4 === 3 ? burst * 2.4 : burst
  }
  let tt = 4
  for (let i = 0; i < tanks; i++) {
    ev.push({ t: tt, type: 'tank', rift: nextRift() })
    tt += 3.4
  }
  let ft = 3
  for (let i = 0; i < flyers; i++) {
    ev.push({ t: ft, type: 'flyer', rift: nextRift() })
    ft += 1.8
  }
  if (wave === GAME.totalWaves) {
    ev.push({ t: 6, type: 'boss', rift: 0 })
  }
  ev.sort((a, b) => a.t - b.t)
  return ev
}

export function hpScale(wave: number) {
  return 1 + (wave - 1) * 0.17 + Math.max(0, wave - 6) * 0.08
}
