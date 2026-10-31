import { type AgentLook, BROWS, HAIRS, MOUTHS, SKINS } from './terminal/doll';

/* ================================================================ campaign data */
export const WEAPONS = {
  pistol:   { name: 'PISTOL', cost: 0, w: 1, kind: 'bullet', range: 12, rof: 2.4, dmg: 24, spread: 0.04, mag: 13, mags: 5, reload: 1.1, noise: 13, ammo: 0, desc: 'Accurate and quiet. Free to buy and reload.' },
  uzi:      { name: 'UZI', cost: 750, w: 2, kind: 'bullet', range: 13, rof: 11, dmg: 8, spread: 0.12, mag: 50, mags: 3, reload: 1.5, noise: 24, ammo: 60, desc: 'Fast, loud and wasteful. 50 rounds a magazine.' },
  shotgun:  { name: 'SHOTGUN', cost: 250, w: 2, kind: 'shot', pellets: 7, range: 7.5, rof: 1.2, dmg: 12, spread: 0.28, mag: 12, mags: 3, reload: 2.0, noise: 26, ammo: 40, desc: 'Devastating up close. Even the pistol outranges it.' },
  rifle:    { name: 'LONG RIFLE', cost: 1000, w: 3, kind: 'bullet', range: 28, rof: 0.8, dmg: 75, spread: 0.006, mag: 10, mags: 3, reload: 2.2, noise: 30, ammo: 80, desc: 'Single shots at long range. Captured from the militia.' },
  flamer:   { name: 'FLAMER', cost: 3500, w: 3, kind: 'flame', range: 6.5, rof: 10, dmg: 5, mag: 120, mags: 2, reload: 2.2, noise: 16, ammo: 220, desc: 'Sets people, cars and fuel alight. Short reach, total panic.' },
  minigun:  { name: 'MINIGUN', cost: 10000, w: 6, kind: 'bullet', range: 15, rof: 15, dmg: 8, spread: 0.08, mag: 500, mags: 1, reload: 3.0, noise: 36, ammo: 500, desc: 'Devastating rate of fire. Too heavy without Arms V1.' },
  launcher: { name: 'LAUNCHER', cost: 8000, w: 3, kind: 'rocket', range: 22, rof: 0.7, dmg: 160, radius: 5, mag: 1, mags: 5, reload: 1.6, noise: 44, ammo: 300, desc: 'Five rockets. The answer to armour.' },
  silenced: { name: 'SILENCED PISTOL', cost: 600, w: 1, kind: 'bullet', range: 10, rof: 2, dmg: 22, spread: 0.035, mag: 10, mags: 5, reload: 1.3, noise: 4, ammo: 20, desc: 'Quiet enough to drop a guard without waking the next one. Short range.' },
  laser:    { name: 'LASER', cost: 35000, w: 3, kind: 'beam', energy: 40, range: 20, rof: 1.4, dmg: 90, noise: 18, desc: 'Pierces bodies. Draws from the power cell, which recharges.' },
  jack:     { name: 'MIND-JACK', cost: 5000, w: 1, kind: 'jack', energy: 30, range: 7.5, chan: 0.9, noise: 0, desc: 'Persuades civilians. Officers need 2 followers, operatives 6.' },
  corprifle:{ name: 'CORP RIFLE', w: 3, kind: 'beam', range: 15, rof: 1.0, dmg: 22, noise: 20, npc: true, drop: 'laser', mag: 99, reload: 1 },
  turret:   { name: 'SENTRY', w: 9, kind: 'bullet', range: 15, rof: 6, dmg: 5, spread: 0.1, noise: 30, npc: true, mag: 999, reload: 1 },
};
const START_AVAIL = ['pistol', 'uzi', 'shotgun', 'jack'];
export const RESEARCH = [
  { id: 'silenced', name: 'Silenced pistol', cost: 3000, jobs: 1, icon: 'silenced', desc: 'A suppressed sidearm. Shots carry 4 m instead of 13, so guards rarely hear their friends drop.', unlock: 'silenced' },
  { id: 'firmware', name: 'Deck firmware', cost: 5000, jobs: 1, icon: 'deck', desc: 'Rewritten intrusion routines. Every deck builds 20% less trace.' },
  { id: 'minigun', name: 'Minigun', cost: 8000, jobs: 2, icon: 'minigun', need: 'compound', desc: 'Reverse-engineered from Rusk\'s stock. Six barrels, 500 rounds, too heavy without Arms V1.', unlock: 'minigun' },
  { id: 'cells', name: 'Fast-charge cells', cost: 4000, jobs: 1, icon: 'laser', need: 'halden', desc: 'Halden\'s optics team improved the power cells. Lasers and mind-jacks recharge 60% faster.' },
];
export const resDone = (id) => !!(SAVE.res && SAVE.res.done && SAVE.res.done[id]);
export const GEAR = {
  medikit: { name: 'MEDIKIT', cost: 300, w: 0.5, desc: 'Press G in the field. Heals 60% over two seconds. One use.' },
  deck:    { name: 'DECK', cost: 1500, w: 1, charges: 3, trace: 1, desc: 'Hacking deck with 3 charges. Refill costs 150 a charge.' },
  deck2:   { name: 'DECK MK2', cost: 4000, w: 1, charges: 5, trace: 0.7, need: 'compound', desc: '5 charges and 30% less trace. Unlocked after the compound.' },
};
export const MOD_ORDER = ['arms', 'legs', 'chest', 'eyes', 'heart', 'brain'];
export const MOD_TXT = {
  arms: 'Servo assisted hydraulics. Carry 4 / 6 / 9 / 12 and steadier aim.',
  legs: 'Hydraulic legs. Moves 25% faster per version.',
  chest: 'Metal chest cage. Takes 30% / 50% / 65% less damage.',
  eyes: 'Vision enhancer. Longer range, better aim, sees in the dark.',
  heart: 'Heart stimulator. Heals wounds when out of combat, faster per version.',
  brain: 'Neural enhancer. Faster reactions, faster hacks, less trace.',
};
export const MOD_COST = [0, 2500, 6000, 12000];
export const MOD_NEED = [null, null, 'compound', 'halden'];
export const CAP = [4, 6, 9, 12];
const CHARGE_COST = 150;
export function derive(m) {
  return { cap: CAP[m.arms], steady: [1, 0.85, 0.7, 0.55][m.arms], speed: [1, 1.25, 1.5, 1.75][m.legs], armor: [1, 0.7, 0.5, 0.35][m.chest],
    range: [1, 1.15, 1.3, 1.45][m.eyes], aim: [1, 0.85, 0.7, 0.6][m.eyes], night: m.eyes > 0, drain: 1, rec: 1, regen: [0, 0.012, 0.025, 0.045][m.heart],
    react: [1, 0.7, 0.5, 0.35][m.brain], hack: [1, 1.35, 1.7, 2.1][m.brain], traceMul: [1, 0.85, 0.7, 0.55][m.brain] };
}
export const MISSIONS: any[] = [
  { id: 'compound', code: '0412', title: 'Militia compound', region: 'Kessel outskirts', world: 'compound', level: 'compound', weather: 'rain', reward: 7000, max: 4, unlock: 'launcher',
    brief: 'Colonel Rusk sells army hardware out of a fenced compound outside the city. Kill him, then get back to the van. If his men raise the alarm he runs for his jeep and the north road.',
    intel: ['Two manned *watchtowers*, two automatic *searchlights*', 'Damaged fence on the *west side*', '*Radio mast* calls reinforcements. Jam it to buy time', 'Rusk keeps a *launcher* in the motor pool shed', 'Uplinks: *roadside junction*, *west power pole*'],
    threat: 'Militia with pistols, shotguns, an *Uzi* and a *rifle*' },
  { id: 'courier', code: '0415', title: 'Data courier', region: 'Harrow Bay // container docks', world: 'city', level: 'docks', weather: 'storm', reward: 9000, max: 4, need: 'compound',
    brief: 'A Meridian courier van carries a data case with the security specs for their executive cars. Stop the van, take the case and get it to the NE plaza. If the courier reaches the Meridian tower, the data is gone.',
    intel: ['The van is lightly *armoured*. Pistols take a while, *rockets* do not', 'A *secure hack* kills its engine for 25 seconds', 'Stop it and the *courier bails out* on foot with the case', 'A *blackout* stops all traffic, the van included', 'Do not let it reach the *Meridian freight terminal*'],
    threat: 'Police, the armed courier, two *sentry turrets* at the tower' },
  { id: 'halden', code: '0416', title: 'Dr. Halden', region: 'Meridian research campus', world: 'city', level: 'campus', weather: 'clear', reward: 10000, max: 4, need: 'compound', unlock: 'laser', requires: 'jack',
    brief: 'Dr. Ilan Halden designs Meridian\'s laser optics and wants out, but her bodyguards will not let her go. Persuade her with a mind-jack and walk her to the NE plaza. She must arrive alive.',
    intel: ['Needs a *mind-jack* in the squad. Civilians need no followers', 'Two *bodyguards* with Uzis shadow her. Jacking her alerts them', 'They see far less in the *dark*. A blackout helps', 'Reward: her research puts the *laser* in your armoury'],
    threat: 'Bodyguards with *Uzis*, police' },
  { id: 'varga', code: '0417', title: 'Exec. Varga', region: 'Harrow Bay // Sector 9', world: 'city', level: 'downtown', weather: 'smog', reward: 14000, max: 4, need: 'courier',
    brief: 'Ilse Varga rides an armoured limo with pink underglow through Sector 9. Bullets barely scratch it. If she is spooked she drives for the edge of the sector.',
    intel: ['Limo armour shrugs off small arms. The courier data exposed a *military hack* that crashes it for 20 seconds', 'She stops at the *Meridian tower* every couple of minutes and walks to the door with two guards', 'A *blackout* stops traffic, her limo included', '*Rockets* work. So does a nearby car *overloaded* through the network', 'Police react to *drawn weapons*. High *heat* brings Meridian security'],
    threat: 'Police, Meridian security with *lasers*, two *sentry turrets*' },
];
export const NAMES = ['MARLOW', 'IVY', 'KADE', 'ROOK', 'SABLE', 'JUNO', 'TEAGUE', 'NOVAK', 'REI', 'CASS'];
// Save files. The first keeps the original key, so saves from before there were files just appear in it.
const SAVE_KEYS = ['wetwire.save.v2', 'wetwire.save.v2.2', 'wetwire.save.v2.3'];
const LAST_KEY = 'wetwire.file';
export const SAVE_FILES = SAVE_KEYS.length;
const readFile = (i) => { try { const s = JSON.parse(localStorage.getItem(SAVE_KEYS[i])); if (s && Array.isArray(s.agents)) return s; } catch (e) {} return null; };
export let saveFile = (() => { try { const n = +localStorage.getItem(LAST_KEY); return n >= 0 && n < SAVE_KEYS.length ? n : 0; } catch (e) { return 0; } })();
/* What the file select shows, without loading the file. */
export function fileInfo(i) { const s = readFile(i); return s && { cash: s.cash, done: Object.keys(s.done || {}).length, agents: s.agents.filter((r) => r.alive).length, when: s.when || null }; }
export function openFile(i) { saveFile = i; try { localStorage.setItem(LAST_KEY, String(i)); } catch (e) {} SAVE = readFile(i) || freshSave(); store(); }
// How each agent looks. Only the cosmetics are stored; the mods stay on the record.
const STARTER_LOOKS = {
  KESTREL: { skin: 0, hair: 'crop', brow: 'angry', mouth: 'grim', scar: false },
  ODA: { skin: 1, hair: 'bob', brow: 'flat', mouth: 'lips', scar: false },
  VANCE: { skin: 2, hair: 'bald', brow: 'raised', mouth: 'smirk', scar: true },
  SAINT: { skin: 0, hair: 'mohawk', brow: 'none', mouth: 'line', scar: false },
};
function defaultLook(name, sex) {
  if (STARTER_LOOKS[name]) return { ...STARTER_LOOKS[name] };
  let h = 7; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const of = (a, k) => a[(h >>> k) % a.length];
  return { skin: of(SKINS, 2), hair: of(HAIRS, 5), brow: of(BROWS, 9), mouth: sex === 'f' ? of(MOUTHS, 12) : of(['line', 'grim', 'smirk'], 12), scar: (h >>> 15) % 5 === 0 };
}
export function lookOf(r): AgentLook { if (!r.look) r.look = defaultLook(r.name, r.sex); return { sex: r.sex, mods: r.mods, ...r.look }; }
export function fullAmmo(id) { const w = WEAPONS[id]; return w && w.energy == null ? { mag: w.mag, res: w.mag * (w.mags - 1) } : null; }
export function mkRec(name, sex) { return { name, sex, look: defaultLook(name, sex), alive: true, deploy: true, mods: { arms: 0, legs: 0, chest: 0, eyes: 0, heart: 0, brain: 0 }, slots: ['pistol', null], gear: null, ammo: { pistol: fullAmmo('pistol') }, charges: 0, kills: 0, missions: 0 }; }
export function freshSave() { const k = mkRec('KESTREL', 'm'); k.gear = 'deck'; k.charges = 3; return { cash: 3000, agents: [k, mkRec('ODA', 'f'), mkRec('VANCE', 'm'), mkRec('SAINT', 'f')], avail: START_AVAIL.slice(), done: {}, recruits: 0 }; }
export function store() { try { SAVE.when = new Date().toISOString(); localStorage.setItem(SAVE_KEYS[saveFile], JSON.stringify(SAVE)); } catch (e) {} }
export let SAVE: any = readFile(saveFile) || freshSave();
export function setSAVE(v: typeof SAVE) { return SAVE = v; }
export function recWeight(r) { let w = 0; for (const s of r.slots) if (s) w += WEAPONS[s].w; if (r.gear) w += GEAR[r.gear].w; return w; }
export function ammoCost(r, id) { const w = WEAPONS[id]; if (!w || w.energy != null || !w.ammo) return 0; const a = r.ammo[id] || { mag: 0, res: 0 }; const miss = w.mag * w.mags - (a.mag + a.res); return Math.max(0, Math.ceil(miss / w.mag * w.ammo)); }
export function chargeCost(r) { if (!r.gear || !GEAR[r.gear].charges) return 0; return (GEAR[r.gear].charges - r.charges) * CHARGE_COST; }
export function refill(r, id) { r.ammo[id] = fullAmmo(id); }
