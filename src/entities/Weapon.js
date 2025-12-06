import * as THREE from 'three';
import { soundManager } from '../systems/SoundManager.js';

export class Weapon {
    constructor(camera) {
        this.camera = camera;
        this.canShoot = true;
        this.flashTime = 0;
        this.isReloading = false;
        this.reloadTimer = 0;

        // Upgrade Levels
        this.stats = {
            damage: 0,
            fireRate: 0,
            // arc: 0, // Removed (Merged with Multishot)
            ammo: 0,
            reload: 0,
            range: 0,
            projectileSpeed: 0,
            bulletCount: 0, // Multishot
            piercing: 0,    // Piercing shots
            critChance: 0,  // New
            critDamage: 0,  // New
            knockback: 0,   // New
            explosion: 0,   // New
            ricochet: 0     // New (Replaces Arc)
        };
        this.MAX_LEVEL = 10;

        // Base Stats - Balanced for fast-paced gameplay
        this.baseDamage = 6; // Halved from 12
        this.baseFireRate = 0.4; // Halved from 0.2 (Slower)
        this.baseArc = 0; // Degrees
        this.baseMaxAmmo = 20; // Doubled from 20
        this.baseReloadTime = 1.6;
        this.baseRange = 15;
        this.baseProjectileSpeed = 25; // Base projectile speed (Halved)
        this.baseCritChance = 0; // 0% base
        this.baseCritDamage = 1.5; // 150% base

        // Current Stats (Calculated)
        this.damage = this.baseDamage;
        this.fireRate = this.baseFireRate;
        this.arc = this.baseArc;
        this.maxAmmo = this.baseMaxAmmo;
        this.reloadTime = this.baseReloadTime;
        this.range = this.baseRange;
        this.projectileSpeed = this.baseProjectileSpeed;
        this.bulletCount = 1;
        this.piercing = 0;
        this.critChance = this.baseCritChance;
        this.critDamage = this.baseCritDamage;
        this.knockback = 0;
        this.explosion = 0;
        this.ricochet = 0;

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



    upgrade(stat) {
        if (this.stats[stat] < this.MAX_LEVEL) {
            this.stats[stat]++;
            this.recalculateStats();
            this.rebuildMesh(this.getTotalLevel());
            return true;
        }
        return false;
    }

    getTotalLevel() {
        return Object.values(this.stats).reduce((a, b) => a + b, 0);
    }

    recalculateStats() {
        // Damage: +18% per level (was 15%)
        this.damage = this.baseDamage * (1 + this.stats.damage * 0.18);

        // Fire Rate: -6% delay per level (was 5%) (Cap at 0.05s)
        this.fireRate = Math.max(0.05, this.baseFireRate * Math.pow(0.94, this.stats.fireRate));

        // Arc: Derived from Multishot (2 degrees per extra bullet)
        this.arc = this.stats.bulletCount * 2;

        // Ammo: +25% capacity per level (was 20%)
        this.maxAmmo = Math.floor(this.baseMaxAmmo * (1 + this.stats.ammo * 0.25));

        // Reload: -12% time per level (was 10%)
        this.reloadTime = Math.max(0.1, this.baseReloadTime * Math.pow(0.88, this.stats.reload));

        // Range: +20% per level (Base 15 -> Max 45)
        this.range = this.baseRange * (1 + this.stats.range * 0.20);

        // Projectile Speed: +6% per level (Base 25 -> Max 40)
        this.projectileSpeed = this.baseProjectileSpeed * (1 + this.stats.projectileSpeed * 0.06);

        // Multishot: 1 + level (1 to 11)
        this.bulletCount = 1 + this.stats.bulletCount;

        // Piercing: level (0 to 10)
        this.piercing = this.stats.piercing;

        // Crit Chance: +10% per level (Base 0% -> Max 100%)
        this.critChance = this.baseCritChance + (this.stats.critChance * 0.10);

        // Crit Damage: +20% per level (Base 150% -> Max 350%)
        this.critDamage = this.baseCritDamage + (this.stats.critDamage * 0.20);

        // Knockback: +1 force per level
        this.knockback = this.stats.knockback * 1;

        // Explosion: +10% chance per level
        this.explosion = this.stats.explosion * 0.10;

        // Ricochet: +1 bounce per level
        this.ricochet = this.stats.ricochet;

        // Special Tiers Unlocks
        const total = this.getTotalLevel();
        this.automatic = total >= 6; // Auto fire at Tier 1

        // --- KINETIC IMPACT (New Mechanic) ---
        // Convert excess speed into raw damage
        // Formula: For every 1% speed increase, gain 0.5% damage increase
        const speedMultiplier = (this.projectileSpeed / this.baseProjectileSpeed) - 1;
        if (speedMultiplier > 0) {
            // 50% Efficiency
            this.damage *= (1 + (speedMultiplier * 0.5));
        }

        // Split damage if multiple bullets (to balance multishot)
        if (this.bulletCount > 1) {
            this.damage /= this.bulletCount;
        }
    }

    getStatValue(stat, level) {
        switch (stat) {
            case 'damage': return this.baseDamage * (1 + level * 0.18);
            case 'fireRate': return Math.max(0.05, this.baseFireRate * Math.pow(0.94, level));
            // case 'arc': return level * 5; // Removed
            case 'ammo': return Math.floor(this.baseMaxAmmo * (1 + level * 0.25));
            case 'reload': return Math.max(0.1, this.baseReloadTime * Math.pow(0.88, level));
            case 'range': return this.baseRange * (1 + level * 0.20);
            case 'projectileSpeed': return this.baseProjectileSpeed * (1 + level * 0.06);
            case 'bulletCount': return 1 + level; // +1 per level
            case 'piercing': return level; // +1 per level
            case 'critChance': return (this.baseCritChance + (level * 0.10)) * 100; // %
            case 'critDamage': return (this.baseCritDamage + (level * 0.25)) * 100; // %
            case 'knockback': return level * 0.5;
            case 'explosion': return level * 0.10 * 100; // %
            case 'ricochet': return level; // Bounces
            default: return 0;
        }
    }

    reload() {
        if (this.currentAmmo < this.maxAmmo && this.reserveAmmo > 0 && !this.isReloading) {
            this.isReloading = true;
            this.reloadTimer = this.reloadTime;
            soundManager.playReload();
            console.log("Reloading...");
        }
    }

    addAmmo(amount) {
        this.reserveAmmo += amount;
    }

    reset() {
        this.stats = {
            damage: 0,
            fireRate: 0,
            // arc: 0,
            ammo: 0,
            reload: 0,
            range: 0,
            projectileSpeed: 0,
            bulletCount: 0,
            piercing: 0,
            critChance: 0,
            critDamage: 0,
            knockback: 0,
            explosion: 0,
            ricochet: 0
        };
        this.currentAmmo = this.baseMaxAmmo;
        this.reserveAmmo = 400;
        this.explosion = 0; // Force reset

        // Melee State
        this.isMeleeing = false;
        this.meleeTimer = 0;
        this.meleeCooldown = 0.8;

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

                console.log("Reload Complete");
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
            // Idle Animation (Bobbing / Floating)
            const time = performance.now() / 1000;
            const baseY = -0.3 + Math.sin(time * 2) * 0.02; // Gentle bob
            this.gunMesh.position.y = baseY;
            this.gunMesh.rotation.z = Math.sin(time * 1.5) * 0.05; // Gentle sway

            // Recoil recovery (Stable Lerp)
            const alpha = Math.min(1.0, dt * 5); // Clamp to prevent overshoot
            this.gunMesh.position.z = THREE.MathUtils.lerp(this.gunMesh.position.z, -0.5, alpha);
            this.gunMesh.rotation.x = THREE.MathUtils.lerp(this.gunMesh.rotation.x, 0.2, alpha);
            this.gunMesh.rotation.y = THREE.MathUtils.lerp(this.gunMesh.rotation.y, 0, alpha);
        }

        // Flash fade (Orb glow pulse)
        if (this.flashTime > 0) {
            this.flashTime -= dt;
            if (this.flash) {
                this.flash.intensity = 2 + (this.flashTime / 0.1) * 5; // Bright flash
                this.flash.distance = 5;
            }
        } else if (this.flash) {
            this.flash.intensity = 1; // Base glow
            this.flash.distance = 2;
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

        // Visual Recoil (Staff thrust)
        if (this.gunMesh) {
            this.gunMesh.position.z += 0.1;
            this.gunMesh.rotation.x -= 0.2; // Tilt up
        }

        return bulletsToFire;
    }

    rebuildMesh(totalLevel) {
        this.mesh.clear();

        let orbColor = 0x00ffff; // Default Cyan
        let woodColor = 0x5c4033; // Dark Wood

        if (totalLevel >= 26) orbColor = 0xFFD700; // Gold (Divine)
        else if (totalLevel >= 21) orbColor = 0xFF00FF; // Magenta (Arcane)
        else if (totalLevel >= 16) orbColor = 0x800080; // Purple (Void)
        else if (totalLevel >= 11) orbColor = 0x0000FF; // Blue (Frost)
        else if (totalLevel >= 6) orbColor = 0x00FF00; // Green (Nature)

        // Materials
        const woodMat = new THREE.MeshStandardMaterial({ color: woodColor, roughness: 0.9, metalness: 0.1 });
        const orbMat = new THREE.MeshStandardMaterial({
            color: orbColor,
            emissive: orbColor,
            emissiveIntensity: 0.5,
            roughness: 0.2,
            metalness: 0.8,
            transparent: true,
            opacity: 0.9
        });
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.9 });

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
            const vine = new THREE.Mesh(vineGeo, new THREE.MeshStandardMaterial({ color: 0x00aa00 }));
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
        this.flash = new THREE.PointLight(orbColor, 1, 2);
        this.flash.position.set(0, 0, -0.6);
        this.gunMesh.add(this.flash);
    }
}
