import '@fontsource/vt323/latin-400.css';
// Load order matters: levels and mission scripts register themselves as they evaluate.
import './core';
import './world_head';
import './city_fns';
import './world_build';
import './layout';
import './levels';
import './levels2';
import './models';
import './world_load';
import './engine';
import './campaign';
import './setup';
import './sim';
import './chaos';
import './missions';
import { $, CFG, REDUCED, U, angDiff, clamp, lerp, renderer } from './core';
import { GW, WORLD, barrels } from './world_head';
import { LEVEL, LEVELS, PEDS, RN } from './layout';
import { PMAX, fxScene, scene } from './models';
import { HK, WX, loadWorld, vecScene } from './world_load';
import { AU, SONGS, DPR, LH, LW, MG, M_BLUR, M_BR, M_COMP, M_COPY, M_FIN, OFF, PPU, RT, S, SH, SW, audioInit, camT, camYaw, camYawTo, computeCams, pass, playMusic, resize, setCamYaw, setCamYawTo, setShake, setSound, sfx, shake, snapCam, toScreen, vecCam } from './engine';
import { MISSIONS, SAVE, WEAPONS, fileInfo, openFile, setSAVE } from './campaign';
import { MS, agents, beams, cars, driveTo, flyers, hackJob, hackOn, hackT, heat, missionT, people, pickups, selected, setBeams, setHackT, setTime, setTimeScale, startMission, state, target, time, timeScale, turrets } from './setup';
import { damageCar, dispatchPolice, explode, hackables, orderJack, spookVarga, startHack, updateAmbient, updateCar, updateDirector, updateParticles, updatePerson, updateRockets, updateTurret } from './sim';
import { drawScanner, fires, scanClick, updateBarrels, updateFires } from './chaos';
import { endMission, fmt, setupAttract, updateMission } from './flow';
import { aimAt, aimLock, cmdAttack, cmdMove, isJack, selAlive, setAimLock, setHack, setSlot, toggleCar, towerUnder } from './commands';
import { holdFire, hover, keys, mouse, selectAll, setHover } from './input';
import { hudTick, targetPos } from './hud';
import { combatApi, setCombatStep } from './combatsim';
import { deploy, openPage, planDef, showTerminal, skipBoot, term, termShown, termUI } from './pages';
import { drawOverlay, hackList, setHackList, uploadCars, uploadCut, uploadFX, uploadLights, uploadPeople, uploadVec } from './present';
import { noiseTick, paused, tipTick } from './tactical';

/* ================================================================ frame */
function step(dt) {
  setTime(time + (dt));
  for (const p of people) updatePerson(p, dt);
  for (const c of cars) updateCar(c, dt);
  for (const t of turrets) updateTurret(t, dt);
  updateRockets(dt); updateParticles(dt); updateAmbient(dt); updateDirector(dt); updateFires(dt); updateBarrels(dt);
  if (state === 'play') updateMission(dt);
  if (people.length > PMAX - 20) { const i = people.findIndex((p) => p.dead && p.kind !== 'agent' && p !== target); if (i >= 0) people.splice(i, 1); }
}
function renderFrame() {
  computeCams();
  U.uTime.value = time; U.uRain.value = CFG.rain * WX.rain;
  uploadLights(); uploadPeople(); uploadCars(); uploadFX(); uploadCut();
  renderer.setRenderTarget(RT.scene); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
  renderer.render(scene, snapCam);
  M_BR.uniforms.tC.value = RT.scene.texture[0]; M_BR.uniforms.uTh.value = 1.0; pass(M_BR, RT.b1);
  M_BLUR.uniforms.tI.value = RT.b1.texture; M_BLUR.uniforms.uDir.value.set(1 / RT.b1.width, 0); pass(M_BLUR, RT.b2);
  M_BLUR.uniforms.tI.value = RT.b2.texture; M_BLUR.uniforms.uDir.value.set(0, 1 / RT.b1.height); pass(M_BLUR, RT.b1);
  M_COPY.uniforms.tI.value = RT.b1.texture; pass(M_COPY, RT.b3);
  M_BLUR.uniforms.tI.value = RT.b3.texture; M_BLUR.uniforms.uDir.value.set(1 / RT.b3.width, 0); pass(M_BLUR, RT.b4);
  M_BLUR.uniforms.tI.value = RT.b4.texture; M_BLUR.uniforms.uDir.value.set(0, 1 / RT.b3.height); pass(M_BLUR, RT.b3);
  const cu = M_COMP.uniforms;
  cu.tC.value = RT.scene.texture[0]; cu.tN.value = RT.scene.texture[1]; cu.tD.value = RT.scene.depthTexture;
  cu.uRes.value.set(LW, LH); cu.uFr.value.set(snapCam.left, snapCam.right, snapCam.bottom, snapCam.top);
  cu.uNear.value = snapCam.near; cu.uFar.value = snapCam.far; cu.uVI.value.copy(snapCam.matrixWorld);
  cu.uUpV.value.set(0, 1, 0).transformDirection(snapCam.matrixWorldInverse);
  cu.uOut.value = CFG.outlines ? 1 : 0; cu.uRefl.value = CFG.refl * WX.wet; cu.uDith.value = CFG.dither; cu.uQ.value = CFG.quant; cu.uLevels.value = CFG.levels;
  cu.uHack.value = hackT; cu.uExp.value = CFG.exposure;
  pass(M_COMP, RT.pix);
  if (U.uRain.value > 0.001) { renderer.setRenderTarget(RT.pix); renderer.render(fxScene, snapCam); }
  const fu = M_FIN.uniforms;
  fu.tP.value = RT.pix.texture; fu.tB1.value = RT.b1.texture; fu.tB2.value = RT.b3.texture;
  fu.uLow.value.set(LW, LH); fu.uS.value = S; fu.uOff.value.copy(OFF); fu.uM.value = MG; fu.uScreen.value.set(SW, SH);
  fu.uBloom.value = CFG.bloom; fu.uCrt.value = REDUCED ? CFG.crt * 0.5 : CFG.crt; fu.uFlash.value = 0; fu.uHack.value = hackT;
  renderer.setRenderTarget(null); pass(M_FIN, null);
  HK.value = hackT;
  if (hackT > 0.01) { uploadVec(); renderer.clearDepth(); renderer.render(vecScene, vecCam); }
  drawOverlay();
}
let last = performance.now(), fpsAcc = 0, fpsN = 0, hudAcc = 0, prevFrame = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(0.25, (now - last) / 1000);
  const rdt = Math.min(0.05, real); last = now;
  fpsAcc += (now - (prevFrame || now)) / 1000; prevFrame = now; fpsN++; if (fpsAcc > 0.5) { $('#fps').textContent = Math.round(fpsN / fpsAcc) + ' FPS'; fpsAcc = 0; fpsN = 0; }
  setHackT(clamp(hackT + (hackOn ? 1 : -1) * real * 4, 0, 1));
  setTimeScale(paused && state === 'play' ? 0 : hackOn ? 0.8 : 1);
  const dt = rdt * timeScale;
  setBeams([]);
  const playing = state === 'play' || state === 'won' || state === 'lost';
  if (playing) {
    if (dt > 0) { step(dt); noiseTick(dt); }
    tipTick(rdt);
    const sp = 26 * rdt * (10 / PPU);
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    if (keys.has('w') || keys.has('arrowup')) { camT.x += fx * sp; camT.z += fz * sp; }
    if (keys.has('s') || keys.has('arrowdown')) { camT.x -= fx * sp; camT.z -= fz * sp; }
    if (keys.has('a') || keys.has('arrowleft')) { camT.x -= rx * sp; camT.z -= rz * sp; }
    if (keys.has('d') || keys.has('arrowright')) { camT.x += rx * sp; camT.z += rz * sp; }
    setCamYaw(camYaw + (angDiff(camYaw, camYawTo) * Math.min(1, rdt * 9)));
    if (Math.abs(angDiff(camYaw, camYawTo)) < 0.002) setCamYaw(camYawTo);
  }
  { const b = LEVEL ? LEVEL.bounds : [0, 0, GW, GW]; camT.x = clamp(camT.x, b[0] - 6, b[2] + 6); camT.z = clamp(camT.z, b[1] - 6, b[3] + 6); }
  setShake(Math.max(0, shake - rdt * 2.5));
  if (!holdFire) setAimLock(null);
  if (holdFire && state === 'play' && !hackOn) {
    const g = aimAt(mouse[0], mouse[1]);
    for (const a of selAlive()) { if (a.inCar || a.link || a.jackTo || isJack(a)) continue; a.fpoint = g; a.fpointT = time + 0.12; a.ftarget = null; }
  }
  if (hackOn && playing) {
    setHackList(hackables());
    let best = null, bd = 18 * DPR; const s = [0, 0, 0];
    for (const u of WORLD.uplinks) { toScreen(u.x, 1.2, u.z, s); const d = Math.hypot(s[0] - mouse[0], s[1] - mouse[1]); if (d < bd) { bd = d; best = { uplink: u, x: u.x, y: 1.2, z: u.z }; } }
    for (const n of hackList) { toScreen(n.x, n.y, n.z, s); const d = Math.hypot(s[0] - mouse[0], s[1] - mouse[1]); if (d < bd) { bd = d; best = n; } }
    setHover(best);
  } else if (!hackOn) setHover(null);
  // the terminal covers the whole window, so it draws instead of the city
  if (termShown()) term.tick(now); else renderFrame();
  hudAcc += rdt; if (hudAcc > 0.12 && playing) { hudAcc = 0; hudTick(); }
  if (state === 'play') drawScanner();
}

/* ================================================================ boot */
$('#scanW').addEventListener('pointerdown', scanClick);
window.addEventListener('resize', resize);
setupAttract();
resize();
requestAnimationFrame(frame);
setCombatStep(step);
window.__wetwire = { combat: combatApi, targetPos, AU, SONGS, playMusic, setSound, term, termUI, showTerminal, openPage, deploy, openFile, fileInfo, endIntro: skipBoot,
  step, startMission, endMission, toggleCar, setHack, cmdMove, cmdAttack, setSlot, orderJack, startHack, hackables, explode, toScreen, resize, CFG, camT, MISSIONS, WEAPONS,
  get SAVE() { return SAVE; }, set SAVE(v) { setSAVE(v); }, get MS() { return MS; }, get WORLD() { return WORLD; }, get time() { return time; }, get missionT() { return missionT; }, get state() { return state; },
  get agents() { return agents; }, get people() { return people; }, get cars() { return cars; }, get pickups() { return pickups; }, get target() { return target; }, get heat() { return heat; }, get hackJob() { return hackJob; },
  get RN() { return RN; }, get PEDS() { return PEDS; }, get LEVEL() { return LEVEL; }, LEVELS, aimAt, towerUnder, get fires() { return fires; }, get barrels() { return barrels; }, loadWorld, dispatchPolice, spookVarga, driveTo, damageCar, get flyers() { return flyers; }, get camYawV() { return camYaw; }, get selected() { return selected; }, set camYaw(v) { setCamYaw(setCamYawTo(v)); }, selectAll, get planDef() { return planDef; },
};
