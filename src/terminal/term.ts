// The company terminal: an immediate-mode character grid drawn through a WebGL CRT pass.
// Each frame the caller rebuilds the grid and its click regions; paint() turns cells into a 2D canvas
// with the brightness in one colour channel per hue, and the shader tints and distresses that.
// The renderer and shader follow github.com/thebuilder/signal-lost (apps/web/src/crt/terminal.ts).

export type Hue = 0 | 1 | 2; // phosphor, alert, accent
export interface Rect { x: number; y: number; w: number; h: number }
export interface Cell { c: string; b: number; inv: boolean; u: boolean; hue: Hue }
export interface Style { b?: number; inv?: boolean; u?: boolean; hue?: Hue }
export interface Palette { phosphor: number[]; alert: number[]; accent: number[] }
export type Bitmap = HTMLCanvasElement;
interface Region extends Rect { id: string; on?: () => void; wheel?: (dir: number) => void }
interface Blit extends Rect { src: Bitmap; top: boolean; dy: number }
export type DrawFn = (t: Term, now: number) => void;

export const PALETTES: Record<string, Palette> = {
  teal: { phosphor: [0.45, 1, 0.84], alert: [1, 0.3, 0.46], accent: [1, 0.74, 0.36] },
  amber: { phosphor: [1, 0.64, 0.2], alert: [1, 0.2, 0.15], accent: [0.88, 0.92, 1] },
  green: { phosphor: [0.4, 1, 0.5], alert: [1, 0.3, 0.2], accent: [1, 0.85, 0.4] },
};

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FONT = 'VT323';
const blank = (): Cell => ({ c: ' ', b: 0, inv: false, u: false, hue: 0 });

const VS = 'attribute vec2 p; varying vec2 v; void main(){ v = p*0.5+0.5; v.y = 1.0-v.y; gl_Position = vec4(p,0.,1.); }';
const FS = `
  precision mediump float;
  uniform sampler2D tex;
  uniform vec2 res; uniform float dpr, time, k, flick, roll, glitch, power;
  uniform vec3 tint, alertTint, accentTint;
  varying vec2 v;
  float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
  vec2 curve(vec2 uv, float a){ uv = uv*2.-1.; vec2 o = abs(uv.yx)/vec2(mix(18.,5.,a), mix(14.,4.,a)); uv += uv*o*o; return uv*.5+.5; }
  void main(){
    vec2 uv = curve(v, k);
    if (uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.) { gl_FragColor = vec4(0.,0.,0.,1.); return; }
    float sq = max(power*power, 0.006);
    vec2 suv = vec2(uv.x, (uv.y-.5)/sq+.5);
    if (suv.y<0.||suv.y>1.) { gl_FragColor = vec4(0.,0.,0.,1.); return; }
    suv.y = fract(suv.y + roll);
    float band = floor(suv.y*28.);
    float g = step(1.0 - glitch*0.6, rnd(vec2(band, floor(time*18.))));
    suv.x += g*(rnd(vec2(band, time)) - .5)*0.09*glitch;
    suv.x += (rnd(vec2(floor(suv.y*res.y/dpr*0.5), floor(time*24.))) - .5)*0.0008*k*k;
    vec2 px = 1.0/res;
    float ca = (0.25 + 1.6*k)*dpr*px.x + glitch*0.008;
    float r = texture2D(tex, suv + vec2(ca, 0.)).r;
    vec3 mid = texture2D(tex, suv).rgb;
    float b = texture2D(tex, suv - vec2(ca, 0.)).r;
    vec3 bloom = vec3(0.);
    for (int i=-2;i<=2;i++) for (int j=-2;j<=2;j++)
      bloom += texture2D(tex, suv + vec2(float(i),float(j))*px*dpr*1.8).rgb;
    bloom /= 25.;
    vec3 col = tint*mid.r + vec3(r-mid.r, 0., b-mid.r)*0.35*k + tint*bloom.x*(0.18 + 0.8*k);
    col += alertTint*(mid.g + bloom.y*(0.5 + 0.8*k))*(0.85 + 0.15*sin(time*4.0));
    col += accentTint*(mid.b + bloom.z*(0.18 + 0.8*k));
    float sl = 0.5 - 0.5*sin(suv.y*res.y/dpr*3.14159);
    col *= 1.0 - (0.05 + 0.25*k)*sl;
    col *= 1.0 - 0.1*k*(0.5 - 0.5*sin(gl_FragCoord.x*2.094));
    col += tint*(rnd(uv*res + time) - .5)*(0.015 + 0.06*k);
    col += tint*0.018;
    col *= 1.0 - (0.008 + 0.03*k)*(0.5 + 0.5*sin(time*110.));
    col *= 1.0 - flick;
    col *= 1.0 + (1.0 - power)*2.0;
    col *= pow(16.*uv.x*uv.y*(1.-uv.x)*(1.-uv.y), 0.05 + 0.18*k);
    gl_FragColor = vec4(col, 1.);
  }`;

export class Term {
  cols = 120; rows = 30; cw = 8; ch = 21; font = 20; dpr = 1;
  crt = 0.3; power = 1; flick = 0; glitch = 0; roll = 0;
  palette = PALETTES.teal;
  hover: string | null = null;
  onPress: (() => void) | null = null;
  private cells: Cell[][] = [];
  private clipR: Rect | null = null;
  private regions: Region[] = [];
  private shown: Region[] = [];
  private blits: Blit[] = [];
  private text = document.createElement('canvas');
  private ctx = this.text.getContext('2d')!;
  private gl: WebGLRenderingContext;
  private U: Record<string, WebGLUniformLocation | null> = {};
  private mouse: [number, number] = [-1, -1];
  private t0 = performance.now();
  private lastTick = 0;

  constructor(private glass: HTMLElement, private canvas: HTMLCanvasElement, private draw: DrawFn, public minRows = 30, public minCols = 120) {
    const gl = canvas.getContext('webgl', { antialias: false });
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader failed');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog); gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['tex', 'res', 'dpr', 'time', 'k', 'flick', 'roll', 'glitch', 'power', 'tint', 'alertTint', 'accentTint']) this.U[n] = gl.getUniformLocation(prog, n);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    for (const [p, val] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, val);
    gl.uniform1i(this.U.tex, 0);
    canvas.addEventListener('pointermove', (e) => this.track(e));
    canvas.addEventListener('pointerleave', () => { this.mouse = [-1, -1]; });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [x, y] = this.mouse;
      for (let i = this.shown.length - 1; i >= 0; i--) { const r = this.shown[i]; if (r.wheel && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) { r.wheel(Math.sign(e.deltaY)); return; } }
    }, { passive: false });
    canvas.addEventListener('pointerdown', (e) => { this.track(e); if (this.onPress) this.onPress(); const r = this.regionAt(); if (r && r.on) r.on(); });
    addEventListener('resize', () => this.resize());
    this.resize();
    if (document.fonts) document.fonts.load('20px ' + FONT).then(() => this.resize());
  }

  /** For tests: runs the click handler of a region from the last frame. */
  click(id: string) { const r = this.shown.find((s) => s.id === id); if (!r || !r.on) return false; r.on(); return true; }
  /** For tests: the screen as lines of text. */
  screenText() { return this.cells.map((row) => row.map((c) => c.c).join('').trimEnd()); }

  private track(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse = [Math.floor((e.clientX - r.left) / this.cw), Math.floor((e.clientY - r.top) / this.ch)];
  }
  private regionAt(): Region | undefined {
    const [x, y] = this.mouse;
    for (let i = this.shown.length - 1; i >= 0; i--) { const r = this.shown[i]; if (r.on && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) return r; }
    return undefined;
  }

  resize() {
    const g = this.glass.getBoundingClientRect();
    this.dpr = Math.min(2, devicePixelRatio || 1);
    let font = Math.max(10, Math.floor((g.height - 8) / (this.minRows * 1.05)));
    const measure = (f: number) => { this.ctx.font = f + 'px ' + FONT + ', monospace'; return Math.ceil(this.ctx.measureText('M').width); };
    while (font > 10 && (g.width - 8) / measure(font) < this.minCols) font--;
    this.font = font; this.cw = measure(font); this.ch = Math.round(font * 1.05);
    this.cols = Math.max(this.minCols, Math.floor((g.width - 8) / this.cw));
    this.rows = Math.max(this.minRows, Math.floor((g.height - 8) / this.ch));
    const w = this.cols * this.cw, h = this.rows * this.ch;
    this.text.width = this.canvas.width = Math.round(w * this.dpr);
    this.text.height = this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.cells = Array.from({ length: this.rows }, () => Array.from({ length: this.cols }, blank));
  }

  /* ---------------------------------------------------------------- drawing onto the grid */
  clear() {
    for (const row of this.cells) for (const c of row) { c.c = ' '; c.b = 0; c.inv = false; c.u = false; c.hue = 0; }
    this.regions = []; this.blits = []; this.clipR = null;
  }
  clip(r: Rect | null) { this.clipR = r; }
  private ok(x: number, y: number) {
    const r = this.clipR;
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows && (!r || (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h));
  }
  cell(x: number, y: number, c: string, s: Style = {}) {
    if (!this.ok(x, y)) return;
    const o = this.cells[y][x];
    o.c = c; o.b = s.b ?? 0.7; o.inv = !!s.inv; o.u = !!s.u; o.hue = s.hue ?? 0;
  }
  put(x: number, y: number, t: string, s: Style = {}) {
    const a = [...t];
    a.forEach((c, i) => this.cell(x + i, y, c, s));
    return a.length;
  }
  right(x: number, y: number, t: string, s: Style = {}) { return this.put(x - [...t].length, y, t, s); }
  center(r: Rect, y: number, t: string, s: Style = {}) { return this.put(r.x + Math.floor((r.w - [...t].length) / 2), y, t, s); }
  hline(x: number, y: number, w: number, c = '─', s: Style = { b: 0.4 }) { for (let i = 0; i < w; i++) this.cell(x + i, y, c, s); }
  box(r: Rect, title = '', s: Style = { b: 0.42 }, double = false) {
    const [h, v, a, b, c, d] = double ? ['═', '║', '╔', '╗', '╚', '╝'] : ['─', '│', '┌', '┐', '└', '┘'];
    for (let x = r.x + 1; x < r.x + r.w - 1; x++) { this.cell(x, r.y, h, s); this.cell(x, r.y + r.h - 1, h, s); }
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) { this.cell(r.x, y, v, s); this.cell(r.x + r.w - 1, y, v, s); }
    this.cell(r.x, r.y, a, s); this.cell(r.x + r.w - 1, r.y, b, s); this.cell(r.x, r.y + r.h - 1, c, s); this.cell(r.x + r.w - 1, r.y + r.h - 1, d, s);
    if (title) this.put(r.x + 2, r.y, ' ' + title + ' ', { b: 0.8, hue: s.hue });
  }
  /** A clickable span. Hovering it inverts it; returns the width used. */
  button(x: number, y: number, label: string, id: string, on: () => void, s: Style = {}) {
    const w = [...label].length, hot = this.hover === id;
    this.regions.push({ x, y, w, h: 1, id, on });
    this.put(x, y, label, { b: s.b ?? 0.8, hue: s.hue, inv: !!s.inv !== hot, u: s.u });
    return w;
  }
  /** Marks an area clickable without drawing, so a whole row or panel can respond. */
  region(r: Rect, id: string, on?: () => void) { this.regions.push({ ...r, id, on }); }
  /** Makes the mouse wheel over an area call fn with -1 or 1. */
  wheel(r: Rect, id: string, fn: (dir: number) => void) { this.regions.push({ ...r, id, wheel: fn }); }
  /** Draws a bitmap inside a cell rectangle at a whole-number scale, so every source pixel stays square and crisp.
   *  Centred, or against the rectangle's top, and dy screen pixels lower for smooth motion. Its colour channels are
   *  read by hue, like the text. */
  pixels(r: Rect, src: Bitmap, top = false, dy = 0) { this.blits.push({ ...r, src, top, dy }); }

  wrap(text: string, w: number) {
    const out: string[] = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        if (line && line.length + 1 + word.length > w) { out.push(line); line = word; }
        else line = line ? line + ' ' + word : word;
      }
      out.push(line);
    }
    return out;
  }

  /* ---------------------------------------------------------------- painting */
  private paint(dt: number) {
    const { ctx, cw, ch, dpr } = this, yo = Math.round((ch - this.font) / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // the old frame fades by elapsed time, so a slow machine shows the same glow and no ghosts of past screens
    ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,' + (REDUCED ? 1 : (1 - Math.exp(-dt / 16)).toFixed(3)) + ')';
    ctx.fillRect(0, 0, this.text.width, this.text.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = this.font + 'px ' + FONT + ', monospace'; ctx.textBaseline = 'top';
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const im of this.blits) {
      const rw = im.w * cw * dpr, rh = im.h * ch * dpr, s = Math.max(1, Math.floor(Math.min(rw / im.src.width, rh / im.src.height)));
      const dw = im.src.width * s, dh = im.src.height * s;
      ctx.drawImage(im.src, Math.round(im.x * cw * dpr + (rw - dw) / 2), Math.round((im.y * ch + im.dy) * dpr + (im.top ? 0 : (rh - dh) / 2)), dw, dh);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const col = (hue: Hue, b: number) => { const v = Math.round(255 * b); return hue === 1 ? 'rgb(0,' + v + ',0)' : hue === 2 ? 'rgb(0,0,' + v + ')' : 'rgb(' + v + ',0,0)'; };
    for (let y = 0; y < this.rows; y++) {
      const row = this.cells[y];
      for (let x = 0; x < this.cols; x++) {
        const c = row[x], px = x * cw, py = y * ch;
        if (c.inv) {
          ctx.fillStyle = col(c.hue, Math.max(0.55, c.b)); ctx.fillRect(px, py, cw, ch);
          if (c.c !== ' ') { ctx.fillStyle = '#000'; ctx.fillText(c.c, px, py + yo); }
          continue;
        }
        if (c.c === ' ' || c.b <= 0) continue;
        ctx.fillStyle = col(c.hue, c.b);
        if (c.c === '█') ctx.fillRect(px, py, cw, ch);
        else if (c.c === '▬') ctx.fillRect(px, py + Math.round(ch * 0.3), cw - 1, Math.round(ch * 0.4));
        else ctx.fillText(c.c, px, py + yo);
        if (c.u) ctx.fillRect(px, py + ch - 2, cw, 1);
      }
    }
  }

  /** Rebuilds and draws one frame. The game's frame loop calls this while the terminal is on screen. */
  tick(now: number) {
    const r = this.regionAt();
    this.hover = r && r.on ? r.id : null;
    this.canvas.style.cursor = this.hover ? 'pointer' : 'default';
    this.clear();
    this.draw(this, now);
    this.shown = this.regions;
    this.paint(now - (this.lastTick || now - 16));
    this.lastTick = now;
    const { gl, U, palette: P } = this;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.text);
    gl.uniform2f(U.res, this.canvas.width, this.canvas.height);
    gl.uniform1f(U.dpr, this.dpr); gl.uniform1f(U.time, (now - this.t0) / 1000); gl.uniform1f(U.k, this.crt);
    gl.uniform1f(U.flick, this.flick); gl.uniform1f(U.roll, this.roll); gl.uniform1f(U.glitch, this.glitch); gl.uniform1f(U.power, this.power);
    gl.uniform3fv(U.tint, P.phosphor); gl.uniform3fv(U.alertTint, P.alert); gl.uniform3fv(U.accentTint, P.accent);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
