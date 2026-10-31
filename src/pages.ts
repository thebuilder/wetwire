import { $, R, REDUCED, TAU, clamp, glCanvas } from './core';
import { GW } from './world_head';
import { CX0, CX1, CZ0, CZ1, ROADX } from './world_build';
import { LEVEL, LEVELS, buildRoadNet, setLEVEL } from './layout';
import { WEATHER } from './world_load';
import { AU, playMusic, setSound, sfx } from './engine';
import { CAP, GEAR, MISSIONS, MOD_COST, MOD_NEED, MOD_ORDER, MOD_TXT, RESEARCH, SAVE, WEAPONS, ammoCost, chargeCost, derive, freshSave, fullAmmo, mkRec, recWeight, refill, setSAVE, store } from './campaign';
import { startMission } from './setup';
import { hasIntel, intelCost, renderTerritory, terrOf } from './missions';
import { ICON_IMG } from './icons';
import { fmt, freeName } from './flow';
import { toggleLab } from './hud';

/* ================================================================ company terminal (between missions) */
export let shopSel = null, planDef = null, armSel = 0, slotSel = 0, modSel = 'arms', sqTab = 'gear', resetArm = 0, page = 'contracts', conSel = null, DEBRIEF = null;
export function setPlanDef(v: typeof planDef) { return planDef = v; }
export function setDEBRIEF(v: typeof DEBRIEF) { return DEBRIEF = v; }
const PAGES = [['contracts', 'Contracts'], ['territory', 'Territory'], ['squad', 'Squad'], ['research', 'Research'], ['system', 'System']];
export const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kw = (t) => esc(t).replace(/\*(.+?)\*/g, '<em class="kw">$1</em>');
let tStatTimer = null;
export function tStatus(msg, cls?) {
  const el = $('#tStat'), full = '> ' + msg; el.className = 'tstat ' + (cls || '');
  clearInterval(tStatTimer); let n = 2; el.textContent = '>';
  if (REDUCED) { el.textContent = full; return; }
  tStatTimer = setInterval(() => { n = Math.min(full.length, n + 2); el.textContent = full.slice(0, n) + (n < full.length ? '_' : ''); if (n >= full.length) clearInterval(tStatTimer); }, 16);
}
function crtAnim(el, cls, ms, done?) { if (REDUCED) { if (done) done(); return; } el.classList.remove('on', 'off'); void el.offsetWidth; el.classList.add(cls); setTimeout(() => { el.classList.remove(cls); if (done) done(); }, ms); }
function deployedAlive() { return SAVE.agents.filter((r) => r.alive && r.deploy); }
function aliveRecs() { return SAVE.agents.map((r, i) => [r, i]).filter(([r]) => r.alive); }
export function showTerminal(p) {
  for (const s of ['#boot', '#hud']) $(s).hidden = true;
  const wasHidden = $('#termS').hidden;
  $('#termS').hidden = false;
  if (wasHidden) crtAnim($('#termS .crt'), 'on', 1400);
  if (!SAVE.agents[armSel] || !SAVE.agents[armSel].alive) armSel = Math.max(0, SAVE.agents.findIndex((r) => r.alive));
  if (planDef && planDef.need && !SAVE.done[planDef.need]) planDef = null;
  openPage(p || page);
  playMusic('theme', 1.5);
}
export function openPage(p) {
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
export function renderPage() {
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
    $('#sSnd').addEventListener('click', () => { setSound(!AU.on); if (AU.on) playMusic('theme', 1.5); renderPage(); });
    $('#sLab').addEventListener('click', () => toggleLab());
    $('#sTips').addEventListener('click', () => { SAVE.tipsOn = SAVE.tipsOn === false; store(); renderPage(); });
    $('#sTipR').addEventListener('click', () => { SAVE.tips = {}; SAVE.tipsOn = true; store(); tStatus('FIELD TIPS WILL SHOW AGAIN'); renderPage(); });
    $('#sWipe').addEventListener('click', () => {
      if (!resetArm) { resetArm = 1; renderPage(); return; }
      setSAVE(freshSave()); store(); planDef = null; conSel = null; armSel = 0; resetArm = 0; tStatus('NEW CAMPAIGN STARTED', 'warn'); openPage('contracts');
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
  if ($('#termS').hidden || (e.target && ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT'))) return;
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
  const rect = (x0, z0, x1, z1, st, fl, dash?) => { g.beginPath(); g.rect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0)); if (fl) { g.fillStyle = fl; g.fill(); } if (st) { g.strokeStyle = st; if (dash) g.setLineDash(dash); g.stroke(); g.setLineDash([]); } };
  const seg = (x0, z0, x1, z1, st, dash?) => { g.beginPath(); g.moveTo(X(x0), Z(z0)); g.lineTo(X(x1), Z(z1)); g.strokeStyle = st; if (dash) g.setLineDash(dash); g.stroke(); g.setLineDash([]); };
  const circ = (x, z, r, st, dash) => { g.beginPath(); g.arc(X(x), Z(z), r * k, 0, TAU); g.strokeStyle = st; if (dash) g.setLineDash(dash); g.stroke(); g.setLineDash([]); };
  const dot = (x, z, s, col) => { g.fillStyle = col; g.fillRect(Math.round(X(x) - s / 2), Math.round(Z(z) - s / 2), s, s); };
  const diamond = (x, z, s, col) => { g.beginPath(); g.moveTo(X(x), Z(z) - s); g.lineTo(X(x) + s, Z(z)); g.lineTo(X(x), Z(z) + s); g.lineTo(X(x) - s, Z(z)); g.closePath(); g.strokeStyle = col; g.stroke(); };
  const cross = (x, z, col) => { const px = X(x), pz = Z(z); g.strokeStyle = col; g.beginPath(); g.arc(px, pz, 6, 0, TAU); g.moveTo(px - 10, pz); g.lineTo(px - 3, pz); g.moveTo(px + 3, pz); g.lineTo(px + 10, pz); g.moveTo(px, pz - 10); g.lineTo(px, pz - 3); g.moveTo(px, pz + 3); g.lineTo(px, pz + 10); g.stroke(); };
  const text = (t, x, z, col, dx, dz, al?) => { g.fillStyle = col; g.textAlign = al || 'left'; g.fillText(t, Math.round(X(x) + (dx || 0)), Math.round(Z(z) + (dz || 0))); };
  const uplink = (x, z, r, lab?) => { if (r) circ(x, z, r, 'rgba(134,250,221,0.16)', [2, 4]); g.strokeStyle = C.up; g.strokeRect(Math.round(X(x) - 3) + 0.5, Math.round(Z(z) - 3) + 0.5, 6, 6); if (lab) text(lab, x, z, C.up, 6, 0); };
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
const BRIEF: any = {};
function briefNet(L) {
  if (BRIEF[L.id]) return BRIEF[L.id];
  const keep = LEVEL; setLEVEL(L); const net = buildRoadNet(L.roads); setLEVEL(keep);
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
const iconCache: any = {};
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
const DOLLS: Record<string, any> = {
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
  const m = r.mods, ramps: any = {}; for (const k in RAMP) ramps[k] = RAMP[k].map(hexc);
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
