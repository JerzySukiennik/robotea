// Robotea: CC0 PBR texture sets (Poly Haven, ambientCG) and procedural canvas textures for the kitchen
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map();
const pending = [];
let ROOT = './';
let ANISO = 8;

export function configureTextures({ root, anisotropy } = {}) {
  if (root !== undefined) ROOT = root;
  if (anisotropy !== undefined) ANISO = anisotropy;
}

export const texturesReady = () => Promise.all(pending);

function load(url, srgb) {
  if (!cache.has(url)) {
    const t = new THREE.Texture();
    pending.push(new Promise(res => loader.load(url, img => {
      t.image = img.image;
      t.needsUpdate = true;
      res();
    }, undefined, () => res())));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = ANISO;
    cache.set(url, t);
  }
  return cache.get(url);
}

export function pbr(name, { size = 1, rot = 0, offset = [0, 0] } = {}) {
  const dir = `${ROOT}assets/tex/${name}/`;
  const make = (file, srgb) => {
    const t = load(dir + file, srgb).clone();
    t.repeat.set(1 / size, 1 / size);
    t.offset.set(offset[0], offset[1]);
    t.rotation = rot;
    return t;
  };
  return { map: make('diff.jpg', true), normalMap: make('nor.jpg', false), roughnessMap: make('rough.jpg', false) };
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function valueNoise(w, h, cell, seed) {
  const r = rng(seed);
  const gw = Math.ceil(w / cell) + 1, gh = Math.ceil(h / cell) + 1;
  const g = new Float32Array(gw * gh).map(() => r());
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = y / cell, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
    for (let x = 0; x < w; x++) {
      const gx = x / cell, x0 = Math.floor(gx), fx = gx - x0, sx = fx * fx * (3 - 2 * fx);
      const i = y0 * gw + x0;
      const a = g[i % g.length], b = g[(i + 1) % g.length], c = g[(i + gw) % g.length], d = g[(i + gw + 1) % g.length];
      out[y * w + x] = a + (b - a) * sx + (c - a + (a - b - c + d) * sx) * sy;
    }
  }
  return out;
}

function fbm(w, h, cells, seed) {
  const out = new Float32Array(w * h);
  let amp = 1, tot = 0;
  cells.forEach((c, i) => {
    const n = valueNoise(w, h, c, seed + i * 977);
    for (let k = 0; k < out.length; k++) out[k] += n[k] * amp;
    tot += amp;
    amp *= 0.5;
  });
  for (let k = 0; k < out.length; k++) out[k] /= tot;
  return out;
}

function heightToNormal(hf, w, h, strength) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  const at = (x, y) => hf[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255;
      d[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function tex(c, srgb, repeat = [1, 1]) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SRGB = THREE.SRGBColorSpace;
const srgb = c => { const o = {}; new THREE.Color(c).getRGB(o, SRGB); return o; };

export function tiles(o) {
  const tw = o.tile[0], th = o.tile[1];
  const cols = Math.max(1, Math.round((o.span ?? 0.6) / tw)), rows = Math.max(2, Math.round((o.span ?? 0.6) / th / 2) * 2);
  const W = 1024, H = Math.round(W * (rows * th) / (cols * tw));
  const ppm = W / (cols * tw);
  const grout = Math.max(1.5, (o.grout ?? 0.0025) * ppm);
  const bevel = (o.bevel ?? 0.003) * ppm;
  const r = rng(o.seed ?? 7);
  const hf = new Float32Array(W * H);
  const col = new Float32Array(W * H * 3);
  const rough = new Float32Array(W * H);
  const gc = srgb(o.groutColor ?? 0xb9b4aa);
  const zel = o.pattern === 'zellige';
  const wave = zel ? fbm(W, H, [ppm * 0.05, ppm * 0.02], (o.seed ?? 7) + 11) : null;
  const speck = fbm(W, H, [ppm * 0.01, ppm * 0.004], (o.seed ?? 7) + 23);
  for (let i = 0; i < W * H; i++) { col[i * 3] = gc.r; col[i * 3 + 1] = gc.g; col[i * 3 + 2] = gc.b; rough[i] = 0.92; }
  const hsl = {};
  new THREE.Color(o.color).getHSL(hsl, SRGB);
  const tcc = new THREE.Color();
  for (let ry = 0; ry < rows; ry++) {
    const shift = o.pattern === 'subway' && ry % 2 ? 0.5 : 0;
    for (let cx = -1; cx <= cols; cx++) {
      const x0 = (cx + shift) * tw * ppm, y0 = ry * th * ppm, x1 = x0 + tw * ppm, y1 = y0 + th * ppm;
      const v = (o.vary ?? 0.03);
      tcc.setHSL(
        hsl.h + (r() - 0.5) * v * (zel ? 0.6 : 0.2),
        THREE.MathUtils.clamp(hsl.s * (1 + (r() - 0.5) * v * 4), 0, 1),
        THREE.MathUtils.clamp(hsl.l * (1 + (r() - 0.5) * v * 3), 0, 1), SRGB);
      const tc = {};
      tcc.getRGB(tc, SRGB);
      const tilt = [(r() - 0.5) * (zel ? 0.5 : 0.06), (r() - 0.5) * (zel ? 0.5 : 0.06)];
      const gl = (o.gloss ?? 0.14) * (0.8 + r() * 0.4);
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const px = ((x % W) + W) % W, py = ((y % H) + H) % H;
          const dEdge = Math.min(x - x0, x1 - x, y - y0, y1 - y) - grout / 2;
          if (dEdge <= 0) continue;
          const k = py * W + px;
          const b = Math.min(1, dEdge / Math.max(bevel, 0.5));
          const bb = b * b * (3 - 2 * b);
          const u = (x - x0) / (x1 - x0) - 0.5, w2 = (y - y0) / (y1 - y0) - 0.5;
          let hgt = 0.35 + 0.65 * bb + (u * tilt[0] + w2 * tilt[1]);
          if (zel) hgt += (wave[k] - 0.5) * 0.9 * bb;
          hf[k] = hgt;
          const pool = zel ? 0.78 + 0.22 * bb + (wave[k] - 0.5) * 0.35 : 0.94 + 0.06 * bb;
          const sp = 1 + (speck[k] - 0.5) * (zel ? 0.18 : 0.05);
          col[k * 3] = tc.r * pool * sp;
          col[k * 3 + 1] = tc.g * pool * sp;
          col[k * 3 + 2] = tc.b * pool * sp;
          rough[k] = gl + (1 - bb) * 0.25;
        }
      }
    }
  }
  const cm = canvas(W, H), rm = canvas(W, H);
  const ci = cm.getContext('2d').createImageData(W, H), ri = rm.getContext('2d').createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    ci.data[i * 4] = Math.min(255, col[i * 3] * 255);
    ci.data[i * 4 + 1] = Math.min(255, col[i * 3 + 1] * 255);
    ci.data[i * 4 + 2] = Math.min(255, col[i * 3 + 2] * 255);
    ci.data[i * 4 + 3] = 255;
    const rv = Math.min(255, rough[i] * 255);
    ri.data[i * 4] = ri.data[i * 4 + 1] = ri.data[i * 4 + 2] = rv;
    ri.data[i * 4 + 3] = 255;
  }
  cm.getContext('2d').putImageData(ci, 0, 0);
  rm.getContext('2d').putImageData(ri, 0, 0);
  const nm = heightToNormal(hf, W, H, o.normal ?? 2.2);
  return { map: tex(cm, true), normalMap: tex(nm, false), roughnessMap: tex(rm, false), size: [cols * tw, rows * th] };
}

export function paint(color, { seed = 3, grain = 0.035, roughness = 0.9 } = {}) {
  const W = 512, H = 512;
  const n = fbm(W, H, [160, 60, 18, 5], seed);
  const c = canvas(W, H), ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
  const r = canvas(W, H), rctx = r.getContext('2d'), rimg = rctx.createImageData(W, H);
  const base = srgb(color);
  for (let i = 0; i < W * H; i++) {
    const v = 1 + (n[i] - 0.5) * grain * 2;
    img.data[i * 4] = Math.min(255, base.r * v * 255);
    img.data[i * 4 + 1] = Math.min(255, base.g * v * 255);
    img.data[i * 4 + 2] = Math.min(255, base.b * v * 255);
    img.data[i * 4 + 3] = 255;
    const rv = Math.min(255, (roughness + (n[i] - 0.5) * 0.08) * 255);
    rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = rv;
    rimg.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  const hf = fbm(W, H, [40, 10, 3], seed + 5);
  return { map: tex(c, true), roughnessMap: tex(r, false), normalMap: tex(heightToNormal(hf, W, H, 0.6), false), size: [1, 1] };
}

export function outside(kind) {
  const W = 1024, H = 768, c = canvas(W, H), ctx = c.getContext('2d');
  const r = rng(kind.length * 31);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (kind === 'night') {
    g.addColorStop(0, '#0b1424'); g.addColorStop(0.55, '#16243a'); g.addColorStop(1, '#0d1522');
  } else if (kind === 'morning') {
    g.addColorStop(0, '#9cc4ec'); g.addColorStop(0.55, '#d7e6f2'); g.addColorStop(1, '#f6e9d2');
  } else {
    g.addColorStop(0, '#d9dde1'); g.addColorStop(0.6, '#e6e8ea'); g.addColorStop(1, '#cfd3d2');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.filter = 'blur(10px)';
  if (kind === 'night') {
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(255,${170 + r() * 50 | 0},${90 + r() * 60 | 0},${0.35 + r() * 0.45})`;
      const x = r() * W, y = H * (0.45 + r() * 0.4), s = 8 + r() * 26;
      ctx.fillRect(x, y, s, s * (0.8 + r()));
    }
    ctx.fillStyle = 'rgba(4,8,14,0.85)';
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(r() * W, H * 0.95, 90 + r() * 120, 160 + r() * 140, 0, 0, Math.PI * 2); ctx.fill(); }
  } else if (kind === 'morning') {
    const sun = ctx.createRadialGradient(W * 0.78, H * 0.18, 10, W * 0.78, H * 0.18, 380);
    sun.addColorStop(0, 'rgba(255,248,225,0.95)'); sun.addColorStop(1, 'rgba(255,248,225,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 12; i++) {
      const gr = 70 + r() * 60 | 0;
      ctx.fillStyle = `rgba(${gr - 30},${gr + 60},${gr - 20},0.8)`;
      ctx.beginPath(); ctx.ellipse(r() * W, H * (0.68 + r() * 0.3), 70 + r() * 110, 60 + r() * 90, 0, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    for (let i = 0; i < 9; i++) {
      const x = r() * W;
      ctx.fillStyle = 'rgba(236,236,232,0.9)';
      ctx.fillRect(x, H * 0.2, 14 + r() * 10, H);
      ctx.fillStyle = 'rgba(60,64,62,0.55)';
      for (let k = 0; k < 6; k++) ctx.fillRect(x, H * (0.3 + r() * 0.65), 16, 4 + r() * 6);
    }
    ctx.fillStyle = 'rgba(150,165,140,0.55)';
    for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.ellipse(r() * W, H * 0.3 * r(), 120, 80, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.filter = 'none';
  return tex(c, true);
}

export function rain() {
  const W = 1024, H = 1024, c = canvas(W, H), ctx = c.getContext('2d');
  const hc = canvas(W, H), hctx = hc.getContext('2d');
  const r = rng(77);
  hctx.fillStyle = '#000';
  hctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const x = r() * W, y = r() * H, s = 1.5 + Math.pow(r(), 3) * 9;
    const g = hctx.createRadialGradient(x, y, 0, x, y, s);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    hctx.fillStyle = g;
    hctx.beginPath(); hctx.ellipse(x, y, s, s * (1 + r() * 0.4), 0, 0, Math.PI * 2); hctx.fill();
    if (s > 6 && r() < 0.5) {
      hctx.strokeStyle = 'rgba(255,255,255,0.35)';
      hctx.lineWidth = s * 0.5;
      hctx.beginPath(); hctx.moveTo(x, y); hctx.lineTo(x + (r() - 0.5) * 6, y + 40 + r() * 120); hctx.stroke();
    }
  }
  const hd = hctx.getImageData(0, 0, W, H).data;
  const hf = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) hf[i] = hd[i * 4] / 255;
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    img.data[i * 4] = 200; img.data[i * 4 + 1] = 215; img.data[i * 4 + 2] = 235;
    img.data[i * 4 + 3] = Math.min(255, hf[i] * 120);
  }
  ctx.putImageData(img, 0, 0);
  return { map: tex(c, true), normalMap: tex(heightToNormal(hf, W, H, 6), false) };
}

export function label(lines, { w = 512, h = 256, bg = null, color = '#222', font = '600 64px Helvetica', align = 'center', pad = 24, lineH = 1.2, hand = false } = {}) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const size = parseFloat(font.match(/(\d+)px/)[1]);
  const total = lines.length * size * lineH;
  lines.forEach((t, i) => {
    const x = align === 'center' ? w / 2 : align === 'left' ? pad : w - pad;
    const y = h / 2 - total / 2 + size * lineH * (i + 0.5);
    if (hand) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((i * 37) % 7 - 3) * 0.004);
      ctx.fillText(t, 0, 0);
      ctx.restore();
    } else ctx.fillText(t, x, y);
  });
  return tex(c, true);
}

export function paper(seed = 5, tint = '#f4efe2') {
  const W = 512, H = 640, c = canvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);
  const n = fbm(W, H, [64, 16, 4], seed);
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < W * H; i++) {
    const v = 1 + (n[i] - 0.5) * 0.08;
    img.data[i * 4] *= v; img.data[i * 4 + 1] *= v; img.data[i * 4 + 2] *= v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function orderNote(lines) {
  const c = paper(9);
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(90,120,170,0.25)';
  ctx.lineWidth = 2;
  for (let y = 150; y < 640; y += 82) { ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(482, y); ctx.stroke(); }
  ctx.fillStyle = '#1d2a44';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 70px "Jurek Hand", "Bradley Hand", cursive';
  ctx.fillText(lines[0], 40, 118);
  ctx.font = '500 58px "Jurek Hand", "Bradley Hand", cursive';
  lines.slice(1).forEach((t, i) => {
    ctx.save();
    ctx.translate(48, 222 + i * 82);
    ctx.rotate((i % 2 ? 1 : -1) * 0.012);
    ctx.fillText(t, 0, 0);
    ctx.restore();
  });
  return tex(c, true);
}

export function paintLcd(t, text, { color = '#7fe3ff', bg = '#05080a', font = '600 64px Menlo, monospace', dim = false } = {}) {
  const c = t.image, ctx = c.getContext('2d'), w = c.width, h = c.height;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = dim ? 0 : 12;
  ctx.fillStyle = dim ? 'rgba(127,227,255,0.18)' : color;
  ctx.fillText(text, w / 2, h / 2 + 2);
  ctx.shadowBlur = 0;
  t.needsUpdate = true;
}

export function lcd(text, { w = 256, h = 96, color = '#7fe3ff', bg = '#05080a', font = '600 64px Menlo, monospace' } = {}) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2 + 2);
  return tex(c, true);
}

export function sugar() {
  const W = 256, H = 256, c = canvas(W, H), ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
  const r = rng(13);
  for (let i = 0; i < W * H; i++) {
    const v = 225 + r() * 30;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v - 4; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const hf = new Float32Array(W * H).map(() => r());
  return { map: tex(c, true), normalMap: tex(heightToNormal(hf, W, H, 1.5), false) };
}
