// Robotea: tea rules (random order, kettle heater with auto-off, tap flow, brewing timer, sugar spoon, serving and the star rating)
import * as THREE from 'three';
import { PARTICLE_ML } from './fluid.js';

export const KIND_ID = { black: 1, green: 2, fruit: 3 };
export const KIND_NAME = { 1: 'black', 2: 'green', 3: 'fruit' };
export const SPOON_PARTICLES = 14;
const STRENGTH = { weak: [0.06, 0.17], medium: [0.17, 0.32], strong: [0.32, 0.6] };
const AMOUNT = { full: [215, 300], half: [105, 165] };

export function randomOrder(r = Math.random) {
  const pick = a => a[Math.floor(r() * a.length)];
  return { kind: pick(['black', 'black', 'green', 'fruit']), strength: pick(['weak', 'medium', 'strong']), sugar: pick([0, 1, 1, 2, 2, 3]), amount: pick(['full', 'full', 'half']) };
}

export function orderLines(o) {
  const kind = { black: 'Black tea', green: 'Green tea', fruit: 'Fruit tea' }[o.kind];
  const sugar = o.sugar === 0 ? 'no sugar' : o.sugar === 1 ? '1 sugar' : `${o.sugar} sugars`;
  return [kind, o.strength, sugar, o.amount === 'full' ? 'full mug' : 'half a mug'];
}

const _inv = new THREE.Matrix4(), _p = new THREE.Vector3();

export function measure(fluid, obj, { r = 0.037, y0 = 0.008, y1 = 0.1 } = {}) {
  _inv.copy(obj.matrixWorld).invert();
  const P = fluid.cpuPos, A = fluid.cpuAttr;
  let n = 0, temp = 0, tea = 0, sweet = 0;
  const kinds = [0, 0, 0, 0];
  for (let i = 0; i < fluid.cpuCount; i++) {
    const w = P[i * 4 + 3];
    if (w < 0.5 || w > 1.5) continue;
    _p.set(P[i * 4], P[i * 4 + 1], P[i * 4 + 2]).applyMatrix4(_inv);
    if (_p.y < y0 || _p.y > y1 || _p.x * _p.x + _p.z * _p.z > r * r) continue;
    n++;
    temp += A[i * 4];
    tea += A[i * 4 + 1];
    sweet += A[i * 4 + 2];
    const k = Math.round(A[i * 4 + 3]);
    if (k > 0 && A[i * 4 + 1] > 0.02) kinds[k]++;
  }
  const kind = kinds[1] + kinds[2] + kinds[3] ? kinds.indexOf(Math.max(kinds[1], kinds[2], kinds[3])) : 0;
  return { n, ml: n * PARTICLE_ML, temp: n ? temp / n : 0, tea: n ? tea / n : 0, spoons: sweet / SPOON_PARTICLES, kind };
}

export function spillStats(fluid, isInside) {
  const P = fluid.cpuPos;
  let counter = 0, floor = 0;
  for (let i = 0; i < fluid.cpuCount; i++) {
    const w = P[i * 4 + 3];
    if (w < 0.5 || w > 1.5) continue;
    const x = P[i * 4], y = P[i * 4 + 1], z = P[i * 4 + 2];
    if (isInside(x, y, z)) continue;
    if (y < 0.3) floor++;
    else if (y < 1.0) counter++;
  }
  return { ml: (counter + floor) * PARTICLE_ML, floor: floor * PARTICLE_ML };
}

export function rate(order, cup, extra) {
  const lines = [];
  let score = 0, wsum = 0;
  const add = (label, value, s, w) => { lines.push({ label, value, ok: s >= 0.75, s }); score += s * w; wsum += w; };
  const kindOk = cup.kind === KIND_ID[order.kind];
  add('Tea', cup.kind ? KIND_NAME[cup.kind] : 'none', kindOk ? 1 : 0, 2);
  const [s0, s1] = STRENGTH[order.strength];
  const sDist = cup.tea < s0 ? (s0 - cup.tea) / s0 : cup.tea > s1 ? (cup.tea - s1) / s1 : 0;
  const sWord = cup.tea < 0.06 ? 'barely tea' : cup.tea < 0.17 ? 'weak' : cup.tea < 0.32 ? 'medium' : cup.tea < 0.6 ? 'strong' : 'stewed';
  add('Strength', sWord, Math.max(0, 1 - sDist * 1.6), 1.5);
  const sp = Math.round(cup.spoons * 2) / 2;
  add('Sugar', `${sp} of ${order.sugar}`, Math.max(0, 1 - Math.abs(cup.spoons - order.sugar) * 0.5), 1);
  const [a0, a1] = AMOUNT[order.amount];
  const aDist = cup.ml < a0 ? (a0 - cup.ml) / a0 : cup.ml > a1 ? (cup.ml - a1) / a1 : 0;
  add('Amount', `${Math.round(cup.ml)} ml`, Math.max(0, 1 - aDist * 2.2), 1);
  add('Temperature', `${Math.round(cup.temp)}°C`, cup.temp >= 62 ? 1 : cup.temp >= 48 ? 0.6 : 0.15, 1);
  if (order.kind === 'green') add('Water for green', extra.greenTemp ? `${Math.round(extra.greenTemp)}°C` : 'n/a', !extra.greenTemp ? 0.5 : extra.greenTemp <= 88 ? 1 : extra.greenTemp <= 94 ? 0.6 : 0.25, 0.8);
  add('Bag removed', extra.bagIn ? 'no' : 'yes', extra.bagIn ? 0.35 : 1, 0.6);
  add('Spilled', `${Math.round(extra.spilled)} ml`, Math.max(0, 1 - Math.max(0, extra.spilled - 15) / 120), 0.8);
  add('Broken mugs', String(extra.broken), Math.max(0, 1 - extra.broken * 0.5), 0.8);
  const t = extra.seconds;
  add('Time', `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`, t < 150 ? 1 : t < 300 ? 0.8 : 0.6, 0.4);
  let stars = Math.round(1 + 4 * (score / wsum) ** 1.3);
  if (!kindOk) stars = Math.min(stars, 2);
  if (cup.ml < 30) stars = 1;
  stars = Math.max(1, Math.min(5, stars));
  const verdict = ['Basically warm sugar water', 'Drinkable, technically', 'A decent cuppa', 'Lovely tea', 'Perfect cuppa'][stars - 1];
  return { stars, lines, verdict, score: score / wsum };
}
