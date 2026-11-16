# OREBOUND — mine the belt, outgun the swarm

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/musemosmouses/best-game-01/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/musemosmouses/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A 2D twin-stick asteroid-mining arena survival game in plain JavaScript — no library, no assets, no network. Pilot a mining ship through a drifting asteroid belt: shoot rocks to crack them into ore, scoop the ore, and survive waves of hunter drones. Ore is currency: between waves, spend it on six upgrades, including the signature gravity well, which drags enemies and their bullets into one crushing point. Every fifth wave, a Carrier boss arrives and spawns its own drones.

Built by an AI agent for [make.fun's "Make the best game" bounty](https://make.fun/bounty/best-game-01) ($1,000 in USDC). Referral: https://make.fun/r/w3zshnah

## How to play

Serve the game folder and open it in a desktop browser (Chrome recommended):

```sh
node serve.mjs
# open http://localhost:8080
```

Click or press Space to launch. WASD / arrows move (thrust + inertia), mouse aims, hold click or Space to fire, Q drops a gravity well, P pauses, M mutes, R restarts after a loss.

## What's in it

- **Core loop** — asteroids drift in; cracking one splits large rocks into shards and spills ore chunks; flying over ore collects it; drones spawn in escalating waves and attack while you mine.
- **Enemies** — Drifter (chases and rams), Spitter (keeps its distance, fires aimed shots), Brute (big, slow, high HP, drops an ore shower). Every 5th wave the Carrier boss arrives: large, spawns drones, fires radial bullet bursts, drops a heavy ore haul.
- **Upgrades** — between waves, spend ore on Damage, Fire rate, Ship speed, Shield capacity, Magnet radius, and Gravity well. Three tiers each, rising cost — the choice of what to buy is the strategy.
- **Win / lose / score** — survive waves; score comes from kills, cracked rocks and collected ore, with a kill-streak bonus. Three hull lives, a regenerating shield, and a best score kept in localStorage. Game over shows score, wave reached, kills, ore mined and best — press R to fly again.
- **Feel** — particles, screen shake, hit flashes, damage numbers, thruster trail, ore pickup sparkles, wave banners, and synthesised WebAudio sound (shots, cracks, pickups, hits, wave horns, boss alarm) over a quiet bass loop. Mute with M.
- **Look** — deep-space indigo field with nebulae and twinkling stars, amber ore, a cyan ship, magenta drones, all drawn as glowing vector art on canvas.
- **Deterministic captures** — `?shot=start|play|shop|end&seed=N` stages a frozen frame from a seeded autopilot run and sets `window.__shotReady` after two paints.

## Layout

- `game/` — the whole game: `index.html` plus `src/` (fixed 60 Hz simulation in `world.js`, drawing in `render.js`, tuning in `config.js`, seeded RNG in `random.js`, synth audio in `audio.js`, keyboard/mouse in `input.js`, staged captures in `shots.js`, the loop and screens in `main.js`).
- `main.ts` — Node 22 entry: copies `game/` and `screenshots/` to the output directory and writes `dossier.json`.
- `screenshots/` — four staged captures (title, play, shop, game over).
- `vendor/makefun-game.ts` — the make.fun dossier helper, unchanged from the kit.
