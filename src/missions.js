/* ================================================================ mission scripts
   A contract can register SCRIPTS[id] = { setup(def, L), update(dt) } to add its own cast and timeline on top of
   the shared city setup (civilians, traffic, turrets). New contracts go here. */
const SCRIPTS = {};
MISSIONS.push(
  { id: 'warrens', code: '0419', title: 'The Warrens', region: 'Harrow Bay // the Warrens', world: 'city', level: 'warrens', weather: 'rain', reward: 16000, max: 4, need: 'varga', unlock: 'flamer',
    spot: 'boss', spotLabel: 'WIRE', targetMsg: 'TARGET: WIRE ODUYA // THE DEN, CENTRE OF THE WARRENS', killMsg: 'WIRE ODUYA IS DEAD', extractMsg: 'GET TO THE PICKUP LOT',
    brief: 'Jax "Wire" Oduya runs the Warrens crews and sells Kessel agent locations to Meridian. He holds court in a walled den at the heart of the slum. Kill him, then reach the pickup lot. The police never come in here, but every lane belongs to his gangs.',
    intel: ['Gangers carry *Uzis*, *shotguns* and a couple of *flamers*', 'The den has *one gate*, facing south', 'Fuel *drums* everywhere. One stray shot and the lane burns', 'No police here. *Heat* does not matter', 'Shooting wakes the slum: *more crews* come running', 'Reward: Wire\'s *flamer* stock goes to your armoury'],
    threat: 'Gang crews with *Uzis*, *shotguns* and *flamers*',
    win: 'Wire is dead and the Warrens have gone quiet. His flamers are on our shelves.', fail: 'Wire slipped away into the Warrens. No fee.' },
  { id: 'airfield', code: '0421', title: 'Chairman Okonkwo', region: 'Meridian airfield', world: 'city', level: 'airfield', weather: 'clear', reward: 24000, max: 4, need: 'warrens',
    spot: 'target', spotLabel: 'OKONKWO', targetMsg: 'TARGET: CHAIRMAN OKONKWO // TERMINAL, THEN THE VTOL PAD', killMsg: 'CHAIRMAN OKONKWO IS DEAD', extractMsg: 'GET TO THE PICKUP PAD WEST OF THE TERMINAL',
    brief: 'Meridian\'s chairman leaves the city tonight. His VTOL lifts off from the airfield apron in a few minutes. Kill him before it does, then reach the Kessel pickup pad west of the terminal.',
    intel: ['He walks from the *terminal* to the *VTOL* at about *2:00*. Trouble makes him run sooner', 'Hack the *control tower* for a *ground stop*: the VTOL is held 60 seconds', 'The VTOL is *armoured*. *Rockets* and *fire* work. A *military hack* grounds it', 'The *fuel farm* east of the terminal goes up in a chain', 'Four *sentry turrets* ring the pad. Cameras watch the terminal front'],
    threat: 'Meridian security with *lasers*, four *sentry turrets*, cameras',
    win: 'Okonkwo is dead on his own runway. Meridian is leaderless.', fail: 'The VTOL cleared the city. Okonkwo is out of reach.' },
);
const GANG = [[0.3, 0.08, 0.06], [0.22, 0.2, 0.08], [0.12, 0.12, 0.14], [0.35, 0.22, 0.05]];
function ganger(x, z, weapon, o) { return militia(x, z, weapon, Object.assign({ color: Rpick(GANG), rim: [1, 0.55, 0.15], coat: 1, hp: 60, maxHp: 60 }, o)); }

/* ---------------------------------------------------------------- the Warrens */
SCRIPTS.warrens = {
  setup(def, L) {
    for (const p of people) if (p.kind === 'civ') { p.color = Rpick([[0.22, 0.16, 0.1], [0.14, 0.15, 0.16], [0.25, 0.08, 0.06], [0.1, 0.16, 0.14], [0.2, 0.2, 0.12]]); }
    const D = WORLD.den;
    target = ganger(D.boss[0], D.boss[1], 'uzi', { boss: true, hp: 220, maxHp: 220, mag: 50, color: [0.45, 0.08, 0.3], coat: 2, scale: 1.12, yaw: 0, postYaw: 0 });
    D.posts.forEach(([x, z], i) => ganger(x, z, i < 2 ? 'flamer' : i % 2 ? 'shotgun' : 'uzi', { yaw: Rr(-1, 1), postYaw: Rr(-1, 1) }));
    for (let i = 0; i < 12; i++) {
      const g = spawnCiv(); const w = Rpick(['uzi', 'shotgun', 'pistol', 'uzi']);
      Object.assign(g, { kind: 'militia', fac: 'corp', state: 'patrol', walker: true, weapon: w, mag: WEAPONS[w].mag, armed: 1, color: Rpick(GANG), rim: [1, 0.55, 0.15], coat: 1, umb: 0, hp: 60, maxHp: 60, speed: 1.2, skin: Rpick(SKINS) });
      if (Math.hypot(g.x - L.spots.start[0], g.z - L.spots.start[1]) < 40) { const [sg, s0] = randomPed(); g.seg = sg; g.s = s0; const pp = pedPos(sg, s0); g.x = pp[0]; g.z = pp[1]; }
    }
    MS.objs = [{ id: 'kill', text: 'Kill Jax "Wire" Oduya', st: 'open' }, { id: 'out', text: 'Reach the pickup lot', st: 'open' }];
  },
  update(dt) {
    if (MS.gangCalled) return;
    if (people.some((p) => !p.dead && p.fac === 'corp' && p.alerted)) {
      MS.gangT = (MS.gangT || 0) + dt;
      if (MS.gangT > 8) {
        MS.gangCalled = true; const sc = squadCenter();
        for (let i = 0; i < 6; i++) {
          let seg, s0, k = 0; do { [seg, s0] = randomPed(); k++; } while (k < 20 && Math.hypot(pedPos(seg, s0)[0] - sc[0], pedPos(seg, s0)[1] - sc[1]) < 45);
          const pp = pedPos(seg, s0), g = ganger(pp[0], pp[1], i === 0 ? 'flamer' : Rpick(['uzi', 'shotgun']), {}); alertNpc(g, sc[0], sc[1], 'heard');
        }
        say('THE WARRENS ARE AWAKE // MORE CREWS COMING', 'bad');
      }
    }
  },
};

/* ---------------------------------------------------------------- Meridian airfield */
const WALK_AT = 120, BOARD_WAIT = 16, RUSH_WAIT = 6;
SCRIPTS.airfield = {
  setup(def, L) {
    for (const p of people) if (p.kind === 'civ') { p.color = Rpick([[0.6, 0.3, 0.04], [0.5, 0.45, 0.04], [0.2, 0.2, 0.22]]); p.umb = 0; p.rim = [0, 0, 0]; }
    const [px, pz] = WORLD.pad;
    MS.vtol = mkCarAt('vtol', px, pz, Math.PI / 2, { color: [0.12, 0.12, 0.14], glow: [1, 0.3, 0.55], hp: 520, maxHp: 520, armor: { bullet: 0.12, shot: 0.1, beam: 0.45, blast: 1 } });
    const d = WORLD.door, sx = d.x + d.n[0] * 2.2, sz = d.z + d.n[1] * 2.2;
    target = mkPerson({ kind: 'chairman', fac: 'corp', state: 'wait', x: sx, z: sz, yaw: Math.PI, hp: 90, maxHp: 90, color: [0.85, 0.85, 0.88], skin: SKINS[3], rim: [1, 0.3, 0.55], coat: 2, scale: 1.04 });
    for (const off of [[-1.5, 1.0], [1.5, 1.0]]) mkPerson({ kind: 'corp', fac: 'corp', state: 'escort', guard: target, goff: off, x: sx + off[0], z: sz + off[1], hp: 150, maxHp: 150, weapon: 'corprifle', mag: 99, color: [0.55, 0.55, 0.6], skin: [0.2, 0.2, 0.22], rim: [1, 0.3, 0.55], coat: 2, armed: 1, scale: 1.08 });
    for (const [dx, dz] of [[-24, -14], [24, -14], [-26, 16], [26, 16], [0, -22]]) mkPerson({ kind: 'corp', fac: 'corp', state: 'post', x: px + dx, z: pz + dz, postX: px + dx, postZ: pz + dz, yaw: Math.atan2(-dx, -dz), postYaw: Math.atan2(-dx, -dz), hp: 150, maxHp: 150, weapon: 'corprifle', mag: 99, color: [0.55, 0.55, 0.6], skin: [0.2, 0.2, 0.22], rim: [1, 0.3, 0.55], coat: 2, armed: 1, scale: 1.08 });
    const fuel = mkCarAt('truck', px + 8.5, pz + 5, 0, { color: [0.75, 0.6, 0.1], glow: [1, 0.6, 0.2], hp: 200, maxHp: 200 });
    fuel.fuel = true;
    MS.cphase = 'wait'; MS.ct = 0; MS.groundStop = 0; MS.rush = false;
    MS.objs = [{ id: 'kill', text: 'Kill Chairman Okonkwo', st: 'open' }, { id: 'out', text: 'Reach the pickup pad', st: 'open' }];
  },
  update(dt) {
    const v = MS.vtol, p = target;
    if (MS.groundStop > 0) MS.groundStop -= dt;
    const held = MS.groundStop > 0 || (v && v.stall > 0);
    if (!held) MS.ct += dt;
    // security: cameras call it in, then the terminal empties its guards
    for (const c of WORLD.cams) if (c.spot && time - (MS.camT || -9) > 4) { MS.camT = time; for (const q of people) if (!q.dead && q.fac === 'corp' && q.kind === 'corp' && Math.hypot(q.x - c.x, q.z - c.z) < 45) alertNpc(q, ...squadCenter(), 'seen'); }
    const alerted = people.some((q) => !q.dead && q.fac === 'corp' && q.alerted);
    if (alerted && !MS.resp) MS.resp = time + 6;
    if (MS.resp && time > MS.resp && !MS.resp1) { MS.resp1 = true; spawnCorp(4); MS.resp2 = time + 45; }
    if (MS.resp2 && time > MS.resp2) { MS.resp2 = 0; spawnCorp(3); }
    if (!p || p.dead || MS.objs[0].st !== 'open') return;
    // the chairman bolts if shooting starts nearby or armed agents get close
    if (!MS.rush && (alerted || (time - lastCombat < 1.5 && Math.hypot(p.x - squadCenter()[0], p.z - squadCenter()[1]) < 50) || agents.some((a) => !a.dead && a.armed && Math.hypot(a.x - p.x, a.z - p.z) < 16))) {
      MS.rush = true; if (MS.cphase === 'wait') MS.cphase = 'walk'; say('THE CHAIRMAN IS RUNNING FOR HIS VTOL', 'bad');
    }
    if (MS.cphase === 'wait' && MS.ct >= WALK_AT) { MS.cphase = 'walk'; say('THE CHAIRMAN IS WALKING TO THE VTOL', 'warn'); }
    if (MS.cphase === 'boarded' && v && !v.wreck) {
      MS.boardT += held ? 0 : dt;
      const wait = MS.rush ? RUSH_WAIT : BOARD_WAIT;
      if (MS.boardT > wait - 4 && !MS.spool) { MS.spool = true; say('VTOL ENGINES SPOOLING UP', 'bad'); sfx('rocket', v.x, v.z, 0.6, 0.5); }
      if (MS.boardT > wait && !held) {
        v.alt = (v.alt || 0) + dt * (1.5 + (v.alt || 0) * 0.35);
        if (R() < dt * 30) spawnP(v.x + Rr(-6, 6), 0.3, v.z + Rr(-6, 6), Rr(-4, 4), Rr(0, 1), Rr(-4, 4), [0.12, 0.12, 0.14], Rr(0.5, 1), Rr(0.6, 1.2), 0, 1);
        if (v.alt > 9 && MS.objs[0].st === 'open') { setObj('kill', 'fail'); say('THE VTOL CLEARED THE APRON // OKONKWO GOT AWAY', 'bad'); }
      }
    }
    if (v && v.alt > 45) v.gone = true;
    // countdown in the objective line
    const left = MS.cphase === 'wait' ? WALK_AT - MS.ct : 0;
    const txt = 'Kill Chairman Okonkwo' + (MS.cphase === 'wait' ? ' // VTOL ' + Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0') + (held ? ' HELD' : '') : MS.cphase === 'walk' ? ' // BOARDING' : v && v.alt > 0 ? ' // LIFTING OFF' : ' // ON BOARD' + (held ? ', HELD' : ''));
    if (MS.objs[0].text !== txt) { MS.objs[0].text = txt; renderObjs(); }
  },
};
function updateChairman(p, dt) {
  if (p.inCar) return;
  if (p.state === 'entering') return updateEntering(p, dt);
  const v = MS.vtol;
  const go = (x, z, spd) => { if (!p.path || !p.path.length || p.repath < time) { p.path = findPath(p.x, p.z, x, z); p.repath = time + 1.2; } if (followPath(p, spd, dt)) { p.walk = spd > 2 ? 1.2 : 1; p.phase += dt * spd * (spd > 2 ? 2.4 : 3.2); } else p.walk = lerp(p.walk, 0, Math.min(1, dt * 6)); return Math.hypot(p.x - x, p.z - z); };
  if (!v || v.wreck) { const d = WORLD.door; if (go(d.x + d.n[0] * 1.2, d.z + d.n[1] * 1.2, 3.8) < 1.6) enterTower(p, 'THE CHAIRMAN IS AT THE TERMINAL DOOR', 'THE CHAIRMAN WENT TO GROUND IN THE TERMINAL'); return; }
  if (MS.cphase === 'wait') { p.walk = lerp(p.walk, 0, Math.min(1, dt * 6)); p.yaw += angDiff(p.yaw, Math.PI + Math.sin(time * 0.3) * 0.4) * Math.min(1, dt * 2); return; }
  if (MS.cphase === 'walk' && go(v.x, v.z + 3.2, MS.rush ? 3.8 : 1.3) < 1.8) {
    p.inCar = v; p.path = null; v.occ = [p]; MS.cphase = 'boarded'; MS.boardT = 0;
    for (const g of people) if (g.guard === p && !g.dead && !g.alerted) { g.inCar = v; v.occ.push(g); }
    say('THE CHAIRMAN IS ABOARD THE VTOL', 'bad'); sfx('door', v.x, v.z, 0.9);
  }
}

/* ================================================================ territory: every finished contract wins a district that pays tax
   between missions. Tax too hard and unrest builds until the district revolts and has to be retaken. */
const TERR = {
  compound: { name: 'Kessel outskirts', pop: 18, r: [4, 6, 30, 26] },
  halden:   { name: 'Meridian campus', pop: 40, r: [36, 4, 30, 24] },
  varga:    { name: 'Sector 9', pop: 85, r: [36, 32, 30, 30] },
  warrens:  { name: 'The Warrens', pop: 70, r: [4, 36, 30, 34] },
  courier:  { name: 'Harbour docks', pop: 55, r: [36, 66, 34, 28] },
  airfield: { name: 'Meridian airfield', pop: 35, r: [70, 10, 26, 46] },
};
const TAX_FAIR = 18;
function terrOf(id) { SAVE.terr = SAVE.terr || {}; if (SAVE.done[id] && !SAVE.terr[id]) SAVE.terr[id] = { tax: 15, unrest: 0, revolt: false }; return SAVE.terr[id] || null; }
const taxIncome = (id) => { const t = terrOf(id); return t && !t.revolt ? Math.round(TERR[id].pop * t.tax * 1.2) : 0; };
/* called from settle(): collect taxes, move unrest, start or end revolts */
function settleTerritory(res, add, rows) {
  if (res === 'abort') return;
  const def = MS.def, t0 = terrOf(def.id);
  if (res === 'win' && t0 && t0.revolt) { t0.revolt = false; t0.unrest = 25; rows.push(['District retaken // ' + TERR[def.id].name, 0]); }
  let inc = 0;
  for (const id in TERR) {
    const t = terrOf(id); if (!t) continue;
    if (!t.revolt) inc += taxIncome(id);
    if (t.revolt) continue;
    t.unrest = clamp(t.unrest + (t.tax - TAX_FAIR) * 1.6, 0, 100);
    if (t.unrest >= 100) { t.revolt = true; rows.push(['REVOLT // ' + TERR[id].name + ' stops paying', 0]); }
  }
  if (inc) add('Territory taxes', inc);
}
function renderTerritory(P) {
  const owned = Object.keys(TERR).filter((id) => terrOf(id));
  const total = owned.reduce((s, id) => s + taxIncome(id), 0);
  P.innerHTML = '<h2 class="tt">Territory <small>Districts Kessel controls. Taxes are collected each time a team comes home.</small></h2><div class="split terr"><div class="box"><div class="bh">Harrow Bay</div><canvas id="tmap" class="tmap"></canvas>'
    + '<div class="legend"><span><i style="background:#2f9a8a"></i>Ours</span><span><i style="background:#ff5b82"></i>Revolt</span><span><i style="border:1px solid #ffc46b"></i>Open contract</span></div></div>'
    + '<div class="box"><div class="bh">Districts // ' + fmt(total) + ' CR per contract</div>'
    + (owned.length ? owned.map((id) => {
      const t = terrOf(id), u = Math.round(t.unrest);
      return '<div class="trow' + (t.revolt ? ' rev' : '') + '"><div class="tn"><b>' + TERR[id].name + '</b><span>' + (t.revolt ? 'IN REVOLT // RETAKE IT: REPLAY CONTRACT ' + MISSIONS.find((m) => m.id === id).code : 'POP ' + TERR[id].pop + 'K // PAYS ' + fmt(taxIncome(id)) + ' CR') + '</span></div>'
        + '<div class="tax"><button data-tax="' + id + '" data-d="-5"' + (t.revolt || t.tax <= 0 ? ' disabled' : '') + '>-</button><b>' + t.tax + '%</b><button data-tax="' + id + '" data-d="5"' + (t.revolt || t.tax >= 60 ? ' disabled' : '') + '>+</button></div>'
        + '<div class="unrest"><span class="lbl">Unrest</span><div class="bar"><i style="width:' + u + '%;background:' + (u > 70 ? 'var(--pink)' : u > 40 ? 'var(--amber)' : 'var(--teal)') + '"></i></div></div></div>';
    }).join('') : '<p class="dim">No districts yet. Every completed contract brings one under Kessel control.</p>')
    + '<p class="dim" style="margin-top:12px">Above ' + TAX_FAIR + '% unrest grows after every contract, below it unrest fades. At full unrest a district revolts and pays nothing until a team retakes it.</p></div></div>';
  P.querySelectorAll('[data-tax]').forEach((b) => b.addEventListener('click', () => { const t = terrOf(b.dataset.tax); t.tax = clamp(t.tax + +b.dataset.d, 0, 60); store(); sfx('ui', null, null, 0.4, 1.2); renderPage(); }));
  requestAnimationFrame(() => drawTerrMap($('#tmap')));
}
function drawTerrMap(cv) {
  if (!cv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth || 360, H = cv.clientHeight || 300;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const k = Math.min(W / 100, H / 100), ox = (W - 100 * k) / 2, oy = (H - 100 * k) / 2;
  g.fillStyle = '#05080b'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(47,154,138,0.12)'; g.fillRect(ox + 72 * k, oy + 60 * k, 28 * k, 40 * k); g.fillRect(ox, oy + 96 * k, 100 * k, 4 * k);
  g.strokeStyle = 'rgba(134,250,221,0.07)'; g.beginPath(); for (let i = 0; i <= 100; i += 5) { g.moveTo(ox + i * k, oy); g.lineTo(ox + i * k, oy + 100 * k); g.moveTo(ox, oy + i * k); g.lineTo(ox + 100 * k, oy + i * k); } g.stroke();
  g.font = '600 11px "Chakra Petch", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const id in TERR) {
    const T = TERR[id], [x, y, w, h] = T.r, t = terrOf(id), m = MISSIONS.find((q) => q.id === id), open = !t && m && !(m.need && !SAVE.done[m.need]);
    const px = ox + x * k, py = oy + y * k, pw = w * k, ph = h * k;
    g.fillStyle = t ? (t.revolt ? (Math.floor(performance.now() / 500) % 2 ? 'rgba(255,91,130,0.35)' : 'rgba(255,91,130,0.18)') : 'rgba(47,154,138,0.35)') : 'rgba(134,250,221,0.04)';
    g.fillRect(px + 1, py + 1, pw - 2, ph - 2);
    g.strokeStyle = t ? (t.revolt ? '#ff5b82' : '#86fadd') : open ? '#ffc46b' : 'rgba(134,250,221,0.2)'; g.lineWidth = 1; g.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);
    const lab = t || open ? T.name.toUpperCase() : 'UNKNOWN'; let fs = 11; g.font = '600 ' + fs + 'px "Chakra Petch", system-ui, sans-serif'; while (fs > 7 && g.measureText(lab).width > pw - 8) { fs--; g.font = '600 ' + fs + 'px "Chakra Petch", system-ui, sans-serif'; }
    g.fillStyle = t ? '#c9d3df' : open ? '#ffc46b' : 'rgba(201,211,223,0.35)'; g.fillText(lab, px + pw / 2, py + ph / 2 - 6);
    g.fillStyle = 'rgba(201,211,223,0.5)'; g.fillText(t ? (t.revolt ? 'REVOLT' : t.tax + '% TAX') : open ? 'CONTRACT ' + m.code : '', px + pw / 2, py + ph / 2 + 9);
  }
}
const intelCost = (m) => Math.round(m.reward * 0.07 / 100) * 100;
const hasIntel = (m) => !!(m.id === 'compound' || SAVE.done[m.id] || (SAVE.intel && SAVE.intel[m.id]));
