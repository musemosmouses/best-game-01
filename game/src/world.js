// OREBOUND world: entities, waves, the boss, the shop, and the fixed-step
// update. The simulation only ever reads the seeded RNG and the control
// object passed in, so a fixed seed replays identically.
import { ASTEROID, BOSS, BULLET, DRONES, FIELD, ORE, PLAYER, UPGRADES, WELL, upgradeCost, waveComp } from './config.js';

export const EVENT_OVER = 1;
export const EVENT_WAVE_CLEAR = 2;
export const EVENT_HIT = 4;
export const EVENT_BOSS = 8;

function freshState() {
  return {
    time: 0,
    score: 0,
    ore: 0,
    kills: 0,
    oreMined: 0,
    wave: 0,
    lives: PLAYER.lives,
    hull: PLAYER.hull,
    shield: PLAYER.shieldMax,
    shieldMax: PLAYER.shieldMax,
    invuln: 0,
    sinceHit: 99,
    fireCd: 0,
    wellCharges: 0,
    wellCd: 0,
    upgrades: { damage: 0, fire: 0, speed: 0, shield: 0, magnet: 0, well: 0 },
    player: { x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0, angle: -Math.PI / 2, thrust: 0 },
    bullets: [],
    ebullets: [],
    asteroids: [],
    ores: [],
    drones: [],
    wells: [],
    particles: [],
    floaters: [],
    spawnQueue: [],
    spawnT: 0,
    asteroidT: 0,
    boss: null,
    bossSpawnT: 0,
    bossBurstT: 0,
    waveActive: false,
    waveClear: false,
    banner: '',
    bannerT: 0,
    streak: 0,
    streakT: 0,
    shake: 0,
    over: false,
    sfx: [],
  };
}

export function createWorld(rng) {
  const state = freshState();

  function reset() {
    Object.assign(state, freshState());
  }

  function burst(x, y, color, n, speed, life) {
    for (let i = 0; i < n; i += 1) {
      const a = rng.angle();
      const s = rng.range(speed * 0.3, speed);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rng.range(life * 0.5, life),
        maxLife: life,
        size: rng.range(2, 5),
        color,
      });
    }
  }

  function floater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, life: 0.9 });
  }

  function edgePoint(margin) {
    const side = rng.int(0, 3);
    if (side === 0) return { x: rng.range(0, FIELD.width), y: -margin };
    if (side === 1) return { x: rng.range(0, FIELD.width), y: FIELD.height + margin };
    if (side === 2) return { x: -margin, y: rng.range(0, FIELD.height) };
    return { x: FIELD.width + margin, y: rng.range(0, FIELD.height) };
  }

  function makeAsteroid(size, x, y) {
    const large = size === 'large';
    const [rMin, rMax] = large ? ASTEROID.largeR : ASTEROID.medR;
    const radius = rng.range(rMin, rMax);
    const verts = [];
    for (let i = 0; i < 9; i += 1) verts.push(rng.range(0.72, 1.18));
    const angle = rng.angle();
    const speed = rng.range(ASTEROID.speed[0], ASTEROID.speed[1]);
    return {
      size, radius, verts,
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      hp: large ? ASTEROID.largeHp : ASTEROID.medHp,
      maxHp: large ? ASTEROID.largeHp : ASTEROID.medHp,
      rot: rng.angle(),
      rotSpeed: rng.range(-0.7, 0.7),
      flash: 0,
    };
  }

  function spawnAsteroid() {
    const p = edgePoint(60);
    state.asteroids.push(makeAsteroid(rng.chance(0.55) ? 'large' : 'med', p.x, p.y));
  }

  function spawnOre(x, y, n) {
    for (let i = 0; i < n; i += 1) {
      const a = rng.angle();
      state.ores.push({
        x: x + Math.cos(a) * 8,
        y: y + Math.sin(a) * 8,
        vx: Math.cos(a) * rng.range(30, 90),
        vy: Math.sin(a) * rng.range(30, 90),
        life: ORE.life,
        spin: rng.range(-2, 2),
        rot: rng.angle(),
      });
    }
  }

  function spawnDrone(kind) {
    const def = DRONES[kind];
    const p = edgePoint(40);
    state.drones.push({
      kind, def,
      x: p.x, y: p.y,
      vx: 0, vy: 0,
      hp: def.hp, maxHp: def.hp,
      shotCd: rng.range(1, def.shotCooldown || 2),
      flash: 0,
      wobble: rng.angle(),
    });
  }

  function spawnBoss() {
    const p = edgePoint(90);
    state.boss = {
      x: p.x, y: p.y, vx: 0, vy: 0,
      hp: BOSS.hp, maxHp: BOSS.hp,
      flash: 0,
      rot: 0,
    };
    state.bossSpawnT = BOSS.spawnEvery;
    state.bossBurstT = BOSS.burstEvery;
    state.sfx.push('boss');
  }

  function startWave(n) {
    const comp = waveComp(n);
    state.wave = n;
    state.waveActive = true;
    state.waveClear = false;
    state.spawnQueue = [];
    for (let i = 0; i < comp.count; i += 1) {
      state.spawnQueue.push(rng.pick(comp.kinds));
    }
    state.spawnT = 0.6;
    state.banner = comp.boss ? `WAVE ${n} — CARRIER DETECTED` : `WAVE ${n}`;
    state.bannerT = 2.6;
    state.sfx.push(comp.boss ? 'boss' : 'wave');
    if (comp.boss) spawnBoss();
    if (state.upgrades.well > 0) state.wellCharges = Math.max(state.wellCharges, 1);
  }

  function buyUpgrade(id) {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const tier = state.upgrades[id];
    if (tier >= def.max) return false;
    const cost = upgradeCost(def, tier);
    if (state.ore < cost) return false;
    state.ore -= cost;
    state.upgrades[id] = tier + 1;
    if (id === 'shield') {
      state.shieldMax += 25;
      state.shield = Math.min(state.shieldMax, state.shield + 25);
    }
    if (id === 'well') state.wellCharges += 1;
    state.sfx.push('buy');
    return true;
  }

  function damagePlayer(amount, sx, sy) {
    if (state.invuln > 0 || state.over) return false;
    let rest = amount;
    if (state.shield > 0) {
      const absorbed = Math.min(state.shield, rest);
      state.shield -= absorbed;
      rest -= absorbed;
    }
    if (rest > 0) state.hull -= rest;
    state.sinceHit = 0;
    state.invuln = PLAYER.invuln;
    state.shake = Math.min(14, state.shake + 7);
    state.sfx.push('hit');
    const dx = state.player.x - sx;
    const dy = state.player.y - sy;
    const d = Math.hypot(dx, dy) || 1;
    state.player.vx += (dx / d) * 260;
    state.player.vy += (dy / d) * 260;
    burst(state.player.x, state.player.y, '#ff5f6d', 10, 220, 0.5);
    if (state.hull <= 0) {
      state.lives -= 1;
      burst(state.player.x, state.player.y, '#37e6ff', 30, 380, 0.9);
      burst(state.player.x, state.player.y, '#ffb02e', 16, 260, 0.7);
      state.sfx.push('explosion');
      if (state.lives <= 0) {
        state.over = true;
        state.hull = 0;
      } else {
        state.hull = PLAYER.hull;
        state.shield = state.shieldMax;
        state.invuln = 2.5;
        state.player.x = FIELD.width / 2;
        state.player.y = FIELD.height / 2;
        state.player.vx = 0;
        state.player.vy = 0;
        // Breathing room without a free wave clear: shove the surviving
        // drones back to the edges instead of deleting them, so the wave
        // still has to be defeated to count as cleared.
        for (const d of state.drones) {
          const p = edgePoint(40);
          d.x = p.x;
          d.y = p.y;
          d.vx = 0;
          d.vy = 0;
        }
        state.ebullets.length = 0;
      }
    }
    return true;
  }

  function crackAsteroid(a, index) {
    state.asteroids.splice(index, 1);
    state.score += ASTEROID.score;
    const oreCount = rng.int(ASTEROID.oreMin, ASTEROID.oreMax);
    spawnOre(a.x, a.y, oreCount);
    burst(a.x, a.y, '#8a7a5e', 12, 200, 0.6);
    burst(a.x, a.y, '#ffb02e', 6, 140, 0.5);
    floater(a.x, a.y - a.radius, `+${ASTEROID.score}`, '#eef2ff');
    state.sfx.push('crack');
    if (a.size === 'large') {
      for (let i = 0; i < 2; i += 1) {
        const shard = makeAsteroid('med', a.x + rng.range(-12, 12), a.y + rng.range(-12, 12));
        state.asteroids.push(shard);
      }
    }
  }

  function killDrone(d, index) {
    state.drones.splice(index, 1);
    state.kills += 1;
    state.streak += 1;
    state.streakT = 3;
    const bonus = state.streak > 1 ? (state.streak - 1) * 5 : 0;
    state.score += d.def.score + bonus;
    spawnOre(d.x, d.y, d.def.ore);
    burst(d.x, d.y, '#ff4fd8', 18, 300, 0.7);
    burst(d.x, d.y, '#ffb02e', 6, 180, 0.5);
    floater(d.x, d.y - d.def.radius, `+${d.def.score + bonus}`, '#ff9df0');
    state.shake = Math.min(14, state.shake + 3);
    state.sfx.push('explosion');
  }

  function killBoss() {
    state.score += BOSS.score;
    spawnOre(state.boss.x, state.boss.y, BOSS.ore);
    burst(state.boss.x, state.boss.y, '#ff2e88', 46, 420, 1.1);
    burst(state.boss.x, state.boss.y, '#ffb02e', 20, 300, 0.9);
    floater(state.boss.x, state.boss.y - BOSS.radius, `+${BOSS.score}`, '#ffd97a');
    state.boss = null;
    state.shake = 14;
    state.sfx.push('explosion');
  }

  function stepPlayer(dt, ctrl) {
    const p = state.player;
    const speedTier = state.upgrades.speed;
    const maxSpeed = PLAYER.maxSpeed * (1 + 0.15 * speedTier);
    p.vx += ctrl.mx * PLAYER.accel * dt;
    p.vy += ctrl.my * PLAYER.accel * dt;
    const dragF = Math.max(0, 1 - PLAYER.drag * dt);
    p.vx *= dragF;
    p.vy *= dragF;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > maxSpeed) {
      p.vx = (p.vx / sp) * maxSpeed;
      p.vy = (p.vy / sp) * maxSpeed;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.x < PLAYER.radius) { p.x = PLAYER.radius; p.vx = Math.abs(p.vx) * 0.4; }
    if (p.x > FIELD.width - PLAYER.radius) { p.x = FIELD.width - PLAYER.radius; p.vx = -Math.abs(p.vx) * 0.4; }
    if (p.y < PLAYER.radius) { p.y = PLAYER.radius; p.vy = Math.abs(p.vy) * 0.4; }
    if (p.y > FIELD.height - PLAYER.radius) { p.y = FIELD.height - PLAYER.radius; p.vy = -Math.abs(p.vy) * 0.4; }
    p.angle = Math.atan2(ctrl.aimY - p.y, ctrl.aimX - p.x);
    p.thrust = Math.hypot(ctrl.mx, ctrl.my) > 0.1 ? 1 : 0;
    if (p.thrust > 0 && rng.chance(0.6)) {
      state.particles.push({
        x: p.x - Math.cos(p.angle) * 18,
        y: p.y - Math.sin(p.angle) * 18,
        vx: -Math.cos(p.angle) * 120 + rng.range(-30, 30),
        vy: -Math.sin(p.angle) * 120 + rng.range(-30, 30),
        life: 0.35, maxLife: 0.35, size: 3, color: '#ff9a3d',
      });
    }
    state.invuln = Math.max(0, state.invuln - dt);
    state.sinceHit += dt;
    if (state.sinceHit > PLAYER.regenDelay && state.shield < state.shieldMax) {
      state.shield = Math.min(state.shieldMax, state.shield + PLAYER.shieldRegen * dt);
    }
    state.fireCd -= dt;
    if (ctrl.firing && state.fireCd <= 0) {
      const cooldown = PLAYER.fireCooldown / (1 + 0.22 * state.upgrades.fire);
      state.fireCd = cooldown;
      const spread = 0.05;
      const a = p.angle + rng.range(-spread, spread);
      state.bullets.push({
        x: p.x + Math.cos(p.angle) * 22,
        y: p.y + Math.sin(p.angle) * 22,
        vx: Math.cos(a) * PLAYER.bulletSpeed + p.vx * 0.3,
        vy: Math.sin(a) * PLAYER.bulletSpeed + p.vy * 0.3,
        life: BULLET.life,
      });
      state.sfx.push('shoot');
    }
    state.wellCd -= dt;
    if (ctrl.well && state.wellCharges > 0 && state.wellCd <= 0) {
      state.wellCharges -= 1;
      state.wellCd = 1;
      state.wells.push({ x: p.x, y: p.y, t: WELL.duration, max: WELL.duration });
      state.sfx.push('well');
    }
  }

  function stepBullets(dt) {
    const damage = PLAYER.bulletDamage * (1 + 0.3 * state.upgrades.damage);
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20;
      if (!dead) {
        for (let j = state.asteroids.length - 1; j >= 0; j -= 1) {
          const a = state.asteroids[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          if (dx * dx + dy * dy < (a.radius + BULLET.radius) * (a.radius + BULLET.radius)) {
            a.hp -= 1;
            a.flash = 0.12;
            burst(b.x, b.y, '#c9cedb', 4, 120, 0.3);
            floater(b.x, b.y - 10, `${Math.round(damage)}`, '#aef6ff');
            if (a.hp <= 0) crackAsteroid(a, j);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (let j = state.drones.length - 1; j >= 0; j -= 1) {
          const d = state.drones[j];
          const dx = b.x - d.x;
          const dy = b.y - d.y;
          const r = d.def.radius + BULLET.radius;
          if (dx * dx + dy * dy < r * r) {
            d.hp -= damage;
            d.flash = 0.12;
            burst(b.x, b.y, '#ff9df0', 4, 120, 0.3);
            floater(b.x, b.y - 10, `${Math.round(damage)}`, '#aef6ff');
            if (d.hp <= 0) killDrone(d, j);
            dead = true;
            break;
          }
        }
      }
      if (!dead && state.boss) {
        const bo = state.boss;
        const dx = b.x - bo.x;
        const dy = b.y - bo.y;
        const r = BOSS.radius + BULLET.radius;
        if (dx * dx + dy * dy < r * r) {
          bo.hp -= damage;
          bo.flash = 0.12;
          burst(b.x, b.y, '#ff9df0', 4, 120, 0.3);
          if (bo.hp <= 0) killBoss();
          dead = true;
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
  }

  function stepAsteroids(dt, collidePlayer) {
    for (let i = state.asteroids.length - 1; i >= 0; i -= 1) {
      const a = state.asteroids[i];
      if (!a) continue;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.rot += a.rotSpeed * dt;
      a.flash = Math.max(0, a.flash - dt);
      if (a.x < -a.radius - 20) { a.x = FIELD.width + a.radius + 10; }
      if (a.x > FIELD.width + a.radius + 20) { a.x = -a.radius - 10; }
      if (a.y < -a.radius - 20) { a.y = FIELD.height + a.radius + 10; }
      if (a.y > FIELD.height + a.radius + 20) { a.y = -a.radius - 10; }
      if (!collidePlayer) continue;
      const dx = a.x - state.player.x;
      const dy = a.y - state.player.y;
      const r = a.radius + PLAYER.radius - 4;
      if (dx * dx + dy * dy < r * r) {
        if (damagePlayer(ASTEROID.ramDamage, a.x, a.y)) {
          a.vx = (dx / (Math.hypot(dx, dy) || 1)) * 160;
          a.vy = (dy / (Math.hypot(dx, dy) || 1)) * 160;
        }
      }
    }
    state.asteroidT -= dt;
    const cap = 5 + state.wave;
    if (state.asteroidT <= 0 && state.asteroids.length < cap) {
      spawnAsteroid();
      state.asteroidT = 1.4;
    }
  }

  function stepOres(dt) {
    const p = state.player;
    const magnetR = PLAYER.magnet * (1 + 0.6 * state.upgrades.magnet);
    for (let i = state.ores.length - 1; i >= 0; i -= 1) {
      const o = state.ores[i];
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d < magnetR) {
        const pull = 900 * (1 - d / (magnetR + 1));
        o.vx += (dx / (d || 1)) * pull * dt;
        o.vy += (dy / (d || 1)) * pull * dt;
      } else {
        o.vx *= Math.max(0, 1 - 0.8 * dt);
        o.vy *= Math.max(0, 1 - 0.8 * dt);
      }
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.rot += o.spin * dt;
      o.life -= dt;
      if (d < PLAYER.radius + ORE.radius + 4) {
        state.ores.splice(i, 1);
        state.ore += ORE.value;
        state.oreMined += ORE.value;
        state.score += ORE.score;
        burst(o.x, o.y, '#ffd97a', 5, 120, 0.35);
        state.sfx.push('pickup');
        continue;
      }
      if (o.life <= 0) state.ores.splice(i, 1);
    }
  }

  function stepDrones(dt) {
    const p = state.player;
    for (let i = state.drones.length - 1; i >= 0; i -= 1) {
      const d = state.drones[i];
      // A ram can cost the player a life, and losing a life clears the
      // drone array; the entry may be gone by the time we look at it.
      if (!d) continue;
      d.flash = Math.max(0, d.flash - dt);
      d.wobble += dt * 2;
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      if (d.kind === 'drifter') {
        d.vx += ux * d.def.speed * 2.4 * dt;
        d.vy += uy * d.def.speed * 2.4 * dt;
      } else if (d.kind === 'spitter') {
        const want = 300;
        const toward = dist > want + 40 ? 1 : dist < want - 40 ? -1 : 0;
        d.vx += ux * toward * d.def.speed * 2 * dt;
        d.vy += uy * toward * d.def.speed * 2 * dt;
        d.vx += Math.cos(d.wobble) * 40 * dt;
        d.vy += Math.sin(d.wobble) * 40 * dt;
        d.shotCd -= dt;
        if (d.shotCd <= 0 && dist < d.def.range) {
          d.shotCd = d.def.shotCooldown;
          state.ebullets.push({
            x: d.x + ux * (d.def.radius + 6),
            y: d.y + uy * (d.def.radius + 6),
            vx: ux * d.def.shotSpeed,
            vy: uy * d.def.shotSpeed,
            life: 3.2,
          });
        }
      } else {
        d.vx += ux * d.def.speed * 2 * dt;
        d.vy += uy * d.def.speed * 2 * dt;
      }
      const sp = Math.hypot(d.vx, d.vy);
      const cap = d.def.speed;
      if (sp > cap) {
        d.vx = (d.vx / sp) * cap;
        d.vy = (d.vy / sp) * cap;
      }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (dist < d.def.radius + PLAYER.radius - 2) {
        if (damagePlayer(d.def.ram, d.x, d.y)) {
          d.hp -= 6;
          d.vx = -ux * 180;
          d.vy = -uy * 180;
          if (d.hp <= 0) killDrone(d, i);
        }
      }
    }
    if (state.spawnQueue.length > 0) {
      state.spawnT -= dt;
      if (state.spawnT <= 0) {
        spawnDrone(state.spawnQueue.shift());
        state.spawnT = 0.9;
      }
    }
  }

  function stepBoss(dt) {
    const bo = state.boss;
    if (!bo) return;
    const p = state.player;
    bo.flash = Math.max(0, bo.flash - dt);
    bo.rot += dt * 0.5;
    const dx = p.x - bo.x;
    const dy = p.y - bo.y;
    const dist = Math.hypot(dx, dy) || 1;
    bo.vx += (dx / dist) * BOSS.speed * 2 * dt;
    bo.vy += (dy / dist) * BOSS.speed * 2 * dt;
    const sp = Math.hypot(bo.vx, bo.vy);
    if (sp > BOSS.speed) {
      bo.vx = (bo.vx / sp) * BOSS.speed;
      bo.vy = (bo.vy / sp) * BOSS.speed;
    }
    bo.x += bo.vx * dt;
    bo.y += bo.vy * dt;
    state.bossSpawnT -= dt;
    if (state.bossSpawnT <= 0 && state.drones.length < 6) {
      state.bossSpawnT = BOSS.spawnEvery;
      spawnDrone(rng.chance(0.7) ? 'drifter' : 'spitter');
    }
    state.bossBurstT -= dt;
    if (state.bossBurstT <= 0) {
      state.bossBurstT = BOSS.burstEvery;
      for (let i = 0; i < BOSS.burstCount; i += 1) {
        const a = (i / BOSS.burstCount) * Math.PI * 2 + bo.rot;
        state.ebullets.push({
          x: bo.x + Math.cos(a) * (BOSS.radius + 6),
          y: bo.y + Math.sin(a) * (BOSS.radius + 6),
          vx: Math.cos(a) * 210,
          vy: Math.sin(a) * 210,
          life: 4,
        });
      }
      state.sfx.push('hit');
    }
    if (dist < BOSS.radius + PLAYER.radius - 4) {
      damagePlayer(BOSS.ram, bo.x, bo.y);
    }
  }

  function stepWells(dt) {
    for (let i = state.wells.length - 1; i >= 0; i -= 1) {
      const w = state.wells[i];
      w.t -= dt;
      if (w.t <= 0) {
        state.wells.splice(i, 1);
        continue;
      }
      const pullAt = (e, mass) => {
        const dx = w.x - e.x;
        const dy = w.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d < WELL.radius && d > 12) {
          const f = WELL.pull * (1 - d / WELL.radius) * dt;
          e.vx += (dx / d) * f * mass;
          e.vy += (dy / d) * f * mass;
        }
      };
      for (const d of state.drones) {
        pullAt(d, 1);
        d.hp -= WELL.damage * dt * 0.4;
      }
      for (let j = state.drones.length - 1; j >= 0; j -= 1) {
        if (state.drones[j].hp <= 0) killDrone(state.drones[j], j);
      }
      if (state.boss) {
        pullAt(state.boss, 0.25);
        state.boss.hp -= WELL.damage * dt * 0.3;
        if (state.boss.hp <= 0) killBoss();
      }
      for (const b of state.ebullets) pullAt(b, 0.6);
      for (const a of state.asteroids) pullAt(a, 0.35);
    }
  }

  function stepEBullets(dt) {
    for (let i = state.ebullets.length - 1; i >= 0; i -= 1) {
      const b = state.ebullets[i];
      // As in stepDrones: losing a life clears this array mid-loop.
      if (!b) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const dx = b.x - state.player.x;
      const dy = b.y - state.player.y;
      const r = PLAYER.radius + 5;
      let dead = b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20;
      if (!dead && dx * dx + dy * dy < r * r) {
        damagePlayer(10, b.x, b.y);
        dead = true;
      }
      if (dead) state.ebullets.splice(i, 1);
    }
  }

  function stepFx(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.max(0, 1 - 2 * dt);
      pt.vy *= Math.max(0, 1 - 2 * dt);
      pt.life -= dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const f = state.floaters[i];
      f.y -= 42 * dt;
      f.life -= dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }
    state.shake = Math.max(0, state.shake - 26 * dt);
    state.bannerT = Math.max(0, state.bannerT - dt);
    if (state.streakT > 0) {
      state.streakT -= dt;
      if (state.streakT <= 0) state.streak = 0;
    }
  }

  function step(dt, ctrl, ambient) {
    state.time += dt;
    if (ambient) {
      stepAsteroids(dt, false);
      stepFx(dt);
      return 0;
    }
    if (state.over) return EVENT_OVER;
    stepPlayer(dt, ctrl);
    if (state.over) return EVENT_OVER;
    stepBullets(dt);
    stepAsteroids(dt, true);
    stepOres(dt);
    stepDrones(dt);
    stepBoss(dt);
    stepWells(dt);
    stepEBullets(dt);
    stepFx(dt);
    let events = 0;
    if (state.waveActive && state.spawnQueue.length === 0 && state.drones.length === 0 && !state.boss) {
      state.waveActive = false;
      state.waveClear = true;
      state.banner = `WAVE ${state.wave} CLEARED`;
      state.bannerT = 2.2;
      state.score += 25 * state.wave;
      // Wave-clear salvage: the first shop should always afford the
      // cheapest upgrade, so clearing a wave pays for more than kills.
      state.ore += 8 + state.wave;
      state.sfx.push('wave');
      events |= EVENT_WAVE_CLEAR;
    }
    if (state.over) events |= EVENT_OVER;
    return events;
  }

  return { state, reset, startWave, buyUpgrade, step };
}
