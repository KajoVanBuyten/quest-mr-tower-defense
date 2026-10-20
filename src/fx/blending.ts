import { AddEquation, CustomBlending, OneFactor, OneMinusSrcAlphaFactor, SrcAlphaFactor, ZeroFactor, type Material } from 'three'

/*
 * Blend presets that keep the framebuffer alpha meaningful.
 *
 * In immersive-ar the Quest compositor blends the rendered frame over passthrough
 * using the framebuffer alpha as (premultiplied) coverage:  out = rgb + (1 - a) * camera.
 * three's built-in AdditiveBlending adds the source alpha to the destination alpha
 * (SRC_ALPHA, ONE / ONE, ONE), so every additive quad – even where it is black – ends up
 * with alpha = 1 and covers the real room with an opaque black shape.
 *
 * GLOW leaves the destination alpha untouched (src ZERO, dst ONE). Over passthrough the
 * pixel keeps alpha 0 and its colour is simply added to the camera image, which is
 * exactly what light should do. On the desktop (opaque background) it behaves like
 * regular additive blending.
 */

type BlendParams = Pick<Material, 'blending' | 'blendEquation' | 'blendSrc' | 'blendDst' | 'blendEquationAlpha' | 'blendSrcAlpha' | 'blendDstAlpha'>

/** Additive light for shaders that output colour already scaled by intensity. */
export const GLOW: BlendParams = {
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneFactor,
  blendEquationAlpha: AddEquation,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
}

/** Additive light for built-in materials whose colour is weighted by `opacity`. */
export const GLOW_OPACITY: BlendParams = {
  ...GLOW,
  blendSrc: SrcAlphaFactor,
}

/** Premultiplied "over": shader outputs rgb already multiplied by alpha, alpha = coverage. */
export const PREMULTIPLIED: BlendParams = {
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
  blendEquationAlpha: AddEquation,
  blendSrcAlpha: OneFactor,
  blendDstAlpha: OneMinusSrcAlphaFactor,
}

export function applyBlend<T extends Material>(m: T, params: BlendParams): T {
  Object.assign(m, params)
  m.transparent = true
  m.depthWrite = false
  m.needsUpdate = true
  return m
}
