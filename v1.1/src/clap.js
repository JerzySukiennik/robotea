// Robotea: hand-to-hand contact between you and the partner (high five, fist bump), with a no-pass-through constraint
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TOUCH = 0.072, RELEASE = 0.11, KEEP = 0.058;

export function palmFrame(robot, side, out = {}) {
  const b = robot.bones['hand' + side];
  b.updateMatrixWorld(true);
  const q = b.getWorldQuaternion(new THREE.Quaternion());
  const s = side === 'L' ? 1 : -1;
  out.center = V(0, -0.055, 0).applyQuaternion(q).add(b.getWorldPosition(V()));
  out.normal = V(-s, 0, 0).applyQuaternion(q);
  out.up = V(0, -1, 0).applyQuaternion(q);
  return out;
}

export function createClapper({ onContact }) {
  const pairs = {};
  const prev = {};
  const key = (a, b) => a + b;

  function update(me, meCtrl, partner, partnerCurls, dt, now) {
    const mine = { L: palmFrame(me, 'L'), R: palmFrame(me, 'R') };
    const theirs = { L: palmFrame(partner, 'L'), R: palmFrame(partner, 'R') };
    const vel = {};
    for (const [tag, set] of [['m', mine], ['t', theirs]]) {
      for (const side of ['L', 'R']) {
        const id = tag + side;
        const c = set[side].center;
        vel[id] = prev[id] ? c.clone().sub(prev[id]).divideScalar(Math.max(dt, 1e-3)) : V();
        prev[id] = c.clone();
      }
    }
    const push = { L: V(), R: V() };
    for (const a of ['L', 'R']) {
      for (const b of ['L', 'R']) {
        const A = mine[a], B = theirs[b];
        const d = A.center.distanceTo(B.center);
        const k = key(a, b);
        const p = pairs[k] || (pairs[k] = { touching: false, t: 0 });
        const dir = B.center.clone().sub(A.center).normalize();
        const closing = vel['m' + a].clone().sub(vel['t' + b]).dot(dir);
        if (!p.touching && d < TOUCH && closing > 0.22 && now - p.t > 280) {
          p.touching = true;
          p.t = now;
          const fistA = meCtrl.closure[a] > 0.55, fistB = (partnerCurls[b][1] + partnerCurls[b][2] + partnerCurls[b][3]) / 3 > 0.55;
          const facing = A.normal.dot(B.normal) < -0.15;
          const kind = fistA || fistB ? 'bump' : facing ? 'clap' : 'slap';
          onContact({ kind, a, b, point: A.center.clone().lerp(B.center, 0.5), strength: THREE.MathUtils.clamp(closing / 2.2, 0.15, 1), dir, vel: vel['m' + a].clone() });
        }
        if (p.touching && d > RELEASE) p.touching = false;
        if (d < KEEP) push[a].add(dir.clone().multiplyScalar(-(KEEP - d)));
      }
    }
    return push;
  }

  return { update };
}
