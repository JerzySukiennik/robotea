// Robotea: scripted self-tests (dev only): ?selftest=1 swings the hands into the partner's palms, ?selftest=range aims at targets and fires
import * as THREE from 'three';
import { ZERO } from '../../src/range.js';
import { WEAPONS } from '../../src/guns.js';
import { KA } from '../../src/shoot.js';

export function createSelftest({ ctrl, partner }) {
  let t = 0;
  const st = ctrl.st;
  return {
    update(dt) {
      t += dt;
      const cycle = 1.6, phase = t % cycle, which = Math.floor(t / cycle) % 3;
      for (const side of ['L', 'R']) {
        const active = which === 2 || (which === 0 && side === 'L') || (which === 1 && side === 'R');
        const rest = ctrl.base(side).clone();
        const theirs = partner.rest[side === 'L' ? 'R' : 'L'].clone().add(new THREE.Vector3(0, 0, -0.02));
        const k = active ? Math.sin(Math.min(1, phase / 0.9) * Math.PI) : 0;
        st.target[side].lerpVectors(rest, theirs, k);
      }
    },
  };
}

export function createRangeBot({ ctrl, shooting, cycle = false, both = true, demo = false }) {
  const AIMS = demo ? [[0.03, 1.55, 10], [-0.03, 1.53, 10]] : [[0.4, 1.49, 4], [-0.42, 1.51, 7], [0, 1.54, 10], [-0.15, 1.0, 5.5], [0.05, 1.05, 8.5]];
  let t = 0, fireT = 0.8, pick = demo ? { L: 0, R: 1 } : { L: 1, R: 0 }, side = 'L', gunT = 0, gi = 0;
  return {
    update(dt) {
      t += dt;
      for (const s of ['L', 'R']) {
        ctrl.st.unseen[s] = (both || s === 'R') ? 0 : 9;
        const b = ctrl.base(s);
        const [x, y, z] = AIMS[pick[s]];
        const y0 = Math.atan2(ZERO.x - b.x, ZERO.z - b.z), p0 = Math.atan2(ZERO.y - b.y - 0.045, ZERO.z - b.z);
        const yaw = Math.atan2(x - b.x, z - b.z) + Math.sin(t * 1.7 + (s === 'L' ? 0 : 2)) * 0.004;
        const pitch = Math.atan2(y - b.y - 0.045, z - b.z) + Math.sin(t * 2.3 + (s === 'L' ? 1 : 3)) * 0.004;
        ctrl.st.target[s].set(b.x + (yaw - y0) / KA, b.y + (pitch - p0) / KA, b.z);
      }
      fireT -= dt;
      if (fireT <= 0) {
        fireT = demo ? 0.6 : 0.32;
        if (shooting.fire(side)) pick[side] = demo ? (side === 'L' ? 0 : 1) : (pick[side] + 1 + Math.floor(Math.random() * 2)) % AIMS.length;
        if (both) side = side === 'L' ? 'R' : 'L';
      }
      gunT += dt;
      if (cycle && gunT > 4) {
        gunT = 0;
        gi = (gi + 1) % WEAPONS.length;
        shooting.equip(WEAPONS[gi].id);
      }
    },
  };
}
