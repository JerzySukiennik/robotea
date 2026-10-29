// Robotea: finger-gun gesture per hand (L pose, thumb hammer drop or an upward flick fires, a held hammer keeps automatic fire going)
export function createTrigger() {
  const mk = () => ({ gun: false, poseT: 0, lostT: 0, hammer: false, hist: [], flickArmed: true, flickT: 0, base: 0 });
  const st = { L: mk(), R: mk() };

  function update(side, s, dt) {
    const h = st[side];
    const out = { gun: h.gun, fire: false, held: false, flick: false };
    if (!s) { h.lostT += dt; if (h.lostT > 0.4) h.gun = false; out.gun = h.gun; return out; }
    const c = s.curls;
    const others = (c[2] + c[3] + c[4]) / 3;
    const pose = c[1] < 0.45 && others > 0.42 && others - c[1] > 0.22;
    if (pose) { h.poseT += dt; h.lostT = 0; } else { h.lostT += dt; h.poseT = 0; }
    if (!h.gun && h.poseT > 0.12) h.gun = true;
    if (h.gun && h.lostT > 0.3) h.gun = false;
    const wasDown = h.hammer;
    if (!h.hammer && s.hammer > 0.62) h.hammer = true;
    else if (h.hammer && s.hammer < 0.38) h.hammer = false;
    const pitch = Math.asin(Math.max(-1, Math.min(1, s.index[1])));
    const t = s.t;
    h.hist.push([t, pitch]);
    while (h.hist.length && t - h.hist[0][0] > 0.25) h.hist.shift();
    let lo = pitch, vel = 0;
    for (const [tt, p] of h.hist) if (t - tt < 0.16) lo = Math.min(lo, p);
    if (h.hist.length > 2) {
      const [t0, p0] = h.hist[h.hist.length - 3];
      vel = (pitch - p0) / Math.max(t - t0, 1e-3);
    }
    h.flickT += dt;
    if (h.gun && h.flickArmed && pitch - lo > 0.32 && vel > 3) {
      out.fire = true;
      out.flick = true;
      h.flickArmed = false;
      h.flickT = 0;
      h.base = lo;
    }
    if (!h.flickArmed && h.flickT > 0.18 && (vel < 0.6 && pitch < h.base + 0.18 || h.flickT > 0.6)) h.flickArmed = true;
    if (h.gun && h.hammer && !wasDown) out.fire = true;
    out.gun = h.gun;
    out.held = h.gun && h.hammer;
    return out;
  }

  return { st, update };
}
