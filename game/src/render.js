// OREBOUND renderer: everything the player sees, drawn on one canvas in
// vector style. The playfield is a fixed 1280x720 logical area scaled to
// fit the window; screens are title / play / shop / paused / over.
import { BOSS, FIELD, FONT, ORE, PALETTE, PLAYER, UPGRADES, WELL, upgradeCost } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_SHOP = 'shop';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const SHOP = { x: 210, y: 110, w: 860, h: 500, rowH: 58, rowY0: 196 };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const starRng = createRandom(1337);
  const stars = [];
  for (let i = 0; i < 130; i += 1) {
    stars.push({
      x: starRng.range(0, FIELD.width),
      y: starRng.range(0, FIELD.height),
      r: starRng.range(0.6, 2.2),
      tw: starRng.range(0, Math.PI * 2),
    });
  }
  const nebulae = [
    { x: 260, y: 180, r: 300, color: PALETTE.nebulaA },
    { x: 1020, y: 540, r: 340, color: PALETTE.nebulaB },
    { x: 900, y: 120, r: 220, color: PALETTE.nebulaA },
  ];

  let scale = 1;
  let ox = 0;
  let oy = 0;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    scale = Math.min(w / FIELD.width, h / FIELD.height) * dpr;
    ox = (canvas.width - FIELD.width * scale) / 2;
    oy = (canvas.height - FIELD.height * scale) / 2;
  }

  function toLogical(cx, cy) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    return {
      x: ((cx - rect.left) * dpr - ox) / scale,
      y: ((cy - rect.top) * dpr - oy) / scale,
    };
  }

  function bar(x, y, w, h, frac, color, bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  }

  function drawBackground(state) {
    ctx.fillStyle = PALETTE.field;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const n of nebulae) {
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      g.addColorStop(0, n.color);
      g.addColorStop(1, 'rgba(11,16,48,0)');
      ctx.fillStyle = g;
      ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
    for (const s of stars) {
      const a = 0.35 + 0.4 * Math.abs(Math.sin(state.time * 0.7 + s.tw));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#dfe6ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function poly(points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
  }

  function drawAsteroid(a) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rot);
    const pts = [];
    for (let i = 0; i < a.verts.length; i += 1) {
      const ang = (i / a.verts.length) * Math.PI * 2;
      const r = a.radius * a.verts[i];
      pts.push([Math.cos(ang) * r, Math.sin(ang) * r]);
    }
    poly(pts);
    ctx.fillStyle = a.flash > 0 ? '#e8e2d4' : '#5d5a6e';
    ctx.fill();
    ctx.strokeStyle = '#8a86a0';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#3d3a4e';
    ctx.beginPath();
    ctx.arc(-a.radius * 0.3, a.radius * 0.2, a.radius * 0.22, 0, Math.PI * 2);
    ctx.arc(a.radius * 0.35, -a.radius * 0.25, a.radius * 0.16, 0, Math.PI * 2);
    ctx.fill();
    if (a.hp < a.maxHp) {
      ctx.rotate(-a.rot);
      bar(-a.radius, -a.radius - 12, a.radius * 2, 5, a.hp / a.maxHp, '#ffb02e', '#232742');
    }
    ctx.restore();
  }

  function drawOre(o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);
    ctx.globalAlpha = o.life < 4 ? 0.4 + 0.6 * Math.abs(Math.sin(o.life * 4)) : 1;
    ctx.fillStyle = PALETTE.ore;
    ctx.beginPath();
    ctx.moveTo(0, -ORE.radius);
    ctx.lineTo(ORE.radius * 0.8, 0);
    ctx.lineTo(0, ORE.radius);
    ctx.lineTo(-ORE.radius * 0.8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.oreGlow;
    ctx.beginPath();
    ctx.moveTo(0, -ORE.radius * 0.55);
    ctx.lineTo(ORE.radius * 0.4, 0);
    ctx.lineTo(0, ORE.radius * 0.55);
    ctx.lineTo(-ORE.radius * 0.4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawShip(state) {
    const p = state.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (state.invuln > 0 && Math.floor(state.time * 12) % 2 === 0) ctx.globalAlpha = 0.35;
    if (state.shield > 1) {
      ctx.strokeStyle = `rgba(55,182,255,${0.25 + 0.45 * (state.shield / state.shieldMax)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER.radius + 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.rotate(p.angle);
    if (p.thrust > 0) {
      const flick = 14 + Math.sin(state.time * 40) * 5;
      ctx.fillStyle = '#ff9a3d';
      ctx.beginPath();
      ctx.moveTo(-14, -6);
      ctx.lineTo(-14 - flick, 0);
      ctx.lineTo(-14, 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.ship;
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-14, -13);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-14, 13);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d8fbff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#0b1030';
    ctx.beginPath();
    ctx.arc(6, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawDrone(d, state) {
    ctx.save();
    ctx.translate(d.x, d.y);
    const body = d.flash > 0 ? '#ffffff' : PALETTE.drone;
    const dark = d.kind === 'brute' ? PALETTE.brute : PALETTE.droneDark;
    if (d.kind === 'drifter') {
      const a = Math.atan2(state.player.y - d.y, state.player.x - d.x);
      ctx.rotate(a);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-12, -12);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-12, 12);
      ctx.closePath();
      ctx.fill();
    } else if (d.kind === 'spitter') {
      ctx.rotate(Math.sin(d.wobble) * 0.2);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, d.def.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(0, 0, d.def.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd7f6';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.rotate(d.wobble * 0.15);
      ctx.fillStyle = body;
      ctx.strokeStyle = dark;
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i += 1) {
        const ang = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * d.def.radius * 0.45, Math.sin(ang) * d.def.radius * 0.45);
        ctx.lineTo(Math.cos(ang) * d.def.radius, Math.sin(ang) * d.def.radius);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, d.def.radius * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (d.hp < d.maxHp) {
      bar(d.x - d.def.radius, d.y - d.def.radius - 12, d.def.radius * 2, 5, d.hp / d.maxHp, '#ff4fd8', '#232742');
    }
  }

  function drawBoss(bo) {
    ctx.save();
    ctx.translate(bo.x, bo.y);
    ctx.rotate(bo.rot);
    ctx.fillStyle = bo.flash > 0 ? '#ffffff' : PALETTE.boss;
    ctx.strokeStyle = '#ff8ac2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const ang = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? BOSS.radius : BOSS.radius * 0.72;
      if (i === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
      else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2a0618';
    ctx.beginPath();
    ctx.arc(0, 0, BOSS.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd7f6';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawWorld(state) {
    for (const w of state.wells) {
      const frac = w.t / w.max;
      ctx.strokeStyle = `rgba(150,110,255,${0.25 + 0.55 * frac})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w.x, w.y, WELL.radius * (0.5 + 0.5 * frac), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(120,80,255,0.35)';
      ctx.beginPath();
      ctx.arc(w.x, w.y, 16 + 8 * Math.sin(state.time * 6), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const o of state.ores) drawOre(o);
    for (const a of state.asteroids) drawAsteroid(a);
    for (const d of state.drones) drawDrone(d, state);
    if (state.boss) drawBoss(state.boss);
    ctx.fillStyle = PALETTE.bullet;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.enemyBullet;
    for (const b of state.ebullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    drawShip(state);
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = `bold 15px ${FONT}`;
    for (const f of state.floaters) {
      ctx.globalAlpha = Math.max(0, f.life / 0.9);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawHud(state, best) {
    ctx.textAlign = 'left';
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(`SCORE ${state.score}`, 20, 34);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `15px ${FONT}`;
    ctx.fillText(`BEST ${Math.max(best, state.score)}`, 20, 56);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.ore;
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(`◆ ORE ${state.ore}`, FIELD.width / 2 - 130, 34);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(`WAVE ${Math.max(1, state.wave)}`, FIELD.width / 2 + 60, 34);
    if (state.streak > 1) {
      ctx.fillStyle = '#ff9df0';
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillText(`STREAK ×${state.streak}`, FIELD.width / 2, 60);
    }
    ctx.textAlign = 'right';
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText('HULL', FIELD.width - 230, 26);
    bar(FIELD.width - 220, 14, 200, 12, state.hull / PLAYER.hull, PALETTE.hull, '#1c2a20');
    ctx.fillText('SHIELD', FIELD.width - 230, 48);
    bar(FIELD.width - 220, 36, 200, 12, state.shield / state.shieldMax, PALETTE.shield, '#16283a');
    ctx.fillStyle = PALETTE.ship;
    for (let i = 0; i < state.lives; i += 1) {
      const x = FIELD.width - 220 + i * 26;
      ctx.beginPath();
      ctx.moveTo(x + 10, 66);
      ctx.lineTo(x, 78);
      ctx.lineTo(x + 20, 78);
      ctx.closePath();
      ctx.fill();
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `13px ${FONT}`;
    ctx.fillText('WASD move · mouse aim · hold click / Space to fire · Q gravity well · P pause · M mute', 20, FIELD.height - 16);
    if (state.boss) {
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.boss;
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText('CARRIER', FIELD.width / 2, 92);
      bar(FIELD.width / 2 - 180, 100, 360, 10, state.boss.hp / state.boss.maxHp, PALETTE.boss, '#2a0a1c');
    }
    if (state.bannerT > 0) {
      ctx.globalAlpha = Math.min(1, state.bannerT);
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 44px ${FONT}`;
      ctx.fillText(state.banner, FIELD.width / 2, 190);
      ctx.globalAlpha = 1;
    }
  }

  function dim() {
    ctx.fillStyle = 'rgba(4,6,20,0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawTitle(state, best) {
    dim();
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.ship;
    ctx.font = `bold 96px ${FONT}`;
    ctx.fillText('OREBOUND', FIELD.width / 2, 240);
    ctx.fillStyle = PALETTE.ore;
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText('MINE THE BELT · OUTGUN THE SWARM · SPEND THE ORE', FIELD.width / 2, 288);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `19px ${FONT}`;
    ctx.fillText('Shoot asteroids to crack them open, scoop the ore, and survive the drone waves.', FIELD.width / 2, 340);
    ctx.fillText('Between waves, spend ore on upgrades — including the gravity well,', FIELD.width / 2, 368);
    ctx.fillText('which drags enemies and their bullets into one crushing point.', FIELD.width / 2, 396);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `17px ${FONT}`;
    ctx.fillText('WASD / arrows — move      mouse — aim      hold click / Space — fire', FIELD.width / 2, 448);
    ctx.fillText('Q — drop gravity well      P — pause      M — mute', FIELD.width / 2, 476);
    if (best > 0) {
      ctx.fillStyle = PALETTE.ore;
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText(`BEST SCORE ${best}`, FIELD.width / 2, 528);
    }
    const pulse = 0.6 + 0.4 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillText('CLICK OR PRESS SPACE TO LAUNCH', FIELD.width / 2, 592);
    ctx.globalAlpha = 1;
  }

  function drawShop(state) {
    dim();
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.fillRect(SHOP.x, SHOP.y, SHOP.w, SHOP.h);
    ctx.strokeRect(SHOP.x, SHOP.y, SHOP.w, SHOP.h);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillText(`WAVE ${state.wave} CLEARED — OUTFIT THE SHIP`, FIELD.width / 2, SHOP.y + 46);
    ctx.fillStyle = PALETTE.ore;
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(`◆ ORE ${state.ore}`, FIELD.width / 2, SHOP.y + 78);
    for (let i = 0; i < UPGRADES.length; i += 1) {
      const def = UPGRADES[i];
      const tier = state.upgrades[def.id];
      const y = SHOP.rowY0 + i * SHOP.rowH;
      const cost = tier >= def.max ? null : upgradeCost(def, tier);
      const afford = cost !== null && state.ore >= cost;
      ctx.fillStyle = i % 2 === 0 ? '#171e42' : '#121838';
      ctx.fillRect(SHOP.x + 16, y - 24, SHOP.w - 32, SHOP.rowH - 8);
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 19px ${FONT}`;
      ctx.fillText(`${i + 1}  ${def.name}`, SHOP.x + 34, y + 2);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `16px ${FONT}`;
      ctx.fillText(def.desc, SHOP.x + 330, y + 2);
      for (let t = 0; t < def.max; t += 1) {
        ctx.fillStyle = t < tier ? PALETTE.ship : '#2c3a7a';
        ctx.beginPath();
        ctx.arc(SHOP.x + 640 + t * 22, y - 2, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.textAlign = 'right';
      ctx.font = `bold 18px ${FONT}`;
      if (cost === null) {
        ctx.fillStyle = PALETTE.hull;
        ctx.fillText('MAXED', SHOP.x + SHOP.w - 34, y + 2);
      } else {
        ctx.fillStyle = afford ? PALETTE.ore : PALETTE.danger;
        ctx.fillText(`◆ ${cost}`, SHOP.x + SHOP.w - 34, y + 2);
      }
    }
    ctx.textAlign = 'center';
    const pulse = 0.6 + 0.4 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(`PRESS 1–6 TO BUY  ·  ENTER TO LAUNCH WAVE ${state.wave + 1}`, FIELD.width / 2, SHOP.y + SHOP.h - 22);
    ctx.globalAlpha = 1;
  }

  function drawPaused() {
    dim();
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 52px ${FONT}`;
    ctx.fillText('PAUSED', FIELD.width / 2, 330);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `20px ${FONT}`;
    ctx.fillText('Press P to resume', FIELD.width / 2, 380);
  }

  function drawOver(state, best) {
    dim();
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.danger;
    ctx.font = `bold 64px ${FONT}`;
    ctx.fillText('SHIP LOST', FIELD.width / 2, 210);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillText(`SCORE ${state.score}`, FIELD.width / 2, 272);
    if (state.score >= best && state.score > 0) {
      ctx.fillStyle = PALETTE.ore;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText('★ NEW BEST ★', FIELD.width / 2, 308);
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `20px ${FONT}`;
    const rows = [
      `WAVE REACHED  ${Math.max(1, state.wave)}`,
      `DRONES DESTROYED  ${state.kills}`,
      `ORE MINED  ${state.oreMined}`,
      `BEST SCORE  ${best}`,
    ];
    for (let i = 0; i < rows.length; i += 1) {
      ctx.fillText(rows[i], FIELD.width / 2, 356 + i * 34);
    }
    const pulse = 0.6 + 0.4 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText('PRESS R TO FLY AGAIN', FIELD.width / 2, 540);
    ctx.globalAlpha = 1;
  }

  function hitShop(lx, ly) {
    if (lx < SHOP.x || lx > SHOP.x + SHOP.w || ly < SHOP.y || ly > SHOP.y + SHOP.h) return null;
    for (let i = 0; i < UPGRADES.length; i += 1) {
      const y = SHOP.rowY0 + i * SHOP.rowH;
      if (ly >= y - 24 && ly < y + SHOP.rowH - 8) return { kind: 'buy', index: i };
    }
    if (ly > SHOP.y + SHOP.h - 44) return { kind: 'continue' };
    return null;
  }

  function draw(state, screen, best) {
    resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Shake offset from the sim clock, not Math.random, so a staged frame
    // is reproducible from its seed.
    const sx = state.shake > 0 ? Math.sin(state.time * 61.7) * state.shake * 0.5 : 0;
    const sy = state.shake > 0 ? Math.cos(state.time * 53.3) * state.shake * 0.5 : 0;
    ctx.setTransform(scale, 0, 0, scale, ox + sx * scale, oy + sy * scale);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, FIELD.width, FIELD.height);
    ctx.clip();
    drawBackground(state);
    drawWorld(state);
    ctx.restore();
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_SHOP) drawHud(state, best);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_SHOP) drawShop(state);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best);
  }

  return { draw, toLogical, hitShop };
}
