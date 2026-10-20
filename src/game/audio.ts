import { Camera, Quaternion, Vector3 } from 'three'

export type SoundName =
  | 'laser'
  | 'tesla'
  | 'mortarLaunch'
  | 'explosion'
  | 'frost'
  | 'blaster'
  | 'enemyDeath'
  | 'bossDeath'
  | 'coreHit'
  | 'riftOpen'
  | 'build'
  | 'upgrade'
  | 'sell'
  | 'click'
  | 'denied'
  | 'waveStart'
  | 'waveClear'
  | 'victory'
  | 'gameOver'
  | 'orbitalCharge'
  | 'orbitalImpact'
  | 'land'
  | 'overheat'
  | 'select'
  | 'shieldBreak'
  | 'split'
  | 'heal'
  | 'bossWarn'

const MIN_INTERVAL: Partial<Record<SoundName, number>> = {
  laser: 0.09,
  tesla: 0.06,
  enemyDeath: 0.05,
  blaster: 0.05,
  land: 0.08,
  frost: 0.15,
  explosion: 0.05,
  coreHit: 0.12,
  shieldBreak: 0.08,
  split: 0.08,
  heal: 0.2,
}

const _fwd = new Vector3()
const _up = new Vector3()
const _pos = new Vector3()
const _q = new Quaternion()

/**
 * Fully procedural sound engine: every effect is synthesized from oscillators
 * and a shared noise buffer, spatialized with HRTF panners.
 */
export class Sfx {
  ctx: AudioContext | null = null
  private master!: GainNode
  private noise!: AudioBuffer
  private last = new Map<SoundName, number>()
  private voices = 0
  private drones: Array<{ stop: () => void }> = []
  muted = false

  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => undefined)
      return
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC({ latencyHint: 'interactive' })
    this.ctx = ctx
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.knee.value = 12
    comp.ratio.value = 5
    comp.attack.value = 0.004
    comp.release.value = 0.2
    this.master = ctx.createGain()
    this.master.gain.value = 0.75
    this.master.connect(comp)
    comp.connect(ctx.destination)
    const len = ctx.sampleRate * 2
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.75, this.ctx.currentTime, 0.05)
  }

  updateListener(camera: Camera) {
    const ctx = this.ctx
    if (!ctx) return
    const l = ctx.listener
    camera.getWorldPosition(_pos)
    camera.getWorldDirection(_fwd)
    _up.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(_q))
    const t = ctx.currentTime
    if (l.positionX) {
      l.positionX.setTargetAtTime(_pos.x, t, 0.02)
      l.positionY.setTargetAtTime(_pos.y, t, 0.02)
      l.positionZ.setTargetAtTime(_pos.z, t, 0.02)
      l.forwardX.setTargetAtTime(_fwd.x, t, 0.02)
      l.forwardY.setTargetAtTime(_fwd.y, t, 0.02)
      l.forwardZ.setTargetAtTime(_fwd.z, t, 0.02)
      l.upX.setTargetAtTime(_up.x, t, 0.02)
      l.upY.setTargetAtTime(_up.y, t, 0.02)
      l.upZ.setTargetAtTime(_up.z, t, 0.02)
    } else {
      l.setPosition(_pos.x, _pos.y, _pos.z)
      l.setOrientation(_fwd.x, _fwd.y, _fwd.z, _up.x, _up.y, _up.z)
    }
  }

  private out(pos: Vector3 | undefined, gain: number, duration: number): GainNode | null {
    const ctx = this.ctx
    if (!ctx || this.muted) return null
    if (this.voices > 28) return null
    this.voices++
    window.setTimeout(() => this.voices--, duration * 1000 + 60)
    const g = ctx.createGain()
    g.gain.value = gain
    if (pos) {
      const p = ctx.createPanner()
      p.panningModel = 'HRTF'
      p.distanceModel = 'inverse'
      p.refDistance = 0.6
      p.maxDistance = 30
      p.rolloffFactor = 1.1
      if (p.positionX) {
        p.positionX.value = pos.x
        p.positionY.value = pos.y
        p.positionZ.value = pos.z
      } else {
        p.setPosition(pos.x, pos.y, pos.z)
      }
      g.connect(p)
      p.connect(this.master)
    } else {
      g.connect(this.master)
    }
    return g
  }

  private osc(type: OscillatorType, f0: number, f1: number, t0: number, dur: number, dest: AudioNode, vol = 1, curve: 'exp' | 'lin' = 'exp') {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t0)
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur)
    else o.frequency.linearRampToValueAtTime(f1, t0 + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.012, dur * 0.2))
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g)
    g.connect(dest)
    o.start(t0)
    o.stop(t0 + dur + 0.02)
    return o
  }

  private noiseBurst(t0: number, dur: number, dest: AudioNode, filterType: BiquadFilterType, f0: number, f1: number, vol = 1, q = 1) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = filterType
    f.Q.value = q
    f.frequency.setValueAtTime(f0, t0)
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.01, dur * 0.15))
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(f)
    f.connect(g)
    g.connect(dest)
    src.start(t0, Math.random() * 1.5)
    src.stop(t0 + dur + 0.02)
  }

  play(name: SoundName, pos?: Vector3, intensity = 1) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const now = ctx.currentTime
    const minI = MIN_INTERVAL[name]
    if (minI) {
      const l = this.last.get(name) ?? -1
      if (now - l < minI) return
      this.last.set(name, now)
    }
    const t = now + 0.005
    const r = () => 0.9 + Math.random() * 0.2
    switch (name) {
      case 'laser': {
        const d = this.out(pos, 0.12 * intensity, 0.12)
        if (!d) return
        this.osc('sawtooth', 1400 * r(), 900, t, 0.1, d, 0.5)
        this.osc('sine', 2800 * r(), 2600, t, 0.08, d, 0.3)
        break
      }
      case 'tesla': {
        const d = this.out(pos, 0.35 * intensity, 0.3)
        if (!d) return
        this.noiseBurst(t, 0.22, d, 'bandpass', 3500, 1200, 0.9, 2.5)
        for (let i = 0; i < 4; i++) this.osc('square', 180 + Math.random() * 300, 60, t + i * 0.035, 0.05, d, 0.25)
        break
      }
      case 'mortarLaunch': {
        const d = this.out(pos, 0.5 * intensity, 0.4)
        if (!d) return
        this.osc('sine', 160, 45, t, 0.3, d, 0.9)
        this.noiseBurst(t, 0.18, d, 'lowpass', 1800, 300, 0.5)
        this.osc('triangle', 600, 1400, t + 0.05, 0.25, d, 0.12)
        break
      }
      case 'explosion': {
        const d = this.out(pos, 0.6 * intensity, 0.9)
        if (!d) return
        this.noiseBurst(t, 0.75, d, 'lowpass', 2400 * r(), 120, 1)
        this.osc('sine', 110, 30, t, 0.6, d, 1)
        break
      }
      case 'frost': {
        const d = this.out(pos, 0.18 * intensity, 0.7)
        if (!d) return
        for (let i = 0; i < 4; i++) this.osc('sine', 1800 + i * 430 * r(), 2400 + i * 300, t + i * 0.04, 0.5, d, 0.25)
        this.noiseBurst(t, 0.4, d, 'highpass', 6000, 9000, 0.25)
        break
      }
      case 'blaster': {
        const d = this.out(pos, 0.22 * intensity, 0.18)
        if (!d) return
        this.osc('square', 1100 * r(), 160, t, 0.13, d, 0.5)
        this.osc('sine', 2200, 400, t, 0.08, d, 0.3)
        break
      }
      case 'enemyDeath': {
        const d = this.out(pos, 0.3 * intensity, 0.45)
        if (!d) return
        this.noiseBurst(t, 0.3, d, 'bandpass', 900 * r(), 200, 0.8, 3)
        this.osc('sawtooth', 420 * r(), 60, t, 0.35, d, 0.35)
        break
      }
      case 'bossDeath': {
        const d = this.out(pos, 0.9, 2.6)
        if (!d) return
        this.noiseBurst(t, 2.4, d, 'lowpass', 3000, 60, 1)
        this.osc('sawtooth', 90, 20, t, 2.2, d, 0.6)
        this.osc('sine', 55, 25, t, 2.5, d, 1)
        break
      }
      case 'coreHit': {
        const d = this.out(pos, 0.5, 1.2)
        if (!d) return
        this.osc('sine', 90, 40, t, 0.6, d, 1)
        this.osc('triangle', 660, 640, t, 1.1, d, 0.25, 'lin')
        this.osc('triangle', 990, 960, t, 0.9, d, 0.15, 'lin')
        break
      }
      case 'riftOpen': {
        const d = this.out(pos, 0.55, 2.4)
        if (!d) return
        this.noiseBurst(t, 2.2, d, 'bandpass', 200, 2400, 0.8, 4)
        this.osc('sawtooth', 40, 120, t, 2.0, d, 0.4)
        this.osc('sine', 30, 70, t, 2.2, d, 0.8)
        break
      }
      case 'build': {
        const d = this.out(pos, 0.25, 0.9)
        if (!d) return
        ;[523, 659, 784, 1046].forEach((f, i) => this.osc('triangle', f, f, t + i * 0.08, 0.22, d, 0.5, 'lin'))
        this.noiseBurst(t, 0.6, d, 'bandpass', 800, 5000, 0.2, 6)
        break
      }
      case 'upgrade': {
        const d = this.out(pos, 0.25, 1)
        if (!d) return
        ;[659, 880, 1046, 1318, 1760].forEach((f, i) => this.osc('square', f, f, t + i * 0.06, 0.18, d, 0.25, 'lin'))
        break
      }
      case 'sell': {
        const d = this.out(pos, 0.25, 0.6)
        if (!d) return
        ;[1046, 784, 523].forEach((f, i) => this.osc('triangle', f, f, t + i * 0.07, 0.2, d, 0.4, 'lin'))
        break
      }
      case 'click': {
        const d = this.out(undefined, 0.12, 0.1)
        if (!d) return
        this.osc('sine', 1600, 1200, t, 0.06, d, 0.6)
        break
      }
      case 'denied': {
        const d = this.out(undefined, 0.16, 0.4)
        if (!d) return
        this.osc('square', 220, 200, t, 0.12, d, 0.4, 'lin')
        this.osc('square', 165, 150, t + 0.15, 0.16, d, 0.4, 'lin')
        break
      }
      case 'waveStart': {
        const d = this.out(undefined, 0.3, 2)
        if (!d) return
        ;[110, 165, 220, 277].forEach((f) => this.osc('sawtooth', f, f * 1.01, t, 1.6, d, 0.25, 'lin'))
        this.noiseBurst(t, 1.4, d, 'bandpass', 300, 1500, 0.3, 2)
        break
      }
      case 'waveClear': {
        const d = this.out(undefined, 0.25, 1.4)
        if (!d) return
        ;[523, 659, 784, 1046, 1318].forEach((f, i) => this.osc('triangle', f, f, t + i * 0.1, 0.5, d, 0.4, 'lin'))
        break
      }
      case 'victory': {
        const d = this.out(undefined, 0.3, 3.5)
        if (!d) return
        const notes = [523, 659, 784, 1046, 784, 1046, 1318, 1568]
        notes.forEach((f, i) => this.osc('triangle', f, f, t + i * 0.16, 0.6, d, 0.45, 'lin'))
        notes.forEach((f, i) => this.osc('sine', f / 2, f / 2, t + i * 0.16, 0.7, d, 0.3, 'lin'))
        break
      }
      case 'gameOver': {
        const d = this.out(undefined, 0.4, 3.5)
        if (!d) return
        ;[392, 330, 262, 196].forEach((f, i) => this.osc('sawtooth', f, f * 0.97, t + i * 0.32, 0.8, d, 0.3, 'lin'))
        this.osc('sine', 60, 25, t, 3, d, 0.8)
        break
      }
      case 'orbitalCharge': {
        const d = this.out(pos, 0.45, 1.4)
        if (!d) return
        this.osc('sawtooth', 120, 1800, t, 1.1, d, 0.3)
        this.osc('sine', 240, 3600, t, 1.1, d, 0.25)
        this.noiseBurst(t, 1.1, d, 'bandpass', 400, 6000, 0.3, 5)
        break
      }
      case 'orbitalImpact': {
        const d = this.out(pos, 1, 2.4)
        if (!d) return
        this.noiseBurst(t, 2.0, d, 'lowpass', 5000, 80, 1)
        this.osc('sine', 80, 22, t, 1.8, d, 1)
        this.osc('sawtooth', 300, 40, t, 0.9, d, 0.4)
        break
      }
      case 'land': {
        const d = this.out(pos, 0.12 * intensity, 0.2)
        if (!d) return
        this.osc('sine', 140, 50, t, 0.12, d, 0.8)
        break
      }
      case 'select': {
        const d = this.out(pos, 0.2, 0.3)
        if (!d) return
        this.osc('sine', 880, 1320, t, 0.12, d, 0.5)
        this.osc('triangle', 1320, 1760, t + 0.06, 0.14, d, 0.3)
        break
      }
      case 'shieldBreak': {
        const d = this.out(pos, 0.3, 0.5)
        if (!d) return
        this.noiseBurst(t, 0.35, d, 'highpass', 4000, 1200, 0.6)
        this.osc('triangle', 1800, 300, t, 0.3, d, 0.4)
        break
      }
      case 'split': {
        const d = this.out(pos, 0.25, 0.4)
        if (!d) return
        this.noiseBurst(t, 0.25, d, 'bandpass', 500, 1500, 0.7, 3)
        this.osc('sine', 300, 600, t, 0.2, d, 0.4)
        break
      }
      case 'heal': {
        const d = this.out(pos, 0.15, 0.6)
        if (!d) return
        ;[660, 830, 990].forEach((f, i) => this.osc('sine', f, f * 1.02, t + i * 0.05, 0.3, d, 0.35, 'lin'))
        break
      }
      case 'bossWarn': {
        const d = this.out(undefined, 0.4, 2.6)
        if (!d) return
        for (let i = 0; i < 3; i++) this.osc('sawtooth', 220, 110, t + i * 0.55, 0.45, d, 0.35)
        this.osc('sine', 55, 40, t, 2.2, d, 0.9)
        break
      }
      case 'overheat': {
        const d = this.out(pos, 0.3, 0.8)
        if (!d) return
        this.noiseBurst(t, 0.7, d, 'highpass', 2000, 800, 0.5)
        this.osc('square', 300, 120, t, 0.5, d, 0.2)
        break
      }
    }
  }

  /** Low ominous loop emitted from a rift. */
  startDrone(pos: Vector3) {
    const ctx = this.ctx
    if (!ctx) return
    const p = ctx.createPanner()
    p.panningModel = 'HRTF'
    p.distanceModel = 'inverse'
    p.refDistance = 0.5
    p.rolloffFactor = 1.2
    if (p.positionX) {
      p.positionX.value = pos.x
      p.positionY.value = pos.y
      p.positionZ.value = pos.z
    } else p.setPosition(pos.x, pos.y, pos.z)
    const g = ctx.createGain()
    g.gain.value = 0
    g.gain.setTargetAtTime(0.09, ctx.currentTime, 1.2)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 380
    filter.Q.value = 6
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.21 + Math.random() * 0.2
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 220
    lfo.connect(lfoGain)
    lfoGain.connect(filter.frequency)
    const oscs = [43, 43.6, 64.7].map((f) => {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f * (0.97 + Math.random() * 0.06)
      o.connect(filter)
      o.start()
      return o
    })
    const n = ctx.createBufferSource()
    n.buffer = this.noise
    n.loop = true
    const nf = ctx.createBiquadFilter()
    nf.type = 'bandpass'
    nf.frequency.value = 900
    nf.Q.value = 1.5
    const ng = ctx.createGain()
    ng.gain.value = 0.25
    n.connect(nf)
    nf.connect(ng)
    ng.connect(filter)
    n.start()
    lfo.start()
    filter.connect(g)
    g.connect(p)
    p.connect(this.master)
    const stop = () => {
      const t = ctx.currentTime
      g.gain.setTargetAtTime(0, t, 0.3)
      window.setTimeout(() => {
        oscs.forEach((o) => o.stop())
        n.stop()
        lfo.stop()
        p.disconnect()
      }, 1500)
    }
    this.drones.push({ stop })
  }

  stopDrones() {
    this.drones.forEach((d) => d.stop())
    this.drones = []
  }
}

export const sfx = new Sfx()
