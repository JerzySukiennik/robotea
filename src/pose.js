// Robotea: pose data, hand curls, arm and torso inverse kinematics for the Optimus rig
import * as THREE from 'three';
import { BODY_NAMES, REST_HIPS_Y } from './optimus.js';

const D = Math.PI / 180;
const clamp = THREE.MathUtils.clamp;
export const SIDES = ['L', 'R'];

export const HAND_PRESETS = {
  relaxed: [0.3, 0.22, 0.28, 0.34, 0.4, 0.1],
  open: [0, 0, 0, 0, 0, 0.75],
  fist: [0.85, 1, 1, 1, 1, 0],
  grip: [0.62, 0.62, 0.66, 0.7, 0.74, 0.05],
  pinch: [0.7, 0.55, 0.2, 0.25, 0.3, 0.15],
};

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

export function eq(x, y = 0, z = 0, order = 'XYZ') {
  _q.setFromEuler(_e.set(x * D, y * D, z * D, order));
  return [_q.x, _q.y, _q.z, _q.w];
}

const mirrorQ = a => [a[0], -a[1], -a[2], a[3]];
const sideQ = (side, a) => (side === 'L' ? a : mirrorQ(a));

export function emptyPose() {
  const q = {};
  for (const n of BODY_NAMES) q[n] = [0, 0, 0, 1];
  return { x: 0, z: 0, yaw: 0, hip: [0, 0, 0], q, hands: { L: [...HAND_PRESETS.relaxed], R: [...HAND_PRESETS.relaxed] } };
}

export function setArm(p, side, a) {
  p.q['upperArm' + side] = sideQ(side, eq(a.flex ?? 0, a.twist ?? 0, a.abd ?? 0, 'ZXY'));
  p.q['forearm' + side] = sideQ(side, eq(a.elbow ?? 0, a.fore ?? 0, 0, 'XYZ'));
  p.q['hand' + side] = sideQ(side, eq(a.wx ?? 0, a.wy ?? 0, a.wz ?? 0, 'XYZ'));
}

export function setTorso(p, name, x = 0, y = 0, z = 0) {
  p.q[name] = eq(x, y, z, 'YXZ');
}

export function standPose() {
  const p = emptyPose();
  for (const s of SIDES) setArm(p, s, { flex: -4, abd: 7, elbow: -12 });
  return p;
}

export function applyHand(robot, side, h) {
  const s = side === 'L' ? 1 : -1;
  const b = robot.bones;
  const spread = { i: -0.16, m: -0.03, r: 0.08, p: 0.2 };
  ['i', 'm', 'r', 'p'].forEach((f, k) => {
    const c = h[k + 1];
    b[`${side}_${f}0`].quaternion.setFromEuler(_e.set(spread[f] * h[5], 0, -s * c * 1.45, 'XYZ'));
    b[`${side}_${f}1`].quaternion.setFromEuler(_e.set(0, 0, -s * c * 1.7, 'XYZ'));
    b[`${side}_${f}2`].quaternion.setFromEuler(_e.set(0, 0, -s * c * 1.15, 'XYZ'));
  });
  const t = h[0];
  b[`${side}_t0`].quaternion.setFromEuler(_e.set(-0.55 + 0.95 * t, s * 0.3, -s * (0.25 + 0.45 * t), 'XYZ'));
  b[`${side}_t1`].quaternion.setFromEuler(_e.set(0.5 * t, 0, -s * 0.45 * t, 'XYZ'));
  b[`${side}_t2`].quaternion.setFromEuler(_e.set(0.6 * t, 0, -s * 0.3 * t, 'XYZ'));
}

export function applyPose(robot, p) {
  const b = robot.bones;
  robot.root.position.set(p.x, 0, p.z);
  robot.root.rotation.set(0, p.yaw, 0);
  b.hips.position.set(p.hip[0], REST_HIPS_Y + p.hip[1], p.hip[2]);
  for (const n of BODY_NAMES) {
    const a = p.q[n];
    b[n].quaternion.set(a[0], a[1], a[2], a[3]);
  }
  applyHand(robot, 'L', p.hands.L);
  applyHand(robot, 'R', p.hands.R);
  robot.root.updateMatrixWorld(true);
}

export const LIMBS = {
  armL: ['upperArmL', 'forearmL', 'handL', -1],
  armR: ['upperArmR', 'forearmR', 'handR', -1],
};

const _a = new THREE.Vector3(), _t = new THREE.Vector3(), _dir = new THREE.Vector3(), _f = new THREE.Vector3();
const _m = new THREE.Vector3(), _k = new THREE.Vector3(), _u = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _mat = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion();

export function solveLimb(robot, limb, target, zPref, endWorldQuat) {
  const [nA, nB, nC, sgn] = LIMBS[limb];
  const b = robot.bones, A = b[nA], B = b[nB], C = b[nC];
  A.getWorldPosition(_a);
  const l1 = B.position.length(), l2 = C.position.length();
  _dir.subVectors(target, _a);
  let d = _dir.length();
  if (d < 1e-6) { _dir.set(0, -1, 0); d = 1e-6; } else _dir.divideScalar(d);
  d = clamp(d, Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.99995);
  _f.copy(zPref).addScaledVector(_dir, -zPref.dot(_dir));
  if (_f.lengthSq() < 1e-8) {
    A.parent.getWorldQuaternion(_pq);
    _f.set(0, 0, 1).applyQuaternion(_pq);
    if (Math.abs(_f.dot(_dir)) > 0.98) _f.set(0, 1, 0).applyQuaternion(_pq);
    _f.addScaledVector(_dir, -_f.dot(_dir));
  }
  _f.normalize();
  _m.copy(_f).multiplyScalar(sgn);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _k.copy(_a).addScaledVector(_dir, l1 * cosA).addScaledVector(_m, l1 * sinA);
  _u.subVectors(_k, _a).normalize();
  _z.copy(_f).addScaledVector(_u, -_f.dot(_u)).normalize();
  _y.copy(_u).negate();
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y);
  _mat.makeBasis(_x, _y, _z);
  _wq.setFromRotationMatrix(_mat);
  A.parent.getWorldQuaternion(_pq);
  A.quaternion.copy(_pq.invert().multiply(_wq));
  _t.copy(_a).addScaledVector(_dir, d).sub(_k).normalize();
  const theta = Math.acos(clamp(_u.dot(_t), -1, 1));
  _e.setFromQuaternion(B.quaternion, 'XYZ');
  B.quaternion.setFromEuler(_e.set(sgn * theta, _e.y, 0, 'XYZ'));
  if (endWorldQuat) {
    A.updateMatrixWorld(true);
    B.getWorldQuaternion(_pq);
    C.quaternion.copy(_pq.invert().multiply(endWorldQuat));
  }
  A.updateMatrixWorld(true);
}

export function bendChest(robot, fwd, side = 0, twist = 0) {
  const b = robot.bones;
  b.spine.quaternion.setFromEuler(_e.set(fwd * 0.45, twist * 0.4, side * 0.45, 'YXZ'));
  b.chest.quaternion.setFromEuler(_e.set(fwd * 0.55, twist * 0.6, side * 0.55, 'YXZ'));
  b.spine.updateMatrixWorld(true);
}

export function lookHead(robot, target) {
  const b = robot.bones;
  b.head.getWorldPosition(_a);
  _dir.subVectors(target, _a);
  if (_dir.lengthSq() < 1e-6) return;
  b.chest.getWorldQuaternion(_pq);
  _dir.applyQuaternion(_pq.invert()).normalize();
  const yaw = clamp(Math.atan2(_dir.x, _dir.z), -1.3, 1.3);
  const pitch = clamp(Math.asin(clamp(-_dir.y, -1, 1)), -0.75, 1.2);
  b.neck.quaternion.setFromEuler(_e.set(pitch * 0.4, yaw * 0.45, 0, 'YXZ'));
  b.head.quaternion.setFromEuler(_e.set(pitch * 0.6, yaw * 0.55, 0, 'YXZ'));
  b.neck.updateMatrixWorld(true);
}

export function handBasis(side, fingers, palm, out = new THREE.Quaternion()) {
  const s = side === 'L' ? 1 : -1;
  _y.copy(fingers).normalize().negate();
  _x.copy(palm).normalize().multiplyScalar(-s);
  _x.addScaledVector(_y, -_x.dot(_y)).normalize();
  _z.crossVectors(_x, _y).normalize();
  _mat.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_mat);
}
