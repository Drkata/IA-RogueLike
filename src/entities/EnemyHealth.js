import * as THREE from 'three';

import { CONSTANTS } from '../core/Constants.js';
import { PALETTE } from '../core/Palette.js';
import { soundManager } from '../systems/SoundManager.js';

const BAR_Y = 2.5; // m above the feet
const _barPos = new THREE.Vector3();
const _bar = new THREE.Matrix4();
const _fill = new THREE.Matrix4();
const _scale = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const SHIELD_OFFSET = new THREE.Matrix4().makeTranslation(0, 0.8, 0); // Bubble centred on the body

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
    // Enemy bar fills are batched: white, tinted per copy with the colours above
    static barFillMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

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
        // Shield bubble and health bar are drawn by the entity manager's batches (draw)
    }

    static getMaxHealth(level) {
        const D = CONSTANTS.DIFFICULTY;
        let health = D.ENEMY_HEALTH_BASE + level * D.ENEMY_HEALTH_PER_LEVEL;
        if (level > 10) health *= 1.0 + (level - 10) * D.ENEMY_HEALTH_MULTIPLIER_POST_10; // Compounding after level 10
        return health * 0.7;
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
            }
        }
    }

    // Shield bubble while it holds, and the health bar once hurt (or shielded) facing the camera.
    // `this.mesh.matrix` (the body) is up to date: Enemy.draw.
    draw(entityManager, camera) {
        const body = this.mesh.matrix;
        if (this.shieldHits > 0) {
            entityManager.batch(EnemyHealthSystem.shieldGeo, EnemyHealthSystem.shieldMat).add(_bar.multiplyMatrices(body, SHIELD_OFFSET));
        }
        if (this.health >= this.maxHealth && this.shieldHits === 0) return;

        // As Object3D.lookAt(camera): +Z towards the camera; the body's scale carries the hit punch
        _barPos.set(0, BAR_Y, 0).applyMatrix4(body);
        _bar.lookAt(camera.position, _barPos, _up).setPosition(_barPos).scale(_scale.setScalar(this.mesh.scale.x));
        entityManager.batch(EnemyHealthSystem.bgGeo, EnemyHealthSystem.bgMat).add(_bar);

        // The fill shrinks towards the left, just in front of the background
        const ratio = this.health / this.maxHealth;
        const color = this.shieldHits > 0 ? PALETTE.aetherBright : ratio > 0.6 ? PALETTE.sage : ratio > 0.3 ? PALETTE.giltBright : PALETTE.emberBright;
        _fill.makeTranslation(-(1.2 * (1 - ratio)) / 2, 0, 0.01).premultiply(_bar).scale(_scale.set(ratio, 1, 1));
        entityManager.batch(EnemyHealthSystem.fillGeo, EnemyHealthSystem.barFillMat, true).add(_fill, color);
    }

    takeDamage(amount) {
        this.lastDamageTime = performance.now() / 1000;

        // Shield Logic
        if (this.shieldHits > 0) {
            this.shieldHits--;
            if (this.shieldHits === 0) soundManager.play('shieldBreak', this.enemy.position); // Shield broken
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
