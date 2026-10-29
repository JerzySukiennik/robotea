// Robotea: procedural tea kitchen (counter, sink, tap, kettle, cabinet, mugs, tea chest, sugar, bin, tray, bell, note, timer) built per style
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rbox, lathe, tube, sphere, cylY, cylZ } from './geo.js';
import { pbr, tiles, paint, outside, rain, label, orderNote, lcd, sugar, paper } from './textures.js';

export const K = {
  top: 0.92, thick: 0.036, front: 0.2, back: 0.8, x0: -0.98, x1: 0.98,
  wallZ: 0.8, wallT: 0.14, ceil: 2.6, side: 1.32,
  sink: { x0: 0.27, x1: 0.67, z0: 0.3, z1: 0.64, depth: 0.19, r: 0.04 },
  tap: { x: 0.47, z: 0.725 }, knob: { x: 0.29, z: 0.735 },
  win: { x0: 0.16, x1: 0.86, y0: 1.08, y1: 2.06 },
  upper: { x0: -0.98, x1: -0.2, y0: 1.44, y1: 2.06, z0: 0.47 },
  splashTop: 1.44,
  kettle: { x: 0.04, z: 0.6 },
  socket: { x: 0.22, y: 1.04 },
  tray: { x: -0.2, z: 0.4 },
  bell: { x: -0.44, z: 0.33 },
  timer: { x: -0.13, z: 0.76 },
  chest: { x: -0.5, z: 0.68 },
  sugar: { x: -0.34, z: 0.56 },
  bin: { x: -0.7, z: 0.42 },
  note: { x: 0.0, y: 1.27 },
};

let rectInit = false;

function meterUV(geo, w, h, d) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
  }
  return geo;
}

function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

function box(w, h, d, x, y, z, mat, cast = true) {
  const m = mesh(meterUV(new THREE.BoxGeometry(w, h, d), w, h, d), mat, cast);
  m.position.set(x, y, z);
  return m;
}

function wallPlane(x0, x1, y0, y1, z, mat) {
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
  const uv = g.attributes.uv, pos = g.attributes.position;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, cx - pos.getX(i), pos.getY(i) + cy);
  const m = mesh(g, mat, false);
  m.position.set(cx, cy, z);
  m.rotation.y = Math.PI;
  return m;
}

function roundRect(path, x0, y0, x1, y1, r) {
  path.moveTo(x0 + r, y0);
  path.lineTo(x1 - r, y0);
  path.quadraticCurveTo(x1, y0, x1, y0 + r);
  path.lineTo(x1, y1 - r);
  path.quadraticCurveTo(x1, y1, x1 - r, y1);
  path.lineTo(x0 + r, y1);
  path.quadraticCurveTo(x0, y1, x0, y1 - r);
  path.lineTo(x0, y0 + r);
  path.quadraticCurveTo(x0, y0, x0 + r, y0);
}

function surface(spec, fallbackRough = 0.8) {
  if (spec.pbr) {
    const t = pbr(spec.pbr, { size: spec.size ?? 1 });
    return new THREE.MeshPhysicalMaterial({
      ...t, color: spec.tint ?? 0xffffff, roughness: spec.rough ?? 1,
      clearcoat: spec.coat ?? 0, clearcoatRoughness: 0.18,
    });
  }
  if (spec.pattern) {
    const t = tiles(spec);
    for (const k of ['map', 'normalMap', 'roughnessMap']) t[k].repeat.set(1 / t.size[0], 1 / t.size[1]);
    return new THREE.MeshPhysicalMaterial({
      map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1,
      clearcoat: 0.35, clearcoatRoughness: 0.08,
    });
  }
  const t = paint(spec.color ?? spec, { roughness: spec.rough ?? fallbackRough });
  return new THREE.MeshStandardMaterial({ map: t.map, roughnessMap: t.roughnessMap, normalMap: t.normalMap, roughness: 1, normalScale: new THREE.Vector2(0.4, 0.4) });
}

function materials(st) {
  const ceramic = c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.06 });
  const metal = (c, r) => new THREE.MeshStandardMaterial({ color: c, metalness: 1, roughness: r });
  const kettle = st.kettle.metal ? metal(st.kettle.color, st.kettle.rough)
    : new THREE.MeshPhysicalMaterial({ color: st.kettle.color, roughness: st.kettle.rough, clearcoat: 0.35, clearcoatRoughness: 0.25 });
  const trimIsMetal = st.kettleTrim === st.metal.color;
  return {
    counter: surface(st.counter),
    splash: surface(st.splash),
    wall: surface({ color: st.wall, rough: 0.92 }),
    ceiling: new THREE.MeshStandardMaterial({ color: st.ceiling, roughness: 0.95 }),
    fronts: surface(st.fronts, 0.55),
    upper: surface(st.upper, 0.55),
    carcass: new THREE.MeshStandardMaterial({ color: 0xece9e3, roughness: 0.7 }),
    floor: surface(st.floor),
    metal: metal(st.metal.color, st.metal.rough),
    steel: metal(0xc6c9ce, 0.3),
    kettle,
    trim: trimIsMetal ? metal(st.kettleTrim, st.metal.rough) : new THREE.MeshStandardMaterial({ color: st.kettleTrim, roughness: 0.45 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.48 }),
    whitePlastic: new THREE.MeshStandardMaterial({ color: 0xf2f1ee, roughness: 0.42 }),
    mugs: st.mugs.map(ceramic),
    bowl: ceramic(st.mugs[1] ?? st.mug),
    wood: surface(st.wood),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.03, metalness: 0, envMapIntensity: 1.4, depthWrite: false }),
    cabinetGlass: new THREE.MeshPhysicalMaterial({ color: 0xdfe7e4, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, envMapIntensity: 1.2, depthWrite: false }),
    bag: new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(paper(21, '#efe6d3')), roughness: 0.95 }),
    string: new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.9 }),
    tea: new THREE.MeshPhysicalMaterial({ color: 0x6b2f0c, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02 }),
    cork: new THREE.MeshStandardMaterial({ color: 0xb48659, roughness: 0.95 }),
    bin: new THREE.MeshStandardMaterial({ color: st.bin.color, roughness: st.bin.rough, metalness: st.bin.metal }),
    soil: new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 1 }),
    liner: new THREE.MeshPhysicalMaterial({ color: 0x17181a, roughness: 0.38, clearcoat: 0.4, side: THREE.DoubleSide }),
    leaf: new THREE.MeshPhysicalMaterial({ color: 0x4f7a3a, roughness: 0.55, sheen: 0.4, side: THREE.DoubleSide }),
    pot: ceramic(st.window === 'night' ? 0xb8643c : 0xf2efe8),
  };
}

function counterTop(M) {
  const s = new THREE.Shape();
  s.moveTo(K.x0, -K.back); s.lineTo(K.x1, -K.back); s.lineTo(K.x1, -K.front); s.lineTo(K.x0, -K.front); s.closePath();
  const h = new THREE.Path();
  roundRect(h, K.sink.x0, -K.sink.z1, K.sink.x1, -K.sink.z0, K.sink.r);
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth: K.thick - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 12 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, K.top - K.thick + 0.002, 0);
  return mesh(g, M.counter);
}

function sinkBasin(M) {
  const g = new THREE.Group();
  const { x0, x1, z0, z1, depth } = K.sink;
  const y1 = K.top - K.thick, y0 = y1 - depth, t = 0.006;
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  g.add(box(w, t, d, cx, y0, cz, M.steel, false));
  g.add(box(t, depth, d, x0 + t / 2, y0 + depth / 2, cz, M.steel, false));
  g.add(box(t, depth, d, x1 - t / 2, y0 + depth / 2, cz, M.steel, false));
  g.add(box(w, depth, t, cx, y0 + depth / 2, z0 + t / 2, M.steel, false));
  g.add(box(w, depth, t, cx, y0 + depth / 2, z1 - t / 2, M.steel, false));
  const drain = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.004, 32), M.metal, false);
  drain.position.set(cx, y0 + 0.004, cz + 0.05);
  g.add(drain);
  const hole = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.005, 24), M.plastic, false);
  hole.position.set(cx, y0 + 0.005, cz + 0.05);
  g.add(hole);
  return g;
}

function tap(M) {
  const g = new THREE.Group();
  const y = K.top;
  g.position.set(K.tap.x, y, K.tap.z);
  const base = mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.016, 32), M.metal);
  base.position.y = 0.008;
  g.add(base);
  g.add(mesh(tube([[0, 0.01, 0], [0, 0.2, 0], [0, 0.285, -0.035], [0, 0.29, -0.11], [0, 0.262, -0.19], [0, 0.236, -0.205]], 0.0115, 80, 18), M.metal));
  const tip = mesh(new THREE.CylinderGeometry(0.0135, 0.0125, 0.024, 24), M.metal);
  tip.position.set(0, 0.226, -0.207);
  g.add(tip);
  const aer = mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.003, 20), M.plastic, false);
  aer.position.set(0, 0.2135, -0.207);
  g.add(aer);
  return g;
}

function knob(M) {
  const g = new THREE.Group();
  g.position.set(K.knob.x, K.top, K.knob.z);
  const stem = mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.05, 28), M.metal);
  stem.position.y = 0.025;
  g.add(stem);
  const head = new THREE.Group();
  head.position.y = 0.058;
  head.add(mesh(sphere(0.018, 0, 0, 0, 28, 18, 1, 0.75, 1), M.metal));
  for (let i = 0; i < 4; i++) {
    const arm = mesh(new THREE.CapsuleGeometry(0.0068, 0.04, 6, 14), M.metal);
    arm.rotation.z = Math.PI / 2;
    arm.position.x = 0.03;
    const p = new THREE.Group();
    p.rotation.y = i * Math.PI / 2 + Math.PI / 4;
    p.add(arm);
    head.add(p);
  }
  const cap = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 20), M.whitePlastic, false);
  cap.position.y = 0.013;
  head.add(cap);
  g.add(head);
  g.userData.head = head;
  return g;
}

function kettle(M, temp) {
  const base = new THREE.Group();
  base.position.set(K.kettle.x, K.top, K.kettle.z);
  base.add(mesh(lathe([[0, 0], [0.086, 0], [0.09, 0.004], [0.091, 0.016], [0.086, 0.024], [0.07, 0.027], [0, 0.027]], 64), M.plastic));
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: lcd(temp, { w: 256, h: 80, color: '#8fe9ff' }), emissiveIntensity: 1.6, roughness: 0.25 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.046, 0.0145), screenMat);
  screen.position.set(-0.008, 0.0135, -0.0915);
  screen.rotation.y = Math.PI;
  base.add(screen);
  const btn = mesh(cylZ(0.0058, 0.006, 0.026, 0.0135, -0.09, 20), M.whitePlastic, false);
  base.add(btn);
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 16), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff8a3a, emissiveIntensity: 0 }));
  led.position.set(0.026, 0.0135, -0.0932);
  led.rotation.y = Math.PI;
  base.add(led);
  base.userData = { screen, screenMat, led };

  const body = new THREE.Group();
  body.position.set(K.kettle.x, K.top + 0.027, K.kettle.z);
  body.add(mesh(lathe([[0, 0], [0.072, 0], [0.079, 0.006], [0.081, 0.024], [0.079, 0.1], [0.073, 0.16], [0.066, 0.186], [0.058, 0.193], [0.05, 0.194], [0.049, 0.186]], 72), M.kettle));
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.071, 0.074, 0.172, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.35, metalness: 0.8, side: THREE.BackSide }));
  inner.position.y = 0.1;
  body.add(inner);
  body.add(mesh(lathe([[0.0805, 0.0], [0.0822, 0.003], [0.0822, 0.016], [0.0805, 0.019]], 72), M.trim));
  const lid = new THREE.Group();
  lid.position.set(0.054, 0.194, 0);
  const lidShell = mesh(lathe([[0, 0.011], [0.03, 0.009], [0.052, 0.004], [0.058, 0], [0.05, 0], [0, 0.003]], 72), M.kettle);
  lidShell.position.x = -0.054;
  lid.add(lidShell);
  const lidKnob = mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.014, 28), M.trim);
  lidKnob.position.set(-0.054, 0.017, 0);
  lid.add(lidKnob);
  body.add(lid);
  const spout = mesh(new THREE.CylinderGeometry(0.011, 0.024, 0.075, 28, 1, true), M.kettle);
  spout.geometry.translate(0, 0.0375, 0);
  spout.rotation.z = 0.95;
  spout.position.set(-0.064, 0.13, 0);
  body.add(spout);
  const handleGeo = tube([[0.052, 0.188, 0], [0.105, 0.19, 0], [0.128, 0.16, 0], [0.126, 0.09, 0], [0.104, 0.05, 0], [0.074, 0.04, 0]], 0.012, 64, 16);
  handleGeo.scale(1, 1, 1.45);
  body.add(mesh(handleGeo, M.trim));
  body.add(mesh(rbox(0.016, 0.01, 0.014, 0.003, 0.098, 0.044, 0, 2), M.plastic, false));
  const win = mesh(rbox(0.014, 0.11, 0.004, 0.002, 0.0, 0.085, 0, 2), new THREE.MeshPhysicalMaterial({ color: 0x1a2a33, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 }), false);
  win.position.set(0.026, 0, -0.074);
  win.rotation.y = 0.33;
  body.add(win);
  body.userData = { lid };
  return { base, body };
}

function cable(M) {
  const kx = K.kettle.x, kz = K.kettle.z, y = K.top;
  const g = new THREE.Group();
  g.add(mesh(tube([[kx + 0.02, y + 0.008, kz + 0.085], [kx + 0.05, y + 0.004, kz + 0.14], [K.socket.x - 0.06, y + 0.004, K.wallZ - 0.025], [K.socket.x - 0.012, y + 0.05, K.wallZ - 0.016], [K.socket.x, K.socket.y - 0.012, K.wallZ - 0.02]], 0.0035, 64, 8), M.plastic));
  g.add(box(0.075, 0.075, 0.012, K.socket.x, K.socket.y, K.wallZ - 0.006, M.whitePlastic));
  const plug = mesh(rbox(0.04, 0.04, 0.026, 0.006, K.socket.x, K.socket.y, K.wallZ - 0.024, 2), M.plastic);
  g.add(plug);
  return g;
}

function mugGeometry() {
  const body = lathe([[0, 0.003], [0.032, 0], [0.039, 0.004], [0.0412, 0.016], [0.0418, 0.09], [0.0412, 0.096], [0.0388, 0.0972], [0.0372, 0.093], [0.0372, 0.016], [0.033, 0.0095], [0, 0.0085]], 64);
  const h = new THREE.TorusGeometry(0.025, 0.0068, 14, 32, Math.PI * 1.12);
  h.rotateZ(-Math.PI * 0.56);
  h.translate(0.044, 0.052, 0);
  h.scale(1, 1, 1.25);
  return [body, h];
}

export function mug(mat) {
  const g = new THREE.Group();
  for (const geo of mugGeometry()) g.add(mesh(geo, mat));
  return g;
}

function upperCabinet(M, st) {
  const g = new THREE.Group();
  const { x0, x1, y0, y1, z0 } = K.upper;
  const w = x1 - x0, h = y1 - y0, d = K.wallZ - z0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + K.wallZ) / 2;
  const t = 0.018;
  g.add(box(w, t, d, cx, y0 + t / 2, cz, M.upper));
  g.add(box(w, t, d, cx, y1 - t / 2, cz, M.upper));
  g.add(box(t, h, d, x0 + t / 2, cy, cz, M.upper));
  g.add(box(t, h, d, x1 - t / 2, cy, cz, M.upper));
  g.add(box(w, h, 0.008, cx, cy, K.wallZ - 0.004, M.carcass));
  g.add(box(w - 2 * t, 0.016, d - 0.02, cx, y0 + 0.33, cz + 0.01, M.carcass));
  const mid = (x0 + x1) / 2;
  const doors = [];
  for (const [a, b, hinge] of [[mid, x1, x1], [x0, mid, x0]]) {
    const dw = b - a - 0.004, dh = h - 0.004;
    const pivot = new THREE.Group();
    pivot.position.set(hinge, cy, z0 - 0.011);
    const panel = new THREE.Group();
    panel.position.x = hinge === x1 ? -dw / 2 - 0.002 : dw / 2 + 0.002;
    if (st.upper.door === 'glass') {
      const f = 0.055;
      panel.add(box(dw, f, 0.02, 0, dh / 2 - f / 2, 0, M.upper));
      panel.add(box(dw, f, 0.02, 0, -dh / 2 + f / 2, 0, M.upper));
      panel.add(box(f, dh - 2 * f, 0.02, dw / 2 - f / 2, 0, 0, M.upper));
      panel.add(box(f, dh - 2 * f, 0.02, -dw / 2 + f / 2, 0, 0, M.upper));
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(dw - 2 * f + 0.004, dh - 2 * f + 0.004), M.cabinetGlass);
      glass.rotation.y = Math.PI;
      panel.add(glass);
    } else {
      panel.add(box(dw, dh, 0.019, 0, 0, 0, M.upper));
      if (st.upper.door === 'shaker') {
        const f = 0.06, p = -0.0115;
        panel.add(box(dw, f, 0.006, 0, dh / 2 - f / 2, p, M.upper));
        panel.add(box(dw, f, 0.006, 0, -dh / 2 + f / 2, p, M.upper));
        panel.add(box(f, dh - 2 * f, 0.006, dw / 2 - f / 2, 0, p, M.upper));
        panel.add(box(f, dh - 2 * f, 0.006, -dw / 2 + f / 2, 0, p, M.upper));
      }
    }
    const hx = hinge === x1 ? -dw / 2 + 0.035 : dw / 2 - 0.035;
    const bar = mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.13, 16), M.metal);
    bar.position.set(hx, -dh / 2 + 0.11, -0.04);
    panel.add(bar);
    for (const dy of [-0.05, 0.05]) {
      const post = mesh(cylZ(0.004, 0.03, hx, -dh / 2 + 0.11 + dy, -0.025, 12), M.metal);
      panel.add(post);
    }
    pivot.add(panel);
    pivot.userData = { width: dw, hinge, sign: hinge === x1 ? -1 : 1 };
    g.add(pivot);
    doors.push(pivot);
  }
  const mugs = [];
  [-0.3, -0.42, -0.54].forEach((x, i) => {
    const m = mug(M.mugs[i % M.mugs.length]);
    m.position.set(x, y0 + t, 0.63);
    m.rotation.y = -2.2 + i * 0.4;
    g.add(m);
    mugs.push(m);
  });
  return { group: g, doors, mugs };
}

function baseCabinets(M) {
  const g = new THREE.Group();
  const y0 = 0.1, y1 = K.top - K.thick, z = K.front + 0.03;
  const w = K.x1 - K.x0;
  g.add(box(w, y1 - y0, 0.02, 0, (y0 + y1) / 2, z, M.fronts));
  g.add(box(w, y1 - y0, 0.5, 0, (y0 + y1) / 2, z + 0.27, M.carcass, false));
  g.add(box(w, y0, 0.02, 0, y0 / 2, z + 0.06, M.plastic, false));
  for (const x of [-0.6, -0.2, 0.2, 0.6]) g.add(box(0.003, y1 - y0, 0.022, x, (y0 + y1) / 2, z - 0.001, M.plastic, false));
  return g;
}

function backWall(M, st) {
  const g = new THREE.Group();
  const { x0, x1, y0, y1 } = K.win;
  const zc = K.wallZ + K.wallT / 2, S = K.side;
  g.add(box(S * 2, y0, K.wallT, 0, y0 / 2, zc, M.wall));
  g.add(box(S * 2, K.ceil - y1, K.wallT, 0, (K.ceil + y1) / 2, zc, M.wall));
  g.add(box(x0 + S, y1 - y0, K.wallT, (x0 - S) / 2, (y0 + y1) / 2, zc, M.wall));
  g.add(box(S - x1, y1 - y0, K.wallT, (x1 + S) / 2, (y0 + y1) / 2, zc, M.wall));
  g.add(wallPlane(K.x0, K.x1, K.top, y0, K.wallZ - 0.003, M.splash));
  g.add(wallPlane(K.x0, x0, y0, K.splashTop, K.wallZ - 0.003, M.splash));
  g.add(wallPlane(x1, K.x1, y0, K.splashTop, K.wallZ - 0.003, M.splash));
  const frame = M.whitePlastic;
  const fz = K.wallZ + 0.07, f = 0.045;
  g.add(box(x1 - x0, f, 0.06, (x0 + x1) / 2, y1 - f / 2, fz, frame));
  g.add(box(x1 - x0, f, 0.06, (x0 + x1) / 2, y0 + f / 2, fz, frame));
  g.add(box(f, y1 - y0, 0.06, x0 + f / 2, (y0 + y1) / 2, fz, frame));
  g.add(box(f, y1 - y0, 0.06, x1 - f / 2, (y0 + y1) / 2, fz, frame));
  g.add(box(0.03, y1 - y0, 0.05, (x0 + x1) / 2, (y0 + y1) / 2, fz, frame));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), M.glass);
  glass.position.set((x0 + x1) / 2, (y0 + y1) / 2, fz - 0.005);
  glass.rotation.y = Math.PI;
  g.add(glass);
  if (st.rain) {
    const rt = rain();
    rt.map.repeat.set(1.3, 1.3);
    rt.normalMap.repeat.set(1.3, 1.3);
    const drops = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), new THREE.MeshStandardMaterial({ map: rt.map, normalMap: rt.normalMap, transparent: true, roughness: 0.05, metalness: 0, depthWrite: false, envMapIntensity: 2 }));
    drops.position.set((x0 + x1) / 2, (y0 + y1) / 2, fz - 0.007);
    drops.rotation.y = Math.PI;
    g.add(drops);
  }
  const sill = box(x1 - x0 + 0.06, 0.022, 0.13, (x0 + x1) / 2, y0 - 0.011, K.wallZ + 0.045, M.counter);
  g.add(sill);
  const out = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.2), new THREE.MeshBasicMaterial({ map: outside(st.window), color: st.window === 'morning' ? 0xffffff : st.window === 'night' ? 0x9aa6bb : 0xe8eaec }));
  out.position.set(0.6, 1.6, K.wallZ + 1.4);
  out.rotation.y = Math.PI;
  g.add(out);
  g.add(box(S * 2, 0.02, 2.14, 0, K.ceil, -0.13, M.ceiling, false));
  g.add(box(0.1, K.ceil, 2.14, -S - 0.05, K.ceil / 2, -0.13, M.wall, false));
  g.add(box(0.1, K.ceil, 2.14, S + 0.05, K.ceil / 2, -0.13, M.wall, false));
  const floor = box(S * 2, 0.02, 2.14, 0, -0.01, -0.13, M.floor, false);
  g.add(floor);
  return g;
}

function teaChest(M) {
  const g = new THREE.Group();
  g.position.set(K.chest.x, K.top, K.chest.z);
  const w = 0.255, h = 0.07, d = 0.115, t = 0.008;
  g.add(box(w, t, d, 0, t / 2, 0, M.wood));
  g.add(box(t, h, d, -w / 2 + t / 2, h / 2, 0, M.wood));
  g.add(box(t, h, d, w / 2 - t / 2, h / 2, 0, M.wood));
  g.add(box(w, h, t, 0, h / 2, -d / 2 + t / 2, M.wood));
  g.add(box(w, h, t, 0, h / 2, d / 2 - t / 2, M.wood));
  const cw = (w - 2 * t) / 3;
  for (const k of [-1, 1]) g.add(box(0.005, h - 0.006, d - 2 * t, k * cw / 2, h / 2, 0, M.wood));
  const kinds = [['fruit', 'FRUIT', '#b4407a'], ['green', 'GREEN', '#4f8a3c'], ['black', 'BLACK', '#b8792a']];
  const bags = [];
  const bagGeo = rbox(0.058, 0.064, 0.0045, 0.0016, 0, 0, 0, 2);
  const tagGeo = new THREE.BoxGeometry(0.03, 0.034, 0.0012);
  kinds.forEach(([kind, name, color], i) => {
    const cx = (i - 1) * cw;
    const tagMat = new THREE.MeshStandardMaterial({ map: label([name], { w: 256, h: 290, bg: color, color: '#ffffff', font: '700 62px Helvetica' }), roughness: 0.85 });
    for (let j = 0; j < 5; j++) {
      const z = -0.034 + j * 0.017;
      const bag = mesh(bagGeo, M.bag);
      bag.position.set(K.chest.x + cx, K.top + 0.05 + (j % 2) * 0.003, K.chest.z + z);
      bag.rotation.set(-0.12 + j * 0.03, (j - 2) * 0.03, (j % 3 - 1) * 0.02);
      const tag = mesh(tagGeo, tagMat, false);
      tag.position.set(K.chest.x + cx + (j - 2) * 0.004, K.top + 0.034 + j * 0.002, K.chest.z - d / 2 - 0.0025 - j * 0.0016);
      tag.rotation.set(0, Math.PI, (i - 1) * 0.06 + (j - 2) * 0.03);
      bags.push({ mesh: bag, tag, kind, color });
    }
  });
  g.userData.bags = bags;
  return g;
}

function sugarBowl(M) {
  const g = new THREE.Group();
  g.position.set(K.sugar.x, K.top, K.sugar.z);
  g.add(mesh(lathe([[0, 0.001], [0.03, 0], [0.04, 0.006], [0.048, 0.024], [0.0515, 0.048], [0.0505, 0.056], [0.0478, 0.0565], [0.046, 0.05], [0.043, 0.026], [0.034, 0.012], [0, 0.01]], 64), M.bowl));
  const s = sugar();
  const sugarMat = new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughness: 0.75 });
  g.add(mesh(sphere(0.046, 0, 0.036, 0, 40, 16, 1, 0.22, 1), sugarMat, false));
  const spoon = new THREE.Group();
  spoon.add(mesh(sphere(0.016, 0, 0, 0, 24, 12, 1, 0.32, 1.4), M.steel));
  spoon.add(mesh(tube([[0, 0.003, 0.02], [0, 0.009, 0.05], [0, 0.012, 0.09], [0, 0.011, 0.115]], 0.0028, 32, 8), M.steel));
  const load = mesh(sphere(0.014, 0, 0.004, 0, 20, 10, 1, 0.45, 1.3), sugarMat, false);
  load.visible = false;
  spoon.add(load);
  spoon.position.set(K.sugar.x - 0.012, K.top + 0.047, K.sugar.z - 0.005);
  spoon.rotation.set(0.42, -2.3, 0);
  spoon.userData = { load };
  g.userData = { spoon, sugarMat };
  return g;
}

function bin(M) {
  const g = new THREE.Group();
  g.position.set(K.bin.x, K.top, K.bin.z);
  g.add(mesh(lathe([[0, 0.002], [0.07, 0], [0.074, 0.006], [0.086, 0.2], [0.088, 0.206], [0.084, 0.208], [0.08, 0.202], [0.068, 0.01], [0, 0.008]], 56), M.bin));
  g.add(mesh(lathe([[0.066, 0.03], [0.079, 0.2], [0.085, 0.212], [0.091, 0.214], [0.094, 0.208], [0.093, 0.186], [0.0905, 0.18]], 56), M.liner));
  g.add(mesh(new THREE.CircleGeometry(0.066, 40).rotateX(-Math.PI / 2).translate(0, 0.03, 0), M.liner, false));
  return g;
}

function tray(M, st) {
  const g = new THREE.Group();
  g.position.set(K.tray.x, K.top, K.tray.z);
  const w = 0.36, d = 0.25;
  g.add(mesh(rbox(w, 0.012, d, 0.004, 0, 0.006, 0, 2), M.wood));
  g.add(mesh(rbox(w, 0.026, 0.012, 0.004, 0, 0.013, d / 2 - 0.006, 2), M.wood));
  g.add(mesh(rbox(w, 0.026, 0.012, 0.004, 0, 0.013, -d / 2 + 0.006, 2), M.wood));
  g.add(mesh(rbox(0.012, 0.026, d, 0.004, w / 2 - 0.006, 0.013, 0, 2), M.wood));
  g.add(mesh(rbox(0.012, 0.026, d, 0.004, -w / 2 + 0.006, 0.013, 0, 2), M.wood));
  const coaster = mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.004, 48), M.cork, false);
  coaster.position.set(0.03, 0.014, 0.01);
  g.add(coaster);
  return g;
}

function bell(M) {
  const g = new THREE.Group();
  g.position.set(K.bell.x, K.top, K.bell.z);
  g.add(mesh(lathe([[0, 0], [0.041, 0], [0.043, 0.004], [0.042, 0.012], [0.037, 0.014], [0, 0.014]], 48), M.plastic));
  const dome = mesh(new THREE.SphereGeometry(0.036, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.metal);
  dome.scale.set(1, 0.78, 1);
  dome.position.y = 0.014;
  g.add(dome);
  g.add(mesh(cylY(0.0028, 0.0028, 0.016, 0, 0.049, 0, 12), M.metal));
  g.add(mesh(sphere(0.0065, 0, 0.058, 0, 16, 12, 1, 0.7, 1), M.metal));
  return g;
}

function timer(M) {
  const g = new THREE.Group();
  g.position.set(K.timer.x, K.top, K.timer.z);
  const body = mesh(rbox(0.074, 0.05, 0.036, 0.01, 0, 0.025, 0, 3), M.whitePlastic);
  body.rotation.x = -0.12;
  g.add(body);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.054, 0.024), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: lcd('00:00', { w: 256, h: 112, color: '#ffd27a' }), emissiveIntensity: 1.5, roughness: 0.3 }));
  screen.position.set(0, 0.027, -0.0184);
  screen.rotation.y = Math.PI;
  body.add(screen);
  g.userData.screen = screen;
  return g;
}

function note(lines) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.15), new THREE.MeshStandardMaterial({ map: orderNote(lines), roughness: 0.92 }));
  m.receiveShadow = true;
  m.rotation.set(0, Math.PI, 0.035);
  g.add(m);
  const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.017), new THREE.MeshStandardMaterial({ color: 0xf3ead2, transparent: true, opacity: 0.75, roughness: 0.6 }));
  tape.position.set(0.002, 0.072, -0.001);
  tape.rotation.set(0, Math.PI, -0.05);
  g.add(tape);
  g.position.set(K.note.x, K.note.y, K.wallZ - 0.004);
  return g;
}

function pendant(M, st) {
  const g = new THREE.Group();
  const y = 1.98;
  g.position.set(0.0, y, 0.5);
  g.add(mesh(cylY(0.0025, 0.0025, K.ceil - y, 0, (K.ceil - y) / 2, 0, 8), M.plastic, false));
  const shade = mesh(lathe([[0.012, 0.03], [0.05, 0.022], [0.11, -0.03], [0.135, -0.075], [0.133, -0.078], [0.108, -0.034], [0.048, 0.018], [0.01, 0.026]], 64), st.window === 'night' ? M.metal : M.whitePlastic, false);
  g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.032, 24, 16), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: st.light.color, emissiveIntensity: 6 }));
  bulb.position.y = -0.03;
  g.add(bulb);
  return g;
}

function plant(M) {
  const g = new THREE.Group();
  g.position.set(K.win.x1 - 0.12, K.win.y0, K.wallZ + 0.04);
  g.add(mesh(lathe([[0, 0], [0.045, 0], [0.055, 0.09], [0.058, 0.095], [0.05, 0.095], [0.047, 0.01], [0, 0.01]], 40), M.pot));
  const soil = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.004, 32), M.soil, false);
  soil.position.y = 0.085;
  g.add(soil);
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4, h = 0.09 + (i % 5) * 0.035;
    const leaf = mesh(sphere(0.03, 0, 0, 0, 14, 10, 0.55, 1.6, 0.12), M.leaf);
    leaf.position.set(Math.cos(a) * 0.025, h + 0.03, Math.sin(a) * 0.025);
    leaf.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.7);
    g.add(leaf);
  }
  return g;
}

export function buildKitchen(st, opts = {}) {
  const M = materials(st);
  const group = new THREE.Group();
  group.add(backWall(M, st));
  group.add(counterTop(M));
  group.add(sinkBasin(M));
  group.add(baseCabinets(M));
  const tapG = tap(M), knobG = knob(M);
  group.add(tapG, knobG);
  const kt = kettle(M, opts.temp ?? '18°C');
  group.add(kt.base, kt.body, cable(M));
  const upper = upperCabinet(M, st);
  group.add(upper.group);
  for (const m of upper.mugs) { upper.group.remove(m); group.add(m); }
  const chest = teaChest(M), bowl = sugarBowl(M), binG = bin(M), trayG = tray(M, st), bellG = bell(M), timerG = timer(M);
  group.add(chest, bowl, binG, trayG, bellG, timerG, bowl.userData.spoon);
  for (const b of chest.userData.bags) group.add(b.mesh, b.tag);
  const noteG = note(opts.order ?? ['Black tea', 'strong', '2 sugars', 'full mug']);
  group.add(noteG);
  if (st.plant) group.add(plant(M));

  const lights = [];
  if (st.light.kind === 'pendant' || st.light.kind === 'soft') {
    group.add(pendant(M, st));
    const spot = new THREE.SpotLight(st.light.color, st.light.intensity, 0, 0.85, 0.75, 2);
    spot.position.set(0.0, 1.95, 0.5);
    spot.target.position.set(0.02, K.top, 0.52);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.camera.near = 0.3;
    spot.shadow.camera.far = 3;
    spot.shadow.bias = -0.0002;
    spot.shadow.normalBias = 0.02;
    spot.shadow.radius = 3;
    lights.push(spot, spot.target);
  }
  if (st.light.led) {
    if (!rectInit) { RectAreaLightUniformsLib.init(); rectInit = true; }
    const { x0, x1, y0 } = K.upper;
    const led = new THREE.RectAreaLight(st.light.led, st.light.ledIntensity, x1 - x0 - 0.06, 0.03);
    led.position.set((x0 + x1) / 2, y0 - 0.005, 0.56);
    led.rotation.x = -Math.PI / 2;
    lights.push(led);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - 0.06, 0.006, 0.012), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: st.light.led, emissiveIntensity: 3 }));
    strip.position.set((x0 + x1) / 2, y0 - 0.003, 0.52);
    group.add(strip);
  }
  if (st.light.kind === 'sun' || st.light.sun) {
    const sun = new THREE.DirectionalLight(st.light.color, st.light.kind === 'sun' ? st.light.intensity : st.light.sun);
    sun.position.set(2.6, 3.5, 3.4);
    sun.target.position.set(0.2, K.top, 0.45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -1.6; c.right = 1.6; c.top = 1.6; c.bottom = -1.6; c.near = 0.5; c.far = 9;
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = st.light.kind === 'sun' ? 1.5 : 6;
    lights.push(sun, sun.target);
  }
  for (const l of lights) group.add(l);
  return {
    group, materials: M, lights,
    parts: {
      tap: tapG, knob: knobG, kettle: kt.body, kettleBase: kt.base, doors: upper.doors, mugs: upper.mugs,
      chest, bags: chest.userData.bags, sugar: bowl, spoon: bowl.userData.spoon, bin: binG, tray: trayG, bell: bellG, timer: timerG, note: noteG,
    },
  };
}

export function optimizeStatic(group, dynamic) {
  group.updateMatrixWorld(true);
  const skip = new Set();
  for (const d of dynamic) d.traverse(o => skip.add(o));
  const buckets = new Map();
  const remove = [];
  group.traverse(o => {
    if (!o.isMesh || skip.has(o) || o.isSkinnedMesh || Array.isArray(o.material) || o.material.transparent) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    const attrs = Object.keys(g.attributes).filter(k => ['position', 'normal', 'uv'].includes(k)).sort();
    for (const k of Object.keys(g.attributes)) if (!attrs.includes(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
    const key = `${o.material.uuid}|${attrs.join(',')}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}`;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
    buckets.get(key).geos.push(g);
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  const merged = new THREE.Group();
  merged.name = 'static';
  for (const b of buckets.values()) {
    const geo = mergeGeometries(b.geos, false);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.recv;
    m.matrixAutoUpdate = false;
    merged.add(m);
  }
  group.add(merged);
  group.traverse(o => { if (!skip.has(o) && !o.isLight) { o.matrixAutoUpdate = false; } });
  return { meshes: merged.children.length, removed: remove.length };
}
