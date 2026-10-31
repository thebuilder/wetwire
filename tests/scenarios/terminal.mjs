// The whole terminal flow: boot to file select, save files stay apart, typed commands, a contract through to the debrief.
export default async ({ page, ev, shot, expect, log }) => {
  const text = () => ev(() => window.__wetwire.term.screenText().join('\n'));
  const wait = (ms = 150) => page.waitForTimeout(ms);
  // the run harness skips to the file select, so go back to the title
  await ev(() => { const w = window.__wetwire; w.termUI.screen = 'title'; w.termUI.screenT = performance.now(); });
  await wait(1900); await shot('intro');
  await page.keyboard.press('x'); await wait(300);
  expect(await ev(() => window.__wetwire.termUI.screen) === 'title', 'the first key only skips the intro');
  await shot('title');
  await page.keyboard.press('x'); await wait(1500);
  expect(await ev(() => window.__wetwire.termUI.screen) === 'select', 'the next key goes from the title to the file select');
  await shot('select');
  const sel = await text();
  expect(sel.includes('OPERATOR FILE') && sel.includes('EMPTY'), 'file select lists empty files');
  // starting file 2 keeps its progress apart from file 1
  await page.keyboard.press('2'); await wait(1200);
  expect(await ev(() => window.__wetwire.termUI.screen) === 'login', 'opening a file boots the Kessel login');
  expect((await text()).includes('█'), 'login draws the logo');
  await shot('login');
  await wait(2200);
  expect(await ev(() => window.__wetwire.termUI.screen) === 'page' && await ev(() => window.__wetwire.termUI.page) === 'contracts', 'login lands on contracts by itself');
  await ev(() => { const w = window.__wetwire; w.SAVE.cash = 77777; });
  await page.keyboard.type('logout'); await page.keyboard.press('Enter'); await wait();
  expect(await ev(() => window.__wetwire.fileInfo(1).cash) === 77777, 'logging out stores the file');
  await ev(() => window.__wetwire.openFile(0));
  expect(await ev(() => window.__wetwire.SAVE.cash) === 3000, 'file 1 is untouched by file 2');
  await ev(() => window.__wetwire.showTerminal('contracts')); await wait();
  // typed commands, including letters the game itself binds to keys
  await page.keyboard.type('system'); await page.keyboard.press('Enter'); await wait();
  expect(await ev(() => window.__wetwire.termUI.page) === 'system', 'typing a page name opens it');
  const sound = await ev(() => window.__wetwire.AU.on);
  await page.keyboard.type('nonsense map'); await page.keyboard.press('Enter'); await wait(500);
  expect((await text()).includes('UNKNOWN COMMAND'), 'unknown commands say so');
  expect(await ev(() => window.__wetwire.AU.on) === sound && await ev(() => document.querySelector('#lab').hidden), 'typing m and p does not trigger their game keys');
  await page.keyboard.type('oda'); await page.keyboard.press('Enter'); await wait();
  expect(await ev(() => window.__wetwire.termUI.armSel) === 1, 'typing an agent name selects them');
  // pick a contract with the keyboard, then deploy through the bar
  await page.keyboard.press('1'); await wait();
  await page.keyboard.press('Enter'); await wait();
  expect(await ev(() => window.__wetwire.planDef && window.__wetwire.planDef.id) === 'compound', 'enter selects the contract');
  expect(await ev(() => window.__wetwire.termUI.page) === 'squad', 'then goes to the squad');
  await page.keyboard.type('deploy'); await page.keyboard.press('Enter'); await wait(400);
  expect(await ev(() => window.__wetwire.state) === 'play', 'deploy starts the mission');
  expect(await ev(() => document.querySelector('#termS').hidden), 'terminal hides during the mission');
  // end the mission: the debrief locks the menu until continue
  await ev(() => { const w = window.__wetwire; w.endMission('abort'); });
  await wait(900);
  expect(await ev(() => window.__wetwire.termUI.page) === 'debrief', 'mission end opens the debrief');
  await wait(300); await shot('debrief');
  const deb = await text();
  expect(deb.includes('LEDGER') && deb.includes('CONTINUE'), 'debrief draws');
  await page.keyboard.press('3'); await wait();
  expect(await ev(() => window.__wetwire.termUI.page) === 'debrief', 'debrief ignores page keys');
  await page.keyboard.press('Enter'); await wait();
  expect(await ev(() => window.__wetwire.termUI.page) === 'contracts', 'enter continues to contracts');
  // worst case: a full roster with every weapon and long text still fits a small window
  await ev(() => { const w = window.__wetwire, S = w.SAVE; S.cash = 99999999; S.avail = Object.keys(w.WEAPONS); for (const m of w.MISSIONS) S.done[m.id] = true; while (S.agents.length < 8) { const a = JSON.parse(JSON.stringify(S.agents[0])); a.name = 'REPLACEMENT' + S.agents.length; delete a.look; S.agents.push(a); } });
  await page.setViewportSize({ width: 960, height: 600 }); await wait(400);
  for (const p of ['contracts', 'territory', 'squad', 'research', 'system']) { await ev((q) => window.__wetwire.openPage(q), p); await wait(250); await shot('small-' + p); }
  const dims = await ev(() => { const t = window.__wetwire.term, c = document.querySelector('#crt').getBoundingClientRect(), g = document.querySelector('#glass').getBoundingClientRect(); return { cols: t.cols, rows: t.rows, font: t.font, fitsW: c.width <= g.width + 1, fitsH: c.height <= g.height + 1 }; });
  log(JSON.stringify(dims));
  expect(dims.fitsW && dims.fitsH, 'terminal fits a small window, got ' + JSON.stringify(dims));
};
