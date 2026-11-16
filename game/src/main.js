// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens:
// title, play, shop (between waves), paused and game over.
//
// ?seed=N fixes the belt. ?shot=start|play|shop|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP, UPGRADES } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_OVER, EVENT_WAVE_CLEAR } from './world.js';
import { ACTION_CLICK, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, ACTION_WELL, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_SHOP, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let pendingWell = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and the big moments.
  function announce(message) {
    status.textContent = message;
  }

  function drainSfx() {
    const queue = world.state.sfx;
    if (queue.length === 0) return;
    for (const name of queue.splice(0, queue.length)) audio.play(name);
  }

  function startGame() {
    audio.unlock();
    world.reset();
    world.startWave(1);
    accumulator = 0;
    // Discard any clicks queued while fighting; they are not shop orders.
    input.takeClicks();
    screen = SCREEN_PLAY;
    announce('Playing. Wave 1. Shoot asteroids, collect ore, survive the drones.');
  }

  function openShop() {
    screen = SCREEN_SHOP;
    // Discard clicks queued while fighting (e.g. a held fire button), so
    // opening the shop never spends ore on the row under the cursor.
    input.takeClicks();
    announce(`Wave ${world.state.wave} cleared. Spend ore on upgrades, then launch the next wave.`);
  }

  function launchNextWave() {
    audio.unlock();
    world.startWave(world.state.wave + 1);
    screen = SCREEN_PLAY;
    announce(`Wave ${world.state.wave}.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}. Press R to fly again.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (actions & ACTION_WELL) pendingWell = true;
    for (const index of input.takeDigits()) {
      if (screen === SCREEN_SHOP) {
        const def = UPGRADES[index];
        if (def && world.buyUpgrade(def.id)) announce(`${def.name} upgraded.`);
        else audio.play('deny');
      }
    }
    if (actions & (ACTION_CONFIRM | ACTION_CLICK)) {
      if (screen === SCREEN_TITLE) startGame();
      else if (screen === SCREEN_SHOP && (actions & ACTION_CONFIRM)) launchNextWave();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_OVER || screen === SCREEN_PLAY)) startGame();
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function handleShopClick() {
    for (const click of input.takeClicks()) {
      const logical = renderer.toLogical(click.x, click.y);
      const hit = renderer.hitShop(logical.x, logical.y);
      if (!hit) continue;
      if (hit.kind === 'buy') {
        const def = UPGRADES[hit.index];
        if (def && world.buyUpgrade(def.id)) announce(`${def.name} upgraded.`);
        else audio.play('deny');
      } else if (hit.kind === 'continue') {
        launchNextWave();
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, null, true);
      return;
    }
    const move = input.move();
    const m = input.mouse();
    const logical = renderer.toLogical(m.x, m.y);
    const ctrl = {
      mx: move.x,
      my: move.y,
      aimX: logical.x,
      aimY: logical.y,
      firing: input.firing(),
      well: pendingWell,
    };
    pendingWell = false;
    const events = world.step(STEP, ctrl, false);
    drainSfx();
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_WAVE_CLEAR) openShop();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_SHOP) handleShopClick();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    drainSfx();
    renderer.draw(world.state, screen, best);
    window.__orebound = {
      screen,
      score: world.state.score,
      ore: world.state.ore,
      wave: world.state.wave,
      hull: Math.round(world.state.hull),
      shield: Math.round(world.state.shield),
      lives: world.state.lives,
      kills: world.state.kills,
      drones: world.state.drones.length,
      asteroids: world.state.asteroids.length,
    };
  }

  // Leaving the tab pauses a running game rather than letting drones fire unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('OreBound. Press Space or click to launch.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
