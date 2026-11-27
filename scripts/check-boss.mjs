// Boss fights in plain Node (no browser): `npm run check:boss`. The real boss, projectiles, player and
// entity manager (instanced batches included) run 90 simulated seconds at levels 10, 20, 30, 50 and 70,
// so every move fires; any exception fails the check. The boss and the player are kept alive. From level
// 30 some moves must come in pairs (combos); at level 70 the player has four Wings pacts and jumps all the
// time, so the anti-air shots must fire; the meteors' burning ground must hurt. Shots in flight stay under
// what an instanced batch draws.
import * as THREE from 'three';
const silent = () => new Proxy(function () {}, { get: () => silent(), apply: () => silent(), construct: () => silent() });
const noop = () => {};
const makeCtx = (c) => new Proxy({}, { get: (t, k) => {
  if (k in t) return t[k];
  if (k === 'createImageData' || k === 'getImageData') return (w, h) => ({ data: new Uint8ClampedArray((typeof w === 'number' ? w : c.width) * (h ?? c.height) * 4), width: c.width, height: c.height });
  if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: noop });
  if (k === 'measureText') return () => ({ width: 10 });
  return noop;
}, set: (t, k, v) => (t[k] = v, true) });
globalThis.window = { AudioContext: silent(), matchMedia: () => ({ matches: false }), screen: { width: 1920, height: 1080 } };
globalThis.Audio = silent();
globalThis.fetch = () => Promise.reject(new Error('offline'));
globalThis.document = { body: { style: {} }, getElementById: () => null, createElement: () => { const c = { width: 1, height: 1, style: {} }; c.getContext = () => makeCtx(c); return c; } };
console.warn = () => {};
let simTime = 0;
performance.now = () => simTime * 1000;
let seed = 5; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const { soundManager } = await import('../src/systems/SoundManager.js');
soundManager.play = () => {};
const { LevelManager } = await import('../src/systems/LevelManager.js');
const { EntityManager } = await import('../src/systems/EntityManager.js');
const { Player, EYE_HEIGHT } = await import('../src/entities/Player.js');
const { BossSentinel } = await import('../src/entities/BossSentinel.js');
const { mapSizeForLevel } = await import('../src/systems/MapGenerator.js');

for (const LEVEL of [10, 20, 30, 50, 70]) {
  const began = Date.now();
  const scene = new THREE.Scene();
  const lm = new LevelManager(scene);
  const size = mapSizeForLevel(LEVEL);
  const start = lm.generateLevel(size, size, LEVEL);
  const em = new EntityManager(scene);
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000); scene.add(camera);
  const keys = new Set(LEVEL === 70 ? ['Mouse0', 'Space'] : ['Mouse0']);
  const player = new Player(camera, { isKeyDown: (k) => keys.has(k), moveAxis: { x: 0, y: 0 }, getMouseDelta: () => ({ x: 0, y: 0 }), consumeKey: () => false }, lm, em, null);
  player.position.set(lm.gridToWorld(start.x), (start.y || 0) + EYE_HEIGHT, lm.gridToWorld(start.z));
  if (LEVEL === 70) player.pactJumpMultiplier = Math.sqrt(1.5) ** 4; // Four Wings pacts: 12 m jumps
  let hits = 0;
  const hurtBy = {};
  player.takeDamage = (amount, source) => { hits++; hurtBy[source] = (hurtBy[source] || 0) + 1; };
  player.weapon.infiniteAmmo = true;
  const sp = lm.levelData.bossSpawn;
  const boss = new BossSentinel(new THREE.Vector3(lm.gridToWorld(sp.x), 0, lm.gridToWorld(sp.z)), lm, em, LEVEL);
  boss.takeDamage = () => false; // Kept alive to go through every move
  // Warning and rest: as before up to level 50, then still shorter; combos 1 in 3 at 30, 1 in 2 at 50, always at 70
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const expected = { 10: [1.5, 2, 0], 30: [1.2, 1.5, 1 / 3], 50: [0.9, 1, 0.5] }[LEVEL];
  if (expected && !(near(boss.tell, expected[0]) && near(boss.rest, expected[1]) && near(boss.comboChance, expected[2]))) throw new Error(`Boss niveau ${LEVEL} : annonce ${boss.tell}, repos ${boss.rest}, combos ${boss.comboChance}`);
  if (LEVEL === 70 && !(boss.tell < 0.9 && boss.tell > 0.5 && boss.rest < 1 && boss.rest > 0.4 && boss.comboChance === 1)) throw new Error(`Boss niveau 70 : annonce ${boss.tell}, repos ${boss.rest}, combos ${boss.comboChance}`);
  if (boss.maxHealth !== 200 * LEVEL) throw new Error(`Boss niveau ${LEVEL} : ${boss.maxHealth} PV`);
  em.add(boss);
  const fired = {};
  const fire = boss._fire;
  boss._fire = function (...args) { fired[args[4]] = (fired[args[4]] || 0) + 1; return fire.apply(this, args); };
  let combos = 0;
  const draw = boss._draw;
  boss._draw = function (not) { if (not) combos++; return draw.call(this, not); };
  // Every kind of move must come up (BossSentinel._nextMove picks them through these methods)
  const MOVES = ['_novaBeats', '_spiralBeats', '_meteorBeats', '_summonBeats', '_stunBeats'];
  const moves = new Set();
  for (const name of MOVES) {
    const beats = boss[name];
    boss[name] = function () { moves.add(name); return beats.call(this); };
  }
  let maxShots = 0;
  for (let f = 0; f < 90 * 60; f++) {
    simTime += 1 / 60;
    player.lookAt(boss.position);
    player.update(1 / 60);
    em.update(1 / 60, player);
    // One batch per colour (the glows of every shape share it)
    const byColor = new Map();
    for (const e of em.entities) if (e.entityType === 'projectile') byColor.set(e.color, (byColor.get(e.color) || 0) + 1);
    maxShots = Math.max(maxShots, ...byColor.values());
  }
  const missing = MOVES.filter(name => !moves.has(name));
  if (missing.length) throw new Error(`Boss niveau ${LEVEL} : attaques jamais lancées en 90 s : ${missing.join(', ')}`);
  if (LEVEL >= 30 && !combos) throw new Error(`Boss niveau ${LEVEL} : aucun combo en 90 s`);
  if (LEVEL === 70 && !fired['Boss : tir anti-aérien']) throw new Error('Boss niveau 70 : aucun tir anti-aérien sur un joueur qui saute à 12 m');
  if (!hurtBy['Boss : sol brûlant']) throw new Error(`Boss niveau ${LEVEL} : le sol brûlant ne blesse jamais`);
  if (maxShots >= 2048) throw new Error(`Boss niveau ${LEVEL} : ${maxShots} projectiles d'une couleur en vol, plus qu'un lot n'en dessine`);
  console.log(`Boss niveau ${LEVEL} : 90 s sans erreur, les ${MOVES.length} attaques lancées, ${combos} combos, jusqu'à ${maxShots} projectiles d'une couleur en vol, ${hits} coups reçus (${hurtBy['Boss : sol brûlant']} du sol brûlant, ${fired['Boss : tir anti-aérien'] || 0} tirs anti-aériens) en ${((Date.now() - began) / 1000).toFixed(1)} s`);
}
console.log('OK');
