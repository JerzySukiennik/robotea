// Robotea: screen-space fluid rendering of the particle water (sphere depth splats, bilateral smoothing, thickness and tea colour, refraction, reflection and sun glints)
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const PARTICLE_VS = /* glsl */`
  uniform float uScale;
  uniform float uRadius;
  attribute float alive;
  attribute vec4 fattr;
  varying vec3 vView;
  varying float vR;
  varying vec4 vAttr;
  varying float vAlive;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = mv.xyz;
    vR = alive > 1.5 ? uRadius * 0.55 : uRadius;
    vAttr = fattr;
    vAlive = alive;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = alive > 0.5 ? 2.0 * vR * uScale / max(-mv.z, 0.01) : 0.0;
  }
`;

const DEPTH_FS = /* glsl */`
  precision highp float;
  uniform mat4 projectionMatrix;
  uniform sampler2D tSceneDepth;
  uniform vec2 uRes;
  uniform float uNear, uFar;
  varying vec3 vView;
  varying float vR;
  varying float vAlive;
  float viewDepth(float d) { return (uNear * uFar) / ((uFar - uNear) * d - uFar); }
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0 || vAlive < 0.5) discard;
    vec3 p = vView + vec3(0.0, 0.0, sqrt(1.0 - r2) * vR);
    float scene = -viewDepth(texture2D(tSceneDepth, gl_FragCoord.xy / uRes).x);
    if (-p.z > scene + 0.0015) discard;
    vec4 clip = projectionMatrix * vec4(p, 1.0);
    gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
    gl_FragColor = vec4(-p.z, vAlive > 1.5 ? 1.0 : 0.0, 0.0, 1.0);
  }
`;

const THICK_FS = /* glsl */`
  precision highp float;
  uniform sampler2D tSceneDepth;
  uniform vec2 uRes;
  uniform float uNear, uFar;
  varying vec3 vView;
  varying float vR;
  varying vec4 vAttr;
  varying float vAlive;
  float viewDepth(float d) { return (uNear * uFar) / ((uFar - uNear) * d - uFar); }
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0 || vAlive < 0.5) discard;
    float scene = -viewDepth(texture2D(tSceneDepth, gl_FragCoord.xy * 2.0 / uRes).x);
    if (-vView.z > scene + 0.004) discard;
    float w = exp(-r2 * 2.0) * vR * 2.0;
    float tea = clamp(vAttr.y, 0.0, 1.6);
    float kind = vAttr.w;
    vec3 teaAbs = kind > 2.5 ? vec3(0.55, 6.0, 3.2) : kind > 1.5 ? vec3(2.6, 1.0, 6.5) : vec3(2.2, 4.8, 8.5);
    vec3 a = vAlive > 1.5 ? vec3(0.0) : teaAbs * tea * 34.0;
    gl_FragColor = vec4(a * w, w);
  }
`;

const BLUR_FS = /* glsl */`
  precision highp float;
  uniform sampler2D tDepth;
  uniform vec2 uDir;
  uniform vec2 uRes;
  uniform float uWorldR;
  uniform float uScale;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tDepth, vUv);
    float d = c.x;
    if (d > 500.0) { gl_FragColor = c; return; }
    float rad = clamp(uWorldR * uScale / d, 1.0, 14.0);
    float sigma = rad * 0.5;
    float sum = 0.0, wsum = 0.0;
    for (int i = -14; i <= 14; i++) {
      float fi = float(i);
      if (abs(fi) > rad) continue;
      float s = texture2D(tDepth, vUv + uDir * fi / uRes).x;
      if (s > 500.0) continue;
      float dz = (s - d) / 0.012;
      float w = exp(-fi * fi / (2.0 * sigma * sigma)) * exp(-dz * dz);
      sum += s * w;
      wsum += w;
    }
    gl_FragColor = vec4(sum / max(wsum, 1e-5), c.y, 0.0, 1.0);
  }
`;

const COMP_FS = /* glsl */`
  precision highp float;
  uniform sampler2D tScene;
  uniform sampler2D tDepth;
  uniform sampler2D tThick;
  uniform sampler2D tEnv;
  uniform vec2 uRes;
  uniform vec2 uTan;
  uniform mat3 uViewToWorld;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform float uEnv;
  varying vec2 vUv;
  vec3 viewPos(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return vec3((uv * 2.0 - 1.0) * uTan * d, -d);
  }
  vec3 envSample(vec3 dir) {
    vec2 uv = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5, asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265 + 0.5);
    return texture2D(tEnv, uv).rgb;
  }
  void main() {
    vec4 base = texture2D(tScene, vUv);
    float d = texture2D(tDepth, vUv).x;
    if (d > 500.0) { gl_FragColor = base; return; }
    vec4 th = texture2D(tThick, vUv);
    float thick = th.a;
    vec3 p = viewPos(vUv);
    vec2 px = 1.0 / uRes;
    vec3 ddx = viewPos(vUv + vec2(px.x, 0.0)) - p, ddx2 = p - viewPos(vUv - vec2(px.x, 0.0));
    vec3 ddy = viewPos(vUv + vec2(0.0, px.y)) - p, ddy2 = p - viewPos(vUv - vec2(0.0, px.y));
    if (abs(ddx2.z) < abs(ddx.z)) ddx = ddx2;
    if (abs(ddy2.z) < abs(ddy.z)) ddy = ddy2;
    vec3 n = normalize(cross(ddx, ddy));
    vec3 v = normalize(-p);
    if (dot(n, v) < 0.0) n = -n;
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 nw = uViewToWorld * n;
    vec3 rw = uViewToWorld * reflect(-v, n);
    vec3 refl = envSample(rw) * uEnv;
    float sugar = texture2D(tDepth, vUv).y;
    vec2 off = n.xy * clamp(thick * 4.0, 0.0, 0.05);
    vec3 refr = texture2D(tScene, vUv + off).rgb;
    vec3 absorb = th.rgb / max(thick, 1e-5) + vec3(0.9, 0.35, 0.18);
    vec3 trans = exp(-absorb * thick * 1.0);
    vec3 body = refr * trans;
    if (sugar > 0.5) body = mix(body, vec3(0.92), 0.85);
    vec3 hw = normalize(uSunDir + uViewToWorld * v);
    float spec = pow(max(dot(nw, hw), 0.0), 380.0) * 6.0;
    vec3 col = mix(body, refl, fres) + uSunCol * spec;
    float edge = smoothstep(0.0, 0.0025, thick);
    gl_FragColor = vec4(mix(base.rgb, col, edge), base.a);
  }
`;

const QUAD_VS = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export function createWaterRenderer(renderer, fluid, { envTexture, radius = 0.0036 } = {}) {
  const geo = new THREE.BufferGeometry();
  const ib = new THREE.InterleavedBuffer(fluid.cpuPos, 4).setUsage(THREE.DynamicDrawUsage);
  const ab = new THREE.InterleavedBuffer(fluid.cpuAttr, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
  geo.setAttribute('alive', new THREE.InterleavedBufferAttribute(ib, 1, 3));
  geo.setAttribute('fattr', new THREE.InterleavedBufferAttribute(ab, 4, 0));
  geo.setDrawRange(0, 0);

  const common = {
    uScale: { value: 1 }, uRadius: { value: radius }, tSceneDepth: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.03 }, uFar: { value: 30 },
  };
  const depthMat = new THREE.ShaderMaterial({ uniforms: common, vertexShader: PARTICLE_VS, fragmentShader: DEPTH_FS, depthTest: true, depthWrite: true });
  const thickMat = new THREE.ShaderMaterial({
    uniforms: common, vertexShader: PARTICLE_VS, fragmentShader: THICK_FS,
    depthTest: false, depthWrite: false, transparent: true, blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  const points = new THREE.Points(geo, depthMat);
  points.frustumCulled = false;
  const pscene = new THREE.Scene();
  pscene.add(points);

  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tDepth: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uRes: { value: new THREE.Vector2(1, 1) }, uWorldR: { value: 0.011 }, uScale: { value: 1 } },
    vertexShader: QUAD_VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false,
  });
  const compMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null }, tDepth: { value: null }, tThick: { value: null }, tEnv: { value: envTexture },
      uRes: { value: new THREE.Vector2(1, 1) }, uTan: { value: new THREE.Vector2(1, 1) },
      uViewToWorld: { value: new THREE.Matrix3() }, uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.5).normalize() },
      uSunCol: { value: new THREE.Color(1, 0.96, 0.9) }, uEnv: { value: 0.9 },
    },
    vertexShader: QUAD_VS, fragmentShader: COMP_FS, depthTest: false, depthWrite: false,
  });
  const blurQuad = new FullScreenQuad(blurMat), compQuad = new FullScreenQuad(compMat);

  const rtOpts = { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
  let depthRT, blurA, blurB, thickRT;
  const make = (w, h) => {
    depthRT?.dispose(); blurA?.dispose(); blurB?.dispose(); thickRT?.dispose();
    depthRT = new THREE.WebGLRenderTarget(w, h, { ...rtOpts, depthBuffer: true });
    blurA = new THREE.WebGLRenderTarget(w, h, rtOpts);
    blurB = new THREE.WebGLRenderTarget(w, h, rtOpts);
    thickRT = new THREE.WebGLRenderTarget(Math.ceil(w / 2), Math.ceil(h / 2), { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  };
  const clearCol = new THREE.Color();
  const _m4 = new THREE.Matrix4();

  return {
    setSize(w, h) { make(w, h); },
    sync(count) {
      geo.setDrawRange(0, count);
      ib.needsUpdate = true;
      ab.needsUpdate = true;
      ib.clearUpdateRanges(); ab.clearUpdateRanges();
      ib.addUpdateRange(0, count * 4); ab.addUpdateRange(0, count * 4);
    },
    render(camera, sceneRT, outRT, sun) {
      const w = sceneRT.width, h = sceneRT.height;
      if (!depthRT || depthRT.width !== w || depthRT.height !== h) make(w, h);
      const scale = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      common.uScale.value = scale;
      common.uNear.value = camera.near;
      common.uFar.value = camera.far;
      common.tSceneDepth.value = sceneRT.depthTexture;
      const prevAuto = renderer.autoClear;
      const prevClear = renderer.getClearColor(clearCol).clone(), prevAlpha = renderer.getClearAlpha();
      renderer.autoClear = false;

      common.uRes.value.set(w, h);
      points.material = depthMat;
      renderer.setRenderTarget(depthRT);
      renderer.setClearColor(new THREE.Color(1000, 0, 0), 1);
      renderer.clear(true, true, false);
      renderer.render(pscene, camera);

      points.material = thickMat;
      renderer.setRenderTarget(thickRT);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      common.uRes.value.set(w, h);
      renderer.render(pscene, camera);

      blurMat.uniforms.uRes.value.set(w, h);
      blurMat.uniforms.uScale.value = scale;
      let src = depthRT;
      for (let k = 0; k < 2; k++) {
        blurMat.uniforms.tDepth.value = src.texture;
        blurMat.uniforms.uDir.value.set(1, 0);
        renderer.setRenderTarget(blurA);
        blurQuad.render(renderer);
        blurMat.uniforms.tDepth.value = blurA.texture;
        blurMat.uniforms.uDir.value.set(0, 1);
        renderer.setRenderTarget(blurB);
        blurQuad.render(renderer);
        src = blurB;
      }

      const u = compMat.uniforms;
      u.tScene.value = sceneRT.texture;
      u.tDepth.value = blurB.texture;
      u.tThick.value = thickRT.texture;
      u.uRes.value.set(w, h);
      const ty = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      u.uTan.value.set(ty * camera.aspect, ty);
      u.uViewToWorld.value.setFromMatrix4(_m4.copy(camera.matrixWorld));
      if (sun) u.uSunDir.value.copy(sun).normalize();
      renderer.setRenderTarget(outRT);
      compQuad.render(renderer);

      renderer.setClearColor(prevClear, prevAlpha);
      renderer.autoClear = prevAuto;
    },
  };
}
