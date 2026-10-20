import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { sfx } from '../game/audio'
import { game } from '../game/Game'
import { CanvasPanel } from './canvasPanel'

export interface PanelProps {
  width: number
  height: number
  /** canvas pixels per metre */
  resolution?: number
  position?: [number, number, number]
  rotation?: [number, number, number]
  signature: () => string
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, hover: boolean) => void
  onPress?: () => void
  visible?: () => boolean
  renderOrder?: number
  /** draw on top of everything (ignores real-world occluders) */
  overlay?: boolean
}

/** A world-space canvas panel. With onPress it becomes a button usable by mouse, rays and finger pokes. */
export function Panel({ width, height, resolution = 2400, position, rotation, signature, draw, onPress, visible, renderOrder = 20, overlay = false }: PanelProps) {
  const mesh = useRef<Mesh>(null)
  const hover = useRef(false)
  const pressedAt = useRef(0)
  const panel = useMemo(() => new CanvasPanel(Math.round(width * resolution), Math.round(height * resolution)), [width, height, resolution])
  useEffect(() => () => panel.dispose(), [panel])

  useEffect(() => {
    const m = mesh.current
    if (!m || !onPress) return
    game.uiObjects.add(m)
    return () => {
      game.uiObjects.delete(m)
    }
  }, [onPress])

  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const vis = visible ? visible() : true
    m.visible = vis
    if (!vis) return
    const pressed = performance.now() - pressedAt.current < 140
    panel.update(`${signature()}|${hover.current}|${pressed}`, (ctx, w, h) => draw(ctx, w, h, hover.current || pressed))
  })

  const handlers = onPress
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          if (mesh.current && !mesh.current.visible) return
          pressedAt.current = performance.now()
          sfx.play('click')
          onPress()
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          hover.current = true
        },
        onPointerOut: () => {
          hover.current = false
        },
      }
    : {}

  return (
    <mesh ref={mesh} position={position} rotation={rotation} renderOrder={overlay ? renderOrder + 20 : renderOrder} {...handlers}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={panel.texture} transparent toneMapped={false} depthWrite={false} depthTest={!overlay} />
    </mesh>
  )
}
