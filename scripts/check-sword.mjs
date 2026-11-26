// The sword and the two-weapon rules in plain Node (no browser): `npm run check:sword`. The Sword alone
// (stats, arc, guard and parry, animations), then the Player's own methods on a stand-in player (strikes,
// shots met by the guard, charged shot), then every pact and upgrade label, and the shop's upgrades.
import * as THREE from 'three';
import assert from 'assert/strict';
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => ({ addColorStop: noop }) : noop });
const silent = () => new Proxy(function () {}, { get: () => silent(), apply: () => silent(), construct: () => silent() });
const element = () => ({ width: 1, height: 1, style: {}, classList: { add: noop, remove: noop, toggle: noop }, getContext: () => ctx2d, addEventListener: noop, appendChild: noop, querySelector: () => element(), querySelectorAll: () => [] });
globalThis.window = { AudioContext: silent(), addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }), innerWidth: 1280, innerHeight: 720 };
globalThis.Audio = silent();
globalThis.fetch = () => Promise.reject(new Error('offline'));
globalThis.document = { createElement: element, getElementById: element, querySelector: element, addEventListener: noop, body: element(), documentElement: element() };
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', maxTouchPoints: 0 }, configurable: true });
globalThis.localStorage = { getItem: () => null, setItem: noop };
globalThis.requestAnimationFrame = noop;
console.warn = noop;
let simTime = 0;
performance.now = () => simTime * 1000;

const { soundManager, SFX } = await import('../src/systems/SoundManager.js');
const played = [];
soundManager.play = (name) => {
  assert.ok(name in SFX, `unknown sound ${name}`);
  played.push(name);
};
soundManager.stop = (name) => assert.ok(name in SFX, `unknown sound ${name}`);
const { Sword, PARRY_WINDOW, PARRY_REARM, GUARD_DAMAGE, RIPOSTE } = await import('../src/entities/Sword.js');
const { Weapon, CHARGE_TIME } = await import('../src/entities/Weapon.js');
const { Player } = await import('../src/entities/Player.js');

const dt = 1 / 60;
const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
camera.rotation.order = 'YXZ';
const sword = new Sword(camera);
const forward = new THREE.Vector3(0, 0, -1);
const origin = new THREE.Vector3(0, 1.6, 0);
const foe = (x, z, radius = 0.5) => ({ position: new THREE.Vector3(x, 1, z), radius });

// Stats and upgrades
assert.equal(sword.damage, 10);
assert.ok(Math.abs(1 / sword.strikeRate - 0.8) < 1e-9, 'a strike every 0.8 s to start with');
assert.equal(sword.reach, 3);
for (const stat of ['meleeDamage', 'attackSpeed', 'reach']) {
  for (let i = 0; i < 10; i++) assert.ok(sword.upgrade(stat));
  assert.ok(!sword.upgrade(stat), `${stat} past its max level`);
}
assert.equal(sword.damage, 160);
assert.equal(sword.reach, 6);
sword.reset();
assert.equal(sword.getTotalLevel(), 0);

// The arc: ahead within reach and 45° each side; never behind; all around with the Whirlwind pact
assert.ok(sword.inArc(origin, forward, foe(0, -3)));
assert.ok(sword.inArc(origin, forward, foe(2, -2.2)), '42° off the view, in reach');
assert.ok(!sword.inArc(origin, forward, foe(3, -1)), '72° off the view');
assert.ok(!sword.inArc(origin, forward, foe(0, -4)), 'beyond reach');
assert.ok(!sword.inArc(origin, forward, foe(0, 2)), 'behind');
sword.whirlwind = 1;
sword.recalculateStats();
assert.ok(sword.inArc(origin, forward, foe(0, 2)), 'Whirlwind strikes behind too');
const whirlReach = sword.reach;
sword.whirlwind = 3;
sword.recalculateStats();
assert.ok(Math.abs(sword.reach - whirlReach * 1.5) < 1e-9, 'each Whirlwind taken again: +25 % reach');
sword.reset();

// Strikes: one per cooldown, not while put away or guarding
sword.holster = 0;
assert.ok(sword.swing());
assert.ok(!sword.swing(), 'cooldown');
let slashSeen = false;
for (let t = 0; t < 0.8; t += dt) {
  sword.update(dt, 0);
  slashSeen ||= sword.slash.visible;
  for (const v of [sword.pose.position.x, sword.pose.rotation.y, sword.pose.rotation.z, sword.slash.material.opacity]) assert.ok(Number.isFinite(v));
}
assert.ok(slashSeen, 'no crescent on a strike');
assert.ok(sword.swing(), 'ready again after its cooldown');
sword.update(1, 0);
sword.holster = 0.5;
assert.ok(!sword.swing(), 'no strike while being taken in hand');
sword.holster = 0;

// Guard: a parry window at its start, then blocking; only from the front; tapping can't hold the window open
const toward = (x, z) => new THREE.Vector3(x, 0, z).normalize(); // A shot's flight direction
sword.setGuard(true);
assert.ok(!sword.swing(), 'no strike while guarding');
assert.equal(sword.meetShot(toward(0, 1), forward), 'parry', 'a shot from ahead at once');
assert.equal(sword.meetShot(toward(0, -1), forward), null, 'a shot from behind');
assert.equal(sword.meetShot(toward(1.2, 1), forward), 'parry', '50° off the view');
for (let t = 0; t <= PARRY_WINDOW; t += dt) sword.update(dt, 0);
assert.equal(sword.meetShot(toward(0, 1), forward), 'block', 'after the window');
sword.setGuard(false);
sword.update(dt, 0);
sword.setGuard(true);
assert.equal(sword.meetShot(toward(0, 1), forward), 'block', `a guard within ${PARRY_REARM} s of the last window`);
sword.setGuard(false);
sword.update(PARRY_REARM, 0);
sword.setGuard(true);
assert.equal(sword.meetShot(toward(0, 1), forward), 'parry', 'the window opens again later');
sword.setGuard(false);
assert.equal(sword.meetShot(toward(0, 1), forward), null, 'no guard, no block');
sword.riposte = 1;
sword.update(PARRY_REARM, 0);
sword.setGuard(true);
sword.meetShot(toward(0, 1), forward);
assert.equal(sword.takeRiposte(), RIPOSTE);
assert.equal(sword.takeRiposte(), 1, 'a riposte is used once');
sword.setGuard(false);
sword.riposte = 2; // Taken twice: two strikes
sword.update(PARRY_REARM, 0);
sword.setGuard(true);
sword.meetShot(toward(0, 1), forward);
assert.deepEqual([sword.takeRiposte(), sword.takeRiposte(), sword.takeRiposte()], [RIPOSTE, RIPOSTE, 1]);
sword.reset();

// Put away: hidden; every part drawn in front of the world
sword.holster = 1;
sword.update(dt, 0);
assert.ok(!sword.model.visible && sword.pose.position.y < -0.6);
let draws = 0;
sword.mesh.traverse(o => {
  if (!o.isMesh && !o.isSprite) return;
  draws++;
  assert.notEqual(o.onBeforeRender, THREE.Object3D.prototype.onBeforeRender, 'sword part drawn without its depth range');
});
assert.ok(draws <= 7, `${draws} draw calls`);

// ─── Player rules, on a stand-in player with the real methods ───
const added = [];
const enemies = [];
const effects = [];
const enemy = (x, z) => {
  const e = { entityType: 'enemy', isDead: false, position: new THREE.Vector3(x, 1, z), radius: 0.5, hp: 1000, ai: { knockback: noop },
    takeDamage(d) { this.hp -= d; return false; } };
  enemies.push(e);
  return e;
};
const pcam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
pcam.rotation.order = 'YXZ';
pcam.position.set(0, 1.6, 0);
const player = Object.assign(Object.create(Player.prototype), {
  camera: pcam, position: pcam.position, yaw: 0, health: 50, maxHealth: 100, vampirism: 0,
  weapon: new Weapon(pcam), sword: new Sword(pcam), activeWeapon: 'sword', chargeLatch: false,
  sessionStats: { damageDealt: 0, kills: 0, critCount: 0, maxDamageHit: 0, shotsFired: 0, healingDone: 0 },
  entityManager: { entities: enemies, add: (e) => added.push(e), createHitEffect: (p) => effects.push(p) },
  levelManager: { pathfinder: { hasLineOfSight: () => true } },
  updateHUD: noop
});
player.sword.holster = 0;
const hurt = [];
player.takeDamage = (amount) => hurt.push(amount);

// A strike hits every enemy in the arc, heals by life steal (player's + Leech), feeds the staff (Greedy blade)
const a = enemy(0, -2);
const b = enemy(1.5, -2);
const behind = enemy(0, 2);
const far = enemy(0, -8);
player.vampirism = 0.1;
player.sword.lifeSteal = 0.1;
player.sword.manaOnHit = 5;
player.weapon.currentAmmo = 0;
player.sword.waves = 1;
player.heal = function (n) { this.health += n; };
player.handleSwing();
assert.equal(a.hp, 990);
assert.equal(b.hp, 990);
assert.equal(behind.hp, 1000);
assert.equal(far.hp, 1000);
assert.equal(player.health, 50 + 2 * 10 * 0.2, 'life steal on both hits');
assert.equal(player.weapon.currentAmmo, 10, '5 mana per enemy struck');
assert.equal(added.length, 1, 'one blade wave');
assert.ok(added[0].isPlayerProjectile && added[0].maxDistance === 8 && added[0].piercing === Infinity && added[0].size > 0);
assert.ok(played.includes('meleeHit'));

// Berserk fury: strikes twice as fast, and 75 % life steal on sword strikes only; gone when it ends
player.activateBerserk(10);
assert.ok(player.weapon.infiniteAmmo && player.weapon.fireRateMultiplier === 2);
player.sword.update(5, 0);
assert.ok(player.sword.swing());
assert.ok(Math.abs(player.sword.cooldown - 1 / (2 * player.sword.strikeRate)) < 1e-9, 'twice as fast');
player.sword.update(5, 0);
player.health = 10;
const furyHp = a.hp;
player.handleSwing();
assert.equal(player.health, 10 + 2 * 10 * (0.2 + 0.75), 'fury life steal on both hits');
assert.equal(a.hp, furyHp - 10);
player._setFury(false); // What the end of the fury (Player.update) and a new run (resetBuffs) call
assert.ok(player.sword.furyMultiplier === 1 && player.sword.furyLifeSteal === 0 && !player.weapon.infiniteAmmo);

// Shots met by the guard: parried back at the shooter (Mirror doubles them), blocked, or not covered
const { Projectile } = await import('../src/entities/Projectile.js');
const shooter = { position: new THREE.Vector3(0, 1.6, -10), isDead: false };
const shot = () => new Projectile(new THREE.Vector3(0, 1.6, -0.8), new THREE.Vector3(0, 0, 1), 10, 20, null, { sourceName: 'Minion', sourceId: 7, source: shooter });
player.sword.mirror = 2;
player.sword.update(PARRY_REARM, 0);
player.sword.setGuard(true);
const parried = shot();
player.takeShot(parried);
assert.ok(!parried.isDead && parried.isPlayerProjectile && parried.damage === 40 && parried.direction.z < -0.99, 'parried back at the shooter, doubled');
assert.equal(hurt.length, 0);
player.sword.update(PARRY_WINDOW + dt, 0);
const blocked = shot();
player.takeShot(blocked);
assert.ok(blocked.isDead && hurt.at(-1) === 20 * GUARD_DAMAGE, 'blocked');
player.sword.setGuard(false);
player.takeShot(shot());
assert.equal(hurt.at(-1), 20, 'no guard: full damage');
player.activeWeapon = 'staff';
player.sword.setGuard(true);
player.takeShot(shot());
assert.equal(hurt.at(-1), 20, 'the staff in hand: full damage');
player.sword.setGuard(false);

// Charged shot: the whole clip in one bolt, a shot's damage per mana, bigger with more mana
const w = player.weapon;
w.refill();
added.length = 0;
for (let t = 0; t < CHARGE_TIME + 3 * dt; t += dt) {
  player.handleCharge(true);
  w.update(dt, 0);
}
assert.equal(added.length, 1, 'one charged bolt');
assert.equal(w.currentAmmo, 0);
const bolt = added[0];
assert.ok(Math.abs(bolt.damage - w.damage * w.maxAmmo) < 1e-9 || bolt.isCritical, 'damage = one shot per mana');
assert.ok(bolt.scale > 1 && bolt.size > 0);
player.handleCharge(true);
assert.ok(!w.charging, 'a new charge takes a new press');
w.refill();
player.handleCharge(false);
player.handleCharge(true);
player.handleCharge(false);
assert.ok(!w.charging && w.currentAmmo === w.maxAmmo, 'let go early: nothing spent');

// ─── Pacts and upgrade labels ───
let game;
try {
  game = await import('../src/core/Game.js');
} catch (e) {
  console.error('Game.js does not load in Node:', e.message);
  process.exit(1);
}
const { PACTS, WEAPON_TAGS } = game;
assert.equal(PACTS.length, 26);
assert.equal(new Set(PACTS.map(p => p.id)).size, 26);
const { SVG_ICONS } = await import('../src/ui/SVGIcons.js');
for (const pact of PACTS) {
  assert.ok(pact.for in WEAPON_TAGS && pact.for !== 'both', `${pact.id}: tag`);
  assert.ok(SVG_ICONS[pact.icon], `${pact.id}: icon`);
  const p = Object.assign(Object.create(Player.prototype), { sessionStats: { kills: 0 } });
  p.resetPacts();
  const pw = new Weapon(new THREE.PerspectiveCamera());
  const ps = new Sword(new THREE.PerspectiveCamera());
  pact.apply(p, pw, ps);
  pw.recalculateStats();
  ps.recalculateStats();
  assert.ok(Number.isFinite(ps.damage) && Number.isFinite(ps.strikeRate) && Number.isFinite(pw.damage), `${pact.id}: stats`);
}
assert.equal(PACTS.filter(p => p.for === 'sword').length, 10);
// Every upgrade says what it works on, has an icon, and its holder has the stat
const holders = { weapon: new Weapon(new THREE.PerspectiveCamera()), sword: new Sword(new THREE.PerspectiveCamera()), player: Object.assign(Object.create(Player.prototype), { stats: { maxHealth: 0, armor: 0, vampirism: 0, regen: 0, speed: 0, immolation: 0, magnet: 0 } }) };
for (const u of game.UPGRADES) {
  assert.ok(u.for in WEAPON_TAGS, `${u.id}: tag`);
  assert.ok(SVG_ICONS[u.id], `${u.id}: icon`);
  assert.equal(holders[u.source].stats[u.id], 0, `${u.id}: not held by ${u.source}`);
}
const tagged = (tag) => game.UPGRADES.filter(u => u.for === tag).map(u => u.id).sort().join(',');
assert.equal(tagged('sword'), 'attackSpeed,meleeDamage,reach');
assert.equal(tagged('both'), 'critChance,critDamage,vampirism');

// Shop: 3 upgrades drawn per visit among those not maxed out, 250 gold each, once
const shopper = Object.assign(Object.create(Player.prototype), { stats: { maxHealth: 0, armor: 0, vampirism: 0, regen: 0, speed: 0, immolation: 0, magnet: 0 },
  weapon: new Weapon(new THREE.PerspectiveCamera()), sword: new Sword(new THREE.PerspectiveCamera()), health: 100, maxHealth: 100, shield: 0, MAX_LEVEL: 10, updateHUD: noop });
const shop = Object.assign(Object.create(game.Game.prototype), { player: shopper });
shop.shopUpgrades = shop._drawShopUpgrades();
assert.equal(new Set(shop.shopUpgrades.map(u => u.item.id)).size, 3);
let offers = shop._shopOffers();
assert.ok(['upgrade0', 'upgrade1', 'upgrade2'].every(id => offers[id].price === 250 && !offers[id].blocked));
assert.ok(!('upgrade' in offers) && !('upgrade10' in offers), 'the old random upgrades are gone');
const first = shop.shopUpgrades[0].item;
offers.upgrade0.buy();
assert.equal(shop._upgradeSource(first).stats[first.id], 1);
offers = shop._shopOffers();
assert.ok(offers.upgrade0.blocked && offers.upgrade0.sold && !offers.upgrade1.blocked, 'each one is bought once');
for (const u of game.UPGRADES) shop._upgradeSource(u).stats[u.id] = 10; // Everything maxed out but two
const [last1, last2] = game.UPGRADES.slice(-2);
shop._upgradeSource(last1).stats[last1.id] = 3;
shop._upgradeSource(last2).stats[last2.id] = 9;
assert.equal(shop._drawShopUpgrades().length, 2, 'only what can still be raised');

// Upgrade cards show the stats with everything lasting: fountains and pacts, not the fury (it passes)
const { num, pct, unit } = await import('../src/ui/format.js');
const hero = Object.assign(Object.create(Player.prototype), { stats: { maxHealth: 0, armor: 0, vampirism: 0, regen: 0, speed: 0, immolation: 0, magnet: 0 },
  weapon: new Weapon(new THREE.PerspectiveCamera()), sword: new Sword(new THREE.PerspectiveCamera()), sessionStats: { kills: 0 }, MAX_LEVEL: 10, updateHUD: noop });
hero.resetPacts();
const menu = Object.assign(Object.create(game.Game.prototype), { player: hero });
const card = (id) => menu._upgradeValues(game.UPGRADES.find(u => u.id === id)).map(v => [v.label, v.now, v.next]);
const seal = (id) => {
  PACTS.find(p => p.id === id).apply(hero, hero.weapon, hero.sword);
  hero.weapon.recalculateStats();
  hero.sword.recalculateStats();
};
const crit = (l) => hero.weapon.getStatValue('critChance', l);
assert.deepEqual(card('maxHealth'), [[null, num(100), num(125)]]);
hero.fountainHp = 30;
assert.deepEqual(card('maxHealth'), [[null, num(130), num(155)]], 'a fountain counts');
seal('colossus'); // ×1.5 max health, ×0.75 staff damage
assert.deepEqual(card('maxHealth'), [[null, num(180), num(217.5)]], 'and a pact');
assert.equal(card('damage')[0][1], num(hero.weapon.damage), 'the card shows the damage the staff deals');
seal('resilience'); // +2 HP/s
assert.deepEqual(card('regen'), [[null, unit(2, 'PV/s'), unit(2.3, 'PV/s')]]);
assert.deepEqual(card('critChance'), [[null, pct(crit(0)), pct(crit(1))]], 'same crits on both weapons: one row');
seal('hunter'); // +25 % crit chance on the staff only
assert.deepEqual(card('critChance'), [['Sceptre', pct(crit(0) + 25), pct(crit(1) + 25)], ['Épée', pct(crit(0)), pct(crit(1))]]);
seal('duelist'); // ×1.5 strikes per second
assert.deepEqual(card('attackSpeed'), [[null, unit(1.25 * 1.5, 'coups/s'), unit(1.375 * 1.5, 'coups/s')]]);
hero._setFury(true);
assert.deepEqual(card('attackSpeed'), [[null, unit(1.25 * 1.5, 'coups/s'), unit(1.375 * 1.5, 'coups/s')]], 'not the fury');
hero.stats.maxHealth = 10;
assert.equal(card('maxHealth')[0][2], 'max');

// Every pact stacks: taken again, its gain grows (the four that were on/off switches, the explosion past 100 %)
const { armorDamageFactor } = await import('../src/entities/Player.js');
const taker = () => {
  const p = Object.assign(Object.create(Player.prototype), { stats: { maxHealth: 0, armor: 0, vampirism: 0, regen: 0, speed: 0, immolation: 0, magnet: 0 },
    weapon: new Weapon(new THREE.PerspectiveCamera()), sword: new Sword(new THREE.PerspectiveCamera()), sessionStats: { kills: 0 } });
  p.resetPacts();
  return p;
};
const takeTwice = (id) => {
  const p = taker();
  const pact = PACTS.find(x => x.id === id);
  pact.apply(p, p.weapon, p.sword);
  const once = { cap: p.pactShieldCap, rate: p.pactShieldRate, wave: p.pactShockwaveDamage, at: p.nextShockwaveAt };
  p.sessionStats.kills = 5;
  pact.apply(p, p.weapon, p.sword);
  return [once, p];
};
let [once, twice] = takeTwice('aegis');
assert.deepEqual([once.cap, twice.pactShieldCap], [40, 60], 'Aegis: +20 shield');
assert.equal(twice.pactShieldRate, once.rate * 1.5, 'Aegis: refills 50 % faster');
[once, twice] = takeTwice('cataclysm');
assert.deepEqual([once.wave, twice.pactShockwaveDamage], [50, 100], 'Cataclysm: +50 damage');
assert.equal(twice.nextShockwaveAt, once.at, 'taken again, the count to the next wave goes on');
[, twice] = takeTwice('whirlwind');
assert.equal(twice.sword.whirlwind, 2);
[, twice] = takeTwice('riposte');
assert.equal(twice.sword.riposte, 2);
// Armor in points, as in League of Legends: never stops it all, below zero adds damage
assert.equal(armorDamageFactor(0), 1);
assert.equal(armorDamageFactor(100), 0.5);
assert.ok(Math.abs(armorDamageFactor(-25) - 1.2) < 1e-9);
assert.ok(armorDamageFactor(1e6) > 0);
const tank = taker();
tank.stats.armor = 10;
for (let i = 0; i < 3; i++) PACTS.find(x => x.id === 'armor').apply(tank, tank.weapon, tank.sword);
tank.recalculateStats();
assert.equal(tank.armor, 125, '10 levels (50) + 3 armor pacts (75)');
assert.deepEqual(card('armor').length, 1);
const { explosionText } = await import('../src/ui/format.js');
assert.equal(explosionText(125), `${pct(100)}, +${pct(25)} dégâts`);

console.log(`Épée : arc, garde, parade, tir chargé et ${PACTS.length} pactes OK ; boutique OK ; cartes avec pactes et fontaines OK ; pactes cumulables et armure OK`);
