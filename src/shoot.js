// Robotea: shooting range gameplay (finger-gun trigger, aim from hand position, a gun in each hand, recoil, flashes, casings, reloads, finger bolts, aim dots, the friend's shots)
import * as THREE from 'three';
import { byId, createGun, animateGun, fireGun, createCasings } from './guns.js';
import { createTrigger } from './trigger.js';
import { handBasis } from './pose.js';
import { ZERO, LANE_W } from './range.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SIDES = ['L', 'R'];
export const KA = 1.3;
const PALM = { L: V(-1, 0, 0), R: V(1, 0, 0) };
const GRIP = [0.72, 0.4, 0.8, 0.84, 0.88, 0.04];
const FINGER = [0.04, 0.02, 0.94, 0.97, 0.97, 0.06];
const AIM_KEY = 'robotea.aim.v1';
const GUN_KEY = 'robotea.weapon';
const KITS = {
  pistol: [[0, 'magout', 1], [0.42, 'magin', 1], [0.78, 'rack', 1]],
  smg: [[0, 'smgout', 1], [0.48, 'smgin', 1], [0.8, 'smgbolt', 1]],
  revolver: [[0, 'dry', 0.8], [0.2, 'casing', 1], [0.24, 'casing', 1.1], [0.3, 'casing', 0.95], [0.82, 'magin', 1.25]],
};
const UP = V(0, 1, 0);
const _q = new THREE.Quaternion(), _v = V(), _w = V();
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

function glowTexture(spikes) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.22, 'rgba(255,255,255,0.7)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  if (spikes) {
    g.globalCompositeOperation = 'lighter';
    g.translate(64, 64);
    for (let i = 0; i < spikes; i++) {
      g.rotate(Math.PI * 2 / spikes + (i % 2) * 0.2);
      g.beginPath();
      g.moveTo(0, -6);
      g.lineTo(58 - (i % 3) * 12, 0);
      g.lineTo(0, 6);
      g.closePath();
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 6, 32, 32, 32);
  r.addColorStop(0, 'rgba(90,255,150,0.55)');
  r.addColorStop(1, 'rgba(90,255,150,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  g.beginPath();
  g.arc(32, 32, 10, 0, Math.PI * 2);
  g.fillStyle = '#5dff96';
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(10,40,20,0.85)';
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function aimDir(yaw, pitch, out) {
  return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
}

export function createShooting({ scene, range, audio, cam, me, ctrl, them, partner, calib, myP, send }) {
  const trig = createTrigger();
  const flashTex = glowTexture(9), dotTex = glowTexture(0), aimTex = dotTexture();
  const light = new THREE.PointLight(0xffc98a, 0, 5, 2);
  scene.add(light);
  const add = (o) => { scene.add(o); return o; };
  const flashes = [0, 1, 2, 3].map(() => {
    const s = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0xffd7a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })));
    s.visible = false;
    return { s, t: 0 };
  });
  let flashI = 0;
  const glowMat = new THREE.SpriteMaterial({ map: dotTex, color: 0x6fe3ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  const boltGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.2, 8);
  const boltMat = new THREE.MeshBasicMaterial({ color: 0xd2faff, toneMapped: false });
  const casings = createCasings(scene), bolts = [], pending = [];
  const stats = { shots: 0, hits: 0, paper: 0, gong: 0, last: null, remote: 0 };
  let weapon = 'glock';
  try { const w = localStorage.getItem(GUN_KEY); if (byId[w]) weapon = w; } catch {}
  let friendWeapon = null, shake = 0, active = false, flashT = 0, casingT = 0, clock = 0, hint = 1;

  const mk = () => {
    const dot = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: aimTex, depthWrite: false, transparent: true, toneMapped: false })));
    dot.visible = false;
    dot.renderOrder = 5;
    return { gun: null, ammo: 0, reloadT: 0, reloadTotal: 1, lastShot: -9, hist: [], curls: [...GRIP], fcurls: [...FINGER], pull: 0, climb: 0, yaw: 0, pitch: 0, ox: 0, oy: 0, dir: V(0, 0, 1), q: new THREE.Quaternion(), kick: { o: V(), v: V() }, burst: 0, hitPoint: null, dot, live: false };
  };
  const mine = { L: mk(), R: mk() };
  const theirs = { L: null, R: null };

  const loadRef = () => { try { const r = JSON.parse(localStorage.getItem(AIM_KEY) || 'null'); if (r?.L && r?.R) return r; } catch {} return null; };
  let ref = loadRef();
  const zero = { active: false, hold: 0, t: 0, acc: null };

  const pan = p => THREE.MathUtils.clamp(_w.copy(p).project(cam).x, -1, 1);

  function muzzle(robot, gun, side, out = V()) {
    if (gun.def.finger) return robot.bones[`${side}_i2`].localToWorld(out.set(0, -0.027, 0));
    return gun.pivot.localToWorld(out.copy(gun.muzzleLocal));
  }
  function barrel(robot, gun, side, out = V()) {
    if (gun.def.finger) return out.set(0, -1, 0).transformDirection(robot.bones['hand' + side].matrixWorld);
    return out.set(1, 0, 0).transformDirection(gun.pivot.matrixWorld);
  }

  function attach(robot, side, id) {
    const g = createGun(id);
    if (!g.def.finger) {
      const s = side === 'L' ? 1 : -1;
      g.root.position.set(-s * 0.03, -0.072, 0.028);
    }
    robot.bones['hand' + side].add(g.root);
    return g;
  }
  const detach = g => { g?.root.parent?.remove(g.root); };

  function equip(id, quiet = false) {
    weapon = id;
    try { localStorage.setItem(GUN_KEY, id); } catch {}
    for (const side of SIDES) {
      const m = mine[side];
      detach(m.gun);
      m.gun = null;
      if (!active) continue;
      m.gun = attach(me, side, id);
      m.ammo = byId[id].mag;
      m.reloadT = 0;
      m.burst = 0;
    }
    if (!quiet) send({ t: 'weapon', w: id });
  }

  function equipFriend(id) {
    friendWeapon = id;
    for (const side of SIDES) {
      detach(theirs[side]);
      theirs[side] = active ? attach(them, side, id) : null;
      partner.over.curls[side] = active && !byId[id].finger ? GRIP : null;
    }
  }

  function enter(id) {
    if (byId[id]) weapon = id;
    active = true;
    ref = loadRef();
    ctrl.over.ref = ref;
    zero.active = !ref;
    Object.assign(zero, { hold: 0, t: 0, acc: null });
    equip(weapon);
    if (friendWeapon) equipFriend(friendWeapon);
  }

  function exit() {
    active = false;
    for (const side of SIDES) {
      detach(mine[side].gun);
      mine[side].gun = null;
      mine[side].dot.visible = false;
      detach(theirs[side]);
      theirs[side] = null;
      partner.over.curls[side] = null;
    }
    for (const f of flashes) f.s.visible = false;
    light.intensity = 0;
  }

  function rezero() {
    zero.active = true;
    Object.assign(zero, { hold: 0, t: 0, acc: null });
  }

  function finishZero() {
    const a = zero.acc, n = calib.neutral, r = {};
    for (const s of SIDES) if (a[s].n > 8) r[s] = { cx: a[s].cx / a[s].n, cy: a[s].cy / a[s].n };
    for (const s of SIDES) {
      if (r[s]) continue;
      const o = s === 'L' ? 'R' : 'L';
      r[s] = r[o] ? { cx: n[s].cx - (r[o].cx - n[o].cx), cy: n[s].cy + (r[o].cy - n[o].cy) } : { cx: n[s].cx, cy: n[s].cy };
    }
    ref = r;
    ctrl.over.ref = r;
    try { localStorage.setItem(AIM_KEY, JSON.stringify(r)); } catch {}
    zero.active = false;
    zero.acc = null;
  }

  function updateZero(hands, pose, dt) {
    zero.t += dt;
    const ready = SIDES.filter(s => pose[s] && hands?.[s]?.seen && hands[s].s);
    if (ready.length) {
      zero.hold += dt;
      zero.acc ||= { L: { cx: 0, cy: 0, n: 0 }, R: { cx: 0, cy: 0, n: 0 } };
      for (const s of ready) { const a = zero.acc[s]; a.cx += hands[s].s.cx; a.cy += hands[s].s.cy; a.n++; }
    } else zero.hold = Math.max(0, zero.hold - dt * 0.5);
    if (zero.hold >= 1.1) finishZero();
    else if (zero.t > 14) zero.active = false;
  }

  function showFlash(at, dir, def) {
    const f = flashes[flashI++ % flashes.length];
    f.s.position.copy(at).addScaledVector(dir, def.finger ? 0.01 : 0.035);
    const k = def.flash * (0.85 + Math.random() * 0.3);
    f.s.scale.set(k, k, 1);
    f.s.material.rotation = Math.random() * Math.PI;
    f.s.material.color.setHex(def.finger ? 0x7fe6ff : 0xffd29a);
    f.s.visible = true;
    f.t = def.finger ? 0.07 : 0.045;
    light.position.copy(at).addScaledVector(dir, 0.06);
    light.color.setHex(def.finger ? 0x7fdfff : 0xffc98a);
    light.intensity = def.finger ? 1.5 : 5 + def.recoil * 3;
    flashT = 0.06;
  }

  function shotFx(robot, gun, side, local) {
    const def = gun.def;
    fireGun(gun);
    const at = muzzle(robot, gun, side), dir = barrel(robot, gun, side);
    showFlash(at, dir, def);
    if (!def.finger) range.puff(at.clone().addScaledVector(dir, 0.06), 0xe9e5dc, 0.08 + def.recoil * 0.05, 0.9);
    if (def.casing && gun.ejectLocal) {
      const ej = gun.pivot.localToWorld(gun.ejectLocal.clone());
      const right = V(0, 0, 1).transformDirection(gun.pivot.matrixWorld);
      const up = V(0, 1, 0).transformDirection(gun.pivot.matrixWorld);
      casings.spawn(ej, right.addScaledVector(up, 0.25).addScaledVector(dir, -0.3).normalize(), up);
    }
    audio.play(def.sound, 1, pan(at), { rate: (def.pitch || 1) * (0.97 + Math.random() * 0.06), gain: (local ? 0.95 : 0.7) * (def.finger ? 0.6 : 1), wet: def.finger ? 0.15 : 0.35, steady: true });
  }

  function land(info, def, dx, local) {
    const res = range.impact(info, { caliber: def.caliber, power: def.power, dx });
    if (!res) return null;
    if (res.kind === 'gong') {
      const d = res.at.distanceTo(cam.position);
      audio.play('steel', 0.85, pan(res.at), { delay: d / 343, gain: Math.min(1, 6 / d) * (local ? 1 : 0.8), wet: 0.5, rate: 1 + (0.15 - res.size) * 4, steady: true });
    }
    if (local) {
      if (res.kind !== 'wall') stats.hits++;
      if (res.kind === 'paper') { stats.paper++; stats.last = res.score; }
      if (res.kind === 'gong') stats.gong++;
    }
    return res;
  }

  function spawnBolt(origin, dir, dist, info, def, dx, local) {
    const mesh = new THREE.Mesh(boltGeo, boltMat);
    mesh.quaternion.setFromUnitVectors(UP, dir);
    mesh.position.copy(origin);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(0.07);
    mesh.add(glow);
    scene.add(mesh);
    bolts.push({ mesh, origin: origin.clone(), dir: dir.clone(), dist, travel: 0, info, def, dx, local });
  }

  function reloadFx(robot, gun, side, local) {
    const def = gun.def, at = gun.pivot.getWorldPosition(V());
    for (const [k, kind, rate] of KITS[def.kit]) audio.play(kind, 0.8, pan(at), { delay: k * def.reload, gain: local ? 0.55 : 0.35, wet: 0.12, rate });
    if (def.kit === 'pistol' && gun.slide) {
      gun.hold = true;
      pending.push({ at: clock + def.reload * 0.78, fn: () => { gun.hold = false; } });
    }
    if (def.kit === 'revolver') {
      pending.push({ at: clock + def.reload * 0.2, fn: () => {
        if (!gun.root.parent) return;
        const c = gun.cylinder.getWorldPosition(V());
        for (let i = 0; i < 6; i++) casings.spawn(c.clone().add(V((Math.random() - 0.5) * 0.02, -0.01, (Math.random() - 0.5) * 0.02)), V(Math.random() - 0.5, -0.4, -0.2).normalize(), V(0, 0.3, 0), 0.35);
      } });
    }
  }

  function reload(side) {
    const m = mine[side], def = byId[weapon];
    if (def.finger || m.reloadT > 0 || !m.gun) return;
    m.reloadT = m.reloadTotal = def.reload;
    reloadFx(me, m.gun, side, true);
    send({ t: 'reload', s: side });
  }

  function fire(side, lag = 0) {
    const m = mine[side], def = byId[weapon];
    if (!active || !m.gun || m.reloadT > 0 || clock - m.lastShot < 1 / def.rate) return false;
    m.lastShot = clock;
    let yaw = m.yaw, pitch = m.pitch;
    if (lag) for (let i = m.hist.length - 1; i >= 0; i--) if (m.hist[i][0] <= clock - lag) { yaw = m.hist[i][1]; pitch = m.hist[i][2]; break; }
    yaw += gauss() * def.spread;
    pitch += gauss() * def.spread;
    const dir = aimDir(yaw, pitch, V());
    const origin = muzzle(me, m.gun, side);
    const hit = range.cast(origin, dir);
    const info = range.resolve(hit);
    shotFx(me, m.gun, side, true);
    if (def.finger) spawnBolt(origin, dir, hit ? hit.distance : 30, info, def, 0, true);
    else land(info, def, 0, true);
    m.pull = 1;
    if (def.auto) m.climb += 0.004 + def.recoil * 0.01;
    m.kick.v.addScaledVector(dir, -(0.35 + def.recoil * 0.55)).add(_v.set(0, 0.2 + def.recoil * 0.45, 0));
    shake += 0.0015 + def.recoil * 0.003;
    stats.shots++;
    hint = 0;
    send({ t: 'shot', s: side, w: def.id, i: info, o: origin.toArray(), d: dir.toArray(), p: myP });
    if (!def.finger && --m.ammo <= 0) reload(side);
    return true;
  }

  function remote(msg) {
    if (msg.t === 'weapon') { if (active) equipFriend(msg.w); else friendWeapon = msg.w; return; }
    if (!active) return;
    if (msg.t === 'clear') { range.clear(msg.p); return; }
    if (msg.t === 'reload') { const g = theirs[msg.s]; if (g && !g.def.finger && partner.active()) reloadFx(them, g, msg.s, false); return; }
    if (msg.t !== 'shot') return;
    stats.remote++;
    if (friendWeapon !== msg.w || !theirs[msg.s]) equipFriend(msg.w);
    const g = theirs[msg.s], def = byId[msg.w], dx = (myP - msg.p) * LANE_W;
    const seen = g && partner.active();
    if (seen) shotFx(them, g, msg.s, false);
    else audio.play(def.sound, 1, 0, { gain: 0.5, wet: 0.4, steady: true });
    const origin = seen ? muzzle(them, g, msg.s) : V(msg.o[0] + dx, msg.o[1], msg.o[2]);
    if (def.finger) {
      const end = range.impactPoint(msg.i, dx);
      const dir = end ? end.clone().sub(origin).normalize() : V(...msg.d);
      spawnBolt(origin, dir, end ? end.distanceTo(origin) : 30, msg.i, def, dx, false);
    } else land(msg.i, def, dx, false);
  }

  function clearMine() {
    range.clear(myP);
    send({ t: 'clear', p: myP });
  }

  function update(dt, hands) {
    if (!active) return;
    clock += dt;
    const def = byId[weapon];
    const pose = {};
    const look = V(), base = V(0, 1.45, 7);
    let lookN = 0;
    for (const side of SIDES) {
      const m = mine[side];
      const h = hands?.[side];
      const out = trig.update(side, h?.seen ? h.s : null, dt);
      pose[side] = out.gun;
      m.live = ctrl.st.unseen[side] < 0.3;
      const b = ctrl.base(side), cur = ctrl.st.cur[side];
      const y0 = Math.atan2(ZERO.x - b.x, ZERO.z - b.z), p0 = Math.atan2(ZERO.y - b.y - 0.045, ZERO.z - b.z);
      m.climb *= Math.exp(-dt * 5);
      const ks = 1 - Math.exp(-dt * 16);
      m.ox += (cur.x - b.x - m.ox) * ks;
      m.oy += (cur.y - b.y - m.oy) * ks;
      m.yaw = y0 + m.ox * KA;
      m.pitch = p0 + m.oy * KA + m.climb;
      m.hist.push([clock, m.yaw, m.pitch]);
      if (m.hist.length > 45) m.hist.shift();
      aimDir(m.yaw, m.pitch, m.dir);
      handBasis(side, m.dir, PALM[side], m.q);
      let tilt = 0;
      if (m.reloadT > 0) {
        m.reloadT -= dt;
        tilt = Math.sin(Math.min(1, 1 - m.reloadT / m.reloadTotal) * Math.PI);
        if (m.reloadT <= 0) { m.reloadT = 0; m.ammo = def.mag; }
      }
      if (tilt) m.q.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), -0.55 * tilt)).multiply(_q.setFromAxisAngle(UP, (side === 'L' ? -1 : 1) * 0.8 * tilt));
      ctrl.over.q[side] = m.q;
      m.pull *= Math.exp(-dt * 16);
      if (def.finger) { m.fcurls[0] = trig.st[side].hammer ? 0.92 : 0.04; ctrl.over.curls[side] = m.fcurls; }
      else { m.curls[1] = GRIP[1] + 0.3 * m.pull; ctrl.over.curls[side] = m.curls; }
      const k = m.kick;
      k.v.addScaledVector(k.o, -170 * dt).multiplyScalar(Math.exp(-dt * 15));
      k.o.addScaledVector(k.v, dt);
      ctrl.st.adjust[side].copy(k.o).add(_v.set(0, -0.02 * tilt, -0.06 * tilt));
      if (!zero.active && m.live && m.reloadT <= 0 && m.gun) {
        if (def.auto) {
          if (out.fire && out.flick) m.burst = 3;
          if ((out.held || m.burst > 0) && fire(side, out.flick ? 0.12 : 0.03) && m.burst > 0) m.burst--;
        } else if (out.fire) fire(side, out.flick ? 0.12 : 0.03);
      }
    }
    if (zero.active) updateZero(hands, pose, dt);

    for (const side of SIDES) {
      const m = mine[side];
      if (!m.gun) continue;
      animateGun(m.gun, dt);
      const show = m.live && !zero.active && m.reloadT <= 0;
      m.dot.visible = false;
      m.hitPoint = null;
      if (!show) continue;
      const origin = muzzle(me, m.gun, side);
      const hit = range.cast(origin, m.dir);
      if (!hit) continue;
      m.hitPoint = hit.point;
      m.dot.position.copy(hit.point).addScaledVector(m.dir, -0.02);
      m.dot.scale.setScalar(0.012 + hit.distance * 0.01);
      m.dot.visible = true;
      look.add(hit.point);
      lookN++;
    }
    for (const side of SIDES) if (theirs[side]) animateGun(theirs[side], dt);
    ctrl.over.look = lookN ? base.lerp(look.divideScalar(lookN), 0.6) : base;

    for (let i = pending.length - 1; i >= 0; i--) if (clock >= pending[i].at) { pending[i].fn(); pending.splice(i, 1); }
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.travel += 60 * dt;
      b.mesh.position.copy(b.origin).addScaledVector(b.dir, Math.max(0, Math.min(b.travel, b.dist) - 0.1));
      if (b.travel >= b.dist || b.travel > 40) {
        const res = b.travel >= b.dist ? land(b.info, b.def, b.dx, b.local) : null;
        if (res) range.puff(res.at, 0x9fe9ff, 0.07, 0.35);
        scene.remove(b.mesh);
        bolts.splice(i, 1);
      }
    }
    casingT -= dt;
    casings.update(dt, range.floorAt, (c, s) => {
      if (casingT > 0) return;
      casingT = 0.04;
      audio.play('casing', 0.5, pan(c.p), { gain: 0.12 + 0.2 * s, rate: 0.9 + Math.random() * 0.3, wet: 0.1 });
    });
    for (const f of flashes) if (f.s.visible && (f.t -= dt) <= 0) f.s.visible = false;
    flashT -= dt;
    light.intensity = flashT > 0 ? light.intensity * Math.exp(-dt * 40) : 0;
  }

  function applyShake(c, dt) {
    shake *= Math.exp(-dt * 14);
    if (shake < 1e-5) return;
    c.rotateX((Math.random() - 0.5) * shake);
    c.rotateY((Math.random() - 0.5) * shake);
  }

  function hud() {
    const def = byId[weapon];
    return {
      weapon: def.name, id: def.id, finger: !!def.finger,
      ammo: SIDES.map(s => ({ side: s, ammo: mine[s].ammo, mag: def.mag, reloading: mine[s].reloadT > 0, live: mine[s].live })),
      zero: zero.active ? Math.min(1, zero.hold / 1.1) : null, hint,
    };
  }

  return { enter, exit, update, equip, fire, reload, remote, clearMine, applyShake, hud, rezero, skipZero: () => { zero.active = false; }, stats, mine, get weapon() { return weapon; }, get active() { return active; } };
}
