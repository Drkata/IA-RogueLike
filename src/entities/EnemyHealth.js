import * as THREE from 'three';

import { CONSTANTS } from '../core/Constants.js';

export class EnemyHealthSystem {
    // Shared Resources
    static bgGeo = new THREE.PlaneGeometry(1.2, 0.15);
    static fillGeo = new THREE.PlaneGeometry(1.2, 0.1);
    static bgMat = new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide });

    // Shared Status Materials
    static matGreen = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
    static matYellow = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
    static matRed = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
    static matShield = new THREE.MeshBasicMaterial({ color: 0x0088ff, side: THREE.DoubleSide }); // Shield Color

    constructor(enemy, mesh, level) {
        this.enemy = enemy;
        this.mesh = mesh;
        this.level = level;

        // Base Health Calculation
        let baseHealth = CONSTANTS.DIFFICULTY.ENEMY_HEALTH_BASE + (level * CONSTANTS.DIFFICULTY.ENEMY_HEALTH_PER_LEVEL);

        // Post-Level 10 Multiplier
        if (level > 10) {
            const extraLevels = level - 10;
            const multiplier = 1.0 + (extraLevels * CONSTANTS.DIFFICULTY.ENEMY_HEALTH_MULTIPLIER_POST_10);
            baseHealth *= multiplier;
        }

        this.health = baseHealth * 0.7; // Keep the 0.7 reduction from original code if desired, or remove it. Keeping for consistency.
        this.maxHealth = this.health;
        this.isFlashing = false;

        // Mechanics
        this.regenEnabled = level >= CONSTANTS.DIFFICULTY.MECHANIC_REGEN_LEVEL;
        this.shieldEnabled = level >= CONSTANTS.DIFFICULTY.MECHANIC_SHIELD_LEVEL;

        this.lastDamageTime = 0;
        this.shieldHits = this.shieldEnabled ? CONSTANTS.DIFFICULTY.SHIELD_HITS : 0;

        // Visuals for Shield
        if (this.shieldHits > 0) {
            this.createShieldVisual();
        }

        this.createHealthBar();
    }

    createShieldVisual() {
        const shieldGeo = new THREE.SphereGeometry(1.0, 16, 16);
        const shieldMat = new THREE.MeshBasicMaterial({
            color: 0x0088ff,
            transparent: true,
            opacity: 0.3,
            wireframe: true
        });
        this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
        this.shieldMesh.position.y = 0.8; // Center on enemy
        this.mesh.add(this.shieldMesh);
    }

    createHealthBar() {
        // Use shared geometry and materials
        this.healthBarBg = new THREE.Mesh(EnemyHealthSystem.bgGeo, EnemyHealthSystem.bgMat);

        // Start with green
        this.healthBarFill = new THREE.Mesh(EnemyHealthSystem.fillGeo, EnemyHealthSystem.matGreen);

        this.healthBarBg.position.set(0, 2.5, 0);
        this.healthBarFill.position.set(0, 2.5, 0.01);

        this.healthBarBg.visible = false;
        this.healthBarFill.visible = false;

        this.mesh.add(this.healthBarBg);
        this.mesh.add(this.healthBarFill);
    }

    update(dt) {
        const now = performance.now() / 1000;

        // Health Regeneration Logic
        if (this.regenEnabled && this.health < this.maxHealth && this.health > 0) {
            if (now - this.lastDamageTime > CONSTANTS.DIFFICULTY.REGEN_DELAY) {
                const regenAmount = this.maxHealth * CONSTANTS.DIFFICULTY.REGEN_RATE * dt;
                this.health = Math.min(this.health + regenAmount, this.maxHealth);
            }
        }

        // Shield Regeneration Logic
        if (this.shieldEnabled && this.shieldHits < CONSTANTS.DIFFICULTY.SHIELD_HITS) {
            if (now - this.lastDamageTime > CONSTANTS.DIFFICULTY.SHIELD_REGEN_DELAY) {
                // Regenerate Shield (Full restore for now, or use rate if we had a tick system)
                this.shieldHits = CONSTANTS.DIFFICULTY.SHIELD_HITS;

                // Restore Visuals
                if (!this.shieldMesh) {
                    this.createShieldVisual();
                }
            }
        }
    }

    updateHealthBar(camera) {
        if (this.health >= this.maxHealth && this.shieldHits === 0) {
            this.healthBarBg.visible = false;
            this.healthBarFill.visible = false;
            return;
        }

        this.healthBarBg.visible = true;
        this.healthBarFill.visible = true;

        const healthPercent = this.health / this.maxHealth;
        this.healthBarFill.scale.x = healthPercent;
        this.healthBarFill.position.x = -(1.2 * (1 - healthPercent)) / 2;

        // Swap shared materials based on health or shield
        if (this.shieldHits > 0) {
            if (this.healthBarFill.material !== EnemyHealthSystem.matShield) {
                this.healthBarFill.material = EnemyHealthSystem.matShield;
            }
        } else if (healthPercent > 0.6) {
            if (this.healthBarFill.material !== EnemyHealthSystem.matGreen) {
                this.healthBarFill.material = EnemyHealthSystem.matGreen;
            }
        } else if (healthPercent > 0.3) {
            if (this.healthBarFill.material !== EnemyHealthSystem.matYellow) {
                this.healthBarFill.material = EnemyHealthSystem.matYellow;
            }
        } else {
            if (this.healthBarFill.material !== EnemyHealthSystem.matRed) {
                this.healthBarFill.material = EnemyHealthSystem.matRed;
            }
        }

        // Billboard effect
        if (camera) {
            this.healthBarBg.lookAt(camera.position);
            this.healthBarFill.lookAt(camera.position);
        }
    }

    takeDamage(amount) {
        this.lastDamageTime = performance.now() / 1000;

        // Shield Logic
        if (this.shieldHits > 0) {
            this.shieldHits--;
            // Shield Break Effect
            if (this.shieldHits === 0) {
                if (this.shieldMesh) {
                    this.mesh.remove(this.shieldMesh);
                    this.shieldMesh = null;
                }
                // Play sound?
            } else {
                // Flash shield?
            }
            return false; // Blocked damage
        }

        this.health -= amount;

        if (this.isFlashing) return;
        this.isFlashing = true;

        // Simple scale punch instead
        this.mesh.scale.multiplyScalar(1.1);
        setTimeout(() => {
            this.mesh.scale.multiplyScalar(1 / 1.1);
            this.isFlashing = false;
        }, 50);

        return this.health <= 0;
    }
}
