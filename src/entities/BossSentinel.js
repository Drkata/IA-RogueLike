import * as THREE from 'three';
import { Projectile } from './Projectile.js';
import { Enemy } from './Enemy.js';
import { FloatingText } from './FloatingText.js';
import { PALETTE } from '../core/Palette.js';
import { soundManager } from '../systems/SoundManager.js';

const _dir = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();

const MISSILE_COUNT = 50;
const MISSILE_INTERVAL = 0.15; // Seconds between two meteors of a rain

export class BossSentinel {
    static idCounter = 1000; // Start high to avoid conflict with minions
    static laserGeometry = new THREE.SphereGeometry(0.2, 8, 8);

    static getHP(level) {
        return level * 100; // Level 10 = 1000 HP
    }

    static getLaserDamage(level) {
        return 10 + level;
    }

    static getSpiralDamage(level) {
        return 7 + level;
    }

    static getMissileDamage(level) {
        return 20 + (level * 1.5);
    }

    constructor(position, levelManager, entityManager, level) {
        this.id = BossSentinel.idCounter++;
        this.position = position.clone();
        this.position.y = 12; // Floating high above the arena
        this.levelManager = levelManager;
        this.entityManager = entityManager;
        this.level = level;

        this.isDead = false;
        this.maxHealth = BossSentinel.getHP(level);
        this.health = this.maxHealth;
        this.radius = 6.0; // Huge hitbox
        this.entityType = 'enemy'; // Fix for minified builds

        this.mesh = this.createMesh();
        this.mesh.position.copy(this.position);
        this.mesh.userData.entity = this;

        this.targetPlayer = null;

        // Independent cooldowns (combos)
        this.cooldowns = {
            missile: 2.0,
            summon: 5.0,
            spiral: 10.0,
            laser: 0.4
        };

        // Blocking state (only for full-body animations like Spiral)
        this.isSpiraling = false;
        this.spiralTimer = 0;
        this.spiralShotTimer = 0;
        this.spiralDirection = 1;
        this.spiralDirTimer = 0;
        this.globalCooldown = 0; // Pause between attacks

        // Meteor rain in progress (spawned over time by update, so it pauses with the game)
        this.pendingMissiles = 0;
        this.missileTimer = 0;

        // Projectiles get faster every 10 levels (+5% per tier)
        this.speedMult = 1 + Math.max(1, Math.floor(level / 10)) * 0.05;

        this.healthContainer = document.getElementById('boss-health-container');
        this.healthBar = document.getElementById('boss-health-bar');
        this.healthText = document.getElementById('boss-health-text');
        if (this.healthContainer) this.healthContainer.hidden = false;
        soundManager.play('bossRoar');
        this.updateHealthBar();
    }

    createMesh() {
        const group = new THREE.Group();

        // Central Eye (Core)
        this.core = new THREE.Mesh(
            new THREE.SphereGeometry(4.5, 32, 32),
            new THREE.MeshStandardMaterial({ color: PALETTE.ember, emissive: PALETTE.ember, emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.3 })
        );
        group.add(this.core);

        // Outer Rings (Shields)
        const ringGeo = new THREE.TorusGeometry(7.5, 0.6, 16, 100);
        const ringMat = new THREE.MeshStandardMaterial({ color: 0x5a5048, roughness: 0.4, metalness: 0.8 });
        this.ring1 = new THREE.Mesh(ringGeo, ringMat);
        this.ring2 = new THREE.Mesh(ringGeo, ringMat);
        this.ring2.rotation.x = Math.PI / 2;
        group.add(this.ring1);
        group.add(this.ring2);

        // Base (Ground connection visual)
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(1.5, 6, 12, 16),
            new THREE.MeshStandardMaterial({ color: PALETTE.ink, roughness: 0.8 })
        );
        base.position.y = -9;
        group.add(base);

        return group;
    }

    takeDamage(amount, isCritical = false) {
        if (this.isDead) return false;

        this.health -= amount;
        this.updateHealthBar();
        FloatingText.spawnDamage(this.entityManager, this.position, 5.0, amount, isCritical, isCritical ? 5.0 : 4.0);

        // Flash effect
        this.core.material.emissive.setHex(PALETTE.vellum);
        setTimeout(() => {
            if (!this.isDead) this.core.material.emissive.setHex(PALETTE.ember);
        }, 50);

        if (this.health <= 0) {
            this.die();
            return true;
        }
        return false;
    }

    updateHealthBar() {
        if (this.healthBar) {
            this.healthBar.style.transform = `scaleX(${Math.max(0, this.health / this.maxHealth)})`;
        }
        if (this.healthText) {
            this.healthText.textContent = `${Math.ceil(Math.max(0, this.health))} / ${this.maxHealth}`;
        }
    }

    die() {
        this.isDead = true;
        soundManager.play('bossRoar');
        this.mesh.visible = false;
        this.pendingMissiles = 0;
        if (this.healthContainer) this.healthContainer.hidden = true;
        this.entityManager.createExplosion(this.position, 0); // Visual only
    }

    update(dt, player) {
        if (this.isDead) return;
        this.targetPlayer = player;

        // Rotate Rings (Always active)
        this.ring1.rotation.y += dt * 0.5;
        this.ring1.rotation.x += dt * 0.2;
        this.ring2.rotation.y -= dt * 0.3;
        this.ring2.rotation.z += dt * 0.4;

        this._updateMissileRain(dt);

        // 1. Spiral is a blocking state
        if (this.isSpiraling) {
            this.updateSpiral(dt);
            this.spiralTimer -= dt;
            if (this.spiralTimer <= 0) {
                this.isSpiraling = false;
                this.cooldowns.spiral = 15.0;
                this.globalCooldown = 3.0;
            }
            return;
        }

        // 2. Look at Player
        this.mesh.lookAt(player.position);

        // Pause between attacks
        if (this.globalCooldown > 0) {
            this.globalCooldown -= dt;
            return;
        }

        // 3. Independent cooldowns (combos)
        for (const key in this.cooldowns) this.cooldowns[key] -= dt;

        if (this.cooldowns.spiral <= 0) {
            this.isSpiraling = true;
            soundManager.play('bossSpiral', this.position);
            this.spiralTimer = 4.0;
        } else if (this.cooldowns.missile <= 0) {
            this.fireMissiles();
            this.cooldowns.missile = 6.0;
            this.globalCooldown = 2.0;
        } else if (this.cooldowns.summon <= 0) {
            this.summonMinions();
            this.cooldowns.summon = 20.0;
            this.globalCooldown = 4.0; // Long pause to kill the minions
        } else if (this.cooldowns.laser <= 0) {
            // Default attack: laser sweep (area denial)
            this.fireLaserSweep();
            this.cooldowns.laser = 1.5;
            this.globalCooldown = 1.0;
        }
    }

    _fire(origin, direction, speed, damage, sourceName, options = {}) {
        const proj = new Projectile(origin, direction, speed, damage, this.levelManager, {
            sourceName,
            sourceId: this.id,
            maxDistance: 200,
            ...options
        });
        this.entityManager.add(proj);
        return proj;
    }

    // 360° nova of glowing balls at player height
    fireLaserSweep() {
        soundManager.play('bossLaser', this.position);
        _dir.subVectors(this.targetPlayer.position, this.position);
        const startAngle = Math.atan2(_dir.x, _dir.z) - Math.PI;

        const projectileCount = 120;
        for (let i = 0; i < projectileCount; i++) {
            const angle = startAngle + (Math.PI * 2 * i) / (projectileCount - 1);
            _dir.set(Math.sin(angle), (Math.random() - 0.5) * 0.05, Math.cos(angle)).normalize();
            _spawnPos.set(this.position.x, 1.5, this.position.z);

            const proj = this._fire(_spawnPos, _dir, 35 * this.speedMult, BossSentinel.getLaserDamage(this.level), "Boss: Laser Sweep", { color: PALETTE.hexBright });
            proj.mesh.geometry = BossSentinel.laserGeometry;
        }
    }

    // Bullet hell: spin fast and fire rings of shots, flipping direction every 1.5s
    updateSpiral(dt) {
        this.spiralDirTimer += dt;
        if (this.spiralDirTimer >= 1.5) {
            this.spiralDirection *= -1;
            this.spiralDirTimer = 0;
        }
        this.mesh.rotation.y += dt * 8.0 * this.spiralDirection;

        this.spiralShotTimer -= dt;
        if (this.spiralShotTimer > 0) return;
        this.spiralShotTimer = 0.1; // 10 rings per second

        const angleCount = 20;
        for (let i = 0; i < angleCount; i++) {
            const angle = (i / angleCount) * Math.PI * 2 + this.mesh.rotation.y;
            _dir.set(Math.sin(angle), 0, Math.cos(angle));
            _spawnPos.set(this.position.x, 1.0, this.position.z); // Waist level

            const proj = this._fire(_spawnPos, _dir, 15 * this.speedMult, BossSentinel.getSpiralDamage(this.level), "Boss: Spiral");
            proj.mesh.scale.setScalar(0.8);
        }
    }

    fireMissiles() {
        this.pendingMissiles = MISSILE_COUNT;
        this.missileTimer = 0;
    }

    _updateMissileRain(dt) {
        if (this.pendingMissiles <= 0) return;
        this.missileTimer -= dt;
        while (this.missileTimer <= 0 && this.pendingMissiles > 0) {
            this.missileTimer += MISSILE_INTERVAL;
            this.pendingMissiles--;
            this._launchMissile();
        }
    }

    // Meteor falling on a random point of the arena (~40 unit radius), telegraphed on the ground
    _launchMissile() {
        const gravity = 20;
        const flightTime = 2.0 / this.speedMult;
        const range = 40;

        const targetPos = new THREE.Vector3(
            this.position.x + (Math.random() - 0.5) * 2 * range,
            0,
            this.position.z + (Math.random() - 0.5) * 2 * range
        );
        this.entityManager.createTelegraph(targetPos, flightTime);

        // Ballistic launch velocity to land on target after flightTime
        _spawnPos.copy(this.position);
        _spawnPos.y += 5;
        const velocity = _dir.subVectors(targetPos, _spawnPos);
        velocity.y = 0;
        const hSpeed = velocity.length() / flightTime;
        velocity.normalize().multiplyScalar(hSpeed);
        velocity.y = (0.5 * gravity * flightTime * flightTime + (targetPos.y - _spawnPos.y)) / flightTime;

        const proj = this._fire(_spawnPos, velocity, velocity.length(), BossSentinel.getMissileDamage(this.level), "Boss: Missile Rain", {
            gravity,
            radius: 4.0,
            color: PALETTE.ember
        });
        proj.mesh.scale.setScalar(4.0);
    }

    summonMinions() {
        soundManager.play('bossRoar', this.position);
        // Count doubles every 10 levels, capped at 30 for performance
        const tier = Math.max(1, Math.floor(this.level / 10));
        const count = Math.min(30, 10 * Math.pow(2, tier - 1));
        // Wider ring for bigger groups to reduce clumping
        const radius = Math.min(25, 10 + count * 0.5);

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            _spawnPos.set(this.position.x + Math.sin(angle) * radius, 0, this.position.z + Math.cos(angle) * radius);
            _spawnPos.y = this.levelManager.getFloorHeight(_spawnPos.x, _spawnPos.z, 3.0);

            if (!this.levelManager.isWall(_spawnPos.x, _spawnPos.z, _spawnPos.y)) {
                this.entityManager.add(new Enemy(_spawnPos, this.levelManager, this.entityManager, this.level));
            }
        }
    }
}
