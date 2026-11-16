// Deterministic screenshot scenes behind ?shot=start|play|shop|end. Each
// one plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot (aim at the nearest threat, orbit it
// while firing, detour to nearby ore), so the frame is what a short game
// really looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { EVENT_OVER, EVENT_WAVE_CLEAR } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_SHOP, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const SHOP_LIMIT_SECONDS = 180;
const END_LIMIT_SECONDS = 600;

/** Nearest thing worth shooting: a drone, the boss, then an asteroid. */
function nearestThreat(state) {
  let best = null;
  let bestD = Infinity;
  const consider = (x, y) => {
    const dx = x - state.player.x;
    const dy = y - state.player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = { x, y, d };
    }
  };
  for (const d of state.drones) consider(d.x, d.y);
  if (state.boss) consider(state.boss.x, state.boss.y);
  for (const a of state.asteroids) consider(a.x, a.y);
  return best;
}

function nearestOre(state) {
  let best = null;
  let bestD = Infinity;
  for (const o of state.ores) {
    const dx = o.x - state.player.x;
    const dy = o.y - state.player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = { x: o.x, y: o.y, d };
    }
  }
  return best;
}

/** Skilled pilot: orbit the nearest threat at ~220 px while firing, and
 * sweep up ore when nothing is close — or when the threat is far away. */
function autopilot(state) {
  const ctrl = { mx: 0, my: 0, aimX: state.player.x, aimY: state.player.y - 100, firing: false, well: false };
  const threat = nearestThreat(state);
  const ore = nearestOre(state);
  const oreClose = ore && ore.d < 220 * 220;
  const threatFar = !threat || threat.d > 320 * 320;
  if (oreClose && threatFar) {
    const dist = Math.sqrt(ore.d) || 1;
    ctrl.mx = (ore.x - state.player.x) / dist;
    ctrl.my = (ore.y - state.player.y) / dist;
    ctrl.aimX = threat ? threat.x : ore.x;
    ctrl.aimY = threat ? threat.y : ore.y;
    ctrl.firing = Boolean(threat) && threat.d < 620 * 620;
    return ctrl;
  }
  if (threat) {
    ctrl.aimX = threat.x;
    ctrl.aimY = threat.y;
    ctrl.firing = threat.d < 620 * 620;
    const dist = Math.sqrt(threat.d);
    let tx = threat.x - state.player.x;
    let ty = threat.y - state.player.y;
    if (dist > 240) {
      const inv = 1 / (dist || 1);
      ctrl.mx = tx * inv;
      ctrl.my = ty * inv;
    } else {
      // Orbit: perpendicular to the line to the threat.
      const inv = 1 / (dist || 1);
      ctrl.mx = -ty * inv;
      ctrl.my = tx * inv;
      if (dist < 150) {
        ctrl.mx -= tx * inv * 0.6;
        ctrl.my -= ty * inv * 0.6;
      }
    }
  } else {
    const ore = nearestOre(state);
    if (ore) {
      const dist = Math.sqrt(ore.d) || 1;
      ctrl.mx = (ore.x - state.player.x) / dist;
      ctrl.my = (ore.y - state.player.y) / dist;
      ctrl.aimX = ore.x;
      ctrl.aimY = ore.y;
    } else {
      ctrl.mx = 0.4;
      ctrl.my = 0.2;
    }
  }
  return ctrl;
}

/** Reckless pilot for the end scene: never fires, steers straight into the
 * nearest rock. The belt does the rest. */
function doomedPilot(state) {
  const ctrl = { mx: 0, my: 0, aimX: state.player.x, aimY: state.player.y - 100, firing: false, well: false };
  let best = null;
  let bestD = Infinity;
  for (const a of state.asteroids) {
    const dx = a.x - state.player.x;
    const dy = a.y - state.player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  if (best) {
    const dist = Math.sqrt(bestD) || 1;
    ctrl.mx = (best.x - state.player.x) / dist;
    ctrl.my = (best.y - state.player.y) / dist;
  }
  return ctrl;
}

/**
 * Set `world` to the named scene (start, play, shop or end; any other name
 * is start) and return the screen to draw over it and the best score.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'shop' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, null, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  world.startWave(1);
  if (name === 'play') {
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
      if (world.step(STEP, autopilot(world.state), false) & EVENT_OVER) break;
    }
    const over = world.state.lives === 0;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'shop') {
    for (let i = 0; i < SHOP_LIMIT_SECONDS / STEP; i += 1) {
      const events = world.step(STEP, autopilot(world.state), false);
      if (events & EVENT_WAVE_CLEAR) break;
      if (events & EVENT_OVER) break;
    }
    // A cleared wave with ore to spend is the shop scene; if the pilot died
    // first, the honest frame is the game-over screen instead.
    if (world.state.lives === 0) return { screen: SCREEN_OVER, best: world.state.score };
    return { screen: SCREEN_SHOP, best: world.state.score };
  }  for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
    if (world.step(STEP, doomedPilot(world.state), false) & EVENT_OVER) break;
  }
  const over = world.state.lives === 0;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
