// The page loads, the debug hook is there and the terminal draws every page.
export default async ({ page, ev, shot, expect }) => {
  const n = await ev(() => window.__wetwire.MISSIONS.length);
  expect(n >= 6, 'at least 6 missions, got ' + n);
  await ev(() => window.__wetwire.showTerminal('contracts'));
  for (const k of ['1', '2', '3', '4', '5']) {
    await page.keyboard.press(k); await page.waitForTimeout(250);
    const p = await ev(() => window.__wetwire.termUI.page);
    expect(p === ['contracts', 'territory', 'squad', 'research', 'system'][+k - 1], 'key ' + k + ' opens its page, got ' + p);
    await shot(p);
  }
  await page.keyboard.press('1'); await page.waitForTimeout(300); await shot('terminal');
  // the theme loads and is set to loop inside the track, after its intro
  const theme = await page.evaluate(async () => {
    const w = window.__wetwire; w.setSound(true);
    for (let i = 0; i < 100 && !w.AU.buf.theme; i++) await new Promise((r) => setTimeout(r, 100));
    w.playMusic('theme', 0.05); await new Promise((r) => setTimeout(r, 200));
    const b = w.AU.buf.theme, s = w.AU.src;
    return b && s ? { dur: b.duration, cur: w.AU.cur, loop: s.loop, ls: s.loopStart, le: s.loopEnd } : null;
  });
  expect(theme && theme.cur === 'theme' && theme.loop, 'theme plays and loops, got ' + JSON.stringify(theme));
  expect(theme.le <= theme.dur && theme.ls < theme.le, 'loop points inside the track, got ' + JSON.stringify(theme));
};
