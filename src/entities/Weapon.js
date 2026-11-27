import * as THREE from 'three';
import { soundManager } from '../systems/SoundManager.js';
import { HEAD_Z, STAFF_TIERS, buildStaff, staffTier } from './StaffMesh.js';
import { HandMotion, MOTION } from './HandMotion.js';

const ORB_LIGHT = 2; // cd at rest; each shot flares it (ART_DIRECTION.md, section 7)
const REST = { x: 0.3, y: -0.3, z: -0.5, tilt: 0.2 }; // The staff's pose in camera space
const FLOURISH_AFTER = 8; // s of calm before the staff twirls in the hand
const FLOURISH_TIME = 1.1; // s
export const CHARGE_TIME = 1.5; // s held still before the charged shot leaves on its own
const { damp } = THREE.MathUtils;

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
        this.baseRange = 25;
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

        // Charged shot (right click): the whole clip in one bolt
        this.charging = false;
        this.chargeTime = 0;

        // Visuals
        // Cleanup existing weapon meshes (Fix for HMR/Duplication)
        const existing = this.camera.children.find(c => c.name === 'WeaponMesh');
        if (existing) {
            this.camera.remove(existing);
        }

        this.mesh = new THREE.Group();
        this.mesh.name = 'WeaponMesh';
        this.camera.add(this.mesh);
        this.gunMesh = new THREE.Group(); // Pose: bob, sway, cast, reload, charge, put away; holds the staff of the tier
        this.mesh.add(this.gunMesh);
        // The crystal's light, made once: adding a light mid-level recompiles every shader
        this.flash = new THREE.PointLight(STAFF_TIERS[0].orb, ORB_LIGHT, 3);
        this.flash.position.z = HEAD_Z;
        this.gunMesh.add(this.flash);
        // Animation state: clock, calm time, twirl progress (-1: none), crystal spin speed factor, flare left after
        // a reload, staff raised to channel (0–1), crystal lifted out of its claws (0–1), shots fired, cast thrust
        // (0–1) and twist (±1), sparks left from the last shot
        this.anim = { time: 0, calm: 0, flourish: -1, spin: 1, pop: 0, channel: 0, lift: 0, shots: 0, cast: 0, twist: 0, spark: 0 };
        this.hand = new HandMotion(camera);
        this.holster = 0; // 0: in hand, 1: put away below the view (set by Player while switching weapons)
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
        this.rebuildMesh(this.modelLevel());
        return true;
    }

    // Levels of the staff's own upgrades, which pick its model: the crits, shared with the sword, count for neither
    modelLevel() {
        const { critChance, critDamage, ...own } = this.stats;
        return Object.values(own).reduce((a, b) => a + b, 0);
    }

    recalculateStats() {
        const s = this.stats;
        const value = (stat) => this.effectiveValue(stat, s[stat]);

        this.damage = value('damage');
        this.fireRate = value('fireRate');
        this.arc = s.bulletCount * 2; // Multishot spread: 2 degrees per extra bullet
        this.maxAmmo = value('ammo');
        this.reloadTime = value('reload');
        this.range = value('range');
        this.projectileSpeed = value('projectileSpeed');
        this.bulletCount = value('bulletCount');
        this.piercing = value('piercing');
        this.critChance = value('critChance') / 100;
        this.critDamage = value('critDamage') / 100;
        this.knockback = value('knockback');
        this.explosion = value('explosion') / 100;
        this.ricochet = value('ricochet');
        this.chain = this.pactChain;

        // Multishot splits the damage between bullets
        if (this.bulletCount > 1) this.damage /= this.bulletCount;
    }

    // A stat at an upgrade level with the pacts applied, in getStatValue's units: what the stats use and the
    // upgrade cards show. The damage is a whole volley's (before the multishot split), with the kinetic bonus.
    effectiveValue(stat, level) {
        const v = this.getStatValue(stat, level);
        switch (stat) {
            case 'damage': {
                // Kinetic impact: every 1% of extra projectile speed adds 0.5% damage
                const speedBonus = this.effectiveValue('projectileSpeed', this.stats.projectileSpeed) / this.baseProjectileSpeed - 1;
                return v * this.pactDamageMultiplier * (speedBonus > 0 ? 1 + speedBonus * 0.5 : 1);
            }
            case 'fireRate': return v / this.pactFireRateMultiplier;
            case 'ammo': return Math.floor(v * this.pactAmmoMultiplier);
            case 'reload': return v * this.pactReloadMultiplier;
            case 'projectileSpeed': return v * this.pactProjectileSpeedMultiplier;
            case 'critChance': return v + this.pactCritChance * 100;
            case 'critDamage': return v + this.pactCritDamage * 100;
            case 'explosion': return v + this.pactExplosion * 100;
            default: return v;
        }
    }

    // Value of a stat at an upgrade level, before pacts (effectiveValue adds them)
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
        if (this.currentAmmo < this.maxAmmo && this.reserveAmmo > 0 && !this.isReloading && !this.charging) {
            this.isReloading = true;
            this.reloadTimer = this.reloadTime;
            soundManager.play('reload', null, 1, this.reloadTime); // Swells up to the very end of the reload
        }
    }

    // Putting the staff away stops a reload: the mana drawn so far is lost
    cancelReload() {
        if (!this.isReloading) return;
        this.isReloading = false;
        this.reloadTimer = 0;
        soundManager.stop('reload');
    }

    // Right click held: starts gathering the clip, if there is any mana in it and no reload going on
    startCharge() {
        if (this.charging || this.isReloading || this.currentAmmo <= 0) return false;
        this.charging = true;
        this.chargeTime = 0;
        soundManager.play('staffCharge', null, 1, CHARGE_TIME);
        return true;
    }

    cancelCharge() {
        if (!this.charging) return;
        this.charging = false;
        soundManager.stop('staffCharge');
    }

    chargeProgress() {
        return this.charging ? Math.min(1, this.chargeTime / CHARGE_TIME) : 0;
    }

    // The charge is full: empties the clip (which starts refilling at once, if there is mana in reserve)
    // and returns how much mana went into the shot
    releaseCharge() {
        const ammo = this.currentAmmo;
        this.currentAmmo = 0;
        this.charging = false;
        this.lastShootTime = performance.now() / 1000;
        this.flashTime = 0.1;
        this.recoil = 1.0;
        this.anim.shots++;
        this.anim.spark = 1;
        this.reload();
        return ammo;
    }

    // Instantly fill the clip (cancels a reload in progress)
    refill() {
        this.cancelReload();
        this.currentAmmo = this.maxAmmo;
    }

    addAmmo(amount) {
        this.reserveAmmo += amount;
    }

    reset() {
        this.stats = newUpgradeStats();
        this.currentAmmo = this.baseMaxAmmo;
        this.reserveAmmo = 400;
        this.resetPacts();
        this.cancelCharge();
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
                this.flashTime = 0.1;
                this.anim.pop = 1;
                soundManager.play('reloadDone');
            }
        }

        if (this.charging) this.chargeTime += dt;

        this.animate(dt, speed);

        // Crystal light: idle glow, swelling as it recharges or charges, flare on a shot
        const glow = ORB_LIGHT * (1 + 1.5 * Math.max(this.reloadProgress(), this.chargeProgress()));
        if (this.flashTime > 0) {
            this.flashTime -= dt;
            this.flash.intensity = glow + (Math.max(0, this.flashTime) / 0.1) * 25;
            this.flash.distance = 6;
        } else {
            this.flash.intensity = glow;
            this.flash.distance = 3;
        }
    }

    reloadProgress() {
        return this.isReloading ? 1 - this.reloadTimer / this.reloadTime : 0;
    }

    animate(dt, speed) {
        const a = this.anim;
        const g = this.gunMesh;
        const h = this.hand;
        const { orb, glow, spinners } = this.staff;
        a.time += dt;
        const t = a.time;
        h.update(dt, speed);
        this.recoil = damp(this.recoil, 0, 10, dt);
        // A shot is cast, not fired: the staff thrusts the crystal toward the middle of the view, where the
        // bolt appears, with a twist to alternate sides; under sustained fire it stays raised. Peaks at ~0.6
        // of the recoil, 50 ms after the shot. A charge holds it there.
        a.cast = damp(a.cast, this.charging ? 0.6 : this.recoil, 35, dt);
        a.twist = damp(a.twist, (a.shots % 2 ? 1 : -1) * this.recoil, 30, dt);
        a.spark = Math.max(0, a.spark - dt * 6);

        // Reload, a channelling: the staff is raised before the eyes, its crystal rises out of the claws and
        // draws mana in, the staff shaking more and more; when full, the crystal drops back home with a jolt
        const reload = this.reloadProgress();
        const charge = this.chargeProgress();
        a.channel = damp(a.channel, this.isReloading ? 1 : 0, 9, dt);
        a.lift = damp(a.lift, this.isReloading ? 1 : 0, this.isReloading ? 3 : 25, dt);
        a.pop = Math.max(0, a.pop - dt * 3);
        const c = a.channel;
        const kick = a.pop * a.pop;
        const shake = (0.003 * reload * c + 0.006 * charge * charge) * MOTION;

        // After a calm spell, the staff twirls once about its own axis, lifted a little
        const busy = speed > 0.5 || this.isReloading || this.charging || this.recoil > 0.05 || this.holster > 0;
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

        // Put away (switching to the sword): it drops below the view, head down
        const away = this.holster;
        g.position.set(
            REST.x + h.x - 0.02 * c - 0.15 * a.cast + shake * Math.sin(t * 53),
            REST.y + h.y + 0.06 * c + 0.06 * a.cast + lift + shake * Math.sin(t * 41 + 1) - 0.5 * away,
            REST.z + 0.03 * c - 0.1 * a.cast
        );
        // Channelling, the staff stands up on the right: the crystal stays clear of the crosshair
        g.rotation.set(
            REST.tilt + 0.4 * c + 0.25 * kick + 0.08 * a.cast - 0.8 * away,
            -h.swayX * 1.5 + 0.3 * a.cast,
            Math.sin(t * 1.5) * 0.05 - h.swayX * 2 + 0.1 * c + 0.2 * a.twist + twirl
        );
        this.staff.group.visible = away < 0.99; // Its light stays: removing one mid-level recompiles every shader

        // Crystal: as bright as the clip is full, refilling during a reload, flaring on each shot
        const fill = this.isReloading ? reload : (this.infiniteAmmo || this.maxAmmo <= 0 ? 1 : this.currentAmmo / this.maxAmmo);
        const shot = Math.max(0, this.flashTime) / 0.1;
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
        // Charging, the crystal swells with the whole clip
        orb.material.emissiveIntensity = 0.25 + 1.1 * fill + 0.15 * pulse + 2.5 * shot + 1.5 * a.pop + 2 * charge;
        glow.material.opacity = 0.2 + 0.6 * fill + 0.2 * a.pop;
        glow.scale.setScalar((0.16 + 0.04 * pulse) * (0.6 + 0.4 * fill) + 0.12 * shot + 0.15 * a.pop + 0.2 * charge);
        // It hovers and turns in its claws; recharging or charging, it whirls faster and faster with everything orbiting it
        a.spin = damp(a.spin, 1 + 10 * reload * reload + 8 * charge * charge, 4, dt);
        orb.rotation.z += dt * 0.8 * a.spin;
        orb.position.z = HEAD_Z - 0.05 * a.lift + Math.sin(t * 1.7) * 0.004;
        glow.position.z = orb.position.z;
        orb.scale.setScalar(1 + 0.25 * shot + 0.2 * a.pop + 0.1 * a.lift * reload + 0.5 * charge);
        for (const s of spinners) s.rotation.z += s.userData.spin * a.spin * dt;
        this.animateMotes(Math.max(reload, charge), orb.position.z);
    }

    // Mana motes: while the crystal recharges (or charges, twice as fast), each spirals in to it on its own
    // trip; when it is full they all burst out of it and fade. A shot sprays half of them forward as sparks.
    animateMotes(progress, z) {
        const { motes } = this.staff;
        const a = this.anim;
        const drawing = this.isReloading || this.charging;
        motes.visible = (drawing || a.pop > 0 || a.spark > 0) && this.holster < 0.99;
        if (!motes.visible) return;
        const position = motes.geometry.attributes.position;
        const color = motes.geometry.attributes.color;
        const n = position.count;
        for (let i = 0; i < n; i++) {
            const h = 1 - 2 * (i + 0.5) / n; // Spread evenly over a sphere about the crystal
            const ring = Math.sqrt(1 - h * h);
            let angle = i * 2.39996; // Golden angle
            let dist, light;
            let spread = 1;
            let ahead = h * 0.5;
            if (drawing) {
                const u = (a.time * (this.charging ? 3.4 : 1.7) + i * 0.618) % 1;
                angle += u * 3;
                dist = 0.15 * (1 - u) * (1 - u);
                light = Math.min(1, progress * 6, u * 3) * (1 - u ** 4);
            } else if (a.pop > 0) {
                dist = 0.03 + 0.25 * (1 - a.pop * a.pop);
                light = a.pop;
            } else {
                angle += a.shots * 1.3; // A new spray each shot
                dist = 0.02 + 0.15 * (1 - a.spark * a.spark);
                light = a.spark * (i % 2);
                spread = 0.5;
                ahead = -0.6 - 0.6 * Math.abs(h);
            }
            position.setXYZ(i, Math.cos(angle) * ring * dist * spread, Math.sin(angle) * ring * dist * spread, z + ahead * dist);
            color.setXYZ(i, light, light, light);
        }
        position.needsUpdate = true;
        color.needsUpdate = true;
    }

    shoot() {
        if (this.isReloading || this.charging) return 0;
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
        this.recoil = 1.0; // Drives the cast (animate)
        this.anim.shots++;
        this.anim.spark = 1;

        return bulletsToFire;
    }

    // Swaps in the staff of the tier `level` (modelLevel) reaches (StaffMesh.js); nothing to do within a tier
    rebuildMesh(level) {
        const tier = staffTier(level);
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
