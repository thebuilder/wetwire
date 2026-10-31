import { $, CFG, clamp } from './core';
import { WORLD } from './world_head';
import { LEVEL } from './layout';
import { AU, resize, setSound } from './engine';
import { GEAR, SAVE, WEAPONS, store } from './campaign';
import { MS, abortT, agents, fireMode, hackJob, hackOn, heat, lastLoud, missionT, people, pickups, selected, setFireMode, setLastLoud, state, target, time } from './setup';
import { HLEVEL, addHeat, connectedUplinkFor, deckOf, raiseAlarm, squadCenter } from './sim';
import { cmdMedikit, cmdReload, selAlive, setHack, setSlot, toggleCar, towerUnder, tryAbort } from './commands';
import { hover, mouse, selectAgent, selectAll, zoom } from './input';
import { renderPage } from './pages';
import { paused, setPause } from './tactical';

/* ================================================================ HUD */
export function buildSquadRows() {
  const box = $('#squad'); box.innerHTML = '';
  agents.forEach((a, i) => {
    const b = document.createElement('button'); b.className = 'agent'; b.dataset.i = String(i);
    b.innerHTML = '<span class="k">' + (i + 1) + '</span><span class="nm">' + a.name + '<small></small></span><span class="hpbar"><i></i></span>';
    b.addEventListener('click', (e) => selectAgent(i, e.shiftKey));
    box.appendChild(b);
  });
  hudSquad();
}
function wepText(a, i?) {
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
export function hudSquad() {
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
export function hudTick() {
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
export function targetPos() {
  if (MS.def && MS.def.id === 'courier') {
    const cs = pickups.find((p) => p.id === 'case'); if (cs) return [cs.x, cs.z];
    if (MS.courierOut && !MS.courierOut.dead) return [MS.courierOut.x, MS.courierOut.z];
  }
  if (MS.vargaP && !MS.vargaP.inCar && !MS.vargaP.dead) return [MS.vargaP.x, MS.vargaP.z];
  if (!target) return null;
  if (target.inCar) return [target.inCar.x, target.inCar.z];
  return [target.x, target.z];
}
export function locatorPos() {
  if (!MS.def || !MS.objs[0]) return null;
  const k = MS.objs[0];
  if (k.st === 'open') { const tp = targetPos(); return tp ? { p: tp, col: [255, 91, 130] } : null; }
  const ex = extractPos(); return ex ? { p: ex, col: k.st === 'done' ? [180, 240, 106] : [255, 196, 107] } : null;
}
export function extractPos() { return WORLD.kind === 'city' ? WORLD.padC : MS.van ? [MS.van.x, MS.van.z] : WORLD.van; }
$('#ws1').addEventListener('click', () => setSlot(0));
$('#ws2').addEventListener('click', () => setSlot(1));
$('#wRel').addEventListener('click', cmdReload);
$('#wMed').addEventListener('click', cmdMedikit);
document.querySelectorAll<HTMLElement>('.dose').forEach((el) => {
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
$('#bFire').addEventListener('click', () => { setFireMode(!fireMode); });
$('#bZin').addEventListener('click', () => zoom(1));
$('#bZout').addEventListener('click', () => zoom(-1));

/* lab */
export function toggleLab(force?) { const l = $('#lab'); l.hidden = force != null ? !force : !l.hidden;  }
const bindR = (id, out, fn, fmtf?) => { const el = $(id); el.addEventListener('input', () => { const v = +el.value; fn(v); if (out) $(out).textContent = fmtf ? fmtf(v) : v.toFixed(2); }); };
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
$('#dHeat').addEventListener('click', () => { if (state !== 'play') return; if (WORLD.kind === 'city') { addHeat(25); setLastLoud(time); } else raiseAlarm(); });
$('#dHeal').addEventListener('click', () => { for (const a of agents) if (!a.dead) a.hp = a.maxHp; });
$('#dCash').addEventListener('click', () => { SAVE.cash += 5000; store(); if (!$('#termS').hidden) renderPage(); });
