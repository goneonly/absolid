// 고해상도 성인 남성 바디 메시 생성기 (A-포즈, 키 약 178cm)
// 실행: node prototypes/human-3d/generate.mjs  →  body.bin + body.json 생성
//
// 방식: 근육·뼈 형태를 약 200개의 3D 도형(SDF: 타원체·둥근 원뿔)으로 정의하고 부드럽게 합친 뒤
//       2.4mm 격자에서 표면을 추출(Surface Nets) → 표면 위로 정밀 투영 → 노멀·뼈대 가중치·복근 수축 계산
// 좌표: 미터, y = 위(바닥 0), z = 앞, x = 모델의 왼쪽(+)
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const H = 0.0024 // 격자 간격 (m)
const t0 = Date.now()

// ───────────── 벡터 ─────────────
const V = (x, y, z) => [x, y, z]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a) => Math.hypot(a[0], a[1], a[2])
const nrm = (a) => mul(a, 1 / (len(a) || 1))
const lerp = (a, b, t) => add(a, mul(sub(b, a), t))
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

// ───────────── 도형 정의 ─────────────
// mode: 0 = 항상, 1 = 이완 상태만, 2 = 수축(복근 힘) 상태만
const prims = []
function frame(axis, front) {
  const v = nrm(axis)
  let f = front || [0, 0, 1]
  f = sub(f, mul(v, dot(f, v)))
  if (len(f) < 1e-6) f = [1, 0, 0]
  const w = nrm(f)
  const u = cross(v, w)
  return { u, v, w }
}
// 타원체: c 중심, r = [가로, 세로(axis 방향), 깊이(front 방향)]
function E(c, r, o = {}) {
  const p = { type: 0, c, r, k: o.k ?? 0.02, op: o.op || 'add', tag: o.tag, mode: o.mode || 0 }
  if (o.axis) Object.assign(p, frame(o.axis, o.front), { oriented: true })
  const m = Math.max(...r)
  p.min = sub(c, [m, m, m]); p.max = add(c, [m, m, m])
  prims.push(p); return p
}
// 둥근 원뿔: a(반지름 r1) → b(반지름 r2)
function C(a, b, r1, r2 = r1, o = {}) {
  const ba = sub(b, a), l2 = dot(ba, ba), rr = r1 - r2
  const p = { type: 1, a, b, r1, r2, ba, l2, rr, a2: l2 - rr * rr, il2: 1 / l2, k: o.k ?? 0.02, op: o.op || 'add', tag: o.tag, mode: o.mode || 0 }
  const m = Math.max(r1, r2)
  p.min = [Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.min(a[2], b[2]) - m]
  p.max = [Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, Math.max(a[2], b[2]) + m]
  prims.push(p); return p
}

function primDist(p, x, y, z) {
  if (p.type === 0) {
    let px = x - p.c[0], py = y - p.c[1], pz = z - p.c[2]
    if (p.oriented) {
      const lx = px * p.u[0] + py * p.u[1] + pz * p.u[2]
      const ly = px * p.v[0] + py * p.v[1] + pz * p.v[2]
      const lz = px * p.w[0] + py * p.w[1] + pz * p.w[2]
      px = lx; py = ly; pz = lz
    }
    const [rx, ry, rz] = p.r
    const k0 = Math.sqrt((px / rx) ** 2 + (py / ry) ** 2 + (pz / rz) ** 2)
    const k1 = Math.sqrt((px / (rx * rx)) ** 2 + (py / (ry * ry)) ** 2 + (pz / (rz * rz)) ** 2)
    if (k1 < 1e-12) return -Math.min(rx, ry, rz)
    return (k0 * (k0 - 1)) / k1
  }
  // Inigo Quilez 의 둥근 원뿔 거리 함수
  const pax = x - p.a[0], pay = y - p.a[1], paz = z - p.a[2]
  const [bx, by, bz] = p.ba
  const yy = pax * bx + pay * by + paz * bz
  const zz = yy - p.l2
  const qx = pax * p.l2 - bx * yy, qy = pay * p.l2 - by * yy, qz = paz * p.l2 - bz * yy
  const x2 = qx * qx + qy * qy + qz * qz
  const y2 = yy * yy * p.l2, z2 = zz * zz * p.l2
  const k = Math.sign(p.rr) * p.rr * p.rr * x2
  if (Math.sign(zz) * p.a2 * z2 > k) return Math.sqrt(x2 + z2) * p.il2 - p.r2
  if (Math.sign(yy) * p.a2 * y2 < k) return Math.sqrt(x2 + y2) * p.il2 - p.r1
  return (Math.sqrt(x2 * p.a2 * p.il2) + yy * p.rr) * p.il2 - p.r1
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25 }

// 지금까지 정의된 도형 전체로 거리 계산 (형태를 잡는 동안 표면 위치를 찾을 때 사용)
function sdfAll(x, y, z, mode = 1) {
  let d = 1e9
  for (const p of prims) {
    if (p.mode && p.mode !== mode) continue
    const di = primDist(p, x, y, z)
    if (p.op === 'add') d = d === 1e9 ? di : smin(d, di, p.k)
    else if (d !== 1e9) d = -smin(-d, di, p.k)
  }
  return d === 1e9 ? 1 : d
}
// (x, y) 에서 앞쪽 피부의 z 위치
function frontZ(x, y) {
  let lo = -0.05, hi = 0.3
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (sdfAll(x, y, m) < 0) lo = m; else hi = m }
  return lo
}
// (y, z) 에서 옆쪽 피부의 x 위치 (s = 좌우)
function sideX(s, y, z) {
  let lo = 0, hi = 0.3
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (sdfAll(s * m, y, z) < 0) lo = m; else hi = m }
  return s * lo
}

// ═════════════════════════ 해부학 형태 ═════════════════════════
const T = { tag: 'torso' }
// ── 몸통 덩어리 ──
E(V(0, 1.30, -0.008), [0.148, 0.175, 0.112], { ...T, k: 0.04 })   // 흉곽
E(V(0, 1.405, -0.014), [0.152, 0.058, 0.088], { ...T, k: 0.035 })  // 쇄골 라인
E(V(0, 1.125, 0.0), [0.127, 0.16, 0.097], { ...T, k: 0.05 })       // 복부
E(V(0, 1.0, -0.002), [0.13, 0.08, 0.094], { ...T, k: 0.045 })      // 아랫배
E(V(0, 0.945, -0.012), [0.142, 0.095, 0.098], { ...T, k: 0.05 })   // 골반
E(V(0, 1.27, -0.035), [0.158, 0.15, 0.085], { ...T, k: 0.04 })     // 등
for (const s of [-1, 1]) {
  E(V(s * 0.11, 1.255, -0.048), [0.05, 0.12, 0.052], { ...T, axis: V(s * 0.3, 1, 0), k: 0.04 }) // 광배근
  C(V(s * 0.032, 0.99, -0.083), V(s * 0.034, 1.32, -0.09), 0.03, 0.024, { ...T, k: 0.025 })      // 척추기립근
  E(V(s * 0.073, 0.905, -0.058), [0.081, 0.096, 0.076], { ...T, k: 0.035 })                       // 둔근
  C(V(s * 0.035, 1.498, -0.056), V(s * 0.158, 1.428, -0.034), 0.03, 0.024, { ...T, k: 0.045 })    // 승모근
}
C(V(0, 0.98, -0.108), V(0, 1.39, -0.112), 0.006, 0.006, { ...T, op: 'sub', k: 0.014 })  // 척추 홈
E(V(0, 0.872, 0.055), [0.046, 0.056, 0.04], { ...T, k: 0.032 })                          // 사타구니 (마네킹형)

// ── 가슴 ──
for (const s of [-1, 1]) {
  const z = frontZ(s * 0.085, 1.31)
  E(V(s * 0.086, 1.315, z - 0.023), [0.094, 0.064, 0.034], { ...T, axis: V(s * -0.22, 1, 0), k: 0.032 }) // 대흉근
  E(V(s * 0.07, 1.372, frontZ(s * 0.07, 1.37) - 0.015), [0.082, 0.034, 0.03], { ...T, k: 0.03 })      // 흉근 윗부분
}
C(V(0, 1.265, frontZ(0, 1.27) + 0.0068), V(0, 1.39, frontZ(0, 1.39) + 0.005), 0.0065, 0.006, { ...T, op: 'sub', k: 0.022 }) // 흉골 홈
for (const s of [-1, 1]) E(V(s * 0.1, 1.288, frontZ(s * 0.1, 1.288) - 0.0015), [0.0085, 0.0085, 0.0022], { ...T, k: 0.006 }) // 유두

// ── 복부: 복직근(6팩 + 아랫배), 백선, 힘줄 홈, 배꼽, 복사근, 전거근, V라인 ──
E(V(0, 1.125, frontZ(0, 1.125) - 0.022), [0.074, 0.17, 0.028], { ...T, k: 0.035 }) // 복직근 바탕
const ABS_ROWS = [1.238, 1.172, 1.106] // 배꼽 위 3단 (위→아래)
for (const s of [-1, 1]) {
  const off = s > 0 ? 0.004 : 0 // 좌우 살짝 엇갈림 (실제 복근처럼)
  for (const y0 of ABS_ROWS) {
    const y = y0 + off, cx = s * 0.035
    const z = frontZ(cx, y)
    E(V(cx, y, z - 0.0118), [0.0345, 0.0345, 0.0145], { ...T, k: 0.022, mode: 1 })  // 이완
    E(V(cx, y, z - 0.0094), [0.035, 0.035, 0.0178], { ...T, k: 0.019, mode: 2 })    // 수축: 더 도드라짐
  }
  const z = frontZ(s * 0.032, 1.0)
  E(V(s * 0.032, 1.0, z - 0.0135), [0.029, 0.054, 0.016], { ...T, axis: V(s * 0.12, 1, 0), k: 0.02, mode: 1 }) // 배꼽 아래
  E(V(s * 0.032, 1.0, z - 0.0112), [0.03, 0.055, 0.019], { ...T, axis: V(s * 0.12, 1, 0), k: 0.02, mode: 2 })
}
// 백선 (가운데 세로 홈)
C(V(0, 0.995, frontZ(0, 0.995) + 0.0052), V(0, 1.255, frontZ(0, 1.255) + 0.0052), 0.0036, 0.0036, { ...T, op: 'sub', k: 0.014 })
// (블록 사이 가로 홈은 따로 파지 않음 — 둥근 블록 사이의 골로 자연스럽게 표현)
// 배꼽
{
  const z = frontZ(0, 1.068)
  E(V(0, 1.072, z - 0.004), [0.016, 0.016, 0.007], { ...T, k: 0.008 })
  E(V(0, 1.068, z + 0.003), [0.0085, 0.0105, 0.012], { ...T, op: 'sub', k: 0.005 })
}
for (const s of [-1, 1]) {
  // 외복사근 (옆구리)
  E(V(s * 0.102, 1.065, frontZ(s * 0.102, 1.065) - 0.056), [0.042, 0.094, 0.056], { ...T, axis: V(s * 0.35, 1, 0.12), k: 0.04, mode: 1 })
  E(V(s * 0.102, 1.065, frontZ(s * 0.102, 1.065) - 0.0535), [0.044, 0.096, 0.058], { ...T, axis: V(s * 0.35, 1, 0.12), k: 0.04, mode: 2 })
  // V라인 (장골 → 치골 방향 홈)
  const a = V(s * 0.132, 1.0, 0), b = V(s * 0.042, 0.885, 0)
  a[2] = frontZ(a[0], a[1]) + 0.0015; b[2] = frontZ(b[0], b[1]) + 0.0015
  C(a, b, 0.0055, 0.0045, { ...T, op: 'sub', k: 0.009 })
}

// ── 목·머리 ──
const HD = { tag: 'head' }
C(V(0, 1.425, -0.016), V(0, 1.57, -0.006), 0.063, 0.054, { ...HD, k: 0.035 }) // 목
for (const s of [-1, 1]) C(V(s * 0.05, 1.578, -0.016), V(s * 0.017, 1.446, 0.046), 0.0165, 0.0145, { ...HD, k: 0.016 }) // 흉쇄유돌근
E(V(0, 1.682, -0.013), [0.077, 0.097, 0.096], { ...HD, k: 0.02 })   // 두개골
E(V(0, 1.665, -0.042), [0.07, 0.08, 0.07], { ...HD, k: 0.02 })      // 뒤통수
E(V(0, 1.627, 0.03), [0.066, 0.075, 0.064], { ...HD, k: 0.025 })    // 얼굴
E(V(0, 1.587, 0.026), [0.061, 0.04, 0.06], { ...HD, k: 0.02 })      // 턱
for (const s of [-1, 1]) {
  E(V(s * 0.052, 1.588, -0.006), [0.019, 0.03, 0.026], { ...HD, k: 0.02 })  // 턱 각
  E(V(s * 0.051, 1.649, 0.058), [0.022, 0.014, 0.02], { ...HD, k: 0.015 })  // 광대
}
E(V(0, 1.563, 0.07), [0.024, 0.018, 0.018], { ...HD, k: 0.015 })    // 턱끝
E(V(0, 1.684, 0.077), [0.062, 0.014, 0.022], { ...HD, k: 0.015 })   // 눈썹뼈
C(V(0, 1.676, 0.087), V(0, 1.634, 0.107), 0.0095, 0.0125, { ...HD, k: 0.012 }) // 콧대·코끝
for (const s of [-1, 1]) E(V(s * 0.0125, 1.63, 0.097), [0.009, 0.0068, 0.0088], { ...HD, k: 0.008 }) // 콧방울
for (const s of [-1, 1]) E(V(s * 0.033, 1.665, 0.084), [0.0185, 0.0125, 0.015], { ...HD, op: 'sub', k: 0.008 }) // 눈구멍
for (const s of [-1, 1]) {
  E(V(s * 0.033, 1.6635, 0.0735), [0.0118, 0.0118, 0.0118], { ...HD, k: 0.002 }) // 눈알
  E(V(s * 0.033, 1.6695, 0.0785), [0.0145, 0.0058, 0.0085], { ...HD, k: 0.004 }) // 윗눈꺼풀
  E(V(s * 0.033, 1.6565, 0.0775), [0.0135, 0.004, 0.0075], { ...HD, k: 0.004 })  // 아랫눈꺼풀
}
E(V(0, 1.6035, 0.0875), [0.022, 0.0068, 0.0092], { ...HD, k: 0.006 })  // 윗입술
E(V(0, 1.5925, 0.0855), [0.0198, 0.0078, 0.0094], { ...HD, k: 0.006 }) // 아랫입술
C(V(-0.021, 1.598, 0.093), V(0.021, 1.598, 0.093), 0.0016, 0.0016, { ...HD, op: 'sub', k: 0.003 }) // 입술 선
for (const s of [-1, 1]) {
  E(V(s * 0.0795, 1.657, -0.009), [0.01, 0.028, 0.017], { ...HD, axis: V(0, 1, -0.22), front: V(s, 0, 0.3), k: 0.006 }) // 귀
  E(V(s * 0.0855, 1.657, -0.006), [0.004, 0.018, 0.0105], { ...HD, op: 'sub', k: 0.004 })                                 // 귓바퀴 안쪽
}

// ── 팔 (A-포즈) ──
const ARM = {}
for (const s of [-1, 1]) {
  const tag = s > 0 ? 'armL' : 'armR'
  const A = { tag }
  const J = V(s * 0.178, 1.405, -0.012)                      // 어깨 관절
  const d1 = nrm(V(s * 0.655, -0.755, 0.025))               // 위팔 방향
  const El = add(J, mul(d1, 0.295))                         // 팔꿈치
  const d2 = nrm(V(s * 0.69, -0.72, 0.05))                  // 아래팔 방향
  const W = add(El, mul(d2, 0.255))                         // 손목
  const d3 = nrm(V(s * 0.6, -0.795, 0.07))                  // 손 방향
  const fr = (d) => nrm(sub(V(0, 0, 1), mul(d, dot(V(0, 0, 1), d))))   // 팔 앞쪽(이두·손바닥)
  const f1 = fr(d1), f2 = fr(d2), f3 = fr(d3)
  let o1 = nrm(cross(d1, f1)); if (o1[0] * s < 0) o1 = mul(o1, -1)
  let o2 = nrm(cross(d2, f2)); if (o2[0] * s < 0) o2 = mul(o2, -1)
  let o3 = nrm(cross(d3, f3)); if (o3[0] * s < 0) o3 = mul(o3, -1)
  ARM[tag] = { J, El, W, d1, d2, d3, tip: add(W, mul(d3, 0.19)) }

  // 삼각근 (전면·측면·후면)
  E(add(add(J, mul(d1, 0.035)), mul(o1, 0.012)), [0.058, 0.085, 0.055], { ...A, axis: d1, front: f1, k: 0.03 })
  E(add(add(J, mul(d1, 0.05)), mul(f1, 0.025)), [0.03, 0.07, 0.028], { ...A, axis: d1, front: f1, k: 0.02 })
  E(add(add(J, mul(d1, 0.05)), mul(f1, -0.026)), [0.03, 0.068, 0.028], { ...A, axis: d1, front: f1, k: 0.02 })
  C(J, El, 0.044, 0.033, { ...A, k: 0.03 })                                                          // 위팔
  E(add(add(J, mul(d1, 0.165)), mul(f1, 0.021)), [0.026, 0.083, 0.028], { ...A, axis: d1, front: f1, k: 0.02 })  // 이두근
  E(add(add(J, mul(d1, 0.14)), mul(f1, -0.024)), [0.031, 0.096, 0.03], { ...A, axis: d1, front: f1, k: 0.02 })   // 삼두근
  E(El, [0.031, 0.03, 0.029], { ...A, k: 0.02 })                                                                    // 팔꿈치
  E(add(El, mul(f1, -0.022)), [0.014, 0.016, 0.012], { ...A, k: 0.012 })                                           // 팔꿈치 뼈
  C(El, W, 0.036, 0.021, { ...A, k: 0.025 })                                                                        // 아래팔
  E(add(add(El, mul(d2, 0.075)), mul(f2, 0.01)), [0.029, 0.072, 0.026], { ...A, axis: d2, front: f2, k: 0.02 })    // 굴근
  E(add(add(add(El, mul(d2, 0.06)), mul(o2, 0.018)), mul(f2, 0.006)), [0.021, 0.068, 0.021], { ...A, axis: d2, front: f2, k: 0.02 }) // 상완요골근
  E(W, [0.025, 0.017, 0.015], { ...A, axis: d2, front: f2, k: 0.012 })                                            // 손목

  // 손바닥 (앞쪽을 향함) + 엄지 두덩
  E(add(W, mul(d3, 0.048)), [0.042, 0.05, 0.0145], { ...A, axis: d3, front: f3, k: 0.012 })
  const thumbDir = nrm(add(add(mul(d3, 0.68), mul(o3, 0.55)), mul(f3, 0.42)))
  E(add(add(add(W, mul(d3, 0.04)), mul(o3, 0.017)), mul(f3, 0.009)), [0.017, 0.03, 0.013], { ...A, axis: thumbDir, front: f3, k: 0.012 })
  // 손가락 (검지·중지·약지·소지: 마디 3개씩, 손바닥 쪽으로 살짝 굽음)
  const FINGERS = [
    { off: 0.0235, spread: 0.025, segs: [0.04, 0.024, 0.02], r: 0.0086 },
    { off: 0.0075, spread: 0.0, segs: [0.044, 0.028, 0.022], r: 0.009 },
    { off: -0.0085, spread: -0.02, segs: [0.041, 0.026, 0.02], r: 0.0085 },
    { off: -0.0235, spread: -0.05, segs: [0.031, 0.019, 0.017], r: 0.0076 },
  ]
  for (const f of FINGERS) {
    let p0 = add(add(W, mul(d3, 0.094)), mul(o3, f.off))
    let dir = nrm(add(d3, mul(o3, f.spread)))
    let r = f.r
    for (const L of f.segs) {
      dir = nrm(add(mul(dir, Math.cos(0.2)), mul(f3, Math.sin(0.2))))
      const p1 = add(p0, mul(dir, L))
      C(p0, p1, r, r * 0.9, { ...A, k: 0.0035 })
      p0 = p1; r *= 0.9
    }
  }
  // 엄지
  {
    let p0 = add(add(add(W, mul(d3, 0.03)), mul(o3, 0.024)), mul(f3, 0.01))
    let dir = thumbDir, r = 0.0118
    for (const L of [0.04, 0.031, 0.026]) {
      dir = nrm(add(mul(dir, Math.cos(0.15)), mul(f3, Math.sin(0.15))))
      const p1 = add(p0, mul(dir, L))
      C(p0, p1, r, r * 0.9, { ...A, k: 0.005 })
      p0 = p1; r *= 0.9
    }
  }
}

// ── 다리 ──
const LEG = {}
for (const s of [-1, 1]) {
  const tag = s > 0 ? 'legL' : 'legR'
  const L = { tag }
  const Hp = V(s * 0.092, 0.915, 0.0), K = V(s * 0.104, 0.495, 0.012), An = V(s * 0.112, 0.083, -0.018)
  const dT = nrm(sub(K, Hp)), dS = nrm(sub(An, K))
  LEG[tag] = { Hp, K, An, toe: V(s * 0.12, 0.02, 0.17) }
  C(add(Hp, V(0, 0.02, 0)), K, 0.085, 0.052, { ...L, k: 0.045 })                                  // 허벅지
  E(V(s * 0.139, 0.685, 0.01), [0.047, 0.15, 0.06], { ...L, axis: dT, k: 0.03 })                    // 외측광근
  E(V(s * 0.104, 0.73, 0.053), [0.041, 0.16, 0.035], { ...L, axis: dT, k: 0.03 })                   // 대퇴직근
  E(V(s * 0.073, 0.578, 0.032), [0.039, 0.064, 0.044], { ...L, axis: dT, k: 0.025 })                // 내측광근 (물방울)
  E(V(s * 0.058, 0.79, -0.006), [0.044, 0.11, 0.064], { ...L, axis: dT, k: 0.035 })                 // 내전근
  E(V(s * 0.098, 0.7, -0.05), [0.057, 0.16, 0.05], { ...L, axis: dT, k: 0.03 })                     // 햄스트링
  E(K, [0.04, 0.043, 0.041], { ...L, k: 0.028 })                                                    // 무릎
  E(add(K, V(0, 0.008, 0.044)), [0.025, 0.03, 0.013], { ...L, k: 0.012 })                           // 슬개골
  C(K, An, 0.046, 0.025, { ...L, k: 0.03 })                                                         // 정강이
  E(V(s * 0.083, 0.385, -0.04), [0.041, 0.095, 0.041], { ...L, axis: dS, k: 0.025 })                // 비복근 안쪽
  E(V(s * 0.127, 0.4, -0.033), [0.034, 0.085, 0.035], { ...L, axis: dS, k: 0.025 })                 // 비복근 바깥
  E(V(s * 0.108, 0.29, -0.03), [0.044, 0.09, 0.034], { ...L, axis: dS, k: 0.03 })                   // 가자미근
  E(V(s * 0.118, 0.36, 0.021), [0.019, 0.1, 0.021], { ...L, axis: dS, k: 0.02 })                    // 전경골근
  C(V(s * 0.112, 0.2, -0.04), V(s * 0.113, 0.075, -0.053), 0.015, 0.012, { ...L, k: 0.015 })       // 아킬레스건
  E(add(An, V(s * 0.022, 0, 0)), [0.011, 0.014, 0.013], { ...L, k: 0.01 })                         // 바깥 복사뼈
  E(add(An, V(-s * 0.02, 0.008, 0.004)), [0.011, 0.014, 0.013], { ...L, k: 0.01 })                  // 안쪽 복사뼈
  // 발
  E(V(s * 0.114, 0.038, -0.045), [0.03, 0.038, 0.041], { ...L, k: 0.02 })                           // 뒤꿈치
  E(V(s * 0.122, 0.034, 0.045), [0.045, 0.03, 0.085], { ...L, k: 0.025 })                           // 발등·발바닥
  E(V(s * 0.118, 0.06, 0.025), [0.034, 0.03, 0.05], { ...L, k: 0.025 })                             // 발목 앞
  C(V(s * 0.1, 0.022, 0.125), V(s * 0.098, 0.02, 0.168), 0.0128, 0.0118, { ...L, k: 0.006 })        // 엄지발가락
  for (let i = 1; i <= 4; i++) {
    const x = s * (0.114 + 0.0118 * i), z0 = 0.128 - 0.006 * i
    C(V(x, 0.018, z0), V(x + s * 0.002, 0.014, z0 + 0.03 - 0.004 * i), 0.0088 - 0.0008 * i, 0.0078 - 0.0008 * i, { ...L, k: 0.005 })
  }
}
console.log(`도형 ${prims.length}개 정의 (${((Date.now() - t0) / 1000).toFixed(1)}s)`)

// ═════════════════════════ 빠른 거리 계산 (공간 격자로 주변 도형만) ═════════════════════════
const BMIN = [-0.78, -0.004, -0.19], BMAX = [0.78, 1.8, 0.22]
const G = 0.03
const gnx = Math.ceil((BMAX[0] - BMIN[0]) / G), gny = Math.ceil((BMAX[1] - BMIN[1]) / G), gnz = Math.ceil((BMAX[2] - BMIN[2]) / G)
const cellLists = Array.from({ length: gnx * gny * gnz }, () => [])
prims.forEach((p, idx) => {
  const pad = p.k + 0.012
  const i0 = Math.max(0, Math.floor((p.min[0] - pad - BMIN[0]) / G)), i1 = Math.min(gnx - 1, Math.floor((p.max[0] + pad - BMIN[0]) / G))
  const j0 = Math.max(0, Math.floor((p.min[1] - pad - BMIN[1]) / G)), j1 = Math.min(gny - 1, Math.floor((p.max[1] + pad - BMIN[1]) / G))
  const k0 = Math.max(0, Math.floor((p.min[2] - pad - BMIN[2]) / G)), k1 = Math.min(gnz - 1, Math.floor((p.max[2] + pad - BMIN[2]) / G))
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) cellLists[(i * gny + j) * gnz + k].push(idx)
})
const cellOf = (x, y, z) => {
  const i = Math.floor((x - BMIN[0]) / G), j = Math.floor((y - BMIN[1]) / G), k = Math.floor((z - BMIN[2]) / G)
  if (i < 0 || j < 0 || k < 0 || i >= gnx || j >= gny || k >= gnz) return null
  return cellLists[(i * gny + j) * gnz + k]
}
function sdf(x, y, z, mode = 1) {
  const list = cellOf(x, y, z)
  if (!list || !list.length) return 0.05
  let d = 1e9
  for (let n = 0; n < list.length; n++) {
    const p = prims[list[n]]
    if (p.mode && p.mode !== mode) continue
    const di = primDist(p, x, y, z)
    if (p.op === 'add') d = d === 1e9 ? di : smin(d, di, p.k)
    else if (d !== 1e9) d = -smin(-d, di, p.k)
  }
  if (d === 1e9) return 0.05
  return Math.max(d, -y) // 발바닥 평평하게
}

// ═════════════════════════ 표면 추출 (Surface Nets) ═════════════════════════
const nx = Math.ceil((BMAX[0] - BMIN[0]) / H) + 1, ny = Math.ceil((BMAX[1] - BMIN[1]) / H) + 1, nz = Math.ceil((BMAX[2] - BMIN[2]) / H) + 1
// 표면에서 먼 영역은 건너뛰기: 2cm 거친 격자에서 먼저 거리 확인
const CG = 0.02
const cnx = Math.ceil((BMAX[0] - BMIN[0]) / CG) + 1, cny = Math.ceil((BMAX[1] - BMIN[1]) / CG) + 1, cnz = Math.ceil((BMAX[2] - BMIN[2]) / CG) + 1
const coarse = new Float32Array(cnx * cny * cnz)
for (let i = 0; i < cnx; i++) for (let j = 0; j < cny; j++) for (let k = 0; k < cnz; k++)
  coarse[(i * cny + j) * cnz + k] = sdf(BMIN[0] + (i + 0.5) * CG, BMIN[1] + (j + 0.5) * CG, BMIN[2] + (k + 0.5) * CG)
const NEAR = 0.04
function field(x, y, z) {
  const ci = Math.min(cnx - 1, Math.floor((x - BMIN[0]) / CG)), cj = Math.min(cny - 1, Math.floor((y - BMIN[1]) / CG)), ck = Math.min(cnz - 1, Math.floor((z - BMIN[2]) / CG))
  const c = coarse[(ci * cny + cj) * cnz + ck]
  if (Math.abs(c) > NEAR) return c > 0 ? 0.05 : -0.05
  return sdf(x, y, z)
}

const positions = [] // 꼭짓점 (x,y,z)
const quads = []
let layerA = new Float32Array(nx * nz), layerB = new Float32Array(nx * nz)
let prevCells = new Int32Array(nx * nz).fill(-1), curCells = new Int32Array(nx * nz).fill(-1)
const fillLayer = (arr, j) => {
  const y = BMIN[1] + j * H
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) arr[i * nz + k] = field(BMIN[0] + i * H, y, BMIN[2] + k * H)
}
fillLayer(layerA, 0)
const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] // (x, y, z)
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
const vals = new Float64Array(8)
for (let j = 0; j < ny - 1; j++) {
  fillLayer(layerB, j + 1)
  curCells.fill(-1)
  for (let i = 0; i < nx - 1; i++) for (let k = 0; k < nz - 1; k++) {
    let mask = 0
    for (let c = 0; c < 8; c++) {
      const [cx, cy, cz] = CORNERS[c]
      const v = (cy ? layerB : layerA)[(i + cx) * nz + (k + cz)]
      vals[c] = v
      if (v < 0) mask |= 1 << c
    }
    if (mask === 0 || mask === 255) continue
    let sx = 0, sy = 0, sz = 0, n = 0
    for (const [a, b] of EDGES) {
      const va = vals[a], vb = vals[b]
      if ((va < 0) === (vb < 0)) continue
      const t = va / (va - vb)
      const A = CORNERS[a], B = CORNERS[b]
      sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t; n++
    }
    curCells[i * nz + k] = positions.length / 3
    positions.push(BMIN[0] + (i + sx / n) * H, BMIN[1] + (j + sy / n) * H, BMIN[2] + (k + sz / n) * H)
  }
  // 면 만들기: 각 칸의 (0,0,0) 꼭짓점에서 나가는 세 방향 모서리
  for (let i = 0; i < nx - 1; i++) for (let k = 0; k < nz - 1; k++) {
    const v0 = curCells[i * nz + k]
    if (v0 < 0) continue
    const c0 = layerA[i * nz + k]
    const in0 = c0 < 0
    // y 방향 모서리 → 같은 층의 (i-1,k), (i,k-1), (i-1,k-1)
    if (i > 0 && k > 0 && in0 !== (layerB[i * nz + k] < 0)) {
      const a = curCells[(i - 1) * nz + k], b = curCells[i * nz + k - 1], c = curCells[(i - 1) * nz + k - 1]
      if (a >= 0 && b >= 0 && c >= 0) quads.push(in0 ? [v0, b, c, a] : [v0, a, c, b])
    }
    if (j > 0) {
      // x 방향 모서리 → (i,k-1), 아래층 (i,k), (i,k-1)
      if (k > 0 && in0 !== (layerA[(i + 1) * nz + k] < 0)) {
        const a = curCells[i * nz + k - 1], b = prevCells[i * nz + k], c = prevCells[i * nz + k - 1]
        if (a >= 0 && b >= 0 && c >= 0) quads.push(in0 ? [v0, b, c, a] : [v0, a, c, b])
      }
      // z 방향 모서리 → (i-1,k), 아래층 (i,k), (i-1,k)
      if (i > 0 && in0 !== (layerA[i * nz + k + 1] < 0)) {
        const a = curCells[(i - 1) * nz + k], b = prevCells[i * nz + k], c = prevCells[(i - 1) * nz + k]
        if (a >= 0 && b >= 0 && c >= 0) quads.push(in0 ? [v0, a, c, b] : [v0, b, c, a])
      }
    }
  }
  ;[layerA, layerB] = [layerB, layerA]
  ;[prevCells, curCells] = [curCells, prevCells]
  if (j % 150 === 0) console.log(`  표면 추출 ${Math.round((j / ny) * 100)}% — 꼭짓점 ${positions.length / 3}`)
}
const VN = positions.length / 3
console.log(`표면 추출 완료: 꼭짓점 ${VN.toLocaleString()} / 사각면 ${quads.length.toLocaleString()} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)

// ═════════════════════════ 표면 위로 정밀 투영 + 노멀 ═════════════════════════
const pos = new Float32Array(positions)
const nor = new Float32Array(VN * 3)
const e = H * 0.35
function grad(x, y, z, mode = 1) {
  return [sdf(x + e, y, z, mode) - sdf(x - e, y, z, mode), sdf(x, y + e, z, mode) - sdf(x, y - e, z, mode), sdf(x, y, z + e, mode) - sdf(x, y, z - e, mode)]
}
for (let v = 0; v < VN; v++) {
  let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2]
  for (let it = 0; it < 3; it++) {
    const d = sdf(x, y, z)
    const g = grad(x, y, z), gl = len(g) / (2 * e)
    if (gl < 1e-6) break
    let step = d / gl
    step = Math.max(-H * 0.6, Math.min(H * 0.6, step)) // 다른 표면으로 튀지 않게
    const gn = nrm(g)
    x -= gn[0] * step; y -= gn[1] * step; z -= gn[2] * step
  }
  pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z
  const n = nrm(grad(x, y, z))
  nor[v * 3] = n[0]; nor[v * 3 + 1] = n[1]; nor[v * 3 + 2] = n[2]
}
console.log(`투영·노멀 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s)`)

// 삼각형 (사각형 → 짧은 대각선으로 2개)
const tri = new Uint32Array(quads.length * 6)
const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]
let ti = 0
for (const [a, b, c, d] of quads) {
  if (len(sub(P(a), P(c))) <= len(sub(P(b), P(d)))) tri.set([a, b, c, a, c, d], ti)
  else tri.set([a, b, d, b, c, d], ti)
  ti += 6
}
// 면 방향 확인: 삼각형마다 표면 노멀(바깥)과 비교해 뒤집힌 것만 바로잡음
let flipped = 0
for (let t = 0; t < tri.length; t += 3) {
  const a = tri[t], b = tri[t + 1], c = tri[t + 2]
  const fn = cross(sub(P(b), P(a)), sub(P(c), P(a)))
  const vn = [nor[a * 3] + nor[b * 3] + nor[c * 3], nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1], nor[a * 3 + 2] + nor[b * 3 + 2] + nor[c * 3 + 2]]
  if (dot(fn, vn) < 0) { tri[t + 1] = c; tri[t + 2] = b; flipped++ }
}
console.log(`면 방향 보정: ${flipped.toLocaleString()} / ${(tri.length / 3).toLocaleString()}`)

// ═════════════════════════ 복근 수축 (모프) ═════════════════════════
const flex = new Int16Array(VN) // 노멀 방향 이동량 (단위 0.01mm)
for (let v = 0; v < VN; v++) {
  const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2]
  const list = cellOf(x, y, z)
  if (!list || !list.some((i) => prims[i].mode)) continue
  const d = -sdf(x, y, z, 2)
  flex[v] = Math.round(Math.max(-0.004, Math.min(0.01, d)) * 1e5)
}

// ═════════════════════════ 뼈대 + 스킨 가중치 ═════════════════════════
const BONES = [
  ['pelvis', -1, V(0, 0.95, 0)], ['spine1', 0, V(0, 1.02, -0.02)], ['spine2', 1, V(0, 1.13, -0.02)],
  ['spine3', 2, V(0, 1.25, -0.02)], ['chest', 3, V(0, 1.36, -0.02)], ['neck', 4, V(0, 1.45, -0.015)], ['head', 5, V(0, 1.565, -0.005)],
]
const boneIndex = {}
const addBone = (name, parent, p) => { boneIndex[name] = BONES.length; BONES.push([name, parent, p]) }
BONES.forEach(([n], i) => (boneIndex[n] = i))
for (const side of ['L', 'R']) {
  const a = ARM['arm' + side], l = LEG['leg' + side]
  addBone('upperArm' + side, boneIndex.chest, a.J)
  addBone('forearm' + side, boneIndex['upperArm' + side], a.El)
  addBone('hand' + side, boneIndex['forearm' + side], a.W)
  addBone('thigh' + side, boneIndex.pelvis, l.Hp)
  addBone('shin' + side, boneIndex['thigh' + side], l.K)
  addBone('foot' + side, boneIndex['shin' + side], l.An)
}
const SPINE = [0, 1, 2, 3, 4, 5].map((i) => BONES[i][2][1])

const skinIdx = new Uint8Array(VN * 4), skinW = new Uint8Array(VN * 4)
function setW(v, pairs) {
  pairs.sort((a, b) => b[1] - a[1])
  const top = pairs.filter((p) => p[1] > 0).slice(0, 4)
  if (!top.length) top.push([0, 1])
  const sum = top.reduce((s, p) => s + p[1], 0)
  // 내림으로 나눈 뒤 남는 값은 가장 큰 가중치에 더함 → 합이 항상 정확히 255, 음수 없음
  const q = top.map(([, w]) => Math.floor((w / sum) * 255))
  q[0] += 255 - q.reduce((a, b) => a + b, 0)
  top.forEach(([b], n) => { skinIdx[v * 4 + n] = b; skinW[v * 4 + n] = q[n] })
}
function spineWeights(y) {
  if (y <= SPINE[0]) return [[0, 1]]
  for (let i = 0; i < SPINE.length - 1; i++) {
    if (y <= SPINE[i + 1]) { const t = smooth(SPINE[i], SPINE[i + 1], y); return [[i, 1 - t], [i + 1, t]] }
  }
  return [[5, 1]]
}
const along = (p, origin, dir) => dot(sub(p, origin), dir)
for (let v = 0; v < VN; v++) {
  const p = P(v)
  // 어느 부위 표면인지: 가장 가까운 도형의 부위
  const list = cellOf(p[0], p[1], p[2]) || []
  const best = {}
  for (const i of list) {
    const pr = prims[i]
    if (pr.op !== 'add' || (pr.mode && pr.mode !== 1)) continue
    const d = primDist(pr, p[0], p[1], p[2])
    if (best[pr.tag] === undefined || d < best[pr.tag]) best[pr.tag] = d
  }
  let tag = 'torso', bd = 1e9
  for (const [k, d] of Object.entries(best)) if (d < bd) { bd = d; tag = k }

  if (tag === 'torso') { setW(v, spineWeights(p[1])); continue }
  if (tag === 'head') { const t = smooth(1.5, 1.585, p[1]); setW(v, [[5, 1 - t], [6, t]]); continue }
  const side = tag.endsWith('L') ? 'L' : 'R'
  if (tag.startsWith('arm')) {
    const a = ARM['arm' + side], up = boneIndex['upperArm' + side], fo = boneIndex['forearm' + side], ha = boneIndex['hand' + side]
    const s1 = along(p, a.J, a.d1), s2 = along(p, a.El, a.d1), s3 = along(p, a.W, a.d2)
    const wUp = smooth(-0.045, 0.05, s1)        // 어깨: 가슴 ↔ 위팔
    const wFo = smooth(-0.03, 0.03, s2)          // 팔꿈치: 위팔 ↔ 아래팔
    const wHa = smooth(-0.015, 0.02, s3)         // 손목: 아래팔 ↔ 손
    const chestW = spineWeights(Math.min(p[1], 1.42)).map(([b, w]) => [b, w * (1 - wUp)])
    setW(v, [...chestW, [up, wUp * (1 - wFo)], [fo, wUp * wFo * (1 - wHa)], [ha, wUp * wFo * wHa]])
    continue
  }
  const l = LEG['leg' + side], th = boneIndex['thigh' + side], sh = boneIndex['shin' + side], ft = boneIndex['foot' + side]
  const dT = nrm(sub(l.K, l.Hp)), dS = nrm(sub(l.An, l.K))
  const wTh = smooth(-0.06, 0.06, along(p, l.Hp, dT)) // 골반 ↔ 허벅지
  const wSh = smooth(-0.035, 0.035, along(p, l.K, dT)) // 무릎
  const wFt = smooth(-0.025, 0.02, along(p, l.An, dS)) // 발목
  setW(v, [[0, 1 - wTh], [th, wTh * (1 - wSh)], [sh, wTh * wSh * (1 - wFt)], [ft, wTh * wSh * wFt]])
}
console.log(`가중치 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s)`)

// ═════════════════════════ 저장 ═════════════════════════
// body.bin: 위치(Uint16×3, 범위 양자화) · 노멀(Int16×3) · 뼈 번호(Uint8×4) · 가중치(Uint8×4) · 복근 수축(Int16) · 삼각형(Uint32×3)
const bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity]
for (let v = 0; v < VN; v++) for (let c = 0; c < 3; c++) { bmin[c] = Math.min(bmin[c], pos[v * 3 + c]); bmax[c] = Math.max(bmax[c], pos[v * 3 + c]) }
const qpos = new Uint16Array(VN * 3)
for (let v = 0; v < VN; v++) for (let c = 0; c < 3; c++) qpos[v * 3 + c] = Math.round(((pos[v * 3 + c] - bmin[c]) / (bmax[c] - bmin[c])) * 65535)
const qnor = new Int16Array(VN * 3)
for (let i = 0; i < VN * 3; i++) qnor[i] = Math.round(nor[i] * 32767)
const parts = [qpos, qnor, skinIdx, skinW, flex, tri]
const layout = {}
let offset = 0
const names = ['position', 'normal', 'skinIndex', 'skinWeight', 'flex', 'index']
const chunks = []
parts.forEach((arr, n) => {
  const pad = (4 - (offset % 4)) % 4
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad }
  layout[names[n]] = { offset, length: arr.length }
  chunks.push(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength))
  offset += arr.byteLength
})
writeFileSync(join(OUT, 'body.bin'), Buffer.concat(chunks))
writeFileSync(join(OUT, 'body.json'), JSON.stringify({
  vertices: VN, triangles: tri.length / 3, bboxMin: bmin, bboxMax: bmax, layout,
  bones: BONES.map(([name, parent, p]) => ({ name, parent, position: p.map((c) => +c.toFixed(5)) })),
}, null, 1))
console.log(`저장: body.bin ${(offset / 1048576).toFixed(1)}MB, 꼭짓점 ${VN.toLocaleString()}, 삼각형 ${(tri.length / 3).toLocaleString()} — 총 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
