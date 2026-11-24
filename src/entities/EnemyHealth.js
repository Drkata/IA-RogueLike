import * as THREE from 'three';

import { CONSTANTS } from '../core/Constants.js';
import { PALETTE } from '../core/Palette.js';
import { soundManager } from '../systems/SoundManager.js';

export class EnemyHealthSystem {
    // Shared Resources
    static bgGeo = new THREE.PlaneGeometry(1.2, 0.15);
    static fillGeo = new THREE.PlaneGeometry(1.2, 0.1);
    static bgMat = new THREE.MeshBasicMaterial({ color: PALETTE.ink, side: THREE.DoubleSide });

    // Shared Status Materials
    static matGreen = new THREE.MeshBasicMaterial({ color: PALETTE.sage, side: THREE.DoubleSide });
    static matYellow = new THREE.MeshBasicMaterial({ color: PALETTE.giltBright, side: THREE.DoubleSide });
    static matRed = new THREE.MeshBasicMaterial({ color: PALETTE.emberBright, side: THREE.DoubleSide });
    static matShield = new THREE.MeshBasicMaterial({ color: PALETTE.aetherBright, side: THREE.DoubleSide });

    // Shield bubble (shared, never mutated)
    static shieldGeo = new THREE.SphereGeometry(1.0, 16, 16);
    static shieldMat = new THREE.MeshBasicMaterial({ color: PALETTE.aetherBright, transparent: true, opacity: 0.3, wireframe: true });

    constructor(enemy, mesh, level) {
        this.enemy = enemy;
        this.mesh = mesh;
        this.level = level;

        this.maxHealth = EnemyHealthSystem.getMaxHealth(level);
        this.health = this.maxHealth;
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

    static getMaxHealth(level) {
        const D = CONSTANTS.DIFFICULTY;
        let health = D.ENEMY_HEALTH_BASE + level * D.ENEMY_HEALTH_PER_LEVEL;
        if (level > 10) health *= 1.0 + (level - 10) * D.ENEMY_HEALTH_MULTIPLIER_POST_10; // Compounding after level 10
        return health * 0.7;
    }

    createShieldVisual() {
        this.shieldMesh = new THREE.Mesh(EnemyHealthSystem.shieldGeo, EnemyHealthSystem.shieldMat);
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
        if (this.shieldHits > 0) this.healthBarFill.material = EnemyHealthSystem.matShield;
        else if (healthPercent > 0.6) this.healthBarFill.material = EnemyHealthSystem.matGreen;
        else if (healthPercent > 0.3) this.healthBarFill.material = EnemyHealthSystem.matYellow;
        else this.healthBarFill.material = EnemyHealthSystem.matRed;

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
            if (this.shieldHits === 0 && this.shieldMesh) {
                this.mesh.remove(this.shieldMesh); // Shield broken
                this.shieldMesh = null;
                soundManager.play('shieldBreak', this.enemy.position);
            }
            return false; // Blocked damage
        }

        this.health -= amount;

        // Hit feedback: short scale punch (skipped while one is already running)
        if (!this.isFlashing) {
            this.isFlashing = true;
            this.mesh.scale.multiplyScalar(1.1);
            setTimeout(() => {
                this.mesh.scale.multiplyScalar(1 / 1.1);
                this.isFlashing = false;
            }, 50);
        }

        return this.health <= 0;
    }
}
