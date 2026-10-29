// Robotea: weapon catalogue and procedural models (Glock 17, Beretta 92, Colt 1911, Desert Eagle, .357 revolver, Uzi, MAC-10, finger gun)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const WEAPONS = [
  { id: 'glock', name: 'Glock 17', mag: 17, rate: 7, auto: false, recoil: 0.55, sound: 'glock', casing: true, reload: 1.1, kit: 'pistol', caliber: 0.0045, power: 1, spread: 0.002, flash: 0.14 },
  { id: 'beretta', name: 'Beretta 92', mag: 15, rate: 6, auto: false, recoil: 0.6, sound: 'beretta', casing: true, reload: 1.15, kit: 'pistol', caliber: 0.0045, power: 1, spread: 0.002, flash: 0.14 },
  { id: 'm1911', name: 'Colt 1911', mag: 7, rate: 5, auto: false, recoil: 0.85, sound: 'm1911', casing: true, reload: 1.2, kit: 'pistol', caliber: 0.0057, power: 1.3, spread: 0.0025, flash: 0.16 },
  { id: 'deagle', name: 'Desert Eagle', mag: 7, rate: 3, auto: false, recoil: 1.6, sound: 'deagle', casing: true, reload: 1.4, kit: 'pistol', caliber: 0.0064, power: 2.2, spread: 0.004, flash: 0.24 },
  { id: 'revolver', name: 'Revolver .357', mag: 6, rate: 3.5, auto: false, recoil: 1.15, sound: 'revolver', casing: false, reload: 1.9, kit: 'revolver', caliber: 0.0045, power: 1.6, spread: 0.002, flash: 0.2 },
  { id: 'uzi', name: 'Uzi', mag: 32, rate: 10, auto: true, recoil: 0.3, sound: 'uzi', casing: true, reload: 1.5, kit: 'smg', caliber: 0.0045, power: 0.8, spread: 0.01, flash: 0.12 },
  { id: 'mac10', name: 'MAC-10', mag: 30, rate: 18, auto: true, recoil: 0.32, sound: 'uzi', pitch: 1.15, casing: true, reload: 1.4, kit: 'smg', caliber: 0.0045, power: 0.8, spread: 0.016, flash: 0.12 },
  { id: 'finger', name: 'Finger gun', mag: Infinity, rate: 6, auto: false, recoil: 0.2, sound: 'pew', casing: false, reload: 0, finger: true, caliber: 0.004, power: 0.6, spread: 0, flash: 0.07 },
];
export const byId = Object.fromEntries(WEAPONS.map(w => [w.id, w]));

let M = null;
function mats() {
  if (M) return M;
  M = {
    poly: new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.62, metalness: 0.05 }),
    blued: new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.34, metalness: 0.85 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.3, metalness: 0.9 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd2d6db, roughness: 0.16, metalness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6a3a1f, roughness: 0.55, metalness: 0 }),
    hole: new THREE.MeshBasicMaterial({ color: 0x050505 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xf2f2e8 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a249, roughness: 0.3, metalness: 1 }),
  };
  return M;
}

function rb(parent, w, h, d, x, y, z, mat, r = 0.003, rz = 0) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)), mat);
  m.position.set(x, y, z);
  m.rotation.z = rz;
  m.castShadow = true;
  parent.add(m);
  return m;
}

function cx(parent, r0, r1, len, x, y, z, mat, seg = 24) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg);
  g.rotateZ(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function guard(g, x0, x1, y, mat) {
  rb(g, x1 - x0, 0.006, 0.012, (x0 + x1) / 2, y, 0, mat, 0.002);
  rb(g, 0.006, 0.03, 0.012, x1, y + 0.013, 0, mat, 0.002, -0.25);
  rb(g, 0.005, 0.018, 0.005, x0 + (x1 - x0) * 0.45, y + 0.016, 0, mat, 0.002, 0.25);
}

function semi(g, m, o) {
  const slide = new THREE.Group();
  g.add(slide);
  rb(slide, o.len, o.h, o.w, o.len / 2 - 0.035, o.y, 0, o.slideMat, 0.004);
  for (let i = 0; i < 6; i++) rb(slide, 0.002, o.h * 0.7, o.w + 0.0006, -0.03 + i * 0.005, o.y, 0, m.poly, 0.0008);
  rb(slide, 0.03, 0.002, 0.009, o.len * 0.35, o.y + o.h / 2, 0.005, m.hole, 0.0008);
  rb(slide, 0.004, 0.007, 0.0045, o.len - 0.04, o.y + o.h / 2 + 0.003, 0, m.poly, 0.001);
  rb(slide, 0.008, 0.007, 0.013, -0.028, o.y + o.h / 2 + 0.003, 0, m.poly, 0.001);
  const muzzle = cx(slide, 0.0058, 0.0058, 0.004, o.len - 0.034, o.y - 0.002, 0, m.hole, 16);
  muzzle.position.x += 0.001;
  rb(g, o.len * 0.85, 0.022, o.w + 0.003, o.len * 0.4 - 0.035, o.y - o.h / 2 - 0.008, 0, o.frameMat, 0.005);
  rb(g, 0.034, 0.105, o.w + 0.005, -0.012, o.y - o.h / 2 - 0.058, 0, o.gripMat, 0.008, 0.22);
  if (o.panels) for (const s of [-1, 1]) rb(g, 0.026, 0.075, 0.003, -0.012, o.y - o.h / 2 - 0.06, s * (o.w / 2 + 0.004), m.wood, 0.0012, 0.22);
  guard(g, 0.005, 0.058, o.y - o.h / 2 - 0.038, o.frameMat);
  if (o.hammer) rb(g, 0.012, 0.014, 0.008, -0.04, o.y + 0.006, 0, m.blued, 0.002, 0.4);
  return { slide, muzzle: V(o.len - 0.03, o.y - 0.002, 0), eject: V(o.len * 0.35, o.y + o.h / 2, 0.008) };
}

const BUILD = {
  glock: (g, m) => semi(g, m, { len: 0.186, h: 0.029, w: 0.0255, y: 0.038, slideMat: m.poly, frameMat: m.poly, gripMat: m.poly }),
  beretta: (g, m) => {
    const r = semi(g, m, { len: 0.2, h: 0.027, w: 0.026, y: 0.037, slideMat: m.blued, frameMat: m.blued, gripMat: m.poly });
    cx(r.slide, 0.0068, 0.0068, 0.06, 0.13, 0.044, 0, m.steel);
    return r;
  },
  m1911: (g, m) => semi(g, m, { len: 0.21, h: 0.029, w: 0.025, y: 0.039, slideMat: m.blued, frameMat: m.blued, gripMat: m.blued, panels: true, hammer: true }),
  deagle: (g, m) => {
    const r = semi(g, m, { len: 0.255, h: 0.036, w: 0.031, y: 0.043, slideMat: m.chrome, frameMat: m.chrome, gripMat: m.poly, hammer: true });
    const tri = new THREE.Shape();
    tri.moveTo(-0.014, 0); tri.lineTo(0.014, 0); tri.lineTo(0, 0.012); tri.closePath();
    const geo = new THREE.ExtrudeGeometry(tri, { depth: 0.15, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    const prism = new THREE.Mesh(geo, m.chrome);
    prism.position.set(0.065, 0.061, 0);
    prism.castShadow = true;
    r.slide.add(prism);
    return r;
  },
  revolver: (g, m) => {
    rb(g, 0.06, 0.04, 0.024, 0.0, 0.04, 0, m.chrome, 0.006);
    cx(g, 0.0088, 0.0088, 0.12, 0.09, 0.05, 0, m.chrome);
    rb(g, 0.12, 0.006, 0.01, 0.09, 0.061, 0, m.chrome, 0.002);
    rb(g, 0.1, 0.012, 0.014, 0.085, 0.038, 0, m.chrome, 0.004);
    cx(g, 0.0035, 0.0035, 0.004, 0.151, 0.05, 0, m.hole, 12);
    const cyl = new THREE.Group();
    cyl.position.set(0.025, 0.044, 0);
    const drum = cx(cyl, 0.019, 0.019, 0.042, 0, 0, 0, m.chrome, 36);
    drum.castShadow = true;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const f = rb(cyl, 0.032, 0.004, 0.006, 0, Math.cos(a) * 0.0185, Math.sin(a) * 0.0185, m.steel, 0.0015);
      f.rotation.x = -a;
    }
    g.add(cyl);
    const grip = rb(g, 0.034, 0.1, 0.03, -0.03, -0.022, 0, m.wood, 0.012, 0.42);
    grip.scale.set(1, 1, 1);
    guard(g, -0.008, 0.035, 0.008, m.chrome);
    const hammer = rb(g, 0.014, 0.018, 0.007, -0.034, 0.063, 0, m.steel, 0.002, 0.5);
    return { cylinder: cyl, hammer, muzzle: V(0.152, 0.05, 0), eject: null };
  },
  uzi: (g, m) => {
    rb(g, 0.25, 0.052, 0.05, 0.07, 0.034, 0, m.blued, 0.006);
    cx(g, 0.016, 0.016, 0.025, 0.205, 0.03, 0, m.steel);
    cx(g, 0.0085, 0.0085, 0.03, 0.226, 0.03, 0, m.steel);
    cx(g, 0.004, 0.004, 0.004, 0.243, 0.03, 0, m.hole, 12);
    const knob = rb(g, 0.012, 0.012, 0.01, 0.12, 0.064, 0, m.steel, 0.003);
    rb(g, 0.014, 0.022, 0.02, 0.185, 0.068, 0, m.blued, 0.003);
    rb(g, 0.04, 0.095, 0.036, 0.0, -0.036, 0, m.poly, 0.008, 0.02);
    rb(g, 0.028, 0.12, 0.022, 0.002, -0.13, 0, m.blued, 0.003, 0.02);
    guard(g, 0.02, 0.07, -0.004, m.blued);
    for (const s of [-1, 1]) rb(g, 0.16, 0.006, 0.006, -0.02, -0.004, s * 0.02, m.steel, 0.002);
    return { slide: knob, muzzle: V(0.245, 0.03, 0), eject: V(0.08, 0.06, 0.026) };
  },
  mac10: (g, m) => {
    rb(g, 0.21, 0.07, 0.048, 0.06, 0.03, 0, m.blued, 0.004);
    cx(g, 0.009, 0.009, 0.05, 0.19, 0.04, 0, m.steel);
    for (let i = 0; i < 5; i++) cx(g, 0.0098, 0.0098, 0.002, 0.172 + i * 0.008, 0.04, 0, m.steel);
    cx(g, 0.004, 0.004, 0.004, 0.216, 0.04, 0, m.hole, 12);
    rb(g, 0.04, 0.1, 0.036, 0.0, -0.045, 0, m.poly, 0.006, 0.05);
    rb(g, 0.028, 0.11, 0.022, 0.003, -0.14, 0, m.blued, 0.003, 0.05);
    guard(g, 0.02, 0.068, -0.012, m.blued);
    const knob = rb(g, 0.012, 0.01, 0.012, 0.08, 0.069, 0, m.steel, 0.003);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 8, 20, Math.PI), m.steel);
    loop.position.set(0.15, -0.005, 0);
    loop.rotation.z = Math.PI;
    g.add(loop);
    return { slide: knob, muzzle: V(0.218, 0.04, 0), eject: V(0.07, 0.066, 0.025) };
  },
};

function mergeByMaterial(group, keep) {
  const byMat = new Map();
  for (const c of [...group.children]) {
    if (!c.isMesh || keep.has(c)) continue;
    c.updateMatrix();
    const g = (c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone()).applyMatrix4(c.matrix);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!byMat.has(c.material)) byMat.set(c.material, []);
    byMat.get(c.material).push(g);
    group.remove(c);
    c.geometry.dispose();
  }
  for (const [m, geos] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    mesh.castShadow = true;
    group.add(mesh);
    for (const g of geos) g.dispose();
  }
}

const GUN_IN_HAND = new THREE.Matrix4().makeBasis(V(0, -1, 0), V(0, 0, 1), V(-1, 0, 0));

export function createGun(id) {
  const w = byId[id];
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  root.add(pivot);
  const gun = { def: w, root, pivot, kick: 0, kickV: 0, slideT: 0, cylA: 0, hold: false };
  if (w.finger) {
    gun.muzzleLocal = null;
    return gun;
  }
  const parts = BUILD[id](pivot, mats());
  mergeByMaterial(pivot, new Set([parts.slide].filter(o => o?.isMesh)));
  for (const g of [parts.slide, parts.cylinder]) if (g && !g.isMesh) mergeByMaterial(g, new Set());
  Object.assign(gun, parts);
  gun.muzzleLocal = parts.muzzle;
  gun.ejectLocal = parts.eject;
  root.quaternion.setFromRotationMatrix(GUN_IN_HAND);
  root.position.set(0, -0.058, 0.004);
  return gun;
}

export function animateGun(gun, dt) {
  gun.kickV += (-gun.kick * 260 - gun.kickV * 22) * dt;
  gun.kick += gun.kickV * dt;
  gun.pivot.rotation.z = gun.kick * 0.35;
  gun.pivot.position.x = -gun.kick * 0.03;
  if (gun.slide) {
    gun.slideT = Math.max(0, gun.slideT - dt / 0.075);
    gun.slide.position.x = gun.hold ? -0.026 : -Math.sin(gun.slideT * Math.PI) * 0.026 * (gun.def.auto ? 0.3 : 1);
  }
  if (gun.cylinder) {
    gun.cylinder.rotation.x += (gun.cylA - gun.cylinder.rotation.x) * Math.min(1, dt * 30);
  }
}

export function fireGun(gun) {
  gun.kickV += 6 + gun.def.recoil * 9;
  gun.slideT = 1;
  if (gun.cylinder) gun.cylA += Math.PI / 3;
}

export function createCasings(scene, max = 120) {
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0048, 0.0048, 0.019, 10), mats().brass, max);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  const list = [];
  const o = new THREE.Object3D();

  function spawn(at, dir, up, speed = 1) {
    if (list.length >= max) list.shift();
    const v = dir.clone().multiplyScalar((1.6 + Math.random() * 0.8) * speed).add(up.clone().multiplyScalar((1.4 + Math.random() * 0.6) * speed));
    list.push({ p: at.clone(), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6), v, spin: V(Math.random() * 30 - 15, Math.random() * 30 - 15, Math.random() * 30 - 15), t: 0, rest: false });
  }

  function update(dt, floorAt, onBounce) {
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      c.t += dt;
      if (c.t > 25) { list.splice(i, 1); continue; }
      if (c.rest) continue;
      c.v.y -= 9.8 * dt;
      c.p.addScaledVector(c.v, dt);
      c.r.x += c.spin.x * dt; c.r.y += c.spin.y * dt; c.r.z += c.spin.z * dt;
      const fy = floorAt(c.p) + 0.005;
      if (c.p.y < fy) {
        c.p.y = fy;
        if (Math.abs(c.v.y) > 0.8) onBounce?.(c, Math.min(1, Math.abs(c.v.y) / 4));
        if (Math.abs(c.v.y) < 0.6) { c.rest = true; c.r.set(Math.PI / 2, c.r.y, 0); }
        else { c.v.y = -c.v.y * 0.35; c.v.x *= 0.5; c.v.z *= 0.5; c.spin.multiplyScalar(0.6); }
      }
    }
    for (let i = 0; i < list.length; i++) {
      o.position.copy(list[i].p);
      o.rotation.copy(list[i].r);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { spawn, update, list };
}
