// The page loads, the debug hook is there and the terminal opens on every page.
export default async ({ page, ev, shot, expect }) => {
  const n = await ev(() => window.__wetwire.MISSIONS.length);
  expect(n >= 6, 'at least 6 missions, got ' + n);
  await ev(() => window.__wetwire.showTerminal('contracts'));
  for (const k of ['1', '2', '3', '4', '5']) { await page.keyboard.press(k); await page.waitForTimeout(300); }
  await page.keyboard.press('1'); await page.waitForTimeout(600); await shot('terminal');
};
