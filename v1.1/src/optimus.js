// Robotea: procedural Tesla Optimus (Gen 2 look) with close-up hands, rigid-skinned rig, white and graphite schemes
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loft, sphere, cylX, cylY, cylZ, rbox } from './geo.js';

export const BODY = [
  ['hips', null, [0, 0.98, 0]],
  ['spine', 'hips', [0, 0.08, 0]],
  ['chest', 'spine', [0, 0.14, 0]],
  ['neck', 'chest', [0, 0.27, 0]],
  ['head', 'neck', [0, 0.085, 0]],
  ['upperArmL', 'chest', [0.205, 0.23, 0]],
  ['forearmL', 'upperArmL', [0, -0.285, 0]],
  ['handL', 'forearmL', [0, -0.25, 0]],
  ['upperArmR', 'chest', [-0.205, 0.23, 0]],
  ['forearmR', 'upperArmR', [0, -0.285, 0]],
  ['handR', 'forearmR', [0, -0.25, 0]],
  ['thighL', 'hips', [0.095, -0.06, 0]],
  ['shinL', 'thighL', [0, -0.42, 0]],
  ['footL', 'shinL', [0, -0.415, 0]],
  ['toeL', 'footL', [0, -0.07, 0.13]],
  ['thighR', 'hips', [-0.095, -0.06, 0]],
  ['shinR', 'thighR', [0, -0.42, 0]],
  ['footR', 'shinR', [0, -0.415, 0]],
  ['toeR', 'footR', [0, -0.07, 0.13]],
];

export const BODY_NAMES = BODY.map(b => b[0]);

export const FINGERS = {
  t: { base: [-0.012, -0.022, 0.034], len: [0.038, 0.031, 0.026], r: 0.0094 },
  i: { base: [0, -0.087, 0.0255], len: [0.047, 0.031, 0.025], r: 0.0084 },
  m: { base: [0, -0.088, 0.0085], len: [0.051, 0.033, 0.026], r: 0.0086 },
  r: { base: [0, -0.087, -0.0085], len: [0.047, 0.031, 0.025], r: 0.0082 },
  p: { base: [0, -0.084, -0.025], len: [0.037, 0.025, 0.021], r: 0.0074 },
};

export const REST_HIPS_Y = 0.98;

function boneDefs() {
  const defs = BODY.map(([name, parent, pos]) => ({ name, parent, pos }));
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    for (const [f, d] of Object.entries(FINGERS)) {
      let parent = 'hand' + side;
      d.len.forEach((_, k) => {
        const name = `${side}_${f}${k}`;
        const pos = k === 0 ? [d.base[0] * s, d.base[1], d.base[2]] : [0, -d.len[k - 1], 0];
        defs.push({ name, parent, pos });
        parent = name;
      });
    }
  }
  return defs;
}

function buildBones(defs) {
  const bones = {}, list = [];
  for (const d of defs) {
    const b = new THREE.Bone();
    b.name = d.name;
    b.position.fromArray(d.pos);
    bones[d.name] = b;
    list.push(b);
    if (d.parent) bones[d.parent].add(b);
  }
  return { bones, list };
}

function parts() {
  const S = 28, ST = 4, C = 7, SW = 22, SH = 16;
  const L = (keys, o = {}) => loft(keys, { seg: S, steps: ST, capN: C, ...o });
  const B = (w, h, d, r, x, y, z) => rbox(w, h, d, r, x, y, z, 2);
  const out = [];
  const add = (bone, mat, geo) => out.push({ bone, mat, geo });

  add('hips', 'joint', L([
    { y: 0.05, rx: 0.125, rz: 0.088, n: 2.6 }, { y: -0.02, rx: 0.15, rz: 0.1, n: 2.6 },
    { y: -0.085, rx: 0.12, rz: 0.095, n: 2.4 }, { y: -0.14, rx: 0.05, rz: 0.07, n: 2.2 },
  ], { capStartH: 0.015, capEndH: 0.03 }));
  for (const s of [1, -1]) {
    add('hips', 'metal', cylX(0.05, 0.07, s * 0.135, -0.06, 0, SW));
    add('hips', 'joint', sphere(0.052, s * 0.095, -0.06, 0, SW, SH));
  }

  add('spine', 'joint', L([
    { y: -0.04, rx: 0.122, rz: 0.088, n: 2.4 }, { y: -0.01, rx: 0.116, rz: 0.084, n: 2.4 },
    { y: 0.02, rx: 0.122, rz: 0.088, n: 2.4 }, { y: 0.05, rx: 0.115, rz: 0.083, n: 2.4 },
    { y: 0.08, rx: 0.121, rz: 0.087, n: 2.4 }, { y: 0.11, rx: 0.117, rz: 0.085, n: 2.5 },
    { y: 0.16, rx: 0.13, rz: 0.092, n: 2.6 },
  ], { capStartH: 0.01, capEndH: 0.01 }));

  const chest = [
    { y: -0.035, rx: 0.148, rz: 0.104, cz: 0.006, n: 3 }, { y: 0.03, rx: 0.158, rz: 0.115, cz: 0.01, n: 3.2 },
    { y: 0.12, rx: 0.168, rz: 0.12, cz: 0.01, n: 3.4 }, { y: 0.2, rx: 0.163, rz: 0.114, n: 3.2 },
    { y: 0.235, rx: 0.148, rz: 0.1, n: 3 },
  ];
  add('chest', 'black', L(chest.map(k => ({ ...k, rx: k.rx - 0.004, rz: k.rz - 0.004 })), { capStartH: 0.02, capEndH: 0.025 }));
  add('chest', 'white', L(chest, { t0: Math.PI / 2 - 1.12, tl: 2.24, offset: 0.001, capStart: false, capEnd: false }));
  add('chest', 'white', L(chest.slice(1, 4), { t0: Math.PI * 1.5 - 0.95, tl: 1.9, offset: 0.001, capStart: false, capEnd: false }));
  add('chest', 'black', L([
    { y: 0.19, rx: 0.162, rz: 0.112, n: 2.6 }, { y: 0.24, rx: 0.13, rz: 0.092, n: 2.3 },
    { y: 0.285, rx: 0.052, rz: 0.048, n: 2 },
  ], { capStartH: 0.01, capEnd: false }));
  for (const s of [1, -1]) add('chest', 'joint', cylX(0.045, 0.08, s * 0.165, 0.23, 0, SW));

  add('neck', 'black', L([
    { y: -0.03, rx: 0.045, rz: 0.043 }, { y: 0.03, rx: 0.037, rz: 0.036 }, { y: 0.1, rx: 0.035, rz: 0.034 },
  ], { capStart: false, capEnd: false }));

  const head = [
    { y: -0.045, rx: 0.04, rz: 0.05, cz: 0.012, n: 2.15 }, { y: -0.015, rx: 0.062, rz: 0.078, cz: 0.016, n: 2.15 },
    { y: 0.03, rx: 0.075, rz: 0.094, cz: 0.01, n: 2.15 }, { y: 0.08, rx: 0.08, rz: 0.1, cz: 0, n: 2.15 },
    { y: 0.125, rx: 0.077, rz: 0.097, cz: -0.006, n: 2.15 },
  ];
  add('head', 'black', L(head, { capStartH: 0.018, capEndH: 0.05 }));
  add('head', 'visor', L([
    { y: -0.028, rx: 0.058, rz: 0.074, cz: 0.016, n: 2.15 }, { y: 0.03, rx: 0.075, rz: 0.094, cz: 0.01, n: 2.15 },
    { y: 0.08, rx: 0.08, rz: 0.1, cz: 0, n: 2.15 }, { y: 0.1, rx: 0.0795, rz: 0.099, cz: -0.002, n: 2.15 },
  ], { t0: Math.PI / 2 - 0.85, tl: 1.7, offset: 0.0009, capStart: false, capEnd: false }));

  const thigh = [
    { y: -0.01, rx: 0.076, rz: 0.086, cz: 0.012, n: 2.4 }, { y: -0.1, rx: 0.075, rz: 0.083, cz: 0.014, n: 2.4 },
    { y: -0.25, rx: 0.063, rz: 0.067, cz: 0.008, n: 2.4 }, { y: -0.35, rx: 0.052, rz: 0.056, cz: 0.004, n: 2.4 },
  ];
  const shin = [
    { y: -0.005, rx: 0.051, rz: 0.057, cz: 0.012, n: 2.3 }, { y: -0.09, rx: 0.051, rz: 0.055, cz: 0.004, n: 2.3 },
    { y: -0.22, rx: 0.042, rz: 0.044, cz: -0.004, n: 2.3 }, { y: -0.34, rx: 0.032, rz: 0.033, n: 2.3 },
  ];

  for (const [side, s] of [['L', 1], ['R', -1]]) {
    add('upperArm' + side, 'white', L([
      { y: 0.01, rx: 0.056, rz: 0.058, n: 2.3 }, { y: -0.08, rx: 0.053, rz: 0.055, n: 2.3 },
      { y: -0.17, rx: 0.047, rz: 0.049, n: 2.3 }, { y: -0.232, rx: 0.044, rz: 0.046, n: 2.3 },
    ], { capStartH: 0.045, capEndH: 0.012 }));
    add('upperArm' + side, 'joint', sphere(0.04, 0, -0.255, 0, SW, SH, 1, 0.8, 1));

    add('forearm' + side, 'joint', cylX(0.038, 0.082, 0, 0, 0, SW));
    add('forearm' + side, 'white', L([
      { y: -0.015, rx: 0.046, rz: 0.049, n: 2.3 }, { y: -0.09, rx: 0.044, rz: 0.046, n: 2.3 },
      { y: -0.175, rx: 0.036, rz: 0.038, n: 2.3 }, { y: -0.215, rx: 0.033, rz: 0.035, n: 2.3 },
    ], { capStartH: 0.03, capEndH: 0.01 }));
    add('forearm' + side, 'joint', sphere(1, s * 0.04, -0.075, 0, SW, SH, 0.01, 0.045, 0.026));
    add('forearm' + side, 'joint', cylY(0.029, 0.027, 0.03, 0, -0.232, 0, SW));

    const H = 'hand' + side;
    const dorsal = s > 0 ? 0 : Math.PI;
    const palm = [
      { y: 0.003, rx: 0.0122, rz: 0.023, n: 2.4 }, { y: -0.022, rx: 0.0142, rz: 0.031, n: 2.7 },
      { y: -0.055, rx: 0.014, rz: 0.0355, n: 2.9 }, { y: -0.08, rx: 0.0118, rz: 0.037, n: 2.8 },
    ];
    add(H, 'joint', L(palm, { capStartH: 0.008, capEndH: 0.007 }));
    add(H, 'white', L(palm, { t0: dorsal - 1.2, tl: 2.4, offset: 0.0012, capStart: false, capEnd: false }));
    add(H, 'black', L([
      { y: -0.028, rx: 0.0142, rz: 0.028, n: 2.8 }, { y: -0.055, rx: 0.014, rz: 0.032, n: 2.9 }, { y: -0.077, rx: 0.012, rz: 0.033, n: 2.8 },
    ], { t0: dorsal + Math.PI - 0.95, tl: 1.9, offset: 0.0011, capStart: false, capEnd: false }));
    add(H, 'metal', cylY(0.02, 0.02, 0.016, 0, 0.008, 0, SW));
    for (const [f, d] of Object.entries(FINGERS)) {
      d.len.forEach((len, k) => {
        const bn = `${side}_${f}${k}`;
        const r = d.r * (1 - 0.07 * k);
        const seg = [
          { y: -r * 0.55, rx: r * 0.92, rz: r * 1.04, n: 2.3 },
          { y: -len * 0.5, rx: r * 0.97, rz: r * 1.08, n: 2.4 },
          { y: -(len - r * 0.45), rx: r * 0.86, rz: r * 0.98, n: 2.3 },
        ];
        add(bn, 'white', L(seg, { capStartH: r * 0.35, capEndH: r * (k === 2 ? 0.95 : 0.35) }));
        add(bn, 'black', L(seg, { t0: dorsal + Math.PI - 0.9, tl: 1.8, offset: 0.0005, capStart: false, capEnd: false }));
        add(bn, 'joint', cylZ(r * 0.8, r * 1.9, 0, 0, 0, 16));
        if (k === 2) add(bn, 'black', sphere(r * 0.72, -s * r * 0.42, -len * 0.62, 0, 14, 10, 0.75, 1.25, 0.95));
      });
    }

    const back = Math.PI * (side === 'L' ? 1.25 : 1.75);
    add('thigh' + side, 'white', L(thigh, { capStartH: 0.05, capEndH: 0.022 }));
    add('thigh' + side, 'joint', L(thigh.slice(1, 4), { t0: back - Math.PI * 0.42, tl: Math.PI * 0.84, offset: 0.0028, capStart: false, capEnd: false }));
    add('shin' + side, 'joint', cylX(0.04, 0.085, 0, 0, 0, SW));
    add('shin' + side, 'white', L(shin, { capStartH: 0.045, capEndH: 0.018 }));
    add('foot' + side, 'joint', sphere(0.033, 0, 0, 0, SW, SH));
    add('foot' + side, 'joint', B(0.09, 0.06, 0.2, 0.026, 0, -0.055, 0.035));
    add('toe' + side, 'joint', B(0.088, 0.035, 0.068, 0.015, 0, 0.0025, 0.03));
  }
  return out;
}

let TEMPLATE = null;

function template() {
  if (TEMPLATE) return TEMPLATE;
  const defs = boneDefs();
  const { bones, list } = buildBones(defs);
  const root = new THREE.Group();
  root.add(bones.hips);
  root.updateMatrixWorld(true);
  const index = Object.fromEntries(list.map((b, i) => [b.name, i]));
  const inverses = list.map(b => b.matrixWorld.clone().invert());
  const groups = {};
  for (const p of parts()) {
    const g = p.geo;
    g.applyMatrix4(bones[p.bone].matrixWorld);
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const bi = index[p.bone];
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    (groups[p.mat] ||= []).push(g);
  }
  const solid = Object.fromEntries(Object.entries(groups).map(([k, gs]) => [k, mergeGeometries(gs)]));
  TEMPLATE = { defs, index, inverses, solid };
  return TEMPLATE;
}

export function makeMaterials(scheme = 'white') {
  const g = scheme === 'graphite';
  return {
    white: new THREE.MeshPhysicalMaterial({ color: g ? 0x3a3c41 : 0xf1f1ef, roughness: g ? 0.4 : 0.34, metalness: g ? 0.3 : 0, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    black: new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 }),
    joint: new THREE.MeshStandardMaterial({ color: g ? 0x141517 : 0x1d1e21, roughness: 0.62, metalness: 0.2 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x5c5f66, roughness: 0.3, metalness: 0.9 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x030304, roughness: 0.06, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 }),
  };
}

export function createRobot(mats) {
  const T = template();
  const { bones, list } = buildBones(T.defs);
  const root = new THREE.Group();
  root.add(bones.hips);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list, T.inverses);
  const robot = { root, bones, list, skeleton, meshes: [] };
  for (const [k, geo] of Object.entries(T.solid)) {
    const m = new THREE.SkinnedMesh(geo, mats[k]);
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    m.bind(skeleton);
    robot.meshes.push(m);
  }
  return robot;
}
