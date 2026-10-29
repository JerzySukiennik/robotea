// Robotea: Web Audio playback of recorded claps, shots and range sounds with pitch, gain, stereo, delay and a small-room reverb send
function roomImpulse(ctx, seconds, decay) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  const pre = Math.floor(ctx.sampleRate * 0.012);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / (n - pre);
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * Math.min(1, (i - pre) / (ctx.sampleRate * 0.004));
    }
    for (const [ms, g] of [[17, 0.5], [29, 0.35], [43, 0.28], [61, 0.2]]) {
      const i = Math.floor(ctx.sampleRate * (ms + c * 3) / 1000);
      if (i < n) d[i] += g;
    }
  }
  return buf;
}

export function createAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -8;
  comp.knee.value = 6;
  comp.ratio.value = 5;
  comp.attack.value = 0.002;
  comp.release.value = 0.12;
  master.connect(comp).connect(ctx.destination);
  const verb = ctx.createConvolver();
  verb.buffer = roomImpulse(ctx, 1.2, 3.2);
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.55;
  verb.connect(verbOut).connect(master);
  const banks = {};
  const recent = {};

  async function load(kind, urls) {
    const bufs = await Promise.all(urls.map(async u => {
      try {
        const r = await fetch(u);
        return await ctx.decodeAudioData(await r.arrayBuffer());
      } catch { return null; }
    }));
    banks[kind] = bufs.filter(Boolean);
  }

  function play(kind, strength = 1, pan = 0, o = {}) {
    const bank = banks[kind]?.length ? banks[kind] : (o.steady ? null : banks.clap);
    if (!bank?.length) return;
    let i = Math.floor(Math.random() * bank.length);
    if (bank.length > 1 && i === recent[kind]) i = (i + 1) % bank.length;
    recent[kind] = i;
    const src = ctx.createBufferSource();
    src.buffer = bank[i];
    const vary = o.steady ? 1 : 0.94 + Math.random() * 0.12 + (1 - strength) * 0.05;
    src.playbackRate.value = (o.rate || 1) * vary;
    const g = ctx.createGain();
    g.gain.value = (0.22 + 0.78 * strength) * (o.gain ?? 1);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    src.connect(g).connect(p).connect(master);
    if (o.wet) {
      const s = ctx.createGain();
      s.gain.value = o.wet;
      p.connect(s).connect(verb);
    }
    src.start(ctx.currentTime + (o.delay || 0));
  }

  return { ctx, load, play, resume: () => ctx.resume(), has: kind => !!banks[kind]?.length };
}
