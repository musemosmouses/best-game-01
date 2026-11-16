// OREBOUND tuning: every number and colour in one place. The playfield is a
// fixed 1280x720 logical area; the renderer scales it to the window, so no
// rule below depends on the screen size.
export const STEP = 1 / 60;

export const FIELD = { width: 1280, height: 720 };

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'orebound.best';

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const PALETTE = {
  backdrop: '#070a1c',
  field: '#0b1030',
  nebulaA: '#1c2a6e',
  nebulaB: '#3a1c5e',
  ship: '#37e6ff',
  shipDark: '#0e7fa8',
  ore: '#ffb02e',
  oreGlow: '#ffd97a',
  drone: '#ff4fd8',
  droneDark: '#a3128a',
  brute: '#ff5f6d',
  boss: '#ff2e88',
  bullet: '#aef6ff',
  enemyBullet: '#ff7ad9',
  text: '#eef2ff',
  muted: '#8b93b8',
  panel: '#121838',
  panelEdge: '#2c3a7a',
  hull: '#3dff8e',
  shield: '#37b6ff',
  danger: '#ff5f6d',
};

export const PLAYER = {
  radius: 16,
  accel: 980,
  maxSpeed: 360,
  drag: 1.7,
  hull: 100,
  shieldMax: 50,
  shieldRegen: 9,
  regenDelay: 3,
  invuln: 1.2,
  fireCooldown: 0.21,
  bulletSpeed: 780,
  bulletDamage: 14,
  magnet: 130,
  lives: 3,
};

export const BULLET = { radius: 4, life: 0.85 };

export const ASTEROID = {
  largeR: [34, 48],
  medR: [20, 30],
  largeHp: 3,
  medHp: 2,
  speed: [40, 115],
  oreMin: 3,
  oreMax: 5,
  score: 10,
  ramDamage: 18,
};

export const ORE = { radius: 7, value: 1, score: 5, life: 25 };

export const DRONES = {
  drifter: { hp: 22, speed: 138, radius: 16, score: 50, ore: 3, ram: 14 },
  spitter: { hp: 18, speed: 96, radius: 15, score: 75, ore: 4, ram: 10, shotSpeed: 265, shotCooldown: 2.4, range: 430 },
  brute: { hp: 96, speed: 58, radius: 30, score: 150, ore: 10, ram: 22 },
};

export const BOSS = {
  hp: 620,
  speed: 44,
  radius: 54,
  score: 500,
  ore: 20,
  ram: 30,
  spawnEvery: 4.5,
  burstEvery: 3.2,
  burstCount: 10,
};

export const WELL = { duration: 4.5, radius: 260, pull: 640, damage: 14 };

/** Between-wave shop: six upgrades, three tiers each, rising cost. */
export const UPGRADES = [
  { id: 'damage', name: 'RAIL DAMAGE', desc: '+30% bullet damage', base: 20, step: 18, max: 3 },
  { id: 'fire', name: 'RAPID CYCLER', desc: '+22% fire rate', base: 20, step: 18, max: 3 },
  { id: 'speed', name: 'ION THRUST', desc: '+15% ship speed', base: 20, step: 15, max: 3 },
  { id: 'shield', name: 'AEGIS SHIELD', desc: '+25 max shield', base: 25, step: 20, max: 3 },
  { id: 'magnet', name: 'TRACTOR MAGNET', desc: '+60% ore pickup radius', base: 15, step: 12, max: 3 },
  { id: 'well', name: 'GRAVITY WELL', desc: 'Q drops a well that drags foes in', base: 30, step: 25, max: 3 },
];

export function upgradeCost(def, tier) {
  return def.base + def.step * tier;
}

/** How many drones a wave fields, and which kinds it may contain. */
export function waveComp(n) {
  const count = 3 + n;
  const kinds = ['drifter'];
  if (n >= 2) kinds.push('spitter');
  if (n >= 3) kinds.push('brute');
  return { count, kinds, boss: n % 5 === 0 };
}
