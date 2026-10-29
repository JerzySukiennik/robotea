// Robotea: Rapier physics for the tea kitchen (fixtures, kettle, mugs, spoon, tea bags on strings, cabinet doors, tap knob), robot hand bodies and secure grasping
import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/rapier.es.js';
import * as THREE from 'three';
import { K } from './kitchen.js';
import { FINGERS } from './optimus.js';

export { RAPIER };
export const initPhysics = () => RAPIER.init();

const M_WORLD = 1, M_DYN = 2, M_HAND = 4, M_HELD = 8;
const grp = (member, filter) => (member << 16) | filter;
const G_WORLD = grp(M_WORLD, 0xffff);
const G_DYN = grp(M_DYN, M_WORLD | M_DYN | M_HAND | M_HELD);
const G_HELD = grp(M_HELD, M_WORLD | M_DYN);
const G_HAND = grp(M_HAND, M_WORLD);
const G_SENSOR = grp(M_WORLD, M_HAND);

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const vec = v => ({ x: v.x, y: v.y, z: v.z });
const quat = q => ({ x: q.x, y: q.y, z: q.z, w: q.w });

export function createPhysics(kit) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  const P = kit.parts;
  const objects = [];
  const byHandle = new Map();

  const fixed = (x, y, z, q) => world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(q ? quat(q) : { x: 0, y: 0, z: 0, w: 1 }));
  const cuboid = (body, hx, hy, hz, x = 0, y = 0, z = 0, g = G_WORLD, fr = 0.6) => world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(fr).setCollisionGroups(g), body);

  const ground = fixed(0, 0, 0);
  const S = K.sink, top = K.top, t = K.thick, sy0 = top - t - S.depth;
  cuboid(ground, 3, 0.05, 3, 0, -0.05, 0);
  cuboid(ground, (S.x0 - K.x0) / 2, t / 2, (K.back - K.front) / 2, (K.x0 + S.x0) / 2, top - t / 2, (K.front + K.back) / 2);
  cuboid(ground, (K.x1 - S.x1) / 2, t / 2, (K.back - K.front) / 2, (S.x1 + K.x1) / 2, top - t / 2, (K.front + K.back) / 2);
  cuboid(ground, (S.x1 - S.x0) / 2, t / 2, (S.z0 - K.front) / 2, (S.x0 + S.x1) / 2, top - t / 2, (K.front + S.z0) / 2);
  cuboid(ground, (S.x1 - S.x0) / 2, t / 2, (K.back - S.z1) / 2, (S.x0 + S.x1) / 2, top - t / 2, (S.z1 + K.back) / 2);
  cuboid(ground, (S.x1 - S.x0) / 2, 0.01, (S.z1 - S.z0) / 2, (S.x0 + S.x1) / 2, sy0 - 0.01, (S.z0 + S.z1) / 2);
  cuboid(ground, 0.008, S.depth / 2, (S.z1 - S.z0) / 2, S.x0 - 0.008, sy0 + S.depth / 2, (S.z0 + S.z1) / 2);
  cuboid(ground, 0.008, S.depth / 2, (S.z1 - S.z0) / 2, S.x1 + 0.008, sy0 + S.depth / 2, (S.z0 + S.z1) / 2);
  cuboid(ground, (S.x1 - S.x0) / 2, S.depth / 2, 0.008, (S.x0 + S.x1) / 2, sy0 + S.depth / 2, S.z0 - 0.008);
  cuboid(ground, (S.x1 - S.x0) / 2, S.depth / 2, 0.008, (S.x0 + S.x1) / 2, sy0 + S.depth / 2, S.z1 + 0.008);
  cuboid(ground, 1.5, 1.4, 0.07, 0, 1.4, K.wallZ + 0.07);
  cuboid(ground, (K.x1 - K.x0) / 2, (top - t) / 2, 0.01, 0, (top - t) / 2, K.front + 0.035);
  cuboid(ground, 0.018, 0.02, 0.018, K.knob.x, top + 0.02, K.knob.z, G_WORLD);
  const tapBody = fixed(K.tap.x, top, K.tap.z);
  world.createCollider(RAPIER.ColliderDesc.capsule(0.12, 0.012).setTranslation(0, 0.13, 0).setCollisionGroups(G_WORLD), tapBody);
  world.createCollider(RAPIER.ColliderDesc.capsule(0.09, 0.012).setTranslation(0, 0.27, -0.1).setRotation(quat(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)))).setCollisionGroups(G_WORLD), tapBody);

  const baseBody = fixed(K.kettle.x, top, K.kettle.z);
  world.createCollider(RAPIER.ColliderDesc.cylinder(0.0135, 0.09).setTranslation(0, 0.0135, 0).setCollisionGroups(G_WORLD), baseBody);
  const sensorTypes = RAPIER.ActiveCollisionTypes.DEFAULT | RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED;
  const baseButton = world.createCollider(RAPIER.ColliderDesc.ball(0.022).setTranslation(0.026, 0.016, -0.096).setSensor(true).setCollisionGroups(G_SENSOR).setActiveCollisionTypes(sensorTypes).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), baseBody);

  const tr = fixed(K.tray.x, top, K.tray.z);
  cuboid(tr, 0.18, 0.006, 0.125, 0, 0.006, 0);
  cuboid(tr, 0.18, 0.013, 0.006, 0, 0.013, 0.119);
  cuboid(tr, 0.18, 0.013, 0.006, 0, 0.013, -0.119);
  cuboid(tr, 0.006, 0.013, 0.125, 0.174, 0.013, 0);
  cuboid(tr, 0.006, 0.013, 0.125, -0.174, 0.013, 0);

  const ch = fixed(K.chest.x, top, K.chest.z);
  const cw = (0.255 - 0.016) / 3;
  cuboid(ch, 0.1275, 0.004, 0.0575, 0, 0.004, 0);
  cuboid(ch, 0.004, 0.035, 0.0575, -0.1235, 0.035, 0);
  cuboid(ch, 0.004, 0.035, 0.0575, 0.1235, 0.035, 0);
  cuboid(ch, 0.1275, 0.035, 0.004, 0, 0.035, -0.0535);
  cuboid(ch, 0.1275, 0.035, 0.004, 0, 0.035, 0.0535);
  for (const k of [-1, 1]) cuboid(ch, 0.0025, 0.032, 0.05, k * cw / 2, 0.035, 0);

  const sb = fixed(K.sugar.x, top, K.sugar.z);
  for (let a = 0; a < 10; a++) {
    const ang = a / 10 * Math.PI * 2;
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.004, 0.028, 0.016).setTranslation(Math.cos(ang) * 0.048, 0.028, Math.sin(ang) * 0.048).setRotation(quat(_q.setFromAxisAngle(_v.set(0, 1, 0), -ang))).setCollisionGroups(G_WORLD), sb);
  }
  world.createCollider(RAPIER.ColliderDesc.cylinder(0.018, 0.044).setTranslation(0, 0.018, 0).setCollisionGroups(G_WORLD), sb);

  const bn = fixed(K.bin.x, top, K.bin.z);
  for (let a = 0; a < 12; a++) {
    const ang = a / 12 * Math.PI * 2;
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.005, 0.104, 0.024).setTranslation(Math.cos(ang) * 0.082, 0.104, Math.sin(ang) * 0.082).setRotation(quat(_q.setFromAxisAngle(_v.set(0, 1, 0), -ang))).setCollisionGroups(G_WORLD), bn);
  }
  cuboid(bn, 0.07, 0.005, 0.07, 0, 0.005, 0);

  const bl = fixed(K.bell.x, top, K.bell.z);
  world.createCollider(RAPIER.ColliderDesc.cylinder(0.02, 0.04).setTranslation(0, 0.02, 0).setCollisionGroups(G_WORLD), bl);
  const bellSensor = world.createCollider(RAPIER.ColliderDesc.ball(0.032).setTranslation(0, 0.062, 0).setSensor(true).setCollisionGroups(G_SENSOR).setActiveCollisionTypes(sensorTypes).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), bl);
  const tm = fixed(K.timer.x, top, K.timer.z);
  cuboid(tm, 0.037, 0.025, 0.018, 0, 0.025, 0);

  const { x0, x1, y0, y1, z0 } = K.upper;
  const cab = fixed(0, 0, 0);
  cuboid(cab, (x1 - x0) / 2, 0.009, (K.wallZ - z0) / 2, (x0 + x1) / 2, y0 + 0.009, (z0 + K.wallZ) / 2);
  cuboid(cab, (x1 - x0) / 2, 0.009, (K.wallZ - z0) / 2, (x0 + x1) / 2, y1 - 0.009, (z0 + K.wallZ) / 2);
  cuboid(cab, 0.009, (y1 - y0) / 2, (K.wallZ - z0) / 2, x0 + 0.009, (y0 + y1) / 2, (z0 + K.wallZ) / 2);
  cuboid(cab, 0.009, (y1 - y0) / 2, (K.wallZ - z0) / 2, x1 - 0.009, (y0 + y1) / 2, (z0 + K.wallZ) / 2);
  cuboid(cab, (x1 - x0) / 2 - 0.02, 0.008, (K.wallZ - z0) / 2 - 0.01, (x0 + x1) / 2, y0 + 0.33, (z0 + K.wallZ) / 2 + 0.01);

  function dynamic(obj, kind, build, { mass, ccd = false, damping = 0.05, angDamping = 0.1 } = {}) {
    obj.updateMatrixWorld(true);
    obj.getWorldPosition(_v);
    obj.getWorldQuaternion(_q);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(_v.x, _v.y, _v.z).setRotation(quat(_q)).setCcdEnabled(ccd).setLinearDamping(damping).setAngularDamping(angDamping));
    const cols = build(body);
    for (const c of cols) c.setCollisionGroups(G_DYN);
    if (mass) {
      const tot = cols.reduce((a, c) => a + c.mass(), 0);
      for (const c of cols) c.setMass(mass * c.mass() / tot);
    }
    const o = { obj, kind, body, cols, held: null, prevMatrix: new THREE.Matrix4().copy(obj.matrixWorld) };
    objects.push(o);
    for (const c of cols) byHandle.set(c.handle, o);
    return o;
  }
  const col = (desc, body) => world.createCollider(desc.setFriction(0.8), body);
  const rot = (x, y, z) => quat(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));

  const kettle = dynamic(P.kettle, 'kettle', b => [
    col(RAPIER.ColliderDesc.cylinder(0.096, 0.08).setTranslation(0, 0.096, 0), b),
    col(RAPIER.ColliderDesc.capsule(0.03, 0.014).setTranslation(-0.095, 0.155, 0).setRotation(rot(0, 0, 0.95)), b),
    col(RAPIER.ColliderDesc.capsule(0.06, 0.012).setTranslation(0.124, 0.12, 0), b),
    col(RAPIER.ColliderDesc.capsule(0.02, 0.012).setTranslation(0.095, 0.19, 0).setRotation(rot(0, 0, Math.PI / 2)), b),
  ], { mass: 0.75, ccd: true });

  const mugs = P.mugs.map(m => dynamic(m, 'mug', b => {
    const cs = [col(RAPIER.ColliderDesc.cuboid(0.035, 0.0045, 0.035).setTranslation(0, 0.0045, 0), b)];
    for (let a = 0; a < 10; a++) {
      const ang = a / 10 * Math.PI * 2;
      cs.push(col(RAPIER.ColliderDesc.cuboid(0.0035, 0.0485, 0.0135).setTranslation(Math.cos(ang) * 0.0385, 0.0485, Math.sin(ang) * 0.0385).setRotation(rot(0, -ang, 0)), b));
    }
    cs.push(col(RAPIER.ColliderDesc.capsule(0.02, 0.007).setTranslation(0.066, 0.052, 0), b));
    return cs;
  }, { mass: 0.32, ccd: true }));

  const spoon = dynamic(P.spoon, 'spoon', b => [
    col(RAPIER.ColliderDesc.capsule(0.05, 0.0035).setTranslation(0, 0.009, 0.065).setRotation(rot(Math.PI / 2, 0, 0)), b),
    col(RAPIER.ColliderDesc.cuboid(0.016, 0.004, 0.022), b),
  ], { mass: 0.025, ccd: true, angDamping: 0.6 });

  const bags = P.bags.map(bg => {
    const bag = dynamic(bg.mesh, 'bag', b => [col(RAPIER.ColliderDesc.cuboid(0.029, 0.032, 0.0025), b)], { mass: 0.004, ccd: true, damping: 0.6, angDamping: 0.8 });
    const tag = dynamic(bg.tag, 'tag', b => [col(RAPIER.ColliderDesc.cuboid(0.015, 0.017, 0.0012), b)], { mass: 0.001, ccd: true, damping: 1.2, angDamping: 1.2 });
    bag.teaKind = bg.kind;
    bag.tag = tag;
    tag.bag = bag;
    const a1 = new THREE.Vector3(0, 0.03, 0).applyQuaternion(bg.mesh.quaternion).add(bg.mesh.position);
    const a2 = new THREE.Vector3(0, 0.015, 0).applyQuaternion(bg.tag.quaternion).add(bg.tag.position);
    const jd = RAPIER.JointData.rope(a1.distanceTo(a2) + 0.012, { x: 0, y: 0.03, z: 0 }, { x: 0, y: 0.015, z: 0 });
    world.createImpulseJoint(jd, bag.body, tag.body, true);
    return bag;
  });

  const doors = P.doors.map(pivot => {
    const panel = pivot.children[0];
    const { width, hinge, sign } = pivot.userData;
    const o = dynamic(panel, 'door', b => [
      col(RAPIER.ColliderDesc.cuboid(width / 2, (y1 - y0) / 2 - 0.002, 0.0095), b),
      col(RAPIER.ColliderDesc.capsule(0.065, 0.006).setTranslation(sign * (width / 2 - 0.035), -(y1 - y0) / 2 + 0.11, -0.04), b),
    ], { mass: 1.2, angDamping: 3 });
    const anchorW = new THREE.Vector3(hinge, (y0 + y1) / 2, z0 - 0.011);
    const bt = o.body.translation();
    const jd = RAPIER.JointData.revolute({ x: anchorW.x, y: anchorW.y, z: anchorW.z }, { x: anchorW.x - bt.x, y: anchorW.y - bt.y, z: anchorW.z - bt.z }, { x: 0, y: 1, z: 0 });
    const j = world.createImpulseJoint(jd, cab, o.body, true);
    j.setLimits(sign > 0 ? 0 : -1.95, sign > 0 ? 1.95 : 0);
    o.pivot = pivot;
    o.sign = sign;
    const r0 = o.body.rotation();
    o.door0 = new THREE.Quaternion(r0.x, r0.y, r0.z, r0.w);
    o.joint = j;
    return o;
  });

  const head = P.knob.userData.head;
  const knob = dynamic(head, 'knob', b => {
    const cs = [col(RAPIER.ColliderDesc.ball(0.018), b)];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      cs.push(col(RAPIER.ColliderDesc.capsule(0.02, 0.0068).setTranslation(Math.cos(a) * 0.03, 0, -Math.sin(a) * 0.03).setRotation(rot(0, a, Math.PI / 2)), b));
    }
    return cs;
  }, { mass: 0.08, angDamping: 6 });
  {
    const kt = knob.body.translation();
    const jd = RAPIER.JointData.revolute({ x: kt.x, y: kt.y, z: kt.z }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    knob.joint = world.createImpulseJoint(jd, ground, knob.body, true);
    knob.joint.setLimits(0, 4.4);
    knob.joint.configureMotorVelocity(0, 0.02);
  }

  const handBodies = { L: null, R: null };
  function createHand(side) {
    const parts = [];
    const kin = () => world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const palm = kin();
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.0135, 0.041, 0.036).setTranslation(0, -0.042, 0).setCollisionGroups(G_HAND).setFriction(1.2), palm);
    parts.push({ bone: 'hand' + side, body: palm, tip: false, f: 'palm' });
    for (const [f, d] of Object.entries(FINGERS)) {
      d.len.forEach((len, k) => {
        const r = d.r * (1 - 0.07 * k) * 0.95;
        const b = kin();
        world.createCollider(RAPIER.ColliderDesc.capsule(Math.max(0.001, len / 2 - r * 0.5), r).setTranslation(0, -len / 2, 0).setCollisionGroups(G_HAND).setFriction(1.4), b);
        parts.push({ bone: `${side}_${f}${k}`, body: b, tip: k === 2, f, len });
      });
    }
    return { side, parts, palm, joint: null, held: null, closure: 0, armed: true };
  }
  handBodies.L = createHand('L');
  handBodies.R = createHand('R');

  const events = new RAPIER.EventQueue(true);
  const sensorHits = [];

  function driveHands(robot) {
    for (const side of ['L', 'R']) {
      for (const p of handBodies[side].parts) {
        const b = robot.bones[p.bone];
        b.matrixWorld.decompose(_v, _q, _s);
        if (!p.init) {
          p.body.setTranslation(vec(_v), true);
          p.body.setRotation(quat(_q), true);
          p.init = true;
        }
        p.body.setNextKinematicTranslation(vec(_v));
        p.body.setNextKinematicRotation(quat(_q));
        p.pos = p.pos || new THREE.Vector3();
        p.quat = p.quat || new THREE.Quaternion();
        p.pos.copy(_v);
        p.quat.copy(_q);
      }
    }
  }

  const zoneShape = new RAPIER.Cuboid(0.032, 0.06, 0.042);
  const _c = new THREE.Vector3();
  function candidates(hand) {
    const palm = hand.parts[0];
    const s = hand.side === 'L' ? 1 : -1;
    _c.set(-s * 0.022, -0.085, 0).applyQuaternion(palm.quat).add(palm.pos);
    const found = [];
    world.intersectionsWithShape(vec(_c), quat(palm.quat), zoneShape, c => {
      const o = byHandle.get(c.handle);
      if (o && !o.held && !found.includes(o)) found.push(o);
      return true;
    }, undefined, grp(M_HAND, M_DYN));
    const center = _c.clone();
    found.sort((a, b) => {
      const ta = a.body.translation(), tb = b.body.translation();
      return center.distanceToSquared(new THREE.Vector3(ta.x, ta.y, ta.z)) - center.distanceToSquared(new THREE.Vector3(tb.x, tb.y, tb.z));
    });
    return found;
  }

  function updateGrasp(hand, closure) {
    hand.closure = closure;
    if (hand.held) {
      if (closure < 0.24) release(hand);
      else if (hand.follow) follow(hand);
      return;
    }
    if (closure < 0.3) { hand.armed = true; hand.fistT = 0; }
    if (closure >= 0.42) {
      hand.fistT = (hand.fistT || 0) + 1;
      if (hand.armed || hand.fistT < 45) {
        const c = candidates(hand);
        if (c.length) { grab(hand, c[0]); hand.armed = false; }
      }
    }
  }

  const yawOf = q => { const z = new THREE.Vector3(0, 0, 1).applyQuaternion(q); return Math.atan2(z.x, z.z); };
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  function follow(hand) {
    const o = hand.held, f = hand.follow;
    const pr = hand.palm.rotation(), pt = hand.palm.translation();
    const pq = new THREE.Quaternion(pr.x, pr.y, pr.z, pr.w);
    if (o.kind === 'knob') {
      const y = yawOf(pq);
      f.acc += wrap(y - f.last);
      f.last = y;
      const a = THREE.MathUtils.clamp(f.a0 + f.acc, 0, 4.4);
      o.body.setNextKinematicRotation(quat(new THREE.Quaternion().setFromAxisAngle(_v.set(0, 1, 0), a)));
    } else {
      const ang = Math.atan2(pt.x - f.h.x, pt.z - f.h.z);
      f.acc += wrap(ang - f.last);
      f.last = ang;
      const lo = o.sign > 0 ? 0 : -1.95, hi = o.sign > 0 ? 1.95 : 0;
      const a = THREE.MathUtils.clamp(f.a0 + f.acc, lo, hi);
      const rq = new THREE.Quaternion().setFromAxisAngle(_v.set(0, 1, 0), a - f.a0);
      const c = f.off.clone().applyQuaternion(rq).add(f.h);
      o.body.setNextKinematicTranslation(vec(c));
      o.body.setNextKinematicRotation(quat(rq.multiply(f.q0)));
    }
  }

  function grab(hand, o) {
    if (o.kind === 'knob' || o.kind === 'door') {
      const pr = hand.palm.rotation(), pt = hand.palm.translation();
      const pq = new THREE.Quaternion(pr.x, pr.y, pr.z, pr.w);
      const br = o.body.rotation(), bt = o.body.translation();
      const bq = new THREE.Quaternion(br.x, br.y, br.z, br.w);
      const f = { acc: 0, q0: bq.clone() };
      if (o.kind === 'knob') { f.last = yawOf(pq); f.a0 = knobAngle(); }
      else {
        const pv = o.pivot.userData;
        f.h = new THREE.Vector3(pv.hinge, (K.upper.y0 + K.upper.y1) / 2, K.upper.z0 - 0.011);
        f.last = Math.atan2(pt.x - f.h.x, pt.z - f.h.z);
        f.off = new THREE.Vector3(bt.x, bt.y, bt.z).sub(f.h);
        const rel = bq.clone().multiply(o.door0.clone().invert());
        f.a0 = 2 * Math.atan2(rel.y, rel.w);
      }
      hand.follow = f;
      hand.held = o;
      o.held = hand;
      o.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      o.grabbedAt = performance.now();
      return;
    }
    const palm = hand.palm;
    const pt = palm.translation(), pr = palm.rotation();
    const ot = o.body.translation(), or = o.body.rotation();
    const pq = new THREE.Quaternion(pr.x, pr.y, pr.z, pr.w), oq = new THREE.Quaternion(or.x, or.y, or.z, or.w);
    const inv = pq.clone().invert();
    const rel = new THREE.Vector3(ot.x - pt.x, ot.y - pt.y, ot.z - pt.z).applyQuaternion(inv);
    const relQ = inv.clone().multiply(oq);
    const jd = RAPIER.JointData.fixed(vec(rel), quat(relQ), { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    hand.joint = world.createImpulseJoint(jd, palm, o.body, true);
    hand.relQ = relQ.clone();
    hand.rel = rel.clone();
    hand.held = o;
    o.held = hand;
    for (const c of o.cols) c.setCollisionGroups(G_HELD);
    o.body.wakeUp();
    o.grabbedAt = performance.now();
  }

  function release(hand) {
    const o = hand.held;
    if (hand.follow) {
      hand.follow = null;
      hand.held = null;
      if (o) { o.held = null; o.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); o.body.setLinvel({ x: 0, y: 0, z: 0 }, true); o.body.setAngvel({ x: 0, y: 0, z: 0 }, true); }
      return;
    }
    if (hand.joint) world.removeImpulseJoint(hand.joint, true);
    hand.joint = null;
    hand.held = null;
    if (o) {
      o.held = null;
      for (const c of o.cols) c.setCollisionGroups(G_DYN);
      o.body.wakeUp();
    }
  }

  function step() {
    sensorHits.length = 0;
    {
      world.step(events);
      events.drainCollisionEvents((h1, h2, started) => {
        if (!started) return;
        for (const [s, other] of [[h1, h2], [h2, h1]]) {
          if (s === baseButton.handle) sensorHits.push(['button', other]);
          if (s === bellSensor.handle) sensorHits.push(['bell', other]);
        }
      });
    }
    for (const o of objects) {
      o.prevMatrix.copy(o.obj.matrixWorld);
      const t = o.body.translation(), r = o.body.rotation();
      _v.set(t.x, t.y, t.z);
      _q.set(r.x, r.y, r.z, r.w);
      const parent = o.obj.parent;
      if (parent) {
        _m.compose(_v, _q, _s.set(1, 1, 1));
        if (!o.parentInv) o.parentInv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
        _m.premultiply(o.parentInv);
        _m.decompose(o.obj.position, o.obj.quaternion, _s);
      }
      o.obj.updateMatrixWorld(true);
    }
  }

  function knobAngle() {
    const r = knob.body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    return e.y < -0.5 ? e.y + Math.PI * 2 : e.y;
  }

  function jointError(hand) {
    if (!hand.held) return null;
    const pr = hand.palm.rotation(), or = hand.held.body.rotation();
    const want = new THREE.Quaternion(pr.x, pr.y, pr.z, pr.w).multiply(hand.relQ);
    const have = new THREE.Quaternion(or.x, or.y, or.z, or.w);
    const pt = hand.palm.translation(), ot = hand.held.body.translation();
    const wantP = hand.rel.clone().applyQuaternion(new THREE.Quaternion(pr.x, pr.y, pr.z, pr.w)).add(new THREE.Vector3(pt.x, pt.y, pt.z));
    return { deg: +(want.angleTo(have) * 57.3).toFixed(1), cm: +(wantP.distanceTo(new THREE.Vector3(ot.x, ot.y, ot.z)) * 100).toFixed(1) };
  }

  return {
    jointError,
    world, objects, kettle, mugs, spoon, bags, doors, knob, hands: handBodies, sensorHits,
    driveHands, updateGrasp, release, step, knobAngle, byHandle,
    groundBody: ground,
  };
}
