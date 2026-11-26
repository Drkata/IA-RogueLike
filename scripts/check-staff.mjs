// The player's staff in plain Node (no browser): `npm run check:staff`. Builds every tier, then plays
// every animation (walk, turn, shots, reload, dry fire, melee, idle twirl) and fails on any broken invariant.
import * as THREE from 'three';
import assert from 'assert/strict';
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => ({ addColorStop: noop }) : noop });
const silent = () => new Proxy(function () {}, { get: () => silent(), apply: () => silent(), construct: () => silent() });
globalThis.window = { AudioContext: silent() };
globalThis.Audio = silent();
globalThis.fetch = () => Promise.reject(new Error('offline'));
globalThis.document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => ctx2d }) };
console.warn = noop;
let simTime = 0;
performance.now = () => simTime * 1000;

const { soundManager, SFX } = await import('../src/systems/SoundManager.js');
const played = [];
soundManager.play = (name) => {
  assert.ok(name in SFX, `unknown sound ${name}`);
  played.push(name);
};
const { Weapon } = await import('../src/entities/Weapon.js');
const { STAFF_TIERS, staffTier } = await import('../src/entities/StaffMesh.js');

const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
camera.rotation.order = 'YXZ';
const weapon = new Weapon(camera);
const lights = () => { let n = 0; camera.traverse(o => { if (o.isLight) n++; }); return n; };

// Every tier: its own design, a small draw-call budget, always in front of the world, one light
STAFF_TIERS.forEach((tier, i) => {
  assert.equal(staffTier(tier.from), i);
  if (i) assert.equal(staffTier(tier.from - 1), i - 1);
  weapon.rebuildMesh(tier.from);
  assert.equal(weapon.tier, i);
  let draws = 0;
  weapon.staff.group.traverse(o => {
    if (!o.isMesh && !o.isSprite) return;
    draws++;
    assert.notEqual(o.onBeforeRender, THREE.Object3D.prototype.onBeforeRender, 'staff part drawn without its depth range');
    if (o.isMesh) assert.ok(o.geometry.attributes.position.count > 0);
  });
  assert.ok(draws <= 10, `tier ${i}: ${draws} draw calls`);
  assert.equal(lights(), 1, 'the crystal light must never be added or removed');
  assert.equal(weapon.gunMesh.children.length, 2, 'old staff left behind'); // Light + staff
});
weapon.reset();
assert.equal(weapon.tier, 0);

// Animations: 60 fps for a while in each situation; the pose stays finite
const dt = 1 / 60;
let maxRoll = 0;
const run = (seconds, speed = 0, each = noop) => {
  for (let f = 0; f < seconds * 60; f++) {
    simTime += dt;
    each();
    weapon.update(dt, speed);
    const g = weapon.gunMesh;
    for (const v of [g.position.x, g.position.y, g.position.z, g.rotation.x, g.rotation.y, g.rotation.z, weapon.staff.orb.material.emissiveIntensity, weapon.staff.glow.scale.x]) {
      assert.ok(Number.isFinite(v), 'pose went NaN');
    }
    maxRoll = Math.max(maxRoll, g.rotation.z);
  }
};

run(2, 8, () => { camera.rotation.y += 0.05; }); // Walking while turning
weapon.currentAmmo = 3;
run(2, 0, () => weapon.shoot()); // Fire until the clip is empty: it reloads by itself
assert.ok(played.includes('reload'), 'no reload after emptying the clip');
run(weapon.reloadTime + 0.1);
assert.ok(played.includes('reloadDone'), 'no sound when the reload ends');
assert.equal(weapon.currentAmmo, weapon.maxAmmo);

weapon.currentAmmo = 0;
weapon.reserveAmmo = 0;
played.length = 0;
run(1, 0, () => weapon.shoot()); // Dry fire, held down for a second
const dry = played.filter(n => n === 'empty').length;
assert.ok(dry >= 2 && dry <= Math.ceil(1 / weapon.fireRate) + 1, `dry fire played ${dry} times in 1 s`);

assert.ok(weapon.melee());
run(1);
assert.ok(!weapon.isMeleeing);

maxRoll = 0;
run(10); // Calm: the staff twirls once
assert.ok(maxRoll > 3, 'no idle twirl');
const g = weapon.gunMesh;
assert.ok(Math.abs(g.position.x - 0.3) < 0.05 && Math.abs(g.position.y + 0.3) < 0.05, 'staff not back at rest');

console.log(`Bâton : ${STAFF_TIERS.length} paliers et toutes les animations OK`);
