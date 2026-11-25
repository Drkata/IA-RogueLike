import * as THREE from 'three';
import { CONSTANTS } from '../core/Constants.js';
import { Weapon } from './Weapon.js';
import { Projectile } from './Projectile.js';
import { soundManager } from '../systems/SoundManager.js';
import { PALETTE } from '../core/Palette.js';

export const EYE_HEIGHT = 1.6; // Player position is the camera, 1.6 above the feet
export const PICKUP_RANGE = 2; // m from the feet: items closer are picked up, the Magnet upgrade pulls from farther
const MAX_LEVEL = 10;
const IMMOLATION_RANGE = 9; // Metres
// Highest rise walked up without jumping, on top of the ramp slope (< 1 m per metre). Anything
// sharper (a ramp's side, a wall top beside a ramp) is a wall face: it takes a jump.
const STEP_UP = 0.3; // m
const AEGIS_DELAY = 4; // s unhurt before the Aegis pact's shield refills
const AEGIS_RATE = 10; // Shield points per second
const STATS_REFRESH = 0.25; // s: the HUD stats ledger is costly to rebuild, so play refreshes it 4 times a second

// Zero-allocation scratch vectors for the per-frame code
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _nextPos = new THREE.Vector3();
const _up = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _toEnemy = new THREE.Vector3();
const _startPos = new THREE.Vector3();
const _wave = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _contact = { normal: new THREE.Vector3(), depth: 0 };
// Body sample points (offsets from the eyes) tested against floating islands: feet, waist, head
const BODY_POINTS = [-EYE_HEIGHT + 0.3, -0.8, 0];

const newUpgradeStats = () => ({ maxHealth: 0, armor: 0, vampirism: 0, regen: 0, speed: 0, meleeDamage: 0, immolation: 0, magnet: 0 });

const newSessionStats = () => ({
    damageDealt: 0,
    shotsFired: 0,
    shotsHit: 0,
    kills: 0,
    startTime: Date.now(),
    critCount: 0,
    maxDamageHit: 0,
    damageTaken: 0,
    healingDone: 0
});

export class Player {
    constructor(camera, input, levelManager, entityManager, hudManager) {
        this.camera = camera;
        this.input = input;
        this.levelManager = levelManager;
        this.entityManager = entityManager;
        this.hudManager = hudManager;
        this.position = new THREE.Vector3(0, EYE_HEIGHT, 0);
        this.velocity = new THREE.Vector3();
        this.camera.position.copy(this.position);
        this.radius = 0.3; // Player collision radius
        this.onGround = true;
        this.invulnerabilityTimer = 0;

        // Euler angles for rotation (yaw, pitch)
        this.yaw = 0;
        this.pitch = 0;

        this.weapon = new Weapon(this.camera);

        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.shield = 0;
        this.armor = 0; // Damage reduction (0-1)
        this.vampirism = 0; // Life steal ratio
        this.regen = 0; // HP per second
        this.speed = CONSTANTS.PLAYER_SPEED;
        this.slowMultiplier = 1.0;
        this.slowTimer = 0;
        this.gold = 0;
        this.magnetRange = this.getStatValue('magnet', 0); // Pickup range, raised by the Magnet upgrade

        this.isBerserk = false;
        this.berserkTimer = 0;
        this.berserkMaxDuration = 15;

        this.stats = newUpgradeStats();
        this.sessionStats = newSessionStats();
        this.damageLog = []; // Death Recap Log
        this.isDeadCallbackTriggered = false;
        this.statsRefresh = 0;
        this.MAX_LEVEL = MAX_LEVEL;
        this.resetPacts();

        this.updateHUD();
    }

    // Permanent modifiers granted by altar pacts
    resetPacts() {
        this.pactHpMultiplier = 1.0;
        this.pactSpeedMultiplier = 1.0;
        this.pactArmorBonus = 0;
        this.pactVampirism = 0;
        this.healthRegen = 0; // Flat HP/s from pacts (negative = drain)
        this.pactJumpMultiplier = 1.0;
        this.pactGoldMultiplier = 1.0; // Gold picked up
        this.pactPotionMultiplier = 1.0; // Health potions picked up
        this.pactShockwaveKills = 0; // Cataclysm: a shockwave every this many kills (0: none)
        this.nextShockwaveAt = 0; // Kill count of the next one
        this.pactImmolation = 0; // Extra burning aura damage per second
        this.pactShieldCap = 0; // Aegis: the shield refills up to this after a while unhurt (0: none)
        this.sinceHurt = 0; // s since the last hit
    }

    // True if the player is within `radius` horizontally of `pos` and on the same floor (pos.y = floor height)
    isNear(pos, radius) {
        const dx = this.position.x - pos.x;
        const dz = this.position.z - pos.z;
        return dx * dx + dz * dz < radius * radius && Math.abs(this.position.y - EYE_HEIGHT - pos.y) < 1.5;
    }

    takeDamage(amount, sourceName = 'Unknown', sourceId = -1) {
        if (this.invulnerabilityTimer > 0) return;
        this.sinceHurt = 0;

        // Shield absorbs first
        const absorbed = Math.min(this.shield, amount);
        this.shield -= absorbed;
        const remainingDamage = amount - absorbed;
        if (remainingDamage <= 0) {
            this.updateHUD();
            return;
        }

        // Armor reduction (max 80%)
        const finalDamage = remainingDamage * (1 - Math.min(0.8, this.armor));
        this.sessionStats.damageTaken += finalDamage;
        this.damageLog.push({ source: sourceName, id: sourceId, damage: finalDamage, timestamp: Date.now() });

        this.health = Math.max(0, this.health - finalDamage);
        this.updateHUD();
        if (this.hudManager) this.hudManager.onDamage();
        soundManager.play('playerHurt');
        this.invulnerabilityTimer = 0.5;

        // Simple red flash effect
        document.body.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
        setTimeout(() => document.body.style.backgroundColor = 'black', 100);

        if (this.health <= 0) this._die();
    }

    _die() {
        if (this.isDeadCallbackTriggered) return;
        this.isDeadCallbackTriggered = true;
        window.game.gameOver(this.damageLog);
    }

    reset() {
        this.health = 100;
        this.shield = 0;
        this.gold = 0;
        this.position.set(0, EYE_HEIGHT, 0);
        this.velocity.set(0, 0, 0);
        this.onGround = true;
        this.yaw = 0;
        this.pitch = 0;
        this.camera.rotation.set(0, 0, 0);
        this.isDeadCallbackTriggered = false;

        this.stats = newUpgradeStats();
        this.sessionStats = newSessionStats();
        this.damageLog = [];
        this.resetPacts();

        if (this.immolationRing) {
            this.entityManager.scene.remove(this.immolationRing);
            this.immolationRing.geometry.dispose();
            this.immolationRing.material.dispose();
            this.immolationRing = null;
        }

        this.weapon.reset();
        this.resetBuffs();
        this.recalculateStats();
    }

    resetBuffs() {
        this.isBerserk = false;
        this.berserkTimer = 0;
        this.weapon.infiniteAmmo = false;
        this.weapon.fireRateMultiplier = 1.0;
        this.updateHUD();
    }

    heal(amount) {
        const oldHealth = this.health;
        this.health = Math.min(this.maxHealth, this.health + amount);
        const effectiveHeal = this.health - oldHealth;
        if (effectiveHeal > 0) this.sessionStats.healingDone += effectiveHeal;
        this.updateHUD();
    }

    addShield(amount) {
        this.shield += amount;
        this.updateHUD();
    }

    applySlow(multiplier, duration) {
        this.slowMultiplier = multiplier;
        this.slowTimer = duration;
    }

    addGold(amount) {
        this.gold += amount;
        this.updateHUD();
    }

    spendGold(amount) {
        this.gold = Math.max(0, this.gold - amount);
        this.updateHUD();
    }

    activateBerserk(duration) {
        this.isBerserk = true;
        this.berserkTimer = duration;
        this.berserkMaxDuration = duration;
        this.weapon.infiniteAmmo = true;
        this.weapon.fireRateMultiplier = 2.0;
        this.updateHUD();
    }

    updateHUD(withStats = true) {
        if (!this.hudManager) return;
        this.hudManager.updateHealth(this.health, this.maxHealth, this.shield);
        this.hudManager.updateAmmo(this.weapon.currentAmmo, this.weapon.reserveAmmo);
        if (withStats) this.hudManager.updateStats(this);
        this.hudManager.updateGold(this.gold);
        this.hudManager.updateBerserk(this.isBerserk, this.berserkTimer, this.berserkMaxDuration);
    }

    update(dt) {
        if (this.invulnerabilityTimer > 0) this.invulnerabilityTimer -= dt;

        if (this.slowTimer > 0) {
            this.slowTimer -= dt;
            if (this.slowTimer <= 0) this.slowMultiplier = 1.0;
        }

        if (this.isBerserk) {
            this.berserkTimer -= dt;
            if (this.berserkTimer <= 0) {
                this.isBerserk = false;
                this.weapon.infiniteAmmo = false;
                this.weapon.fireRateMultiplier = 1.0;
            }
        }

        this.handleRotation();
        this.handleMovement(dt);

        if (this.input.isKeyDown('Mouse0')) this.handleShooting();
        if (this.input.isKeyDown('Mouse1')) this.handleMelee();
        if (this.input.isKeyDown('KeyR')) this.weapon.reload();

        this.weapon.update(dt);
        this.updateImmolation(dt);

        // Cataclysm pact: every few kills, a shockwave from the player's feet
        if (this.pactShockwaveKills && this.sessionStats.kills >= this.nextShockwaveAt) {
            this.nextShockwaveAt = this.sessionStats.kills + this.pactShockwaveKills;
            this.entityManager.shockwave(_wave.set(this.position.x, this.position.y - EYE_HEIGHT, this.position.z));
        }

        // Aegis pact: after a few seconds unhurt, the shield refills up to its cap
        this.sinceHurt += dt;
        if (this.sinceHurt > AEGIS_DELAY && this.shield < this.pactShieldCap) {
            this.shield = Math.min(this.pactShieldCap, this.shield + AEGIS_RATE * dt);
        }

        // Regeneration / pact drain (the drain can kill)
        const totalRegen = this.regen + this.healthRegen;
        if (totalRegen > 0 && this.health < this.maxHealth) {
            this.heal(totalRegen * dt);
        } else if (totalRegen < 0) {
            this.health = Math.max(0, this.health + totalRegen * dt);
            if (this.health <= 0) this._die();
        }

        this.statsRefresh -= dt;
        const refreshStats = this.statsRefresh <= 0;
        if (refreshStats) this.statsRefresh = STATS_REFRESH;
        this.updateHUD(refreshStats);
    }

    // Burning ring: 5 damage per second per upgrade level (+ Pyre pact) to enemies within IMMOLATION_RANGE, in 0.5 s ticks
    updateImmolation(dt) {
        const dps = this.getStatValue('immolation', this.stats.immolation) + this.pactImmolation; // Upgrade + Pyre pact
        if (dps <= 0) {
            if (this.immolationRing) this.immolationRing.visible = false;
            return;
        }

        if (!this.immolationRing) {
            const ringGeom = new THREE.RingGeometry(IMMOLATION_RANGE - 0.1, IMMOLATION_RANGE, 96);
            ringGeom.rotateX(-Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({
                color: PALETTE.emberBright,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.6,
                depthWrite: false
            });
            this.immolationRing = new THREE.Mesh(ringGeom, ringMat);
            this.entityManager.scene.add(this.immolationRing);
            this.immolationTimer = 0;
            this.immolationPulseTimer = 0;
        }

        const ring = this.immolationRing;
        ring.visible = true;
        ring.position.set(this.position.x, this.position.y - EYE_HEIGHT + 0.05, this.position.z);
        this.immolationPulseTimer += dt * 4.0;
        const pulse = 1.0 + Math.sin(this.immolationPulseTimer) * 0.04;
        ring.scale.set(pulse, 1.0, pulse);
        ring.rotation.y += dt * 0.5;

        this.immolationTimer += dt;
        if (this.immolationTimer < 0.5) return;
        this.immolationTimer = 0;

        const damage = dps * 0.5; // One tick every 0.5 s
        for (const entity of this.entityManager.entities) {
            if (entity.entityType === 'enemy' && !entity.isDead && this.position.distanceTo(entity.position) < IMMOLATION_RANGE) {
                entity.takeDamage(damage);
            }
        }
    }

    // Staff bash: hits the closest enemy in a 45° cone within 3m and knocks it back
    handleMelee() {
        if (!this.weapon.melee()) return;
        soundManager.play('melee');

        const range = 3.0;
        const damage = 10 + this.stats.meleeDamage * 15;
        _forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);

        let closestEnemy = null;
        let closestDist = Infinity;
        for (const entity of this.entityManager.entities) {
            if (entity.entityType !== 'enemy' || entity.isDead) continue;
            _toEnemy.subVectors(entity.position, this.camera.position);
            const dist = _toEnemy.length();
            if (dist < range + entity.radius && dist < closestDist && _toEnemy.angleTo(_forward) < Math.PI / 4) {
                closestDist = dist;
                closestEnemy = entity;
            }
        }
        if (!closestEnemy) return;

        closestEnemy.takeDamage(damage);
        if (closestEnemy.ai) {
            closestEnemy.ai.knockback(closestEnemy.position.x - this.camera.position.x, closestEnemy.position.z - this.camera.position.z, 1.0);
        }
        soundManager.play('meleeHit', closestEnemy.position);
    }

    handleShooting() {
        const count = this.weapon.shoot();
        if (count <= 0) return;

        this.sessionStats.shotsFired += count;
        soundManager.play('shoot');

        const w = this.weapon;
        const totalArcRad = THREE.MathUtils.degToRad(w.arc || 0);
        _up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);

        for (let i = 0; i < count; i++) {
            // Multishot fans out evenly over the arc; a single shot with an arc spreads randomly
            let angle = 0;
            if (count > 1) angle = -totalArcRad / 2 + totalArcRad * (i / (count - 1));
            else if (totalArcRad > 0) angle = (Math.random() - 0.5) * totalArcRad;

            _dir.set(0, 0, -1).applyQuaternion(this.camera.quaternion).applyAxisAngle(_up, angle).normalize();

            const isCritical = Math.random() < w.critChance;
            _startPos.copy(this.camera.position).addScaledVector(_dir, 0.5);

            this.entityManager.add(new Projectile(_startPos, _dir, w.projectileSpeed, isCritical ? w.damage * w.critDamage : w.damage, this.levelManager, {
                piercing: w.piercing,
                isCritical,
                knockback: w.knockback,
                explosion: w.explosion,
                sourceName: 'Player',
                sourceId: -1,
                maxDistance: w.range,
                ricochet: w.ricochet,
                homingLevel: w.stats.homing
            }));
        }
    }

    handleRotation() {
        const mouseDelta = this.input.getMouseDelta();
        this.yaw -= mouseDelta.x * CONSTANTS.PLAYER_SENSITIVITY;
        this.pitch -= mouseDelta.y * CONSTANTS.PLAYER_SENSITIVITY;
        this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch)); // Look up/down limit
        this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }

    // Point the camera at a world position
    lookAt(target, keepLevel = false) {
        const dx = target.x - this.position.x;
        const dz = target.z - this.position.z;
        const dy = target.y - this.position.y;
        this.yaw = Math.atan2(-dx, -dz); // Matches the camera's (0, 0, -1) forward
        this.pitch = keepLevel ? 0 : -Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
        this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }

    handleMovement(dt) {
        const speed = this.speed * this.slowMultiplier;
        _forward.set(0, 0, -1).applyAxisAngle(_yAxis, this.yaw);
        _right.set(1, 0, 0).applyAxisAngle(_yAxis, this.yaw);

        _moveDir.set(0, 0, 0);
        if (this.input.isKeyDown('KeyW')) _moveDir.add(_forward);
        if (this.input.isKeyDown('KeyS')) _moveDir.sub(_forward);
        if (this.input.isKeyDown('KeyA')) _moveDir.sub(_right);
        if (this.input.isKeyDown('KeyD')) _moveDir.add(_right);
        // Touch stick: analog, a partial push walks slower
        const axis = this.input.moveAxis;
        _moveDir.addScaledVector(_forward, axis.y).addScaledVector(_right, axis.x);
        const len = _moveDir.length();
        if (len > 0) _moveDir.multiplyScalar(speed * Math.min(1, len) / len);

        this.velocity.x = _moveDir.x;
        this.velocity.z = _moveDir.z;

        if (this.onGround && this.input.isKeyDown('Space')) {
            this.velocity.y = CONSTANTS.JUMP_FORCE * this.pactJumpMultiplier;
            this.onGround = false;
            soundManager.play('jump');
        }
        this.velocity.y -= CONSTANTS.GRAVITY * dt;

        _nextPos.copy(this.position).addScaledVector(this.velocity, dt);

        // Walls of the floor we stand on push the player out (depenetration)
        const lm = this.levelManager;
        const feetY = this.position.y - EYE_HEIGHT;
        const checkY = lm.getCollisionCheckY(lm.getFloorHeight(this.position.x, this.position.z, feetY), feetY);
        lm.resolveCircleCollision(_nextPos, this.radius, checkY);
        // A floor too high above the feet stops the move (it used to lift the player up at once);
        // the player slides along it on one axis when that one is free
        const feetNext = _nextPos.y - EYE_HEIGHT;
        if (this._tooHigh(_nextPos.x, _nextPos.z, checkY, feetNext)) {
            if (!this._tooHigh(_nextPos.x, this.position.z, checkY, feetNext)) _nextPos.z = this.position.z;
            else if (!this._tooHigh(this.position.x, _nextPos.z, checkY, feetNext)) _nextPos.x = this.position.x;
            else _nextPos.set(this.position.x, _nextPos.y, this.position.z);
        }
        this.position.x = _nextPos.x;
        this.position.z = _nextPos.z;

        // Ground check at the resolved horizontal position, then floating islands
        const floorY = lm.getFloorHeight(this.position.x, this.position.z, checkY);
        let grounded = _nextPos.y < floorY + EYE_HEIGHT;
        this.position.y = grounded ? floorY + EYE_HEIGHT : _nextPos.y;
        if (this._pushOutOfSky()) grounded = true;

        if (grounded) {
            if (!this.onGround && this.velocity.y < -6) soundManager.play('land'); // Not on ramp bumps
            this.velocity.y = 0;
            // A footstep every 2.2 m walked
            this.stepDistance = (this.stepDistance || 0) + Math.hypot(this.velocity.x, this.velocity.z) * dt;
            if (this.stepDistance > 2.2) {
                this.stepDistance = 0;
                soundManager.play('footstep');
            }
        }
        this.onGround = grounded;

        this.camera.position.copy(this.position);
    }

    // True if the floor at (x, z) rises above the feet by more than a step plus the ramp slope over the
    // distance moved. Feet already above it (jumping onto it) pass.
    _tooHigh(x, z, checkY, feetY) {
        const moved = Math.hypot(x - this.position.x, z - this.position.z);
        return this.levelManager.getFloorHeight(x, z, checkY) - feetY > STEP_UP + moved;
    }

    // Floating islands and bridges are solid: push the body out of them.
    // Returns true when something below holds the player up.
    _pushOutOfSky() {
        const sky = this.levelManager.skyColliders;
        if (!sky) return false;
        let supported = false;
        for (let pass = 0; pass < 2; pass++) {
            for (const offset of BODY_POINTS) {
                if (!sky.probe(this.position.x, this.position.y + offset, this.position.z, this.radius, _contact)) continue;
                this.position.addScaledVector(_contact.normal, _contact.depth);
                if (_contact.normal.y > 0.6) supported = true;
                else if (_contact.normal.y < -0.6 && this.velocity.y > 0) this.velocity.y = 0; // Head bump
            }
        }
        return supported;
    }

    getMaxLevel() {
        return this.MAX_LEVEL;
    }

    upgrade(stat) {
        if (this.stats[stat] === undefined || this.stats[stat] >= this.getMaxLevel(stat)) return false;
        this.stats[stat]++;
        this.recalculateStats();
        return true;
    }

    recalculateStats() {
        // Max Health: +25 per level, heal the difference so the upgrade feels good immediately
        const oldMax = this.maxHealth;
        this.maxHealth = Math.max(25, this.getStatValue('maxHealth', this.stats.maxHealth) * this.pactHpMultiplier);
        if (this.maxHealth > oldMax) this.health += this.maxHealth - oldMax;
        this.health = Math.min(this.health, this.maxHealth);

        this.armor = this.getStatValue('armor', this.stats.armor) / 100 + this.pactArmorBonus;
        this.vampirism = this.getStatValue('vampirism', this.stats.vampirism) / 100 + this.pactVampirism;
        this.regen = this.getStatValue('regen', this.stats.regen);
        this.speed = CONSTANTS.PLAYER_SPEED * (this.getStatValue('speed', this.stats.speed) / 100) * this.pactSpeedMultiplier;
        this.magnetRange = this.getStatValue('magnet', this.stats.magnet); // Pickups beyond PICKUP_RANGE fly to the player within this range

        this.updateHUD();
    }

    // Value of a stat at an upgrade level (percent stats are returned as percentages)
    getStatValue(stat, level) {
        switch (stat) {
            case 'maxHealth': return 100 + level * 25;
            case 'armor': return level * 3.0; // +3% damage reduction per level
            case 'vampirism': return level * 2; // +2% life steal per level
            case 'regen': return level * 0.3; // HP per second
            case 'speed': return (1 + level * 0.08) * 100; // +8% per level
            case 'meleeDamage': return 10 + level * 15;
            case 'immolation': return level * 5; // Damage per second
            case 'magnet': return PICKUP_RANGE + level * 1.3; // Pickup range in metres: 2 m without the upgrade, 15 m at level 10
            default: return 0;
        }
    }
}
