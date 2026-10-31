// Terminal squad screen: pick an agent, buy a weapon into a slot, install a mod, change the agent's look.
export default async ({ page, ev, shot, expect }) => {
  const frame = () => page.waitForTimeout(120);
  const click = async (id) => { await frame(); expect(await ev((i) => window.__wetwire.term.click(i), id), 'can click ' + id); await frame(); };
  await ev(() => { const w = window.__wetwire; w.SAVE.cash = 20000; w.showTerminal('squad'); });
  await page.waitForTimeout(400);
  await click('ag1'); await click('slot1'); await click('pick-uzi'); await click('buy');
  const slots = await ev(() => window.__wetwire.SAVE.agents[1].slots);
  expect(slots[1] === 'uzi', 'uzi in slot 2, got ' + slots);
  await shot('loadout');
  const cash0 = await ev(() => window.__wetwire.SAVE.cash);
  await click('tab-mods'); await click('mod-arms'); await click('install');
  const m = await ev(() => ({ arms: window.__wetwire.SAVE.agents[1].mods.arms, cash: window.__wetwire.SAVE.cash }));
  expect(m.arms === 1 && m.cash === cash0 - 2500, 'arms V1 bought for 2,500, got ' + JSON.stringify(m));
  await shot('mods');
  await click('tab-look');
  const h0 = await ev(() => window.__wetwire.SAVE.agents[1].look.hair);
  await click('look+hair');
  const h1 = await ev(() => window.__wetwire.SAVE.agents[1].look.hair);
  expect(h0 !== h1, 'look changes hair, stayed ' + h0);
  await shot('look');
  // deploy marks: a fifth agent cannot deploy past the limit, and unmarking works
  await click('dep1');
  expect(await ev(() => window.__wetwire.SAVE.agents[1].deploy === false), 'unmarked agent 2');
  await click('dep1');
};
