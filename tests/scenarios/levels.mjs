// Every mission loads and runs for 8 simulated seconds with a living city.
export default async ({ ev, shot, log, expect }) => {
  const ids = await ev(() => window.__wetwire.MISSIONS.map((m) => m.id));
  for (const id of ids) {
    const r = await ev((id) => {
      const w = window.__wetwire; w.SAVE.agents.forEach((a) => a.deploy = a.alive);
      w.startMission(w.MISSIONS.find((m) => m.id === id));
      for (let i = 0; i < 30 * 8; i++) w.step(1 / 30);
      return { kind: w.WORLD.kind, state: w.state, agents: w.agents.filter((a) => !a.dead).length, civ: w.people.filter((p) => p.kind === 'civ').length, cars: w.cars.length, target: !!w.target };
    }, id);
    log(id, JSON.stringify(r));
    expect(r.state === 'play', id + ' still playing');
    expect(r.agents > 0, id + ' has living agents');
    expect(r.target, id + ' has a target');
    await shot(id);
  }
};
