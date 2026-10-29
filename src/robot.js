// Robotea: first-person Optimus controller (calibrated hand features to arm IK, wrist orientation, finger curls, torso lean, head follow and eye camera)
import * as THREE from 'three';
import { standPose, applyPose, solveLimb, handBasis, bendChest, applyHand, lookHead } from './pose.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const NEUTRAL = { L: V(0.22, 1.08, 0.31), R: V(-0.22, 1.08, 0.31) };
const GAIN = { x: 1.35, y: 0.95, z: 0.5 };
const LIMIT = { x0: -0.95, x1: 0.95, y0: 0.935, y1: 1.62, z0: 0.16, z1: 0.78 };
const POLE = { L: V(-1, 0.4, 0.6).normalize(), R: V(1, 0.4, 0.6).normalize() };

export function createController(robot, calib, { origin = V(0, 0, 0) } = {}) {
  const pose = standPose();
  pose.x = origin.x;
  pose.z = origin.z;
  const robotNeutralQ = {
    L: handBasis('L', V(-0.2, -0.45, 1), V(0.1, -1, -0.15)),
    R: handBasis('R', V(0.2, -0.45, 1), V(-0.1, -1, -0.15)),
  };
  const st = {
    target: { L: NEUTRAL.L.clone().add(origin), R: NEUTRAL.R.clone().add(origin) },
    cur: { L: NEUTRAL.L.clone().add(origin), R: NEUTRAL.R.clone().add(origin) },
    q: { L: robotNeutralQ.L.clone(), R: robotNeutralQ.R.clone() },
    qTarget: { L: robotNeutralQ.L.clone(), R: robotNeutralQ.R.clone() },
    curls: { L: [0.3, 0.22, 0.28, 0.34, 0.4, 0.1], R: [0.3, 0.22, 0.28, 0.34, 0.4, 0.1] },
    closure: { L: 0, R: 0 },
    look: V(origin.x, 1.0, 0.6),
    lean: 0, twist: 0, side: 0, hip: 0, origin,
    vel: { L: V(), R: V() },
  };
  const tmp = new THREE.Quaternion(), qPlayer = new THREE.Quaternion();

  function fromHand(side, s, dt) {
    const n = calib.neutral[side];
    const d = calib.depth(s.size) - calib.depth(n.size);
    const t = st.target[side];
    t.set(
      NEUTRAL[side].x - (s.cx - n.cx) * GAIN.x,
      NEUTRAL[side].y - (s.cy - n.cy) * GAIN.y,
      NEUTRAL[side].z + d * GAIN.z,
    ).add(origin);
    t.x = THREE.MathUtils.clamp(t.x, LIMIT.x0 + origin.x, LIMIT.x1 + origin.x);
    t.y = THREE.MathUtils.clamp(t.y, LIMIT.y0, LIMIT.y1);
    t.z = THREE.MathUtils.clamp(t.z, LIMIT.z0, LIMIT.z1);
    handBasis(side, V(...s.finger), V(...s.palm), qPlayer);
    if (n.q) {
      tmp.copy(n.q).invert();
      st.qTarget[side].copy(qPlayer).multiply(tmp).multiply(robotNeutralQ[side]);
    }
    const c = st.curls[side];
    const k = 1 - Math.exp(-dt * 18);
    for (let i = 0; i < 5; i++) c[i] += (s.curls[i] - c[i]) * k;
    c[5] += (s.spread - c[5]) * k;
    const grip = (c[1] + c[2] + c[3]) / 3 * 0.85 + c[0] * 0.15;
    st.closure[side] = Math.max(grip, s.pinch * 0.95);
  }

  function update(hands, dt) {
    for (const side of ['L', 'R']) {
      const h = hands?.[side];
      if (h?.seen && h.s) fromHand(side, h.s, dt);
      const cur = st.cur[side], tgt = st.target[side];
      const step = tgt.clone().sub(cur);
      const maxStep = 1.8 * dt;
      if (step.length() > maxStep) step.setLength(maxStep);
      const prev = cur.clone();
      cur.add(step.multiplyScalar(1 - Math.exp(-dt * 30)) );
      st.vel[side].copy(cur).sub(prev).divideScalar(Math.max(dt, 1e-3));
      st.q[side].slerp(st.qTarget[side], 1 - Math.exp(-dt * 20));
    }
    const L = st.cur.L, R = st.cur.R, o = st.origin;
    const des = st.des || (st.des = { lean: 0, side: 0, twist: 0, hip: 0 });
    const relax = Math.exp(-dt * 1.5);
    des.lean *= relax; des.side *= relax; des.twist *= relax; des.hip *= relax;
    pose.x = o.x + st.hip;
    applyPose(robot, pose);
    bendChest(robot, st.lean, st.side, st.twist);
    let worst = null;
    for (const side of ['L', 'R']) {
      const sh = robot.bones['upperArm' + side].getWorldPosition(V());
      const d = st.cur[side].clone().sub(sh);
      const def = d.length() - 0.5;
      if (def > 0 && (!worst || def > worst.def)) worst = { d: d.normalize(), def };
    }
    if (worst) {
      const g = Math.min(worst.def, 0.4) * dt * 9;
      des.lean = THREE.MathUtils.clamp(des.lean + (worst.d.z * 1.4 + Math.max(0, -worst.d.y) * 1.1) * g, 0, 0.8);
      des.side = THREE.MathUtils.clamp(des.side - worst.d.x * 1.3 * g, -0.42, 0.42);
      des.twist = THREE.MathUtils.clamp(des.twist + worst.d.x * 0.9 * g, -0.55, 0.55);
      des.hip = THREE.MathUtils.clamp(des.hip + worst.d.x * 0.35 * g, -0.13, 0.13);
    }
    const reachZ = Math.max(L.z, R.z) - o.z;
    const leanBase = THREE.MathUtils.clamp((reachZ - 0.4) * 1.2, 0, 0.35);
    const k = 1 - Math.exp(-dt * 8);
    st.lean += (Math.max(des.lean, leanBase) - st.lean) * k;
    st.side = (st.side ?? 0) + (des.side - (st.side ?? 0)) * k;
    st.twist += (des.twist - st.twist) * k;
    st.hip = (st.hip ?? 0) + (des.hip - (st.hip ?? 0)) * k;
    pose.x = o.x + st.hip;
    applyPose(robot, pose);
    bendChest(robot, st.lean, st.side, st.twist);
    solveLimb(robot, 'armL', L, POLE.L, st.q.L);
    solveLimb(robot, 'armR', R, POLE.R, st.q.R);
    applyHand(robot, 'L', st.curls.L);
    applyHand(robot, 'R', st.curls.R);
    const mid = L.clone().add(R).multiplyScalar(0.5);
    const want = V(o.x + (mid.x - o.x) * 0.75, Math.min(mid.y, 1.25) - 0.08, Math.max(mid.z, 0.45) + 0.12);
    st.look.lerp(want, 1 - Math.exp(-dt * 4));
    lookHead(robot, st.look);
    robot.root.updateMatrixWorld(true);
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

  return { st, update, camera, neutral: NEUTRAL };
}
