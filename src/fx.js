// Robotea: high-five impact effects (flash, expanding ring, sparks) and a tiny camera kick
import * as THREE from 'three';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,250,235,0.85)');
  r.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createFx(scene) {
  const glow = glowTexture();
  const live = [];
  const ringGeo = new THREE.RingGeometry(0.9, 1, 64);
  const sparkGeo = new THREE.SphereGeometry(1, 8, 6);
  let kick = 0;

  function burst(point, strength, kind) {
    const warm = kind === 'bump' ? new THREE.Color(1, 0.86, 0.62) : new THREE.Color(1, 0.97, 0.9);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: warm, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    flash.position.copy(point);
    scene.add(flash);
    live.push({ o: flash, t: 0, life: 0.22, kind: 'flash', s: 0.09 + 0.12 * strength });
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: warm, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
    ring.position.copy(point);
    ring.lookAt(point.clone().add(new THREE.Vector3(0, 0, -1)));
    scene.add(ring);
    live.push({ o: ring, t: 0, life: 0.38, kind: 'ring', s: 0.05 + 0.16 * strength });
    const n = Math.round(6 + 10 * strength);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: warm, transparent: true, toneMapped: false }));
      s.position.copy(point);
      s.scale.setScalar(0.0035 + Math.random() * 0.003);
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 1.2;
      const sp = 0.6 + Math.random() * 1.4 * (0.5 + strength);
      const v = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e) + 0.4, Math.sin(a) * Math.cos(e) * 0.6).multiplyScalar(sp);
      scene.add(s);
      live.push({ o: s, t: 0, life: 0.35 + Math.random() * 0.3, kind: 'spark', v });
    }
    kick = Math.max(kick, 0.6 * strength);
  }

  function update(dt, cam) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        p.o.parent.remove(p.o);
        p.o.material.dispose();
        live.splice(i, 1);
        continue;
      }
      if (p.kind === 'flash') { p.o.scale.setScalar(p.s * (1 + k * 1.5)); p.o.material.opacity = (1 - k) ** 2; }
      if (p.kind === 'ring') { p.o.scale.setScalar(p.s * (0.3 + k * 1.6)); p.o.material.opacity = 0.75 * (1 - k) ** 1.5; }
      if (p.kind === 'spark') { p.v.y -= 3.5 * dt; p.o.position.addScaledVector(p.v, dt); p.o.material.opacity = 1 - k; }
    }
    if (kick > 0.001 && cam) {
      const a = kick * 0.004;
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
      cam.updateMatrixWorld(true);
      kick *= Math.exp(-dt * 18);
    }
  }

  return { burst, update };
}
