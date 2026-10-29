// Robotea: scripted self-test that swings the robot hands into the partner's palms (dev only, ?selftest=1)
import * as THREE from 'three';

export function createSelftest({ ctrl, partner }) {
  let t = 0;
  const st = ctrl.st;
  return {
    update(dt) {
      t += dt;
      const cycle = 1.6, phase = t % cycle, which = Math.floor(t / cycle) % 3;
      for (const side of ['L', 'R']) {
        const active = which === 2 || (which === 0 && side === 'L') || (which === 1 && side === 'R');
        const rest = ctrl.neutral[side].clone();
        const theirs = partner.rest[side === 'L' ? 'R' : 'L'].clone().add(new THREE.Vector3(0, 0, -0.02));
        const k = active ? Math.sin(Math.min(1, phase / 0.9) * Math.PI) : 0;
        st.target[side].lerpVectors(rest, theirs, k);
      }
    },
  };
}
