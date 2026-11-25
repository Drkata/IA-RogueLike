import * as THREE from 'three';
import { soundManager } from '../systems/SoundManager.js';
import { PALETTE } from '../core/Palette.js';

// Staff orb colour by total upgrade level: aether → sage → frost → hex → hex bright → gilt
const ORB_TIERS = [[26, PALETTE.giltBright], [21, PALETTE.hexBright], [16, PALETTE.hex], [11, 0x7fb0ff], [6, PALETTE.sage], [0, PALETTE.aetherBright]];
const ORB_LIGHT = 2;

const newUpgradeStats = () => ({
    damage: 0,
    fireRate: 0,
    ammo: 0,
    reload: 0,
    range: 0,
    projectileSpeed: 0,
    bulletCount: 0, // Multishot
    piercing: 0,
    critChance: 0,
    critDamage: 0,
    knockback: 0,
    explosion: 0,
    ricochet: 0,
    homing: 0
});

export class Weapon {
    constructor(camera) {
        this.camera = camera;
        this.canShoot = true;
        this.flashTime = 0;
        this.isReloading = false;
        this.reloadTimer = 0;
        this.lastShootTime = 0;
        this.recoil = 0;

        this.stats = newUpgradeStats(); // Upgrade levels
        this.MAX_LEVEL = 10;

        // Base Stats - Balanced for fast-paced gameplay
        this.baseDamage = 6; // Halved from 12
        this.baseFireRate = 0.4; // Halved from 0.2 (Slower)
        this.baseMaxAmmo = 20;
        this.baseReloadTime = 1.6;
        this.baseRange = 15;
        this.baseProjectileSpeed = 25; // Base projectile speed (Halved)
        this.baseCritChance = 0; // 0% base
        this.baseCritDamage = 1.5; // 150% base

        this.resetPacts();
        this.recalculateStats(); // Current (derived) stats

        // Ammo State
        this.currentAmmo = this.baseMaxAmmo;
        this.reserveAmmo = 60;
        this.infiniteAmmo = false; // For Berserk Buff
        this.fireRateMultiplier = 1.0; // For Berserk Buff

        // Melee State
        this.isMeleeing = false;
        this.meleeTimer = 0;
        this.meleeCooldown = 0.8;

        // Visuals
        // Cleanup existing weapon meshes (Fix for HMR/Duplication)
        const existing = this.camera.children.find(c => c.name === 'WeaponMesh');
        if (existing) {
            this.camera.remove(existing);
        }

        this.mesh = new THREE.Group();
        this.mesh.name = 'WeaponMesh';
        this.camera.add(this.mesh);
        this.rebuildMesh(0); // Initial Mesh
    }



    // Permanent modifiers granted by altar pacts (PACTS in Game.js)
    resetPacts() {
        this.pactDamageMultiplier = 1.0;
        this.pactFireRateMultiplier = 1.0;
        this.pactProjectileSpeedMultiplier = 1.0;
        this.pactCritChance = 0; // Added to the upgrades' value
        this.pactCritDamage = 0;
        this.pactChain = 0; // Storm: enemies a shot jumps on to after a hit
        this.pactAmmoMultiplier = 1.0;
        this.pactExplosion = 0; // Added chance
        this.pactReloadMultiplier = 1.0; // Of the reload time
    }

    getMaxLevel() {
        return this.MAX_LEVEL;
    }

    upgrade(stat) {
        if (!(this.stats[stat] < this.getMaxLevel(stat))) return false;
        this.stats[stat]++;
        this.recalculateStats();
        this.rebuildMesh(this.getTotalLevel());
        return true;
    }

    getTotalLevel() {
        return Object.values(this.stats).reduce((a, b) => a + b, 0);
    }

    recalculateStats() {
        const s = this.stats;
        const value = (stat) => this.getStatValue(stat, s[stat]);

        this.damage = value('damage') * this.pactDamageMultiplier;
        this.fireRate = value('fireRate') / this.pactFireRateMultiplier;
        this.arc = s.bulletCount * 2; // Multishot spread: 2 degrees per extra bullet
        this.maxAmmo = Math.floor(value('ammo') * this.pactAmmoMultiplier);
        this.reloadTime = value('reload') * this.pactReloadMultiplier;
        this.range = value('range');
        this.projectileSpeed = value('projectileSpeed') * this.pactProjectileSpeedMultiplier;
        this.bulletCount = value('bulletCount');
        this.piercing = value('piercing');
        this.critChance = value('critChance') / 100 + this.pactCritChance;
        this.critDamage = value('critDamage') / 100 + this.pactCritDamage;
        this.knockback = value('knockback');
        this.explosion = value('explosion') / 100 + this.pactExplosion;
        this.ricochet = value('ricochet');
        this.chain = this.pactChain;

        // Kinetic impact: every 1% of extra projectile speed adds 0.5% damage
        const speedBonus = (this.projectileSpeed / this.baseProjectileSpeed) - 1;
        if (speedBonus > 0) this.damage *= 1 + speedBonus * 0.5;

        // Multishot splits the damage between bullets
        if (this.bulletCount > 1) this.damage /= this.bulletCount;
    }

    // Value of a stat at an upgrade level, before pacts (single source of truth for stats and the upgrade UI)
    getStatValue(stat, level) {
        switch (stat) {
            case 'damage': return this.baseDamage * (1 + level * 0.18);
            case 'fireRate': return Math.max(0.05, this.baseFireRate * Math.pow(0.94, level)); // Seconds between shots
            case 'ammo': return Math.floor(this.baseMaxAmmo * (1 + level * 0.25));
            case 'reload': return Math.max(0.1, this.baseReloadTime * Math.pow(0.88, level));
            case 'range': return this.baseRange * (1 + level * 0.20);
            case 'projectileSpeed': return this.baseProjectileSpeed * (1 + level * 0.06);
            case 'bulletCount': return 1 + level;
            case 'piercing': return level;
            case 'critChance': return (this.baseCritChance + level * 0.10) * 100; // %
            case 'critDamage': return (this.baseCritDamage + level * 0.20) * 100; // %
            case 'knockback': return level;
            case 'explosion': return level * 10; // % chance
            case 'ricochet': return level;
            case 'homing': return level;
            default: return 0;
        }
    }

    reload() {
        if (this.currentAmmo < this.maxAmmo && this.reserveAmmo > 0 && !this.isReloading) {
            this.isReloading = true;
            this.reloadTimer = this.reloadTime;
            soundManager.play('reload');
        }
    }

    // Instantly fill the clip (cancels a reload in progress)
    refill() {
        this.currentAmmo = this.maxAmmo;
        this.isReloading = false;
        this.reloadTimer = 0;
    }

    addAmmo(amount) {
        this.reserveAmmo += amount;
    }

    reset() {
        this.stats = newUpgradeStats();
        this.currentAmmo = this.baseMaxAmmo;
        this.reserveAmmo = 400;
        this.resetPacts();

        // Melee State
        this.isMeleeing = false;
        this.meleeTimer = 0;
        this.meleeCooldown = 0.8;
        
        this.lastShootTime = 0;

        this.recalculateStats();
        this.rebuildMesh(0);
    }

    update(dt) {
        // Reload Logic
        if (this.isReloading) {
            this.reloadTimer -= dt;
            if (this.reloadTimer <= 0) {
                this.isReloading = false;

                const needed = this.maxAmmo - this.currentAmmo;
                const available = Math.min(needed, this.reserveAmmo);

                this.currentAmmo += available;
                this.reserveAmmo -= available;
            }
        }

        // Melee Animation Logic
        if (this.isMeleeing) {
            this.meleeTimer += dt;

            // Animation Phases
            // 0.0 - 0.2: Wind up (Pull back)
            // 0.2 - 0.3: Strike (Thrust forward + Rotate)
            // 0.3 - 0.8: Recover (Return to idle)

            if (this.gunMesh) {
                if (this.meleeTimer < 0.2) {
                    // Wind Up
                    const t = Math.min(1.0, this.meleeTimer / 0.2);
                    this.gunMesh.position.z = THREE.MathUtils.lerp(-0.5, -0.2, t); // Pull back
                    this.gunMesh.rotation.x = THREE.MathUtils.lerp(0.2, -0.5, t); // Cock back
                    this.gunMesh.rotation.y = THREE.MathUtils.lerp(0, 0.5, t); // Twist
                } else if (this.meleeTimer < 0.3) {
                    // Strike
                    const t = Math.min(1.0, (this.meleeTimer - 0.2) / 0.1);
                    this.gunMesh.position.z = THREE.MathUtils.lerp(-0.2, -1.2, t); // Thrust deep
                    this.gunMesh.rotation.x = THREE.MathUtils.lerp(-0.5, 0.5, t); // Bash down
                    this.gunMesh.rotation.y = THREE.MathUtils.lerp(0.5, -0.5, t); // Twist opposite
                } else {
                    // Recover
                    const t = Math.min(1.0, (this.meleeTimer - 0.3) / 0.5);
                    this.gunMesh.position.z = THREE.MathUtils.lerp(-1.2, -0.5, t);
                    this.gunMesh.rotation.x = THREE.MathUtils.lerp(0.5, 0.2, t);
                    this.gunMesh.rotation.y = THREE.MathUtils.lerp(-0.5, 0, t);
                }
            }

            if (this.meleeTimer >= this.meleeCooldown) {
                this.isMeleeing = false;
                this.meleeTimer = 0;

                // Force reset to idle state
                if (this.gunMesh) {
                    this.gunMesh.position.set(0.3, -0.3, -0.5);
                    this.gunMesh.rotation.set(0.2, 0, 0);
                }
            }
        } else if (this.gunMesh) {
            // Recoil recovery
            this.recoil = THREE.MathUtils.lerp(this.recoil, 0, dt * 10); // Fast recovery

            // Base Idle Animation (Bobbing / Floating)
            const time = performance.now() / 1000;
            const baseY = -0.3 + Math.sin(time * 2) * 0.02; // Gentle bob
            this.gunMesh.position.set(0.3, baseY, -0.5);
            this.gunMesh.rotation.set(0.2, 0, Math.sin(time * 1.5) * 0.05);

            // Apply recoil offsets
            this.gunMesh.position.z += this.recoil * 0.2; // Move back
            this.gunMesh.rotation.x -= this.recoil * 0.3; // Tilt up
        }

        // Flash fade (Orb glow pulse)
        if (this.flashTime > 0) {
            this.flashTime -= dt;
            if (this.flash) {
                this.flash.intensity = ORB_LIGHT + (this.flashTime / 0.1) * 25; // Shot flash
                this.flash.distance = 6;
            }
        } else if (this.flash) {
            this.flash.intensity = ORB_LIGHT; // Idle glow
            this.flash.distance = 3;
        }
    }

    melee() {
        if (this.isMeleeing || this.isReloading) return false;

        this.isMeleeing = true;
        this.meleeTimer = 0;
        return true;
    }

    shoot() {
        if (this.isReloading || (this.currentAmmo <= 0 && !this.infiniteAmmo)) {
            if (this.currentAmmo <= 0 && !this.isReloading && !this.infiniteAmmo) this.reload();
            return 0;
        }

        const now = performance.now() / 1000;
        const effectiveFireRate = this.fireRate / this.fireRateMultiplier;
        if (now - this.lastShootTime < effectiveFireRate) return 0;

        // Multishot Logic: Determine how many bullets to fire
        // Limit by available ammo in clip (unless infinite)
        let bulletsToFire = this.bulletCount;
        if (!this.infiniteAmmo) {
            bulletsToFire = Math.min(this.bulletCount, this.currentAmmo);
        }

        this.lastShootTime = now;

        // Consume ammo equal to bullets fired (unless infinite)
        if (!this.infiniteAmmo) {
            this.currentAmmo -= bulletsToFire;
        }

        this.flashTime = 0.1;

        // Visual Recoil trigger
        this.recoil = 1.0;

        return bulletsToFire;
    }

    rebuildMesh(totalLevel) {
        // Free the previous staff's GPU resources before rebuilding it
        this.mesh.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
        this.mesh.clear();

        const orbColor = ORB_TIERS.find(([level]) => totalLevel >= level)[1];
        const woodColor = 0x4a3322;

        // Materials
        const woodMat = new THREE.MeshStandardMaterial({ color: woodColor, roughness: 0.9, metalness: 0.1 });
        const orbMat = new THREE.MeshStandardMaterial({
            color: orbColor,
            emissive: orbColor,
            emissiveIntensity: 1.5,
            roughness: 0.2,
            metalness: 0.8,
            transparent: true,
            opacity: 0.9
        });
        const metalMat = new THREE.MeshStandardMaterial({ color: PALETTE.gilt, roughness: 0.35, metalness: 0.8 });

        this.gunMesh = new THREE.Group();
        // Position: Right hand side, lower
        this.gunMesh.position.set(0.3, -0.3, -0.5);
        this.gunMesh.rotation.x = 0.2; // Tilt forward slightly

        // 1. Staff Shaft (Long cylinder)
        const shaftGeo = new THREE.CylinderGeometry(0.02, 0.015, 1.5, 8);
        shaftGeo.rotateX(Math.PI / 2); // Point forward
        const shaft = new THREE.Mesh(shaftGeo, woodMat);
        shaft.position.z = 0.2; // Center it
        this.gunMesh.add(shaft);

        // 2. Staff Head (The Orb Holder)
        const headGeo = new THREE.TorusGeometry(0.06, 0.01, 8, 16);
        const head = new THREE.Mesh(headGeo, metalMat);
        head.position.z = -0.6; // Tip
        this.gunMesh.add(head);

        // 3. The Orb (Glowing Crystal)
        const orbGeo = new THREE.IcosahedronGeometry(0.05, 1);
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.z = -0.6;
        this.gunMesh.add(orb);

        // Orb animation reference
        this.orbMesh = orb;

        // Tier 1: Nature (Leaves/Vines)
        if (totalLevel >= 6) {
            const vineGeo = new THREE.TorusKnotGeometry(0.03, 0.005, 32, 4);
            const vine = new THREE.Mesh(vineGeo, new THREE.MeshStandardMaterial({ color: PALETTE.sage }));
            vine.position.z = -0.4;
            this.gunMesh.add(vine);
        }

        // Tier 2: Frost (Floating Ice Shards)
        if (totalLevel >= 11) {
            const shardGeo = new THREE.ConeGeometry(0.01, 0.05, 3);
            for (let i = 0; i < 3; i++) {
                const shard = new THREE.Mesh(shardGeo, new THREE.MeshStandardMaterial({ color: 0xaaddff, emissive: 0x004488 }));
                shard.position.set(Math.cos(i * 2) * 0.1, Math.sin(i * 2) * 0.1, -0.6);
                shard.lookAt(0, 0, -1);
                this.gunMesh.add(shard);
            }
        }

        // Tier 3: Void (Dark Rings)
        if (totalLevel >= 16) {
            const ringGeo = new THREE.RingGeometry(0.08, 0.09, 32);
            const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }));
            ring.position.z = -0.6;
            this.gunMesh.add(ring);
        }

        this.mesh.add(this.gunMesh);

        // Light Source (Instead of Muzzle Flash plane)
        this.flash = new THREE.PointLight(orbColor, ORB_LIGHT, 3);
        this.flash.position.set(0, 0, -0.6);
        this.gunMesh.add(this.flash);
    }
}
