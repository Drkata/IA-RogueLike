import * as THREE from 'three';
import { Projectile } from './Projectile.js';
import { Enemy } from './Enemy.js';
import { soundManager } from '../systems/SoundManager.js';
import { FloatingText } from './FloatingText.js';

export class BossSentinel {
    static idCounter = 1000; // Start high to avoid conflict with minions

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
        this.position.y = 12; // Floating higher (was 4)
        this.levelManager = levelManager;
        this.entityManager = entityManager;
        this.level = level;

        this.isDead = false;
        this.maxHealth = BossSentinel.getHP(level);
        this.health = this.maxHealth;
        this.radius = 6.0; // Huge collision box (was 2.0)
        this.entityType = 'enemy'; // Fix for minified builds

        // Mesh
        this.mesh = this.createMesh();
        this.mesh.position.copy(this.position);
        this.mesh.userData.entity = this;

        // Combat System (No more single state machine)
        this.targetPlayer = null;

        // Independent Cooldowns (Combos!)
        this.cooldowns = {
            missile: 2.0, // Start soon
            summon: 5.0,
            spiral: 10.0,
            laser: 0.4, // Faster fire rate (was 0.8)
        };

        // Blocking State (Only for full-body animations like Spiral)
        this.isSpiraling = false;
        this.spiralTimer = 0;
        this.spiralShotTimer = 0; // Throttle shots
        this.globalCooldown = 0; // Pause between attacks


        this.rotationSpeed = 0.5;

        // Show Health Bar
        const container = document.getElementById('boss-health-container');
        if (container) container.style.display = 'block';
        this.updateHealthBar();
    }

    createMesh() {
        const group = new THREE.Group();

        // Central Eye (Core) - Tripled size (1.5 -> 4.5)
        const coreGeo = new THREE.SphereGeometry(4.5, 32, 32);
        const coreMat = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0x550000,
            roughness: 0.2,
            metalness: 0.8
        });
        this.core = new THREE.Mesh(coreGeo, coreMat);
        group.add(this.core);

        // Outer Rings (Shields) - Tripled size (2.5 -> 7.5)
        const ringGeo = new THREE.TorusGeometry(7.5, 0.6, 16, 100); // Tube also thicker (0.2 -> 0.6)
        const ringMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 1.0 });

        this.ring1 = new THREE.Mesh(ringGeo, ringMat);
        this.ring2 = new THREE.Mesh(ringGeo, ringMat);
        this.ring2.rotation.x = Math.PI / 2;

        group.add(this.ring1);
        group.add(this.ring2);

        // Base (Ground connection visual) - Tripled
        const baseGeo = new THREE.CylinderGeometry(1.5, 6, 12, 16);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = -9; // Lowered to match new scale (was -3)
        group.add(base);

        return group;
    }

    takeDamage(amount, isCritical = false) {
        if (this.isDead) return;

        this.health -= amount;
        this.updateHealthBar();

        // Floating Text
        if (this.entityManager) {
            const color = isCritical ? '#ff00ff' : '#ffffff';
            const size = isCritical ? 5.0 : 4.0; // Bigger for boss
            const text = amount.toFixed(1) + (isCritical ? '!' : '');

            // Spawn slightly above boss center
            const pos = this.position.clone();
            pos.y += 5.0;

            const floatingText = new FloatingText(pos, text, color, size);
            this.entityManager.add(floatingText);
        }

        // Flash effect
        this.core.material.emissive.setHex(0xffffff);
        setTimeout(() => {
            if (!this.isDead) this.core.material.emissive.setHex(0x550000);
        }, 50);

        if (this.health <= 0) {
            this.die();
            return true;
        }
        return false;
    }

    updateHealthBar() {
        const bar = document.getElementById('boss-health-bar');
        if (bar) {
            const pct = Math.max(0, (this.health / this.maxHealth) * 100);
            bar.style.width = pct + '%';
        }
        const text = document.getElementById('boss-health-text');
        if (text) {
            text.innerText = `${Math.ceil(Math.max(0, this.health))} / ${this.maxHealth}`;
        }
    }

    die() {
        this.isDead = true;
        this.mesh.visible = false;

        // Hide Health Bar
        const container = document.getElementById('boss-health-container');
        if (container) container.style.display = 'none';

        // Big explosion effect
        if (this.entityManager) {
            this.entityManager.createExplosion(this.position, 0); // Visual only
            // Drop massive loot
            // Drop massive loot

        }
    }

    update(dt, player) {
        if (this.isDead) return;
        this.targetPlayer = player;

        // Rotate Rings (Always active)
        this.ring1.rotation.y += dt * 0.5;
        this.ring1.rotation.x += dt * 0.2;
        this.ring2.rotation.y -= dt * 0.3;
        this.ring2.rotation.z += dt * 0.4;

        // --- Combat Logic ---

        // 1. Handle Spiral State (Blocking)
        if (this.isSpiraling) {
            this.updateSpiral(dt);
            this.spiralTimer -= dt;
            if (this.spiralTimer <= 0) {
                this.isSpiraling = false;
                this.cooldowns.spiral = 15.0; // Long cooldown
                this.globalCooldown = 3.0; // Pause after spiral
                console.log("Boss: Spiral Ended");
            }
            return; // Don't do other attacks while spiraling
        }

        // 2. Look at Player (if not spiraling)
        if (this.targetPlayer) {
            this.mesh.lookAt(this.targetPlayer.position);
        }

        // Global Cooldown (Pause logic)
        if (this.globalCooldown > 0) {
            this.globalCooldown -= dt;
            return; // Do nothing while in global cooldown
        }

        // 3. Independent Cooldowns (Combos)
        this.cooldowns.missile -= dt;
        this.cooldowns.summon -= dt;
        this.cooldowns.spiral -= dt;
        this.cooldowns.laser -= dt;

        // Check Spiral Trigger
        if (this.cooldowns.spiral <= 0) {
            this.isSpiraling = true;
            this.spiralTimer = 4.0; // Duration
            console.log("Boss: START SPIRAL");
            return;
        }

        // Check Missile Trigger
        if (this.cooldowns.missile <= 0) {
            this.fireMissiles();
            this.cooldowns.missile = 6.0; // Reset
            this.globalCooldown = 2.0; // Pause after missiles
            return;
        }

        // Check Summon Trigger
        if (this.cooldowns.summon <= 0) {
            this.summonMinions();
            this.cooldowns.summon = 20.0;
            this.globalCooldown = 4.0; // Long pause after summoning to kill minions
            return;
        }

        // Default Attack: Laser Sweep (Area Denial)
        if (this.cooldowns.laser <= 0) {
            this.fireLaserSweep();
            this.cooldowns.laser = 1.5;
            this.globalCooldown = 1.0; // Short pause after laser
        }
    }

    getPredictedPosition(player, projectileSpeed) {
        if (!player) return new THREE.Vector3();

        const dist = this.position.distanceTo(player.position);
        const timeToImpact = dist / projectileSpeed;

        // Predict where player will be
        // Limit prediction to avoid shooting wildly off-map if player is moving fast
        const prediction = player.velocity.clone().multiplyScalar(timeToImpact);

        // Clamp prediction magnitude (don't predict too far ahead)
        if (prediction.length() > 5) prediction.setLength(5);

        return player.position.clone().add(prediction);
    }

    fireLaserSweep() {
        if (!this.targetPlayer) return;

        // "Sweep" logic: Fire a fan of projectiles covering a wide area
        // Center the arc on the player, but cover 90 degrees
        const directionToPlayer = new THREE.Vector3().subVectors(this.targetPlayer.position, this.position).normalize();
        const baseAngle = Math.atan2(directionToPlayer.x, directionToPlayer.z);

        const projectileCount = 120; // 360 Degree Nova
        const arcSpread = Math.PI * 2; // Full circle
        const startAngle = baseAngle - (arcSpread / 2);

        for (let i = 0; i < projectileCount; i++) {
            const percent = i / (projectileCount - 1);
            const angle = startAngle + (arcSpread * percent);

            const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).normalize();

            // Add slight vertical randomness
            dir.y = (Math.random() - 0.5) * 0.05;
            dir.normalize();

            // Spawn lower (Player height)
            const spawnPos = this.position.clone();
            spawnPos.y = 1.5;

            // Speed Scaling: +5% per 10 levels
            const tier = Math.max(1, Math.floor(this.level / 10));
            const speedMult = 1 + (tier * 0.05);

            const proj = new Projectile(
                spawnPos,
                dir,
                35 * speedMult, // Scaled Speed (Reduced from 50)
                BossSentinel.getLaserDamage(this.level),
                this.levelManager,
                0, false, 0, 0, 0, 1.0,
                "Boss: Laser Sweep", this.id,
                200 // Default Range
            );

            // Visual: Glowing Balls
            proj.mesh.geometry = new THREE.SphereGeometry(0.2, 8, 8); // Reduced from 0.4 (50% smaller)

            // Use MeshBasicMaterial for "glowing" effect (unlit)
            proj.mesh.material = new THREE.MeshBasicMaterial({
                color: 0xaa00ff // Violet/Purple
            });

            this.entityManager.add(proj);
        }
    }

    updateSpiral(dt) {
        // Initialize direction state if not present
        if (this.spiralDirection === undefined) {
            this.spiralDirection = 1;
            this.spiralDirTimer = 0;
        }

        // Timer to switch direction
        this.spiralDirTimer += dt;
        if (this.spiralDirTimer >= 1.5) {
            this.spiralDirection *= -1; // Flip direction
            this.spiralDirTimer = 0;
        }

        // Bullet Hell: Spin and fire
        this.mesh.rotation.y += dt * 8.0 * this.spiralDirection; // Spin VERY fast in current direction

        // Fire rate for spiral (Throttled)
        this.spiralShotTimer -= dt;
        if (this.spiralShotTimer <= 0) {
            this.spiralShotTimer = 0.1; // Fire every 0.1s (10 times/sec)

            const angleCount = 20; // Reduced from 24 (Easier to dodge)
            for (let i = 0; i < angleCount; i++) {
                const angle = (i / angleCount) * Math.PI * 2 + this.mesh.rotation.y;
                const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).normalize(); // Horizontal fire

                // Spawn lower (at waist level)
                const spawnPos = this.position.clone();
                spawnPos.y = 1.0; // Lowered from 2.0

                // Speed Scaling
                const tier = Math.max(1, Math.floor(this.level / 10));
                const speedMult = 1 + (tier * 0.05);

                const proj = new Projectile(
                    spawnPos,
                    dir,
                    15 * speedMult, // Scaled Speed
                    BossSentinel.getSpiralDamage(this.level),
                    this.levelManager,
                    0, false, 0, 0, 0, 1.0,
                    "Boss: Spiral", this.id,
                    200 // Default Range
                );
                proj.mesh.material.color.setHex(0x00ffff); // Cyan
                proj.mesh.scale.setScalar(0.8); // Reduced by 20% (Easier to dodge)
                this.entityManager.add(proj);
            }
        }
    }

    fireMissiles() {
        if (!this.targetPlayer) return;
        console.log("Boss: Firing Meteor Rain");

        // "Continuous" Random Rain
        const missileCount = 50;

        for (let i = 0; i < missileCount; i++) {
            setTimeout(() => {
                if (this.isDead) return; // Stop if dead

                // Speed Scaling
                const tier = Math.max(1, Math.floor(this.level / 10));
                const speedMult = 1 + (tier * 0.05);

                const gravity = 20;
                const flightTime = 2.0 / speedMult; // Faster flight = Higher speed

                // Random Target in Arena (approx 40 unit radius)
                const range = 40;
                const targetPos = this.position.clone();
                targetPos.x += (Math.random() - 0.5) * 2 * range;
                targetPos.z += (Math.random() - 0.5) * 2 * range;
                targetPos.y = 0;

                // 1. Show Telegraph
                this.entityManager.createTelegraph(targetPos, flightTime);

                // 2. Calculate Launch Velocity
                const startPos = this.position.clone();
                startPos.y += 5;

                const dist = new THREE.Vector3().subVectors(targetPos, startPos);
                dist.y = 0;
                const hSpeed = dist.length() / flightTime;
                const hDir = dist.normalize();

                const dy = targetPos.y - startPos.y;
                const vSpeed = (0.5 * gravity * (flightTime * flightTime) + dy) / flightTime;

                const velocity = hDir.multiplyScalar(hSpeed);
                velocity.y = vSpeed;

                // 3. Spawn Projectile
                const proj = new Projectile(
                    startPos,
                    velocity.clone().normalize(),
                    velocity.length(),
                    BossSentinel.getMissileDamage(this.level),
                    this.levelManager,
                    0, false, 0,
                    6.0,
                    gravity,
                    4.0,
                    "Boss: Missile Rain", this.id,
                    200 // Default Range
                );

                proj.mesh.material.color.setHex(0xff0000);
                proj.mesh.scale.setScalar(4.0);

                this.entityManager.add(proj);

            }, i * 150); // Fire every 150ms
        }
    }

    summonMinions() {
        if (!this.entityManager) return;

        // Count Scaling: Double every 10 levels
        const tier = Math.max(1, Math.floor(this.level / 10));
        // Cap count to 30 to prevent performance issues and overcrowding
        const rawCount = 10 * Math.pow(2, tier - 1);
        const count = Math.min(30, rawCount);

        console.log(`Boss: Summoning ${count} Minions (Tier ${tier})`);

        // Dynamic Radius based on count to reduce clumping
        // Base 10, +0.5 per minion, Max 25
        let radius = 10 + (count * 0.5);
        if (radius > 25) radius = 25;

        // Spawn minions around the boss
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;

            // Calculate position
            const offset = new THREE.Vector3(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
            const spawnPos = this.position.clone().add(offset);
            spawnPos.y = 0; // Ground

            // Validate position (Check for walls)
            if (this.levelManager && !this.levelManager.isWall(spawnPos.x, spawnPos.z)) {
                const enemy = new Enemy(spawnPos, this.levelManager, this.entityManager, this.level);
                this.entityManager.add(enemy);
            }
        }
    }
}
