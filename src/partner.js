// Robotea: the robot facing you (springy raised hands in solo, the remote player's pose online)
import * as THREE from 'three';
import { standPose, applyPose, solveLimb, handBasis, bendChest, applyHand, lookHead } from './pose.js';
import { OPEN } from './robot.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const GAP = 0.8;
const POLE = { L: V(1, 1, -0.2).normalize(), R: V(-1, 1, -0.2).normalize() };
const FLIP = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI);

export function createPartner(robot) {
  const pose = standPose();
  pose.yaw = Math.PI;
  pose.z = GAP;
  const rest = { L: V(-0.2, 1.36, GAP - 0.29), R: V(0.2, 1.36, GAP - 0.29) };
  const restQ = {
    L: handBasis('L', V(-0.05, 1, -0.25), V(0, 0, -1)),
    R: handBasis('R', V(0.05, 1, -0.25), V(0, 0, -1)),
  };
  const st = {
    off: { L: V(), R: V() }, vel: { L: V(), R: V() },
    pos: { L: rest.L.clone(), R: rest.R.clone() },
    q: { L: restQ.L.clone(), R: restQ.R.clone() },
    curls: { L: [...OPEN], R: [...OPEN] },
    lean: 0, side: 0, twist: 0, nod: 0, remote: null, remoteAge: 9,
  };
  const target = V(0, 1.6, 0.12);

  function hit(side, impulse) {
    st.vel[side].add(impulse);
    st.nod = Math.min(1, st.nod + impulse.length() * 0.4);
  }

  function setRemote(s) {
    st.remote = s;
    st.remoteAge = 0;
  }

  const toWorld = p => V(-p.x, p.y, GAP - p.z);
  const qWorld = q => FLIP.clone().multiply(q);

  function update(dt) {
    st.remoteAge += dt;
    const r = st.remoteAge < 1.5 ? st.remote : null;
    for (const side of ['L', 'R']) {
      const o = st.off[side], v = st.vel[side];
      v.addScaledVector(o, -70 * dt).multiplyScalar(Math.exp(-dt * 9));
      o.addScaledVector(v, dt);
      if (o.length() > 0.22) o.setLength(0.22);
      if (r) {
        const p = toWorld(r[side]);
        st.pos[side].lerp(p, 1 - Math.exp(-dt * 25));
        st.q[side].slerp(qWorld(r['q' + side]), 1 - Math.exp(-dt * 25));
        const c = r['c' + side];
        for (let i = 0; i < 6; i++) st.curls[side][i] += (c[i] - st.curls[side][i]) * (1 - Math.exp(-dt * 20));
      } else {
        st.pos[side].lerp(rest[side], 1 - Math.exp(-dt * 6));
        st.q[side].slerp(restQ[side], 1 - Math.exp(-dt * 6));
        for (let i = 0; i < 6; i++) st.curls[side][i] += (OPEN[i] - st.curls[side][i]) * (1 - Math.exp(-dt * 6));
      }
    }
    st.nod *= Math.exp(-dt * 3);
    const k = 1 - Math.exp(-dt * 10);
    st.lean += ((r ? r.lean : -0.06 * st.nod) - st.lean) * k;
    st.side += ((r ? r.side : 0) - st.side) * k;
    st.twist += ((r ? r.twist : 0) - st.twist) * k;
    applyPose(robot, pose);
    bendChest(robot, st.lean, st.side, st.twist);
    solveLimb(robot, 'armL', st.pos.L.clone().add(st.off.L), POLE.L, st.q.L);
    solveLimb(robot, 'armR', st.pos.R.clone().add(st.off.R), POLE.R, st.q.R);
    applyHand(robot, 'L', st.curls.L);
    applyHand(robot, 'R', st.curls.R);
    lookHead(robot, target.clone().add(V(0, -0.05 * st.nod, 0)));
    robot.root.updateMatrixWorld(true);
  }

  return { st, hit, setRemote, update, rest };
}
