import { $, CFG, ZOOMS, clamp, glCanvas } from './core';
import { AU, DPR, PITCH, PPU, S, camT, camYaw, camYawTo, findPath, groundAt, resize, setCamYawTo, setSound, sfx, toScreen } from './engine';
import { agents, fireMode, hackOn, lastKey, lastKeyT, moveMarks, selected, setLastKey, setLastKeyT, setSelected, state } from './setup';
import { orderJack, startHack } from './sim';
import { cmdAttack, cmdMedikit, cmdMove, cmdReload, freeAgent, pickEntity, pickPickup, selAlive, setHack, setSlot, toggleCar, towerUnder, tryAbort } from './commands';
import { hudSquad, toggleLab } from './hud';
import { paused, setPause } from './tactical';

/* ================================================================ input */
export let ptr = null, hover = null, mouse = [0, 0], keys = new Set<any>(), holdFire = false, lastClick = { t: 0, x: 0, y: 0 };
export function setHover(v: typeof hover) { return hover = v; }
export function setHoldFire(v: typeof holdFire) { return holdFire = v; }
const isTouch = (e) => e.pointerType === 'touch';
glCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
glCanvas.addEventListener('pointerdown', (e) => {
  if (state !== 'play' && state !== 'won' && state !== 'lost') return;
  glCanvas.setPointerCapture(e.pointerId);
  const x = e.offsetX * DPR, y = e.offsetY * DPR;
  ptr = { id: e.pointerId, b: e.button, x0: x, y0: y, x, y, drag: false, touch: isTouch(e), cam0: camT.clone() };
  mouse = [x, y];
  if (e.button === 2 && state === 'play' && !hackOn) {
    const ent = pickEntity(x, y, 14);
    if (ent && ent.kind !== 'agent') { cmdAttack(x, y); ptr.done = true; }
    else { holdFire = true; ptr.done = true; }
  }
});
glCanvas.addEventListener('pointermove', (e) => {
  const x = e.offsetX * DPR, y = e.offsetY * DPR; mouse = [x, y];
  if (!ptr || ptr.id !== e.pointerId) return;
  ptr.x = x; ptr.y = y;
  if (Math.hypot(x - ptr.x0, y - ptr.y0) > 8 * DPR) ptr.drag = true;
  if (ptr.drag && (ptr.touch || ptr.b === 1)) {
    const k = 1 / (S * PPU), dx = (x - ptr.x0) * k, dy = (y - ptr.y0) * k / Math.sin(PITCH);
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    camT.x = ptr.cam0.x - rx * dx + fx * dy; camT.z = ptr.cam0.z - rz * dx + fz * dy;
  }
});
glCanvas.addEventListener('pointerup', (e) => {
  if (!ptr || ptr.id !== e.pointerId) return;
  const p = ptr; ptr = null;
  if (p.b === 2) holdFire = false;
  if (state !== 'play' || p.done) return;
  if (p.drag) {
    if (!p.touch && p.b === 0 && !hackOn) {
      const x0 = Math.min(p.x0, p.x), x1 = Math.max(p.x0, p.x), y0 = Math.min(p.y0, p.y), y1 = Math.max(p.y0, p.y); const s = [0, 0, 0];
      const inBox = agents.filter((a) => { if (a.dead) return false; toScreen(a.inCar ? a.inCar.x : a.x, 1, a.inCar ? a.inCar.z : a.z, s); return s[0] >= x0 && s[0] <= x1 && s[1] >= y0 && s[1] <= y1; });
      if (inBox.length) { if (!e.shiftKey) selected.clear(); inBox.forEach((a) => selected.add(a)); hudSquad(); }
    }
    return;
  }
  if (hackOn) {
    if (p.b === 2) { setHack(false); return; }
    if (hover) { if (hover.uplink) orderJack(hover.uplink); else startHack(hover); }
    return;
  }
  if (p.b === 2 || (p.touch && fireMode)) { cmdAttack(p.x, p.y); return; }
  if (p.b !== 0) return;
  const e2 = pickEntity(p.x, p.y, 20);
  if (e2 && e2.kind === 'agent' && !e2.dead) { if (!e.shiftKey) selected.clear(); selected.add(e2); sfx('ui', null, null, 0.4, 1.2); hudSquad(); return; }
  const it = pickPickup(p.x, p.y, 14);
  if (it) {
    const sel = selAlive().filter((a) => !a.inCar);
    if (sel.length) {
      sel.sort((a, b) => Math.hypot(a.x - it.x, a.z - it.z) - Math.hypot(b.x - it.x, b.z - it.z));
      const a = sel[0]; freeAgent(a); a.path = findPath(a.x, a.z, it.x, it.z); a.pickTarget = it; a.ftarget = null; a.fpoint = null;
      moveMarks.push({ x: it.x, z: it.z, t: 0.7, c: 'p' }); sfx('ack', null, null, 1); return;
    }
  }
  const now = performance.now(), dbl = now - lastClick.t < 330 && Math.hypot(p.x - lastClick.x, p.y - lastClick.y) < 16 * DPR;
  lastClick = dbl ? { t: 0, x: 0, y: 0 } : { t: now, x: p.x, y: p.y };
  const tw = towerUnder(p.x, p.y), g = tw ? [tw.x, tw.z] : groundAt(p.x, p.y); cmdMove(g[0], g[1], dbl);
});
glCanvas.addEventListener('pointercancel', () => { ptr = null; holdFire = false; });
window.addEventListener('blur', () => { holdFire = false; keys.clear(); });
glCanvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
export function zoom(d) { CFG.zoom = clamp(CFG.zoom + d, 0, ZOOMS.length - 1); $('#lZoom').value = CFG.zoom; resize(); }
export function selectAgent(i, add) {
  const a = agents[i]; if (!a || a.dead) return;
  const now = performance.now();
  if (lastKey === 'a' + i && now - lastKeyT < 400) centerOn([a]);
  setLastKey('a' + i); setLastKeyT(now);
  if (!add) selected.clear(); selected.add(a); hudSquad();
}
export function selectAll() {
  const now = performance.now();
  if (lastKey === 'all' && now - lastKeyT < 400) centerOn(agents.filter((a) => !a.dead));
  setLastKey('all'); setLastKeyT(now);
  setSelected(new Set(agents.filter((a) => !a.dead))); hudSquad();
}
function centerOn(list) { if (!list.length) return; let x = 0, z = 0; for (const a of list) { x += a.inCar ? a.inCar.x : a.x; z += a.inCar ? a.inCar.z : a.z; } camT.x = x / list.length; camT.z = z / list.length; }
window.addEventListener('keydown', (e) => {
  if (e.target && ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT')) return;
  const k = e.key.toLowerCase();
  if (k === 'm') { setSound(!AU.on); return; }
  if (k === 'p') { toggleLab(); return; }
  if (state !== 'play') return;
  keys.add(k);
  if (k >= '1' && k <= '4') selectAgent(+k - 1, e.shiftKey);
  else if (k === ' ') { e.preventDefault(); setPause(!paused); }
  else if (k === '0' || k === '`') selectAll();
  else if (k === 'z') setSlot(0); else if (k === 'x') setSlot(1);
  else if (k === 'r') cmdReload(); else if (k === 'g') cmdMedikit();
  else if (k === 'h') setHack(!hackOn);
  else if (k === 'f') toggleCar();
  else if (k === 'q') { setCamYawTo(camYawTo + (Math.PI / 2)); } else if (k === 'e') { setCamYawTo(camYawTo - (Math.PI / 2)); }
  else if (k === 'escape') { if (hackOn) setHack(false); else tryAbort(); }
  else if (k === '+' || k === '=') zoom(1); else if (k === '-') zoom(-1);
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
