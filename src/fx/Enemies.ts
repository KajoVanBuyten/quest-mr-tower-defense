import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { EnemyType } from '../game/config'
import { NOISE_GLSL } from './glsl'

interface PartOpts {
  pos?: [number, number, number]
  rot?: [number, number, number]
  scale?: [number, number, number]
  color?: string
  glow?: number
  leg?: number
  phase?: number
  wing?: number
}

const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _s = new Vector3()
const _p = new Vector3()
const _c = new Color()

function part(geo: BufferGeometry, o: PartOpts = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.deleteAttribute('uv')
  _e.set(...(o.rot ?? [0, 0, 0]))
  _q.setFromEuler(_e)
  _s.set(...(o.scale ?? [1, 1, 1]))
  _p.set(...(o.pos ?? [0, 0, 0]))
  _m.compose(_p, _q, _s)
  g.applyMatrix4(_m)
  const n = g.getAttribute('position').count
  const col = new Float32Array(n * 3)
  const glow = new Float32Array(n)
  const anim = new Float32Array(n * 3)
  _c.set(o.color ?? '#2a1636')
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r
    col[i * 3 + 1] = _c.g
    col[i * 3 + 2] = _c.b
    glow[i] = o.glow ?? 0
    anim[i * 3] = o.leg ?? 0
    anim[i * 3 + 1] = o.phase ?? 0
    anim[i * 3 + 2] = o.wing ?? 0
  }
  g.setAttribute('color', new BufferAttribute(col, 3))
  g.setAttribute('aGlow', new BufferAttribute(glow, 1))
  g.setAttribute('aAnim', new BufferAttribute(anim, 3))
  return g
}

const sphere = (seg = 10) => new SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)))

function legs(count: number, spanX: number, z0: number, z1: number, y: number, len: number, thick: number, color: string) {
  const out: BufferGeometry[] = []
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? 1 : -1
    const row = Math.floor(i / 2)
    const rows = Math.max(1, count / 2 - 1)
    const z = z0 + ((z1 - z0) * row) / rows
    const tripod = (row + (side > 0 ? 0 : 1)) % 2
    // upper segment
    out.push(
      part(new CylinderGeometry(thick, thick * 0.8, len, 5), {
        pos: [side * (spanX + len * 0.35), y + len * 0.2, z],
        rot: [0, 0, side * 1.05],
        color,
        leg: 1,
        phase: tripod * Math.PI,
      }),
    )
    // lower segment
    out.push(
      part(new CylinderGeometry(thick * 0.8, thick * 0.35, len * 1.1, 5), {
        pos: [side * (spanX + len * 0.85), y - len * 0.25, z],
        rot: [0, 0, -side * 0.35],
        color,
        leg: 1.4,
        phase: tripod * Math.PI,
      }),
    )
  }
  return out
}

function swarmerGeometry() {
  const dark = '#24102f'
  const plate = '#3b1a4a'
  return mergeGeometries([
    part(sphere(), { pos: [0, 0.05, 0.005], scale: [0.042, 0.028, 0.05], color: plate }),
    part(sphere(), { pos: [0, 0.055, -0.055], scale: [0.04, 0.034, 0.05], color: dark }),
    part(sphere(), { pos: [0, 0.058, -0.06], scale: [0.018, 0.02, 0.04], color: dark, glow: 0.8 }),
    part(sphere(8), { pos: [0, 0.048, 0.055], scale: [0.024, 0.02, 0.024], color: dark }),
    part(sphere(6), { pos: [0.011, 0.054, 0.074], scale: [0.007, 0.007, 0.007], glow: 1.4 }),
    part(sphere(6), { pos: [-0.011, 0.054, 0.074], scale: [0.007, 0.007, 0.007], glow: 1.4 }),
    part(new ConeGeometry(0.005, 0.03, 4), { pos: [0.01, 0.035, 0.08], rot: [1.9, 0, 0.2], color: plate }),
    part(new ConeGeometry(0.005, 0.03, 4), { pos: [-0.01, 0.035, 0.08], rot: [1.9, 0, -0.2], color: plate }),
    ...legs(6, 0.03, -0.025, 0.035, 0.045, 0.045, 0.0045, dark),
  ])!
}

function tankGeometry() {
  const shell = '#2c1a24'
  const plate = '#4a2a2a'
  const parts: BufferGeometry[] = [
    part(sphere(14), { pos: [0, 0.1, 0], scale: [0.1, 0.065, 0.13], color: shell }),
    part(new BoxGeometry(1, 1, 1), { pos: [0, 0.155, 0.02], scale: [0.11, 0.02, 0.07], rot: [0.15, 0, 0], color: plate }),
    part(new BoxGeometry(1, 1, 1), { pos: [0, 0.15, -0.06], scale: [0.12, 0.022, 0.06], rot: [-0.2, 0, 0], color: plate }),
    part(new BoxGeometry(1, 1, 1), { pos: [0.075, 0.12, 0], scale: [0.03, 0.05, 0.16], rot: [0, 0, -0.4], color: plate }),
    part(new BoxGeometry(1, 1, 1), { pos: [-0.075, 0.12, 0], scale: [0.03, 0.05, 0.16], rot: [0, 0, 0.4], color: plate }),
    part(sphere(10), { pos: [0, 0.09, 0.12], scale: [0.05, 0.04, 0.04], color: shell }),
    part(new ConeGeometry(0.012, 0.07, 5), { pos: [0.03, 0.075, 0.165], rot: [1.75, 0, 0.3], color: '#6a3b2b', glow: 0.2 }),
    part(new ConeGeometry(0.012, 0.07, 5), { pos: [-0.03, 0.075, 0.165], rot: [1.75, 0, -0.3], color: '#6a3b2b', glow: 0.2 }),
    part(sphere(6), { pos: [0.02, 0.105, 0.155], scale: [0.009, 0.009, 0.009], glow: 1.6 }),
    part(sphere(6), { pos: [-0.02, 0.105, 0.155], scale: [0.009, 0.009, 0.009], glow: 1.6 }),
  ]
  for (let i = 0; i < 3; i++) {
    parts.push(part(new BoxGeometry(1, 1, 1), { pos: [0, 0.135 + i * 0.002, -0.02 - i * 0.04], scale: [0.05, 0.01, 0.012], glow: 1 }))
  }
  parts.push(...legs(4, 0.07, -0.07, 0.07, 0.07, 0.07, 0.013, shell))
  return mergeGeometries(parts)!
}

function flyerGeometry() {
  const body = '#13202e'
  return mergeGeometries([
    part(new OctahedronGeometry(1, 0), { pos: [0, 0, 0], scale: [0.03, 0.024, 0.075], color: body }),
    part(sphere(8), { pos: [0, 0.004, 0.05], scale: [0.018, 0.016, 0.022], color: body }),
    part(sphere(6), { pos: [0, 0.008, 0.07], scale: [0.009, 0.006, 0.006], glow: 1.6 }),
    part(sphere(8), { pos: [0, 0, -0.07], scale: [0.012, 0.012, 0.02], glow: 1.4 }),
    part(new BoxGeometry(1, 1, 1), { pos: [0.075, 0.004, 0], scale: [0.11, 0.003, 0.05], rot: [0, 0.25, 0], color: '#1d3a52', glow: 0.35, wing: 1 }),
    part(new BoxGeometry(1, 1, 1), { pos: [-0.075, 0.004, 0], scale: [0.11, 0.003, 0.05], rot: [0, -0.25, 0], color: '#1d3a52', glow: 0.35, wing: 1 }),
    part(new BoxGeometry(1, 1, 1), { pos: [0.05, 0.006, -0.03], scale: [0.06, 0.003, 0.03], rot: [0, 0.6, 0], color: '#1d3a52', glow: 0.6, wing: 0.7 }),
    part(new BoxGeometry(1, 1, 1), { pos: [-0.05, 0.006, -0.03], scale: [0.06, 0.003, 0.03], rot: [0, -0.6, 0], color: '#1d3a52', glow: 0.6, wing: 0.7 }),
  ])!
}

function bossGeometry() {
  const shell = '#1e0c1c'
  const plate = '#3c1630'
  const parts: BufferGeometry[] = [
    part(sphere(18), { pos: [0, 0.26, -0.02], scale: [0.22, 0.15, 0.3], color: shell }),
    part(sphere(14), { pos: [0, 0.25, 0.28], scale: [0.12, 0.1, 0.1], color: plate }),
    part(sphere(12), { pos: [0, 0.28, -0.3], scale: [0.16, 0.13, 0.16], color: shell, glow: 0.25 }),
  ]
  for (let i = 0; i < 7; i++) {
    const z = -0.25 + i * 0.075
    parts.push(part(new ConeGeometry(0.03, 0.14 - Math.abs(i - 3) * 0.015, 5), { pos: [0, 0.41 - Math.abs(i - 3) * 0.01, z], rot: [-0.3, 0, 0], color: plate, glow: 0.15 }))
    parts.push(part(new ConeGeometry(0.02, 0.09, 5), { pos: [0.13, 0.36, z], rot: [-0.2, 0, -0.7], color: plate }))
    parts.push(part(new ConeGeometry(0.02, 0.09, 5), { pos: [-0.13, 0.36, z], rot: [-0.2, 0, 0.7], color: plate }))
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 3 - 0.5) * 0.9
    parts.push(part(sphere(6), { pos: [Math.sin(a) * 0.08, 0.29 + (i % 2) * 0.02, 0.36], scale: [0.017, 0.017, 0.017], glow: 2 }))
  }
  parts.push(part(new ConeGeometry(0.03, 0.16, 5), { pos: [0.06, 0.18, 0.38], rot: [1.9, 0, 0.3], color: '#552244', glow: 0.3 }))
  parts.push(part(new ConeGeometry(0.03, 0.16, 5), { pos: [-0.06, 0.18, 0.38], rot: [1.9, 0, -0.3], color: '#552244', glow: 0.3 }))
  for (let i = 0; i < 5; i++) {
    parts.push(part(new BoxGeometry(1, 1, 1), { pos: [0, 0.33 - i * 0.004, 0.05 - i * 0.07], scale: [0.16, 0.012, 0.02], glow: 0.9 }))
  }
  parts.push(...legs(6, 0.17, -0.2, 0.2, 0.18, 0.17, 0.03, shell))
  return mergeGeometries(parts)!
}

// creatures are modelled at roughly real insect scale and enlarged for readability in a room
const ENEMY_SCALE: Record<EnemyType, number> = { swarmer: 1.4, tank: 1.4, flyer: 1.4, boss: 1.28 }

const TYPE_STYLE: Record<EnemyType, { glow: string; capacity: number; animSpeed: number; animAmp: number; noiseScale: number }> = {
  swarmer: { glow: '#ff2fd0', capacity: 160, animSpeed: 22, animAmp: 0.017, noiseScale: 50 },
  tank: { glow: '#ff7a1a', capacity: 48, animSpeed: 9, animAmp: 0.025, noiseScale: 30 },
  flyer: { glow: '#38f0ff', capacity: 64, animSpeed: 26, animAmp: 0, noiseScale: 50 },
  boss: { glow: '#ff2f4f', capacity: 4, animSpeed: 5, animAmp: 0.05, noiseScale: 14 },
}

/** One instanced mesh per creature type with a dissolve / hit-flash shader. */
export class EnemyRenderer {
  readonly group = new Group()
  readonly meshes: Record<EnemyType, InstancedMesh>
  private data: Record<EnemyType, InstancedBufferAttribute>
  private counts: Record<EnemyType, number> = { swarmer: 0, tank: 0, flyer: 0, boss: 0 }
  private time = { value: 0 }

  constructor() {
    const geos: Record<EnemyType, BufferGeometry> = {
      swarmer: swarmerGeometry(),
      tank: tankGeometry(),
      flyer: flyerGeometry(),
      boss: bossGeometry(),
    }
    const meshes = {} as Record<EnemyType, InstancedMesh>
    const data = {} as Record<EnemyType, InstancedBufferAttribute>
    for (const type of Object.keys(geos) as EnemyType[]) {
      const style = TYPE_STYLE[type]
      const geo = geos[type]
      geo.scale(ENEMY_SCALE[type], ENEMY_SCALE[type], ENEMY_SCALE[type])
      geo.computeBoundingSphere()
      const attr = new InstancedBufferAttribute(new Float32Array(style.capacity * 4), 4).setUsage(DynamicDrawUsage)
      geo.setAttribute('iData', attr)
      const mat = this.createMaterial(style.glow, style.animSpeed, style.animAmp, style.noiseScale)
      const mesh = new InstancedMesh(geo, mat, style.capacity)
      mesh.instanceMatrix.setUsage(DynamicDrawUsage)
      mesh.frustumCulled = false
      mesh.castShadow = true
      mesh.receiveShadow = false
      mesh.count = 0
      meshes[type] = mesh
      data[type] = attr
      this.group.add(mesh)
    }
    this.meshes = meshes
    this.data = data
  }

  private createMaterial(glow: string, animSpeed: number, animAmp: number, noiseScale: number) {
    const mat = new MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.38,
      metalness: 0.35,
      emissive: '#000000',
    })
    const uniforms = {
      uTime: this.time,
      uGlowColor: { value: new Color(glow) },
      uAnimSpeed: { value: animSpeed },
      uAnimAmp: { value: animAmp },
      uNoiseScale: { value: noiseScale },
    }
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          attribute float aGlow;
          attribute vec3 aAnim;
          attribute vec4 iData;
          uniform float uTime;
          uniform float uAnimSpeed;
          uniform float uAnimAmp;
          varying float vGlow;
          varying vec4 vData;
          varying vec3 vObj;`,
        )
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          float rdPh = uTime * uAnimSpeed * (1.0 - iData.w * 0.5) + iData.z;
          if (aAnim.x > 0.0) {
            float s = sin(rdPh + aAnim.y);
            transformed.y += max(s, 0.0) * uAnimAmp * aAnim.x;
            transformed.z += cos(rdPh + aAnim.y) * uAnimAmp * 0.8 * aAnim.x;
          }
          if (aAnim.z > 0.0) {
            transformed.y += sin(rdPh) * abs(transformed.x) * 0.9 * aAnim.z;
          }
          vGlow = aGlow;
          vData = iData;
          vObj = position;`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          uniform float uTime;
          uniform vec3 uGlowColor;
          uniform float uNoiseScale;
          varying float vGlow;
          varying vec4 vData;
          varying vec3 vObj;
          ${NOISE_GLSL}`,
        )
        .replace(
          '#include <clipping_planes_fragment>',
          /* glsl */ `#include <clipping_planes_fragment>
          float rdN = rd_noise(vObj * uNoiseScale) * 0.7 + rd_noise(vObj * uNoiseScale * 3.1) * 0.3;
          float rdDis = vData.x;
          if (rdDis > 0.0 && rdN < rdDis) discard;
          float rdEdge = rdDis > 0.0 ? smoothstep(rdDis + 0.12, rdDis, rdN) : 0.0;`,
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.85, 1.0), vData.w * 0.55);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          float rdPulse = 0.75 + 0.25 * sin(uTime * 5.0 + vData.z);
          totalEmissiveRadiance = uGlowColor * vGlow * rdPulse * 2.2
            + vec3(1.0, 0.92, 1.0) * vData.y * 2.4
            + vec3(0.35, 0.8, 1.0) * vData.w * 0.45
            + mix(uGlowColor, vec3(1.0), 0.45) * rdEdge * 7.0;`,
        )
    }
    mat.customProgramCacheKey = () => 'rift-enemy'
    return mat
  }

  begin(time: number) {
    this.time.value = time
    this.counts.swarmer = this.counts.tank = this.counts.flyer = this.counts.boss = 0
  }

  push(type: EnemyType, matrix: Matrix4, dissolve: number, flash: number, phase: number, slow: number) {
    const mesh = this.meshes[type]
    const i = this.counts[type]
    if (i >= mesh.instanceMatrix.count) return
    mesh.setMatrixAt(i, matrix)
    const arr = this.data[type].array as Float32Array
    arr[i * 4] = dissolve
    arr[i * 4 + 1] = flash
    arr[i * 4 + 2] = phase
    arr[i * 4 + 3] = slow
    this.counts[type] = i + 1
  }

  end() {
    for (const type of Object.keys(this.meshes) as EnemyType[]) {
      const mesh = this.meshes[type]
      mesh.count = this.counts[type]
      if (mesh.count > 0) {
        mesh.instanceMatrix.needsUpdate = true
        this.data[type].needsUpdate = true
      }
    }
  }
}
