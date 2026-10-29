// Robotea: bright seamless photo studio (light grey cyclorama, soft key and fill lights, studio HDRI reflections)
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

export async function buildStudio(renderer, scene) {
  scene.background = new THREE.Color(0xe7e6e3);
  scene.fog = new THREE.Fog(0xe7e6e3, 4.5, 11);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(12, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0xf4f3f1) }, mid: { value: new THREE.Color(0xe6e5e2) }, low: { value: new THREE.Color(0xd9d8d4) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top, mid, low; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, h)) : mix(mid, low, smoothstep(0.0, -0.3, h)); gl_FragColor = vec4(c, 1.0); }',
  }));
  scene.add(sky);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 96), new THREE.MeshStandardMaterial({ color: 0xe2e1de, roughness: 0.92, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfcdc8, 0.55));
  const key = new THREE.DirectionalLight(0xfffaf2, 2.4);
  key.position.set(1.8, 3.6, -0.6);
  key.target.position.set(0, 1, 0.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 1.6, bottom: -1.6, near: 0.5, far: 8 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xe9f0ff, 0.9);
  rim.position.set(-2.2, 2.4, 2.6);
  scene.add(rim);

  const hdr = await new RGBELoader().loadAsync('assets/hdri/studio_small_08.hdr');
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromEquirectangular(hdr).texture;
  scene.environmentIntensity = 0.75;
  hdr.dispose();
  pm.dispose();
  return { key };
}
