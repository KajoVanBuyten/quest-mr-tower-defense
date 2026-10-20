import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three'
import { TOWERS, type TowerType } from '../game/config'

export interface TowerModel {
  root: Group
  /** yaw-rotating part */
  turret: Object3D
  /** pitch part (child of turret) */
  barrel: Object3D
  muzzle: Object3D
  levelGroup: Group
  height: number
  materials: Material[]
  build: { value: number }
  baseY: { value: number }
  holo: LineSegments[]
  accent: MeshStandardMaterial
  spin: Object3D[]
}


function buildMaterial(params: ConstructorParameters<typeof MeshStandardMaterial>[0], build: { value: number }, baseY: { value: number }, height: number) {
  const m = new MeshStandardMaterial(params)
  const uHeight = { value: height }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBuild = build
    shader.uniforms.uBaseY = baseY
    shader.uniforms.uHeight = uHeight
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWorldY;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWorldY;\nuniform float uBuild;\nuniform float uBaseY;\nuniform float uHeight;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float bH = (vWorldY - uBaseY) / uHeight;
        float bCut = uBuild * 1.08;
        if (uBuild < 1.0 && bH > bCut) discard;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (uBuild < 1.0) {
          float scan = smoothstep(0.07, 0.0, abs(bH - bCut + 0.02));
          totalEmissiveRadiance += vec3(0.3, 0.9, 1.0) * (scan * 4.0 + (1.0 - uBuild) * 0.8);
        }`,
      )
  }
  m.customProgramCacheKey = () => 'rift-tower-build'
  return m
}

/** Builds a procedural tower model. All tower parts share the hologram build-up shader. */
export function createTowerModel(type: TowerType): TowerModel {
  const def = TOWERS[type]
  const build = { value: 0 }
  const baseY = { value: 0 }
  const height = type === 'mortar' ? 0.26 : type === 'frost' ? 0.36 : type === 'tesla' ? 0.4 : 0.34
  const materials: Material[] = []
  const mat = (p: ConstructorParameters<typeof MeshStandardMaterial>[0]) => {
    const m = buildMaterial(p, build, baseY, height)
    materials.push(m)
    return m
  }
  const hull = mat({ color: '#1a2030', metalness: 0.85, roughness: 0.3 })
  const hull2 = mat({ color: '#2b3348', metalness: 0.7, roughness: 0.35 })
  const accent = mat({ color: '#111', emissive: new Color(def.color), emissiveIntensity: 2.6, toneMapped: false })
  const glass = mat({ color: def.color, emissive: new Color(def.color), emissiveIntensity: 1.2, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.85 })

  const root = new Group()
  const turret = new Group()
  const barrel = new Group()
  const muzzle = new Object3D()
  const levelGroup = new Group()
  const spin: Object3D[] = []
  const add = (parent: Object3D, geo: BufferGeometry, m: Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const mesh = new Mesh(geo, m)
    mesh.position.set(x, y, z)
    mesh.rotation.set(rx, ry, rz)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  // shared hex base
  add(root, new CylinderGeometry(0.085, 0.1, 0.035, 6), hull, 0, 0.0175)
  add(root, new TorusGeometry(0.088, 0.005, 5, 6), accent, 0, 0.036, 0, Math.PI / 2, 0, Math.PI / 6)
  root.add(levelGroup)

  switch (type) {
    case 'laser': {
      add(root, new CylinderGeometry(0.035, 0.05, 0.16, 8), hull2, 0, 0.115)
      turret.position.y = 0.21
      add(turret, new BoxGeometry(0.08, 0.06, 0.1), hull, 0, 0, 0)
      add(turret, new BoxGeometry(0.085, 0.012, 0.06), accent, 0, 0.032, -0.01)
      turret.add(barrel)
      add(barrel, new CylinderGeometry(0.012, 0.016, 0.16, 8), hull2, 0, 0.0, 0.1, Math.PI / 2)
      add(barrel, new TorusGeometry(0.016, 0.004, 5, 10), accent, 0, 0, 0.13)
      add(barrel, new TorusGeometry(0.016, 0.004, 5, 10), accent, 0, 0, 0.09)
      add(barrel, new SphereGeometry(0.014, 10, 8), glass, 0, 0, 0.18)
      muzzle.position.set(0, 0, 0.19)
      break
    }
    case 'tesla': {
      add(root, new CylinderGeometry(0.03, 0.055, 0.22, 8), hull2, 0, 0.145)
      for (let i = 0; i < 4; i++) {
        const ring = add(root, new TorusGeometry(0.045 - i * 0.005, 0.007, 6, 18), i % 2 ? accent : hull, 0, 0.09 + i * 0.05, 0, Math.PI / 2)
        if (i % 2) spin.push(ring)
      }
      turret.position.y = 0.33
      add(turret, new SphereGeometry(0.04, 16, 12), glass, 0, 0, 0)
      add(turret, new TorusGeometry(0.055, 0.004, 6, 24), accent, 0, 0, 0, Math.PI / 2)
      turret.add(barrel)
      muzzle.position.set(0, 0.0, 0)
      break
    }
    case 'mortar': {
      add(root, new CylinderGeometry(0.075, 0.085, 0.07, 8), hull2, 0, 0.07)
      turret.position.y = 0.11
      add(turret, new CylinderGeometry(0.06, 0.07, 0.04, 8), hull, 0, 0)
      add(turret, new BoxGeometry(0.02, 0.06, 0.07), hull2, 0.05, 0.03, 0)
      add(turret, new BoxGeometry(0.02, 0.06, 0.07), hull2, -0.05, 0.03, 0)
      barrel.position.y = 0.04
      barrel.rotation.x = -0.85
      turret.add(barrel)
      add(barrel, new CylinderGeometry(0.03, 0.036, 0.15, 10), hull2, 0, 0, 0.05, Math.PI / 2)
      add(barrel, new TorusGeometry(0.033, 0.006, 6, 14), accent, 0, 0, 0.12)
      add(barrel, new CylinderGeometry(0.022, 0.022, 0.01, 10), accent, 0, 0, 0.126, Math.PI / 2)
      muzzle.position.set(0, 0, 0.13)
      break
    }
    case 'frost': {
      add(root, new CylinderGeometry(0.04, 0.06, 0.08, 6), hull2, 0, 0.075)
      turret.position.y = 0.2
      const c = add(turret, new OctahedronGeometry(0.05, 0), glass, 0, 0.02, 0)
      c.scale.set(0.8, 2.2, 0.8)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        const s = add(turret, new OctahedronGeometry(0.025, 0), glass, Math.cos(a) * 0.05, -0.04, Math.sin(a) * 0.05, Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5)
        s.scale.set(0.7, 2, 0.7)
      }
      add(turret, new TorusGeometry(0.07, 0.004, 6, 24), accent, 0, -0.07, 0, Math.PI / 2)
      turret.add(barrel)
      muzzle.position.set(0, 0.06, 0)
      spin.push(turret)
      break
    }
  }
  barrel.add(muzzle)
  root.add(turret)

  // hologram wireframe that fades away once the tower is assembled
  const holo: LineSegments[] = []
  const holoMat = new LineBasicMaterial({ color: '#6ff4ff', transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
  root.traverse((o) => {
    if ((o as Mesh).isMesh) {
      const mesh = o as Mesh
      const lines = new LineSegments(new EdgesGeometry(mesh.geometry, 25), holoMat)
      mesh.add(lines)
      holo.push(lines)
    }
  })

  return { root, turret, barrel, muzzle, levelGroup, height, materials, build, baseY, holo, accent, spin }
}

export function setTowerLevelVisual(model: TowerModel, level: number, color: string) {
  model.levelGroup.clear()
  const m = new MeshStandardMaterial({ color: '#111', emissive: new Color(color), emissiveIntensity: 3, toneMapped: false })
  for (let i = 1; i < level; i++) {
    const ring = new Mesh(new TorusGeometry(0.1 + i * 0.012, 0.004, 5, 6), m)
    ring.rotation.set(Math.PI / 2, 0, Math.PI / 6)
    ring.position.y = 0.006 + i * 0.008
    model.levelGroup.add(ring)
  }
  model.accent.emissiveIntensity = 2.6 + (level - 1) * 1.2
}

export function disposeTowerModel(model: TowerModel) {
  model.root.traverse((o) => {
    const mesh = o as Mesh
    if (mesh.geometry) mesh.geometry.dispose()
  })
  model.materials.forEach((m) => m.dispose())
}

