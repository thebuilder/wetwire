/* ================================================================ world loading */
let cityMesh = null, worldObjs = [], vecStatic = [];
const HK = { value: 0 };
const vecScene = new THREE.Scene();
const vLineMat = (col, a) => new THREE.ShaderMaterial({ uniforms: { uHack: HK, uCol: { value: new THREE.Color(col) }, uA: { value: a } },
  vertexShader: 'void main(){ gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform vec3 uCol; uniform float uA; uniform float uHack; void main(){ gl_FragColor = vec4(uCol, uA*uHack); }', transparent: true, depthWrite: false });
const vPulseMat = (r, g, b) => new THREE.ShaderMaterial({ uniforms: { uHack: HK, uTime: U.uTime },
  vertexShader: 'attribute float aDist; varying float vD; void main(){ vD = aDist; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform float uHack; uniform float uTime; varying float vD; void main(){ float p = fract(vD*0.035 - uTime*0.7); float a = 0.18 + smoothstep(0.86, 1.0, p)*0.95; gl_FragColor = vec4(' + r + ',' + g + ',' + b + ', a*uHack); }',
  transparent: true, depthWrite: false });
function buildVecStatic() {
  for (const o of vecStatic) { vecScene.remove(o); o.geometry.dispose(); }
  vecStatic = [];
  const add = (o, order) => { o.renderOrder = order; o.frustumCulled = false; vecScene.add(o); vecStatic.push(o); };
  const sp = [];
  for (const b of WORLD.solids) { const g = new Geo(); g.box(b[0], b[1], b[2], b[3], b[4], b[5], [0, 0, 0], AB); for (let i = 0; i < g.p.length; i++) sp.push(g.p[i]); }
  if (sp.length) { const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 })), 0); }
  const ep = [];
  for (const [x0, y0, z0, x1, y1, z1] of WORLD.edges) {
    const c = [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]];
    for (const [a, bb] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]) ep.push(...c[a], ...c[bb]);
  }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3)); add(new THREE.LineSegments(eg, vLineMat(0x86fadd, 0.55)), 2);
  const gp = [], bp = [], bd = [], ext = 120;
  if (RN) {
    // curb lines along every street and data pulses running node to node
    for (const e of RN.edges) {
      if (e.kind === 'path') continue;
      const A = RN.nodes[e.a], Bn = RN.nodes[e.b], d = [Math.cos(e.th), Math.sin(e.th)], n = [-d[1], d[0]], h = e.w / 2;
      const ta = e.trim[0], tb = e.len - e.trim[1]; if (tb <= ta) continue;
      for (const o of [h, -h]) gp.push(A.x + d[0] * ta + n[0] * o, 0.02, A.z + d[1] * ta + n[1] * o, A.x + d[0] * tb + n[0] * o, 0.02, A.z + d[1] * tb + n[1] * o);
      if (e.kind !== 'alley') { bp.push(A.x, 0.05, A.z, Bn.x, 0.05, Bn.z); bd.push(0, e.len); }
    }
  } else {
    for (const xx of [ROADX - 4, ROADX + 4]) gp.push(xx, 0.02, -ext, xx, 0.02, GW + ext);
    for (let i = 0; i <= 10; i++) { const x = CX0 + (CX1 - CX0) * i / 10; gp.push(x, 0.02, CZ0, x, 0.02, CZ1); }
    for (let i = 0; i <= 10; i++) { const z = CZ0 + (CZ1 - CZ0) * i / 10; gp.push(CX0, 0.02, z, CX1, 0.02, z); }
  }
  for (const u of WORLD.uplinks) for (const n of WORLD.nodes) {
    const d = Math.hypot(n.x - u.x, n.z - u.z); if (d > u.r) continue;
    bp.push(u.x, 0.06, u.z, n.x, 0.06, n.z); bd.push(0, d);
  }
  if (gp.length) { const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); add(new THREE.LineSegments(gg, vLineMat(0x2f9a8a, 0.35)), 1); }
  if (bp.length) { const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg.setAttribute('aDist', new THREE.Float32BufferAttribute(bd, 1)); add(new THREE.LineSegments(bg, vPulseMat('1.0', '0.36', '0.51')), 3); }
}
function gateGeo(w) {
  const g = new Geo();
  g.box(0, 0, -0.05, w, 2.6, 0.05, [1, 1, 1], [K.FENCE, 0, 0, 0]);
  g.box(0, 0, -0.08, 0.12, 2.7, 0.08, [0.3, 0.3, 0.32], AB); g.box(w - 0.12, 0, -0.08, w, 2.7, 0.08, [0.3, 0.3, 0.32], AB);
  g.box(0, 2.55, -0.08, w, 2.7, 0.08, [0.3, 0.3, 0.32], AB); g.box(0, 1.25, -0.06, w, 1.35, 0.06, [0.3, 0.3, 0.32], AB);
  g.box(w * 0.5 - 0.6, 1.4, 0.05, w * 0.5 + 0.6, 1.8, 0.08, [1, 0.25, 0.2], [K.NEON, 1.2, 0.5, 0]);
  return g.geometry();
}
function setGateCells(gt) {
  if (gt.open > 0.5) openCells(gt.x0, gt.z - 0.5, gt.x1, gt.z + 0.5);
  else blockCells(gt.x0, gt.z - 0.5, gt.x1, gt.z + 0.5, true);
}
const WEATHER = {
  rain: { name: 'Night // heavy rain', rain: 0.5, wet: 1, fog: [0.022, 0.03, 0.04], fogDen: 0.03, sky: [0.045, 0.055, 0.1], key: [0.09, 0.11, 0.19] },
  storm: { name: 'Night // rain', rain: 0.85, wet: 1, fog: [0.032, 0.028, 0.065], fogDen: 0.022, sky: [0.045, 0.055, 0.1], key: [0.09, 0.11, 0.19] },
  clear: { name: 'Night // dry, clear', rain: 0, wet: 0.15, fog: [0.03, 0.035, 0.06], fogDen: 0.016, sky: [0.05, 0.06, 0.1], key: [0.11, 0.12, 0.18] },
  smog: { name: 'Night // dry, smog', rain: 0, wet: 0.28, fog: [0.07, 0.042, 0.06], fogDen: 0.024, sky: [0.062, 0.052, 0.08], key: [0.13, 0.1, 0.12] },
};
let WX = WEATHER.smog;
function loadWorld(id, wx) {
  const L = LEVELS[id] || LEVELS.downtown;
  WX = WEATHER[wx] || WEATHER.smog;
  walk.fill(1); opq.fill(0);
  WORLD = newWorld(L.kind); G = new Geo(); LEVEL = L; RN = null; PEDS = null;
  if (L.custom) { DISTRICT = L.style || L.kind; L.custom(L); for (let z = 0; z < GW; z++) for (let x = 0; x < GW; x++) if (!inPlay(x + 0.5, z + 0.5)) walk[z * GW + x] = 0; }
  else buildLevel(L);
  U.uBounds.value.set(L.bounds[0], L.bounds[1], L.bounds[2], L.bounds[3]);
  SCAN.img = null;
  if (cityMesh) { scene.remove(cityMesh); cityMesh.geometry.dispose(); }
  cityMesh = new THREE.Mesh(G.geometry(), MAT.stat); cityMesh.frustumCulled = false; scene.add(cityMesh);
  for (const o of worldObjs) { scene.remove(o); if (o.geometry) o.geometry.dispose(); }
  worldObjs = [];
  for (const gt of WORLD.gates) {
    const m = new THREE.Mesh(gateGeo(gt.x1 - gt.x0), MAT.dyn); m.frustumCulled = false; scene.add(m); worldObjs.push(m); gt.mesh = m;
    setGateCells(gt);
  }
  for (const t of trainCars) t.visible = !!WORLD.rail;
  U.uPadC.value.set(WORLD.padC[0], WORLD.padC[1]);
  U.uFog.value.set(...WX.fog); U.uFogDen.value = WX.fogDen; U.uSky.value.set(...WX.sky); U.uKey.value.set(...WX.key);
  buildVecStatic();
}
