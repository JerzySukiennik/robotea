// Robotea: game bootstrap and loop (kitchen, first-person Optimus, hand tracking, physics, GPU water, tea rules and UI)
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { STYLES } from './styles.js';
import { buildKitchen, optimizeStatic, K } from './kitchen.js';
import { configureTextures, texturesReady, orderNote, paintLcd } from './textures.js';
import { makeMaterials, createRobot } from './optimus.js';
import { createController } from './robot.js';
import { createHands, createCalibration } from './hands.js';
import { handBasis } from './pose.js';
import { initPhysics, createPhysics, RAPIER } from './physics.js';
import { createFluid, collider, SPACING, PARTICLE_ML } from './fluid.js';
import { createWaterRenderer } from './water.js';
import { randomOrder, orderLines, measure, spillStats, rate, KIND_ID, SPOON_PARTICLES } from './tea.js';

const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const TEST = Q.has('test');
const show = id => { for (const l of document.querySelectorAll('.layer')) l.classList.toggle('on', l.id === id); };
const status = t => { $('bootText').textContent = t; };
const notice = t => { $('noticeText').textContent = t; show('notice'); };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function loadCalibration() {
  const c = createCalibration();
  try {
    const raw = JSON.parse(localStorage.getItem('robotea.calib.v2') || 'null');
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
    localStorage.setItem('robotea.calib.v2', JSON.stringify({ neutral: { L: n('L'), R: n('R') }, near: c.near, far: c.far }));
  } catch {}
}

async function main() {
  const coarse = matchMedia('(pointer: coarse)').matches && innerWidth < 1100;
  if (coarse && !TEST) return notice('Open Robotea on a computer with a webcam. You need both hands free in front of the camera.');
  if (!navigator.gpu) return notice('Robotea needs WebGPU to simulate the water. Use Chrome, Brave or Edge, or Safari 26 on a Mac.');

  configureTextures({ root: './', anisotropy: 8 });
  await document.fonts.load('600 60px "Jurek Hand"').catch(() => {});
  status('Setting the table…');

  const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: false, powerPreference: 'high-performance' });
  const dpr = Math.min(devicePixelRatio, Q.has('dpr') ? +Q.get('dpr') : 1.25);
  renderer.setPixelRatio(dpr);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const style = STYLES.find(s => s.id === (Q.get('style') || 'morning-concrete')) || STYLES[3];
  renderer.toneMapping = style.tone === 'neutral' ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = style.exposure;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0e10);
  const order = randomOrder();
  const kit = buildKitchen(style, { order: orderLines(order), temp: '--°C' });
  scene.add(kit.group);
  const hdr = await new RGBELoader().loadAsync(`assets/hdri/${style.hdri}.hdr`);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromEquirectangular(hdr).texture;
  scene.environmentIntensity = style.env;

  const robot = createRobot(makeMaterials('white'));
  scene.add(robot.root);
  const calib = loadCalibration();
  const ctrl = createController(robot, calib);
  const cam = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.03, 30);
  ctrl.update(null, 1 / 60);
  ctrl.camera(cam);

  status('Plumbing the sink…');
  await initPhysics();
  const phys = createPhysics(kit);
  const P0 = kit.parts;
  const opt = optimizeStatic(kit.group, [P0.kettle, ...P0.mugs, P0.spoon, ...P0.bags.flatMap(b => [b.mesh, b.tag]), ...P0.doors, P0.knob.userData.head]);
  console.log('static merge', JSON.stringify(opt));

  status('Filling the water simulation…');
  let fluid;
  try { fluid = await createFluid({ maxParticles: 16384 }); }
  catch (e) { return notice('WebGPU could not start on this computer (' + e.message + '). Try Chrome or Brave with hardware acceleration on.'); }
  const S = K.sink, top = K.top, t = K.thick, sy0 = top - t - S.depth;
  fluid.zones.drain = [(S.x0 + S.x1) / 2, sy0, (S.z0 + S.z1) / 2 + 0.05, 0.03];
  fluid.zones.floorY = 0.012;
  fluid.zones.bagRate = 0.012;
  fluid.zones.bagRadius = 0.03;
  const M4 = (x, y, z, q) => new THREE.Matrix4().compose(V(x, y, z), q || new THREE.Quaternion(), V(1, 1, 1));
  const statics = [
    collider('box', M4((K.x0 + S.x0) / 2, top - t / 2, (K.front + K.back) / 2), [(S.x0 - K.x0) / 2, t / 2, (K.back - K.front) / 2], { radius: 1.2 }),
    collider('box', M4((S.x1 + K.x1) / 2, top - t / 2, (K.front + K.back) / 2), [(K.x1 - S.x1) / 2, t / 2, (K.back - K.front) / 2], { radius: 0.4 }),
    collider('box', M4((S.x0 + S.x1) / 2, top - t / 2, (K.front + S.z0) / 2), [(S.x1 - S.x0) / 2, t / 2, (S.z0 - K.front) / 2], { radius: 0.3 }),
    collider('box', M4((S.x0 + S.x1) / 2, top - t / 2, (S.z1 + K.back) / 2), [(S.x1 - S.x0) / 2, t / 2, (K.back - S.z1) / 2], { radius: 0.3 }),
    collider('box', M4((S.x0 + S.x1) / 2, sy0 - 0.01, (S.z0 + S.z1) / 2), [(S.x1 - S.x0) / 2, 0.012, (S.z1 - S.z0) / 2], { radius: 0.35 }),
    collider('box', M4(S.x0 - 0.006, sy0 + S.depth / 2, (S.z0 + S.z1) / 2), [0.008, S.depth / 2, (S.z1 - S.z0) / 2], { radius: 0.3 }),
    collider('box', M4(S.x1 + 0.006, sy0 + S.depth / 2, (S.z0 + S.z1) / 2), [0.008, S.depth / 2, (S.z1 - S.z0) / 2], { radius: 0.3 }),
    collider('box', M4((S.x0 + S.x1) / 2, sy0 + S.depth / 2, S.z0 - 0.006), [(S.x1 - S.x0) / 2, S.depth / 2, 0.008], { radius: 0.3 }),
    collider('box', M4((S.x0 + S.x1) / 2, sy0 + S.depth / 2, S.z1 + 0.006), [(S.x1 - S.x0) / 2, S.depth / 2, 0.008], { radius: 0.3 }),
    collider('box', M4(0, 1.5, K.wallZ + 0.07), [1.4, 1.5, 0.07], { radius: 2.2 }),
    collider('box', M4(0, (top - t) / 2, K.front + 0.03), [K.x1, (top - t) / 2, 0.012], { radius: 1.2 }),
    collider('plane', M4(0, 0, 0), [0, 0, 0, 0], { radius: 50 }),
    collider('cylinder', M4(K.kettle.x, top + 0.0135, K.kettle.z), [0.09, 0.0135], { radius: 0.12 }),
    collider('cup', M4(K.sugar.x, top, K.sugar.z), [0.0515, 0.056, 0.006, 0.012], { radius: 0.1 }),
    collider('cup', M4(K.bin.x, top, K.bin.z), [0.088, 0.208, 0.007, 0.01], { radius: 0.25 }),
    collider('box', M4(K.tray.x, top + 0.006, K.tray.z), [0.18, 0.006, 0.125], { radius: 0.25 }),
    collider('box', M4(K.tray.x, top + 0.013, K.tray.z + 0.119), [0.18, 0.013, 0.006], { radius: 0.2 }),
    collider('box', M4(K.tray.x, top + 0.013, K.tray.z - 0.119), [0.18, 0.013, 0.006], { radius: 0.2 }),
    collider('box', M4(K.tray.x + 0.174, top + 0.013, K.tray.z), [0.006, 0.013, 0.125], { radius: 0.15 }),
    collider('box', M4(K.tray.x - 0.174, top + 0.013, K.tray.z), [0.006, 0.013, 0.125], { radius: 0.15 }),
    collider('box', M4(K.chest.x, top + 0.035, K.chest.z), [0.1275, 0.035, 0.0575], { radius: 0.16 }),
    collider('box', M4(K.timer.x, top + 0.025, K.timer.z), [0.037, 0.025, 0.018], { radius: 0.06 }),
    collider('cylinder', M4(K.bell.x, top + 0.03, K.bell.z), [0.042, 0.03], { radius: 0.06 }),
    collider('cylinder', M4(K.knob.x, top + 0.04, K.knob.z), [0.03, 0.03], { radius: 0.06 }),
  ];
  const tapTip = V(K.tap.x, top + 0.2135, K.tap.z - 0.207);
  const disc = [];
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
    const px = (x + (y % 2 ? 0.5 : 0)) * SPACING * 1.08, pz = y * SPACING * 1.08 * 0.866;
    if (px * px + pz * pz <= 0.0135 * 0.0135) disc.push([px, pz]);
  }

  status('Pouring light through the window…');
  await texturesReady();
  const water = createWaterRenderer(renderer, fluid, { envTexture: hdr });
  const sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(4, 4) });
  const compRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), style.bloom, 0.45, 0.92);
  const output = new OutputPass();
  output.renderToScreen = true;
  const sunDir = V(2.6, 3.5, 3.4).sub(V(0.2, top, 0.45)).normalize();
  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    const w = Math.floor(innerWidth * dpr), h = Math.floor(innerHeight * dpr);
    sceneRT.setSize(w, h);
    compRT.setSize(w, h);
    bloom.setSize(w, h);
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);
  renderer.compile(scene, cam);

  const parts = kit.parts;
  const baseUI = parts.kettleBase.userData;
  const timerScreen = parts.timer.userData.screen;
  const lid = parts.kettle.userData.lid;
  const lidKnob = lid.children[1];
  const noteMesh = parts.note.children[0];

  const G = {
    state: 'menu', order, t0: 0, elapsed: 0, broken: 0,
    heaterOn: false, lidOpen: true, lidAngle: -1.35, sugarLoaded: false, tapAcc: 0,
    brewOn: false, brewT: 0, greenTemp: null, kettle: { ml: 0, temp: 21 },
    cool: { button: 0, bell: 0, lid: 0 }, shards: [], lastKettleText: '', lastTimerText: '',
    handPrev: { L: [], R: [] },
  };
  function setNote(o) {
    const old = noteMesh.material.map;
    noteMesh.material.map = orderNote(orderLines(o));
    noteMesh.material.needsUpdate = true;
    old?.dispose();
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

  const calibState = { step: 0, hold: 0, acc: null, max: 0, min: 9, t: 0 };
  function startCalibration() {
    G.state = 'calib';
    Object.assign(calibState, { step: 0, hold: 0, acc: null, max: 0, min: 9, t: 0 });
    show('calib');
    preview.classList.add('on');
  }
  function calibrate(dt) {
    const c = calibState;
    c.t += dt;
    const both = hands.L.seen && hands.R.seen && hands.L.s && hands.R.s;
    const texts = ['Hold both hands up in front of the camera, relaxed', 'Push both hands toward the screen', 'Now pull them back toward you'];
    $('calibStep').textContent = `Step ${c.step + 1} of 3`;
    $('calibText').textContent = both ? texts[c.step] : 'Show both hands to the camera';
    if (!both) { c.hold = Math.max(0, c.hold - dt); $('calibBar').firstElementChild.style.width = `${c.hold / 1.2 * 100}%`; return; }
    const avg = (hands.L.s.size + hands.R.s.size) / 2;
    if (c.step === 0) {
      c.hold += dt;
      c.acc ||= { L: { cx: 0, cy: 0, size: 0, n: 0 }, R: { cx: 0, cy: 0, size: 0, n: 0 } };
      for (const side of ['L', 'R']) {
        const a = c.acc[side], s = hands[side].s;
        a.cx += s.cx; a.cy += s.cy; a.size += s.size; a.n++;
        a.q = handBasis(side, V(...s.finger), V(...s.palm));
      }
      if (c.hold >= 1.2) {
        for (const side of ['L', 'R']) {
          const a = c.acc[side];
          Object.assign(calib.neutral[side], { cx: a.cx / a.n, cy: a.cy / a.n, size: a.size / a.n, q: a.q });
        }
        c.step = 1; c.hold = 0; c.t = 0; c.max = avg;
      }
    } else if (c.step === 1) {
      c.max = Math.max(c.max, avg);
      const base = (calib.neutral.L.size + calib.neutral.R.size) / 2;
      if (avg > base * 1.22) c.hold += dt; else c.hold = Math.max(0, c.hold - dt * 0.5);
      if (c.hold >= 0.7 || c.t > 7) { calib.near = Math.max(c.max, base * 1.3); c.step = 2; c.hold = 0; c.t = 0; c.min = avg; }
    } else {
      c.min = Math.min(c.min, avg);
      const base = (calib.neutral.L.size + calib.neutral.R.size) / 2;
      if (avg < base * 0.84) c.hold += dt; else c.hold = Math.max(0, c.hold - dt * 0.5);
      if (c.hold >= 0.7 || c.t > 7) {
        calib.far = Math.min(c.min, base * 0.78);
        calib.done = true;
        saveCalibration(calib);
        startPlay();
      }
    }
    $('calibBar').firstElementChild.style.width = `${Math.min(1, c.hold / (c.step === 0 ? 1.2 : 0.7)) * 100}%`;
  }

  function startPlay() {
    G.state = 'play';
    G.t0 = performance.now();
    show('');
    preview.classList.add('on');
  }

  async function begin() {
    show('calib');
    $('calibStep').textContent = 'Camera';
    $('calibText').textContent = 'Starting the camera…';
    preview.classList.add('on');
    await ensureHands();
    if (calib.done && !Q.has('recalibrate')) startPlay();
    else startCalibration();
  }

  $('btnSolo').onclick = () => begin();
  for (const id of ['btnTrain', 'btnDuo', 'btnBoard']) { const b = $(id); b.disabled = true; b.querySelector('small').textContent = 'coming next'; }
  $('btnAgain').onclick = () => { sessionStorage.setItem('robotea.again', '1'); location.reload(); };
  $('btnMenu').onclick = () => location.reload();
  addEventListener('keydown', e => {
    if (e.key === 'c' && G.state === 'play') startCalibration();
    if (e.key === 'd') $('hud').classList.toggle('on');
    if (e.key === 'Escape') location.reload();
  });

  function tipWorld(part) { return V(0, -part.len, 0).applyQuaternion(part.quat).add(part.pos); }

  function breakMug(o) {
    o.broken = true;
    o.obj.visible = false;
    const t = o.body.translation(), v = o.body.linvel();
    phys.world.removeRigidBody(o.body);
    const mat = o.obj.children[0].material;
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2, hgt = 0.02 + (i % 3) * 0.03;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.03 + Math.random() * 0.02, 0.03 + Math.random() * 0.03, 0.005), mat);
      m.castShadow = true;
      const p = V(t.x + Math.cos(a) * 0.035, t.y + hgt, t.z + Math.sin(a) * 0.035);
      m.position.copy(p);
      m.rotation.y = -a;
      scene.add(m);
      const b = phys.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setRotation(m.quaternion).setLinvel(v.x * 0.3 + Math.cos(a) * 0.8, 0.9 + Math.random(), v.z * 0.3 + Math.sin(a) * 0.8).setCcdEnabled(true));
      phys.world.createCollider(RAPIER.ColliderDesc.cuboid(0.018, 0.022, 0.003).setFriction(0.7), b);
      G.shards.push({ m, b });
    }
    G.broken++;
    if (G.broken >= 3 && G.state === 'play') finish(true);
  }

  function kettleSeated() {
    const b = phys.kettle.body, p = b.translation(), r = b.rotation();
    const up = V(0, 1, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).y;
    return Math.hypot(p.x - K.kettle.x, p.z - K.kettle.z) < 0.035 && Math.abs(p.y - (top + 0.027)) < 0.02 && up > 0.96 && !phys.kettle.held;
  }

  function cupOnTray() {
    const cx = K.tray.x + 0.03, cz = K.tray.z + 0.01;
    let best = null, bd = 0.1;
    for (const m of phys.mugs) {
      if (m.broken || m.held) continue;
      const p = m.body.translation();
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d < bd && p.y < top + 0.05) { bd = d; best = m; }
    }
    return best;
  }

  function insideAnyContainer(x, y, z) {
    const p = V(x, y, z);
    for (const o of [phys.kettle, ...phys.mugs.filter(m => !m.broken)]) {
      const l = p.clone().applyMatrix4(new THREE.Matrix4().copy(o.obj.matrixWorld).invert());
      const r = o.kind === 'kettle' ? 0.08 : 0.042;
      if (l.y > -0.01 && l.y < (o.kind === 'kettle' ? 0.21 : 0.11) && l.x * l.x + l.z * l.z < r * r) return true;
    }
    return x > S.x0 && x < S.x1 && z > S.z0 && z < S.z1 && y < top;
  }

  function finish(outOfMugs = false) {
    if (G.state !== 'play') return;
    G.state = 'result';
    const secs = (performance.now() - G.t0) / 1000;
    const m = outOfMugs ? null : cupOnTray();
    const cup = m ? measure(fluid, m.obj, { r: 0.037, y0: 0.008, y1: 0.105 }) : { n: 0, ml: 0, temp: 0, tea: 0, spoons: 0, kind: 0 };
    let bagIn = false;
    if (m) for (const b of phys.bags) {
      const l = V().copy(b.obj.position).applyMatrix4(new THREE.Matrix4().copy(m.obj.matrixWorld).invert());
      if (l.y > 0 && l.y < 0.1 && Math.hypot(l.x, l.z) < 0.04) bagIn = true;
    }
    const spilled = spillStats(fluid, insideAnyContainer).ml;
    const res = rate(G.order, cup, { greenTemp: G.greenTemp, bagIn, spilled, broken: G.broken, seconds: secs });
    if (outOfMugs) { res.stars = 1; res.verdict = 'Out of mugs'; }
    $('resStars').innerHTML = '<b>' + '★'.repeat(res.stars) + '</b><span>' + '★'.repeat(5 - res.stars) + '</span>';
    $('resVerdict').textContent = res.verdict;
    $('resOrder').textContent = 'Order: ' + orderLines(G.order).join(', ');
    $('resTable').innerHTML = res.lines.map(l => `<tr><td><span class="dot${l.ok ? ' ok' : ''}"></span>${l.label}</td><td>${l.value}</td></tr>`).join('');
    window.__result = { res, cup, secs };
    window.__info.result = { stars: res.stars, verdict: res.verdict, cup: { ml: Math.round(cup.ml), temp: Math.round(cup.temp), tea: +cup.tea.toFixed(3), kind: cup.kind, spoons: +cup.spoons.toFixed(2) }, lines: res.lines.map(l => `${l.label}=${l.value}`) };
    setTimeout(() => show('result'), 700);
  }

  const camFwd = V();
  let last = performance.now(), frames = 0, fpsT = last, fps = 0, measureTick = 0;
  const hud = $('hud');
  const info = window.__info = {};

  function step(now) {
    const dt = Math.min(Math.max((now - last) / 1000, 0.001), 1 / 30);
    last = now;
    const T = [performance.now()];
    hands?.poll(now);
    if (bot) bot.update(dt);
    if (G.state === 'calib' && hands) calibrate(dt);
    const live = (G.state === 'play' || G.state === 'calib') && hands;
    ctrl.update(live ? hands : null, dt);
    ctrl.camera(cam);
    T.push(performance.now());
    phys.driveHands(robot);
    if (G.state === 'play') for (const side of ['L', 'R']) phys.updateGrasp(phys.hands[side], ctrl.st.closure[side], now);
    phys.step();
    T.push(performance.now());

    for (const [kind] of phys.sensorHits) {
      G.hits = (G.hits || 0) + 1;
      if (kind === 'button' && now > G.cool.button && G.state === 'play') {
        G.cool.button = now + 500;
        if (G.heaterOn) G.heaterOn = false;
        else if (kettleSeated() && G.kettle.ml > 20) G.heaterOn = true;
      }
      if (kind === 'bell' && now > G.cool.bell && G.state === 'play') {
        G.cool.bell = now + 800;
        if (cupOnTray()) finish();
      }
    }

    if (G.state === 'play' && now > G.cool.lid) {
      lidKnob.getWorldPosition(camFwd);
      for (const side of ['L', 'R']) for (const p of phys.hands[side].parts) {
        if (!p.tip || !p.pos) continue;
        if (tipWorld(p).distanceTo(camFwd) < 0.022) { G.lidOpen = !G.lidOpen; G.cool.lid = now + 900; }
      }
    }
    G.lidAngle += ((G.lidOpen ? -1.35 : 0) - G.lidAngle) * (1 - Math.exp(-dt * 10));
    lid.rotation.z = G.lidAngle;

    const ang = phys.knobAngle();
    const flowFrac = clamp((ang - 0.2) / 2.3, 0, 1);
    if (flowFrac > 0 && G.state !== 'menu') {
      G.tapAcc += flowFrac * 170 * dt / PARTICLE_ML;
      let n = Math.min(disc.length * 3, Math.floor(G.tapAcc));
      G.tapAcc -= n;
      const r = 0.55 + 0.45 * flowFrac, vy = -0.9 - 0.4 * flowFrac;
      const list = [];
      for (let layer = 0; n > 0; layer++) {
        const m = Math.min(n, disc.length);
        n -= m;
        const pick = disc.map((d, k) => [Math.random(), k]).sort((a, b) => a[0] - b[0]).slice(0, m);
        for (const [, k] of pick) list.push({ x: tapTip.x + disc[k][0] * r, y: tapTip.y - 0.004 - layer * SPACING * 1.15, z: tapTip.z + disc[k][1] * r, vy, temp: 14 });
      }
      fluid.emit(list);
    }

    const kb = phys.kettle;
    if (!kettleSeated()) G.heaterOn = false;
    if (++measureTick % 3 === 0 && fluid.cpuCount) {
      G.kettle = measure(fluid, kb.obj, { r: 0.074, y0: 0.008, y1: 0.19 });
      if (G.heaterOn && G.kettle.temp >= 99.5) G.heaterOn = false;
    }
    fluid.zones.heatOn = G.heaterOn ? 1 : 0;
    fluid.zones.heatRate = 4.1 * clamp(500 / Math.max(G.kettle.ml, 60), 0.5, 3);
    fluid.zones.heaterMatrix.set(new THREE.Matrix4().copy(kb.obj.matrixWorld).invert().elements);
    const kText = G.kettle.ml > 15 ? `${Math.round(G.kettle.temp)}°C` : '--°C';
    if (kText !== G.lastKettleText) { paintLcd(baseUI.screenMat.emissiveMap, kText, { color: '#8fe9ff' }); G.lastKettleText = kText; }
    baseUI.led.material.emissiveIntensity = G.heaterOn ? 3 : 0;

    const sp = phys.spoon;
    if (sp.obj) {
      const spPos = sp.obj.getWorldPosition(V());
      const upY = V(0, 1, 0).applyQuaternion(sp.obj.getWorldQuaternion(new THREE.Quaternion())).y;
      if (!G.sugarLoaded && sp.held && Math.hypot(spPos.x - K.sugar.x, spPos.z - K.sugar.z) < 0.042 && spPos.y < top + 0.06) G.sugarLoaded = true;
      if (G.sugarLoaded && upY < 0.25) {
        G.sugarLoaded = false;
        const list = [];
        for (let i = 0; i < SPOON_PARTICLES; i++) list.push({ x: spPos.x + (Math.random() - 0.5) * 0.016, y: spPos.y - 0.004 + (i % 3) * 0.004, z: spPos.z + (Math.random() - 0.5) * 0.016, vy: -0.25, sugar: true });
        fluid.emit(list);
      }
      sp.obj.userData.load.visible = G.sugarLoaded;
    }

    const zones = [];
    for (const b of phys.bags) {
      const p = b.obj.position;
      for (const m of phys.mugs) {
        if (m.broken) continue;
        const l = p.clone().applyMatrix4(new THREE.Matrix4().copy(m.obj.matrixWorld).invert());
        if (l.y > 0.005 && l.y < 0.1 && Math.hypot(l.x, l.z) < 0.04) zones.push({ p, kind: KIND_ID[b.teaKind], mug: m });
      }
    }
    for (let i = 0; i < 4; i++) fluid.zones.bags[i] = zones[i] ? [zones[i].p.x, zones[i].p.y, zones[i].p.z, zones[i].kind] : [0, 0, 0, 0];
    if (zones.length && measureTick % 3 === 0) {
      const cup = measure(fluid, zones[0].mug.obj);
      const wet = cup.ml > 20 && cup.temp > 40;
      if (wet && !G.brewOn) { G.brewOn = true; G.brewT = 0; if (zones[0].kind === KIND_ID.green && G.greenTemp === null) G.greenTemp = cup.temp; }
      if (!wet) G.brewOn = false;
    } else if (!zones.length) G.brewOn = false;
    if (G.brewOn) G.brewT += dt;
    const tText = fmtTime(G.brewT);
    if (tText !== G.lastTimerText) { paintLcd(timerScreen.material.emissiveMap, tText, { color: '#ffd27a', font: '600 70px Menlo, monospace' }); G.lastTimerText = tText; }

    for (const m of phys.mugs) {
      if (m.broken) continue;
      const v = m.body.linvel();
      const sp2 = Math.hypot(v.x, v.y, v.z);
      if (!m.held && (m.prevSpeed || 0) > 2.4 && sp2 < m.prevSpeed * 0.45 && now - (m.grabbedAt || 0) > 300) breakMug(m);
      m.prevSpeed = sp2;
    }
    for (const s of G.shards) { const p = s.b.translation(), r = s.b.rotation(); s.m.position.set(p.x, p.y, p.z); s.m.quaternion.set(r.x, r.y, r.z, r.w); }

    const cols = statics.slice();
    cols.push(collider('kettle', kb.obj.matrixWorld, [G.lidOpen ? 1 : 0], { radius: 0.25, friction: 0.02, prev: kb.prevMatrix }));
    for (const m of phys.mugs) if (!m.broken) cols.push(collider('cup', m.obj.matrixWorld, [0.0418, 0.097, 0.006, 0.012], { radius: 0.15, friction: 0.05, prev: m.prevMatrix }));
    {
      const mw = sp.obj.matrixWorld, pw = sp.prevMatrix;
      const off = new THREE.Matrix4().makeTranslation(0, 0.009, 0.065).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      cols.push(collider('capsule', mw.clone().multiply(off), [0.006, 0.05], { radius: 0.08, prev: pw.clone().multiply(off) }));
      cols.push(collider('box', mw, [0.016, 0.005, 0.02], { radius: 0.04, prev: pw }));
    }
    for (const b of phys.bags) {
      const p = b.obj.position;
      if (p.y > top + 0.12 || Math.hypot(p.x - K.chest.x, p.z - K.chest.z) < 0.15) continue;
      cols.push(collider('box', b.obj.matrixWorld, [0.029, 0.032, 0.0025], { radius: 0.05, prev: b.prevMatrix }));
    }
    for (const side of ['L', 'R']) {
      const prev = G.handPrev[side];
      phys.hands[side].parts.forEach((p, i) => {
        if (!p.pos) return;
        const m = new THREE.Matrix4().compose(p.pos, p.quat, V(1, 1, 1));
        const off = new THREE.Matrix4().makeTranslation(0, p.f === 'palm' ? -0.042 : -p.len / 2, 0);
        m.multiply(off);
        const pv = prev[i] || m;
        cols.push(p.f === 'palm'
          ? collider('box', m, [0.0135, 0.041, 0.036], { radius: 0.06, prev: pv })
          : collider('capsule', m, [0.0085, Math.max(0.001, p.len / 2 - 0.004)], { radius: 0.04, prev: pv }));
        prev[i] = m;
      });
    }
    T.push(performance.now());
    fluid.setColliders(cols);
    fluid.step(dt);
    water.sync(fluid.cpuCount);
    T.push(performance.now());
    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, cam);
    T.push(performance.now());
    water.render(cam, sceneRT, compRT, sunDir);
    bloom.render(renderer, null, compRT, dt, false);
    output.render(renderer, null, compRT);
    T.push(performance.now());
    G.perf = G.perf || T.slice(1).map(() => 0);
    for (let k = 1; k < T.length; k++) G.perf[k - 1] = G.perf[k - 1] * 0.95 + (T[k] - T[k - 1]) * 0.05;

    if (hands && preview.classList.contains('on')) hands.drawPreview(preview);
    frames++;
    if (now - fpsT > 1000) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; }
    Object.assign(info, {
      state: G.state, fps: +fps.toFixed(1), gpuFluidMs: +fluid.gpuMs.toFixed(2), particles: fluid.high,
      handFps: hands ? +hands.fps.toFixed(1) : 0, handMs: hands ? +hands.ms.toFixed(1) : 0,
      seen: hands ? [hands.L.seen, hands.R.seen] : null, closure: [+ctrl.st.closure.L.toFixed(2), +ctrl.st.closure.R.toFixed(2)],
      held: [phys.hands.L.held?.kind || null, phys.hands.R.held?.kind || null], knob: +ang.toFixed(2),
      perf: G.perf ? G.perf.map(x => +x.toFixed(2)) : null, hits: G.hits || 0, seated: kettleSeated(), tipBtn: (() => { const b = V(K.kettle.x + 0.026, top + 0.014, K.kettle.z - 0.092); let d = 9; for (const p of phys.hands.R.parts) if (p.pos && p.f !== 'palm') d = Math.min(d, tipWorld(p).distanceTo(b)); return +d.toFixed(3); })(), mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, calls: renderer.info.render.calls,
      kettle: { ml: Math.round(G.kettle.ml), temp: Math.round(G.kettle.temp), y: +phys.kettle.body.translation().y.toFixed(3) }, heater: G.heaterOn, bot: bot ? bot.done : null, jerr: phys.jointError(phys.hands.L),
    });
    if (hud.classList.contains('on')) hud.textContent = Object.entries(info).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
    requestAnimationFrame(step);
  }

  if (TEST) {
    calib.done = true;
    window.__begin = begin;
  }
  let bot = null;
  if (Q.get('bot')) {
    const m = await import('../Niepotrzebne/tools/bot.js');
    bot = m.createBot(Q.get('bot'), { ctrl, K, phys, fluid, G, serve: () => finish() });
    G.state = 'play';
    G.t0 = performance.now();
  }
  const again = sessionStorage.getItem('robotea.again');
  sessionStorage.removeItem('robotea.again');
  show(bot ? '' : again ? 'calib' : 'menu');
  requestAnimationFrame(step);
  if (again || Q.has('autostart')) begin();
  window.__ready = true;
}

main().catch(e => { console.error(e); notice('Something went wrong while loading: ' + (e?.message || e)); });
