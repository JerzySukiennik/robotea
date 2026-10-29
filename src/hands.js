// Robotea: camera hand tracking (MediaPipe HandLandmarker), One Euro smoothing, per-hand pose features, calibration and the corner self-view
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const CHAIN = { t: [1, 2, 3, 4], i: [5, 6, 7, 8], m: [9, 10, 11, 12], r: [13, 14, 15, 16], p: [17, 18, 19, 20] };
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

class OneEuro {
  constructor(minCutoff = 1.0, beta = 0.02, dCutoff = 1.0) { Object.assign(this, { minCutoff, beta, dCutoff, x: null, dx: 0, t: 0 }); }
  alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(v, t) {
    if (this.x === null) { this.x = v; this.t = t; return v; }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const d = (v - this.x) / dt;
    this.dx += this.alpha(this.dCutoff, dt) * (d - this.dx);
    const c = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += this.alpha(c, dt) * (v - this.x);
    return this.x;
  }
  reset() { this.x = null; this.dx = 0; }
}

const sub = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z];
const len = v => Math.hypot(v[0], v[1], v[2]);
const norm = v => { const l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / ((len(a) * len(b)) || 1))));
const clamp01 = x => Math.max(0, Math.min(1, x));

function features(lm, wl, aspect) {
  const palmIdx = [0, 5, 9, 13, 17];
  let cx = 0, cy = 0;
  for (const i of palmIdx) { cx += lm[i].x; cy += lm[i].y; }
  cx /= palmIdx.length; cy /= palmIdx.length;
  const d09 = Math.hypot((lm[9].x - lm[0].x) * aspect, lm[9].y - lm[0].y);
  const d517 = Math.hypot((lm[17].x - lm[5].x) * aspect, lm[17].y - lm[5].y);
  const size = Math.max(d09, d517 * 1.3);
  const finger = norm(sub(wl[9], wl[0]));
  const across = norm(sub(wl[17], wl[5]));
  const curls = {};
  for (const [f, ch] of Object.entries(CHAIN)) {
    const pts = [wl[0], ...ch.map(i => wl[i])];
    let flex = 0;
    for (let k = 1; k < pts.length - 1; k++) flex += angle(sub(pts[k], pts[k - 1]), sub(pts[k + 1], pts[k]));
    curls[f] = f === 't' ? clamp01((flex - 0.55) / 1.5) : clamp01((flex - 0.3) / 3.4);
  }
  const spread = clamp01(angle(sub(wl[8], wl[5]), sub(wl[20], wl[17])) / 0.55);
  const palmLen = len(sub(wl[9], wl[0]));
  const pinch = 1 - clamp01((len(sub(wl[4], wl[8])) - 0.012) / (palmLen * 0.75));
  return { cx: 1 - cx, cy, size, finger, across, curls, spread, pinch };
}

export async function createHands({ video, onStatus = () => {} } = {}) {
  onStatus('Loading hand tracking…');
  const vision = await FilesetResolver.forVisionTasks(WASM);
  const lmk = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: './assets/models/hand_landmarker.task', delegate: 'GPU' },
    runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  onStatus('Starting camera…');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();

  const mk = () => ({
    seen: false, lastSeen: -1e9, raw: null, lm: null,
    f: { cx: new OneEuro(1.6, 0.6), cy: new OneEuro(1.6, 0.6), size: new OneEuro(1.0, 0.4),
      fx: new OneEuro(2, 0.3), fy: new OneEuro(2, 0.3), fz: new OneEuro(2, 0.3),
      ax: new OneEuro(2, 0.3), ay: new OneEuro(2, 0.3), az: new OneEuro(2, 0.3),
      t: new OneEuro(3, 0.2), i: new OneEuro(3, 0.2), m: new OneEuro(3, 0.2), r: new OneEuro(3, 0.2), p: new OneEuro(3, 0.2),
      spread: new OneEuro(2, 0.1), pinch: new OneEuro(4, 0.3) },
    s: null,
  });
  const state = { R: mk(), L: mk(), fps: 0, ms: 0, frames: 0, video, lastTime: -1 };
  let fpsT = performance.now(), fpsN = 0;

  function process(now) {
    if (video.readyState < 2 || video.currentTime === state.lastTime) return;
    state.lastTime = video.currentTime;
    const t0 = performance.now();
    const res = lmk.detectForVideo(video, now);
    state.ms = performance.now() - t0;
    fpsN++;
    if (now - fpsT > 1000) { state.fps = fpsN * 1000 / (now - fpsT); fpsN = 0; fpsT = now; }
    const aspect = video.videoWidth / video.videoHeight;
    const found = (res.landmarks || []).slice(0, 2).map((lm, k) => ({ lm, fe: features(lm, res.worldLandmarks[k], aspect) }));
    const t = now / 1000;
    if (found.length === 2) {
      found.sort((a, b) => b.fe.cx - a.fe.cx);
      found[0].side = 'R';
      found[1].side = 'L';
    } else if (found.length === 1) {
      const h = found[0], x = h.fe.cx;
      const near = side => state[side].s && t - state[side].lastSeen < 1.2 ? Math.abs(state[side].s.cx - x) : 9;
      const dL = near('L'), dR = near('R');
      h.side = dL < 9 || dR < 9 ? (dR <= dL ? 'R' : 'L') : x > 0.5 ? 'R' : 'L';
    }
    for (const h of found) {
      const st = state[h.side];
      const F = st.f, fe = h.fe;
      if (t - st.lastSeen > 0.4) for (const k in F) F[k].reset();
      st.lastSeen = t;
      st.seen = true;
      st.lm = h.lm;
      const isR = h.side === 'R';
      const fin = norm([F.fx.filter(fe.finger[0], t), F.fy.filter(fe.finger[1], t), F.fz.filter(fe.finger[2], t)]);
      const acr = norm([F.ax.filter(fe.across[0], t), F.ay.filter(fe.across[1], t), F.az.filter(fe.across[2], t)]);
      const pn = cross(fin, acr).map(v => v * (isR ? 1 : -1));
      st.s = {
        cx: F.cx.filter(fe.cx, t), cy: F.cy.filter(fe.cy, t), size: F.size.filter(fe.size, t),
        finger: [fin[0], -fin[1], -fin[2]], palm: [pn[0], -pn[1], -pn[2]],
        curls: ['t', 'i', 'm', 'r', 'p'].map(f => F[f].filter(fe.curls[f], t)),
        spread: F.spread.filter(fe.spread, t), pinch: F.pinch.filter(fe.pinch, t),
      };
    }
    for (const side of ['L', 'R']) if (t - state[side].lastSeen > 0.25) state[side].seen = false;
  }

  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    const cb = now => { process(now); video.requestVideoFrameCallback(cb); };
    video.requestVideoFrameCallback(cb);
    state.poll = () => {};
  } else {
    state.poll = now => process(now);
  }

  state.drawPreview = (canvas) => {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.globalAlpha = 0.5;
    if (video.readyState >= 2) ctx.drawImage(video, 0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (const side of ['L', 'R']) {
      const st = state[side];
      if (!st.seen || !st.lm) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      for (const [a, b] of BONES) {
        ctx.moveTo((1 - st.lm[a].x) * w, st.lm[a].y * h);
        ctx.lineTo((1 - st.lm[b].x) * w, st.lm[b].y * h);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      for (const p of st.lm) { ctx.beginPath(); ctx.arc((1 - p.x) * w, p.y * h, 1.6, 0, Math.PI * 2); ctx.fill(); }
    }
  };

  state.stop = () => { for (const tr of stream.getTracks()) tr.stop(); lmk.close(); };
  return state;
}

export function createCalibration() {
  const c = {
    neutral: { L: { cx: 0.36, cy: 0.62, size: 0.16 }, R: { cx: 0.64, cy: 0.62, size: 0.16 } },
    near: 0.24, far: 0.11, done: false,
  };
  c.depth = size => clamp01((size - c.far) / Math.max(0.02, c.near - c.far));
  return c;
}
