// Robotea: indoor shooting range (lanes with glass partitions, paper ring targets at 4/7/10 m, swinging steel gongs, merged static geometry, instanced holes, score popups, dust)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const LANE_W = 1.4;
const LEN = 12;
const RING = 0.025;
const PAPER = [[4, 0.4, 1.5], [7, -0.42, 1.52], [10, 0, 1.55]];
const GONGS = [[5.5, -0.15, 0.13, 1.0], [8.5, 0.05, 0.17, 1.05]];
export const ZERO = V(PAPER[2][1], PAPER[2][2] - 0.01, PAPER[2][0]);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function targetTexture() {
  return canvasTex(550, 720, (g, w, h) => {
    g.fillStyle = '#f1eee4';
    g.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2 + 10, px = 1000;
    for (let k = 1; k <= 10; k++) {
      const r = (11 - k) * RING * px;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fillStyle = k >= 7 ? '#151515' : '#f1eee4';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = k >= 7 ? '#f1eee4' : '#151515';
      g.stroke();
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '600 20px Helvetica, Arial';
    for (let k = 1; k <= 9; k++) {
      const r = (10.5 - k) * RING * px;
      g.fillStyle = k >= 7 ? '#f1eee4' : '#151515';
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.fillText(String(k), cx + dx * r, cy + dy * r);
    }
    g.fillStyle = '#151515';
    g.font = '700 24px Helvetica, Arial';
    g.fillText('ROBOTEA RANGE', cx, 40);
  });
}

function noiseTexture(base, spread, size = 256) {
  return canvasTex(size, size, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < w * h; i++) {
      const v = (Math.random() - 0.5) * spread;
      img.data[i * 4] += v; img.data[i * 4 + 1] += v; img.data[i * 4 + 2] += v;
    }
    g.putImageData(img, 0, 0);
  });
}

function paintTexture(text) {
  return canvasTex(256, 128, (g, w, h) => {
    g.font = '800 84px -apple-system, Helvetica, Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#f2c94c';
    g.fillText(text, w / 2, h / 2);
  });
}

const popTex = new Map();
function popupTexture(text, color) {
  const k = text + color;
  if (!popTex.has(k)) popTex.set(k, canvasTex(256, 128, (g, w, h) => {
    g.font = '800 92px -apple-system, Helvetica, Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 12;
    g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.strokeText(text, w / 2, h / 2);
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2);
  }));
  return popTex.get(k);
}

export function buildRange(scene, myP, count) {
  const laneX = p => (myP - p) * LANE_W;
  scene.background = new THREE.Color(0x2a2b2d);
  scene.fog = new THREE.Fog(0x2a2b2d, 16, 34);
  const floorTex = noiseTexture('#b9b6af', 16);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  const mat = {
    floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xe9e7e2, roughness: 0.88 }),
    panel: new THREE.MeshStandardMaterial({ color: 0xd8d5ce, roughness: 0.75 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x9a9fa6, roughness: 0.35, metalness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xeef6f8, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false }),
    bench: new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 0.5, metalness: 0.2 }),
    benchTop: new THREE.MeshStandardMaterial({ color: 0xc89f70, roughness: 0.6 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x252527, roughness: 0.96 }),
    steelPlate: new THREE.MeshStandardMaterial({ color: 0x5a5d62, roughness: 0.45, metalness: 0.7 }),
    line: new THREE.MeshBasicMaterial({ color: 0xf2c94c }),
    paint5: new THREE.MeshBasicMaterial({ map: paintTexture('5 m'), transparent: true, depthWrite: false }),
    paint10: new THREE.MeshBasicMaterial({ map: paintTexture('10 m'), transparent: true, depthWrite: false }),
    paper: new THREE.MeshStandardMaterial({ map: targetTexture(), roughness: 0.95, side: THREE.DoubleSide }),
    gong: new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.5, metalness: 0.3 }),
    chain: new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.4, metalness: 0.9 }),
    clip: new THREE.MeshStandardMaterial({ color: 0x26272a, roughness: 0.5, metalness: 0.4 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfffbf2 }),
    hole: new THREE.MeshBasicMaterial({ color: 0x0c0c0c }),
    splash: new THREE.MeshBasicMaterial({ color: 0xa9adb3 }),
  };
  const root = new THREE.Group();
  scene.add(root);
  const buckets = new Map();
  const _o = new THREE.Object3D();
  const stat = (geo, m, x, y, z, rx = 0, ry = 0, solid = true, rz = 0) => {
    _o.position.set(x, y, z);
    _o.rotation.set(rx, ry, rz);
    _o.updateMatrix();
    geo.applyMatrix4(_o.matrix);
    const key = m.uuid + (solid ? 's' : 'n');
    if (!buckets.has(key)) buckets.set(key, { m, solid, geos: [] });
    buckets.get(key).geos.push(geo);
  };
  const box = (w, h, d, m, x, y, z, solid = true, rx = 0) => stat(new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, 0, solid);
  const plane = (w, h, m, x, y, z, rx, ry, solid = true, rz = 0) => stat(new THREE.PlaneGeometry(w, h), m, x, y, z, rx, ry, solid, rz);

  const ps = [...Array(count).keys()];
  const xs = ps.map(laneX);
  const x0 = Math.min(...xs) - LANE_W / 2, x1 = Math.max(...xs) + LANE_W / 2;
  const W = x1 - x0, cxr = (x0 + x1) / 2;
  const zBack = -1.6, zFront = LEN + 0.4, D = zFront - zBack, cz = (zBack + zFront) / 2;
  floorTex.repeat.set(W / 2, D / 2);
  plane(W, D, mat.floor, cxr, 0, cz, -Math.PI / 2, 0);
  plane(W, D, mat.wall, cxr, 3, cz, Math.PI / 2, 0);
  plane(D, 3, mat.wall, x0, 1.5, cz, 0, Math.PI / 2);
  plane(D, 3, mat.wall, x1, 1.5, cz, 0, -Math.PI / 2);
  plane(W, 3, mat.wall, cxr, 1.5, zBack, 0, 0);
  box(W, 3, 0.4, mat.rubber, cxr, 1.5, LEN + 0.2);
  box(W, 0.02, 2.2, mat.steelPlate, cxr, 0.72, LEN - 0.85, true, -0.72);
  for (let k = 0; k < count - 1; k++) {
    const px = (myP - k - 0.5) * LANE_W;
    box(0.05, 1.06, 1.4, mat.panel, px, 0.53, 0.2);
    box(0.012, 0.9, 1.36, mat.glass, px, 1.51, 0.2, false);
    box(0.04, 0.04, 1.4, mat.frame, px, 1.98, 0.2, false);
    box(0.04, 0.96, 0.04, mat.frame, px, 1.5, 0.9, false);
    box(0.04, 0.96, 0.04, mat.frame, px, 1.5, -0.5, false);
  }

  const lanes = [];
  const holeGeo = new THREE.CircleGeometry(1, 12);
  for (const p of ps) {
    const lx = laneX(p);
    box(LANE_W - 0.1, 0.05, 0.36, mat.benchTop, lx, 1.0, 0.66);
    box(LANE_W - 0.16, 0.95, 0.3, mat.bench, lx, 0.475, 0.68);
    plane(LANE_W - 0.2, 0.05, mat.line, lx, 0.003, 0.95, -Math.PI / 2, 0);
    for (const z of [-0.2, 3.2, 6.6, 10]) box(0.46, 0.03, 1.1, mat.lamp, lx, 2.985, z, false);
    for (const d of [5, 10]) {
      plane(LANE_W - 0.3, 0.04, mat.line, lx, 0.003, d, -Math.PI / 2, 0);
      plane(0.36, 0.18, d === 5 ? mat.paint5 : mat.paint10, lx + LANE_W / 2 - 0.32, 0.004, d - 0.16, -Math.PI / 2, 0, false, Math.PI);
    }
    const lane = { p, x: lx, targets: [], gongs: [] };
    PAPER.forEach(([z, dx, y], idx) => {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.72), mat.paper);
      t.position.set(lx + dx, y, z);
      t.rotation.y = Math.PI;
      t.castShadow = true;
      t.receiveShadow = true;
      t.userData = { kind: 'paper', lane: p, idx };
      root.add(t);
      box(0.2, 0.04, 0.03, mat.clip, lx + dx, y + 0.38, z, false);
      const chainLen = 3 - (y + 0.4);
      box(0.008, chainLen, 0.008, mat.chain, lx + dx, y + 0.4 + chainLen / 2, z, false);
      lane.targets.push(t);
    });
    GONGS.forEach(([z, dx, r, y], idx) => {
      const pivot = new THREE.Group();
      pivot.position.set(lx + dx, y + 0.6, z);
      root.add(pivot);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.012, 48), mat.gong);
      disc.rotation.x = Math.PI / 2;
      disc.position.y = -0.6;
      disc.castShadow = true;
      disc.userData = { kind: 'gong', lane: p, idx };
      pivot.add(disc);
      const hang = 0.6 - r * 0.75;
      const chains = mergeGeometries([-1, 1].map(s => new THREE.CylinderGeometry(0.004, 0.004, hang, 6).translate(s * r * 0.55, -hang / 2, 0)));
      pivot.add(new THREE.Mesh(chains, mat.chain));
      const marks = new THREE.InstancedMesh(holeGeo, mat.splash, 48);
      marks.count = 0;
      marks.frustumCulled = false;
      disc.add(marks);
      box(2 * r + 0.08, 0.03, 0.03, mat.chain, lx + dx, y + 0.615, z, false);
      const rope = 3 - (y + 0.63);
      for (const s of [-1, 1]) box(0.006, rope, 0.006, mat.chain, lx + dx + s * (r + 0.02), y + 0.63 + rope / 2, z, false);
      lane.gongs.push({ pivot, disc, r, a: 0, v: 0, marks, next: 0 });
    });
    lanes.push(lane);
  }

  const solids = [];
  for (const { m, solid, geos } of buckets.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    mesh.receiveShadow = true;
    if (m === mat.glass) mesh.renderOrder = 2;
    root.add(mesh);
    if (solid) solids.push(mesh);
    for (const g of geos) g.dispose();
  }

  scene.add(new THREE.HemisphereLight(0xfff8ee, 0x4a4640, 1.0));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.7);
  key.position.set(0.9, 3.4, -0.9);
  key.target.position.set(0, 0.9, 1.0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -2.4, right: 2.4, top: 2.2, bottom: -1.4, near: 0.3, far: 7 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const down = new THREE.DirectionalLight(0xfffaf0, 1.5);
  down.position.set(0, 2.9, 0);
  down.target.position.set(0, 1.0, 10);
  scene.add(down, down.target);

  const holes = new THREE.InstancedMesh(holeGeo, mat.hole, 2048);
  holes.count = 0;
  holes.frustumCulled = false;
  root.add(holes);
  let holeNext = 0;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = V(), _z = V(0, 0, 1);
  const _flat = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2);

  function addHole(at, normal, radius) {
    _q.setFromUnitVectors(_z, normal);
    _m.compose(at, _q, _s.setScalar(radius));
    holes.setMatrixAt(holeNext, _m);
    holeNext = (holeNext + 1) % 2048;
    holes.count = Math.max(holes.count, holeNext === 0 ? 2048 : holeNext);
    holes.instanceMatrix.needsUpdate = true;
  }

  const ray = new THREE.Raycaster();
  ray.far = 40;
  const hitables = [...lanes.flatMap(l => [...l.targets, ...l.gongs.map(g => g.disc)]), ...solids];
  const fx = [];
  const puffTex = canvasTex(64, 64, g => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,0.9)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });

  function popup(text, at, color) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: popupTexture(text, color), transparent: true, depthWrite: false, toneMapped: false }));
    s.position.copy(at);
    const k = 0.03 * Math.max(2, at.z) + 0.08;
    s.scale.set(k, k / 2, 1);
    root.add(s);
    fx.push({ o: s, t: 0, life: 1.4, kind: 'pop', y0: at.y });
  }

  function puff(at, color = 0xd8d2c4, size = 0.12, life = 0.7) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false, opacity: 0.8 }));
    s.position.copy(at);
    s.scale.setScalar(size * 0.4);
    root.add(s);
    fx.push({ o: s, t: 0, life, kind: 'puff', size });
  }

  const laneByP = p => lanes.find(l => l.p === p);

  function cast(origin, dir) {
    ray.set(origin, dir);
    return ray.intersectObjects(hitables, false)[0] || null;
  }

  function resolve(hit) {
    if (!hit) return null;
    const ud = hit.object.userData;
    if (ud.kind === 'paper' || ud.kind === 'gong') {
      const l = hit.object.worldToLocal(hit.point.clone());
      return { kind: ud.kind, lane: ud.lane, idx: ud.idx, p: [l.x, l.y, l.z] };
    }
    const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : V(0, 0, -1);
    return { kind: 'wall', w: [hit.point.x, hit.point.y, hit.point.z], n: [n.x, n.y, n.z] };
  }

  function impactPoint(info, dx = 0) {
    if (!info) return null;
    if (info.kind === 'wall') return V(info.w[0] + dx, info.w[1], info.w[2]);
    const l = laneByP(info.lane);
    if (!l) return null;
    const obj = info.kind === 'paper' ? l.targets[info.idx] : l.gongs[info.idx].disc;
    return obj.localToWorld(V(...info.p));
  }

  function impact(info, o = {}) {
    if (!info) return null;
    const caliber = o.caliber || 0.0045;
    if (info.kind === 'paper') {
      const l = laneByP(info.lane);
      if (!l) return null;
      const t = l.targets[info.idx];
      const lp = V(...info.p);
      const d = Math.hypot(lp.x, lp.y + 0.01);
      const score = d <= 10 * RING ? Math.max(1, 10 - Math.floor(d / RING)) : 0;
      const at = t.localToWorld(V(lp.x, lp.y, 0.0012));
      addHole(at, V(0, 0, 1).transformDirection(t.matrixWorld), caliber);
      popup(score ? String(score) : 'miss', at.clone().add(V(0, 0.08, -0.03)), score >= 9 ? '#f2c94c' : '#ffffff');
      puff(at, 0xf1eee4, 0.06, 0.5);
      return { kind: 'paper', score, at };
    }
    if (info.kind === 'gong') {
      const l = laneByP(info.lane);
      if (!l) return null;
      const g = l.gongs[info.idx];
      g.v -= (o.power || 1) * 0.5 / (g.r * 6);
      _m.compose(_s.set(info.p[0], -0.0068, info.p[2]), _flat, V().setScalar(caliber * 2.4));
      g.marks.setMatrixAt(g.next, _m);
      g.next = (g.next + 1) % 48;
      g.marks.count = Math.max(g.marks.count, g.next === 0 ? 48 : g.next);
      g.marks.instanceMatrix.needsUpdate = true;
      const at = g.disc.localToWorld(V(...info.p));
      puff(at, 0xfff1d6, 0.09, 0.45);
      return { kind: 'gong', size: g.r, at };
    }
    const at = V(info.w[0] + (o.dx || 0), info.w[1], info.w[2]);
    const n = V(...info.n);
    addHole(at.clone().addScaledVector(n, 0.002), n, caliber * 0.9);
    puff(at, 0xc8c1b2, 0.2, 0.8);
    return { kind: 'wall', at };
  }

  function update(dt) {
    for (const l of lanes) for (const g of l.gongs) {
      if (Math.abs(g.a) < 1e-4 && Math.abs(g.v) < 1e-4) continue;
      g.v += -9.81 / 0.6 * Math.sin(g.a) * dt;
      g.v *= Math.exp(-dt * 0.7);
      g.a += g.v * dt;
      g.pivot.rotation.x = g.a;
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        root.remove(p.o);
        p.o.material.dispose();
        fx.splice(i, 1);
        continue;
      }
      if (p.kind === 'pop') { p.o.position.y = p.y0 + k * 0.14; p.o.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; }
      else { p.o.scale.setScalar(p.size * (0.4 + k)); p.o.material.opacity = 0.7 * (1 - k); p.o.position.y += dt * 0.08; }
    }
  }

  function clear(p) {
    const l = laneByP(p);
    if (!l) return;
    const keep = [];
    const m = new THREE.Matrix4(), pos = V();
    for (let i = 0; i < holes.count; i++) {
      holes.getMatrixAt(i, m);
      pos.setFromMatrixPosition(m);
      if (Math.abs(pos.x - l.x) > LANE_W / 2 || pos.z < 3) keep.push(m.clone());
    }
    keep.forEach((mm, i) => holes.setMatrixAt(i, mm));
    holes.count = keep.length;
    holeNext = keep.length % 2048;
    holes.instanceMatrix.needsUpdate = true;
    for (const g of l.gongs) { g.marks.count = 0; g.next = 0; }
  }

  const floorAt = p => {
    for (const l of lanes) if (Math.abs(p.x - l.x) < LANE_W / 2 - 0.05 && p.z > 0.48 && p.z < 0.84 && p.y > 0.95) return 1.025;
    return 0;
  };

  return { root, lanes, laneByP, cast, resolve, impact, impactPoint, update, clear, floorAt, puff };
}
