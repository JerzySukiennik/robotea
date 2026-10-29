// Robotea: scripted test driver that moves the robot hands through a timeline (dev only, loaded with ?bot=<name>)
import * as THREE from 'three';
import { handBasis } from '../../src/pose.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = x => x * x * (3 - 2 * x);

export function createBot(name, ctx) {
  const { ctrl, K, phys } = ctx;
  const top = K.top;
  const F = V(0, -0.12, 1).normalize(), N = V(-1, 0, 0);
  const grip = (point, f = F, n = N) => point.clone().sub(f.clone().multiplyScalar(0.085)).sub(n.clone().multiplyScalar(0.022));
  const handleOf = (origin) => origin.clone().add(V(0.126, 0.12, 0));
  const kettleOrigin = () => phys.kettle.obj.getWorldPosition(V());
  const Lh = (at, curl, f = F, n = N, t = 1) => ({ t, L: { at: typeof at === 'function' ? at : () => at.clone(), finger: f, palm: n, curl } });
  const Rh = (at, curl, f, n, t = 1) => ({ t, R: { at: typeof at === 'function' ? at : () => at.clone(), finger: f, palm: n, curl } });
  const base0 = V(K.kettle.x, top + 0.027, K.kettle.z);
  const sinkSpot = V(K.tap.x, top - K.thick - K.sink.depth + 0.004, K.tap.z - 0.207);
  const knobHead = V(K.knob.x, top + 0.058, K.knob.z);
  const knobF = th => V(0.05 * Math.sin(th), -1, 0.05 * Math.cos(th)).normalize();
  const knobN = th => V(-Math.sin(th), 0, -Math.cos(th));
  const knobW = th => grip(knobHead, knobF(th), knobN(th));
  const plans = {
    idle: () => [{ t: 600 }],
    brew: () => {
      const steps = [{ t: 35 }];
      steps.setup = c => {
        const m = c.phys.mugs[0];
        const cx = K.tray.x + 0.03, cz = K.tray.z + 0.01;
        m.body.setTranslation({ x: cx, y: top + 0.016, z: cz }, true);
        m.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        const bag = c.phys.bags.find(b => b.teaKind === 'black');
        bag.body.setTranslation({ x: cx + 0.005, y: top + 0.06, z: cz }, true);
        bag.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        bag.tag.body.setTranslation({ x: cx + 0.06, y: top + 0.06, z: cz - 0.03 }, true);
        const list = [];
        const sp = 0.006;
        for (let y = 0; y < 13; y++) for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) {
          const px = x * sp + (y % 2) * sp * 0.5, pz = z * sp;
          if (px * px + pz * pz > 0.031 * 0.031) continue;
          list.push({ x: cx + px, y: top + 0.034 + y * sp, z: cz + pz, temp: 94 });
        }
        c.fluid.emit(list);
      };
      steps.end = 'serve';
      return steps;
    },
    button: () => {
      const btn = V(K.kettle.x + 0.026, top + 0.014, K.kettle.z - 0.092);
      const pf = V(0.15, -0.55, 1).normalize(), pn = V(-0.1, -1, -0.5).normalize();
      return [
        Rh(btn.clone().sub(pf.clone().multiplyScalar(0.2)).add(V(0, 0.04, -0.03)), 0.15, pf, pn, 1.5),
        Rh(btn.clone().sub(pf.clone().multiplyScalar(0.16)), 0.15, pf, pn, 0.8),
        Rh(btn.clone().sub(pf.clone().multiplyScalar(0.16)), 0.15, pf, pn, 3),
      ];
    },
    kettle: () => [
      Lh(grip(handleOf(base0)).add(V(0.02, 0.14, -0.03)), 0.05, F, N, 1.4),
      Lh(grip(handleOf(base0)), 0.05, F, N, 1.0),
      Lh(grip(handleOf(base0)), 0.78, F, N, 0.7),
      Lh(grip(handleOf(base0)).add(V(0.05, 0.22, -0.02)), 0.78, F, N, 1.4),
      Lh(V(0.62, top + 0.33, 0.47), 0.78, F, N, 1.5),
      Lh(V(0.62, top + 0.33, 0.47), 0.78, F, N, 1.0),
    ],
    fill: () => {
      const steps = [
        Lh(grip(handleOf(base0)).add(V(0.02, 0.14, -0.03)), 0.05, F, N, 1.3),
        Lh(grip(handleOf(base0)), 0.05, F, N, 0.9),
        Lh(grip(handleOf(base0)), 0.78, F, N, 0.6),
        Lh(grip(handleOf(base0)).add(V(0.03, 0.26, -0.02)), 0.78, F, N, 1.1),
        Lh(grip(handleOf(sinkSpot)).add(V(0, 0.3, 0)), 0.78, F, N, 1.4),
        Lh(grip(handleOf(sinkSpot)).add(V(0, 0.01, 0)), 0.78, F, N, 1.1),
        Lh(grip(handleOf(sinkSpot)).add(V(0, 0.01, 0)), 0.1, F, N, 0.5),
        Lh(grip(handleOf(sinkSpot)).add(V(0.03, 0.2, -0.03)), 0.1, F, N, 0.8),
        Lh(knobW(0).add(V(0, 0.12, 0)), 0.1, knobF(0), knobN(0), 1.2),
        Lh(knobW(0), 0.1, knobF(0), knobN(0), 0.8),
        Lh(knobW(0), 0.75, knobF(0), knobN(0), 0.5),
      ];
      for (let k = 1; k <= 6; k++) steps.push(Lh(knobW(k * 0.38), 0.75, knobF(k * 0.38), knobN(k * 0.38), 0.25));
      steps.push(Lh(knobW(2.28), 0.75, knobF(2.28), knobN(2.28), 3.8));
      for (let k = 5; k >= 0; k--) steps.push(Lh(knobW(k * 0.38), 0.75, knobF(k * 0.38), knobN(k * 0.38), 0.25));
      steps.push(
        Lh(knobW(0), 0.1, knobF(0), knobN(0), 0.5),
        Lh(knobW(0).add(V(0, 0.12, 0)), 0.1, knobF(0), knobN(0), 0.7),
        Lh(() => grip(handleOf(kettleOrigin())).add(V(0.02, 0.14, -0.03)), 0.05, F, N, 1.3),
        Lh(() => grip(handleOf(kettleOrigin())), 0.05, F, N, 0.9),
        Lh(() => grip(handleOf(kettleOrigin())), 0.78, F, N, 0.6),
        Lh(grip(handleOf(sinkSpot)).add(V(0, 0.3, 0)), 0.78, F, N, 1.1),
        Lh(grip(handleOf(base0)).add(V(0, 0.12, 0)), 0.78, F, N, 1.4),
        Lh(grip(handleOf(base0)).add(V(0, 0.004, 0)), 0.78, F, N, 1.0),
        Lh(grip(handleOf(base0)).add(V(0, 0.004, 0)), 0.1, F, N, 0.5),
        Lh(V(0.24, 1.12, 0.32), 0.25, V(-0.2, -0.45, 1), V(0.1, -1, -0.15), 1.0),
      );
      const btn = V(K.kettle.x + 0.026, top + 0.014, K.kettle.z - 0.092);
      const pf = V(0.15, -0.55, 1).normalize(), pn = V(-0.1, -1, -0.5).normalize();
      steps.push(
        Rh(btn.clone().sub(pf.clone().multiplyScalar(0.2)).add(V(0, 0.04, -0.03)), 0.15, pf, pn, 1.2),
        Rh(btn.clone().sub(pf.clone().multiplyScalar(0.16)), 0.15, pf, pn, 0.6),
        Rh(btn.clone().sub(pf.clone().multiplyScalar(0.2)).add(V(0, 0.04, -0.05)), 0.15, pf, pn, 0.6),
        Rh(V(-0.22, 1.08, 0.31), 0.2, V(0.2, -0.45, 1), V(-0.1, -1, -0.15), 1.0),
        Rh(V(-0.22, 1.08, 0.31), 0.2, V(0.2, -0.45, 1), V(-0.1, -1, -0.15), 25),
      );
      return steps;
    },
  };
  const steps = plans[name]();
  const st = ctrl.st;
  let started = false;
  let i = 0, t = 0;
  const from = { L: st.cur.L.clone(), R: st.cur.R.clone() };
  const fromQ = { L: st.q.L.clone(), R: st.q.R.clone() };
  const fromC = { L: st.curls.L[1], R: st.curls.R[1] };
  return {
    done: false,
    update(dt) {
      if (!started) { started = true; steps.setup?.(ctx); }
      if (i >= steps.length) {
        if (!this.done && steps.end === 'serve') ctx.serve?.();
        this.done = true;
        return;
      }
      const s = steps[i];
      t += dt;
      const k = ease(Math.min(1, t / s.t));
      for (const side of ['L', 'R']) {
        const g = s[side];
        if (!g) continue;
        const to = g.at();
        st.target[side].lerpVectors(from[side], to, k);
        const q = handBasis(side, g.finger.clone().normalize(), g.palm.clone().normalize());
        if (g.finger.y < -0.9) q.copy(handBasis(side, g.finger.clone().normalize(), g.palm.clone().normalize()));
        st.qTarget[side].slerpQuaternions(fromQ[side], q, k);
        const c = fromC[side] + (g.curl - fromC[side]) * k;
        st.curls[side] = [c * 0.9, c, c, c, c, 0.1];
        st.closure[side] = c;
      }
      if (t >= s.t) {
        for (const side of ['L', 'R']) {
          if (!s[side]) continue;
          from[side] = s[side].at();
          fromQ[side] = st.qTarget[side].clone();
          fromC[side] = s[side].curl;
        }
        i++;
        t = 0;
      }
    },
  };
}
