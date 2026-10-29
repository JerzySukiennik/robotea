// Robotea: GPU position-based fluid (WebGPU compute) with SDF colliders, kettle heater, tea bags, sugar, drain and CPU readback
export const SPACING = 0.006;
export const PARTICLE_ML = SPACING ** 3 * 1e6;
export const MAX_COLLIDERS = 160;
export const COL = { box: 0, capsule: 1, cylinder: 2, cup: 3, kettle: 4, plane: 5 };

const WG = 64;
const SLOTS = 32;
const NK = 48;
const HASH = 1 << 15;
const COL_FLOATS = 36;

const code = /* wgsl */`
const SLOTS: u32 = ${SLOTS}u;
const NK: u32 = ${NK}u;
const HASH: u32 = ${HASH}u;
const W0: f32 = 1.5666814;
const GK: f32 = 14.323944;

struct Params {
  dt: f32, h: f32, invH: f32, rho0: f32,
  eps: f32, scorrK: f32, scorrW: f32, visc: f32,
  count: u32, nCol: u32, pr: f32, vmax: f32,
  gravity: vec3<f32>, stride: u32,
  heater: mat4x4<f32>,
  heat: vec4<f32>,
  drain: vec4<f32>,
  diff: vec4<f32>,
  bags: array<vec4<f32>, 4>,
  bagRate: vec4<f32>,
};

struct Collider {
  r0: vec4<f32>, r1: vec4<f32>, r2: vec4<f32>,
  q0: vec4<f32>, q1: vec4<f32>, q2: vec4<f32>,
  prm: vec4<f32>, bound: vec4<f32>, info: vec4<f32>,
};

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> pos: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> vel: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> pred: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> attr: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> lam: array<f32>;
@group(0) @binding(6) var<storage, read_write> cellCount: array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> cellSlots: array<u32>;
@group(0) @binding(8) var<storage, read> cols: array<Collider>;
@group(0) @binding(9) var<storage, read_write> scratch: array<vec4<f32>>;
@group(0) @binding(10) var<storage, read_write> nbr: array<u32>;

fn Wk(r2: f32) -> f32 { let x = 1.0 - r2; return W0 * x * x * x; }
fn gradW(r: vec3<f32>, rl: f32) -> vec3<f32> { let x = 1.0 - rl; return -GK * x * x * r / max(rl, 1e-6); }

fn cellOf(p: vec3<f32>) -> vec3<i32> { return vec3<i32>(floor(p * P.invH)); }
fn hashCell(c: vec3<i32>) -> u32 {
  let h = (bitcast<u32>(c.x) * 73856093u) ^ (bitcast<u32>(c.y) * 19349663u) ^ (bitcast<u32>(c.z) * 83492791u);
  return h & (HASH - 1u);
}

fn sdBox(p: vec3<f32>, b: vec3<f32>) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec3<f32>(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}
fn sdCapsule(p: vec3<f32>, r: f32, hh: f32) -> f32 {
  var q = p;
  q.y -= clamp(q.y, -hh, hh);
  return length(q) - r;
}
fn sdCyl(p: vec3<f32>, r: f32, hh: f32) -> f32 {
  let d = vec2<f32>(length(p.xz) - r, abs(p.y) - hh);
  return min(max(d.x, d.y), 0.0) + length(max(d, vec2<f32>(0.0)));
}
fn sdCup(p: vec3<f32>, R: f32, H: f32, t: f32, tb: f32) -> f32 {
  let outer = sdCyl(p - vec3<f32>(0.0, H * 0.5, 0.0), R, H * 0.5);
  let ih = (H - tb + 0.3) * 0.5;
  let inner = sdCyl(p - vec3<f32>(0.0, tb + ih, 0.0), R - t, ih);
  return max(outer, -inner);
}
fn sdCone(p: vec3<f32>, a: vec3<f32>, b: vec3<f32>, ra: f32, rb: f32) -> f32 {
  let rba = rb - ra;
  let baba = dot(b - a, b - a);
  let papa = dot(p - a, p - a);
  let paba = dot(p - a, b - a) / baba;
  let x = sqrt(max(papa - paba * paba * baba, 0.0));
  let cax = max(0.0, x - select(rb, ra, paba < 0.5));
  let cay = abs(paba - 0.5) - 0.5;
  let k = rba * rba + baba;
  let f = clamp((rba * (x - ra) + paba * baba) / k, 0.0, 1.0);
  let cbx = x - ra - f * rba;
  let cby = paba - f;
  let s = select(1.0, -1.0, cbx < 0.0 && cay < 0.0);
  return s * sqrt(min(cax * cax + cay * cay * baba, cbx * cbx + cby * cby * baba));
}
fn sdKettle(p: vec3<f32>, lidOpen: f32) -> f32 {
  let R = 0.081; let H = 0.193; let t = 0.007; let tb = 0.014;
  let outer = sdCyl(p - vec3<f32>(0.0, H * 0.5, 0.0), R, H * 0.5);
  let ch = (H - tb - t) * 0.5;
  let cavity = sdCyl(p - vec3<f32>(0.0, tb + ch, 0.0), R - t, ch);
  var body = max(outer, -cavity);
  if (lidOpen > 0.5) { body = max(body, -sdCyl(p - vec3<f32>(0.0, H, 0.0), 0.05, 0.03)); }
  let a = vec3<f32>(-0.064, 0.13, 0.0);
  let u = vec3<f32>(-0.81342, 0.58168, 0.0);
  let b = a + u * 0.08;
  let innerS = sdCone(p, a - u * 0.035, b + u * 0.03, 0.0185, 0.0068);
  let outerS = sdCone(p, a, b, 0.0245, 0.0115);
  body = max(body, -innerS);
  let spout = max(max(outerS, -innerS), -cavity);
  return min(body, spout);
}
fn toLocal(c: Collider, p: vec3<f32>) -> vec3<f32> {
  let a = vec3<f32>(dot(c.q0.xyz, p) + c.q0.w, dot(c.q1.xyz, p) + c.q1.w, dot(c.q2.xyz, p) + c.q2.w);
  let b = vec3<f32>(dot(c.r0.xyz, p) + c.r0.w, dot(c.r1.xyz, p) + c.r1.w, dot(c.r2.xyz, p) + c.r2.w);
  return mix(a, b, P.bagRate.z);
}
fn toWorldDir(c: Collider, n: vec3<f32>) -> vec3<f32> { return n.x * c.r0.xyz + n.y * c.r1.xyz + n.z * c.r2.xyz; }
fn sdf(c: Collider, p: vec3<f32>) -> f32 {
  let k = u32(c.info.x + 0.5);
  switch k {
    case 0u: { return sdBox(p, c.prm.xyz); }
    case 1u: { return sdCapsule(p, c.prm.x, c.prm.y); }
    case 2u: { return sdCyl(p, c.prm.x, c.prm.y); }
    case 3u: { return sdCup(p, c.prm.x, c.prm.y, c.prm.z, c.prm.w); }
    case 4u: { return sdKettle(p, c.prm.x); }
    default: { return p.y; }
  }
}
fn gradSdf(c: Collider, p: vec3<f32>) -> vec3<f32> {
  let e = 0.0004;
  let a = vec3<f32>(1.0, -1.0, -1.0); let b = vec3<f32>(-1.0, -1.0, 1.0);
  let cc = vec3<f32>(-1.0, 1.0, -1.0); let d = vec3<f32>(1.0, 1.0, 1.0);
  let g = a * sdf(c, p + a * e) + b * sdf(c, p + b * e) + cc * sdf(c, p + cc * e) + d * sdf(c, p + d * e);
  let l = length(g);
  if (l < 1e-9) { return vec3<f32>(0.0, 1.0, 0.0); }
  return g / l;
}
fn collide(pIn: vec3<f32>, prev: vec3<f32>) -> vec3<f32> {
  var p = pIn;
  for (var i = 0u; i < P.nCol; i++) {
    let c = cols[i];
    let dc = p - c.bound.xyz;
    let rr = c.bound.w + P.pr;
    if (dot(dc, dc) > rr * rr) { continue; }
    let lp = toLocal(c, p);
    let d = sdf(c, lp) - P.pr;
    if (d < 0.0) {
      let n = normalize(toWorldDir(c, gradSdf(c, lp)));
      p -= n * d;
      let dp = p - prev;
      let tang = dp - n * dot(dp, n);
      p -= tang * c.info.y;
    }
  }
  return p;
}

@compute @workgroup_size(${WG}) fn predict(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  for (var k = i; k < HASH; k += P.stride) { atomicStore(&cellCount[k], 0u); }
  if (i >= P.count) { return; }
  let p0 = pos[i];
  if (p0.w < 0.5) { pred[i] = p0; return; }
  var v = vel[i].xyz + P.gravity * P.dt;
  let sp = length(v);
  if (sp > P.vmax) { v *= P.vmax / sp; }
  let half = p0.xyz + v * (P.dt * 0.5);
  let q1 = collide(half, p0.xyz);
  let q2 = collide(q1 + v * (P.dt * 0.5), q1);
  pred[i] = vec4<f32>(q2, p0.w);
}

@compute @workgroup_size(${WG}) fn insert(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  if (i >= P.count) { return; }
  let p = pred[i];
  if (p.w < 0.5) { return; }
  let h = hashCell(cellOf(p.xyz));
  let k = atomicAdd(&cellCount[h], 1u);
  if (k < SLOTS) { cellSlots[h * SLOTS + k] = i; }
}

@compute @workgroup_size(${WG}) fn buildNbr(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  if (i >= P.count) { return; }
  let pi4 = pred[i];
  let base = i * (NK + 1u);
  if (pi4.w < 0.5) { nbr[base] = 0u; return; }
  let pi = pi4.xyz;
  let c0 = cellOf(pi);
  var cnt = 0u;
  for (var dz = -1; dz <= 1; dz++) { for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) {
    let h = hashCell(c0 + vec3<i32>(dx, dy, dz));
    let n = min(atomicLoad(&cellCount[h]), SLOTS);
    for (var k = 0u; k < n; k++) {
      let j = cellSlots[h * SLOTS + k];
      if (j == i || cnt >= NK) { continue; }
      let r = (pi - pred[j].xyz) * P.invH;
      if (dot(r, r) < 1.1025) { nbr[base + 1u + cnt] = j; cnt++; }
    }
  }}}
  nbr[base] = cnt;
}

@compute @workgroup_size(${WG}) fn lambdaPass(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  if (i >= P.count) { return; }
  let pi4 = pred[i];
  if (pi4.w < 0.5) { return; }
  let pi = pi4.xyz;
  let base = i * (NK + 1u);
  let cnt = nbr[base];
  var rho = W0;
  var gi = vec3<f32>(0.0);
  var s2 = 0.0;
  for (var k = 0u; k < cnt; k++) {
    let j = nbr[base + 1u + k];
    let r = (pi - pred[j].xyz) * P.invH;
    let r2 = dot(r, r);
    if (r2 < 1.0) {
      rho += Wk(r2);
      let gw = gradW(r, sqrt(r2)) / P.rho0;
      gi += gw;
      s2 += dot(gw, gw);
    }
  }
  let C = max(rho / P.rho0 - 1.0, 0.0);
  lam[i] = -C / (s2 + dot(gi, gi) + P.eps);
}

@compute @workgroup_size(${WG}) fn deltaPass(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  if (i >= P.count) { return; }
  let pi4 = pred[i];
  if (pi4.w < 0.5) { scratch[i] = pi4; return; }
  let pi = pi4.xyz;
  let li = lam[i];
  let base = i * (NK + 1u);
  let cnt = nbr[base];
  var d = vec3<f32>(0.0);
  for (var k = 0u; k < cnt; k++) {
    let j = nbr[base + 1u + k];
    let r = (pi - pred[j].xyz) * P.invH;
    let r2 = dot(r, r);
    if (r2 < 1.0 && r2 > 1e-10) {
      let w = Wk(r2) / P.scorrW;
      let sc = -P.scorrK * w * w * w * w;
      d += (li + lam[j] + sc) * gradW(r, sqrt(r2));
    }
  }
  let q = collide(pi + d * (P.h / P.rho0), pos[i].xyz);
  scratch[i] = vec4<f32>(q, pi4.w);
}

@compute @workgroup_size(${WG}) fn xsphPass(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  if (i >= P.count) { return; }
  let pi4 = pred[i];
  if (pi4.w < 0.5) { return; }
  let pi = pi4.xyz;
  let vi = (pi - pos[i].xyz) / P.dt;
  let ai = attr[i];
  let base = i * (NK + 1u);
  let cnt = nbr[base];
  var dv = vec3<f32>(0.0);
  var da = vec3<f32>(0.0);
  var water = 0.0;
  var kind = ai.w;
  var best = ai.y;
  for (var k = 0u; k < cnt; k++) {
    let j = nbr[base + 1u + k];
    let pj4 = pred[j];
    let r = (pi - pj4.xyz) * P.invH;
    let r2 = dot(r, r);
    if (r2 < 1.0) {
      let w = Wk(r2);
      let aj = attr[j];
      dv += ((pj4.xyz - pos[j].xyz) / P.dt - vi) * w;
      da += (aj.xyz - ai.xyz) * w;
      if (pj4.w < 1.5) { water += 1.0; }
      if (aj.y > best && aj.w > 0.5) { best = aj.y; kind = aj.w; }
    }
  }
  var vn = vi;
  var an = ai.xyz;
  if (pi4.w < 1.5) {
    vn = vi + P.visc * dv;
    an = ai.xyz + da * P.diff.xyz * (P.dt / P.rho0);
  }
  let sp = length(vn);
  if (sp > P.vmax) { vn *= P.vmax / sp; }
  vel[i] = vec4<f32>(vn, water);
  scratch[i] = vec4<f32>(an, kind);
}

@compute @workgroup_size(${WG}) fn finalize(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  if (i >= P.count) { return; }
  var p = pred[i];
  if (p.w < 0.5) { pos[i] = p; return; }
  var a = scratch[i];
  if (p.w > 1.5 && vel[i].w >= 5.0) { p.w = 1.0; a.z = a.z + 1.0; }
  if (p.w < 1.5) {
    let lp = (P.heater * vec4<f32>(p.xyz, 1.0)).xyz;
    if (P.heat.x > 0.5 && length(lp.xz) < 0.074 && lp.y > 0.0 && lp.y < 0.19) {
      a.x = min(a.x + P.heat.y * P.dt, 100.0);
    }
    a.x -= (a.x - P.heat.w) * P.heat.z * P.dt;
    for (var b = 0u; b < 4u; b++) {
      let bg = P.bags[b];
      if (bg.w > 0.5 && distance(p.xyz, bg.xyz) < P.bagRate.y) {
        let f = clamp((a.x - 35.0) / 60.0, 0.0, 1.0);
        a.y = a.y + P.bagRate.x * f * P.dt;
        a.w = bg.w;
      }
    }
  }
  if ((length(p.xz - P.drain.xz) < P.drain.w && p.y < P.drain.y + 0.008) || p.y < P.diff.w) { p.w = 0.0; }
  pos[i] = p;
  attr[i] = a;
}
`;

function latticeConstants(ratio) {
  const W0 = 315 / (64 * Math.PI), GK = 45 / Math.PI;
  let rho = 0, g2 = 0;
  const n = Math.ceil(1 / ratio);
  for (let x = -n; x <= n; x++) for (let y = -n; y <= n; y++) for (let z = -n; z <= n; z++) {
    const r2 = (x * x + y * y + z * z) * ratio * ratio;
    if (r2 >= 1) continue;
    const t = 1 - r2;
    rho += W0 * t * t * t;
    if (r2 > 0) { const rl = Math.sqrt(r2); const gm = GK * (1 - rl) ** 2; g2 += gm * gm; }
  }
  return { rho0: rho, D0: g2 / (rho * rho) };
}

export async function createFluid({ maxParticles = 16384, substeps = 3, iterations = 2, kernelRatio = 1.8 } = {}) {
  if (!navigator.gpu) throw new Error('WebGPU not available');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter');
  const hasTs = adapter.features.has('timestamp-query');
  const device = await adapter.requestDevice({ requiredFeatures: hasTs ? ['timestamp-query'] : [], requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
  const N = maxParticles;
  const h = SPACING * kernelRatio;
  const { rho0, D0 } = latticeConstants(SPACING / h);
  const W = r2 => 315 / (64 * Math.PI) * (1 - r2) ** 3;

  const buf = (size, usage) => device.createBuffer({ size, usage });
  const S = GPUBufferUsage.STORAGE, CD = GPUBufferUsage.COPY_DST, CS = GPUBufferUsage.COPY_SRC;
  const posB = buf(N * 16, S | CD | CS), velB = buf(N * 16, S | CD), predB = buf(N * 16, S), attrB = buf(N * 16, S | CD | CS);
  const nbrB = buf(N * (NK + 1) * 4, S);
  const lamB = buf(N * 4, S), countB = buf(HASH * 4, S), slotB = buf(HASH * SLOTS * 4, S), colB = buf(MAX_COLLIDERS * COL_FLOATS * 4, S | CD), scrB = buf(N * 16, S);
  const paramB = buf(256 * 8, GPUBufferUsage.UNIFORM | CD);
  const stage = [0, 1].map(() => buf(N * 32, GPUBufferUsage.MAP_READ | CD));
  const stageBusy = [false, false];
  let stageIdx = 0;

  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const errs = info.messages.filter(m => m.type === 'error');
  if (errs.length) throw new Error('WGSL: ' + errs.map(e => `${e.lineNum}:${e.linePos} ${e.message}`).join('\n'));
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } },
      ...[1, 2, 3, 4, 5, 6, 7, 9, 10].map(b => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } })),
      { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ],
  });
  const pl = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const pipe = entryPoint => device.createComputePipeline({ label: entryPoint, layout: pl, compute: { module, entryPoint } });
  const P = Object.fromEntries(['predict', 'insert', 'buildNbr', 'lambdaPass', 'deltaPass', 'xsphPass', 'finalize'].map(n => [n, pipe(n)]));
  const group = (a, b) => device.createBindGroup({
    layout,
    entries: [paramB, posB, velB, a, attrB, lamB, countB, slotB, colB, b, nbrB].map((x, i) => ({ binding: i, resource: i ? { buffer: x } : { buffer: x, size: 256 } })),
  });
  const bindA = group(predB, scrB), bindB = group(scrB, predB);

  const qs = hasTs ? device.createQuerySet({ type: 'timestamp', count: 2 }) : null;
  const qRes = hasTs ? buf(16, GPUBufferUsage.QUERY_RESOLVE | CS) : null;
  const qRead = hasTs ? buf(16, GPUBufferUsage.MAP_READ | CD) : null;
  let qBusy = false;
  const profQs = hasTs ? device.createQuerySet({ type: 'timestamp', count: 256 }) : null;
  const profRes = hasTs ? buf(256 * 8, GPUBufferUsage.QUERY_RESOLVE | CS) : null;
  const profRead = hasTs ? buf(256 * 8, GPUBufferUsage.MAP_READ | CD) : null;
  let profBusy = false;

  if (iterations % 2) iterations++;
  let stride = 0;
  const params = new ArrayBuffer(256);
  const pf = new Float32Array(params), pu = new Uint32Array(params);
  const cols = new Float32Array(MAX_COLLIDERS * COL_FLOATS);
  const state = {
    device, maxParticles: N, h, rho0, substeps, iterations,
    alive: new Uint8Array(N), high: 0, free: [],
    cpuPos: new Float32Array(N * 4), cpuAttr: new Float32Array(N * 4), cpuCount: 0, version: 0,
    gpuMs: 0, nCol: 0,
    zones: {
      heaterMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -100, 0, 1]),
      heatOn: 0, heatRate: 4, cooling: 0.004, ambient: 21,
      drain: [0, -10, 0, 0.0], floorY: 0.02,
      bags: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], bagRate: 0.35, bagRadius: 0.035,
      diff: [6.0, 1.2, 0.8],
    },
    tune: { eps: 0.12 * D0, scorrK: 0.0022, visc: 0.012, vmax: 2.6 },
  };
  for (let i = N - 1; i >= 0; i--) state.free.push(i);

  state.emit = list => {
    const runs = [];
    for (const p of list) {
      if (!state.free.length) break;
      const i = state.free.pop();
      state.alive[i] = 1;
      state.high = Math.max(state.high, i + 1);
      runs.push([i, p]);
    }
    runs.sort((a, b) => a[0] - b[0]);
    let k = 0;
    while (k < runs.length) {
      let e = k;
      while (e + 1 < runs.length && runs[e + 1][0] === runs[e][0] + 1) e++;
      const n = e - k + 1, start = runs[k][0];
      const P4 = new Float32Array(n * 4), V4 = new Float32Array(n * 4), A4 = new Float32Array(n * 4);
      for (let m = 0; m < n; m++) {
        const p = runs[k + m][1];
        P4.set([p.x, p.y, p.z, p.sugar ? 2 : 1], m * 4);
        V4.set([p.vx || 0, p.vy || 0, p.vz || 0, 0], m * 4);
        A4.set([p.temp ?? state.zones.ambient, p.tea || 0, p.sweet || 0, p.kind || 0], m * 4);
      }
      device.queue.writeBuffer(posB, start * 16, P4);
      device.queue.writeBuffer(velB, start * 16, V4);
      device.queue.writeBuffer(attrB, start * 16, A4);
      k = e + 1;
    }
    return runs.length;
  };

  state.kill = idx => {
    const z = new Float32Array(4);
    for (const i of idx) {
      if (!state.alive[i]) continue;
      state.alive[i] = 0;
      state.free.push(i);
      device.queue.writeBuffer(posB, i * 16, z);
    }
  };

  state.setColliders = list => {
    const n = Math.min(list.length, MAX_COLLIDERS);
    for (let c = 0; c < n; c++) cols.set(list[c], c * COL_FLOATS);
    state.nCol = n;
    if (n) device.queue.writeBuffer(colB, 0, cols, 0, n * COL_FLOATS);
  };

  function writeParams(dt, slot, alpha) {
    const z = state.zones, t = state.tune;
    pf[0] = dt; pf[1] = h; pf[2] = 1 / h; pf[3] = rho0;
    pf[4] = t.eps; pf[5] = t.scorrK; pf[6] = W(0.04); pf[7] = t.visc;
    pu[8] = state.high; pu[9] = state.nCol; pf[10] = SPACING * 0.5; pf[11] = t.vmax;
    pf.set([0, -9.81, 0], 12);
    pu[15] = stride;
    pf.set(z.heaterMatrix, 16);
    pf.set([z.heatOn, z.heatRate, z.cooling, z.ambient], 32);
    pf.set(z.drain, 36);
    pf.set([...z.diff, z.floorY], 40);
    for (let b = 0; b < 4; b++) pf.set(z.bags[b], 44 + b * 4);
    pf.set([z.bagRate, z.bagRadius, alpha, 0], 60);
    device.queue.writeBuffer(paramB, slot * 256, params);
  }

  state.step = frameDt => {
    if (!state.high) return;
    const dt = Math.min(frameDt, 1 / 30) / substeps;
    const groups = Math.ceil(state.high / WG);
    const clearGroups = Math.max(groups, 128);
    stride = clearGroups * WG;
    for (let s = 0; s < substeps; s++) writeParams(dt, s, (s + 1) / substeps);
    const enc = device.createCommandEncoder();
    const prof = state.profile && hasTs && !profBusy;
    const names = [];
    let pass = prof ? null : enc.beginComputePass(qs && !qBusy ? { timestampWrites: { querySet: qs, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : undefined);
    let sub = 0;
    const run = (p, bg = bindA, n = groups) => {
      if (prof) {
        const k = names.length;
        names.push(p.label);
        pass = enc.beginComputePass({ timestampWrites: { querySet: profQs, beginningOfPassWriteIndex: 2 * k, endOfPassWriteIndex: 2 * k + 1 } });
      }
      pass.setBindGroup(0, bg, [sub * 256]); pass.setPipeline(p); pass.dispatchWorkgroups(n);
      if (prof) pass.end();
    };
    for (let s = 0; s < substeps; s++) {
      sub = s;
      run(P.predict, bindA, clearGroups);
      run(P.insert);
      run(P.buildNbr);
      for (let it = 0; it < iterations; it++) {
        const bg = it % 2 ? bindB : bindA;
        run(P.lambdaPass, bg);
        run(P.deltaPass, bg);
      }
      run(P.xsphPass);
      run(P.finalize);
    }
    if (!prof) pass.end();
    if (prof) { enc.resolveQuerySet(profQs, 0, names.length * 2, profRes, 0); enc.copyBufferToBuffer(profRes, 0, profRead, 0, names.length * 16); }
    const useTs = !prof && qs && !qBusy;
    if (useTs) { enc.resolveQuerySet(qs, 0, 2, qRes, 0); enc.copyBufferToBuffer(qRes, 0, qRead, 0, 16); }
    const si = stageIdx;
    const doRead = !stageBusy[si];
    const bytes = state.high * 16;
    if (doRead) {
      enc.copyBufferToBuffer(posB, 0, stage[si], 0, bytes);
      enc.copyBufferToBuffer(attrB, 0, stage[si], N * 16, bytes);
    }
    device.queue.submit([enc.finish()]);
    if (prof) {
      profBusy = true;
      profRead.mapAsync(GPUMapMode.READ).then(() => {
        const t = new BigUint64Array(profRead.getMappedRange());
        const out = {};
        let total = 0;
        names.forEach((n, k) => { const ms = Number(t[2 * k + 1] - t[2 * k]) / 1e6; out[n] = (out[n] || 0) + ms; total += ms; });
        for (const k in out) out[k] = +out[k].toFixed(3);
        out.total = +total.toFixed(3);
        state.profileResult = out;
        profRead.unmap();
        profBusy = false;
      });
    }
    if (useTs) {
      qBusy = true;
      qRead.mapAsync(GPUMapMode.READ).then(() => {
        const t = new BigUint64Array(qRead.getMappedRange());
        state.gpuMs = Number(t[1] - t[0]) / 1e6;
        qRead.unmap();
        qBusy = false;
      });
    }
    if (doRead) {
      stageBusy[si] = true;
      const count = state.high;
      stage[si].mapAsync(GPUMapMode.READ).then(() => {
        const r = stage[si].getMappedRange();
        state.cpuPos.set(new Float32Array(r, 0, count * 4));
        state.cpuAttr.set(new Float32Array(r, N * 16, count * 4));
        stage[si].unmap();
        stageBusy[si] = false;
        state.cpuCount = count;
        state.version++;
        for (let i = 0; i < count; i++) {
          if (state.alive[i] && state.cpuPos[i * 4 + 3] < 0.5) { state.alive[i] = 0; state.free.push(i); }
        }
        while (state.high > 0 && !state.alive[state.high - 1]) state.high--;
      });
      stageIdx = 1 - si;
    }
  };

  return state;
}

function rows(m) {
  const e = m.elements;
  const tx = e[12], ty = e[13], tz = e[14];
  return [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]].flatMap(r => [...r, -(r[0] * tx + r[1] * ty + r[2] * tz)]);
}

export function collider(type, matrixWorld, prm, { friction = 0.08, radius = 0.5, prev = null } = {}) {
  const e = matrixWorld.elements;
  return [
    ...rows(matrixWorld), ...rows(prev || matrixWorld),
    prm[0] || 0, prm[1] || 0, prm[2] || 0, prm[3] || 0,
    e[12], e[13], e[14], radius,
    COL[type], friction, 0, 0,
  ];
}
