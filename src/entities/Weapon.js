import * as THREE from 'three';
import { soundManager } from '../systems/SoundManager.js';
import { HEAD_Z, STAFF_TIERS, buildStaff, staffTier } from './StaffMesh.js';

const ORB_LIGHT = 2; // cd at rest; each shot flares it (ART_DIRECTION.md, section 7)
const REST = { x: 0.3, y: -0.3, z: -0.5, tilt: 0.2 }; // The staff's pose in camera space
const FLOURISH_AFTER = 8; // s of calm before the staff twirls in the hand
const FLOURISH_TIME = 1.1; // s
// Players who ask for reduced motion keep a steadier staff: no walk bob, sway or twirl
const MOTION = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
const { damp, clamp, lerp } = THREE.MathUtils;

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
        this.gunMesh = new THREE.Group(); // Pose: bob, sway, recoil, reload, melee; holds the staff of the tier
        this.mesh.add(this.gunMesh);
        // The crystal's light, made once: adding a light mid-level recompiles every shader
        this.flash = new THREE.PointLight(STAFF_TIERS[0].orb, ORB_LIGHT, 3);
        this.flash.position.z = HEAD_Z;
        this.gunMesh.add(this.flash);
        // Animation state: clock, walk bob phase and amount, look sway, calm time, twirl progress (-1: none),
        // crystal spin speed factor, flare left after a reload
        this.anim = { time: 0, bob: 0, bobAmount: 0, swayX: 0, swayY: 0, yaw: camera.rotation.y, pitch: camera.rotation.x, calm: 0, flourish: -1, spin: 1, pop: 0 };
        this.tier = -1;
        this.rebuildMesh(0);
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

    // `speed`: the player's walking speed (m/s, 0 in the air), for the walk bob
    update(dt, speed = 0) {
        if (this.isReloading) {
            this.reloadTimer -= dt;
            if (this.reloadTimer <= 0) {
                this.isReloading = false;

                const needed = this.maxAmmo - this.currentAmmo;
                const available = Math.min(needed, this.reserveAmmo);

                this.currentAmmo += available;
                this.reserveAmmo -= available;
                // The recharged crystal flares
                this.flashTime = 0.05;
                this.anim.pop = 1;
                soundManager.play('reloadDone');
            }
        }

        if (this.isMeleeing) {
            this.meleeTimer += dt;
            if (this.meleeTimer >= this.meleeCooldown) {
                this.isMeleeing = false;
                this.meleeTimer = 0;
            }
        }

        this.animate(dt, speed);

        // Crystal light: idle glow, flare on a shot
        if (this.flashTime > 0) {
            this.flashTime -= dt;
            this.flash.intensity = ORB_LIGHT + (Math.max(0, this.flashTime) / 0.1) * 25;
            this.flash.distance = 6;
        } else {
            this.flash.intensity = ORB_LIGHT;
            this.flash.distance = 3;
        }
    }

    animate(dt, speed) {
        const a = this.anim;
        const g = this.gunMesh;
        const { orb, glow, spinners } = this.staff;
        a.time += dt;
        const t = a.time;
        this.recoil = damp(this.recoil, 0, 10, dt);

        // Reload: the staff comes in toward the centre of the view, crystal up, while it refills
        const reload = this.isReloading ? 1 - this.reloadTimer / this.reloadTime : 0;
        const dip = Math.sin(Math.PI * reload);

        // Walk bob, one dip per footstep (Player plays one every 2.2 m)
        a.bob += speed * dt * Math.PI / 2.2;
        a.bobAmount = damp(a.bobAmount, Math.min(1, speed / 10) * MOTION, 8, dt);
        // Look sway: the staff lags a little behind the view
        const cam = this.camera.rotation;
        if (dt > 0) {
            a.swayX = damp(a.swayX, clamp((cam.y - a.yaw) / dt * 0.012, -0.05, 0.05) * MOTION, 10, dt);
            a.swayY = damp(a.swayY, clamp((cam.x - a.pitch) / dt * -0.012, -0.04, 0.04) * MOTION, 10, dt);
        }
        a.yaw = cam.y;
        a.pitch = cam.x;

        // After a calm spell, the staff twirls once about its own axis, lifted a little
        const busy = speed > 0.5 || this.isReloading || this.isMeleeing || this.recoil > 0.05;
        a.calm = busy ? 0 : a.calm + dt;
        if (a.flourish < 0 && a.calm > FLOURISH_AFTER && MOTION) a.flourish = 0;
        let twirl = 0;
        let lift = 0;
        if (a.flourish >= 0) {
            a.flourish += dt / FLOURISH_TIME;
            if (a.flourish >= 1) {
                a.flourish = -1;
                a.calm = 0;
            } else {
                const f = a.flourish;
                twirl = f * f * (3 - 2 * f) * Math.PI * 2;
                lift = Math.sin(Math.PI * f) * 0.03;
            }
        }

        if (this.isMeleeing) {
            // 0 – 0.2 s wind up (pull back), 0.2 – 0.3 s strike (thrust and twist), then recover
            const m = this.meleeTimer;
            if (m < 0.2) {
                const k = m / 0.2;
                g.position.z = lerp(REST.z, -0.2, k);
                g.rotation.x = lerp(REST.tilt, -0.5, k);
                g.rotation.y = lerp(0, 0.5, k);
            } else if (m < 0.3) {
                const k = (m - 0.2) / 0.1;
                g.position.z = lerp(-0.2, -1.2, k);
                g.rotation.x = lerp(-0.5, 0.5, k);
                g.rotation.y = lerp(0.5, -0.5, k);
            } else {
                const k = Math.min(1, (m - 0.3) / 0.5);
                g.position.z = lerp(-1.2, REST.z, k);
                g.rotation.x = lerp(0.5, REST.tilt, k);
                g.rotation.y = lerp(-0.5, 0, k);
            }
        } else {
            const bobX = Math.sin(a.bob) * 0.012 * a.bobAmount;
            const bobY = -Math.abs(Math.cos(a.bob)) * 0.018 * a.bobAmount;
            g.position.set(
                REST.x + Math.sin(t * 1.1) * 0.006 + bobX + a.swayX - 0.09 * dip,
                REST.y + Math.sin(t * 2) * 0.012 + bobY + a.swayY + 0.04 * dip + lift,
                REST.z + this.recoil * 0.2 + 0.08 * dip
            );
            g.rotation.set(
                REST.tilt - this.recoil * 0.3 + 0.5 * dip,
                -a.swayX * 1.5 + 0.3 * dip,
                Math.sin(t * 1.5) * 0.05 - a.swayX * 2 + 0.6 * dip + twirl
            );
        }

        // Crystal: as bright as the clip is full, refilling during a reload, flaring on each shot
        const fill = this.isReloading ? reload : (this.infiniteAmmo || this.maxAmmo <= 0 ? 1 : this.currentAmmo / this.maxAmmo);
        const shot = Math.max(0, this.flashTime) / 0.1;
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
        a.pop = Math.max(0, a.pop - dt * 4);
        orb.material.emissiveIntensity = 0.25 + 1.1 * fill + 0.15 * pulse + 2.5 * shot + 1.5 * a.pop;
        glow.material.opacity = 0.2 + 0.6 * fill + 0.2 * a.pop;
        glow.scale.setScalar((0.16 + 0.04 * pulse) * (0.6 + 0.4 * fill) + 0.12 * shot + 0.15 * a.pop);
        // It hovers and turns in its claws, and whirls while recharging, with everything orbiting it
        a.spin = damp(a.spin, this.isReloading ? 5 : 1, 4, dt);
        orb.rotation.z += dt * 0.8 * a.spin;
        orb.position.z = HEAD_Z + Math.sin(t * 1.7) * 0.004;
        orb.scale.setScalar(1 + 0.25 * shot + 0.2 * a.pop - 0.15 * dip);
        for (const s of spinners) s.rotation.z += s.userData.spin * a.spin * dt;
    }

    melee() {
        if (this.isMeleeing || this.isReloading) return false;

        this.isMeleeing = true;
        this.meleeTimer = 0;
        return true;
    }

    shoot() {
        if (this.isReloading) return 0;
        const now = performance.now() / 1000;
        const effectiveFireRate = this.fireRate / this.fireRateMultiplier;
        if (this.currentAmmo <= 0 && !this.infiniteAmmo) {
            this.reload();
            // No mana left to reload with: the crystal sputters, at the fire rate
            if (!this.isReloading && now - this.lastShootTime >= effectiveFireRate) {
                this.lastShootTime = now;
                this.recoil = 0.25;
                soundManager.play('empty');
            }
            return 0;
        }
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

    // Swaps in the staff of the tier `totalLevel` reaches (StaffMesh.js); nothing to do within a tier
    rebuildMesh(totalLevel) {
        const tier = staffTier(totalLevel);
        if (tier === this.tier) return;
        this.tier = tier;
        if (this.staff) {
            this.staff.group.traverse(obj => {
                obj.geometry?.dispose();
                obj.material?.dispose();
            });
            this.gunMesh.remove(this.staff.group);
        }
        this.staff = buildStaff(tier);
        this.gunMesh.add(this.staff.group);
        this.flash.color.setHex(STAFF_TIERS[tier].orb);
        this.shotRate = 1 - tier * 0.03; // Shot sound playback rate: each tier sounds a little heavier
    }
}
