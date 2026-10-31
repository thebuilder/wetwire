/* ================================================================ mission flow */
function updateMission(dt) {
  missionT += dt;
  const alive = agents.filter((a) => !a.dead);
  if (!alive.length) { endMission('dead'); return; }
  const k = MS.objs[0];
  if (k.st !== 'open') {
    let at;
    if (WORLD.kind === 'city') { const [px, pz] = WORLD.padC; at = alive.every((a) => !a.inCar && Math.abs(a.x - px) < 5.5 && Math.abs(a.z - pz) < 5.5);
      if (at && MS.def.id === 'halden' && k.st === 'done' && !(target && !target.dead && target.fac === 'follower' && Math.abs(target.x - px) < 6.5 && Math.abs(target.z - pz) < 6.5)) at = false; }
    else { const v = MS.van; at = alive.every((a) => a.inCar === v || (!a.inCar && Math.hypot(a.x - v.x, a.z - v.z) < 6.5)); }
    if (at) { setObj('out', k.st === 'done' ? 'done' : 'fail'); endMission(k.st === 'done' ? 'win' : 'fail'); return; }
  }
  // locator: the target (then the extraction point) pulses on the scanner, faster as the squad closes in
  const lp = locatorPos();
  if (lp) {
    MS.pingT = (MS.pingT == null ? 0.6 : MS.pingT) - dt;
    if (MS.pingT <= 0) { const sc = squadCenter(), d = Math.hypot(lp.p[0] - sc[0], lp.p[1] - sc[1]); MS.pingT = clamp(1.1 + d / 32, 1.1, 4.5); MS.pingAt = time; }
  }
  const combat = time - lastCombat < 8;
  playMusic(combat ? 'danger' : 'infiltration', combat ? 0.4 : 2.5);
}
function endMission(res) {
  if (state !== 'play') return;
  setPause(false); $('#tip').hidden = true;
  state = res === 'win' ? 'won' : 'lost';
  setHack(false); holdFire = false;
  playMusic(res === 'win' ? 'complete' : 'failed', 0.3);
 
  const L = settle(res);
  setTimeout(() => showEnd(res, L), res === 'win' ? 1400 : res === 'abort' ? 400 : 2200);
}
const fmt = (n) => Math.round(n).toLocaleString('en-US');
function freeName() { return NAMES.find((n) => !SAVE.agents.some((r) => r.name === n)) || 'AGENT ' + (SAVE.agents.length + 1); }
function settle(res) {
  const def = MS.def, rows = [];
  let total = 0;
  const add = (t, v) => { rows.push([t, v]); total += v; };
  if (res === 'win') {
    const repeat = !!SAVE.done[def.id];
    add(repeat ? 'Contract fee (repeat, half rate)' : 'Contract fee', Math.round(def.reward * (repeat ? 0.5 : 1)));
    if (WORLD.kind === 'compound' && MS.alarm < 2) add('Silent bonus // no alarm', 2500);
    if (WORLD.kind === 'city' && LEVEL.police !== false && heatPeak < 20) add('Low profile bonus // police never alerted', 3000);
    if (WORLD.kind === 'city' && LEVEL.police === false && stats.civ === 0) add('Clean job // no civilian casualties', 2500);
  }
  if (stats.civ > 0) add('Civilian casualties x' + stats.civ + ' // cleanup', -150 * stats.civ);
  if (stats.cops > 0) add('Officers down x' + stats.cops + ' // settlements', -400 * stats.cops);
  const lost = [];
  for (const a of agents) {
    const r = a.rec;
    if (a.dead) { r.alive = false; r.deploy = false; lost.push(r.name); continue; }
    r.slots = a.slots.slice();
    const am = {}; for (const id of r.slots) if (id && a.ammo[id]) { const w = WEAPONS[id], mx = w.mag * (w.mags || 1); am[id] = { mag: Math.min(a.ammo[id].mag, w.mag), res: Math.max(0, Math.min(a.ammo[id].res, mx - Math.min(a.ammo[id].mag, w.mag))) }; } r.ammo = am;
    r.charges = a.charges; r.kills += a.kills || 0; r.missions++;
    if (r.gear === 'medikit' && a.gearUsed) r.gear = null;
  }
  if (res === 'win') SAVE.done[def.id] = true;
  if (res === 'win' && def.unlock && !SAVE.avail.includes(def.unlock)) { SAVE.avail.push(def.unlock); MS.captured.push(def.unlock); }
  settleTerritory(res, add, rows);
  const R0 = SAVE.res || (SAVE.res = { done: {}, active: null, left: 0 });
  if (R0.active && res !== 'abort') {
    R0.left--;
    if (R0.left <= 0) { const x = RESEARCH.find((y) => y.id === R0.active); R0.done[x.id] = true; R0.active = null; if (x.unlock && !SAVE.avail.includes(x.unlock)) SAVE.avail.push(x.unlock); rows.push(['Research complete // ' + x.name, 0]); MS.researched = x.name; }
  }
  SAVE.cash = Math.max(0, SAVE.cash + total);
  if (!SAVE.agents.some((r) => r.alive)) { SAVE.agents.push(mkRec(freeName(), R() < 0.5 ? 'm' : 'f')); rows.push(['Company replacement // one agent, pistol', 0]); }
  store();
  return { rows, total, lost, captured: MS.captured.slice() };
}
function showEnd(res, L) {
  $('#hud').hidden = true;
  const t = Math.floor(missionT);
  const rows = [['Time', Math.floor(t / 60) + 'm ' + (t % 60) + 's'], ['Agents lost', L.lost.length + ' / ' + agents.length], ['Hostiles down', stats.hostiles], ['Civilian casualties', stats.civ]];
  if (WORLD.kind === 'city') rows.push(['Officers down', stats.cops], ['Peak heat', Math.round(heatPeak)]);
  else rows.push(['Alarm raised', MS.alarm >= 2 ? 'YES' : 'NO'], ['Reinforcements', MS.reinfSent ? 'YES' : 'NO']);
  rows.push(['Minds jacked', stats.jacked], ['Network hacks', stats.hacks], ['Shots fired', stats.shots]);
  const bits = [];
  if (res === 'win' && MS.def.win) bits.push(MS.def.win);
  else if (res === 'win') bits.push({ compound: 'Rusk is dead and the north road is quiet.', courier: 'The case is ours. Meridian\'s limo specs show a military-grade exploit in their armour systems.', halden: 'Dr. Halden is in a Kessel lab. Her optics work is already on the bench.', varga: 'Varga is gone. Meridian will need a new executive.' }[MS.def.id]);
  if (res === 'fail' && MS.def.fail) bits.push(MS.def.fail);
  else if (res === 'fail') bits.push(MS.def.id === 'halden' ? 'Dr. Halden did not make it. No fee.' : MS.def.id === 'courier' ? 'The data reached Meridian. No fee, but the squad came home.' : 'The target got away. No fee, but the squad came home.');
  if (res === 'abort') bits.push('Recalled before the job was done. Ammunition spent stays spent.');
  if (res === 'dead') bits.push('Every agent flatlined. Their gear is gone with them.');
  if (L.lost.length && res !== 'dead') bits.push('Lost: ' + L.lost.join(', ') + '. Their weapons and mods are gone.');
  if (MS.researched) bits.push('<span class="capt">Research complete: ' + MS.researched + '.</span>');
  if (L.captured.length) bits.push('<span class="capt">Captured tech, now in the armoury: ' + L.captured.map((id) => WEAPONS[id].name).join(', ') + '.</span>');
  if (res === 'win' && MS.def.id === 'compound') bits.push('<span class="capt">Unlocked: version 2 cyborg mods and the MK2 deck.</span>');
  DEBRIEF = { res, title: { win: 'Contract complete', fail: 'Target escaped', dead: 'Squad flatlined', abort: 'Contract aborted' }[res], sub: 'Contract ' + MS.def.code + ' // ' + MS.def.region,
    rows, ledger: L.rows.length ? L.rows : [['No fee', 0]], total: L.total, text: bits.join(' ') };
  if (res === 'win' && planDef === MS.def) planDef = null;
  setupAttract();
  tStatus(res === 'win' ? 'TEAM RECOVERED // FEE PAID' : 'TEAM RECOVERED', res === 'win' ? '' : 'warn');
  showTerminal('debrief');
}

/* ================================================================ attract mode (behind the menus) */
function setupAttract() {
  MS = { def: null, objs: [{ id: 'kill', st: 'open' }], captured: [], ledger: [], alarm: 0 };
  clearMission(); agents = []; target = null;
  loadWorld('downtown', 'smog');
  for (let i = 0; i < 130; i++) spawnCiv();
  const carNodes = RN.nodes.map((n, i) => i).filter((i) => RN.nodes[i].adj.length && inPlay(RN.nodes[i].x, RN.nodes[i].z, -20));
  for (let i = 0; i < 20; i++) { const c = mkCar(R() < 0.18 ? 'van' : 'sedan', Rpick(carNodes)); c.x = lerp(c.x, c.tx, R()); c.z = lerp(c.z, c.tz, R()); }
  spawnFlyers(16);
  camT.set(GW * 0.45, 0, GW * 0.55);
  state = 'menu';
}

/* ================================================================ commands */
function selAlive() { return [...selected].filter((a) => !a.dead); }
function freeAgent(a) { if (a.link) dropLink(a.link, false); a.jackTo = null; a.pickTarget = null; }
/* a watchtower drawn under the cursor: test the cursor ray at platform, mid and leg height */
function towerUnder(px, py) {
  for (const t of WORLD.towers) for (const y of [t.y + 1.2, t.y * 0.66, t.y * 0.33]) { const g = groundAt(px, py, y); if (Math.abs(g[0] - t.x) < t.half + 0.3 && Math.abs(g[1] - t.z) < t.half + 0.3) return t; }
  return null;
}
function cmdMove(x, z, run) {
  const sel = selAlive(); if (!sel.length) return;
  const car = sel.find((a) => a.inCar)?.inCar;
  if (car) { const pt = driveTo(car, x, z); car.cruise = run ? 17 : car.model === 'police' ? 14 : car.model === 'truck' ? 10 : 12; moveMarks.push({ x: pt[0], z: pt[1], t: 0.7, c: 'p' }); sfx('ack', null, null, 1, run ? 1.25 : 1); return; }
  const offs = [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]];
  // a click on a cleared watchtower sends the squad up its ladder (it takes two)
  const tw = WORLD.towers.find((t) => Math.abs(x - t.x) < t.half + 0.6 && Math.abs(z - t.z) < t.half + 0.6);
  const twFree = tw && !people.some((p) => p.tower === tw && !p.dead);
  if (tw && !twFree) say('THE TOWER IS STILL MANNED', 'warn');
  let up = 0;
  sel.forEach((a, i) => {
    freeAgent(a);
    const o = sel.length > 1 ? offs[i % 4] : [0, 0];
    const t = cellOk(x + o[0], z + o[1]) ? [x + o[0], z + o[1]] : [x, z];
    const climb = twFree && up < 2 && a.onTower !== tw ? tw : null; if (climb || a.onTower === tw) up++;
    a.ftarget = null; a.fpoint = null; a.auto = null; a.run = !!run;
    if (a.onTower === tw && tw) return;
    if (a.onTower || a.climb) {   // come down first, then go
      const from = a.onTower || a.climb.t, k = a.climb ? a.climb.k : 1;
      a.climb = { t: from, k, dir: -1, then: [t[0], t[1], !!run, climb] }; a.onTower = null; a.climbTo = null; a.path = null; return;
    }
    a.climbTo = climb;
    a.path = climb ? findPath(a.x, a.z, climb.ladder[0], climb.ladder[1]) : findPath(a.x, a.z, t[0], t[1]);
  });
  moveMarks.push({ x, z, t: 0.7, c: 'p' });
  sfx('ack', null, null, 1, run ? 1.25 : 1);
}
function pickEntity(px, py, rad) {
  let best = null, bd = rad * DPR; const s = [0, 0, 0];
  for (const p of people) {
    if (p.dead || p.inCar) continue;
    toScreen(p.x, (p.elev || groundY(p.x, p.z)) + 1, p.z, s); const d = Math.hypot(s[0] - px, s[1] - py); if (d < bd) { bd = d; best = p; }
  }
  for (const c of cars) { if (c.wreck || c.gone) continue; toScreen(c.x, 0.8, c.z, s); const d = Math.hypot(s[0] - px, s[1] - py) - 6 * DPR; if (d < bd) { bd = d; best = c; } }
  for (const t of turrets) { if (t.dead) continue; toScreen(t.x, 1.2, t.z, s); const d = Math.hypot(s[0] - px, s[1] - py); if (d < bd) { bd = d; best = t; } }
  for (const b of barrels) { if (b.dead) continue; toScreen(b.x, b.big ? 3.5 : 0.6, b.z, s); const d = Math.hypot(s[0] - px, s[1] - py) - (b.big ? 10 : 2) * DPR; if (d < bd) { bd = d; best = b; } }
  return best;
}
function pickPickup(px, py, rad) {
  let best = null, bd = rad * DPR; const s = [0, 0, 0];
  for (const it of pickups) { toScreen(it.x, groundY(it.x, it.z) + 0.3, it.z, s); const d = Math.hypot(s[0] - px, s[1] - py); if (d < bd) { bd = d; best = it; } }
  return best;
}
const isJack = (a) => { const w = agentWeapon(a); return !!w && w.kind === 'jack'; };
/* where a fire order under the cursor really points: snap to whoever is under it (height aware, so a guard
   up a tower counts), then raised platforms, then the ground */
let aimLock = null;
function aimAt(px, py) {
  const e = pickEntity(px, py, 16);
  if (e && e.kind !== 'agent' && e.fac !== 'follower') { aimLock = e; return [e.x, e.z]; }
  aimLock = null;
  for (const t of WORLD.towers) { const g = groundAt(px, py, t.y + 1); if (Math.abs(g[0] - t.x) < t.half && Math.abs(g[1] - t.z) < t.half) return g; }
  return groundAt(px, py);
}
function cmdAttack(px, py) {
  const sel = selAlive().filter((a) => !a.inCar && !a.link && !a.jackTo); if (!sel.length) return;
  const e = pickEntity(px, py, 22);
  if (e && e.kind !== 'agent' && !(e.fac === 'follower' && sel.every(isJack))) {
    for (const a of sel) { if (isJack(a) && !e.kind) continue; a.ftarget = e; a.fpoint = null; a.path = null; a.jackT = 0; a.pickTarget = null; }
    moveMarks.push({ ent: e, t: 0.7, c: 's' });
  } else {
    const g = aimAt(px, py);
    for (const a of sel) { if (isJack(a)) continue; a.fpoint = g; a.fpointT = time + 0.9; a.ftarget = null; a.path = null; }
    moveMarks.push({ x: g[0], z: g[1], t: 0.6, c: 's' });
  }
}
function setSlot(i) {
  const sel = selAlive(); if (!sel.length) return;
  let any = false;
  for (const a of sel) { if (!a.slots[i] || a.cur === i) continue; a.cur = i; a.ftarget = null; a.fpoint = null; a.jackT = 0; a.reloadT = 0; any = true; }
  if (any) sfx('ui', null, null, 0.4, 1.3);
  hudSquad();
}
function cmdReload() { for (const a of selAlive()) startReload(a); hudSquad(); }
function cmdMedikit() {
  let used = false;
  for (const a of selAlive()) {
    if (a.gear !== 'medikit' || a.gearUsed || a.hp >= a.maxHp) continue;
    a.gearUsed = true; a.healT = 2; used = true; say(a.name + ' USED A MEDIKIT', '');
    for (let i = 0; i < 10; i++) spawnP(a.x, 1.2, a.z, Rr(-1, 1), Rr(0.5, 2), Rr(-1, 1), [0.5, 2.2, 1.8], 0.1, 0.6);
  }
  if (used) sfx('ui', null, null, 0.6, 0.8);
  else say('NO MEDIKIT TO USE // OR ALREADY HEALTHY', 'warn');
  hudSquad();
}
function toggleCar() {
  const sel = selAlive(); if (!sel.length) return;
  const inside = sel.filter((a) => a.inCar);
  if (inside.length) {
    const c = inside[0].inCar;
    c.occ.forEach((a, i) => { const sp = nearestOpen(c.x + Math.cos(c.yaw) * 1.8 * (i % 2 ? 1 : -1), c.z - Math.sin(c.yaw) * 1.8 * (i % 2 ? 1 : -1), 4) || [c.x, c.z]; a.inCar = null; a.x = sp[0]; a.z = sp[1]; a.path = null; });
    c.occ = []; c.driver = 'none'; c.parked = true; c.route = null;
    say('SQUAD ON FOOT', ''); sfx('door', c.x, c.z, 0.7); hudSquad(); return;
  }
  const [cx, cz] = squadCenter();
  let best = null, bd = 9;
  for (const c of cars) {
    if (c.wreck || c.gone || c === target || c.driver === 'script' || c.driver === 'target') continue;
    if (c.occ && c.occ.some((p) => p.kind !== 'agent')) continue;
    const d = Math.hypot(c.x - cx, c.z - cz); if (d < bd) { bd = d; best = c; }
  }
  if (!best) { say('NO VEHICLE IN REACH // GET WITHIN 9M', 'warn'); return; }
  const riders = sel.filter((a) => !a.link && Math.hypot(a.x - best.x, a.z - best.z) < 10);
  if (!riders.length) { say('NO VEHICLE IN REACH // GET WITHIN 9M', 'warn'); return; }
  if (best.driver === 'civ' && WORLD.kind === 'city') { const sp = nearestOpen(best.x + 2, best.z, 4) || [best.x, best.z]; const v = spawnCiv(); v.x = sp[0]; v.z = sp[1]; v.state = 'flee'; v.fx = best.x; v.fz = best.z; v.t = 8; }
  if (best.driver === 'police') addHeat(6);
  best.node = nearestNode(best.x, best.z); best.next = null; best.driver = 'player'; best.occ = riders; best.parked = false; best.route = []; best.idle = true;
  best.cruise = best.model === 'police' ? 14 : 12; best.speed = 0; best.roam = false;
  for (const a of riders) { freeAgent(a); a.inCar = best; a.path = null; a.ftarget = null; }
  say((best === MS.van ? 'SQUAD IN THE VAN' : 'VEHICLE TAKEN') + ' // CLICK TO DRIVE, F TO LEAVE', ''); sfx('door', best.x, best.z, 0.8); hudSquad();
}
function setHack(on) {
  if (on === hackOn) return;
  hackOn = on; $('#banner').hidden = !on; $('#bHack').classList.toggle('on', on); hover = null;
  if (on && state === 'play' && !agents.some((a) => !a.dead && deckOf(a))) say('NO DECK IN THE SQUAD // VIEW ONLY', 'warn');
  sfx('zap', null, null, 0.6, on ? 1 : 0.7);
}
function tryAbort() {
  if (state !== 'play') return;
  const now = performance.now();
  if (now - abortT < 2500) { abortT = 0; endMission('abort'); }
  else { abortT = now; say('PRESS ESC AGAIN TO ABORT // NO FEE', 'warn'); }
}

/* ================================================================ input */
let ptr = null, hover = null, mouse = [0, 0], keys = new Set(), holdFire = false, lastClick = { t: 0, x: 0, y: 0 };
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
function zoom(d) { CFG.zoom = clamp(CFG.zoom + d, 0, ZOOMS.length - 1); $('#lZoom').value = CFG.zoom; resize(); }
function selectAgent(i, add) {
  const a = agents[i]; if (!a || a.dead) return;
  const now = performance.now();
  if (lastKey === 'a' + i && now - lastKeyT < 400) centerOn([a]);
  lastKey = 'a' + i; lastKeyT = now;
  if (!add) selected.clear(); selected.add(a); hudSquad();
}
function selectAll() {
  const now = performance.now();
  if (lastKey === 'all' && now - lastKeyT < 400) centerOn(agents.filter((a) => !a.dead));
  lastKey = 'all'; lastKeyT = now;
  selected = new Set(agents.filter((a) => !a.dead)); hudSquad();
}
function centerOn(list) { if (!list.length) return; let x = 0, z = 0; for (const a of list) { x += a.inCar ? a.inCar.x : a.x; z += a.inCar ? a.inCar.z : a.z; } camT.x = x / list.length; camT.z = z / list.length; }
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
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
  else if (k === 'q') { camYawTo += Math.PI / 2; } else if (k === 'e') { camYawTo -= Math.PI / 2; }
  else if (k === 'escape') { if (hackOn) setHack(false); else tryAbort(); }
  else if (k === '+' || k === '=') zoom(1); else if (k === '-') zoom(-1);
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

/* ================================================================ HUD */
function buildSquadRows() {
  const box = $('#squad'); box.innerHTML = '';
  agents.forEach((a, i) => {
    const b = document.createElement('button'); b.className = 'agent'; b.dataset.i = i;
    b.innerHTML = '<span class="k">' + (i + 1) + '</span><span class="nm">' + a.name + '<small></small></span><span class="hpbar"><i></i></span>';
    b.addEventListener('click', (e) => selectAgent(i, e.shiftKey));
    box.appendChild(b);
  });
  hudSquad();
}
function wepText(a, i) {
  const id = a.slots[i == null ? a.cur : i]; if (!id) return 'EMPTY';
  const w = WEAPONS[id];
  if (w.energy != null) return w.name + ' ' + Math.floor(a.cell) + '%';
  const am = a.ammo[id] || { mag: 0, res: 0 };
  return w.name + ' ' + am.mag + '/' + am.res;
}
function agentStatus(a) {
  if (a.dead) return 'FLATLINED';
  if (a.inCar) return 'IN VEHICLE';
  if (a.link) return 'UPLINK // ' + a.link.label;
  if (a.jackTo) return a.linkT > 0 ? 'CONNECTING ' + Math.round(a.linkT / 3 * 100) + '%' : 'TO ' + a.jackTo.label;
  if (a.crash > 0) return 'NEURAL CRASH';
  if (a.reloadT > 0) return 'RELOADING';
  return wepText(a);
}
function hudSquad() {
  const rows = $('#squad').children;
  agents.forEach((a, i) => {
    const r = rows[i]; if (!r) return;
    r.classList.toggle('sel', selected.has(a) && !a.dead); r.classList.toggle('dead', a.dead); r.classList.toggle('hit', !a.dead && time - a.lastHit < 0.5);
    r.querySelector('i').style.width = 'calc(' + (a.hp / a.maxHp * 100).toFixed(1) + '% - 2px)';
    r.querySelector('small').textContent = agentStatus(a);
  });
  const sel = selAlive(), lead = sel[0];
  for (const i of [0, 1]) {
    const b = $(i ? '#ws2' : '#ws1');
    b.querySelector('span').textContent = lead ? (lead.slots[i] ? WEAPONS[lead.slots[i]].name : 'EMPTY') : 'SLOT ' + (i + 1);
    b.classList.toggle('on', !!lead && lead.cur === i && !!lead.slots[i]);
    b.disabled = !lead || !lead.slots[i];
  }
  const med = sel.some((a) => a.gear === 'medikit' && !a.gearUsed);
  $('#wMed').disabled = !med; $('#wMed').style.opacity = med ? '' : '0.4';
  $('#cryo').textContent = 'CRYO LINK ' + agents.filter((a) => !a.dead).length + '/' + agents.length;
}
const LVN = { civil: 'CIVIL', sec: 'SECURE', mil: 'MILITARY' };
function effectTxt(n) {
  if (n.fx) return n.fx;
  return { grid: 'BLACKOUT 25S', board: 'STROBE, STUNS CROWD', cam: 'LOOP FEED 45S', turret: 'REWRITE IFF 30S', car: 'OVERLOAD CORE', police: 'KILL ENGINE 25S', stall: 'KILL ENGINE 25S',
    gate: n.ref && (n.ref.lockT > 0 ? n.ref.lockState === 1 : n.ref.open > 0.5) ? 'LOCK SHUT 45S' : 'FORCE OPEN 45S', search: 'LIGHT OFF 40S', gen: 'COMPOUND BLACKOUT 35S', radio: 'JAM RADIO 45S', vtol: 'GROUND IT 25S', limo: 'ARMOUR DOWN 20S' }[n.type] || '';
}
function deckAgent() {
  const live = agents.filter((a) => !a.dead && deckOf(a));
  return live.find((a) => a.link) || live.find((a) => selected.has(a)) || live[0] || null;
}
function hudTick() {
  if (!MS || !MS.def) return;
  hudSquad();
  const tn = $('#tierName');
  if (WORLD.kind === 'city' && LEVEL.police === false) {
    let sus = 0, al = 0; for (const p of people) if (!p.dead && p.fac === 'corp') { if (p.alerted) al++; else sus = Math.max(sus, p.sus); }
    const tier = al > 3 ? 3 : al ? 2 : sus > 0.2 ? 1 : 0;
    $('#heatBar').style.width = 'calc(' + (al ? Math.min(100, 55 + al * 8) : sus * 45).toFixed(1) + '% - 2px)';
    tn.textContent = ['QUIET', 'SUSPICIOUS', 'CONTACT', 'ALL OUT'][tier]; tn.className = 't' + tier;
  } else if (WORLD.kind === 'city') {
    const tier = heat < 20 ? 0 : heat < 50 ? 1 : heat < 85 ? 2 : 3;
    $('#heatBar').style.width = 'calc(' + heat.toFixed(1) + '% - 2px)';
    tn.textContent = ['CALM', 'POLICE ALERT', 'LOCKDOWN', 'PURGE'][tier]; tn.className = 't' + tier;
  } else {
    let sus = 0; for (const p of people) if (!p.dead && p.fac === 'corp' && !p.alerted) sus = Math.max(sus, p.sus);
    const v = MS.alarm >= 2 ? 100 : MS.alarm >= 1 ? 70 : sus * 45;
    $('#heatBar').style.width = 'calc(' + v.toFixed(1) + '% - 2px)';
    const tier = MS.alarm >= 2 ? 3 : MS.alarm >= 1 ? 2 : sus > 0.2 ? 1 : 0;
    let txt = ['QUIET', 'SUSPICIOUS', 'CONTACT', 'ALARM'][tier];
    if (MS.radioJam > 0) txt += ' // JAMMED';
    else if (MS.reinfT > 0) txt += ' // TRUCK ' + Math.ceil(MS.reinfT) + 'S';
    tn.textContent = txt; tn.className = 't' + tier;
  }
  const da = deckAgent();
  $('#deckM').hidden = !da;
  if (da) {
    const max = GEAR[da.gear].charges;
    let h = ''; for (let i = 0; i < max; i++) h += '<i class="' + (i < da.charges ? 'on' : '') + '"></i>';
    if ($('#deckPips').innerHTML !== h) $('#deckPips').innerHTML = h;
    const u = da.link || da.jackTo; const tr = u ? u.trace : 0;
    $('#traceNum').textContent = u ? Math.round(tr) + '%' : '--'; $('#traceBar').style.width = 'calc(' + clamp(tr, 0, 100).toFixed(1) + '% - 2px)';
  }
  const m = Math.floor(missionT / 60), s = Math.floor(missionT % 60); $('#clock').textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  const sc = squadCenter(), k = MS.objs[0];
  const od1 = $('#od-kill'), od2 = $('#od-out');
  const tp = targetPos();
  if (od1) od1.textContent = k.st === 'open' && tp ? Math.round(Math.hypot(tp[0] - sc[0], tp[1] - sc[1])) + 'M' : '';
  const ex = extractPos();
  if (od2) od2.textContent = k.st !== 'open' ? Math.round(Math.hypot(ex[0] - sc[0], ex[1] - sc[1])) + 'M' : '';
  let hint = '';
  if (hackOn) {
    if (hover && hover.uplink) { const u = hover.uplink; hint = u.label + ' // ' + (u.burn > 0 ? 'BURNED ' + Math.ceil(u.burn) + 'S' : u.agent ? 'CONNECTED // ' + u.agent.name : 'CLICK TO SEND A DECK CARRIER') + ' // RANGE ' + u.r + 'M'; }
    else if (hover) { const L = HLEVEL[hover.level]; hint = hover.label + ' // ' + LVN[hover.level] + ' // ' + L.cost + ' CHARGE' + (L.cost > 1 ? 'S' : '') + ' // ' + effectTxt(hover) + ((hover.cd || 0) > 0 ? ' // COMPROMISED ' + Math.ceil(hover.cd) + 'S' : !connectedUplinkFor(hover) ? ' // OUT OF RANGE' : ''); }
    else if (hackJob) hint = 'HACKING ' + hackJob.n.label + ' ' + Math.round(hackJob.t / hackJob.dur * 100) + '% // TRACE ' + Math.round(hackJob.u.trace) + '%';
  } else if (performance.now() - abortT < 2500) hint = 'PRESS ESC AGAIN TO ABORT THE CONTRACT';
  else if (fireMode) hint = 'FIRE MODE // TAP A TARGET';
  else if (WORLD.towers.length && state === 'play') {
    const t = towerUnder(mouse[0], mouse[1]);
    if (t) hint = agents.some((a) => a.onTower === t) ? 'WATCHTOWER // CLICK ELSEWHERE TO CLIMB DOWN' : people.some((p) => p.tower === t && !p.dead) ? 'WATCHTOWER // STILL MANNED' : 'WATCHTOWER // CLICK TO CLIMB, ROOM FOR TWO // RANGE UP';
  }
  $('#hint').textContent = hint; $('#hint').hidden = !hint;
  $('#bFire').classList.toggle('on', fireMode);
}
function targetPos() {
  if (MS.def && MS.def.id === 'courier') {
    const cs = pickups.find((p) => p.id === 'case'); if (cs) return [cs.x, cs.z];
    if (MS.courierOut && !MS.courierOut.dead) return [MS.courierOut.x, MS.courierOut.z];
  }
  if (MS.vargaP && !MS.vargaP.inCar && !MS.vargaP.dead) return [MS.vargaP.x, MS.vargaP.z];
  if (!target) return null;
  if (target.inCar) return [target.inCar.x, target.inCar.z];
  return [target.x, target.z];
}
function locatorPos() {
  if (!MS.def || !MS.objs[0]) return null;
  const k = MS.objs[0];
  if (k.st === 'open') { const tp = targetPos(); return tp ? { p: tp, col: [255, 91, 130] } : null; }
  const ex = extractPos(); return ex ? { p: ex, col: k.st === 'done' ? [180, 240, 106] : [255, 196, 107] } : null;
}
function extractPos() { return WORLD.kind === 'city' ? WORLD.padC : MS.van ? [MS.van.x, MS.van.z] : WORLD.van; }
$('#ws1').addEventListener('click', () => setSlot(0));
$('#ws2').addEventListener('click', () => setSlot(1));
$('#wRel').addEventListener('click', cmdReload);
$('#wMed').addEventListener('click', cmdMedikit);
document.querySelectorAll('.dose').forEach((el) => {
  const set = (e) => { const r = el.getBoundingClientRect(); const v = clamp(1 - (e.clientY - r.top) / r.height, 0, 1); for (const a of selAlive()) { if (a.crash > 0) continue; a.dose[el.dataset.d] = Math.round(v * 20) / 20; } hudSquad(); };
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); set(e); el.onpointermove = set; });
  el.addEventListener('pointerup', () => { el.onpointermove = null; });
  el.addEventListener('keydown', (e) => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault(); e.stopPropagation(); for (const a of selAlive()) { if (a.crash > 0) continue; a.dose[el.dataset.d] = clamp(a.dose[el.dataset.d] + (e.key === 'ArrowUp' ? 0.1 : -0.1), 0, 1); } hudSquad(); });
});
$('#bHack').addEventListener('click', () => setHack(!hackOn));
$('#bCar').addEventListener('click', toggleCar);
$('#bSnd').addEventListener('click', () => setSound(!AU.on));
$('#bAbort').addEventListener('click', tryAbort);
$('#bAll').addEventListener('click', selectAll);
$('#bPause').addEventListener('click', () => setPause(!paused));
$('#squadP .ph').addEventListener('click', selectAll); $('#squadP .ph').style.cursor = 'pointer';
$('#bFire').addEventListener('click', () => { fireMode = !fireMode; });
$('#bZin').addEventListener('click', () => zoom(1));
$('#bZout').addEventListener('click', () => zoom(-1));

/* lab */
function toggleLab(force) { const l = $('#lab'); l.hidden = force != null ? !force : !l.hidden;  }
function labSync() { $('#vScale').textContent = CFG.scale ? CFG.scale + 'x' : 'auto ' + S + 'x'; $('#vZoom').textContent = PPU + ' px/m'; }
const bindR = (id, out, fn, fmtf) => { const el = $(id); el.addEventListener('input', () => { const v = +el.value; fn(v); if (out) $(out).textContent = fmtf ? fmtf(v) : v.toFixed(2); }); };
bindR('#lScale', null, (v) => { CFG.scale = v === 1 ? 2 : v; resize(); });
bindR('#lZoom', null, (v) => { CFG.zoom = v; resize(); });
bindR('#lDither', '#vDither', (v) => { CFG.dither = v; });
bindR('#lRefl', '#vRefl', (v) => { CFG.refl = v; });
bindR('#lBloom', '#vBloom', (v) => { CFG.bloom = v; });
bindR('#lRain', '#vRain', (v) => { CFG.rain = v; });
bindR('#lCrt', '#vCrt', (v) => { CFG.crt = v; });
bindR('#lExp', '#vExp', (v) => { CFG.exposure = v; });
$('#lQuant').addEventListener('change', (e) => { CFG.quant = +e.target.value; });
$('#lOut').addEventListener('change', (e) => { CFG.outlines = e.target.checked; });
$('#lCut').addEventListener('change', (e) => { CFG.cut = e.target.checked; });
$('#dHeat').addEventListener('click', () => { if (state !== 'play') return; if (WORLD.kind === 'city') { addHeat(25); lastLoud = time; } else raiseAlarm(); });
$('#dHeal').addEventListener('click', () => { for (const a of agents) if (!a.dead) a.hp = a.maxHp; });
$('#dCash').addEventListener('click', () => { SAVE.cash += 5000; store(); if (!$('#termS').hidden) renderPage(); });

/* ================================================================ company terminal (between missions) */
let shopSel = null, planDef = null, armSel = 0, slotSel = 0, modSel = 'arms', sqTab = 'gear', resetArm = 0, page = 'contracts', conSel = null, DEBRIEF = null;
const PAGES = [['contracts', 'Contracts'], ['territory', 'Territory'], ['squad', 'Squad'], ['research', 'Research'], ['system', 'System']];
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kw = (t) => esc(t).replace(/\*(.+?)\*/g, '<em class="kw">$1</em>');
let tStatTimer = null;
function tStatus(msg, cls) {
  const el = $('#tStat'), full = '> ' + msg; el.className = 'tstat ' + (cls || '');
  clearInterval(tStatTimer); let n = 2; el.textContent = '>';
  if (REDUCED) { el.textContent = full; return; }
  tStatTimer = setInterval(() => { n = Math.min(full.length, n + 2); el.textContent = full.slice(0, n) + (n < full.length ? '_' : ''); if (n >= full.length) clearInterval(tStatTimer); }, 16);
}
function crtAnim(el, cls, ms, done) { if (REDUCED) { if (done) done(); return; } el.classList.remove('on', 'off'); void el.offsetWidth; el.classList.add(cls); setTimeout(() => { el.classList.remove(cls); if (done) done(); }, ms); }
function deployedAlive() { return SAVE.agents.filter((r) => r.alive && r.deploy); }
function aliveRecs() { return SAVE.agents.map((r, i) => [r, i]).filter(([r]) => r.alive); }
function showTerminal(p) {
  for (const s of ['#boot', '#hud']) $(s).hidden = true;
  const wasHidden = $('#termS').hidden;
  $('#termS').hidden = false;
  if (wasHidden) crtAnim($('#termS .crt'), 'on', 1400);
  if (!SAVE.agents[armSel] || !SAVE.agents[armSel].alive) armSel = Math.max(0, SAVE.agents.findIndex((r) => r.alive));
  if (planDef && planDef.need && !SAVE.done[planDef.need]) planDef = null;
  openPage(p || page);
  playMusic('boardroom', 1.5);
}
function openPage(p) {
  page = p; resetArm = p === 'system' ? resetArm : 0;
  $('#tMenu').querySelectorAll('[data-p]').forEach((b) => b.classList.toggle('on', b.dataset.p === p));
  $('#tMenu').classList.toggle('lock', p === 'debrief');
  renderPage();
  $('#tPage').scrollTop = 0;
}
function renderSide() {
  $('#tCash').textContent = fmt(SAVE.cash);
  const dep = deployedAlive(), max = planDef ? planDef.max : 4;
  let h = '<div class="tsh">Contract</div>';
  h += planDef ? '<div class="tsv">' + planDef.code + ' ' + esc(planDef.title) + '</div>' : '<div class="tsv dim">None selected</div>';
  h += '<div class="tsh">Team ' + Math.min(dep.length, max) + '/' + max + '</div>';
  h += dep.length ? dep.slice(0, 6).map((r, i) => '<div class="tsv' + (i >= max ? ' dim' : '') + '">' + r.name + ' <span>' + (r.slots.filter(Boolean).map((id) => WEAPONS[id].name).join(' ') || 'UNARMED') + '</span></div>').join('') : '<div class="tsv dim">Nobody marked</div>';
  const missing = planDef && planDef.requires && !dep.slice(0, max).some((r) => r.slots.includes(planDef.requires)) ? WEAPONS[planDef.requires].name : null;
  const ok = planDef && dep.length && dep.length <= max && !missing;
  h += '<button class="btn primary" id="tDeploy"' + (ok ? '' : ' disabled') + '>DEPLOY</button>';
  if (!planDef) h += '<div class="tsn">Pick a contract first</div>';
  else if (!dep.length) h += '<div class="tsn">Mark agents in Squad</div>';
  else if (dep.length > max) h += '<div class="tsn">Too many agents marked</div>';
  else if (missing) h += '<div class="tsn">Needs a ' + missing + ' in the team // Squad</div>';
  $('#tSide').innerHTML = h;
  $('#tDeploy').addEventListener('click', () => { if (!ok) return; store(); sfx('zap', null, null, 0.6, 0.7); tStatus('DEPLOYING TEAM // CONTRACT ' + planDef.code); $('#termS').hidden = true; startMission(planDef); glCanvas.focus(); });
}
function bindSquad(P) {
  P.querySelectorAll('.agc[data-i]').forEach((b) => b.addEventListener('click', (e) => {
    const i = +b.dataset.i, x = SAVE.agents[i];
    if (e.target.dataset.dep != null) {
      const max = planDef ? planDef.max : 4;
      if (!x.deploy && deployedAlive().length >= max) { tStatus('ONLY ' + max + ' AGENTS CAN DEPLOY', 'bad'); return; }
      x.deploy = !x.deploy; store(); renderPage(); return;
    }
    if (armSel !== i) { armSel = i; sfx('ui', null, null, 0.4); renderPage(); }
  }));
  const rb = $('#recruit'); if (rb) rb.addEventListener('click', () => {
    if (SAVE.cash < 3000 || aliveRecs().length >= 8) return;
    SAVE.cash -= 3000; const n = mkRec(freeName(), R() < 0.5 ? 'm' : 'f'); n.deploy = deployedAlive().length < (planDef ? planDef.max : 4); SAVE.agents.push(n); armSel = SAVE.agents.length - 1;
    store(); sfx('ui', null, null, 0.6, 1.2); tStatus(n.name + ' RECRUITED // PISTOL ISSUED' + (n.deploy ? ' // MARKED TO DEPLOY' : ' // TEAM FULL, IN RESERVE')); renderPage();
  });
}
function renderPage() {
  renderSide();
  const P = $('#tPage');
  const r = SAVE.agents[armSel];
  if (page === 'contracts') {
    if (!conSel || (conSel.need && !SAVE.done[conSel.need] && false)) conSel = planDef || MISSIONS.find((m) => !SAVE.done[m.id] && !(m.need && !SAVE.done[m.need])) || MISSIONS[0];
    const m = conSel, locked = m.need && !SAVE.done[m.need];
    const listH = MISSIONS.map((c) => { const lk = c.need && !SAVE.done[c.need]; return '<button class="row' + (c === m ? ' on' : '') + (lk ? ' dim' : '') + '" data-c="' + c.id + '"><span class="rc">' + c.code + '</span><span class="rn">' + (lk ? 'Classified' : esc(c.title)) + '</span><span class="rs">' + (terrOf(c.id) && terrOf(c.id).revolt ? 'REVOLT' : SAVE.done[c.id] ? 'DONE' : lk ? 'LOCKED' : c === planDef ? 'SELECTED' : 'OPEN') + '</span></button>'; }).join('');
    const btn = locked ? '' : m === planDef ? '<button class="btn" id="cNext">ASSEMBLE SQUAD</button>' : '<button class="btn primary" id="cPick">SELECT CONTRACT</button>';
    const detail = locked
      ? '<div class="box locked"><div class="bh">' + m.code + ' // CLASSIFIED</div><p class="dim">Kessel has not cleared this file for your department yet.</p><div class="lbl">Complete ' + esc(MISSIONS.find((x) => x.id === m.need).title) + ' to unlock it.</div></div>'
      : '<div class="box"><div class="chead"><div><div class="bh" style="margin:0">' + m.code + ' // ' + esc(m.title) + '</div><div class="where" style="margin:2px 0 0">' + esc(m.region) + '</div></div>' + btn + '</div>'
        + '<div class="cbody"><div><p>' + esc(m.brief) + '</p>'
        + '<dl class="meta"><dt>Fee</dt><dd>' + fmt(m.reward) + ' CR' + (SAVE.done[m.id] ? ' (repeat pays half)' : '') + '</dd><dt>Conditions</dt><dd>' + WEATHER[m.weather].name + '</dd><dt>Team</dt><dd>Up to ' + m.max + ' agents</dd><dt>Threat</dt><dd>' + kw(m.threat) + '</dd><dt>Intel</dt><dd><ul class="intel">' + m.intel.map((x, i) => hasIntel(m) || i < 2 ? '<li>' + kw(x) + '</li>' : '<li class="lock">' + x.replace(/[^ ]/g, '/').slice(0, 42) + '</li>').join('') + '</ul>' + (hasIntel(m) ? '' : '<button class="buy" id="cIntel"' + (SAVE.cash < intelCost(m) ? ' disabled' : '') + '>BUY FULL INTEL + TARGET LOCATION // ' + fmt(intelCost(m)) + ' CR</button>') + '</dd></dl></div>'
        + '<div class="bmapw"><canvas id="bmap" class="bmap"></canvas><div class="legend"><span><i style="background:#ff5b82"></i>Target</span><span><i style="border:1px solid #86fadd"></i>Uplink</span><span><i style="background:#b4f06a"></i>Start, extract</span></div></div></div></div>';
    P.innerHTML = '<h2 class="tt">Contracts <small>Open jobs for Kessel field teams</small></h2><div class="split con"><div class="list">' + listH + '</div>' + detail + '</div>';
    P.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { conSel = MISSIONS.find((x) => x.id === b.dataset.c); renderPage(); }));
    requestAnimationFrame(() => { const cv = $('#bmap'); if (cv) drawBriefMap(cv, m); });
    const pk = $('#cPick'); if (pk) pk.addEventListener('click', () => { planDef = m; tStatus('CONTRACT ' + m.code + ' SELECTED // MARK UP TO ' + m.max + ' AGENTS IN SQUAD'); sfx('ui', null, null, 0.6, 1.2); openPage('squad'); });
    const nx = $('#cNext'); if (nx) nx.addEventListener('click', () => openPage('squad'));
    const bi = $('#cIntel'); if (bi) bi.addEventListener('click', () => { if (SAVE.cash < intelCost(m)) return; SAVE.cash -= intelCost(m); SAVE.intel = SAVE.intel || {}; SAVE.intel[m.id] = true; store(); tStatus('INTEL PURCHASED // ' + m.code); sfx('ui', null, null, 0.6, 1.3); renderPage(); });
  } else if (page === 'territory') {
    renderTerritory(P);
  } else if (page === 'squad') {
    // one screen, like the original team screen: roster on top, the selected agent below with loadout and cyborg mods
    const alive = aliveRecs(), lost = SAVE.agents.filter((x) => !x.alive).length;
    const strip = '<div class="agstrip">' + alive.map(([x, i]) => '<div class="agc' + (i === armSel ? ' on' : '') + '" data-i="' + i + '"><button class="chk' + (x.deploy ? ' on' : '') + '" data-dep="' + i + '" aria-label="Deploy ' + x.name + '"></button><span class="rn">' + x.name + '</span><span class="rs">' + (x.slots.filter(Boolean).map((id) => WEAPONS[id].name).join(', ') || 'UNARMED') + '</span></div>').join('')
      + (alive.length < 8 ? '<button class="agc rec" id="recruit"' + (SAVE.cash < 3000 ? ' disabled' : '') + '><span class="rn">+ RECRUIT</span><span class="rs">3,000 CR</span></button>' : '') + '</div>';
    const head = '<h2 class="tt">Squad <small>Tick who deploys. Pick an agent to fit weapons and cyborg mods.' + (lost ? ' ' + lost + ' lost in the field.' : '') + '</small></h2>';
    if (!r || !r.alive) { P.innerHTML = head + strip; bindSquad(P); return; }
    const d = derive(r.mods);
    const prof = '<div class="box sqprof"><canvas id="doll" width="66" height="137"></canvas><div class="bh">' + r.name + '</div><div class="lbl">' + r.missions + ' missions // ' + r.kills + ' kills</div>'
      + '<dl class="meta"><dt>Carry</dt><dd>' + recWeight(r) + ' / ' + d.cap + '</dd><dt>Speed</dt><dd>' + Math.round(d.speed * 100) + '%</dd><dt>Armour</dt><dd>' + (d.armor < 1 ? '-' + Math.round((1 - d.armor) * 100) + '% dmg' : 'None') + '</dd><dt>Hack</dt><dd>' + Math.round(d.hack * 100) + '%</dd><dt>Trace</dt><dd>' + Math.round(d.traceMul * 100) + '%</dd></dl></div>';
    const tabs = '<div class="tabs sqtabs"><button class="tab' + (sqTab === 'gear' ? ' on' : '') + '" data-sq="gear">LOADOUT</button><button class="tab' + (sqTab === 'mods' ? ' on' : '') + '" data-sq="mods">CYBORG MODS</button></div>';
    let body = '', bind = null;
    if (sqTab === 'gear') {
      const wt = recWeight(r), cap = CAP[r.mods.arms];
      const sid = slotSel < 2 ? r.slots[slotSel] : r.gear;
      const rc = slotSel < 2 ? (sid ? ammoCost(r, sid) : 0) : chargeCost(r);
      const sellV = sid ? Math.floor((slotSel < 2 ? WEAPONS[sid].cost : GEAR[sid].cost) * 0.5) : 0;
      const ids = slotSel < 2 ? SAVE.avail.filter((id) => WEAPONS[id] && !WEAPONS[id].npc) : Object.keys(GEAR);
      if (!shopSel || !ids.includes(shopSel)) shopSel = sid && ids.includes(sid) ? sid : ids[0];
      const isW = slotSel < 2, it = isW ? WEAPONS[shopSel] : GEAR[shopSel];
      const locked = !isW && it.need && !SAVE.done[it.need];
      const curW = isW ? (r.slots[slotSel] ? WEAPONS[r.slots[slotSel]].w : 0) : (r.gear ? GEAR[r.gear].w : 0);
      const nw = wt - curW + it.w;
      let act;
      if (locked) act = '<button class="btn" disabled>LOCKED // AFTER ' + esc(MISSIONS.find((m) => m.id === it.need).title.toUpperCase()) + '</button>';
      else if ((isW && r.slots[slotSel] === shopSel) || (!isW && r.gear === shopSel)) act = '<button class="btn" disabled>EQUIPPED</button>';
      else if (isW && r.slots[1 - slotSel] === shopSel) act = '<button class="btn" disabled>ALREADY IN SLOT ' + (2 - slotSel) + '</button>';
      else if (nw > cap) act = '<button class="btn" disabled>TOO HEAVY // ' + nw + '/' + cap + '</button>';
      else act = '<button class="btn primary" id="buyIt"' + (SAVE.cash < it.cost ? ' disabled' : '') + '>' + (it.cost ? 'BUY ' + fmt(it.cost) + ' CR' : 'TAKE') + ' // ' + (isW ? 'SLOT ' + (slotSel + 1) : 'GEAR') + '</button>';
      const statRow = (name, v, max, txt) => '<div class="st"><span>' + name + '</span><div class="bar"><i style="width:calc(' + clamp(v / max * 100, 3, 100).toFixed(0) + '% - 4px)"></i></div><b>' + txt + '</b></div>';
      let stats = '';
      if (isW) {
        const w = it;
        if (w.kind === 'jack') stats = statRow('Range', w.range, 28, w.range + ' m') + statRow('Channel', 1, 2, w.chan + ' s') + statRow('Noise', 1, 44, 'silent') + statRow('Weight', w.w, 6, w.w);
        else stats = statRow('Damage', w.dmg * (w.pellets || 1), 160, w.dmg + (w.pellets ? ' x ' + w.pellets : '')) + statRow('Range', w.range, 28, w.range + ' m') + statRow('Rate', w.rof, 15, w.rof + ' /s') + statRow('Noise', w.noise, 44, w.noise + ' m') + statRow('Weight', w.w, 6, w.w);
        stats += '<div class="lbl" style="margin-top:8px">' + (w.energy != null ? 'Power cell, ' + w.energy + '% per shot, recharges' : w.mag + ' round magazine x ' + w.mags + ' // refill ' + fmt(w.ammo || 0) + ' CR') + '</div>';
      } else stats = statRow('Weight', it.w, 6, it.w) + (it.charges ? statRow('Charges', it.charges, 5, it.charges) + statRow('Trace', it.trace, 1, Math.round(it.trace * 100) + '%') : '');
      let all = 0; for (const a of deployedAlive()) { for (const id of a.slots) if (id) all += ammoCost(a, id); all += chargeCost(a); }
      body = '<div class="loslots">' + [0, 1, 2].map((i) => { const id = i < 2 ? r.slots[i] : r.gear; return '<button class="slot' + (i === slotSel ? ' cur' : '') + '" data-s="' + i + '"><small>' + (i < 2 ? 'SLOT ' + (i + 1) : 'GEAR') + '</small>' + (id ? '<img class="wic" src="' + itemIcon(id) + '" alt="">' : '<span class="wic none"></span>') + '<b>' + slotName(r, i) + '</b><span>' + slotSub(r, i) + '</span></button>'; }).join('') + '</div>'
        + '<div class="lobar"><div class="weight"><span>CARRY</span><div class="bar"><i style="width:calc(' + Math.min(100, wt / cap * 100).toFixed(1) + '% - 4px)"></i></div><span class="num">' + wt + '/' + cap + '</span></div>'
        + (sid && rc > 0 ? '<button class="buy" id="slotRefill"' + (SAVE.cash < rc ? ' disabled' : '') + '>REFILL ' + fmt(rc) + '</button>' : '')
        + (sid ? '<button class="buy" id="slotSell">REMOVE' + (sellV ? ' +' + fmt(sellV) : '') + '</button>' : '')
        + '<button class="buy" id="refillAll"' + (!all || SAVE.cash < all ? ' disabled' : '') + '>' + (all ? 'REFILL TEAM ' + fmt(all) : 'TEAM STOCKED') + '</button></div>'
        + '<div class="loshop"><div class="cat">' + ids.map((id) => { const x = isW ? WEAPONS[id] : GEAR[id], lk = !isW && x.need && !SAVE.done[x.need], eq = isW ? r.slots.includes(id) : r.gear === id;
          return '<button class="cc' + (id === shopSel ? ' on' : '') + (lk ? ' dim' : '') + '" data-pick="' + id + '"><img class="wic" src="' + itemIcon(id) + '" alt=""><b>' + x.name + '</b><span>' + (eq ? 'EQUIPPED' : lk ? 'LOCKED' : x.cost ? fmt(x.cost) + ' CR' : 'FREE') + '</span></button>'; }).join('')
        + '</div><div class="detail lod"><div><div class="dn">' + it.name + '</div><p>' + esc(it.desc) + '</p><div class="go">' + act + '</div></div><div>' + stats + '</div></div></div>';
      bind = () => {
        P.querySelectorAll('.slot').forEach((b) => b.addEventListener('click', () => { slotSel = +b.dataset.s; shopSel = null; sfx('ui', null, null, 0.4); renderPage(); }));
        P.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { shopSel = b.dataset.pick; sfx('ui', null, null, 0.4); renderPage(); }));
        const bi = $('#buyIt'); if (bi) bi.addEventListener('click', () => {
          if (SAVE.cash < it.cost) return;
          if (isW) {
            const old = r.slots[slotSel];
            SAVE.cash -= it.cost; if (old) { SAVE.cash += Math.floor(WEAPONS[old].cost * 0.5); delete r.ammo[old]; }
            r.slots[slotSel] = shopSel; const fa = fullAmmo(shopSel); if (fa) r.ammo[shopSel] = fa;
          } else { SAVE.cash -= it.cost; if (r.gear) SAVE.cash += Math.floor(GEAR[r.gear].cost * 0.5); r.gear = shopSel; r.charges = it.charges || 0; }
          store(); sfx('door', null, null, 0.5, 1.4); tStatus(r.name + ' // ' + it.name + (isW ? ' IN SLOT ' + (slotSel + 1) : ' FITTED')); renderPage();
        });
        const rf = $('#slotRefill'); if (rf) rf.addEventListener('click', () => {
          if (SAVE.cash < rc) return; SAVE.cash -= rc;
          if (slotSel < 2) refill(r, sid); else r.charges = GEAR[r.gear].charges;
          store(); sfx('ui', null, null, 0.5); tStatus(r.name + ' // ' + (slotSel < 2 ? WEAPONS[sid].name + ' REFILLED' : 'DECK RECHARGED')); renderPage();
        });
        const sl = $('#slotSell'); if (sl) sl.addEventListener('click', () => {
          SAVE.cash += sellV;
          if (slotSel < 2) { delete r.ammo[sid]; r.slots[slotSel] = null; } else { r.gear = null; r.charges = 0; }
          store(); sfx('ui', null, null, 0.5); tStatus(r.name + ' // ITEM REMOVED' + (sellV ? ', ' + fmt(sellV) + ' CR BACK' : '')); renderPage();
        });
        $('#refillAll').addEventListener('click', () => {
          for (const a of deployedAlive()) {
            for (const id of a.slots) if (id) { const c = ammoCost(a, id); if (c && SAVE.cash >= c) { SAVE.cash -= c; refill(a, id); } }
            const cc = chargeCost(a); if (cc && SAVE.cash >= cc) { SAVE.cash -= cc; a.charges = GEAR[a.gear].charges; }
          }
          store(); sfx('ui', null, null, 0.6); tStatus('TEAM RESTOCKED'); renderPage();
        });
      };
    } else {
      body = '<div class="mods">' + MOD_ORDER.map((k) => {
        const v = r.mods[k], nv = v + 1;
        let btn;
        if (v >= 3) btn = '<button class="buy" disabled>MAX</button>';
        else if (MOD_NEED[nv] && !SAVE.done[MOD_NEED[nv]]) btn = '<button class="buy" disabled>V' + nv + ' LOCKED</button>';
        else btn = '<button class="buy" data-mod="' + k + '"' + (SAVE.cash < MOD_COST[nv] ? ' disabled' : '') + '>V' + nv + ' ' + fmt(MOD_COST[nv]) + '</button>';
        return '<div class="mod' + (k === modSel ? ' sel' : '') + '" data-k="' + k + '"><span class="n">' + k.toUpperCase() + '</span><span class="pips">' + [1, 2, 3].map((n) => '<i class="' + (v >= n ? 'on' : '') + '"></i>').join('') + '</span>' + btn + '<small>' + MOD_TXT[k] + '</small></div>';
      }).join('') + '</div><div class="lbl" style="margin-top:8px">Higher versions unlock as contracts are completed.</div>';
      bind = () => {
        P.querySelectorAll('.mod').forEach((el) => el.addEventListener('pointerenter', () => { modSel = el.dataset.k; drawDoll(r); P.querySelectorAll('.mod').forEach((o) => o.classList.toggle('sel', o === el)); }));
        P.querySelectorAll('[data-mod]').forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.mod, nv = r.mods[k] + 1; if (SAVE.cash < MOD_COST[nv]) return;
          SAVE.cash -= MOD_COST[nv]; r.mods[k] = nv; modSel = k; store(); sfx('zap', null, null, 0.6, 1.2); tStatus(r.name + ' // ' + k.toUpperCase() + ' V' + nv + ' INSTALLED'); renderPage();
        }));
      };
    }
    P.innerHTML = head + strip + '<div class="sqgrid">' + prof + '<div class="box sqpanel">' + tabs + body + '</div></div>';
    bindSquad(P); bind(); drawDoll(r);
    P.querySelectorAll('[data-sq]').forEach((b) => b.addEventListener('click', () => { if (sqTab === b.dataset.sq) return; sqTab = b.dataset.sq; sfx('ui', null, null, 0.4, 1.2); renderPage(); }));
  } else if (page === 'research') {
    const R0 = SAVE.res || (SAVE.res = { done: {}, active: null, left: 0 });
    const act = RESEARCH.find((x) => x.id === R0.active);
    P.innerHTML = '<h2 class="tt">Research <small>Fund one project at a time. Projects finish as your teams complete contracts.</small></h2>'
      + (act ? '<div class="box" style="margin-bottom:10px"><div class="bh">In progress</div><div class="rprog"><img class="wic" src="' + itemIcon(act.icon) + '" alt=""><div><b>' + act.name + '</b><div class="bar"><i style="width:calc(' + Math.round((act.jobs - R0.left) / act.jobs * 100) + '% - 4px)"></i></div><span class="lbl">' + R0.left + ' contract' + (R0.left > 1 ? 's' : '') + ' to go</span></div></div></div>' : '')
      + '<div class="rgrid">' + RESEARCH.map((x) => {
        const done = !!R0.done[x.id], lk = x.need && !SAVE.done[x.need], on = R0.active === x.id;
        const btn = done ? '<button class="btn" disabled>COMPLETE</button>' : on ? '<button class="btn" disabled>IN PROGRESS</button>' : lk ? '<button class="btn" disabled>LOCKED // ' + esc(MISSIONS.find((m) => m.id === x.need).title.toUpperCase()) + '</button>'
          : '<button class="btn primary" data-res="' + x.id + '"' + (R0.active || SAVE.cash < x.cost ? ' disabled' : '') + '>FUND ' + fmt(x.cost) + ' CR</button>';
        return '<div class="box rcard' + (done ? ' done' : '') + (lk ? ' dim' : '') + '"><img class="wic" src="' + itemIcon(x.icon) + '" alt=""><div class="bh">' + x.name + '</div><p>' + esc(x.desc) + '</p><div class="lbl">Takes ' + x.jobs + ' contract' + (x.jobs > 1 ? 's' : '') + '</div><div class="go">' + btn + '</div></div>';
      }).join('') + '</div>';
    P.querySelectorAll('[data-res]').forEach((b) => b.addEventListener('click', () => {
      const x = RESEARCH.find((y) => y.id === b.dataset.res); if (R0.active || SAVE.cash < x.cost) return;
      SAVE.cash -= x.cost; R0.active = x.id; R0.left = x.jobs; store(); sfx('zap', null, null, 0.6, 1.2); tStatus('RESEARCH FUNDED // ' + x.name.toUpperCase()); renderPage();
    }));
  } else if (page === 'system') {
    P.innerHTML = '<h2 class="tt">System <small>Kessel field terminal</small></h2><div class="split sys"><div class="box"><div class="bh">Settings</div><div class="go" style="margin-top:0">'
      + '<button class="btn" id="sSnd">SOUND: ' + (AU.on ? 'ON' : 'OFF') + '</button><button class="btn" id="sLab">PIXEL LAB</button><button class="btn" id="sTips">FIELD TIPS: ' + (SAVE.tipsOn === false ? 'OFF' : 'ON') + '</button><button class="btn ghost" id="sTipR">REPLAY TIPS</button></div>'
      + '<div class="bh" style="margin-top:22px">Campaign</div><p class="dim">Progress is saved in this browser.</p><div class="go"><button class="btn danger" id="sWipe">' + (resetArm ? 'CLICK AGAIN TO WIPE' : 'NEW CAMPAIGN') + '</button></div></div>'
      + '<div class="box"><div class="bh">Field manual</div><dl class="meta man">'
      + '<dt>LMB</dt><dd>Select an agent, or move. Double-click to run. Drag to box-select.</dd><dt>RMB</dt><dd>Click a target to attack. Hold to fire at the ground.</dd>'
      + '<dt>SPACE</dt><dd>Pause. You can give orders while paused.</dd><dt>1-4 / 0</dt><dd>Select an agent or the whole team. Press twice to centre.</dd><dt>Z X R G</dt><dd>Weapon slot 1 or 2, reload, medikit.</dd>'
      + '<dt>H</dt><dd>Network view. Click an uplink to send a deck carrier, then click nodes in its range.</dd><dt>F</dt><dd>Take the nearest vehicle, or get out.</dd>'
      + '<dt>WASD Q E</dt><dd>Pan, rotate. Wheel zooms.</dd><dt>ESC ESC</dt><dd>Abort the contract.</dd>'
      + '<dt>Stealth</dt><dd>Guards see further in light. Searchlights expose you. An alarm only goes off if an alerted guard stays alive for 3 seconds.</dd>'
      + '<dt>Ammo</dt><dd>Limited per contract. Dead enemies drop weapons: walk over them for ammo, click to swap.</dd>'
      + '<dt>Fire</dt><dd>Explosions, wrecks and the flamer leave fire. Anyone in it catches alight. Fuel drums blow up when shot.</dd>'
      + '<dt>Towers</dt><dd>Clear a watchtower, then click it to send two agents up the ladder for extra range.</dd></dl></div></div>';
    $('#sSnd').addEventListener('click', () => { setSound(!AU.on); if (AU.on) playMusic('boardroom', 1.5); renderPage(); });
    $('#sLab').addEventListener('click', () => toggleLab());
    $('#sTips').addEventListener('click', () => { SAVE.tipsOn = SAVE.tipsOn === false; store(); renderPage(); });
    $('#sTipR').addEventListener('click', () => { SAVE.tips = {}; SAVE.tipsOn = true; store(); tStatus('FIELD TIPS WILL SHOW AGAIN'); renderPage(); });
    $('#sWipe').addEventListener('click', () => {
      if (!resetArm) { resetArm = 1; renderPage(); return; }
      SAVE = freshSave(); store(); planDef = null; conSel = null; armSel = 0; resetArm = 0; tStatus('NEW CAMPAIGN STARTED', 'warn'); openPage('contracts');
    });
  } else if (page === 'debrief' && DEBRIEF) {
    const D = DEBRIEF;
    P.innerHTML = '<h2 class="tt ' + (D.res === 'win' ? 'ok' : 'bad') + '">' + D.title + ' <small>' + esc(D.sub) + '</small></h2><div class="split"><div class="box"><div class="bh">Field report</div><dl class="stats">'
      + D.rows.map((x) => '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>').join('') + '</dl></div><div class="box"><div class="bh">Ledger</div><dl class="ledger">'
      + D.ledger.map((x) => '<dt>' + esc(x[0]) + '</dt><dd class="' + (x[1] < 0 ? 'neg' : '') + '">' + (x[1] > 0 ? '+' : '') + fmt(x[1]) + '</dd>').join('')
      + '<dt class="tot">Net</dt><dd class="tot' + (D.total < 0 ? ' neg' : '') + '">' + (D.total > 0 ? '+' : '') + fmt(D.total) + ' CR</dd><dt>Account</dt><dd>' + fmt(SAVE.cash) + ' CR</dd></dl>'
      + '<p>' + D.text + '</p><div class="go"><button class="btn primary" id="dOk">CONTINUE</button></div></div></div>';
    $('#dOk').addEventListener('click', () => { DEBRIEF = null; openPage('contracts'); });
    $('#dOk').focus();
  }
}
function slotName(r, i) { if (i < 2) return r.slots[i] ? WEAPONS[r.slots[i]].name : 'EMPTY'; return r.gear ? GEAR[r.gear].name : 'NONE'; }
function slotSub(r, i) {
  if (i < 2) {
    const id = r.slots[i]; if (!id) return 'Free slot';
    const w = WEAPONS[id]; if (w.energy != null) return 'Power cell, recharges';
    const a = r.ammo[id] || { mag: 0, res: 0 };
    return Math.min(a.mag + a.res, w.mag * w.mags) + ' / ' + (w.mag * w.mags) + ' rounds';
  }
  if (!r.gear) return 'Gear slot';
  if (GEAR[r.gear].charges) return r.charges + ' / ' + GEAR[r.gear].charges + ' charges';
  return 'One use';
}
$('#tMenu').querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { if ($('#tMenu').classList.contains('lock')) return; sfx('ui', null, null, 0.4, 1.4); openPage(b.dataset.p); }));
window.addEventListener('keydown', (e) => {
  if ($('#termS').hidden || (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT'))) return;
  if ($('#tMenu').classList.contains('lock')) return;
  const i = '12345'.indexOf(e.key); if (i >= 0) { sfx('ui', null, null, 0.4, 1.4); openPage(PAGES[i][0]); }
});
setInterval(() => { const el = $('#tClock'); if (el && !$('#termS').hidden) { const d = new Date(); el.textContent = '2093-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + d.toTimeString().slice(0, 5); } }, 1000);

/* ================================================================ briefing map (vector schematic per contract) */
function drawBriefMap(cv, def) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), CW = cv.clientWidth || 420, CH = cv.clientHeight || 300;
  cv.width = Math.round(CW * dpr); cv.height = Math.round(CH * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, CW, CH);
  const comp = def.world === 'compound';
  const bx0 = comp ? 36 : -6, bx1 = comp ? 190 : GW + 6, bz0 = comp ? 22 : -6, bz1 = comp ? 212 : GW + 6;
  const k = Math.min((CW - 16) / (bx1 - bx0), (CH - 16) / (bz1 - bz0)), ox = (CW - (bx1 - bx0) * k) / 2, oz = (CH - (bz1 - bz0) * k) / 2;
  const X = (x) => Math.round(ox + (x - bx0) * k) + 0.5, Z = (z) => Math.round(oz + (z - bz0) * k) + 0.5;
  const C = { grid: 'rgba(134,250,221,0.10)', line: 'rgba(134,250,221,0.55)', dim: 'rgba(134,250,221,0.25)', fill: 'rgba(134,250,221,0.07)', tgt: '#ff5b82', up: '#86fadd', ex: '#b4f06a', gd: '#ffc46b', txt: '#c9d3df' };
  g.lineWidth = 1; g.font = '600 11px "Chakra Petch", system-ui, sans-serif'; g.textBaseline = 'middle';
  g.strokeStyle = C.grid; g.beginPath();
  for (let x = Math.ceil(bx0 / 10) * 10; x < bx1; x += 10) { g.moveTo(X(x), 0); g.lineTo(X(x), CH); }
  for (let z = Math.ceil(bz0 / 10) * 10; z < bz1; z += 10) { g.moveTo(0, Z(z)); g.lineTo(CW, Z(z)); }
  g.stroke();
  const rect = (x0, z0, x1, z1, st, fl, dash) => { g.beginPath(); g.rect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0)); if (fl) { g.fillStyle = fl; g.fill(); } if (st) { g.strokeStyle = st; if (dash) g.setLineDash(dash); g.stroke(); g.setLineDash([]); } };
  const seg = (x0, z0, x1, z1, st, dash) => { g.beginPath(); g.moveTo(X(x0), Z(z0)); g.lineTo(X(x1), Z(z1)); g.strokeStyle = st; if (dash) g.setLineDash(dash); g.stroke(); g.setLineDash([]); };
  const circ = (x, z, r, st, dash) => { g.beginPath(); g.arc(X(x), Z(z), r * k, 0, TAU); g.strokeStyle = st; if (dash) g.setLineDash(dash); g.stroke(); g.setLineDash([]); };
  const dot = (x, z, s, col) => { g.fillStyle = col; g.fillRect(Math.round(X(x) - s / 2), Math.round(Z(z) - s / 2), s, s); };
  const diamond = (x, z, s, col) => { g.beginPath(); g.moveTo(X(x), Z(z) - s); g.lineTo(X(x) + s, Z(z)); g.lineTo(X(x), Z(z) + s); g.lineTo(X(x) - s, Z(z)); g.closePath(); g.strokeStyle = col; g.stroke(); };
  const cross = (x, z, col) => { const px = X(x), pz = Z(z); g.strokeStyle = col; g.beginPath(); g.arc(px, pz, 6, 0, TAU); g.moveTo(px - 10, pz); g.lineTo(px - 3, pz); g.moveTo(px + 3, pz); g.lineTo(px + 10, pz); g.moveTo(px, pz - 10); g.lineTo(px, pz - 3); g.moveTo(px, pz + 3); g.lineTo(px, pz + 10); g.stroke(); };
  const text = (t, x, z, col, dx, dz, al) => { g.fillStyle = col; g.textAlign = al || 'left'; g.fillText(t, Math.round(X(x) + (dx || 0)), Math.round(Z(z) + (dz || 0))); };
  const uplink = (x, z, r, lab) => { if (r) circ(x, z, r, 'rgba(134,250,221,0.16)', [2, 4]); g.strokeStyle = C.up; g.strokeRect(Math.round(X(x) - 3) + 0.5, Math.round(Z(z) - 3) + 0.5, 6, 6); if (lab) text(lab, x, z, C.up, 6, 0); };
  if (comp) {
    rect(ROADX - 4, bz0, ROADX + 4, bz1, null, 'rgba(201,211,223,0.07)');
    rect(CX0, CZ0, CX1, CZ1, null, 'rgba(134,250,221,0.04)');
    for (const [a, b] of [[[CX0, CZ0], [108, CZ0]], [[118, CZ0], [CX1, CZ0]], [[CX0, CZ1], [108, CZ1]], [[118, CZ1], [CX1, CZ1]], [[CX0, CZ0], [CX0, 95]], [[CX0, 100], [CX0, CZ1]], [[CX1, CZ0], [CX1, CZ1]]]) seg(a[0], a[1], b[0], b[1], C.line);
    for (const b of [[98, 58, 128, 70], [70, 80, 92, 90], [134, 80, 156, 90], [76, 108, 96, 118], [70, 58, 77, 64], [136, 56, 158, 72]]) rect(b[0], b[1], b[2], b[3], C.dim, C.fill);
    for (const [x, z] of [[66, 56], [160, 56], [66, 144], [160, 144]]) rect(x - 2, z - 2, x + 2, z + 2, C.gd, C.gd);
    if (hasIntel(def)) { cross(113, 73.6, C.tgt); text('RUSK', 113, 73.6, C.tgt, 12, -6); uplink(120, 160.9, 0); uplink(54, 100.9, 0); uplink(80, 67.9, 0); uplink(134, 76.9, 0); }
    else text('TARGET LOCATION: BUY INTEL', 113, 40, C.tgt, 0, 0, 'center');
    rect(113, 193, 116, 199, C.ex, 'rgba(180,240,106,0.35)'); text('VAN', 114.5, 196, C.ex, 8, 0);
  } else {
    const L = LEVELS[def.level], net = briefNet(L);
    for (const v of L.voids || []) rect(v[0], v[1], v[2], v[3], null, 'rgba(47,154,138,0.2)');
    g.lineCap = 'butt';
    for (const r of L.roads) {
      g.beginPath(); r.pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1])));
      if (r.kind === 'path') { g.strokeStyle = 'rgba(201,211,223,0.18)'; g.lineWidth = 1; g.setLineDash([2, 3]); g.stroke(); g.setLineDash([]); }
      else { g.strokeStyle = r.kind === 'alley' ? 'rgba(201,211,223,0.08)' : 'rgba(201,211,223,0.13)'; g.lineWidth = Math.max(2, (r.w + (r.kind === 'alley' ? 1.6 : 6)) * k); g.stroke(); }
    }
    g.lineWidth = 1;
    for (const n of net.nodes) if (n.cul) { g.beginPath(); g.arc(X(n.x), Z(n.z), (n.r + 5) * k, 0, TAU); g.fillStyle = 'rgba(201,211,223,0.13)'; g.fill(); }
    const ZL = { market: 'MARKET', factory: 'FOUNDRY', terminal: 'CONTAINER YARD', park: 'PARK', field: 'FIELD', parking: 'PARKING', den: 'DEN', apron: 'APRON // VTOL', terminal_air: 'TERMINAL', ctower: 'CONTROL', hangar: 'HANGAR', fuelfarm: 'FUEL FARM' };
    for (const zn of L.zones) {
      const [x0, z0, x1, z1] = zn.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (zn.type === 'plaza') { rect(x0, z0, x1, z1, C.ex, 'rgba(180,240,106,0.12)'); text('EXTRACT', cx, cz, C.ex, 0, 0, 'center'); }
      else if (zn.type === 'tower') { rect(x0, z0, x1, z1, C.tgt, 'rgba(255,91,130,0.1)'); text(def.id === 'courier' ? 'FREIGHT OFFICE' : def.id === 'halden' ? 'MERIDIAN HQ' : 'TOWER', cx, cz, C.tgt, 0, 0, 'center'); }
      else { rect(x0, z0, x1, z1, C.dim, zn.type === 'park' || zn.type === 'field' ? 'rgba(90,168,58,0.18)' : C.fill); if (ZL[zn.type]) text(ZL[zn.type], cx, cz, C.dim, 0, 0, 'center'); }
    }
    const b = L.bounds; rect(b[0], b[1], b[2], b[3], 'rgba(255,91,130,0.35)', null, [4, 4]);
    if (hasIntel(def)) for (const u of net.uplinks) { g.strokeStyle = 'rgba(134,250,221,0.6)'; g.strokeRect(Math.round(X(u[0]) - 2) + 0.5, Math.round(Z(u[1]) - 2) + 0.5, 4, 4); }
    const st = L.spots.start;
    rect(st[0] - 3, st[1] - 3, st[0] + 3, st[1] + 3, C.ex, 'rgba(180,240,106,0.35)'); text('START', st[0], st[1], C.ex, 9, 0);
    const tp = def.spot ? [def.spotLabel, L.spots[def.spot]] : def.id === 'varga' ? ['LIMO', L.spots.limo] : def.id === 'courier' ? ['VAN', L.spots.van] : def.id === 'halden' ? ['HALDEN', L.spots.halden] : null;
    if (tp && hasIntel(def)) { cross(tp[1][0], tp[1][1], C.tgt); text(tp[0], tp[1][0], tp[1][1], C.tgt, -13, 0, 'right'); }
    if (!hasIntel(def)) text('TARGET LOCATION: BUY INTEL', (b[0] + b[2]) / 2, b[3] - 6, C.tgt, 0, 0, 'center');
  }
}
/* road net and payphones for a level without building it, for the briefing map */
const BRIEF = {};
function briefNet(L) {
  if (BRIEF[L.id]) return BRIEF[L.id];
  const keep = LEVEL; LEVEL = L; const net = buildRoadNet(L.roads); LEVEL = keep;
  for (const n of net.nodes) if (n.deg === 1 && n.adj.length && inPlayB(L, n.x, n.z, 4)) n.cul = 1;
  const cand = net.nodes.filter((n) => n.deg >= 3 && inPlayB(L, n.x, n.z, 8));
  return (BRIEF[L.id] = { nodes: net.nodes, uplinks: cand.filter((n, i) => i % 2 === 0).map((n) => [n.x, n.z]) });
}
const inPlayB = (L, x, z, m) => x >= L.bounds[0] + m && z >= L.bounds[1] + m && x <= L.bounds[2] - m && z <= L.bounds[3] - m;

/* ================================================================ pixel item icons */
const ICON_C = { d: '#121a24', m: '#5a6b80', l: '#8c9bb0', h: '#c9d3df', w: '#8a4a16', W: '#4f2a12', t: '#86fadd', T: '#2f9a8a', p: '#ff5b82', r: '#e0402c', g: '#b4f06a', v: '#4a2350', s: '#263345', a: '#ffc46b' };
const ICONS = {
  silenced: [[12, 8, 14, 4, 'm'], [12, 8, 14, 1, 'l'], [26, 8, 18, 4, 's'], [26, 8, 18, 1, 'm'], [13, 12, 5, 7, 's'], [14, 13, 3, 5, 'm'], [18, 12, 4, 1, 's'], [20, 12, 1, 3, 's']],
  pistol: [[16, 7, 16, 4, 'm'], [16, 7, 16, 1, 'l'], [31, 8, 2, 2, 'd'], [17, 11, 5, 7, 's'], [18, 12, 3, 5, 'm'], [22, 11, 4, 1, 's'], [24, 11, 1, 3, 's']],
  uzi: [[12, 7, 22, 5, 'm'], [12, 7, 22, 1, 'l'], [34, 9, 6, 2, 's'], [20, 12, 4, 9, 's'], [21, 13, 2, 7, 'm'], [26, 12, 3, 4, 's'], [5, 8, 7, 2, 's'], [5, 8, 2, 6, 's']],
  shotgun: [[3, 8, 11, 4, 'w'], [3, 10, 4, 4, 'W'], [14, 7, 30, 3, 'm'], [14, 7, 30, 1, 'l'], [18, 10, 16, 2, 'W'], [18, 10, 16, 1, 'w'], [42, 6, 2, 1, 'h']],
  rifle: [[1, 9, 11, 4, 'w'], [1, 11, 4, 3, 'W'], [12, 8, 18, 4, 'm'], [12, 8, 18, 1, 'l'], [30, 9, 17, 2, 's'], [16, 5, 11, 2, 's'], [17, 4, 2, 1, 'h'], [22, 12, 3, 5, 's'], [26, 12, 1, 2, 's']],
  minigun: [[4, 4, 14, 10, 's'], [5, 5, 12, 2, 'm'], [18, 5, 28, 2, 'm'], [18, 8, 28, 2, 'l'], [18, 11, 28, 2, 'm'], [44, 4, 3, 10, 's'], [8, 14, 4, 4, 's'], [12, 14, 7, 5, 'W'], [13, 15, 5, 1, 'a']],
  launcher: [[4, 6, 40, 7, 's'], [4, 6, 40, 2, 'm'], [4, 11, 40, 1, 'd'], [44, 7, 3, 5, 'r'], [14, 3, 5, 3, 'd'], [18, 13, 4, 6, 'd'], [28, 13, 3, 3, 'd'], [2, 7, 2, 5, 'm']],
  laser: [[8, 6, 26, 6, 's'], [8, 6, 26, 1, 'm'], [10, 9, 22, 1, 'p'], [34, 7, 8, 4, 'T'], [34, 8, 9, 2, 't'], [14, 12, 4, 7, 's'], [22, 12, 7, 3, 'T'], [23, 13, 5, 1, 't']],
  jack: [[12, 6, 18, 9, 'v'], [12, 6, 18, 1, 'p'], [14, 8, 9, 4, 'd'], [15, 9, 7, 2, 'p'], [25, 8, 3, 2, 't'], [30, 3, 2, 12, 's'], [32, 2, 4, 3, 'p'], [16, 15, 4, 4, 's']],
  medikit: [[13, 6, 22, 12, 'h'], [13, 6, 22, 1, 'l'], [13, 17, 22, 1, 'm'], [22, 8, 4, 8, 'r'], [18, 10, 12, 4, 'r'], [20, 3, 8, 3, 'm'], [21, 4, 6, 2, 'd']],
  deck: [[7, 6, 34, 11, 's'], [7, 6, 34, 1, 'm'], [9, 8, 15, 4, 'd'], [10, 9, 13, 2, 't'], [27, 8, 2, 2, 'g'], [31, 8, 8, 1, 'm'], [9, 13, 30, 1, 'm'], [9, 15, 30, 1, 'm']],
  deck2: [[7, 5, 34, 12, 'd'], [7, 5, 34, 1, 'p'], [9, 7, 18, 5, 'v'], [10, 8, 16, 3, 'p'], [30, 7, 2, 2, 't'], [34, 7, 2, 2, 'g'], [9, 13, 30, 1, 's'], [9, 15, 30, 1, 's'], [41, 9, 2, 4, 'p']],
};
const iconCache = {};
function itemIcon(id) {
  if (ICON_IMG[id]) return 'data:image/png;base64,' + ICON_IMG[id];
  if (iconCache[id]) return iconCache[id];
  const W = 48, H = 22, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  for (const [x, y, w, h, k] of ICONS[id] || []) { g.fillStyle = ICON_C[k] || k; g.fillRect(x, y, w, h); }
  const d = g.getImageData(0, 0, W, H), o = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (d.data[i + 3]) { o.data.set(d.data.subarray(i, i + 4), i); continue; }
    let edge = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && d.data[(ny * W + nx) * 4 + 3]) edge = true; }
    if (edge) { o.data[i] = 0; o.data[i + 1] = 0; o.data[i + 2] = 0; o.data[i + 3] = 255; }
  }
  g.putImageData(o, 0, 0);
  return (iconCache[id] = c.toDataURL());
}

/* ================================================================ agent doll (pixel sprite + cyborg mod recolours) */
const DOLLS = {
  m: { src: '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', armL: 19, armR: 46, legY: 66, handL: 15, handR: 50, eyes: [29, 36, 10] },
  f: { src: 'iVBORw0KGgoAAAANSUhEUgAAAEIAAACJBAMAAABqVfOsAAAAMFBMVEUAAAB4eoNwam4nKCyBg4sSERNUVl5EQ0kCAgJANjS1mosqAAIAAAAAAAAAAAAAAAAi32FLAAAAEHRSTlMA//////////////8AAAAAHuuroAAABwdJREFUeNq9mFtsHFcdxn9zZma9aXA86zitqWtn7TiUEojHcmhQZJqBWG2hTbIOtCBxM5VAFVLBEqhKoSJLVUr6gsLloSogGQoCBHXctKVRicImChCR2BlLODVNm0wudq0E2+smbibeufAwe5mdXS8CCfZpz9G33/9+OQv/j48UOf+w2f9U+Y2IHJuRkjUR7wWeqCVlxc8BpgdrcFT5/A8Qe4CZ8iul7PT0DxoWjvz1eg2Ofd9+DNu+UcPaO74DMPPV5TkeAeDvNaR8Pc1u7PfVityzGkRCF/WHvTtdO/riN/CoVXYllyPi44bddbCWi5/u6Oh4hlocDR+aVE5P10Jo0+r31m7OLB8Xlc9lT980sXzk1EfOu6PKGwupkWWkxLvGzp3VnO2viM2TVT0mb+jTbB1l3y3KlF4NseKL1q1wxGrIXhbOzYNVEHut2FCW2ziMvzTg/bZSD/lvzdffE59puf7ut5Cv31itzUQ5ZJ3BrSajAy5ck5D1CmvvPyotxgFMsI0js3+u0CPJjiWrB4AedeiCKSo1rTfVbeiAjJ5ypWwlIpZsGUFmCJ3cgYcGtApbWtdPbrsOMwm/EfH+ly9tHoty9EwkTwBKRwp4XrT2VEq5LCQT5J52E1dLnrKiebpipd45d3Je6jflf85Ln2g/7O4cLPeHp7tutwb1fZk+aMTUrYiUDYCnIf3F/6xGwjLhuYhPBcjpHRYfyZqziJY7D3PnK2UcapZxDSt1l4l3SW1DqudGqlxKFuVgjv0vjDK68oqlP27gR/TQSSQBEiSAtEiYcrkeXqvV+zMeHDtl0OfIPaO5YwirjOMpU2qEb54fBOranoF2zb23DOHFOv8IKtYhDnmxJPz+Lt0NI1SndzYF4ACZJR3Uq8fWpUJ69P9q1UMPgzvwOoU029R0eaIU/fji/KoTMyDfcmJL4tbWi+4k/Kn1rbquyYKUXFL/chLgSNKZzzS+C0DcnbdGBKK8VwEkhwxONqMB8k8vohcRH8dPjgDpQFOOA7bQebGI2AZ/CCxRACOw8jMZYkWEhQnAeNBlWAnwS5eNRUQW7R5ANQwJQImlgHEpCJ4A5BFXyQDedDAVvvZ5C3AMM6eXvO6awFOebxko3pz1cOEqjxCM7wIYwzI0DAXeBFhfX0Qo+pozQNzCRZEkTLw0MGxg5L2+452uXwP+o9dEgxSPoyeGX5sBL/aPi3MBhz/RCLBn36tuFvDNX/gzAOPbs3kpF6WVAPvX8UYGcI4tdeUAJG1jgIhnV6UBjLGBgXxuWgqAfd5PBxxrVgPII8WES5LTAbo3Bxz+3L0Asaz+In4GJ0u37A8AfLfVBgXuWwyNpWS4B9tnXgIBdfcH3OANEWQITAFwfBAEaqso1HYuxfqzu1BHYDhgvKAj8H5ysiBFqmO2Zz+DQNDoRp/NRy4fI/wlw9uNMgRo+XofQACmBrC1bO5cAxAuIFCkBwHUBZBMrZF2yQX8FMCXEhaCnQmv0MMlgxYO0FnopSKjLSKQRK4w+cS0NcSS11bYtxwzqSEYNsiPNRNPTqGakC/qHMoZBLIZUnAr2J8MnV0dBbujeARrL3gl8+lII6DLLkIyAMIZDdoE7LkKIrzlnUpOAo+LbN5jMAMK2HurTO/g9Fi48+fMfAtCzgAfHqkykTVo1AHal5n7ySswPAvYZ0ASVSbyC0b4h1oVDiE65t7Ox6ddbqmyO/gdTR9sPwXQdnXAPjxTKUUVLVZQy+PSgWSq2nbhHFWDIDvbncNV94+G2XPBL9W5+avVrPUP6J2FybrgZqtwCNyRYubIVaW4pURxR6shPgZaUDg2BM22YreUCl5VElo1jktaMbVcFoxKRDyJ0pz//oSBSFcg3LVSf6Fu5E3a22ZFXJ680n3TkwVre1ff7p6Mesw521DSbgz3pQqO7OlEadmvG3tdvhbVQ4dkWP8PRDVVYdwvapo1IBVBeCO0nStyeBf0nBFBxMCXBorezS6z0Q/VeuEsIaMUvZ6q9irQXDVRuk4hDUUQbgqptwg4pjFhVujRLa0pfu/XTL/Cp72HGm4UN+yjt29U3oxy1OvooTpbN16hqfRv33N+uOGFQhT2mFcaM3amGkL/D9+V1n/z8lTm7gtdv3zOqKjs2dmpEGLnibooR7zznk0lW+IfbdqSjnhdanp+VUPRRmX6yiV3shwRa+9wflxqR18RzRsz5VLs8/WtYQPGm9JRTXflFsM2Nq6tsLbhnfB/BeILC1G/yO0394Rs+VF7ox7hUMrHh4UfrZedWccoHwiL5QjVeKAp/Jp0pAeUVJkt27+lptbmSoipvtzvmsr25FNsSITDnEyMEGzOeYTXn5i6zQkhMkf7E2usSCbH3FAWmtG3afy1O+rt74c13XJ8ofPTB0ua+t8IOnHpcyBd2GP+BQFwU/YFyKwJAAAAAElFTkSuQmCC', armL: 20, armR: 44, legY: 64, handL: 14, handR: 51, eyes: [30, 35, 11] },
};
for (const k in DOLLS) {
  const D = DOLLS[k]; D.W = 66; D.H = 137; D.ready = false; D.img = new Image();
  D.img.onload = () => {
    const c = document.createElement('canvas'); c.width = D.W; c.height = D.H;
    const g = c.getContext('2d'); g.drawImage(D.img, 0, 0);
    D.base = g.getImageData(0, 0, D.W, D.H); D.part = new Array(D.W * D.H).fill(null);
    const d = D.base.data;
    for (let y = 0; y < D.H; y++) for (let x = 0; x < D.W; x++) {
      const i = y * D.W + x; if (d[i * 4 + 3] < 128) continue;
      let p;
      const [eL, eR, eY] = D.eyes;
      if (y < 22) p = y <= 8 ? 'brain' : (y >= eY - 1 && y <= eY + 1 && x >= eL - 2 && x <= eR + 2) ? 'eyes' : 'head';
      else if (y < D.legY) p = x <= D.armL || x >= D.armR ? 'arms' : 'chest';
      else p = y <= 84 && (x <= D.handL || x >= D.handR) ? 'arms' : 'legs';
      D.part[i] = p;
    }
    // drop stray arm pixels that are not connected to a real arm (hip bulges)
    const seen = new Uint8Array(D.W * D.H);
    for (let i = 0; i < D.W * D.H; i++) {
      if (D.part[i] !== 'arms' || seen[i]) continue;
      const comp = [i], st = [i]; seen[i] = 1;
      while (st.length) { const j = st.pop(), x = j % D.W, y = (j / D.W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= D.W || ny >= D.H) continue; const k = ny * D.W + nx; if (!seen[k] && D.part[k] === 'arms') { seen[k] = 1; st.push(k); comp.push(k); } } }
      if (comp.length < 40) for (const j of comp) D.part[j] = ((j / D.W) | 0) < D.legY ? 'chest' : 'legs';
    }
    D.ready = true;
    if (!$('#termS').hidden) renderPage();
  };
  D.img.src = 'data:image/png;base64,' + D.src;
}
const hexc = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RAMP = {
  0: ['#0b1016', '#1b2533', '#263345', '#3a4a5e'],
  1: ['#1b2533', '#5a6b80', '#8c9bb0', '#c9d3df'],
  2: ['#05090a', '#0b2e2c', '#145650', '#2f9a8a'],
  3: ['#3a4a5e', '#8c9bb0', '#c9d3df', '#ffffff'],
};
const ACC = { 1: '#c9d3df', 2: '#86fadd', 3: '#ff5b82' };
function drawDoll(r) {
  const c = $('#doll'); if (!c) return;
  const DOLL = DOLLS[r.sex === 'f' ? 'f' : 'm'];
  c.width = DOLL.W; c.height = DOLL.H;
  const g = c.getContext('2d');
  if (!DOLL.ready) return;
  const src = DOLL.base.data, out = g.createImageData(DOLL.W, DOLL.H), o = out.data, W = DOLL.W;
  const m = r.mods, ramps = {}; for (const k in RAMP) ramps[k] = RAMP[k].map(hexc);
  const lumOf = (i) => (src[i * 4] * 0.3 + src[i * 4 + 1] * 0.55 + src[i * 4 + 2] * 0.15) / 255;
  const verOf = (p) => p === 'head' ? -1 : p === 'eyes' ? -1 : p === 'brain' ? (m.brain ? m.brain : -1) : m[p] || 0;
  for (let i = 0; i < W * DOLL.H; i++) {
    o[i * 4 + 3] = src[i * 4 + 3] < 128 ? 0 : 255;
    if (!o[i * 4 + 3]) continue;
    const p = DOLL.part[i], L = lumOf(i), skin = src[i * 4] > src[i * 4 + 2] + 30;
    let col = [src[i * 4], src[i * 4 + 1], src[i * 4 + 2]];
    const v = verOf(p);
    if (v >= 0 && !(skin && p !== 'brain') && L > 0.07) {
      const rp = ramps[v]; col = rp[Math.min(3, Math.floor(clamp((L - 0.12) / 0.38, 0, 0.999) * 4))];
    } else if (L <= 0.07) col = [5, 9, 10];
    o[i * 4] = col[0]; o[i * 4 + 1] = col[1]; o[i * 4 + 2] = col[2];
  }
  const set = (x, y, h) => { if (x < 0 || y < 0 || x >= W || y >= DOLL.H) return; const i = y * W + x; if (!o[i * 4 + 3]) return; const c3 = hexc(h); o[i * 4] = c3[0]; o[i * 4 + 1] = c3[1]; o[i * 4 + 2] = c3[2]; };
  // limb details: rivets (V1) or light strips (V2, V3) down the middle of each run of pixels
  for (const p of ['arms', 'legs', 'chest']) {
    const v = m[p]; if (!v) continue;
    for (let y = 0; y < DOLL.H; y++) {
      let x = 0;
      while (x < W) {
        if (DOLL.part[y * W + x] !== p || src[(y * W + x) * 4 + 3] < 128) { x++; continue; }
        let e = x; while (e + 1 < W && DOLL.part[y * W + e + 1] === p && src[(y * W + e + 1) * 4 + 3] >= 128) e++;
        const len = e - x + 1;
        if (len >= 4) {
          if (v === 1) { if (y % 9 === 4 && len >= 5) { set(x + 1, y, ACC[1]); set(e - 1, y, ACC[1]); } }
          else if (p === 'chest') { if (y % 2 === 0 && (y > 26 && y < 56)) { set(x + Math.floor(len * 0.25), y, ACC[v]); set(e - Math.floor(len * 0.25), y, ACC[v]); } }
          else if (y % 2 === 0) set(x + Math.floor(len / 2), y, ACC[v]);
        }
        x = e + 1;
      }
    }
  }
  if (m.eyes) {
    // V1 red lenses in the sockets, V2 a cyan visor bar across both eyes, V3 a pink visor with bright pupils and a temple emitter
    const [eL, eR, eY] = DOLL.eyes, lens = [[eL, eY], [eL + 1, eY], [eR - 1, eY], [eR, eY]];
    if (m.eyes === 1) { for (const [x, y] of lens) { set(x, y, '#e0402c'); set(x, y + 1, '#7a1414'); } }
    else {
      const band = m.eyes === 2 ? '#145650' : '#7a1f3c', glow = m.eyes === 2 ? '#86fadd' : '#ff5b82';
      for (let x = eL - 2; x <= eR + 2; x++) { set(x, eY, band); set(x, eY + 1, band); set(x, eY + 2, '#0b1016'); }
      for (const [x, y] of lens) set(x, y, glow);
      if (m.eyes === 3) { set(eL, eY, '#ffffff'); set(eR, eY, '#ffffff'); set(eR + 3, eY, glow); set(eR + 3, eY + 1, glow); }
    }
  }
  if (m.brain) { const bc = ACC[m.brain]; for (let x = 28; x <= 36; x += 2) set(x, 6, bc); if (m.brain > 1) { set(32, 3, bc); set(32, 4, bc); } }
  if (m.heart) {
    const hc = m.heart === 1 ? '#7a1414' : m.heart === 2 ? '#2f9a8a' : '#ff5b82', hl = m.heart === 1 ? '#e0402c' : m.heart === 2 ? '#86fadd' : '#ffb0c4';
    for (let y = 30; y <= 35; y++) for (let x = 35; x <= 40; x++) set(x, y, (x === 35 || x === 40 || y === 30 || y === 35) ? '#0b1016' : hc);
    set(37, 32, hl); set(38, 32, hl); set(37, 33, hl);
  }
  if (page === 'squad' && sqTab === 'mods') {
    const sel = modSel, mask = (x, y) => x >= 0 && y >= 0 && x < W && y < DOLL.H && (sel === 'heart' ? (x >= 35 && x <= 40 && y >= 30 && y <= 35) : DOLL.part[y * W + x] === sel && src[(y * W + x) * 4 + 3] >= 128);
    const am = hexc('#ffc46b');
    for (let y = 0; y < DOLL.H; y++) for (let x = 0; x < W; x++) {
      if (mask(x, y)) continue;
      if (mask(x - 1, y) || mask(x + 1, y) || mask(x, y - 1) || mask(x, y + 1)) { const i = y * W + x; o[i * 4] = am[0]; o[i * 4 + 1] = am[1]; o[i * 4 + 2] = am[2]; o[i * 4 + 3] = 255; }
    }
  }
  g.putImageData(out, 0, 0);
}

/* ================================================================ per-frame upload */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0), _e = new THREE.Euler(0, 0, 0, 'YXZ');
function setInst(mesh, i, x, y, z, yaw, sc) { _q.setFromAxisAngle(_y, yaw); _s.set(sc, sc, sc); _p.set(x, y, z); _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m); }
function setInstR(mesh, i, x, y, z, yaw, pitch, roll) { _e.set(pitch, yaw, roll, 'YXZ'); _q.setFromEuler(_e); _s.set(1, 1, 1); _p.set(x, y, z); _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m); }
function uploadPeople() {
  const ac = peopleMesh.geometry.attributes;
  let n = 0;
  for (const p of people) {
    if (p.inCar || n >= PMAX) continue;
    setInst(peopleMesh, n, p.x, p.elev || groundY(p.x, p.z), p.z, p.yaw, p.scale);
    ac.iColor.setXYZ(n, p.color[0], p.color[1], p.color[2]);
    ac.iSkin.setXYZ(n, p.skin[0], p.skin[1], p.skin[2]);
    ac.iAnim.setXYZW(n, p.phase, p.walk, p.aim, p.dead ? p.deadT : 0);
    let rim = p.rim;
    if (p.kind === 'cop' && p.fac === 'law' && p.alerted) rim = Math.floor(time * 4 + p.id) % 2 ? [1, 0.15, 0.2] : [0.2, 0.4, 1];
    if (p.stun > 0 && !p.dead) rim = [1, 1, 1];
    if (p.burnT > 0 && !p.dead) { const f = 0.7 + 0.3 * Math.sin(time * 31 + p.id); rim = [2.4 * f, 0.9 * f, 0.15 * f]; }
    ac.iRim.setXYZ(n, rim[0], rim[1], rim[2]);
    ac.iMisc.setXYZW(n, p.umb, p.armed, p.coat, p.flash > 0 ? 1 : 0);
    n++;
  }
  peopleMesh.count = n; peopleMesh.instanceMatrix.needsUpdate = true;
  for (const k of ['iColor', 'iSkin', 'iAnim', 'iRim', 'iMisc']) ac[k].needsUpdate = true;
}
function uploadTinted(mesh, list, fn) {
  const ac = mesh.geometry.attributes; let n = 0;
  for (const it of list) { if (n >= mesh.instanceMatrix.count) break; fn(it, n, ac); n++; }
  mesh.count = n; mesh.instanceMatrix.needsUpdate = true; ac.iColor.needsUpdate = true; ac.iAnim.needsUpdate = true;
}
const CAR_TYPES = ['sedan', 'van', 'police', 'limo', 'spinner', 'jeep', 'truck', 'vtol'];
const WHEELED = { jeep: 1, truck: 1 };
function uploadCars() {
  const by = {}; for (const t of CAR_TYPES) by[t] = [];
  for (const c of cars) if (!c.gone) by[c.model].push(c);
  for (const t of CAR_TYPES) {
    if (t === 'spinner') continue;
    uploadTinted(CARM[t], by[t], (c, i, ac) => {
      if (c.wreck && c.wp == null) { c.wp = Rr(-0.07, 0.07); c.wr = Rr(-0.13, 0.13); }
      const y = c.wreck ? (WHEELED[t] ? -0.14 : -0.3) : WHEELED[t] ? 0 : 0.08 + Math.sin(time * 3 + c.id) * 0.03;
      setInstR(CARM[t], i, c.x, y + (c.alt || 0), c.z, c.yaw, c.wreck ? c.wp : 0, c.wreck ? c.wr : 0);
      const f = c.flash > 0 ? 2.5 : 1; ac.iColor.setXYZ(i, c.color[0] * f, c.color[1] * f, c.color[2] * f);
      const g = c.hackT > 0 ? [0.4, 2, 1.7] : c.stall > 0 && !c.wreck ? [0.15, 0.15, 0.15] : c.glow;
      ac.iAnim.setXYZW(i, g[0], g[1], g[2], c.wreck ? 1 + clamp(c.burn / 14, 0, 1) : 0);
    });
  }
  uploadTinted(CARM.spinner, flyers, (f, i, ac) => {
    const x = f.ax ? f.pos : f.lane, z = f.ax ? f.lane : f.pos, yaw = f.ax ? (f.speed > 0 ? Math.PI / 2 : -Math.PI / 2) : (f.speed > 0 ? 0 : Math.PI);
    setInst(CARM.spinner, i, x, f.y + Math.sin(time + f.ph) * 0.3, z, yaw, 1);
    ac.iColor.setXYZ(i, f.color[0], f.color[1], f.color[2]); ac.iAnim.setXYZW(i, f.glow[0], f.glow[1], f.glow[2], 0);
  });
  uploadTinted(shadowMesh, flyers, (f, i, ac) => {
    const x = f.ax ? f.pos : f.lane, z = f.ax ? f.lane : f.pos;
    setInst(shadowMesh, i, x, groundY(x, z) + 0.02, z, f.ax ? Math.PI / 2 : 0, 3.4 - f.y * 0.03);
    ac.iColor.setXYZ(i, 0, 0, 0); ac.iAnim.setXYZW(i, 1, f.ph, 0, 0);
  });
  const drum = (b, i, ac, mesh) => {
    setInst(mesh, i, b.x, groundY(b.x, b.z), b.z, 0, 1);
    const f = b.flash > 0 ? 2.2 : 1; ac.iColor.setXYZ(i, b.col[0] * f, b.col[1] * f, b.col[2] * f);
    const blink = b.fuse > 0 ? (Math.floor(time * 10) % 2 ? 1 : 0.2) : 0.35; ac.iAnim.setXYZW(i, 1.8 * blink, 0.35 * blink, 0.05, 0);
  };
  uploadTinted(barrelMesh, barrels.filter((b) => !b.dead && !b.big), (b, i, ac) => drum(b, i, ac, barrelMesh));
  uploadTinted(tankMesh, barrels.filter((b) => !b.dead && b.big), (b, i, ac) => drum(b, i, ac, tankMesh));
  uploadTinted(turretMesh, turrets, (t, i, ac) => {
    setInst(turretMesh, i, t.x, 0.15, t.z, t.yaw, 1);
    const f = t.flash > 0 ? 2 : 1; ac.iColor.setXYZ(i, 0.35 * f, 0.36 * f, 0.4 * f);
    const pulse = 0.75 + 0.25 * Math.sin(time * 6 + t.x), g = t.friendly > 0 ? [0.3 * pulse * 2, 1 * pulse * 2, 0.85 * pulse * 2] : [2.2 * pulse, 0.15, 0.25]; ac.iAnim.setXYZW(i, g[0], g[1], g[2], t.dead ? 1 : 0);
  });
  uploadTinted(decalMesh, decals, (d, i, ac) => { setInst(decalMesh, i, d.x, d.y, d.z, d.yaw, d.s); ac.iColor.setXYZ(i, d.col[0], d.col[1], d.col[2]); ac.iAnim.setXYZW(i, d.ty || 0, d.seed || 0, 0, 0); });
  uploadTinted(itemMesh, pickups, (it, i, ac) => {
    setInst(itemMesh, i, it.x, groundY(it.x, it.z) + 0.35 + Math.sin(time * 2.5 + it.spin) * 0.06, it.z, it.spin * 0.8, it.id === 'launcher' || it.id === 'minigun' ? 1.8 : 1.4);
    ac.iColor.setXYZ(i, 0.3, 0.31, 0.34);
    const g = SAVE.avail.includes(it.id) ? [0.3, 1, 0.85] : [1, 0.62, 0.18]; ac.iAnim.setXYZW(i, g[0], g[1], g[2], 0);
  });
  trainCars.forEach((m, i) => { m.position.set(WORLD.rail, 9.0, train.z - i * 11.2); m.updateMatrixWorld(); });
  for (const gt of WORLD.gates) if (gt.mesh) { gt.mesh.position.set(gt.x0 + gt.open * (gt.x1 - gt.x0) * 0.92, 0, gt.z); gt.mesh.updateMatrixWorld(); }
}
function uploadFX() {
  const n = Math.min(parts.length, PART_MAX);
  for (let i = 0; i < n; i++) {
    const p = parts[i], f = p.life / p.max;
    partPos[i * 3] = p.x; partPos[i * 3 + 1] = p.y; partPos[i * 3 + 2] = p.z;
    partCol[i * 3] = p.c[0] * f; partCol[i * 3 + 1] = p.c[1] * f; partCol[i * 3 + 2] = p.c[2] * f;
    partSize[i] = p.size * (0.5 + 0.5 * f);
  }
  partGeo.setDrawRange(0, n);
  partGeo.attributes.position.needsUpdate = true; partGeo.attributes.aCol.needsUpdate = true; partGeo.attributes.aSize.needsUpdate = true;
  let m = 0;
  const line = (x0, y0, z0, x1, y1, z1, c) => { if (m >= TR_MAX) return; trPos.set([x0, y0, z0, x1, y1, z1], m * 6); trCol.set([c[0], c[1], c[2], c[0], c[1], c[2]], m * 6); m++; };
  for (const t of tracers) { const f = t.life / t.max; line(t.x0, t.y0, t.z0, t.x1, t.y1, t.z1, [t.c[0] * f, t.c[1] * f, t.c[2] * f]); }
  for (const t of WORLD.towers) {
    if (!t.spotOn) continue;
    const [lx, ly, lz] = t.lamp, bc = [0.16, 0.17, 0.2];
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; line(lx, ly, lz, t.spot[0] + Math.cos(a) * 2.6, 0.1, t.spot[1] + Math.sin(a) * 2.6, bc); }
    line(lx, ly, lz, t.spot[0], 0.1, t.spot[1], [0.3, 0.32, 0.36]);
  }
  trGeo.setDrawRange(0, m * 2); trGeo.attributes.position.needsUpdate = true; trGeo.attributes.aCol.needsUpdate = true;
}
const lightList = [];
function uploadLights() {
  lightList.length = 0;
  const cx = camT.x, cz = camT.z;
  for (const a of agents) { if (a.dead || a.inCar) continue; lightList.push([a.x, (a.elev || 0) + 2.6, a.z + 0.4, 4, 0.5, 0.52, 0.56, -0.5]); }
  for (const t of turrets) { if (t.dead) continue; const dx = t.x - cx, dz = t.z - cz, k = 0.7 + 0.3 * Math.sin(time * 6 + t.x); lightList.push(t.friendly > 0 ? [t.x, 2.2, t.z, 5, 0.3 * k, 1.1 * k, 0.95 * k, dx * dx + dz * dz - 300] : [t.x, 2.2, t.z, 5.5, 1.8 * k, 0.15 * k, 0.2 * k, dx * dx + dz * dz - 300]); }
  for (const f of fires) { const dx = f.x - cx, dz = f.z - cz, k = clamp(f.life / 2.5, 0, 1) * (0.8 + 0.2 * Math.sin(time * 19 + f.x)); lightList.push([f.x, 1.4, f.z, 4 + f.r * 2.5, 2.6 * k, 1.1 * k, 0.3 * k, dx * dx + dz * dz - 600]); }
  for (const p of people) if (p.burnT > 0 && !p.dead) { const dx = p.x - cx, dz = p.z - cz; lightList.push([p.x, 1.4, p.z, 5, 2.2, 0.9, 0.25, dx * dx + dz * dz - 500]); }
  for (const d of dyn) { const f = d.life / d.max; lightList.push([d.x, d.y, d.z, d.r, d.c[0] * f, d.c[1] * f, d.c[2] * f, -1]); }
  for (const it of pickups) { const dx = it.x - cx, dz = it.z - cz, d2 = dx * dx + dz * dz; if (d2 > 45 * 45) continue; const nw = it.id === 'case' || !SAVE.avail.includes(it.id), k = 0.55 + 0.25 * Math.sin(time * 4 + it.spin); lightList.push([it.x, 0.9, it.z, 3.2, (nw ? 1.4 : 0.3) * k, (nw ? 0.85 : 1.1) * k, (nw ? 0.25 : 0.95) * k, d2 - 200]); }
  for (const t of WORLD.towers) if (t.spotOn) { const dx = t.spot[0] - cx, dz = t.spot[1] - cz; lightList.push([t.spot[0], 2.4, t.spot[1], 7.5, 2.2, 2.3, 2.5, -0.8]); lightList.push([t.lamp[0], t.lamp[1], t.lamp[2], 5, 1.2, 1.25, 1.35, dx * dx + dz * dz]); }
  for (const L of WORLD.lights) {
    if (L.off > 0) continue;
    const dx = L.x - cx, dz = L.z - cz, d2 = dx * dx + dz * dz; if (d2 > 70 * 70) continue;
    let k = 1; if (L.kind === 'neon' && Math.sin(time * 23 + L.x) > 0.995) k = 0.3;
    lightList.push([L.x, L.y, L.z, L.r, L.c[0] * k, L.c[1] * k, L.c[2] * k, d2]);
  }
  for (const c of cars) {
    if (c.gone) continue;
    const dx = c.x - cx, dz = c.z - cz, d2 = dx * dx + dz * dz; if (d2 > 50 * 50) continue;
    if (c.wreck) { if (c.burn > 0) { const f = clamp(c.burn / 6, 0, 1) * (0.75 + 0.25 * Math.sin(time * 17 + c.id)); lightList.push([c.x, 1.6, c.z, 10, 2.2 * f, 0.95 * f, 0.25 * f, d2 - 50]); } continue; }
    if (c.parked && c.driver !== 'player') continue;
    if (c.stall > 0) continue;
    lightList.push([c.x + Math.sin(c.yaw) * 3.5, 0.9, c.z + Math.cos(c.yaw) * 3.5, 7, 0.75, 0.7, 0.55, d2 + 300]);
    if (c.model === 'police') { const b = Math.floor(time * 5) % 2; lightList.push([c.x, 2, c.z, 9, b ? 1.6 : 0.2, 0.2, b ? 0.3 : 1.8, d2 + 100]); }
  }
  if (WORLD.kind === 'city') for (const t of trainCars) { const dz = t.position.z - cz, dx = t.position.x - cx; if (dx * dx + dz * dz < 60 * 60) lightList.push([t.position.x, 8.5, t.position.z, 10, 0.3, 1, 0.85, dx * dx + dz * dz]); }
  lightList.sort((a, b) => a[7] - b[7]);
  const n = Math.min(NL, lightList.length);
  for (let i = 0; i < n; i++) { const l = lightList[i]; U.uLP.value[i].set(l[0], l[1], l[2], l[3]); U.uLC.value[i].set(l[4], l[5], l[6]); }
  U.uLN.value = n;
  for (let i = 0; i < 4; i++) { const b = blackouts[i]; if (b) U.uBlack.value[i].set(b.x, b.z, b.r, clamp(b.t, 0, 1)); else U.uBlack.value[i].set(0, 0, 0, 0); }
}
function uploadCut() {
  let n = 0;
  if (CFG.cut) for (const a of agents) {
    if (a.dead || a.inCar || n >= 4) continue;
    _v.set(a.x, 1.0, a.z).project(snapCam);
    _p.set(a.x, 1.0, a.z).applyMatrix4(snapCam.matrixWorldInverse);
    U.uCut.value[n].set((_v.x * 0.5 + 0.5) * LW, (_v.y * 0.5 + 0.5) * LH, -_p.z, 4.2 * PPU * 0.55 + 10);
    n++;
  }
  for (; n < 4; n++) U.uCut.value[n].set(0, 0, 0, 0);
}
const LVC = { civil: [0.53, 0.98, 0.87], sec: [1, 0.77, 0.42], mil: [1, 0.36, 0.51] };
let hackList = [];
function uploadVec() {
  let n = 0;
  const put = (x, y, z, c, s, sh) => { if (n >= VN_MAX) return; vnPos[n * 3] = x; vnPos[n * 3 + 1] = y; vnPos[n * 3 + 2] = z; vnCol[n * 3] = c[0]; vnCol[n * 3 + 1] = c[1]; vnCol[n * 3 + 2] = c[2]; vnSize[n] = s; vnShape[n] = sh; n++; };
  for (const u of WORLD.uplinks) {
    const hv = hover && hover.uplink === u;
    put(u.x, 1.2, u.z, u.burn > 0 ? [0.5, 0.12, 0.18] : u.agent ? [1, 1, 1] : [0.53, 0.98, 0.87], hv ? 24 : u.agent ? 18 : 14, 1);
  }
  for (const nd of hackList) {
    const hv = hover && !hover.uplink && hover.label === nd.label;
    const inR = !!connectedUplinkFor(nd);
    let c = (nd.cd || 0) > 0 ? [0.3, 0.4, 0.4] : LVC[nd.level];
    if (!inR) c = c.map((v) => v * 0.4);
    put(nd.x, nd.y, nd.z, c, hv ? 22 : nd.type === 'car' ? 10 : 13, 0);
  }
  for (const p of people) {
    if (p.dead || p.inCar) continue;
    const g = group(p); const c = p.kind === 'agent' ? [0.6, 1, 0.92] : g === 'P' ? [0.4, 0.9, 0.8] : g === 'L' ? [0.4, 0.6, 1] : g === 'C' ? [1, 0.36, 0.51] : [0.2, 0.45, 0.4];
    put(p.x, (p.elev || 0) + 1, p.z, c, p.kind === 'agent' ? 9 : g === 'N' ? 4 : 7, p.kind === 'agent' ? 1 : 2);
  }
  vnGeo.setDrawRange(0, n);
  for (const k of ['position', 'aCol', 'aSize', 'aShape']) vnGeo.attributes[k].needsUpdate = true;
}

/* ================================================================ overlay (2D vector UI) */
function bracket(x, y, w, h, l, col) {
  ctx.strokeStyle = col; ctx.beginPath();
  const L = l * DPR, x0 = Math.round(x - w / 2) + 0.5, y0 = Math.round(y - h / 2) + 0.5, x1 = Math.round(x + w / 2) + 0.5, y1 = Math.round(y + h / 2) + 0.5;
  ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0); ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
  ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1); ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L); ctx.stroke();
}
function label(t, x, y, col, align) { ctx.fillStyle = col; ctx.textAlign = align || 'center'; ctx.fillText(t, Math.round(x), Math.round(y)); }
function groundRing(x, z, r, col, dash, y) {
  const s = [0, 0, 0]; ctx.strokeStyle = col; if (dash) ctx.setLineDash(dash); ctx.beginPath();
  for (let k = 0; k <= 32; k++) { const a = k / 32 * TAU; toScreen(x + Math.cos(a) * r, y || 0.1, z + Math.sin(a) * r, s); if (k) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }
  ctx.stroke(); if (dash) ctx.setLineDash([]);
}
function drawOverlay() {
  ctx.clearRect(0, 0, SW, SH);
  if (!MS || !MS.def) return;
  ctx.lineWidth = Math.max(1, Math.round(DPR)); ctx.font = '600 ' + (12 * DPR) + 'px "Chakra Petch", system-ui, sans-serif'; ctx.textBaseline = 'middle';
  const PH = 'rgba(134,250,221,', SG = 'rgba(255,91,130,', AM = 'rgba(255,196,107,';
  const s0 = [0, 0, 0], s1 = [0, 0, 0];
  const camsVisible = hackT > 0.05 || WORLD.cams.some((c) => c.spot);
  if (camsVisible) for (const c of WORLD.cams) {
    if (c.off > 0 && hackT < 0.05) continue;
    if (!c.spot && hackT < 0.05) continue;
    const col = c.off > 0 ? PH + (0.15 * hackT) + ')' : c.spot ? SG + '0.75)' : PH + (0.45 * hackT) + ')';
    ctx.strokeStyle = col; ctx.beginPath();
    toScreen(c.x, 0.2, c.z, s0); ctx.moveTo(s0[0], s0[1]);
    for (let k = -4; k <= 4; k++) { const a = c.yaw + k / 4 * 0.5; toScreen(c.x + Math.sin(a) * 15, 0.2, c.z + Math.cos(a) * 15, s1); ctx.lineTo(s1[0], s1[1]); }
    ctx.closePath(); ctx.stroke();
  }
  for (const t of WORLD.towers) if (t.spotOn) groundRing(t.spot[0], t.spot[1], 3.4, AM + '0.35)', [3 * DPR, 3 * DPR]);
  if (state === 'play') drawCones(PH, SG, AM);
  if (hackT > 0.05) {
    for (const u of WORLD.uplinks) {
      const on = u.agent && !u.agent.dead;
      groundRing(u.x, u.z, u.r, (on ? PH + (0.55 * hackT) : u.burn > 0 ? SG + (0.25 * hackT) : PH + (0.16 * hackT)) + ')', [5 * DPR, 5 * DPR]);
      toScreen(u.x, 1.2, u.z, s0);
      label(u.label + (u.burn > 0 ? ' // BURNED' : on ? ' // ' + u.agent.name : ''), s0[0], s0[1] + 16 * DPR, (u.burn > 0 ? SG : PH) + (0.9 * hackT) + ')');
      if (on || u.trace > 0.5) {
        const w = 44 * DPR; ctx.fillStyle = SG + (0.25 * hackT) + ')'; ctx.fillRect(s0[0] - w / 2, s0[1] + 24 * DPR, w, 3 * DPR);
        ctx.fillStyle = SG + (0.95 * hackT) + ')'; ctx.fillRect(s0[0] - w / 2, s0[1] + 24 * DPR, w * clamp(u.trace / 100, 0, 1), 3 * DPR);
      }
    }
  }
  if (hackJob) {
    const j = hackJob; toScreen(j.n.ref && j.n.ref.wreck !== undefined ? j.n.ref.x : j.n.x, j.n.y, j.n.ref && j.n.ref.wreck !== undefined ? j.n.ref.z : j.n.z, s0);
    ctx.strokeStyle = PH + '0.95)'; ctx.lineWidth = 2 * DPR; ctx.beginPath(); ctx.arc(s0[0], s0[1], 14 * DPR, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(j.t / j.dur, 0, 1)); ctx.stroke(); ctx.lineWidth = Math.max(1, Math.round(DPR));
    toScreen(j.a.x, 2.3, j.a.z, s1);
    ctx.strokeStyle = PH + '0.5)'; ctx.setLineDash([2 * DPR, 4 * DPR]); ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s0[0], s0[1]); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const [a, t] of beams) {
    toScreen(a.x, 1.4, a.z, s0); toScreen(t.x, 1.6, t.z, s1);
    ctx.strokeStyle = SG + '0.95)'; ctx.beginPath(); ctx.moveTo(s0[0], s0[1]);
    for (let k = 1; k < 8; k++) { const f = k / 8; ctx.lineTo(lerp(s0[0], s1[0], f) + Rr(-4, 4) * DPR, lerp(s0[1], s1[1], f) + Rr(-4, 4) * DPR); }
    ctx.lineTo(s1[0], s1[1]); ctx.stroke();
    bracket(s1[0], s1[1], 18 * DPR, 18 * DPR, 4, SG + '0.95)');
  }
  for (const p of people) {
    if (p.dead || p.inCar) continue;
    const gy = p.elev || groundY(p.x, p.z);
    if (p.fac === 'follower') { toScreen(p.x, gy + 2.2, p.z, s0); ctx.strokeStyle = PH + '0.8)'; ctx.beginPath(); ctx.moveTo(s0[0] - 3 * DPR, s0[1] - 2 * DPR); ctx.lineTo(s0[0], s0[1] + 1 * DPR); ctx.lineTo(s0[0] + 3 * DPR, s0[1] - 2 * DPR); ctx.stroke(); continue; }
    if (p.fac !== 'corp' && p.fac !== 'law') continue;
    toScreen(p.x, gy + 2.3, p.z, s0);
    if (p.alerted) {
      ctx.font = (20 * DPR) + 'px "Jersey 10", monospace'; label('!', s0[0], s0[1] - 4 * DPR, SG + '0.95)'); ctx.font = '600 ' + (12 * DPR) + 'px "Chakra Petch", system-ui, sans-serif';
    } else if (p.sus > 0.04) {
      ctx.font = (20 * DPR) + 'px "Jersey 10", monospace'; label('?', s0[0], s0[1] - 4 * DPR, AM + (0.4 + 0.6 * p.sus) + ')'); ctx.font = '600 ' + (12 * DPR) + 'px "Chakra Petch", system-ui, sans-serif';
      const w = 12 * DPR; ctx.fillStyle = AM + '0.25)'; ctx.fillRect(s0[0] - w / 2, s0[1] + 5 * DPR, w, 2 * DPR); ctx.fillStyle = AM + '0.95)'; ctx.fillRect(s0[0] - w / 2, s0[1] + 5 * DPR, w * p.sus, 2 * DPR);
    }
    if (p.hp < p.maxHp && p !== target) { const w = 16 * DPR; ctx.fillStyle = SG + '0.25)'; ctx.fillRect(s0[0] - w / 2, s0[1] + 9 * DPR, w, 2 * DPR); ctx.fillStyle = SG + '0.9)'; ctx.fillRect(s0[0] - w / 2, s0[1] + 9 * DPR, w * p.hp / p.maxHp, 2 * DPR); }
  }
  for (const it of pickups) {
    toScreen(it.x, groundY(it.x, it.z) + 0.3, it.z, s0);
    if (s0[0] < 0 || s0[1] < 0 || s0[0] > SW || s0[1] > SH) continue;
    const nw = it.id === 'case' || !SAVE.avail.includes(it.id), col = (nw ? AM : PH) + '0.85)';
    label(it.id === 'case' ? 'DATA CASE' : WEAPONS[it.id].name + (nw ? ' // NEW' : ''), s0[0], s0[1] - 12 * DPR, col);
  }
  for (const a of agents) {
    if (a.dead) continue;
    const ax = a.inCar ? a.inCar.x : a.x, az = a.inCar ? a.inCar.z : a.z, gy = a.elev || groundY(ax, az);
    toScreen(ax, gy, az, s0); toScreen(ax, gy + 2.1 * a.scale, az, s1);
    const h = Math.abs(s0[1] - s1[1]), cx = s0[0], cy = (s0[1] + s1[1]) / 2;
    const sel = selected.has(a);
    if (sel) bracket(cx, cy, h * 0.75 + 6 * DPR, h + 6 * DPR, 4, PH + '0.95)');
    const segs = 10, sw = 2 * DPR, gap = 1 * DPR, tot = segs * sw + (segs - 1) * gap, fill = Math.ceil(a.hp / a.maxHp * segs);
    for (let i = 0; i < segs; i++) { ctx.fillStyle = i < fill ? (a.hp / a.maxHp < 0.3 ? SG + '0.95)' : PH + (sel ? '0.95)' : '0.55)')) : 'rgba(134,250,221,0.12)'; ctx.fillRect(Math.round(cx - tot / 2 + i * (sw + gap)), Math.round(s1[1] - 7 * DPR), sw, 3 * DPR); }
    if (a.reloadT > 0) { const w = WEAPONS[a.slots[a.cur]]; ctx.fillStyle = AM + '0.9)'; ctx.fillRect(Math.round(cx - tot / 2), Math.round(s1[1] - 3 * DPR), tot * (1 - a.reloadT / w.reload), 1 * DPR); }
    if (sel) label(String(a.idx + 1), cx, s1[1] - 15 * DPR, PH + '0.95)');
    if (a.link) label('UPLINK', cx, s0[1] + 9 * DPR, PH + '0.9)');
    else if (a.jackTo && a.linkT > 0) label('CONNECTING ' + Math.round(a.linkT / 3 * 100) + '%', cx, s0[1] + 9 * DPR, PH + '0.9)');
    if (a.ftarget && !a.ftarget.dead && !a.ftarget.wreck) {
      const t = a.ftarget; toScreen(t.x, 1, t.z, s0);
      ctx.save(); ctx.translate(s0[0], s0[1]); ctx.rotate(time * 2); ctx.strokeStyle = SG + '0.9)'; ctx.strokeRect(-6 * DPR, -6 * DPR, 12 * DPR, 12 * DPR); ctx.restore();
    }
  }
  for (const m of moveMarks) {
    const f = m.t / 0.7;
    if (m.ent) { toScreen(m.ent.x, 1, m.ent.z, s0); } else toScreen(m.x, groundY(m.x, m.z), m.z, s0);
    const r = (6 + 14 * f) * DPR;
    ctx.strokeStyle = (m.c === 's' ? SG : PH) + f.toFixed(2) + ')';
    ctx.beginPath(); ctx.moveTo(s0[0], s0[1] - r); ctx.lineTo(s0[0] + r, s0[1]); ctx.lineTo(s0[0], s0[1] + r); ctx.lineTo(s0[0] - r, s0[1]); ctx.closePath(); ctx.stroke();
  }
  const edge = (x, y, col, txt) => {
    const mm = 40 * DPR, cx = SW / 2, cy = SH / 2;
    if (x > mm && x < SW - mm && y > mm && y < SH - mm) return false;
    const dx = x - cx, dy = y - cy, k = Math.min((SW / 2 - mm) / Math.abs(dx || 1), (SH / 2 - mm) / Math.abs(dy || 1));
    const ex = cx + dx * k, ey = cy + dy * k, a = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(-8 * DPR, -6 * DPR); ctx.lineTo(4 * DPR, 0); ctx.lineTo(-8 * DPR, 6 * DPR); ctx.stroke(); ctx.restore();
    label(txt, ex - Math.cos(a) * 26 * DPR, ey - Math.sin(a) * 14 * DPR, col);
    return true;
  };
  const sc = squadCenter(), k = MS.objs[0];
  const tp = targetPos();
  if (k.st === 'open' && tp && !(target.gone)) {
    const ty = target.inCar ? 1 : (target.elev || 0) + 1;
    toScreen(tp[0], ty, tp[1], s0); const d = Math.round(Math.hypot(tp[0] - sc[0], tp[1] - sc[1]));
    const nm = MS.def.id === 'courier' ? (pickups.some((p) => p.id === 'case') ? 'DATA CASE' : MS.courierOut ? 'COURIER' : 'COURIER VAN') : MS.def.id === 'halden' ? 'HALDEN' : MS.def.spotLabel ? (target && target.inCar && target.inCar.model === 'vtol' ? MS.def.spotLabel + ' // IN VTOL' : MS.def.spotLabel) : WORLD.kind === 'city' ? 'VARGA' : 'RUSK';
    if (!edge(s0[0], s0[1], SG + '0.95)', 'TGT ' + d + 'M')) {
      const big = (!!target.model && !MS.courierOut && !MS.caseDropped && !(MS.vargaP && !MS.vargaP.inCar)) || target.inCar;
      bracket(s0[0], s0[1], (big ? 46 : 26) * DPR, (big ? 30 : 34) * DPR, 6, SG + '0.95)'); label('TGT // ' + nm + (target.armorOff > 0 ? ' // ARMOUR DOWN ' + Math.ceil(target.armorOff) + 'S' : '') + '  ' + d + 'M', s0[0], s0[1] - 24 * DPR, SG + '0.95)');
      const w = 40 * DPR, hp = target.hp / target.maxHp; ctx.fillStyle = SG + '0.25)'; ctx.fillRect(s0[0] - w / 2, s0[1] + 20 * DPR, w, 2 * DPR); ctx.fillStyle = SG + '0.95)'; ctx.fillRect(s0[0] - w / 2, s0[1] + 20 * DPR, w * hp, 2 * DPR);
    }
  } else if (k.st !== 'open' && state === 'play') {
    const [px, pz] = extractPos(); toScreen(px, 0.3, pz, s0);
    const d = Math.round(Math.hypot(px - sc[0], pz - sc[1]));
    if (!edge(s0[0], s0[1], PH + '0.95)', 'EXTRACT ' + d + 'M')) {
      if (WORLD.kind === 'city') {
        ctx.strokeStyle = PH + '0.9)'; ctx.beginPath();
        for (const [dx, dz] of [[-5, -5], [5, -5], [5, 5], [-5, 5]]) { toScreen(px + dx, 0.3, pz + dz, s1); ctx.lineTo(s1[0], s1[1]); }
        ctx.closePath(); ctx.stroke();
      } else groundRing(px, pz, 6.5, PH + '0.8)', [6 * DPR, 4 * DPR]);
      label(WORLD.kind === 'city' ? 'EXTRACT' : 'EXTRACT // VAN', s0[0], s0[1] - 30 * DPR, PH + '0.95)');
    }
  }
  if (hackT > 0.05 && hover) {
    toScreen(hover.x, hover.y, hover.z, s0);
    bracket(s0[0], s0[1], 30 * DPR, 30 * DPR, 6, 'rgba(255,255,255,' + hackT + ')');
    label(hover.uplink ? hover.uplink.label : hover.label, s0[0] + 22 * DPR, s0[1] - 10 * DPR, 'rgba(255,255,255,' + hackT + ')', 'left');
  }
  if (holdFire) {
    const mx = Math.round(mouse[0]) + 0.5, my = Math.round(mouse[1]) + 0.5, r = 9 * DPR;
    ctx.strokeStyle = SG + '0.95)'; ctx.beginPath();
    ctx.moveTo(mx - r * 1.8, my); ctx.lineTo(mx - r * 0.6, my); ctx.moveTo(mx + r * 0.6, my); ctx.lineTo(mx + r * 1.8, my);
    ctx.moveTo(mx, my - r * 1.8); ctx.lineTo(mx, my - r * 0.6); ctx.moveTo(mx, my + r * 0.6); ctx.lineTo(mx, my + r * 1.8); ctx.stroke();
    ctx.strokeRect(mx - r, my - r, r * 2, r * 2);
    if (aimLock && !aimLock.dead && !aimLock.wreck) { const s1 = [0, 0, 0]; toScreen(aimLock.x, (aimLock.elev || groundY(aimLock.x, aimLock.z)) + 1, aimLock.z, s1); bracket(s1[0], s1[1], 22 * DPR, 30 * DPR, 6, SG + '0.95)'); }
  }
  if (ptr && ptr.drag && !ptr.touch && ptr.b === 0 && !hackOn) {
    ctx.strokeStyle = PH + '0.9)'; ctx.setLineDash([4 * DPR, 3 * DPR]);
    ctx.strokeRect(Math.min(ptr.x0, ptr.x) + 0.5, Math.min(ptr.y0, ptr.y) + 0.5, Math.abs(ptr.x - ptr.x0), Math.abs(ptr.y - ptr.y0)); ctx.setLineDash([]);
  }
}

/* ================================================================ frame */
function step(dt) {
  time += dt;
  for (const p of people) updatePerson(p, dt);
  for (const c of cars) updateCar(c, dt);
  for (const t of turrets) updateTurret(t, dt);
  updateRockets(dt); updateParticles(dt); updateAmbient(dt); updateDirector(dt); updateFires(dt); updateBarrels(dt);
  if (state === 'play') updateMission(dt);
  if (people.length > PMAX - 20) { const i = people.findIndex((p) => p.dead && p.kind !== 'agent' && p !== target); if (i >= 0) people.splice(i, 1); }
}
function stepAttract(dt) {
  time += dt;
  for (const p of people) updatePerson(p, dt);
  for (const c of cars) updateCar(c, dt);
  updateParticles(dt); updateAmbient(dt); updateFires(dt);
}
function renderFrame() {
  computeCams();
  U.uTime.value = time; U.uRain.value = CFG.rain * WX.rain;
  uploadLights(); uploadPeople(); uploadCars(); uploadFX(); uploadCut();
  renderer.setRenderTarget(RT.scene); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
  renderer.render(scene, snapCam);
  M_BR.uniforms.tC.value = RT.scene.texture[0]; M_BR.uniforms.uTh.value = 1.0; pass(M_BR, RT.b1);
  M_BLUR.uniforms.tI.value = RT.b1.texture; M_BLUR.uniforms.uDir.value.set(1 / RT.b1.width, 0); pass(M_BLUR, RT.b2);
  M_BLUR.uniforms.tI.value = RT.b2.texture; M_BLUR.uniforms.uDir.value.set(0, 1 / RT.b1.height); pass(M_BLUR, RT.b1);
  M_COPY.uniforms.tI.value = RT.b1.texture; pass(M_COPY, RT.b3);
  M_BLUR.uniforms.tI.value = RT.b3.texture; M_BLUR.uniforms.uDir.value.set(1 / RT.b3.width, 0); pass(M_BLUR, RT.b4);
  M_BLUR.uniforms.tI.value = RT.b4.texture; M_BLUR.uniforms.uDir.value.set(0, 1 / RT.b3.height); pass(M_BLUR, RT.b3);
  const cu = M_COMP.uniforms;
  cu.tC.value = RT.scene.texture[0]; cu.tN.value = RT.scene.texture[1]; cu.tD.value = RT.scene.depthTexture;
  cu.uRes.value.set(LW, LH); cu.uFr.value.set(snapCam.left, snapCam.right, snapCam.bottom, snapCam.top);
  cu.uNear.value = snapCam.near; cu.uFar.value = snapCam.far; cu.uVI.value.copy(snapCam.matrixWorld);
  cu.uUpV.value.set(0, 1, 0).transformDirection(snapCam.matrixWorldInverse);
  cu.uOut.value = CFG.outlines ? 1 : 0; cu.uRefl.value = CFG.refl * WX.wet; cu.uDith.value = CFG.dither; cu.uQ.value = CFG.quant; cu.uLevels.value = CFG.levels;
  cu.uHack.value = hackT; cu.uExp.value = CFG.exposure;
  pass(M_COMP, RT.pix);
  if (U.uRain.value > 0.001) { renderer.setRenderTarget(RT.pix); renderer.render(fxScene, snapCam); }
  const fu = M_FIN.uniforms;
  fu.tP.value = RT.pix.texture; fu.tB1.value = RT.b1.texture; fu.tB2.value = RT.b3.texture;
  fu.uLow.value.set(LW, LH); fu.uS.value = S; fu.uOff.value.copy(OFF); fu.uM.value = MG; fu.uScreen.value.set(SW, SH);
  fu.uBloom.value = CFG.bloom; fu.uCrt.value = REDUCED ? CFG.crt * 0.5 : CFG.crt; fu.uFlash.value = 0; fu.uHack.value = hackT;
  renderer.setRenderTarget(null); pass(M_FIN, null);
  HK.value = hackT;
  if (hackT > 0.01) { uploadVec(); renderer.clearDepth(); renderer.render(vecScene, vecCam); }
  drawOverlay();
}
let last = performance.now(), fpsAcc = 0, fpsN = 0, hudAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(0.25, (now - last) / 1000);
  const rdt = Math.min(0.05, real); last = now;
  fpsAcc += (now - (frame.prev || now)) / 1000; frame.prev = now; fpsN++; if (fpsAcc > 0.5) { $('#fps').textContent = Math.round(fpsN / fpsAcc) + ' FPS'; fpsAcc = 0; fpsN = 0; }
  hackT = clamp(hackT + (hackOn ? 1 : -1) * real * 4, 0, 1);
  if (INTRO.on) introTick(real);
  timeScale = paused && state === 'play' ? 0 : hackOn ? 0.8 : 1;
  const dt = rdt * timeScale;
  beams = [];
  const playing = state === 'play' || state === 'won' || state === 'lost';
  if (!playing) { stepAttract(rdt); if (!INTRO.on) camYaw += rdt * 0.04; camYawTo = camYaw; }
  else {
    if (dt > 0) { step(dt); noiseTick(dt); }
    tipTick(rdt);
    const sp = 26 * rdt * (10 / PPU);
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    if (keys.has('w') || keys.has('arrowup')) { camT.x += fx * sp; camT.z += fz * sp; }
    if (keys.has('s') || keys.has('arrowdown')) { camT.x -= fx * sp; camT.z -= fz * sp; }
    if (keys.has('a') || keys.has('arrowleft')) { camT.x -= rx * sp; camT.z -= rz * sp; }
    if (keys.has('d') || keys.has('arrowright')) { camT.x += rx * sp; camT.z += rz * sp; }
    camYaw += angDiff(camYaw, camYawTo) * Math.min(1, rdt * 9);
    if (Math.abs(angDiff(camYaw, camYawTo)) < 0.002) camYaw = camYawTo;
  }
  { const b = LEVEL ? LEVEL.bounds : [0, 0, GW, GW]; camT.x = clamp(camT.x, b[0] - 6, b[2] + 6); camT.z = clamp(camT.z, b[1] - 6, b[3] + 6); }
  shake = Math.max(0, shake - rdt * 2.5);
  if (!holdFire) aimLock = null;
  if (holdFire && state === 'play' && !hackOn) {
    const g = aimAt(mouse[0], mouse[1]);
    for (const a of selAlive()) { if (a.inCar || a.link || a.jackTo || isJack(a)) continue; a.fpoint = g; a.fpointT = time + 0.12; a.ftarget = null; }
  }
  if (hackOn && playing) {
    hackList = hackables();
    let best = null, bd = 18 * DPR; const s = [0, 0, 0];
    for (const u of WORLD.uplinks) { toScreen(u.x, 1.2, u.z, s); const d = Math.hypot(s[0] - mouse[0], s[1] - mouse[1]); if (d < bd) { bd = d; best = { uplink: u, x: u.x, y: 1.2, z: u.z }; } }
    for (const n of hackList) { toScreen(n.x, n.y, n.z, s); const d = Math.hypot(s[0] - mouse[0], s[1] - mouse[1]); if (d < bd) { bd = d; best = n; } }
    hover = best;
  } else if (!hackOn) hover = null;
  const inMenu = !playing && (!$('#termS').hidden || !$('#boot').hidden);
  frame.n = (frame.n || 0) + 1;
  if (!inMenu || frame.n % 4 === 0) renderFrame();
  hudAcc += rdt; if (hudAcc > 0.12 && playing) { hudAcc = 0; hudTick(); }
  if (state === 'play') drawScanner();
}

/* ================================================================ tactical pause, field tips, guard cones */
let paused = false;
function setPause(on) {
  if (state !== 'play') on = false;
  if (on === paused) return;
  paused = on; $('#pauseB').hidden = !on; $('#bPause').classList.toggle('on', on);
  sfx('ui', null, null, 0.6, on ? 0.8 : 1.2);
}
const TIPS = {
  start: 'Click to move, double-click to run, drag to box-select. SPACE pauses the game, and you can still give orders while paused.',
  stealth: 'A guard is getting suspicious (?). Guards see much further when you stand in light. Back off into the dark or take them down fast.',
  uplink: 'An uplink is close. Press H for the network view, click the uplink to connect your deck carrier, then click nodes in its range.',
  light: 'You are in a searchlight. Anyone near the beam will spot you. Move out of the light circle.',
  ammo: 'Ammo is limited per contract. Dead enemies drop weapons: walk over them for ammo, or click one to swap. R reloads.',
  pickup: 'A dropped weapon glows on the ground. Amber means new tech: carry it home and it is added to your armoury.',
  alarm: 'The alarm is up. The colonel runs for his jeep and a truck of reinforcements is on the way. Stop the jeep or block the north gate with a hack.',
  extract: 'Target down. Get every surviving agent to the extraction point to finish the contract.',
  car: 'You are close to a vehicle. Press F to get in with the selected agents, click to drive, F again to get out.',
};
let tipEl = null, tipT = 0;
function tip(id) {
  if (!SAVE.tipsOn && SAVE.tipsOn !== undefined) return;
  SAVE.tips = SAVE.tips || {};
  if (SAVE.tips[id] || state !== 'play') return;
  if (tipT > 0 && id !== 'start') return;
  SAVE.tips[id] = 1; store();
  $('#tipT').textContent = TIPS[id]; $('#tip').hidden = false; tipT = 10;
}
$('#tipX').addEventListener('click', () => { $('#tip').hidden = true; tipT = 0; });
function tipTick(dt) {
  if (tipT > 0) { tipT -= dt; if (tipT <= 0) $('#tip').hidden = true; }
  if (state !== 'play' || !MS || !MS.def) return;
  if (missionT > 1.5) tip('start');
  const live = agents.filter((a) => !a.dead);
  if (people.some((p) => !p.dead && (p.fac === 'corp' || p.fac === 'law') && !p.alerted && p.sus > 0.3)) tip('stealth');
  if (live.some((a) => deckOf(a) && WORLD.uplinks.some((u) => Math.hypot(u.x - a.x, u.z - a.z) < 9))) tip('uplink');
  if (WORLD.towers.some((t) => t.spotOn && live.some((a) => Math.hypot(a.x - t.spot[0], a.z - t.spot[1]) < 3.4))) tip('light');
  if (live.some((a) => { const id = a.slots[a.cur], w = id && WEAPONS[id]; if (!w || w.energy != null) return false; const am = a.ammo[id]; return am && am.mag + am.res < w.mag * w.mags * 0.3; })) tip('ammo');
  if (pickups.some((it) => live.some((a) => Math.hypot(a.x - it.x, a.z - it.z) < 14))) tip('pickup');
  if (MS.alarm >= 2) tip('alarm');
  if (MS.objs[0] && MS.objs[0].st === 'done') tip('extract');
  if (cars.some((c) => !c.wreck && !c.gone && c !== target && c.driver !== 'script' && live.some((a) => !a.inCar && Math.hypot(a.x - c.x, a.z - c.z) < 6))) tip('car');
}
const noiseRings = [];
function addNoise(x, z, r) { if (noiseRings.length > 12) noiseRings.shift(); noiseRings.push({ x, z, r, t: 0 }); }
function drawCones(PH, SG, AM) {
  const s0 = [0, 0, 0];
  const sel = selAlive(); if (!sel.length) return;
  // sentry turrets: a range ring on the ground once the squad is anywhere near
  for (const t of turrets) {
    if (t.dead || !sel.some((a) => Math.hypot(a.x - t.x, a.z - t.z) < 34)) continue;
    const R = WEAPONS.turret.range, fr = t.friendly > 0, y = groundY(t.x, t.z) + 0.05;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU; toScreen(t.x + Math.sin(a) * R, y, t.z + Math.cos(a) * R, s0); if (i) ctx.lineTo(s0[0], s0[1]); else ctx.moveTo(s0[0], s0[1]); }
    ctx.setLineDash([6 * DPR, 6 * DPR]); ctx.lineWidth = 1.5 * DPR; ctx.strokeStyle = fr ? 'rgba(134,250,221,0.45)' : 'rgba(255,70,90,' + (0.4 + 0.2 * Math.sin(time * 5)) + ')'; ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
    toScreen(t.x, y + 2.6, t.z, s0); label(fr ? 'SENTRY // OURS' : 'SENTRY', s0[0], s0[1] - 8 * DPR, fr ? 'rgba(134,250,221,0.95)' : 'rgba(255,91,130,0.95)');
  }
  const anyArmed = agents.some((a) => !a.dead && a.armed);
  for (const p of people) {
    if (p.dead || p.inCar || p.alerted || p.stun > 0) continue;
    if (!(p.fac === 'corp' || (p.fac === 'law' && anyArmed))) continue;
    if (p.kind === 'courier' || p.kind === 'exec') continue;
    if (!sel.some((a) => Math.hypot(a.x - p.x, a.z - p.z) < 38)) continue;
    const y = (p.elev || groundY(p.x, p.z)) + 0.08;
    const far = p.kind === 'cop' ? 14 : 15 + (p.elev ? 6 : 0), near = p.kind === 'cop' ? 14 : 6.5 + (p.elev ? 6 : 0);
    const susp = p.sus > 0.05;
    const ray = (a, r) => { const dx = Math.sin(a), dz = Math.cos(a); const d = p.elev ? r : Math.min(r, wallDist(p.x, p.z, dx, dz, r)); return [p.x + dx * d, p.z + dz * d]; };
    const poly = (r) => { const pts = [[p.x, p.z]]; for (let k = -8; k <= 8; k++) pts.push(ray(p.yaw + k / 8 * 1.0, r)); return pts; };
    const path = (pts) => { ctx.beginPath(); pts.forEach(([x, z], i) => { toScreen(x, y, z, s0); if (i) ctx.lineTo(s0[0], s0[1]); else ctx.moveTo(s0[0], s0[1]); }); ctx.closePath(); };
    path(poly(near)); ctx.fillStyle = susp ? 'rgba(255,196,107,0.16)' : 'rgba(255,91,130,0.09)'; ctx.fill();
    if (far > near) { path(poly(far)); ctx.setLineDash([3 * DPR, 4 * DPR]); ctx.strokeStyle = susp ? AM + '0.5)' : SG + '0.28)'; ctx.stroke(); ctx.setLineDash([]); }
  }
  for (const n of noiseRings) { const f = 1 - n.t / 0.7; if (f > 0) groundRing(n.x, n.z, n.r * Math.min(1, n.t / 0.35 + 0.15), PH + (0.55 * f).toFixed(2) + ')', null, 0.15); }
}
function noiseTick(dt) { for (const n of noiseRings) n.t += dt; while (noiseRings.length && noiseRings[0].t > 0.7) noiseRings.shift(); }

/* ================================================================ opening sequence */
const INTRO = { on: !REDUCED, t: 0, typed: 0, titled: false, outd: false };
const INTRO_TXT = '> KESSEL CO. NETWORK // NODE 7\n> HARROW BAY // 2093 // 23:41 LOCAL\n> CRYO LINK ........ OK\n> FOUR AGENTS IN STASIS\n> CONTRACTS PENDING';
const ease = (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
function introTick(dt) {
  const I = INTRO; if (!I.freeze) I.t += dt; const t = I.t;
  const n = Math.min(INTRO_TXT.length, Math.floor(t / 0.022));
  if (n !== I.typed) { I.typed = n; $('#itype').innerHTML = esc(INTRO_TXT.slice(0, n)) + '<span class="c"></span>'; }
  $('#ibg').style.opacity = String(clamp(1 - (t - 1.9) / 1.1, 0, 1));
  hackT = t < 3.1 ? 1 : clamp(1 - (t - 3.1) / 1.4, 0, 1);
  const f = ease(clamp(t / 7.2, 0, 1));
  camT.set(lerp(30, 118, f), 0, lerp(196, 104, f)); camYaw = Math.PI / 4 - 0.55 * (1 - f);
  if (t > 3.9 && !I.titled) { I.titled = true; $('#ititle').classList.add('show'); }
  if (t > 6.3 && !I.outd) { I.outd = true; $('#ititle').classList.add('out'); $('#itype').style.opacity = '0'; }
  if (t > 7.1) endIntro();
}
function endIntro() {
  if (!INTRO.on && !$('#intro').isConnected) return;
  INTRO.on = false; $('#intro').remove(); hackT = 0;
  const b = $('#boot'); b.hidden = false; b.classList.add('enter');
  $('#startBtn').focus();
}
$('#intro').addEventListener('pointerdown', endIntro);
window.addEventListener('keydown', (e) => { if (INTRO.on) { e.preventDefault(); endIntro(); } }, true);
if (!INTRO.on) endIntro();

/* ================================================================ boot */
$('#scanW').addEventListener('pointerdown', scanClick);
$('#sndBtn').addEventListener('click', () => { setSound(!AU.on); if (AU.on) playMusic('boardroom', 1.5); });
$('#startBtn').addEventListener('click', () => {
  if (!AU.ctx) setSound(true); else audioInit();
  sfx('zap', null, null, 0.5, 1.2);
  tStatus('LOGGED IN // ' + SAVE.agents.filter((r) => r.alive).length + ' AGENTS IN CRYO'); showTerminal('contracts');
});
window.addEventListener('resize', resize);
setupAttract();
resize();
requestAnimationFrame(frame);
$('#bootCash').textContent = fmt(SAVE.cash) + ' CR';
$('#bootCon').textContent = MISSIONS.filter((m) => !SAVE.done[m.id] && !(m.need && !SAVE.done[m.need])).length + ' OPEN';
$('#bootSquad').textContent = SAVE.agents.filter((r) => r.alive).length + ' ONLINE';
$('#startBtn').disabled = false; $('#startBtn').textContent = 'JACK IN';
window.__wetwire = { targetPos,
  step, startMission, endMission, toggleCar, setHack, cmdMove, cmdAttack, setSlot, orderJack, startHack, hackables, explode, toScreen, resize, CFG, camT, MISSIONS, WEAPONS,
  get SAVE() { return SAVE; }, set SAVE(v) { SAVE = v; }, get MS() { return MS; }, get WORLD() { return WORLD; }, get time() { return time; }, get missionT() { return missionT; }, get state() { return state; },
  get agents() { return agents; }, get people() { return people; }, get cars() { return cars; }, get pickups() { return pickups; }, get target() { return target; }, get heat() { return heat; }, get hackJob() { return hackJob; },
  INTRO, endIntro, get RN() { return RN; }, get PEDS() { return PEDS; }, get LEVEL() { return LEVEL; }, LEVELS, aimAt, towerUnder, get fires() { return fires; }, get barrels() { return barrels; }, loadWorld, dispatchPolice, spookVarga, driveTo, damageCar, get flyers() { return flyers; }, get camYawV() { return camYaw; }, get selected() { return selected; }, set camYaw(v) { camYaw = camYawTo = v; }, selectAll, showTerminal, openPage, renderPage, store, get planDef() { return planDef; },
};
