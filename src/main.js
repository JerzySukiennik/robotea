// Robotea: high-five game bootstrap and loop (studio, first-person Optimus, partner robot, hand tracking, contact, sound, online link)
import * as THREE from 'three';
import { buildStudio } from './studio.js';
import { makeMaterials, createRobot } from './optimus.js';
import { createController } from './robot.js';
import { createPartner, GAP } from './partner.js';
import { createHands, createCalibration } from './hands.js';
import { handBasis } from './pose.js';
import { createClapper } from './clap.js';
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

  const scene = new THREE.Scene();
  await buildStudio(renderer, scene);
  const me = createRobot(makeMaterials('white'));
  const them = createRobot(makeMaterials('graphite'));
  scene.add(me.root, them.root);
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
  const fx = createFx(scene);

  const G = { state: 'menu', mode: 'solo', link: null, linkState: '', lastLocal: 0, count: 0, sendT: 0 };
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

  function onRemoteEvent(m) {
    if (m.t !== 'contact' || performance.now() - G.lastLocal < 260) return;
    const p = V(-m.p[0], m.p[1], GAP - m.p[2]), d = V(m.d[0], m.d[1], -m.d[2]).multiplyScalar(-1);
    contact({ kind: m.kind, strength: m.s, point: p, dir: d, a: m.b, b: m.a }, true);
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
        startPlay();
      }
    }
    $('calibBar').firstElementChild.style.width = `${Math.min(1, cs.hold / (cs.step === 0 ? 1.2 : 0.7)) * 100}%`;
  }

  function setRoomText() {
    const chip = $('room');
    if (!G.link) { chip.classList.remove('on'); return; }
    const t = { waiting: 'waiting for your friend', searching: 'looking for the room', connecting: 'connecting', open: 'connected', lost: 'friend left, the robot stands in', failed: 'could not connect, the robot stands in', offline: 'no connection to the room server' }[G.linkState] || '';
    chip.innerHTML = `<b>${G.link.code}</b><span>${t}</span>`;
    chip.classList.add('on');
  }

  function startPlay() {
    G.state = 'play';
    show('');
    preview.classList.add('on');
    if (G.mode !== 'solo' && !G.link) {
      G.link = createLink({
        code: G.code, host: G.mode === 'host',
        onState: s => { G.linkState = s; setRoomText(); },
        onPose: buf => { const s = unpackPose(buf, THREE); if (s) partner.setRemote(s); },
        onEvent: onRemoteEvent,
      });
      setRoomText();
    }
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
    if (e.key === 'c' && G.state === 'play') startCalibration();
    if (e.key === 'd') $('hud').classList.toggle('on');
    if (e.key === 'Escape') { G.link?.close(); location.reload(); }
  });

  let selftest = null;
  if (Q.get('selftest')) {
    const m = await import('../Niepotrzebne/tools/selftest.js');
    selftest = m.createSelftest({ ctrl, partner, G });
    G.state = 'play';
  }

  const hud = $('hud');
  const info = window.__info = {};
  let last = performance.now(), frames = 0, fpsT = last, fps = 0;
  const poseBuf = new Float32Array(29);

  function step(now) {
    const dt = Math.min(Math.max((now - last) / 1000, 0.001), 1 / 30);
    last = now;
    hands?.poll(now);
    if (G.state === 'calib' && hands) calibrate(dt);
    selftest?.update(dt);
    for (const side of ['L', 'R']) {
      const r = recoil[side];
      r.v.addScaledVector(r.o, -80 * dt).multiplyScalar(Math.exp(-dt * 10));
      r.o.addScaledVector(r.v, dt);
    }
    const live = (G.state === 'play' || G.state === 'calib') && hands;
    ctrl.update(live ? hands : null, dt);
    partner.update(dt);
    const push = clapper.update(me, ctrl.st, them, partner.st.curls, dt, now);
    for (const side of ['L', 'R']) ctrl.st.adjust[side].copy(recoil[side].o).add(push[side].multiplyScalar(1.2));
    ctrl.camera(cam);
    fx.update(dt, cam);
    if (G.link && now - G.sendT > 33) { G.sendT = now; G.link.sendPose(packPose(ctrl.snapshot(), poseBuf)); }
    renderer.render(scene, cam);
    if (hands && preview.classList.contains('on')) hands.drawPreview(preview);
    frames++;
    if (now - fpsT > 1000) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; }
    Object.assign(info, {
      state: G.state, mode: G.mode, link: G.linkState, remotePose: partner.st.remoteAge < 0.5, fps: +fps.toFixed(1), contacts: G.count,
      seen: hands ? [hands.L.seen, hands.R.seen] : null, handFps: hands ? +hands.fps.toFixed(1) : 0,
      closure: [+ctrl.st.closure.L.toFixed(2), +ctrl.st.closure.R.toFixed(2)],
    });
    if (hud.classList.contains('on')) hud.textContent = Object.entries(info).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
    requestAnimationFrame(step);
  }

  if (TEST) calib.done = true;
  show(selftest ? '' : 'menu');
  requestAnimationFrame(step);
  if (Q.has('autostart')) begin(Q.get('mode') || 'solo', Q.get('code') ? cleanCode(Q.get('code')) : makeCode());
  window.__ready = true;
}

main().catch(e => { console.error(e); notice('Something went wrong while loading: ' + (e?.message || e)); });
