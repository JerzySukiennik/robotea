// Robotea: Web Audio playback of recorded high-five claps and fist bumps with pitch, gain and stereo variation
export function createAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
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

  function play(kind, strength = 1, pan = 0) {
    const bank = banks[kind]?.length ? banks[kind] : banks.clap;
    if (!bank?.length) return;
    let i = Math.floor(Math.random() * bank.length);
    if (bank.length > 1 && i === recent[kind]) i = (i + 1) % bank.length;
    recent[kind] = i;
    const src = ctx.createBufferSource();
    src.buffer = bank[i];
    src.playbackRate.value = 0.94 + Math.random() * 0.12 + (1 - strength) * 0.05;
    const g = ctx.createGain();
    g.gain.value = 0.22 + 0.78 * strength;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    src.connect(g).connect(p).connect(master);
    src.start();
  }

  return { ctx, load, play, resume: () => ctx.resume() };
}
