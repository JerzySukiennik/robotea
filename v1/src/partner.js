// Robotea: the other robot (facing you with springy raised hands for high fives, or standing in the next lane at the range; online it plays the remote player's pose)
import * as THREE from 'three';
import { standPose, applyPose, solveLimb, handBasis, bendChest, applyHand, lookHead, HAND_PRESETS } from './pose.js';
import { OPEN } from './robot.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const GAP = 0.8;
const FLIP = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI);

function layout(kind, x) {
  if (kind === 'lane') return {
    kind, x, z: 0, yaw: 0, springs: false,
    pole: { L: V(-1, 1, 0.2).normalize(), R: V(1, 1, 0.2).normalize() },
    rest: { L: V(x + 0.24, 0.98, 0.1), R: V(x - 0.24, 0.98, 0.1) },
    restQ: { L: handBasis('L', V(0, -1, 0.15), V(-1, 0, 0)), R: handBasis('R', V(0, -1, 0.15), V(1, 0, 0)) },
    restCurls: HAND_PRESETS.relaxed,
    toWorld: p => V(p.x + x, p.y, p.z),
    qWorld: q => q.clone(),
    look: V(x, 1.5, 9),
  };
  return {
    kind, x: 0, z: GAP, yaw: Math.PI, springs: true,
    pole: { L: V(1, 1, -0.2).normalize(), R: V(-1, 1, -0.2).normalize() },
    rest: { L: V(-0.2, 1.36, GAP - 0.29), R: V(0.2, 1.36, GAP - 0.29) },
    restQ: { L: handBasis('L', V(-0.05, 1, -0.25), V(0, 0, -1)), R: handBasis('R', V(0.05, 1, -0.25), V(0, 0, -1)) },
    restCurls: OPEN,
    toWorld: p => V(-p.x, p.y, GAP - p.z),
    qWorld: q => FLIP.clone().multiply(q),
    look: V(0, 1.6, 0.12),
  };
}

export function createPartner(robot) {
  const pose = standPose();
  let P = layout('face', 0);
  const st = {
    off: { L: V(), R: V() }, vel: { L: V(), R: V() },
    pos: { L: P.rest.L.clone(), R: P.rest.R.clone() },
    q: { L: P.restQ.L.clone(), R: P.restQ.R.clone() },
    curls: { L: [...OPEN], R: [...OPEN] },
    lean: 0, side: 0, twist: 0, nod: 0, remote: null, remoteAge: 9,
  };
  const over = { curls: { L: null, R: null } };

  function place(kind, x = 0) {
    P = layout(kind, x);
    pose.x = P.x; pose.z = P.z; pose.yaw = P.yaw;
    for (const side of ['L', 'R']) {
      st.pos[side].copy(P.rest[side]);
      st.q[side].copy(P.restQ[side]);
      st.off[side].set(0, 0, 0);
      st.vel[side].set(0, 0, 0);
      over.curls[side] = null;
    }
  }

  function hit(side, impulse) {
    if (!P.springs) return;
    st.vel[side].add(impulse);
    st.nod = Math.min(1, st.nod + impulse.length() * 0.4);
  }

  function setRemote(s) {
    st.remote = s;
    st.remoteAge = 0;
  }

  const active = () => st.remoteAge < 1.5;

  function update(dt) {
    st.remoteAge += dt;
    const r = active() ? st.remote : null;
    robot.root.visible = P.kind === 'face' || !!r;
    for (const side of ['L', 'R']) {
      const o = st.off[side], v = st.vel[side];
      v.addScaledVector(o, -70 * dt).multiplyScalar(Math.exp(-dt * 9));
      o.addScaledVector(v, dt);
      if (o.length() > 0.22) o.setLength(0.22);
      const oc = over.curls[side];
      if (r) {
        st.pos[side].lerp(P.toWorld(r[side]), 1 - Math.exp(-dt * 25));
        st.q[side].slerp(P.qWorld(r['q' + side]), 1 - Math.exp(-dt * 25));
        const c = oc || r['c' + side];
        for (let i = 0; i < 6; i++) st.curls[side][i] += (c[i] - st.curls[side][i]) * (1 - Math.exp(-dt * 20));
      } else {
        st.pos[side].lerp(P.rest[side], 1 - Math.exp(-dt * 6));
        st.q[side].slerp(P.restQ[side], 1 - Math.exp(-dt * 6));
        const c = oc || P.restCurls;
        for (let i = 0; i < 6; i++) st.curls[side][i] += (c[i] - st.curls[side][i]) * (1 - Math.exp(-dt * 6));
      }
    }
    st.nod *= Math.exp(-dt * 3);
    const k = 1 - Math.exp(-dt * 10);
    st.lean += ((r ? r.lean : -0.06 * st.nod) - st.lean) * k;
    st.side += ((r ? r.side : 0) - st.side) * k;
    st.twist += ((r ? r.twist : 0) - st.twist) * k;
    applyPose(robot, pose);
    bendChest(robot, st.lean, st.side, st.twist);
    solveLimb(robot, 'armL', st.pos.L.clone().add(st.off.L), P.pole.L, st.q.L);
    solveLimb(robot, 'armR', st.pos.R.clone().add(st.off.R), P.pole.R, st.q.R);
    applyHand(robot, 'L', st.curls.L);
    applyHand(robot, 'R', st.curls.R);
    lookHead(robot, P.look.clone().add(V(0, -0.05 * st.nod, 0)));
    robot.root.updateMatrixWorld(true);
  }

  return { st, over, hit, setRemote, update, place, active, get rest() { return P.rest; }, get layout() { return P; } };
}
