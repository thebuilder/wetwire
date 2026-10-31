'use strict';
const $ = (s) => document.querySelector(s);
const THREE = window.THREE;
function fatal(msg) { const it = $('#intro'); if (it) it.remove(); $('#boot').hidden = false; const e = $('#bootErr'); e.textContent = msg; e.hidden = false; $('#startBtn').disabled = true; $('#startBtn').textContent = 'OFFLINE'; }
if (!THREE) { fatal('The 3D engine did not load. Check your connection, then reload the page.'); return; }

/* ================================================================ utils */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
let SEED = 41017;
function rng() { SEED |= 0; SEED = SEED + 0x6D2B79F5 | 0; let t = Math.imul(SEED ^ SEED >>> 15, 1 | SEED); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const rr = (a, b) => a + (b - a) * rng();
const ri = (a, b) => Math.floor(a + (b - a + 1) * rng());
const pick = (a) => a[Math.floor(rng() * a.length)];
const R = Math.random;
const Rr = (a, b) => a + (b - a) * R();
const Rpick = (a) => a[Math.floor(R() * a.length)];
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const hex3 = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================================================================ config */
const CFG = { scale: 0, zoom: 2, dither: 0.55, quant: 1, levels: 6, outlines: true, refl: 0.85, bloom: 0.85, rain: 1, crt: 0.5, exposure: 1, cut: true };
const ZOOMS = [6, 8, 10, 12, 16];
const PAL = ['#05090a','#0b1016','#121a24','#1b2533','#263345','#3a4a5e','#5a6b80','#8c9bb0','#c9d3df','#ffffff',
  '#1a0f22','#2d1838','#4a2350','#6e3a78','#2a160c','#4f2a12','#8a4a16','#d0842e','#ffc46b','#fff0c2',
  '#4a1028','#8f1f48','#ff5b82','#ffb0c4','#0b2e2c','#145650','#2f9a8a','#86fadd','#d6fff3',
  '#1b3a12','#5aa83a','#b4f06a','#7a1414','#e0402c','#16307a','#3e7cf0','#9cc4ff',
  '#0c140c','#132012','#1c2b16','#1d1810'];
const K = { BASIC: 0, BLDG: 1, ROAD: 2, WALK: 3, NEON: 4, BOARD: 5, GLASS: 6, PAD: 7, LAMP: 8, RROAD: 9, DIRT: 10, FENCE: 11, DECAL: 12, WATER: 13 };

/* ================================================================ geometry builder */
class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; this.a = []; }
  quad(v0, v1, v2, v3, n, c, a) {
    for (const v of [v0, v1, v2, v0, v2, v3]) { this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); this.c.push(c[0], c[1], c[2]); this.a.push(a[0], a[1], a[2], a[3]); }
  }
  box(x0, y0, z0, x1, y1, z1, c, a, bottom) {
    this.quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[1,0,0],c,a);
    this.quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0],c,a);
    this.quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],[0,1,0],c,a);
    if (bottom) this.quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0],c,a);
    this.quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1],c,a);
    this.quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[0,0,-1],c,a);
  }
  poly(vs, c, a, inside) {
    const e1 = [vs[1][0] - vs[0][0], vs[1][1] - vs[0][1], vs[1][2] - vs[0][2]], e2 = [vs[2][0] - vs[0][0], vs[2][1] - vs[0][1], vs[2][2] - vs[0][2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map((v) => v / l);
    const m = [0, 1, 2].map((k) => vs.reduce((s, v) => s + v[k], 0) / vs.length);
    if ((m[0] - inside[0]) * n[0] + (m[1] - inside[1]) * n[1] + (m[2] - inside[2]) * n[2] < 0) { vs = vs.slice().reverse(); n = n.map((v) => -v); }
    const tris = vs.length === 4 ? [vs[0], vs[1], vs[2], vs[0], vs[2], vs[3]] : vs;
    for (const v of tris) { this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); this.c.push(c[0], c[1], c[2]); this.a.push(a[0], a[1], a[2], a[3]); }
  }
  /* tapered prism: n sides, bottom w0 x d0, top w1 x d1, optional z shift of the top */
  prism(cx, cz, y0, y1, w0, d0, w1, d1, n, c, a, dz1) {
    const k = 1 / Math.cos(Math.PI / n), off = Math.PI / n, sz = dz1 || 0;
    const ring = (y, w, d, oz) => Array.from({ length: n }, (_, i) => { const t = off + i / n * Math.PI * 2; return [cx + Math.cos(t) * w / 2 * k, y, cz + oz + Math.sin(t) * d / 2 * k]; });
    const B = ring(y0, w0, d0, 0), T = ring(y1, w1, d1, sz), mid = [cx, (y0 + y1) / 2, cz + sz / 2];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; this.poly([B[i], B[j], T[j], T[i]], c, a, mid); }
    const top = [cx, y1, cz + sz];
    for (let i = 0; i < n; i++) this.poly([top, T[i], T[(i + 1) % n]], c, a, [cx, y1 - 1, cz + sz]);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aux', new THREE.Float32BufferAttribute(this.a, 4));
    g.computeBoundingSphere();
    return g;
  }
}

/* ================================================================ shaders */
const NL = 40;
const WVS = `
attribute vec3 aCol;
attribute vec4 aux;
#if defined(PEOPLE)
attribute vec3 iColor; attribute vec3 iSkin; attribute vec4 iAnim; attribute vec3 iRim; attribute vec4 iMisc;
#elif defined(TINTED)
attribute vec3 iColor; attribute vec4 iAnim;
#endif
uniform float uTime;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec4 vA; varying vec3 vE; varying vec3 vR; varying float vVZ;
mat3 rx(float a){ float c = cos(a), s = sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
void main(){
  vec3 p = position; vec3 n = normal; vec3 c = aCol; vec3 e = vec3(0.); vec4 a = aux; vR = vec3(0.);
#ifdef PEOPLE
  float part = a.w;
  if (a.z > 0.5 && a.z < 1.5) c = iColor; else if (a.z > 1.5 && a.z < 2.5) c = iSkin;
  float hide = 0.;
  if (part > 5.5 && part < 6.5) hide = 1. - iMisc.y;
  if (part > 6.5 && part < 8.5) hide = 1. - iMisc.x;
  if (part > 8.5 && part < 9.5) hide = step(iMisc.z, 1.5);
  if (part > 9.5) hide = step(iMisc.z, 0.5);
  if (part > 6.5 && part < 7.5) { c = vec3(0.03,0.03,0.04); e = iRim * (abs(n.y) < 0.5 ? 2.6 : 0.5); }
  if (part > 9.5) { c = iRim; e = iRim * 2.4; }
  float ph = iAnim.x, wk = iAnim.y, aim = iAnim.z, dead = iAnim.w;
  float s = sin(ph); float alive = 1. - dead;
  vec3 hip = vec3(0.,0.86,0.), sh = vec3(0.,1.48,0.);
  if (part > 1.5 && part < 3.5) { float ang = (part < 2.5 ? s : -s) * 0.6 * wk * alive; p = rx(ang)*(p-hip)+hip; n = rx(ang)*n; }
  else if (part > 3.5 && part < 4.5) { float ang = -s*0.5*wk*alive; p = rx(ang)*(p-sh)+sh; n = rx(ang)*n; }
  else if (part > 4.5 && part < 6.5) { float ang = mix(s*0.5*wk, -1.5, aim)*alive; p = rx(ang)*(p-sh)+sh; n = rx(ang)*n; }
  p.y += abs(cos(ph))*0.06*wk*alive;
  if (dead > 0.) { float ang = -dead*1.5708; p = rx(ang)*p; n = rx(ang)*n; p.y += 0.16*dead; }
  e += vec3(1.,0.85,0.85) * iMisc.w * 2.;
  vR = iRim * (iMisc.z > 0.5 ? 1.0 : 0.15);
  if (hide > 0.5) p = vec3(0.);
#endif
#ifdef TINTED
  if (a.x > 11.5 && a.x < 12.5) { c = iColor; vR = vec3(0., iAnim.x, iAnim.y); }
  else {
    float wr = step(0.5, iAnim.w), burn = clamp(iAnim.w - 1., 0., 1.);
    if (a.z > 0.5 && a.z < 1.5) c *= iColor;
    if (a.z > 1.5 && a.z < 2.5) { c = iAnim.xyz; e = iAnim.xyz * 2.6 * (1. - wr); }
    if (a.z > 2.5) { float f = step(0.5, fract(uTime*2.5 + (p.x > 0. ? 0.5 : 0.))); c = mix(vec3(1.,0.1,0.15), vec3(0.15,0.35,1.), f); e = c*3.2*(1.-wr); }
    if (wr > 0.5) {
      vec3 hp = fract(sin(vec3(dot(p, vec3(12.99,78.23,37.72)), dot(p, vec3(39.35,11.13,83.15)), dot(p, vec3(73.16,52.23,9.41))))*43758.55);
      p += (hp - 0.5) * vec3(0.16, 0.12, 0.16);
      if (p.y > 0.95) p.y -= (p.y - 0.95) * 0.45;
      p.y -= smoothstep(1.3, 2.6, abs(p.z)) * 0.18;
      p.x *= 1. + 0.05*sin(p.z*2.3);
    }
    vR = vec3(wr, burn, 0.);
  }
#endif
  vec4 wp = vec4(p, 1.);
#ifdef USE_INSTANCING
  wp = instanceMatrix * wp; n = mat3(instanceMatrix) * n;
#endif
  wp = modelMatrix * wp; n = normalize(mat3(modelMatrix) * n);
  vW = wp.xyz; vN = n; vC = c; vA = a; vE = e;
  vec4 mv = viewMatrix * wp; vVZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const WFS = `
precision highp float;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oNormal;
#define NL ${NL}
uniform vec4 uLP[NL]; uniform vec3 uLC[NL]; uniform int uLN;
uniform float uTime; uniform vec3 uViewDir; uniform vec3 uFog; uniform float uFogNear; uniform float uFogDen;
uniform vec3 uSky; uniform vec3 uKey; uniform vec4 uCut[4]; uniform float uP; uniform float uRW; uniform float uPad; uniform vec2 uPadC; uniform vec4 uBlack[4]; uniform vec4 uBounds;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec4 vA; varying vec3 vE; varying vec3 vR; varying float vVZ;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float bayer4(vec2 p){ int x = int(mod(p.x,4.)), y = int(mod(p.y,4.)); int i = x + y*4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); return (m[i]+0.5)/16.; }
float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(h21(i), h21(i+vec2(1.,0.)), f.x), mix(h21(i+vec2(0.,1.)), h21(i+vec2(1.,1.)), f.x), f.y); }
void main(){
#ifdef STATIC
  for (int i = 0; i < 4; i++) {
    vec4 cu = uCut[i]; if (cu.w < 0.5) continue;
    float d = length(gl_FragCoord.xy - cu.xy);
    bool cuttable = (vA.x > 0.5 && vA.x < 1.5) || (vA.x > 3.5 && vA.x < 6.5);
    if (cuttable && d < cu.w && vVZ < cu.z - 1.2 && vW.y > 0.45) {
      float f = smoothstep(cu.w, cu.w*0.55, d);
      if (bayer4(gl_FragCoord.xy) < f*0.92) discard;
    }
  }
#endif
  vec3 N = normalize(vN);
  vec3 alb = vC; float k = vA.x; vec3 emis = vE + vC*vA.y; float wet = 0.;
  float black = 0.;
  for (int i = 0; i < 4; i++) { vec4 b = uBlack[i]; if (b.w <= 0.) continue; float d = length(vW.xz - b.xy); black = max(black, b.w * smoothstep(b.z, b.z*0.8, d)); }
  if (k > 0.5 && k < 1.5) {
    if (abs(N.y) < 0.5) {
      vec2 f = abs(N.x) > 0.5 ? vec2(vW.z, vW.y) : vec2(vW.x, vW.y);
      float st = vA.w, sd = vA.z;
      vec2 cs = st < 0.5 ? vec2(1.5,1.7) : st < 1.5 ? vec2(1.0,2.4) : st < 2.5 ? vec2(3.0,1.5) : vec2(2.2,3.2);
      vec2 g = f / cs; vec2 cell = floor(g); vec2 fr = fract(g);
      float faceId = N.x*13.1 + N.z*7.7;
      float hh = h21(cell + vec2(sd*91.7 + faceId, sd*13.3));
      if (vW.y < 2.8) {
        float u = fract(f.x/4.); float inS = step(0.1,u)*step(u,0.9)*step(0.25,vW.y)*step(vW.y,2.45);
        float sh = h21(vec2(floor(f.x/4.), sd*17. + faceId));
        alb = mix(alb*0.75, vec3(0.025,0.03,0.045), inS);
        emis += inS * step(0.45, sh) * mix(vec3(1.0,0.7,0.4), vec3(0.45,0.85,1.0), step(0.82, sh)) * 0.9;
      } else {
        float inW = step(0.18,fr.x)*step(fr.x,0.82)*step(0.22,fr.y)*step(fr.y,0.78);
        if (st > 2.5) inW *= step(0.5, h21(cell*0.37 + sd));
        alb *= 1. - step(fr.y, 0.07)*0.35;
        alb = mix(alb, vec3(0.022,0.026,0.04), inW);
        float lit = step(hh, 0.13 + 0.09*sin(sd*40.));
        float tint = h21(cell + 7.7 + sd);
        vec3 wc = tint < 0.55 ? vec3(1.0,0.7,0.4) : tint < 0.8 ? vec3(0.45,0.8,1.0) : tint < 0.92 ? vec3(1.0,0.4,0.7) : vec3(0.55,1.0,0.5);
        float flick = h21(cell + floor(uTime*3.)) > 0.992 ? 0.25 : 1.0;
        emis += inW * lit * wc * (0.4 + 0.5*hh) * flick;
      }
    } else { wet = 0.45; alb *= 0.85; }
    emis *= 1. - black*0.95;
  } else if (k > 1.5 && k < 2.5) {
    float lx = mod(vW.x, uP), lz = mod(vW.z, uP);
    bool hx = lz < uRW, vz2 = lx < uRW;
    alb = vec3(0.05,0.05,0.06) * (0.8 + 0.35*h21(floor(vW.xz*2.)));
    float mk = 0.; vec3 mc = vec3(0.7);
    if (hx && !vz2) {
      if (abs(lz - uRW*0.5) < 0.1 && fract(vW.x/4.) < 0.55) { mk = 1.; mc = vec3(0.9,0.55,0.12); }
      if (abs(lz - 0.6) < 0.08 || abs(lz - uRW + 0.6) < 0.08) mk = 0.6;
      if (((lx > uRW+0.4 && lx < uRW+2.6) || (lx > uP-2.6 && lx < uP-0.4)) && fract(lz/1.1) < 0.5 && lz > 1. && lz < uRW-1.) mk = 0.8;
    } else if (vz2 && !hx) {
      if (abs(lx - uRW*0.5) < 0.1 && fract(vW.z/4.) < 0.55) { mk = 1.; mc = vec3(0.9,0.55,0.12); }
      if (abs(lx - 0.6) < 0.08 || abs(lx - uRW + 0.6) < 0.08) mk = 0.6;
      if (((lz > uRW+0.4 && lz < uRW+2.6) || (lz > uP-2.6 && lz < uP-0.4)) && fract(lx/1.1) < 0.5 && lx > 1. && lx < uRW-1.) mk = 0.8;
    }
    alb = mix(alb, mc*0.55, mk*0.8);
    wet = 0.9;
  } else if (k > 2.5 && k < 3.5) {
    vec2 t = fract(vW.xz); float ln = max(step(t.x, 0.05), step(t.y, 0.05));
    alb *= (1. - ln*0.35) * (0.9 + 0.2*h21(floor(vW.xz)));
    wet = 0.55 * step(0.5, N.y);
  } else if (k > 3.5 && k < 4.5) {
    vec2 f = abs(N.x) > 0.5 ? vec2(vW.z, vW.y) : abs(N.z) > 0.5 ? vec2(vW.x, vW.y) : vW.xz;
    float on = 1.;
    if (vA.w > 0.5 && abs(N.y) < 0.5) {
      vec2 g = floor(f / 0.2); vec2 cc = mod(g, vec2(4.,6.));
      on = step(0.42, h21(g*0.731 + vA.z*31.)) * step(cc.x, 2.5) * step(cc.y, 4.5);
    }
    float fl = 0.88 + 0.12*sin(uTime*31. + vA.z*50.);
    if (h21(vec2(floor(uTime*7.), vA.z*99.)) > 0.975) fl *= 0.15;
    emis = vC * vA.y * fl * mix(0.1, 1.0, on) * (1. - black*0.97);
    alb = vC * 0.12;
  } else if (k > 4.5 && k < 5.5) {
    vec2 f = abs(N.x) > 0.5 ? vec2(vW.z, vW.y) : vec2(vW.x, vW.y);
    float t = uTime*0.7 + vA.z*10.;
    float ph = floor(mod(t*0.25, 3.0));
    vec3 c1 = vA.z < 0.33 ? vec3(1.,0.25,0.5) : vA.z < 0.66 ? vec3(0.3,1.,0.85) : vec3(1.,0.6,0.15);
    vec3 c2 = vA.z < 0.33 ? vec3(0.35,0.5,1.) : vA.z < 0.66 ? vec3(1.,0.3,0.6) : vec3(0.5,1.,0.4);
    float st = step(0.5, fract(f.x*0.45 - t*0.9 + f.y*0.25));
    vec2 g = floor(f*3.5); float on = step(0.55, h21(g + floor(t*2.)));
    vec3 pat = ph < 0.5 ? mix(c1, c2, st)*(0.7 + 0.6*on) : ph < 1.5 ? c1*on*1.6 + c2*0.15 : mix(c2, c1, step(0.5, fract(f.y*0.6 + t)))*(0.6+0.7*on);
    emis = pat * 1.9 * step(abs(N.y), 0.5) * (1. - black*0.97);
    alb = vec3(0.04);
  } else if (k > 5.5 && k < 6.5) {
    alb = vec3(0.02,0.03,0.05); wet = 0.35 * step(0.5, N.y);
  } else if (k > 6.5 && k < 7.5) {
    float d = length(vW.xz - uPadC);
    float ring = step(abs(fract(d/1.6 - uTime*0.6*uPad) - 0.5), 0.07) * step(d, 4.6);
    float edge = step(4.6, max(abs(vW.x-uPadC.x), abs(vW.z-uPadC.y)));
    alb = vec3(0.08,0.09,0.1);
    emis = vec3(0.3,1.,0.85) * (ring + edge*0.6) * (0.25 + 1.8*uPad);
    wet = 0.5;
  } else if (k > 7.5 && k < 8.5) {
    emis = vC * vA.y * (1. - black*0.95);
  } else if (k > 8.5 && k < 9.5) {
    emis = vE;
    float n = vn2(vW.xz*0.35);
    alb = vec3(0.045,0.047,0.052) * (0.8 + 0.3*n) * (0.9 + 0.2*h21(floor(vW.xz*3.)));
    wet = mix(0.5, 1.0, smoothstep(0.5, 0.68, n));
    if (vA.w > -0.5) {
      float hw = vA.w < 1.5 ? 4. : vA.y, l, al;
      if (vA.w < 0.5) { l = vW.x - vA.z; al = vW.z; } else if (vA.w < 1.5) { l = vW.z - vA.z; al = vW.x; }
      else { float th = vA.w - 2.; vec2 d = vec2(cos(th), sin(th)); l = dot(vW.xz, vec2(-d.y, d.x)) - vA.z; al = dot(vW.xz, d); }
      float al2 = abs(l);
      if (hw > 0.5) {
        if (hw > 2.6 && al2 < 0.1 && fract(al/5.) < 0.45) { alb = vec3(0.62,0.46,0.12); emis += vec3(0.05,0.035,0.008); }
        if (hw > 5.5 && abs(al2 - hw*0.5) < 0.08 && fract(al/3.) < 0.4) { alb = vec3(0.4,0.41,0.43); emis += vec3(0.015); }
        if (al2 > hw - 0.75 && al2 < hw - 0.55 && h21(floor(vec2(al*4., 2.))) > 0.12) { alb = vec3(0.42,0.43,0.45); emis += vec3(0.022,0.024,0.026); }
        if (al2 > hw - 0.5) { alb = vec3(0.075,0.07,0.062) * (0.75 + 0.5*h21(floor(vW.xz*5.))); wet = 0.25; }
      }
    }
  } else if (k > 9.5 && k < 10.5) {
    float n = vn2(vW.xz*0.12)*0.6 + vn2(vW.xz*0.55)*0.4;
    vec3 grass = vec3(0.05,0.085,0.035), mud = vec3(0.07,0.055,0.04);
    alb = mix(grass, mud, smoothstep(0.45, 0.68, n));
    float sp = h21(floor(vW.xz*4.) + 1.7);
    if (sp > 0.82) alb = vec3(0.085,0.14,0.05);
    else if (sp < 0.22) alb *= 0.45;
    wet = 0.85 * smoothstep(0.72, 0.78, n);
  } else if (k > 10.5 && k < 11.5) {
    vec2 f = abs(N.y) > 0.5 ? vW.xz : abs(N.x) > 0.5 ? vec2(vW.z, vW.y) : vec2(vW.x, vW.y);
    vec2 g = vec2(f.x + f.y, f.x - f.y) * 2.2; vec2 fr = abs(fract(g) - 0.5);
    if (max(fr.x, fr.y) < 0.36 && vA.y < 0.5) discard;
    alb = vec3(0.3,0.31,0.33);
  } else if (k > 12.5) {
    float n = vn2(vW.xz*0.22 + vec2(uTime*0.12, uTime*0.07)), r = vn2(vW.xz*1.4 - vec2(uTime*0.35, uTime*0.2));
    alb = vec3(0.012,0.028,0.034) * (0.75 + 0.5*n) + vec3(0.025,0.05,0.055) * step(0.72, r);
    wet = 1.0; emis = vec3(0.);
  } else if (k > 11.5) {
    vec2 q = vA.zw * 2.; float ang = atan(q.y, q.x); float r = length(q); float sd = vR.z; float ty = vR.y;
    float e = 0.74 + 0.12*sin(ang*3. + sd*20.) + 0.08*sin(ang*7. + sd*41.) + (h21(vec2(floor(ang*5.), sd*13.)) - 0.5)*(ty > 0.5 ? 0.22 : 0.36);
    if (r > e) {
      if (ty < 0.5 && h21(floor(q*5.) + sd*7.) > 0.86 && r < 1.0) {} else discard;
    }
    float t = r / e;
    if (bayer4(gl_FragCoord.xy) < smoothstep(0.62, 1.0, t)*0.9) discard;
    if (ty > 0.5) {
      alb = mix(vec3(0.008,0.007,0.008), vec3(0.05,0.04,0.032), smoothstep(0.25, 1.0, t));
      alb *= 0.75 + 0.5*h21(vec2(floor(ang*11. + sd), sd));
      wet = 0.;
    } else { alb = vC * (0.8 + 0.4*h21(floor(q*4.) + sd)); wet = 0.75; }
    emis = vec3(0.);
  }
#ifdef TINTED
  if (vR.x > 0.5) {
    vec3 cell = floor(vW*5.);
    float n1 = h21(cell.xz + cell.y*7.31);
    alb = n1 > 0.78 ? vec3(0.16,0.07,0.025) : n1 > 0.55 && N.y > 0.5 ? vec3(0.13,0.12,0.11) : n1 > 0.42 ? vC*0.25 + vec3(0.03) : vec3(0.028,0.025,0.024);
    if (abs(N.y) < 0.5 && fract(vW.y*3.1 + n1) < 0.12) alb = vec3(0.2,0.19,0.18);
    if (k > 5.5 && k < 6.5) { if (h21(floor(vW.xz*8.) + floor(vW.y*8.)*3.7) > 0.4) discard; alb = vec3(0.01); }
    float em = step(0.88, h21(cell.xz + cell.y*3.3 + floor(uTime*4. + n1*9.)*0.17)) * vR.y;
    emis = vec3(2.4,0.75,0.12) * em * (0.6 + 0.4*n1);
    wet = 0.;
  }
#endif
  vec3 L = mix(vec3(0.016,0.013,0.028), uSky, N.y*0.5 + 0.5);
  L += uKey * max(dot(N, normalize(vec3(-0.4,0.8,-0.3))), 0.) * 0.55;
  for (int i = 0; i < NL; i++) {
    if (i >= uLN) break;
    vec4 lp = uLP[i]; vec3 d = lp.xyz - vW; float dist = length(d);
    float at = clamp(1. - dist/lp.w, 0., 1.); at *= at;
    if (at <= 0.) continue;
    float nd = max(dot(N, d/max(dist,1e-3)), 0.)*0.82 + 0.18;
    L += uLC[i] * at * nd;
  }
  vec3 col = alb * L + emis;
#ifdef STATIC
  float ob = max(max(uBounds.x - vW.x, vW.x - uBounds.z), max(uBounds.y - vW.z, vW.z - uBounds.w));
  if (ob > -0.6) {
    float gl = dot(col, vec3(0.3, 0.5, 0.2));
    col = mix(col, vec3(gl*0.55, gl*0.6, gl*0.75), smoothstep(-0.6, 8., ob) * 0.88);
    if (vW.y < 0.5 && N.y > 0.5 && abs(ob + 0.3) < 0.14 && fract((vW.x + vW.z)*0.33) < 0.55) col += vec3(0.5, 0.12, 0.2);
  }
#endif
#ifdef PEOPLE
  float rim = pow(1. - max(dot(N, -uViewDir), 0.), 2.);
  col += vR * rim * 0.85;
#endif
  float fz = max(vVZ - uFogNear, 0.);
  float fog = 1. - exp(-fz*uFogDen);
  float mist = exp(-max(vW.y, 0.)*0.35) * 0.3;
  col = mix(col, uFog, clamp(fog + mist*0.45, 0., 0.85));
  oColor = vec4(col, 1.);
  vec3 vn = normalize((viewMatrix * vec4(N, 0.)).xyz);
#ifdef PEOPLE
  wet = 1.;
#endif
  oNormal = vec4(vn*0.5 + 0.5, wet);
}`;

const FXP_VS = `attribute vec3 aCol; attribute float aSize; uniform float uPPU; varying vec3 vC;
void main(){ vC = aCol; vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; gl_PointSize = max(1., aSize*uPPU); }`;
const FXP_FS = `precision highp float; layout(location=0) out vec4 oColor; layout(location=1) out vec4 oNormal; varying vec3 vC;
void main(){ vec2 q = gl_PointCoord - 0.5; if (dot(q,q) > 0.25) discard; oColor = vec4(vC, 1.); oNormal = vec4(0.); }`;
const FXL_VS = `attribute vec3 aCol; varying vec3 vC; void main(){ vC = aCol; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const FXL_FS = `precision highp float; layout(location=0) out vec4 oColor; layout(location=1) out vec4 oNormal; varying vec3 vC;
void main(){ oColor = vec4(vC, 1.); oNormal = vec4(0.); }`;
const RAIN_VS = `attribute vec4 seed; uniform float uTime; uniform vec3 uCenter; uniform float uRain; varying float vA;
void main(){
  vec3 box = vec3(90., 46., 90.);
  float sp = 34. * (0.85 + 0.3*seed.w);
  float y = mod(seed.y*box.y - uTime*sp, box.y) - 2.;
  float x = uCenter.x + (fract(seed.x - uCenter.x/box.x) - 0.5)*box.x + y*0.12;
  float z = uCenter.z + (fract(seed.z - uCenter.z/box.z) - 0.5)*box.z + y*0.05;
  vec3 p = vec3(x, y, z);
  if (gl_VertexID % 2 == 1) p += vec3(0.12, 1.25, 0.05);
  vA = step(seed.w, uRain);
  if (vA < 0.5) p = vec3(0.);
  gl_Position = projectionMatrix*viewMatrix*vec4(p,1.);
}`;
const RAIN_FS = `precision highp float; layout(location=0) out vec4 oColor; layout(location=1) out vec4 oNormal; varying float vA;
void main(){ oColor = vec4(vec3(0.32,0.4,0.58)*0.42*vA, 1.); oNormal = vec4(0.); }`;
const SPL_VS = `attribute vec4 seed; uniform float uTime; uniform vec3 uCenter; uniform float uRain; uniform float uPPU; varying float vA;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main(){
  float t = uTime*1.7 + seed.w*7.;
  float slot = floor(t); float life = fract(t);
  vec2 r = vec2(h(seed.xy + slot), h(seed.zx + slot*1.3)) - 0.5;
  vec3 p = vec3(uCenter.x + (fract(r.x + 0.5 - uCenter.x/80.) - 0.5)*80., 0.18, uCenter.z + (fract(r.y + 0.5 - uCenter.z/80.) - 0.5)*80.);
  vA = step(life, 0.16) * step(seed.y, uRain);
  gl_Position = projectionMatrix*viewMatrix*vec4(p,1.);
  gl_PointSize = vA > 0.5 ? max(1., uPPU*0.16) : 0.;
}`;
const SPL_FS = `precision highp float; layout(location=0) out vec4 oColor; layout(location=1) out vec4 oNormal; varying float vA;
void main(){ oColor = vec4(vec3(0.5,0.6,0.8)*0.5*vA, 1.); oNormal = vec4(0.); }`;

const QUAD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
const BRIGHT_FS = `uniform sampler2D tC; uniform float uTh; varying vec2 vUv;
void main(){ vec3 c = texture2D(tC, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(uTh, uTh + 1.2, l), 1.); }`;
const BLUR_FS = `uniform sampler2D tI; uniform vec2 uDir; varying vec2 vUv;
void main(){ vec3 s = texture2D(tI, vUv).rgb*0.227;
  s += (texture2D(tI, vUv + uDir*1.385).rgb + texture2D(tI, vUv - uDir*1.385).rgb)*0.316;
  s += (texture2D(tI, vUv + uDir*3.231).rgb + texture2D(tI, vUv - uDir*3.231).rgb)*0.07;
  gl_FragColor = vec4(s, 1.); }`;
const COPY_FS = `uniform sampler2D tI; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tI, vUv).rgb, 1.); }`;
const COMP_FS = `
uniform sampler2D tC; uniform sampler2D tN; uniform sampler2D tD;
uniform vec2 uRes; uniform vec4 uFr; uniform float uNear; uniform float uFar; uniform mat4 uVI;
uniform float uTime; uniform float uOut; uniform float uRefl; uniform float uDith; uniform float uQ; uniform float uLevels; uniform float uHack; uniform float uExp;
uniform vec3 uPal[48]; uniform int uPalN; uniform vec3 uFog; uniform vec3 uUpV;
varying vec2 vUv;
float lin(vec2 uv){ return uNear + texture2D(tD, uv).r*(uFar - uNear); }
float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(hh(i), hh(i+vec2(1.,0.)), f.x), mix(hh(i+vec2(0.,1.)), hh(i+vec2(1.,1.)), f.x), f.y); }
float bayer4(vec2 p){ int x = int(mod(p.x,4.)), y = int(mod(p.y,4.)); int i = x + y*4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); return (m[i]+0.5)/16.; }
void main(){
  vec2 px = 1./uRes; vec2 uv = vUv;
  float dRaw = texture2D(tD, uv).r;
  vec3 col = texture2D(tC, uv).rgb;
  vec4 nw = texture2D(tN, uv);
  vec3 n = normalize(nw.xyz*2. - 1.); float wet = nw.a; bool chr = wet > 0.98;
  bool bg = dRaw > 0.99999;
  float dc = uNear + dRaw*(uFar - uNear);
  if (bg) col = uFog;
  if (!bg && !chr && wet > 0.01 && uRefl > 0. && dot(n, uUpV) > 0.85) {
    vec3 P = vec3(mix(uFr.x, uFr.y, uv.x), mix(uFr.z, uFr.w, uv.y), -dc);
    vec3 W = (uVI * vec4(P, 1.)).xyz;
    float puddle = smoothstep(0.38, 0.62, vn(W.xz*0.22));
    float amt = wet * mix(0.35, 1.0, puddle) * uRefl;
    vec2 rip = vec2(vn(W.xz*2.5 + uTime*2.3), vn(W.zx*2.5 - uTime*2.1)) - 0.5;
    vec3 Rv = reflect(vec3(0.,0.,-1.), n);
    float t = 0.35; vec3 hit = vec3(0.); float found = 0.;
    for (int i = 0; i < 40; i++) {
      vec3 q = P + Rv*t;
      vec2 quv = vec2((q.x - uFr.x)/(uFr.y - uFr.x), (q.y - uFr.z)/(uFr.w - uFr.z));
      if (quv.x < 0. || quv.x > 1. || quv.y < 0. || quv.y > 1.) break;
      float sd = lin(quv); float rd = -q.z;
      if (rd > sd + 0.05 && rd < sd + 1.4 + t*0.08) {
        hit = texture2D(tC, quv + rip*px*(1.0 + 2.5*puddle)).rgb;
        found = 1. - smoothstep(18., 44., t);
        break;
      }
      t += 0.25 + t*0.07;
    }
    col += hit * found * amt * 0.8;
  }
  float de = 0., ne = 0., oc = 0.;
  if (!bg) {
    vec2 offs[4] = vec2[4](vec2(1.,0.), vec2(-1.,0.), vec2(0.,1.), vec2(0.,-1.));
    for (int i = 0; i < 4; i++) {
      vec2 o = uv + offs[i]*px;
      float dr = texture2D(tD, o).r;
      float dd = (dr > 0.99999 ? 1e4 : uNear + dr*(uFar - uNear)) - dc;
      if (dd > 0.55) de += 1.;
      if (!chr && dd < -0.55 && texture2D(tN, o).a > 0.98) oc += 1.;
      if (abs(dd) < 0.55) {
        vec3 nn = normalize(texture2D(tN, o).xyz*2. - 1.);
        if (1. - dot(n, nn) > 0.2 && dot(n - nn, vec3(0.35,0.85,0.4)) > 0.05) ne += 1.;
      }
    }
  }
  float lum = max(col.r, max(col.g, col.b));
  if (uOut > 0.5) {
    if (oc > 0.) col = col*0.18 + vec3(0.003,0.,0.008);
    else if (de > 0. && lum < 1.4) col = col*(chr ? 0.6 : 0.32) + vec3(0.004,0.,0.012);
    else if (ne > 0.) col = col*1.45 + vec3(0.012,0.016,0.024);
  }
  col *= uExp;
  float m = max(col.r, max(col.g, col.b));
  col = col / (1. + m*0.5) * 1.3;
  col = pow(clamp(col, 0., 1.), vec3(1./2.2));
  float edgeAny = clamp(de + ne, 0., 1.);
  vec3 hc = vec3(0.012,0.022,0.026) + vec3(0.25,0.85,0.7)*edgeAny*0.28 + col*0.06;
  col = mix(col, hc, uHack);
  float b = chr ? 0. : bayer4(gl_FragCoord.xy) - 0.5;
  vec3 qc = col;
  if (uQ > 1.5) {
    qc = floor(clamp(col, 0., 1.)*uLevels + 0.5 + b*uDith) / uLevels;
  } else if (uQ > 0.5) {
    vec3 c2 = col + b*uDith*0.1;
    float best = 1e9; vec3 bc = c2;
    for (int i = 0; i < 48; i++) {
      if (i >= uPalN) break;
      vec3 d = c2 - uPal[i]; float dd = dot(d*d, vec3(0.32,0.48,0.2));
      if (dd < best) { best = dd; bc = uPal[i]; }
    }
    qc = bc;
  }
  gl_FragColor = vec4(qc, 1.);
}`;
const FINAL_FS = `
uniform sampler2D tP; uniform sampler2D tB1; uniform sampler2D tB2;
uniform vec2 uLow; uniform float uS; uniform vec2 uOff; uniform float uM; uniform vec2 uScreen;
uniform float uBloom; uniform float uCrt; uniform float uFlash; uniform float uHack;
void main(){
  vec2 lp = gl_FragCoord.xy / uS + vec2(uM) + uOff;
  vec2 uv = (floor(lp) + 0.5) / uLow;
  vec3 c = texture2D(tP, uv).rgb;
  vec2 buv = lp / uLow;
  vec3 b = texture2D(tB1, buv).rgb*0.55 + texture2D(tB2, buv).rgb*0.95;
  c += b * uBloom * (1. - uHack*0.8);
  if (uCrt > 0.) {
    float fy = fract(lp.y);
    c *= 1. - uCrt*0.2*smoothstep(0.6, 1.0, fy);
    vec2 q = gl_FragCoord.xy/uScreen - 0.5;
    c *= 1. - uCrt*dot(q, q)*0.85;
  }
  c += uFlash * vec3(1., 0.92, 0.85);
  gl_FragColor = vec4(c, 1.);
}`;

/* ================================================================ renderer */
const glCanvas = $('#gl'), ov = $('#ov'), ctx = ov.getContext('2d');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false, powerPreference: 'high-performance' }); }
catch (e) { fatal('This browser could not start WebGL. Turn on hardware acceleration and reload.'); return; }
if (!renderer.capabilities.isWebGL2) { fatal('This prototype needs WebGL 2. Try a current Chrome, Edge, Firefox or Safari.'); return; }
renderer.autoClear = false;

const U = {
  uTime: { value: 0 }, uViewDir: { value: new THREE.Vector3() },
  uFog: { value: new THREE.Vector3(0.032, 0.028, 0.065) }, uFogNear: { value: 200 }, uFogDen: { value: 0.022 },
  uLP: { value: Array.from({ length: NL }, () => new THREE.Vector4()) },
  uLC: { value: Array.from({ length: NL }, () => new THREE.Vector3()) }, uLN: { value: 0 },
  uCut: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
  uBlack: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
  uP: { value: 36 }, uRW: { value: 10 }, uPad: { value: 0 }, uPadC: { value: new THREE.Vector2() }, uBounds: { value: new THREE.Vector4(0, 0, 226, 226) },
  uPPU: { value: 10 }, uCenter: { value: new THREE.Vector3() }, uRain: { value: 1 },
  uSky: { value: new THREE.Vector3(0.045, 0.055, 0.1) }, uKey: { value: new THREE.Vector3(0.09, 0.11, 0.19) },
};
const wMat = (defines) => new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: U, vertexShader: WVS, fragmentShader: WFS, defines: defines || {} });
const MAT = { stat: wMat({ STATIC: 1 }), dyn: wMat({}), people: wMat({ PEOPLE: 1 }), tinted: wMat({ TINTED: 1 }) };
const fxPMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: U, vertexShader: FXP_VS, fragmentShader: FXP_FS, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
const fxLMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: U, vertexShader: FXL_VS, fragmentShader: FXL_FS, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

