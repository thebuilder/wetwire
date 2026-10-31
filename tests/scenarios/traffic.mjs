// The city keeps moving: pedestrians and cars do not jam, police arrive, player cars route.
export default async ({ ev, log, expect }) => {
  const r = await ev(() => {
    const w = window.__wetwire, st = (s) => { for (let i = 0; i < s * 30; i++) w.step(1 / 30); };
    w.SAVE.agents.forEach((a) => a.deploy = a.alive); w.startMission(w.MISSIONS.find((m) => m.id === 'varga')); st(5);
    const civ = w.people.filter((p) => p.kind === 'civ' && !p.dead), c0 = civ.map((p) => [p.x, p.z]);
    const cars = w.cars.filter((c) => c.driver === 'civ' && !c.wreck), k0 = cars.map((c) => [c.x, c.z]);
    st(10);
    const civStuck = civ.filter((p, i) => !p.dead && Math.hypot(p.x - c0[i][0], p.z - c0[i][1]) < 1).length / civ.length;
    const carStuck = cars.filter((c, i) => Math.hypot(c.x - k0[i][0], c.z - k0[i][1]) < 2).length / cars.length;
    w.dispatchPolice([100, 100]); const pc = w.cars[w.cars.length - 1]; st(40);
    const car = w.cars.find((c) => c.model === 'sedan' && !c.wreck); car.driver = 'player'; car.roam = false;
    const pt = w.driveTo(car, 180, 180); st(40);
    return { civStuck, carStuck, civ: civ.length, cars: cars.length, policeParked: pc.parked, drove: Math.hypot(car.x - pt[0], car.z - pt[1]) };
  });
  log(JSON.stringify(r));
  expect(r.civ > 10 && r.cars > 3, 'city is populated');
  expect(r.civStuck < 0.35, 'pedestrians keep walking');
  expect(r.carStuck < 0.5, 'traffic keeps moving');
  expect(r.policeParked, 'police car arrives and parks');
  expect(r.drove < 6, 'player car reaches its destination');
};
