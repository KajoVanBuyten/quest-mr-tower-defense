import {
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three'
import { GLOW } from './blending'

const _m = new Matrix4()
const _q = new Quaternion()
const _s = new Vector3()
const _d = new Vector3()
const _c = new Color()
const UP = new Vector3(0, 1, 0)

/**
 * Immediate-mode energy beams. Each segment is an instance of a thin open cylinder
 * oriented between two points. Lasers, lightning arcs, tracers and the orbital
 * strike column are all drawn with this one instanced mesh.
 */
export class Beams {
  readonly mesh: InstancedMesh
  private aCol: InstancedBufferAttribute
  private n = 0
  readonly material: ShaderMaterial

  constructor(capacity = 600) {
    const geo = new CylinderGeometry(1, 1, 1, 7, 1, true)
    geo.translate(0, 0.5, 0)
    this.aCol = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage)
    geo.setAttribute('iCol', this.aCol)
    this.material = new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec4 iCol;
        varying vec4 vCol;
        varying vec3 vN;
        varying vec3 vV;
        varying float vAlong;
        varying float vSeed;
        void main() {
          vCol = iCol;
          vAlong = position.y;
          vSeed = float(gl_InstanceID);
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * mat3(instanceMatrix) * vec3(position.x, 0.0, position.z));
          vV = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec4 vCol;
        varying vec3 vN;
        varying vec3 vV;
        varying float vAlong;
        varying float vSeed;
        void main() {
          float f = abs(dot(normalize(vN), normalize(vV)));
          float core = pow(f, 4.0);
          float flick = 0.82 + 0.18 * sin(uTime * 47.0 + vSeed * 1.7 + vAlong * 9.0);
          vec3 c = vCol.rgb * (0.25 + 1.4 * f) + vec3(1.0) * core * 0.9;
          gl_FragColor = vec4(c * vCol.a * flick, 0.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      ...GLOW,
      toneMapped: false,
    })
    this.mesh = new InstancedMesh(geo, this.material, capacity)
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 11
    this.mesh.count = 0
  }

  begin(time: number) {
    this.n = 0
    this.material.uniforms.uTime.value = time
  }

  add(a: Vector3, b: Vector3, radius: number, color: Color | string | number, alpha = 1) {
    if (this.n >= this.mesh.instanceMatrix.count) return
    _d.subVectors(b, a)
    const len = _d.length()
    if (len < 1e-5) return
    _d.divideScalar(len)
    _q.setFromUnitVectors(UP, _d)
    _s.set(radius, len, radius)
    _m.compose(a, _q, _s)
    this.mesh.setMatrixAt(this.n, _m)
    const c = color instanceof Color ? color : _c.set(color)
    const arr = this.aCol.array as Float32Array
    arr[this.n * 4] = c.r
    arr[this.n * 4 + 1] = c.g
    arr[this.n * 4 + 2] = c.b
    arr[this.n * 4 + 3] = alpha
    this.n++
  }

  /** Jagged lightning between two points. */
  lightning(a: Vector3, b: Vector3, color: Color | string | number, radius: number, segments = 7, jitter = 0.05, alpha = 1) {
    const prev = new Vector3().copy(a)
    const next = new Vector3()
    for (let i = 1; i <= segments; i++) {
      const t = i / segments
      next.lerpVectors(a, b, t)
      if (i < segments) {
        const j = jitter * Math.sin(t * Math.PI)
        next.x += (Math.random() * 2 - 1) * j
        next.y += (Math.random() * 2 - 1) * j
        next.z += (Math.random() * 2 - 1) * j
      }
      this.add(prev, next, radius, color, alpha)
      prev.copy(next)
    }
  }

  end() {
    this.mesh.count = this.n
    this.mesh.instanceMatrix.needsUpdate = true
    this.aCol.needsUpdate = true
  }
}
