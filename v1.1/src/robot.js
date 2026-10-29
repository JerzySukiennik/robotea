// Robotea: first-person Optimus controller (calibrated hand features to raised-arm IK, wrist orientation, finger curls, torso lean, head and eye camera, per-mode stance)
import * as THREE from 'three';
import { standPose, applyPose, solveLimb, handBasis, bendChest, applyHand, lookHead } from './pose.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const MODES = {
  hf: { base: { L: V(0.2, 1.24, 0.3), R: V(-0.2, 1.24, 0.3) }, gain: { x: 1.3, y: 1.0, z: 0.42 }, lower: false },
  range: { base: { L: V(0.15, 1.38, 0.44), R: V(-0.15, 1.38, 0.44) }, gain: { x: 0.6, y: 0.5, z: 0 }, lower: true },
};
const LIMIT = { x0: -0.7, x1: 0.7, y0: 0.85, y1: 1.85, z0: 0.12, z1: 0.66 };
const POLE = { L: V(-1, 1, 0.2).normalize(), R: V(1, 1, 0.2).normalize() };
export const OPEN = [0.05, 0.03, 0.03, 0.04, 0.06, 0.6];

export function createController(robot, calib) {
  const pose = standPose();
  let cfg = MODES.hf;
  const neutralQ = {
    L: handBasis('L', V(0.05, 1, 0.3), V(0, 0, 1)),
    R: handBasis('R', V(-0.05, 1, 0.3), V(0, 0, 1)),
  };
  const st = {
    target: { L: cfg.base.L.clone(), R: cfg.base.R.clone() },
    cur: { L: cfg.base.L.clone(), R: cfg.base.R.clone() },
    adjust: { L: V(), R: V() },
    q: { L: neutralQ.L.clone(), R: neutralQ.R.clone() },
    qTarget: { L: neutralQ.L.clone(), R: neutralQ.R.clone() },
    curls: { L: [...OPEN], R: [...OPEN] },
    closure: { L: 0, R: 0 },
    vel: { L: V(), R: V() },
    unseen: { L: 9, R: 9 },
    look: V(0, 1.4, 0.8),
    lean: 0, twist: 0, side: 0,
    des: { lean: 0, side: 0, twist: 0 },
  };
  const over = { q: { L: null, R: null }, curls: { L: null, R: null }, look: null, ref: null };
  const tmp = new THREE.Quaternion(), qPlayer = new THREE.Quaternion();
  const ik = { L: V(), R: V() };

  function fromHand(side, s, dt) {
    const n = calib.neutral[side];
    const r = over.ref?.[side] || n;
    const b = cfg.base[side];
    const d = cfg.gain.z ? calib.depth(s.size) - calib.depth(n.size) : 0;
    const t = st.target[side];
    t.set(b.x - (s.cx - r.cx) * cfg.gain.x, b.y - (s.cy - r.cy) * cfg.gain.y, b.z + d * cfg.gain.z);
    t.x = THREE.MathUtils.clamp(t.x, LIMIT.x0, LIMIT.x1);
    t.y = THREE.MathUtils.clamp(t.y, LIMIT.y0, LIMIT.y1);
    t.z = THREE.MathUtils.clamp(t.z, LIMIT.z0, LIMIT.z1);
    handBasis(side, V(...s.finger), V(...s.palm), qPlayer);
    if (n.q) {
      tmp.copy(n.q).invert();
      st.qTarget[side].copy(qPlayer).multiply(tmp).multiply(neutralQ[side]);
    }
    if (over.curls[side]) return;
    const c = st.curls[side];
    const k = 1 - Math.exp(-dt * 18);
    for (let i = 0; i < 5; i++) c[i] += (s.curls[i] - c[i]) * k;
    c[5] += (s.spread - c[5]) * k;
    st.closure[side] = (c[1] + c[2] + c[3] + c[4]) / 4;
  }

  function update(hands, dt) {
    for (const side of ['L', 'R']) {
      const h = hands?.[side];
      if (h?.seen && h.s) { st.unseen[side] = 0; fromHand(side, h.s, dt); }
      else st.unseen[side] += dt;
      if (cfg.lower && st.unseen[side] > 0.6) st.target[side].set(cfg.base[side].x * 1.3, 1.02, 0.3);
      const oc = over.curls[side];
      if (oc) {
        const c = st.curls[side], k = 1 - Math.exp(-dt * 20);
        for (let i = 0; i < 6; i++) c[i] += (oc[i] - c[i]) * k;
      }
      const cur = st.cur[side], tgt = st.target[side];
      const step = tgt.clone().sub(cur);
      const maxStep = 3.2 * dt;
      if (step.length() > maxStep) step.setLength(maxStep);
      const prev = cur.clone();
      cur.add(step.multiplyScalar(1 - Math.exp(-dt * 35)));
      st.vel[side].copy(cur).sub(prev).divideScalar(Math.max(dt, 1e-3));
      st.q[side].slerp(over.q[side] || st.qTarget[side], 1 - Math.exp(-dt * 22));
      ik[side].copy(cur).add(st.adjust[side]);
    }
    const des = st.des;
    const relax = Math.exp(-dt * 1.5);
    des.lean *= relax; des.side *= relax; des.twist *= relax;
    applyPose(robot, pose);
    bendChest(robot, st.lean, st.side, st.twist);
    let worst = null;
    for (const side of ['L', 'R']) {
      const sh = robot.bones['upperArm' + side].getWorldPosition(V());
      const d = ik[side].clone().sub(sh);
      const def = d.length() - 0.5;
      if (def > 0 && (!worst || def > worst.def)) worst = { d: d.normalize(), def };
    }
    if (worst) {
      const g = Math.min(worst.def, 0.4) * dt * 9;
      des.lean = THREE.MathUtils.clamp(des.lean + (worst.d.z * 1.3 + Math.max(0, -worst.d.y) * 1.0) * g, -0.1, 0.55);
      des.side = THREE.MathUtils.clamp(des.side - worst.d.x * 1.2 * g, -0.35, 0.35);
      des.twist = THREE.MathUtils.clamp(des.twist + worst.d.x * 0.8 * g, -0.45, 0.45);
    }
    const k = 1 - Math.exp(-dt * 8);
    st.lean += (des.lean - st.lean) * k;
    st.side += (des.side - st.side) * k;
    st.twist += (des.twist - st.twist) * k;
    applyPose(robot, pose);
    bendChest(robot, st.lean, st.side, st.twist);
    solveLimb(robot, 'armL', ik.L, POLE.L, st.q.L);
    solveLimb(robot, 'armR', ik.R, POLE.R, st.q.R);
    applyHand(robot, 'L', st.curls.L);
    applyHand(robot, 'R', st.curls.R);
    if (over.look) st.look.lerp(over.look, 1 - Math.exp(-dt * 3));
    else {
      const mid = ik.L.clone().add(ik.R).multiplyScalar(0.5);
      st.look.lerp(V(mid.x * 0.35, 1.36 + (mid.y - 1.3) * 0.3, 0.85), 1 - Math.exp(-dt * 4));
    }
    lookHead(robot, st.look);
    robot.root.updateMatrixWorld(true);
  }

  function setMode(m) {
    cfg = MODES[m];
    for (const side of ['L', 'R']) {
      st.target[side].copy(cfg.base[side]);
      over.q[side] = null;
      over.curls[side] = null;
    }
    over.look = null;
    over.ref = null;
  }

  const eye = V(0, 0.035, 0.112);
  const flip = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI);
  function camera(cam) {
    const head = robot.bones.head;
    head.updateMatrixWorld(true);
    cam.position.copy(eye).applyMatrix4(head.matrixWorld);
    head.getWorldQuaternion(cam.quaternion).multiply(flip);
    cam.updateMatrixWorld(true);
  }

  function snapshot() {
    return { L: ik.L.clone(), R: ik.R.clone(), qL: st.q.L.clone(), qR: st.q.R.clone(), cL: [...st.curls.L], cR: [...st.curls.R], lean: st.lean, side: st.side, twist: st.twist };
  }

  return { st, over, update, setMode, camera, snapshot, ik, base: side => cfg.base[side] };
}
