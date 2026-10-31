// Mission scripts: objectives complete when the target dies, and scripted escapes still work.
export default async ({ ev, log, expect }) => {
  const r = await ev(() => {
    const w = window.__wetwire, out = {};
    const st = (s) => { for (let i = 0; i < s * 30; i++) { w.step(1 / 30); if (w.state !== 'play') break; } };
    const start = (id) => { w.SAVE.agents.forEach((a) => a.deploy = a.alive); w.startMission(w.MISSIONS.find((m) => m.id === id)); };
    const kill = () => { w.target.hp = 1; w.explode(w.target.x, w.target.z, 2, 50, w.agents[0], false); st(1); return w.MS.objs[0].st; };
    for (const id of w.MISSIONS.map((m) => m.id).filter((id) => id !== 'courier' && id !== 'halden')) { start(id); st(2); out['kill_' + id] = kill(); }
    // airfield: left alone, the chairman boards the VTOL and gets away
    start('airfield'); st(180); out.airfield_escape = w.MS.objs[0].st;
    // airfield: hacking the control tower grounds the VTOL
    start('airfield'); const node = w.WORLD.nodes.find((n) => n.type === 'ctower'); node.onHack(node); st(100); out.ground_stop = w.MS.ct > 0;
    // warrens: noise wakes the slum and reinforcements arrive
    start('warrens'); const g0 = w.people.filter((p) => p.fac === 'corp').length, g = w.people.find((p) => p.fac === 'corp');
    g.alerted = true; g.state = 'hunt'; st(10); out.warrens_reinforced = w.people.filter((p) => p.fac === 'corp' && !p.dead).length > g0;
    return out;
  });
  log(JSON.stringify(r));
  for (const [k, v] of Object.entries(r)) if (k.startsWith('kill_')) expect(v === 'done', k + ' objective done, got ' + v);
  expect(r.airfield_escape === 'fail', 'unopposed chairman escapes');
  expect(r.ground_stop, 'ground stop holds the VTOL');
  expect(r.warrens_reinforced, 'warrens reinforcements');
};
