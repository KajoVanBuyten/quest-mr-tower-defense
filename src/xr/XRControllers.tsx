import { useFrame } from '@react-three/fiber'
import { DefaultXRController, DefaultXRHand, useXRInputSourceStateContext, XRHitTest, XRSpace } from '@react-three/xr'
import { useEffect, useRef } from 'react'
import { Color, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { game } from '../game/Game'
import { WristMenu } from './WristMenu'
import { xrShared } from './xrShared'

const HOT = new Color('#ff4a1a')
const COOL = new Color('#c9ff5a')

function HitTester({ source }: { source: XRInputSource }) {
  return (
    <XRHitTest
      space={source.targetRaySpace}
      onResults={(results, getWorldMatrix) => {
        const s = xrShared.rightHit
        if (results.length > 0 && getWorldMatrix(s.matrix, results[0])) {
          s.valid = true
          s.time = performance.now()
          xrShared.hitSource = source
        } else if (xrShared.hitSource === source) {
          s.valid = false
        }
      }}
    />
  )
}

function useMuzzle() {
  const muzzle = useRef<Object3D>(null)
  useEffect(() => {
    const m = muzzle.current
    if (!m) return
    xrShared.muzzle = m
    return () => {
      if (xrShared.muzzle === m) xrShared.muzzle = null
    }
  }, [])
  return muzzle
}

/** Procedural hand blaster attached to the right grip. */
function BlasterModel() {
  const muzzle = useMuzzle()
  const coil = useRef<MeshStandardMaterial>(null)
  const tip = useRef<Mesh>(null)
  useFrame((state) => {
    const c = coil.current
    if (c) {
      c.emissive.copy(COOL).lerp(HOT, game.heat)
      c.emissiveIntensity = game.overheated ? 1 + Math.abs(Math.sin(state.clock.elapsedTime * 14)) * 3 : 2.2 + game.heat * 2
    }
    if (tip.current) tip.current.scale.setScalar(game.ult >= 1 ? 1.4 + Math.sin(state.clock.elapsedTime * 8) * 0.25 : 1)
  })
  return (
    <group rotation={[-0.35, 0, 0]}>
      <mesh position={[0, 0.0, 0.0]}>
        <boxGeometry args={[0.032, 0.045, 0.1]} />
        <meshStandardMaterial color="#1a2030" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.012, -0.09]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.011, 0.014, 0.1, 10]} />
        <meshStandardMaterial color="#2b3348" metalness={0.7} roughness={0.35} />
      </mesh>
      {[-0.06, -0.08, -0.1].map((z) => (
        <mesh key={z} position={[0, 0.012, z]}>
          <torusGeometry args={[0.015, 0.0035, 6, 14]} />
          <meshStandardMaterial ref={z === -0.08 ? coil : undefined} color="#111" emissive={COOL} emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
      ))}
      <mesh ref={tip} position={[0, 0.012, -0.142]}>
        <sphereGeometry args={[0.008, 10, 8]} />
        <meshStandardMaterial color="#fff" emissive="#ff5af0" emissiveIntensity={3} toneMapped={false} />
      </mesh>
      <object3D ref={muzzle} position={[0, 0.012, -0.15]} />
    </group>
  )
}

function FingerMuzzle() {
  const muzzle = useMuzzle()
  return (
    <>
      <object3D ref={muzzle} />
      <mesh>
        <sphereGeometry args={[0.006, 10, 8]} />
        <meshBasicMaterial color="#c9ff5a" toneMapped={false} />
      </mesh>
    </>
  )
}

const rightRay = { rayModel: false as const, cursorModel: { color: '#7fe8ff', opacity: 0.9 } }

export function RiftController() {
  const state = useXRInputSourceStateContext('controller')
  const right = state.inputSource.handedness !== 'left'
  return (
    <>
      <DefaultXRController model={false} grabPointer={false} teleportPointer={false} rayPointer={right ? rightRay : false} />
      <XRSpace space="grip-space">
        {right ? (
          <BlasterModel />
        ) : (
          <>
            <mesh>
              <icosahedronGeometry args={[0.018, 1]} />
              <meshStandardMaterial color="#141826" emissive="#b46bff" emissiveIntensity={1.6} flatShading toneMapped={false} />
            </mesh>
            <WristMenu lift={0.1} />
          </>
        )}
      </XRSpace>
      {right && <HitTester source={state.inputSource} />}
    </>
  )
}

export function RiftHand() {
  const state = useXRInputSourceStateContext('hand')
  const right = state.inputSource.handedness !== 'left'
  if (right) {
    return (
      <>
        <DefaultXRHand model={false} grabPointer={false} teleportPointer={false} rayPointer={rightRay} touchPointer={{ cursorModel: { color: '#7fe8ff' } }} />
        <XRSpace space="index-finger-tip">
          <FingerMuzzle />
        </XRSpace>
        <HitTester source={state.inputSource} />
      </>
    )
  }
  return (
    <>
      <DefaultXRHand model={false} grabPointer={false} teleportPointer={false} rayPointer={false} touchPointer={false} />
      <XRSpace space="wrist">
        <WristMenu lift={0.12} />
      </XRSpace>
    </>
  )
}
