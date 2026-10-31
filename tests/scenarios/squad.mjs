// Terminal squad screen: pick an agent, buy a weapon into a slot, switch to cyborg mods.
export default async ({ page, ev, shot, expect }) => {
  await ev(() => { const w = window.__wetwire; w.SAVE.cash = 20000; w.showTerminal('squad'); });
  await page.waitForTimeout(1600);
  await page.click('.agc[data-i="1"] .rn'); await page.click('.slot[data-s="1"]'); await page.click('[data-pick="uzi"]'); await page.click('#buyIt');
  const slots = await ev(() => window.__wetwire.SAVE.agents[1].slots);
  expect(slots[1] === 'uzi', 'uzi in slot 2, got ' + slots);
  await shot('loadout');
  await page.click('[data-sq="mods"]'); await page.waitForTimeout(300);
  expect(await page.locator('.mod').count() === 6, 'six cyborg mods listed');
  await shot('mods');
};
