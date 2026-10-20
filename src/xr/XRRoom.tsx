import { useFrame, useThree } from '@react-three/fiber'
import { useXRMeshes, useXRPlanes, XRMeshModel, XRPlaneModel, XRSpace } from '@react-three/xr'
import { useEffect, useRef } from 'react'
import { Matrix4, Mesh, Vector3 } from 'three'
import { game } from '../game/Game'
import type { Obstacle, RoomModel, WallInfo } from '../game/room'
import { keyOf } from './keys'

const _m = new Matrix4()
const _v = new Vector3()
const _a = new Vector3()
const _b = new Vector3()

const FLOORISH = new Set(['floor'])
const IGNORE_MESH = new Set(['global mesh', 'wall', 'floor', 'ceiling', 'door frame', 'window frame', 'door', 'window', 'wall art'])

/** Invisible depth-only occluder + shadow catcher for one detected plane. */
function PlaneSurface({ plane }: { plane: XRPlane }) {
  const occluder = useRef<Mesh>(null)
  const label = plane.semanticLabel ?? ''
  const horizontal = plane.orientation === 'horizontal' && label !== 'ceiling'
  useEffect(() => {
    const m = occluder.current
    if (!m) return
    game.surfaces.add(m)
    return () => {
      game.surfaces.delete(m)
    }
  }, [])
  return (
    <XRSpace space={plane.planeSpace}>
      <XRPlaneModel ref={occluder} plane={plane} renderOrder={-10}>
        <meshBasicMaterial colorWrite={false} />
      </XRPlaneModel>
      {horizontal && (
        <XRPlaneModel plane={plane} renderOrder={-5} receiveShadow position={[0, 0.002, 0]}>
          <shadowMaterial transparent opacity={0.45} depthWrite={false} color="#05000f" />
        </XRPlaneModel>
      )}
    </XRSpace>
  )
}

function MeshOccluder({ mesh }: { mesh: XRMesh }) {
  return (
    <XRSpace space={mesh.meshSpace}>
      <XRMeshModel mesh={mesh} renderOrder={-10}>
        <meshBasicMaterial colorWrite={false} />
      </XRMeshModel>
    </XRSpace>
  )
}

function round(n: number) {
  return Math.round(n * 20) / 20
}

/**
 * Converts detected planes and meshes into occluders, shadow catchers and the
 * simplified room model (floor, walls, furniture) used for rifts and path finding.
 */
export function XRRoom() {
  const planes = useXRPlanes()
  const meshes = useXRMeshes()
  const gl = useThree((s) => s.gl)
  const timer = useRef(0)
  const lastSig = useRef('')

  useFrame((_, dt, frame: XRFrame | undefined) => {
    timer.current -= dt
    if (timer.current > 0 || !frame) return
    timer.current = 1
    const ref = gl.xr.getReferenceSpace()
    if (!ref || (planes.length === 0 && meshes.length === 0)) return

    let floorY: number | null = null
    let floorPoly: Array<[number, number]> | undefined
    let floorArea = 0
    const walls: WallInfo[] = []
    const obstacles: Obstacle[] = []
    const horizontals: Array<{ y: number; label: string; xs: number[]; zs: number[] }> = []

    for (const p of planes) {
      const pose = frame.getPose(p.planeSpace, ref)
      if (!pose) continue
      _m.fromArray(pose.transform.matrix)
      const label = p.semanticLabel ?? ''
      const xs: number[] = []
      const zs: number[] = []
      const ys: number[] = []
      let minLX = Infinity
      let maxLX = -Infinity
      let minLZ = Infinity
      let maxLZ = -Infinity
      for (const pt of p.polygon) {
        minLX = Math.min(minLX, pt.x)
        maxLX = Math.max(maxLX, pt.x)
        minLZ = Math.min(minLZ, pt.z)
        maxLZ = Math.max(maxLZ, pt.z)
        _v.set(pt.x, 0, pt.z).applyMatrix4(_m)
        xs.push(_v.x)
        ys.push(_v.y)
        zs.push(_v.z)
      }
      if (xs.length < 3) continue
      if (p.orientation === 'horizontal') {
        const y = ys.reduce((a, b) => a + b, 0) / ys.length
        const area = (maxLX - minLX) * (maxLZ - minLZ)
        if (FLOORISH.has(label) || (label === '' && area > 2)) {
          if (floorY === null || area > floorArea) {
            floorY = y
            floorArea = area
            floorPoly = xs.map((x, i) => [x, zs[i]] as [number, number])
          }
        } else if (label !== 'ceiling') {
          horizontals.push({ y, label: label || 'other', xs, zs })
        }
      } else {
        // vertical plane: figure out which local axis is up
        const cx = (minLX + maxLX) / 2
        const cz = (minLZ + maxLZ) / 2
        const center = new Vector3(cx, 0, cz).applyMatrix4(_m)
        const normal = new Vector3(0, 1, 0).transformDirection(_m)
        normal.y = 0
        if (normal.lengthSq() < 1e-4) continue
        normal.normalize()
        _a.set(1, 0, 0).transformDirection(_m)
        const xIsUp = Math.abs(_a.y) > 0.7
        const width = xIsUp ? maxLZ - minLZ : maxLX - minLX
        const height = xIsUp ? maxLX - minLX : maxLZ - minLZ
        const bottom = Math.min(...ys)
        if (label === 'wall' || (label === '' && width > 1.2 && height > 1.6)) {
          walls.push({ center, normal, width, height, bottom })
        } else if (label !== 'door' && label !== 'window' && label !== 'wall art' && label !== 'screen') {
          // vertical furniture faces (e.g. a cupboard front) only block the floor near them
          const half = width / 2
          _b.set(-normal.z, 0, normal.x).multiplyScalar(half)
          obstacles.push({
            minX: Math.min(center.x - _b.x, center.x + _b.x) - 0.05,
            maxX: Math.max(center.x - _b.x, center.x + _b.x) + 0.05,
            minZ: Math.min(center.z - _b.z, center.z + _b.z) - 0.05,
            maxZ: Math.max(center.z - _b.z, center.z + _b.z) + 0.05,
            top: bottom + height,
            label: label || 'other',
          })
        }
      }
    }

    const fy = floorY ?? 0
    for (const h of horizontals) {
      const top = h.y - fy
      if (top < 0.12 || top > 2.2) continue
      obstacles.push({ minX: Math.min(...h.xs), maxX: Math.max(...h.xs), minZ: Math.min(...h.zs), maxZ: Math.max(...h.zs), top: h.y, label: h.label })
    }

    // labelled meshes (furniture volumes) and the global room mesh
    const blocked: number[] = []
    for (const mesh of meshes) {
      const pose = frame.getPose(mesh.meshSpace, ref)
      if (!pose) continue
      _m.fromArray(pose.transform.matrix)
      const label = mesh.semanticLabel ?? ''
      const verts = mesh.vertices
      if (label === 'global mesh' || label === '') {
        const step = Math.max(3, Math.floor(verts.length / 3 / 6000) * 3)
        for (let i = 0; i + 2 < verts.length; i += step) {
          _v.set(verts[i], verts[i + 1], verts[i + 2]).applyMatrix4(_m)
          const h = _v.y - fy
          if (h > 0.15 && h < 1.1) blocked.push(_v.x, _v.z)
        }
        continue
      }
      if (IGNORE_MESH.has(label)) continue
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      let minZ = Infinity
      let maxZ = -Infinity
      for (let i = 0; i + 2 < verts.length; i += 3) {
        _v.set(verts[i], verts[i + 1], verts[i + 2]).applyMatrix4(_m)
        minX = Math.min(minX, _v.x)
        maxX = Math.max(maxX, _v.x)
        minY = Math.min(minY, _v.y)
        maxY = Math.max(maxY, _v.y)
        minZ = Math.min(minZ, _v.z)
        maxZ = Math.max(maxZ, _v.z)
      }
      if (minY - fy < 0.3 && maxY - fy > 0.12 && maxX - minX < 4 && maxZ - minZ < 4) {
        obstacles.push({ minX, maxX, minZ, maxZ, top: maxY, label })
      }
    }

    let bounds
    if (floorPoly) {
      bounds = {
        minX: Math.min(...floorPoly.map((p) => p[0])),
        maxX: Math.max(...floorPoly.map((p) => p[0])),
        minZ: Math.min(...floorPoly.map((p) => p[1])),
        maxZ: Math.max(...floorPoly.map((p) => p[1])),
      }
    } else if (walls.length >= 2) {
      bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
      for (const w of walls) {
        const half = w.width / 2
        for (const s of [-1, 1]) {
          const x = w.center.x - w.normal.z * half * s
          const z = w.center.z + w.normal.x * half * s
          bounds.minX = Math.min(bounds.minX, x)
          bounds.maxX = Math.max(bounds.maxX, x)
          bounds.minZ = Math.min(bounds.minZ, z)
          bounds.maxZ = Math.max(bounds.maxZ, z)
        }
      }
    } else {
      const c = game.playerPos
      bounds = { minX: c.x - 3, maxX: c.x + 3, minZ: c.z - 3, maxZ: c.z + 3 }
    }
    // keep the grid at a sane size
    const maxSpan = 9
    if (bounds.maxX - bounds.minX > maxSpan) {
      const m = (bounds.maxX + bounds.minX) / 2
      bounds.minX = m - maxSpan / 2
      bounds.maxX = m + maxSpan / 2
    }
    if (bounds.maxZ - bounds.minZ > maxSpan) {
      const m = (bounds.maxZ + bounds.minZ) / 2
      bounds.minZ = m - maxSpan / 2
      bounds.maxZ = m + maxSpan / 2
    }

    const signature = [
      round(fy),
      walls.map((w) => `${round(w.center.x)},${round(w.center.z)},${round(w.width)}`).join(';'),
      obstacles.map((o) => `${round(o.minX)},${round(o.minZ)},${round(o.maxX)},${round(o.maxZ)}`).join(';'),
      Math.round(blocked.length / 200),
    ].join('|')
    if (signature === lastSig.current) return
    lastSig.current = signature
    const room: RoomModel = {
      source: 'xr',
      floorY: fy,
      bounds,
      floorPolygon: floorPoly,
      walls,
      obstacles,
      blockedPoints: blocked.length ? new Float32Array(blocked) : undefined,
      signature,
    }
    game.setRoom(room)
  })

  return (
    <group>
      {planes.map((p) => (
        <PlaneSurface key={keyOf(p)} plane={p} />
      ))}
      {meshes.map((m) => (
        <MeshOccluder key={keyOf(m)} mesh={m} />
      ))}
    </group>
  )
}
