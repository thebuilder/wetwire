// The combat simulator: sensible outcomes at both extremes, and the real save is untouched.
export default async ({ ev, expect, log, page }) => {
  const r = await ev(async () => {
    const w = window.__wetwire, c = w.combat, before = JSON.stringify(w.SAVE);
    const base = { layout: 'cover', light: 'lit', dist: 30, alert: true, push: true };
    const starter = c.SQUADS.find((s) => s.id === 'starter').agents, late = c.SQUADS.find((s) => s.id === 'late').agents;
    const easy = await c.runBatch({ ...base, squad: starter, enemy: 'militia', count: 1 }, 20);
    const hopeless = await c.runBatch({ ...base, squad: starter, enemy: 'corp', count: 30 }, 6);
    const strong = await c.runBatch({ ...base, squad: late, enemy: 'militia', count: 6 }, 10);
    const turrets = await c.runBatch({ ...base, squad: late, enemy: 'turret', count: 12 }, 6);
    return { easy, hopeless, strong, turrets, same: JSON.stringify(w.SAVE) === before, state: w.state, people: w.people.length };
  });
  log('fight speed: ' + Math.round(r.easy.ms / r.easy.runs) + ' ms each // one militia ' + r.easy.winPct + '%, thirty lasers ' + r.hopeless.winPct + '%');
  expect(r.easy.winPct >= 90, 'four pistols beat one militia, got ' + r.easy.winPct);
  expect(r.hopeless.winPct <= 10, 'four pistols lose to 30 corp, got ' + r.hopeless.winPct);
  expect(r.strong.winPct >= 90, 'a late squad beats six militia, got ' + r.strong.winPct);
  expect(r.turrets.timeouts === 0, 'squads reach and finish turrets, timed out ' + r.turrets.timeouts);
  expect(r.same, 'the simulator leaves the save alone');
  // the tool opens from the terminal and closes cleanly
  await ev(() => { const w = window.__wetwire; w.showTerminal('system'); w.combat.openCombatSim(); });
  await page.waitForTimeout(200);
  expect(await ev(() => !document.querySelector('#simTool').hidden), 'the tool opens');
  await ev(() => window.__wetwire.combat.closeCombatSim());
};
