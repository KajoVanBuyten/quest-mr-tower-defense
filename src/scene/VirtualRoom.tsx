import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, Group, Mesh, RepeatWrapping, SRGBColorSpace } from 'three'
import { game } from '../game/Game'
import { createVirtualRoomModel, VIRTUAL_ROOM } from '../game/room'

function floorTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#10131c'
  ctx.fillRect(0, 0, 512, 512)
  // concrete-like grain
  for (let i = 0; i < 9000; i++) {
    const v = 14 + Math.random() * 14
    ctx.fillStyle = `rgba(${v + 6},${v + 8},${v + 16},${Math.random() * 0.35})`
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
  }
  ctx.strokeStyle = 'rgba(80,110,160,0.22)'
  ctx.lineWidth = 2
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath()
    ctx.moveTo(i * 128, 0)
    ctx.lineTo(i * 128, 512)
    ctx.moveTo(0, i * 128)
    ctx.lineTo(512, i * 128)
    ctx.stroke()
  }
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(VIRTUAL_ROOM.width / 2, VIRTUAL_ROOM.depth / 2)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

function wallTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, '#151a28')
  g.addColorStop(1, '#0d1019')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 256)
  ctx.strokeStyle = 'rgba(120,150,210,0.12)'
  ctx.lineWidth = 3
  for (let x = 0; x <= 512; x += 128) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, 256)
    ctx.stroke()
  }
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.colorSpace = SRGBColorSpace
  return t
}

/** Stylized apartment used outside of AR so the game can be played and captured on a PC. */
export function VirtualRoom() {
  const group = useRef<Group>(null)
  const R = VIRTUAL_ROOM
  const tex = useMemo(() => ({ floor: floorTexture(), wall: wallTexture() }), [])

  useEffect(() => {
    game.setRoom(createVirtualRoomModel())
    const g = group.current
    if (!g) return
    const registered: Mesh[] = []
    g.traverse((o) => {
      if ((o as Mesh).isMesh && o.userData.surface) {
        game.surfaces.add(o)
        registered.push(o as Mesh)
      } else if ((o as Mesh).isMesh && o.userData.furniture) {
        game.furniture.add(o)
        registered.push(o as Mesh)
      }
    })
    return () => {
      registered.forEach((m) => {
        game.surfaces.delete(m)
        game.furniture.delete(m)
      })
    }
  }, [])

  const hw = R.width / 2
  const hd = R.depth / 2
  const sx = R.sofa.x
  const sz = R.sofa.z
  return (
    <group ref={group}>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow userData={{ surface: true }}>
        <planeGeometry args={[R.width, R.depth]} />
        <meshStandardMaterial map={tex.floor} roughness={0.55} metalness={0.25} color="#c8d0e8" />
      </mesh>
      {/* walls */}
      <mesh position={[0, R.height / 2, -hd]} receiveShadow userData={{ surface: true }}>
        <planeGeometry args={[R.width, R.height]} />
        <meshStandardMaterial map={tex.wall} roughness={0.85} color="#b8c2dd" />
      </mesh>
      <mesh position={[-hw, R.height / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow userData={{ surface: true }}>
        <planeGeometry args={[R.depth, R.height]} />
        <meshStandardMaterial map={tex.wall} roughness={0.85} color="#b8c2dd" />
      </mesh>
      <mesh position={[hw, R.height / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow userData={{ surface: true }}>
        <planeGeometry args={[R.depth, R.height]} />
        <meshStandardMaterial map={tex.wall} roughness={0.85} color="#b8c2dd" />
      </mesh>
      {/* neon baseboards */}
      {[
        { p: [0, 0.03, -hd + 0.01] as const, r: 0, w: R.width },
        { p: [-hw + 0.01, 0.03, 0] as const, r: Math.PI / 2, w: R.depth },
        { p: [hw - 0.01, 0.03, 0] as const, r: -Math.PI / 2, w: R.depth },
      ].map((b, i) => (
        <mesh key={i} position={[b.p[0], b.p[1], b.p[2]]} rotation={[0, b.r, 0]}>
          <boxGeometry args={[b.w, 0.012, 0.012]} />
          <meshStandardMaterial color="#000" emissive="#3a6bff" emissiveIntensity={2.5} toneMapped={false} />
        </mesh>
      ))}
      {/* ceiling light strip reflection on the back wall */}
      <mesh position={[0, R.height - 0.06, -hd + 0.01]}>
        <boxGeometry args={[R.width * 0.8, 0.02, 0.01]} />
        <meshStandardMaterial color="#000" emissive="#9fb8ff" emissiveIntensity={1.4} toneMapped={false} />
      </mesh>

      {/* table */}
      <group position={[R.table.x, 0, R.table.z]}>
        <mesh position={[0, R.table.top - 0.02, 0]} castShadow receiveShadow userData={{ surface: true }}>
          <boxGeometry args={[R.table.w, 0.04, R.table.d]} />
          <meshStandardMaterial color="#3a2c22" roughness={0.45} metalness={0.05} />
        </mesh>
        {[
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ].map(([x, z], i) => (
          <mesh key={i} position={[(x * (R.table.w - 0.1)) / 2, (R.table.top - 0.04) / 2, (z * (R.table.d - 0.1)) / 2]} castShadow>
            <boxGeometry args={[0.05, R.table.top - 0.04, 0.05]} />
            <meshStandardMaterial color="#1c1f27" metalness={0.8} roughness={0.35} />
          </mesh>
        ))}
        <mesh position={[0, R.table.top - 0.045, R.table.d / 2 - 0.005]}>
          <boxGeometry args={[R.table.w - 0.04, 0.006, 0.006]} />
          <meshStandardMaterial color="#000" emissive="#ff7ad8" emissiveIntensity={2} toneMapped={false} />
        </mesh>
      </group>

      {/* sofa */}
      <group position={[sx, 0, sz]}>
        <mesh position={[0, 0.16, 0]} castShadow receiveShadow userData={{ furniture: true }}>
          <boxGeometry args={[R.sofa.w, 0.24, R.sofa.d]} />
          <meshStandardMaterial color="#232a3e" roughness={0.9} />
        </mesh>
        <mesh position={[0.06, R.sofa.seat - 0.06, 0]} castShadow receiveShadow userData={{ surface: true }}>
          <boxGeometry args={[R.sofa.w - 0.12, 0.12, R.sofa.d - 0.24]} />
          <meshStandardMaterial color="#2e3752" roughness={0.95} />
        </mesh>
        <mesh position={[-R.sofa.w / 2 + 0.08, R.sofa.back / 2 + 0.05, 0]} castShadow receiveShadow userData={{ surface: true }}>
          <boxGeometry args={[0.16, R.sofa.back - 0.1, R.sofa.d]} />
          <meshStandardMaterial color="#283049" roughness={0.95} />
        </mesh>
        {[1, -1].map((s) => (
          <mesh key={s} position={[0, 0.33, (s * (R.sofa.d - 0.12)) / 2]} castShadow receiveShadow userData={{ surface: true }}>
            <boxGeometry args={[R.sofa.w, 0.3, 0.12]} />
            <meshStandardMaterial color="#283049" roughness={0.95} />
          </mesh>
        ))}
      </group>

      {/* sideboard against the back wall */}
      <group position={[R.shelf.x, 0, R.shelf.z]}>
        <mesh position={[0, R.shelf.top / 2, 0]} castShadow receiveShadow userData={{ surface: true }}>
          <boxGeometry args={[R.shelf.w, R.shelf.top, R.shelf.d]} />
          <meshStandardMaterial color="#1b1f2b" roughness={0.5} metalness={0.3} />
        </mesh>
        <mesh position={[0, R.shelf.top * 0.55, R.shelf.d / 2 + 0.002]}>
          <boxGeometry args={[R.shelf.w - 0.1, 0.008, 0.004]} />
          <meshStandardMaterial color="#000" emissive="#4fd8ff" emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
        {[-0.55, -0.45, -0.38].map((x, i) => (
          <mesh key={i} position={[x, R.shelf.top + 0.11, 0]} rotation={[0, 0, i === 2 ? 0.25 : 0]} castShadow>
            <boxGeometry args={[0.06, 0.22, 0.16]} />
            <meshStandardMaterial color={['#5a2a3a', '#2a3a5a', '#3a5a3a'][i]} roughness={0.8} />
          </mesh>
        ))}
      </group>

      {/* plinth with lamp */}
      <group position={[R.plinth.x, 0, R.plinth.z]}>
        <mesh position={[0, R.plinth.top / 2, 0]} castShadow receiveShadow userData={{ surface: true }}>
          <boxGeometry args={[R.plinth.w, R.plinth.top, R.plinth.d]} />
          <meshStandardMaterial color="#20242f" roughness={0.6} metalness={0.2} />
        </mesh>
        <mesh position={[0.12, R.plinth.top + 0.1, -0.12]} castShadow>
          <sphereGeometry args={[0.07, 24, 16]} />
          <meshStandardMaterial color="#fff" emissive="#ffcf8a" emissiveIntensity={1.6} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}
