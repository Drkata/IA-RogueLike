import * as THREE from 'three';
import { CONSTANTS } from '../core/Constants.js';
import { Weapon } from './Weapon.js';
import { Projectile } from './Projectile.js';
import { soundManager } from '../systems/SoundManager.js';

export class Player {
    constructor(camera, input, levelManager, entityManager, hudManager) {
        this.camera = camera;
        this.input = input;
        this.levelManager = levelManager;
        this.entityManager = entityManager;
        this.hudManager = hudManager;
        this.position = new THREE.Vector3(0, 1.6, 0); // Eye level
        this.velocity = new THREE.Vector3();
        this.camera.position.copy(this.position);
        this.radius = 0.3; // Player collision radius
        this.onGround = true;
        this.invulnerabilityTimer = 0;

        // Euler angles for rotation (yaw, pitch)
        this.yaw = 0;
        this.pitch = 0;

        this.weapon = new Weapon(this.camera); // Single scalable weapon

        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.armor = 0; // Percentage reduction (0-50%)
        this.vampirism = 0; // Life steal percentage
        this.regen = 0; // HP per second
        this.speed = CONSTANTS.PLAYER_SPEED;

        // Upgrade Stats
        this.stats = {
            maxHealth: 0,
            armor: 0,
            vampirism: 0,
            regen: 0,
            speed: 0
        };

        // Session Stats (for Game Over screen)
        this.sessionStats = {
            damageDealt: 0,
            shotsFired: 0,
            shotsHit: 0,
            kills: 0,
            startTime: Date.now(),
            critCount: 0,
            maxDamageHit: 0,
            damageTaken: 0,
            healingDone: 0
        };

        this.MAX_LEVEL = 10;

        this.updateHUD();

        // Connect reload button
        if (this.hudManager) {
            this.hudManager.setReloadCallback(() => {
                this.weapon.reload();
            });
        }

        this.damageLog = []; // Death Recap Log
    }

    takeDamage(amount, sourceName = 'Unknown', sourceId = -1) {
        if (this.invulnerabilityTimer > 0) return;

        // Apply armor reduction (max 50%)
        const reduction = Math.min(0.5, this.armor); // 5% per armor level
        const finalDamage = amount * (1 - reduction);
        this.sessionStats.damageTaken += finalDamage;

        // Log Damage
        this.damageLog.push({
            source: sourceName,
            id: sourceId,
            damage: finalDamage,
            timestamp: Date.now()
        });

        this.health -= finalDamage;
        if (this.health < 0) this.health = 0;
        this.updateHUD();
        if (this.hudManager) this.hudManager.onDamage();
        soundManager.playPlayerHit();
        this.invulnerabilityTimer = 0.5; // Increased to 0.5s

        // Simple red flash effect
        document.body.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
        setTimeout(() => document.body.style.backgroundColor = 'black', 100);

        if (this.health <= 0) {
            console.log("GAME OVER");
            if (window.game) {
                window.game.gameOver(this.damageLog);
            }
        }
    }

    reset() {
        this.health = 100;
        this.position.set(0, 1.6, 0);
        this.velocity.set(0, 0, 0);
        this.onGround = true;
        this.yaw = 0;
        this.pitch = 0;
        this.camera.rotation.set(0, 0, 0);

        // Reset Stats
        this.stats = {
            maxHealth: 0,
            armor: 0,
            vampirism: 0,
            regen: 0,
            speed: 0
        };

        this.sessionStats = {
            damageDealt: 0,
            shotsFired: 0,
            shotsHit: 0,
            kills: 0,
            startTime: Date.now(),
            critCount: 0,
            maxDamageHit: 0,
            damageTaken: 0,
            damageTaken: 0,
            healingDone: 0
        };

        this.damageLog = []; // Clear log for new round

        this.recalculateStats();

        this.weapon.reset();
        this.updateHUD();
    }

    heal(amount) {
        const oldHealth = this.health;
        this.health += amount;
        if (this.health > this.maxHealth) this.health = this.maxHealth;

        const effectiveHeal = this.health - oldHealth;
        if (effectiveHeal > 0) this.sessionStats.healingDone += effectiveHeal;

        this.updateHUD();
    }

    updateHUD() {
        if (this.hudManager) {
            this.hudManager.updateHealth(this.health, this.maxHealth);
            this.hudManager.updateAmmo(this.weapon.currentAmmo, this.weapon.reserveAmmo);
            this.hudManager.updateStats(this);
        }
    }

    update(dt) {
        if (this.invulnerabilityTimer > 0) this.invulnerabilityTimer -= dt;
        this.handleRotation();
        this.handleMovement(dt);

        // Shooting Input - Removed Space bar to allow jumping
        if (this.input.keys['Mouse0']) { // Left Click only
            this.handleShooting();
        }

        // Melee Input (Right Click)
        if (this.input.keys['Mouse1']) {
            this.handleMelee();
        }

        // Reload Input
        if (this.input.keys['KeyR']) {
            this.weapon.reload();
        }

        this.weapon.update(dt);

        // Regeneration
        if (this.regen > 0 && this.health < this.maxHealth) {
            this.heal(this.regen * dt);
        }

        this.updateHUD();
    }

    handleMelee() {
        if (this.weapon.melee()) {
            soundManager.playShoot(); // Use shoot sound for now, or a specific whoosh if available

            // Hit Detection (SphereCast)
            // Range: 3.0
            // Radius: 1.0
            const range = 3.0;
            const damage = 10; // Reduced from 25
            const knockbackForce = 15; // Strong push

            // Get camera forward direction
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
            const origin = this.camera.position.clone();

            let closestEnemy = null;
            let closestDist = Infinity;

            // Check all enemies to find the closest one in range/cone
            if (this.entityManager && this.entityManager.entities) {
                this.entityManager.entities.forEach(entity => {
                    if (entity.entityType === 'enemy' && !entity.isDead) {
                        const toEnemy = new THREE.Vector3().subVectors(entity.position, origin);
                        const dist = toEnemy.length();

                        if (dist < range + 1.0) { // Within range
                            const angle = toEnemy.angleTo(forward);
                            if (angle < Math.PI / 4) { // Within 45 degree cone
                                // Found a candidate, check if it's closer
                                if (dist < closestDist) {
                                    closestDist = dist;
                                    closestEnemy = entity;
                                }
                            }
                        }
                    }
                });
            }

            // Apply hit to the single closest enemy
            if (closestEnemy) {
                const died = closestEnemy.takeDamage(damage);

                // Apply Knockback
                const toEnemy = new THREE.Vector3().subVectors(closestEnemy.position, origin);
                const pushDir = toEnemy.normalize();
                pushDir.y = 0; // Keep horizontal to avoid floating issues
                pushDir.normalize();

                // Calculate potential new position
                const pushDist = 1.0;
                const newPos = closestEnemy.position.clone().add(pushDir.multiplyScalar(pushDist));

                // Only move if valid (check walls via EnemyAI)
                if (closestEnemy.ai && closestEnemy.ai.canMoveTo(newPos)) {
                    closestEnemy.position.copy(newPos);
                }

                soundManager.playHit();
            }
        }
    }

    handleShooting() {
        const bulletsFired = this.weapon.shoot();
        if (bulletsFired > 0) {
            this.sessionStats.shotsFired += bulletsFired;
            soundManager.playShoot();

            // Spawn projectiles instead of raycast
            // Spawn projectiles
            const count = bulletsFired;
            const arcDeg = this.weapon.arc || 0;
            const totalArcRad = THREE.MathUtils.degToRad(arcDeg);

            // Camera vectors
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);

            for (let i = 0; i < count; i++) {
                // Calculate angle for this bullet
                let angle = 0;
                if (count > 1) {
                    const pct = i / (count - 1);
                    angle = -totalArcRad / 2 + (totalArcRad * pct);
                } else if (totalArcRad > 0) {
                    // Single shot with arc = random spread within that arc
                    angle = (Math.random() - 0.5) * totalArcRad;
                }

                // Get base direction and apply arc rotation
                const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
                direction.applyAxisAngle(up, angle);
                direction.normalize();

                // Critical Hit Calculation
                const isCritical = Math.random() < this.weapon.critChance;
                const damage = isCritical ? this.weapon.damage * this.weapon.critDamage : this.weapon.damage;

                // Create projectile
                const startPos = this.camera.position.clone().add(direction.clone().multiplyScalar(0.5));
                const projectile = new Projectile(
                    startPos,
                    direction,
                    this.weapon.projectileSpeed,
                    damage,
                    this.levelManager,
                    this.weapon.piercing || 0,
                    isCritical,
                    this.weapon.knockback || 0,
                    this.weapon.explosion || 0,
                    0, // Gravity
                    1.0, // Radius
                    'Player', // Source Name
                    -1, // Source ID
                    this.weapon.range, // Max Distance
                    this.weapon.ricochet || 0 // Ricochet Count
                );
                projectile.isPlayerProjectile = true; // Mark as player projectile

                // Add to entity manager
                if (this.entityManager) {
                    this.entityManager.add(projectile);
                }
            }
        }
    }

    handleRotation() {
        const mouseDelta = this.input.getMouseDelta();

        this.yaw -= mouseDelta.x * CONSTANTS.PLAYER_SENSITIVITY;
        this.pitch -= mouseDelta.y * CONSTANTS.PLAYER_SENSITIVITY;

        // Clamp pitch (look up/down limit)
        this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));

        // Apply rotation to camera
        // Order: Y (Yaw), X (Pitch), Z (Roll - 0)
        this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }

    handleMovement(dt) {
        const speed = this.speed;
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

        // Horizontal Movement
        const moveDir = new THREE.Vector3(0, 0, 0);
        if (this.input.isKeyDown('KeyW')) moveDir.add(forward);
        if (this.input.isKeyDown('KeyS')) moveDir.sub(forward);
        if (this.input.isKeyDown('KeyA')) moveDir.sub(right);
        if (this.input.isKeyDown('KeyD')) moveDir.add(right);

        if (moveDir.lengthSq() > 0) {
            moveDir.normalize().multiplyScalar(speed);
        }

        this.velocity.x = moveDir.x;
        this.velocity.z = moveDir.z;

        // Jumping
        if (this.onGround && this.input.keys['Space']) {
            this.velocity.y = CONSTANTS.JUMP_FORCE;
            this.onGround = false;
        }

        // Gravity
        this.velocity.y -= CONSTANTS.GRAVITY * dt;

        // Apply Velocity
        const deltaPosition = this.velocity.clone().multiplyScalar(dt);
        const nextPos = this.position.clone().add(deltaPosition);

        // Ground Collision
        if (nextPos.y < 1.6) {
            nextPos.y = 1.6;
            this.velocity.y = 0;
            this.onGround = true;
        } else {
            this.onGround = false;
        }
        let canMoveX = true;
        const checkRadius = this.radius;

        // Helper to check collision at a specific point
        // Helper to check collision at a specific point
        const checkCollision = (x, z) => {
            if (!this.levelManager) return false;
            return this.levelManager.isWall(x, z) || this.levelManager.isDecoration(x, z);
        };

        // Check X direction
        const nextPosX = nextPos.x;
        const currentZ = this.position.z;
        const r = this.radius;

        // Check all 4 corners at the new X position
        if (checkCollision(nextPosX + r, currentZ + r) ||
            checkCollision(nextPosX + r, currentZ - r) ||
            checkCollision(nextPosX - r, currentZ + r) ||
            checkCollision(nextPosX - r, currentZ - r)) {
            canMoveX = false;
        }

        if (canMoveX) {
            this.position.x = nextPosX;
        }

        // Check Z direction
        let canMoveZ = true;
        const nextPosZ = nextPos.z;
        const currentX = this.position.x; // Updated X

        // Check all 4 corners at the new Z position
        if (checkCollision(currentX + r, nextPosZ + r) ||
            checkCollision(currentX + r, nextPosZ - r) ||
            checkCollision(currentX - r, nextPosZ + r) ||
            checkCollision(currentX - r, nextPosZ - r)) {
            canMoveZ = false;
        }

        if (canMoveZ) {
            this.position.z = nextPosZ;
        }

        // Apply Vertical Position
        this.position.y = nextPos.y;

        this.camera.position.copy(this.position);
    }

    upgrade(stat) {
        if (this.stats[stat] !== undefined) {
            if (this.stats[stat] < this.MAX_LEVEL) {
                this.stats[stat]++;
                this.recalculateStats();
                return true;
            }
        }
        return false;
    }

    recalculateStats() {
        // Max Health: +25 per level (Buffed from 20)
        const oldMax = this.maxHealth;
        this.maxHealth = 100 + (this.stats.maxHealth * 25);

        // Heal the difference so upgrade feels good immediately
        if (this.maxHealth > oldMax) {
            this.health += (this.maxHealth - oldMax);
        }

        // Armor: +3.0% per level (Nerfed from 4%)
        this.armor = this.stats.armor * 0.03;

        // Vampirism: +2% per level (max 20%)
        this.vampirism = this.stats.vampirism * 0.02;

        // Regeneration: +0.3 HP/s per level (Nerfed from 0.5)
        this.regen = this.stats.regen * 0.3;

        // Speed: +8% per level (Buffed from 5%)
        this.speed = CONSTANTS.PLAYER_SPEED * (1 + this.stats.speed * 0.08);

        this.updateHUD();
    }

    getStatValue(stat, level) {
        switch (stat) {
            case 'maxHealth': return 100 + (level * 25);
            case 'armor': return level * 3.0; // Return as percentage number
            case 'vampirism': return level * 2; // Return as percentage number
            case 'regen': return level * 0.3; // HP per second
            case 'speed': return Math.round((1 + level * 0.08) * 100); // Percentage speed
            default: return 0;
        }
    }
}
