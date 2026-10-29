// Robotea: bootstrap and loop (high-five studio or shooting range, first-person Optimus, the other robot, hand tracking, sound, online link)
import * as THREE from 'three';
import { buildStudio } from './studio.js';
import { buildRange, LANE_W } from './range.js';
import { makeMaterials, createRobot } from './optimus.js';
import { createController } from './robot.js';
import { createPartner, GAP } from './partner.js';
import { createHands, createCalibration } from './hands.js';
import { handBasis } from './pose.js';
import { createClapper } from './clap.js';
import { createShooting } from './shoot.js';
import { WEAPONS, byId } from './guns.js';
import { createFx } from './fx.js';
import { createAudio } from './audio.js';
import { createLink, makeCode, cleanCode, packPose, unpackPose } from './net.js';

const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const TEST = Q.has('test');
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const show = id => { for (const l of document.querySelectorAll('.layer')) l.classList.toggle('on', l.id === id); };
const notice = t => { $('noticeText').textContent = t; show('notice'); };
const CAL_KEY = 'robotea.calib.v3';
const GAME_KEY = 'robotea.game';
const GUN_KEY = 'robotea.weapon';
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const VIEWS = {
  hands: [V(-0.55, 1.62, 1.1), V(0, 1.4, 0.45)],
  side: [V(-1.15, 1.5, 0.45), V(0, 1.4, 0.45)],
  back: [V(0.45, 1.95, -1.05), V(0, 1.35, 3)],
  lane: [V(-0.5, 1.7, 2.6), V(0.1, 1.45, 9)],
  duo: [V(-0.7, 2.45, -1.45), V(-0.7, 1.2, 2.5)],
};

function loadCalibration() {
  const c = createCalibration();
  try {
    const raw = JSON.parse(localStorage.getItem(CAL_KEY) || 'null');
    if (raw?.neutral) {
      for (const side of ['L', 'R']) {
        Object.assign(c.neutral[side], raw.neutral[side]);
        if (raw.neutral[side].q) c.neutral[side].q = new THREE.Quaternion(...raw.neutral[side].q);
      }
      c.near = raw.near; c.far = raw.far; c.done = true;
    }
  } catch {}
  return c;
}

function saveCalibration(c) {
  try {
    const n = s => ({ cx: c.neutral[s].cx, cy: c.neutral[s].cy, size: c.neutral[s].size, q: c.neutral[s].q ? c.neutral[s].q.toArray() : null });
    localStorage.setItem(CAL_KEY, JSON.stringify({ neutral: { L: n('L'), R: n('R') }, near: c.near, far: c.far }));
  } catch {}
}

async function main() {
  if (matchMedia('(pointer: coarse)').matches && innerWidth < 1100 && !TEST) return notice('Open Robotea on a computer with a webcam. You need both hands free in front of the camera.');

  const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.has('dpr') ? +Q.get('dpr') : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const studio = new THREE.Scene();
  await buildStudio(renderer, studio);
  let scene = studio;
  const me = createRobot(makeMaterials('white'));
  const them = createRobot(makeMaterials('graphite'));
  studio.add(me.root, them.root);
  const calib = loadCalibration();
  const ctrl = createController(me, calib);
  const partner = createPartner(them);
  const cam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.03, 40);
  ctrl.update(null, 1 / 60);
  partner.update(1 / 60);
  ctrl.camera(cam);
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
  });

  const audio = createAudio();
  fetch('assets/sfx/sounds.json').then(r => r.json()).then(list => {
    for (const [kind, files] of Object.entries(list)) audio.load(kind, files.map(f => 'assets/sfx/' + f));
  }).catch(() => {});
  const fx = createFx(studio);

  const G = {
    state: 'menu', mode: 'solo', game: null, started: false, picker: false, zeroShown: false, rangeT: 0,
    pick: store.get(GAME_KEY) === 'range' ? 'range' : 'hf',
    weapon: byId[store.get(GUN_KEY)] ? store.get(GUN_KEY) : 'glock',
    link: null, linkState: '', lastLocal: 0, count: 0, sendT: 0, friendWeapon: null,
  };
  if (Q.get('game')) G.pick = Q.get('game') === 'range' ? 'range' : 'hf';
  if (byId[Q.get('weapon')]) G.weapon = Q.get('weapon');
  const recoil = { L: { o: V(), v: V() }, R: { o: V(), v: V() } };
  const pan = p => THREE.MathUtils.clamp(p.clone().project(cam).x, -1, 1);

  function contact(c, remote = false) {
    fx.burst(c.point, c.strength, c.kind);
    audio.play(c.kind, c.strength, pan(c.point));
    G.count++;
    if (!remote) {
      recoil[c.a].v.addScaledVector(c.dir, -(0.5 + 1.1 * c.strength));
      if (!G.link || G.linkState !== 'open') partner.hit(c.b, c.dir.clone().multiplyScalar(0.6 + 1.6 * c.strength));
    }
  }
  const clapper = createClapper({
    onContact: c => {
      G.lastLocal = performance.now();
      contact(c);
      G.link?.sendEvent({ t: 'contact', kind: c.kind, s: c.strength, p: c.point.toArray(), d: c.dir.toArray(), a: c.a, b: c.b });
    },
  });

  let rangeScene = null, range = null, shooting = null;
  const myP = () => (G.mode === 'guest' ? 2 : 1);
  const friendP = () => (G.mode === 'guest' ? 1 : 2);
  function ensureRange() {
    if (range) return;
    rangeScene = new THREE.Scene();
    rangeScene.environment = studio.environment;
    rangeScene.environmentIntensity = 0.55;
    range = buildRange(rangeScene, myP(), G.mode === 'solo' ? 3 : 4);
    shooting = createShooting({ scene: rangeScene, range, audio, cam, me, ctrl, them, partner, calib, myP: myP(), send: m => G.link?.sendEvent(m) });
    if (G.friendWeapon) shooting.remote({ t: 'weapon', w: G.friendWeapon });
  }

  function setGame(game, broadcast = true) {
    if (G.game === game) return;
    G.game = game;
    if (game === 'range') {
      ensureRange();
      rangeScene.add(me.root, them.root);
      scene = rangeScene;
      ctrl.setMode('range');
      partner.place('lane', (myP() - friendP()) * LANE_W);
      shooting.enter(G.weapon);
      G.rangeT = 0;
      cam.fov = 55;
      cam.updateProjectionMatrix();
    } else {
      shooting?.exit();
      studio.add(me.root, them.root);
      scene = studio;
      ctrl.setMode('hf');
      partner.place('face');
      cam.fov = 70;
      cam.updateProjectionMatrix();
      if (G.zeroShown) { G.zeroShown = false; show(''); }
    }
    store.set(GAME_KEY, game);
    if (broadcast) G.link?.sendEvent({ t: 'mode', game });
    syncUi();
  }

  function onRemoteEvent(m) {
    if (m.t === 'mode') { if (m.game === 'hf' || m.game === 'range') setGame(m.game, false); return; }
    if (m.t === 'weapon') { G.friendWeapon = m.w; shooting?.remote(m); return; }
    if (m.t === 'contact') {
      if (G.game !== 'hf' || performance.now() - G.lastLocal < 260) return;
      const p = V(-m.p[0], m.p[1], GAP - m.p[2]), d = V(m.d[0], m.d[1], -m.d[2]).multiplyScalar(-1);
      contact({ kind: m.kind, strength: m.s, point: p, dir: d, a: m.b, b: m.a }, true);
      return;
    }
    if (G.game === 'range') shooting?.remote(m);
  }

  function buildGuns(el, onPick) {
    el.innerHTML = '';
    WEAPONS.forEach((w, i) => {
      const b = document.createElement('button');
      b.dataset.id = w.id;
      b.innerHTML = `${w.name}<small>${w.finger ? 'pew pew' : `${w.mag} rounds · ${w.auto ? 'auto' : 'semi'}`}</small>`;
      b.title = `Key ${i + 1}`;
      b.onclick = () => onPick(w.id);
      el.appendChild(b);
    });
  }
  function markGuns() {
    for (const el of [$('menuGuns'), $('pickGuns')]) for (const b of el.children) b.classList.toggle('on', b.dataset.id === G.weapon);
  }
  function pickWeapon(id) {
    G.weapon = id;
    store.set(GUN_KEY, id);
    if (shooting?.active) shooting.equip(id);
    markGuns();
    syncUi();
  }
  function openPicker() { if (G.state !== 'play') return; G.picker = true; G.zeroShown = false; markGuns(); show('picker'); }
  function closePicker() { G.picker = false; show(''); }
  buildGuns($('menuGuns'), pickWeapon);
  buildGuns($('pickGuns'), id => { pickWeapon(id); closePicker(); });
  $('pickClose').onclick = closePicker;
  $('gunChip').onclick = openPicker;

  function setPick(game) {
    G.pick = game;
    store.set(GAME_KEY, game);
    for (const b of $('menuSeg').children) b.classList.toggle('on', b.dataset.game === game);
    $('menu').classList.toggle('range', game === 'range');
    $('menuSub').textContent = game === 'range' ? 'Shoot at a range with finger guns. Your webcam moves Optimus.' : 'High-five a robot with your real hands. Your webcam moves Optimus.';
    $('soloSmall').textContent = game === 'range' ? 'your own lane' : 'a robot holds its hands up';
  }
  for (const b of $('menuSeg').children) b.onclick = () => setPick(b.dataset.game);
  for (const b of $('gameSeg').children) b.onclick = () => { if (G.state === 'play') setGame(b.dataset.game); };
  setPick(G.pick);
  markGuns();

  function syncUi() {
    $('bar').classList.toggle('on', G.started);
    for (const b of $('gameSeg').children) b.classList.toggle('on', b.dataset.game === G.game);
    $('gunChip').classList.toggle('on', G.game === 'range');
    $('gunName').textContent = byId[G.weapon].name;
  }

  function rangeUi() {
    const hint = $('hint');
    if (G.game !== 'range' || !shooting) { hint.classList.remove('on'); return; }
    const h = shooting.hud();
    $('gunName').textContent = h.weapon;
    for (const a of h.ammo) {
      const el = $('ammo' + a.side);
      el.textContent = `${a.side} ${a.reloading ? '···' : h.finger ? '∞' : a.ammo}`;
      el.classList.toggle('dim', !a.live);
    }
    if (G.state === 'play' && !G.picker) {
      if (h.zero !== null) {
        if (!$('calib').classList.contains('on')) show('calib');
        $('calibStep').textContent = 'Aim';
        $('calibText').textContent = 'Make finger guns and point them at the target in the middle';
        $('calibBar').firstElementChild.style.width = `${h.zero * 100}%`;
        G.zeroShown = true;
      } else if (G.zeroShown) { G.zeroShown = false; show(''); }
    }
    const want = G.state === 'play' && h.zero === null && h.hint && G.rangeT < 40;
    if (want) {
      hint.textContent = 'Make a finger gun, move your hand to aim, drop your thumb or flick up to shoot';
      hint.classList.add('on');
      hint.classList.remove('fade');
    } else if (hint.classList.contains('on')) hint.classList.add('fade');
  }

  let hands = null;
  const preview = $('preview');
  async function ensureHands() {
    if (hands) return hands;
    const video = document.createElement('video');
    try {
      hands = await createHands({ video, onStatus: t => { $('calibText').textContent = t; } });
    } catch (e) {
      notice(e?.name === 'NotAllowedError' ? 'Robotea needs your camera to see your hands. Allow camera access and reload the page.' : 'Could not start the camera or hand tracking: ' + (e?.message || e));
      throw e;
    }
    return hands;
  }

  const cs = { step: 0, hold: 0, acc: null, max: 0, min: 9, t: 0 };
  function startCalibration() {
    G.state = 'calib';
    G.picker = false;
    G.zeroShown = false;
    Object.assign(cs, { step: 0, hold: 0, acc: null, max: 0, min: 9, t: 0 });
    show('calib');
    preview.classList.add('on');
  }
  function calibrate(dt) {
    cs.t += dt;
    const both = hands.L.seen && hands.R.seen && hands.L.s && hands.R.s;
    const texts = ['Hold both hands up, palms facing the screen', 'Push both hands toward the screen', 'Now pull them back toward you'];
    $('calibStep').textContent = `Step ${cs.step + 1} of 3`;
    $('calibText').textContent = both ? texts[cs.step] : 'Show both hands to the camera';
    if (!both) { cs.hold = Math.max(0, cs.hold - dt); $('calibBar').firstElementChild.style.width = `${cs.hold / 1.2 * 100}%`; return; }
    const avg = (hands.L.s.size + hands.R.s.size) / 2;
    const base = () => (calib.neutral.L.size + calib.neutral.R.size) / 2;
    if (cs.step === 0) {
      cs.hold += dt;
      cs.acc ||= { L: { cx: 0, cy: 0, size: 0, n: 0 }, R: { cx: 0, cy: 0, size: 0, n: 0 } };
      for (const side of ['L', 'R']) {
        const a = cs.acc[side], s = hands[side].s;
        a.cx += s.cx; a.cy += s.cy; a.size += s.size; a.n++;
        a.q = handBasis(side, V(...s.finger), V(...s.palm));
      }
      if (cs.hold >= 1.2) {
        for (const side of ['L', 'R']) {
          const a = cs.acc[side];
          Object.assign(calib.neutral[side], { cx: a.cx / a.n, cy: a.cy / a.n, size: a.size / a.n, q: a.q });
        }
        Object.assign(cs, { step: 1, hold: 0, t: 0, max: avg });
      }
    } else if (cs.step === 1) {
      cs.max = Math.max(cs.max, avg);
      if (avg > base() * 1.22) cs.hold += dt; else cs.hold = Math.max(0, cs.hold - dt * 0.5);
      if (cs.hold >= 0.7 || cs.t > 7) { calib.near = Math.max(cs.max, base() * 1.3); Object.assign(cs, { step: 2, hold: 0, t: 0, min: avg }); }
    } else {
      cs.min = Math.min(cs.min, avg);
      if (avg < base() * 0.84) cs.hold += dt; else cs.hold = Math.max(0, cs.hold - dt * 0.5);
      if (cs.hold >= 0.7 || cs.t > 7) {
        calib.far = Math.min(cs.min, base() * 0.78);
        calib.done = true;
        saveCalibration(calib);
        startPlay(true);
      }
    }
    $('calibBar').firstElementChild.style.width = `${Math.min(1, cs.hold / (cs.step === 0 ? 1.2 : 0.7)) * 100}%`;
  }

  function setRoomText() {
    const chip = $('room');
    if (!G.link) { chip.classList.remove('on'); return; }
    const t = { waiting: 'waiting for your friend', searching: 'looking for the room', connecting: 'connecting', open: 'connected', lost: 'friend left, the robot stands in', failed: 'could not connect, the robot stands in', offline: 'no connection to the room server' }[G.linkState] || '';
    chip.innerHTML = `<b>${G.link.code}</b><span>${G.game === 'range' && G.linkState !== 'open' ? t.replace(', the robot stands in', '') : t}</span>`;
    chip.classList.add('on');
  }

  function startPlay(recalibrated = false) {
    G.state = 'play';
    show('');
    preview.classList.add('on');
    if (!G.started) {
      G.started = true;
      setGame(G.pick);
    } else if (recalibrated && G.game === 'range') shooting.rezero();
    if (G.mode !== 'solo' && !G.link) {
      G.link = createLink({
        code: G.code, host: G.mode === 'host',
        onState: s => {
          G.linkState = s;
          setRoomText();
          if (s === 'open') {
            if (G.mode === 'host') G.link.sendEvent({ t: 'mode', game: G.game });
            G.link.sendEvent({ t: 'weapon', w: shooting?.weapon || G.weapon });
          }
        },
        onPose: buf => { const s = unpackPose(buf, THREE); if (s) partner.setRemote(s); },
        onEvent: onRemoteEvent,
      });
      setRoomText();
    }
    syncUi();
  }

  async function begin(mode, code) {
    G.mode = mode;
    G.code = code;
    audio.resume();
    show('calib');
    $('calibStep').textContent = 'Camera';
    $('calibText').textContent = 'Starting the camera…';
    preview.classList.add('on');
    await ensureHands();
    if (calib.done && !Q.has('recalibrate')) startPlay();
    else startCalibration();
  }

  $('btnSolo').onclick = () => begin('solo');
  $('btnHost').onclick = () => begin('host', makeCode());
  $('btnJoin').onclick = () => {
    const c = cleanCode($('codeIn').value);
    if (c.length !== 5) { $('codeIn').focus(); $('codeIn').classList.add('bad'); return; }
    begin('guest', c);
  };
  $('codeIn').addEventListener('input', e => { e.target.value = cleanCode(e.target.value); e.target.classList.remove('bad'); });
  $('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'd') $('hud').classList.toggle('on');
    if (k === 'escape') { if (G.picker) return closePicker(); G.link?.close(); location.reload(); }
    if (G.state !== 'play') return;
    if (k === 'c') startCalibration();
    if (k === 'm') setGame(G.game === 'range' ? 'hf' : 'range');
    if (G.game !== 'range') return;
    if (k >= '1' && k <= String(WEAPONS.length)) pickWeapon(WEAPONS[+k - 1].id);
    if (k === 'n') shooting.clearMine();
    if (k === 'r') { shooting.reload('L'); shooting.reload('R'); }
    if (k === 'g') G.picker ? closePicker() : openPicker();
  });

  let selftest = null;
  if (Q.get('selftest')) {
    const m = await import('../Niepotrzebne/tools/selftest.js');
    G.state = 'play';
    G.started = true;
    if (Q.has('autostart')) G.mode = Q.get('mode') || 'solo';
    if (Q.get('selftest') === 'range') {
      setGame('range');
      shooting.skipZero();
      selftest = m.createRangeBot({ ctrl, shooting, cycle: Q.has('cycle'), both: !Q.has('one') });
    } else selftest = m.createSelftest({ ctrl, partner, G });
  }

  const hud = $('hud');
  const info = window.__info = {};
  let last = performance.now(), frames = 0, fpsT = last, fps = 0, uiT = 0;
  const poseBuf = new Float32Array(29);
  const view = VIEWS[Q.get('view')];

  function step(now) {
    const dt = Math.min(Math.max((now - last) / 1000, 0.001), 1 / 30);
    last = now;
    hands?.poll(now);
    if (G.state === 'calib' && hands) calibrate(dt);
    selftest?.update(dt);
    const live = (G.state === 'play' || G.state === 'calib') && hands;
    ctrl.update(live ? hands : null, dt);
    partner.update(dt);
    if (G.game === 'range') {
      G.rangeT += dt;
      shooting.update(dt, G.state === 'play' && !G.picker ? hands : null);
      range.update(dt);
    } else {
      for (const side of ['L', 'R']) {
        const r = recoil[side];
        r.v.addScaledVector(r.o, -80 * dt).multiplyScalar(Math.exp(-dt * 10));
        r.o.addScaledVector(r.v, dt);
      }
      const push = clapper.update(me, ctrl.st, them, partner.st.curls, dt, now);
      for (const side of ['L', 'R']) ctrl.st.adjust[side].copy(recoil[side].o).add(push[side].multiplyScalar(1.2));
    }
    ctrl.camera(cam);
    if (G.game === 'range') shooting.applyShake(cam, dt);
    else fx.update(dt, cam);
    if (view) { cam.position.copy(view[0]); cam.lookAt(view[1]); }
    if (G.link && now - G.sendT > 33) { G.sendT = now; G.link.sendPose(packPose(ctrl.snapshot(), poseBuf)); }
    renderer.render(scene, cam);
    if (hands && preview.classList.contains('on')) hands.drawPreview(preview);
    frames++;
    if (now - fpsT > 1000) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; }
    uiT += dt;
    if (uiT > 0.1) { uiT = 0; rangeUi(); }
    Object.assign(info, {
      state: G.state, game: G.game, mode: G.mode, link: G.linkState, remotePose: partner.st.remoteAge < 0.5, fps: +fps.toFixed(1), contacts: G.count,
      seen: hands ? [hands.L.seen, hands.R.seen] : null, handFps: hands ? +hands.fps.toFixed(1) : 0,
      closure: [+ctrl.st.closure.L.toFixed(2), +ctrl.st.closure.R.toFixed(2)],
      weapon: shooting?.weapon, friendShots: shooting?.stats.remote, shots: shooting?.stats.shots, hits: shooting?.stats.hits, paper: shooting?.stats.paper, gong: shooting?.stats.gong, lastScore: shooting?.stats.last,
      calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
    });
    if (hud.classList.contains('on')) hud.textContent = Object.entries(info).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
    requestAnimationFrame(step);
  }

  if (TEST) calib.done = true;
  show(selftest ? '' : 'menu');
  syncUi();
  requestAnimationFrame(step);
  if (Q.has('autostart')) begin(Q.get('mode') || 'solo', Q.get('code') ? cleanCode(Q.get('code')) : makeCode());
  window.__ready = true;
}

main().catch(e => { console.error(e); notice('Something went wrong while loading: ' + (e?.message || e)); });
