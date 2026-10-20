import { create } from 'zustand'
import type { TowerType, WavePreview } from './config'

export type Phase = 'menu' | 'scan' | 'placeCore' | 'build' | 'wave' | 'gameover' | 'victory'

export interface UIState {
  phase: Phase
  xr: boolean
  wave: number
  totalWaves: number
  credits: number
  coreHp: number
  coreMax: number
  selected: TowerType
  ult: number
  heat: number
  overheated: boolean
  enemiesAlive: number
  kills: number
  towers: number
  hoverInfo: string
  message: string
  messageKey: number
  arSupported: boolean | null
  vrSupported: boolean | null
  muted: boolean
  roomSource: string
  endless: boolean
  score: number
  highScore: number
  highWave: number
  preview: WavePreview | null
  selectedTowerId: number
  selectedTowerLevel: number
  intro: boolean
  orbitalArmed: boolean
}

export const useUI = create<UIState>(() => ({
  phase: 'menu',
  xr: false,
  wave: 0,
  totalWaves: 50,
  credits: 0,
  coreHp: 100,
  coreMax: 100,
  selected: 'laser',
  ult: 0,
  heat: 0,
  overheated: false,
  enemiesAlive: 0,
  kills: 0,
  towers: 0,
  hoverInfo: '',
  message: '',
  messageKey: 0,
  arSupported: null,
  vrSupported: null,
  muted: false,
  roomSource: '',
  endless: false,
  score: 0,
  highScore: 0,
  highWave: 0,
  preview: null,
  selectedTowerId: 0,
  selectedTowerLevel: 0,
  intro: false,
  orbitalArmed: false,
}))
