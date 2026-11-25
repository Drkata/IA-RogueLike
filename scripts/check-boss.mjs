// Boss fights in plain Node (no browser): `npm run check:boss`. The real boss, projectiles, player and
// entity manager (instanced batches included) run 90 simulated seconds at levels 10, 20 and 30, so
// every move fires; any exception fails the check. The boss and the player are kept alive.
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

for (const LEVEL of [10, 20, 30]) {
  const scene = new THREE.Scene();
  const lm = new LevelManager(scene);
  const size = mapSizeForLevel(LEVEL);
  const start = lm.generateLevel(size, size, LEVEL);
  const em = new EntityManager(scene);
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000); scene.add(camera);
  const keys = new Set(['Mouse0']);
  const player = new Player(camera, { isKeyDown: (k) => keys.has(k), moveAxis: { x: 0, y: 0 }, getMouseDelta: () => ({ x: 0, y: 0 }), consumeKey: () => false }, lm, em, null);
  player.position.set(lm.gridToWorld(start.x), (start.y || 0) + EYE_HEIGHT, lm.gridToWorld(start.z));
  let hits = 0; player.takeDamage = () => { hits++; };
  player.weapon.infiniteAmmo = true;
  const sp = lm.levelData.bossSpawn;
  const boss = new BossSentinel(new THREE.Vector3(lm.gridToWorld(sp.x), 0, lm.gridToWorld(sp.z)), lm, em, LEVEL);
  boss.takeDamage = () => false; // Kept alive to go through every move
  em.add(boss);
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
    let shots = 0; for (const e of em.entities) if (e.entityType === 'projectile') shots++;
    maxShots = Math.max(maxShots, shots);
  }
  const missing = MOVES.filter(name => !moves.has(name));
  if (missing.length) throw new Error(`Boss niveau ${LEVEL} : attaques jamais lancées en 90 s : ${missing.join(', ')}`);
  console.log(`Boss niveau ${LEVEL} : 90 s sans erreur, les ${MOVES.length} attaques lancées, jusqu'à ${maxShots} projectiles en vol, ${hits} coups reçus`);
}
console.log('OK');
