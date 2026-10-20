import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Mesh, PlaneGeometry, ShaderMaterial, type Texture, type WebGLRenderer } from 'three'

/*
 * Replacement for three's built-in depth-sensing occluder.
 *
 * three writes the headset depth map 1:1 into the depth buffer (nearest texel, no bias).
 * The map is low resolution and noisy, so silhouettes become blocky staircases and
 * anything mounted on a wall (rifts, the shadows on it) flickers behind the wall itself.
 *
 * This version
 *  - interpolates the depth map bilinearly in linear (metric) space, so occlusion edges
 *    are smooth contours instead of texel blocks,
 *  - pushes the measured surface back by a small distance-dependent bias so virtual
 *    content touching real surfaces is never swallowed by sensor noise.
 */

const VERT = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`

const FRAG = /* glsl */ `
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;
uniform float uNear;
uniform float uFar;
uniform float uBias;
uniform float uBiasScale;

float toLinear(float d) {
  return uNear * uFar / (uFar - d * (uFar - uNear));
}
float toWindow(float z) {
  return (uFar * (z - uNear)) / (z * (uFar - uNear));
}
float fetchLinear(ivec2 p, ivec2 size, int layer) {
  p = clamp(p, ivec2(0), size - 1);
  float d = texelFetch(depthColor, ivec3(p, layer), 0).r;
  return toLinear(min(d, 0.99999));
}
void main() {
  vec2 coord = vec2(gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight);
  int layer = 0;
  if (coord.x >= 1.0) {
    coord.x -= 1.0;
    layer = 1;
  }
  ivec2 size = textureSize(depthColor, 0).xy;
  vec2 p = coord * vec2(size) - 0.5;
  ivec2 i0 = ivec2(floor(p));
  vec2 f = fract(p);
  float a = fetchLinear(i0, size, layer);
  float b = fetchLinear(i0 + ivec2(1, 0), size, layer);
  float c = fetchLinear(i0 + ivec2(0, 1), size, layer);
  float d = fetchLinear(i0 + ivec2(1, 1), size, layer);
  float z = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  z += uBias + z * uBiasScale;
  gl_FragDepth = clamp(toWindow(z), 0.0, 1.0);
}
`

type DepthXR = {
  getDepthTexture: () => Texture | null
  getDepthSensingMesh: () => Mesh | null
  getCamera: () => { cameras: Array<{ viewport: { z: number; w: number } }> }
  getSession: () => XRSession | null
}

export function DepthOcclusion() {
  const gl = useThree((s) => s.gl) as WebGLRenderer
  useEffect(() => {
    const xr = gl.xr as unknown as DepthXR
    const original = xr.getDepthSensingMesh
    const material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        depthColor: { value: null },
        depthWidth: { value: 1 },
        depthHeight: { value: 1 },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uBias: { value: 0.02 },
        uBiasScale: { value: 0.025 },
      },
      colorWrite: false,
      depthWrite: true,
      // must stay enabled: with the depth test off WebGL also skips depth writes
      depthTest: true,
    })
    const mesh = new Mesh(new PlaneGeometry(2, 2), material)
    mesh.frustumCulled = false
    mesh.renderOrder = -100
    xr.getDepthSensingMesh = () => {
      const tex = xr.getDepthTexture()
      if (!tex) return null
      const u = material.uniforms
      u.depthColor.value = tex
      const cams = xr.getCamera().cameras
      if (cams.length) {
        u.depthWidth.value = cams[0].viewport.z
        u.depthHeight.value = cams[0].viewport.w
      }
      const rs = xr.getSession()?.renderState
      if (rs) {
        u.uNear.value = rs.depthNear
        u.uFar.value = Number.isFinite(rs.depthFar) && rs.depthFar < 1e4 ? rs.depthFar : 1e4
      }
      return mesh
    }
    return () => {
      xr.getDepthSensingMesh = original
      mesh.geometry.dispose()
      material.dispose()
    }
  }, [gl])
  return null
}
