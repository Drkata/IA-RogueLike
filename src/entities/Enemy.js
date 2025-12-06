import * as THREE from 'three';
import { Pickup } from './Pickup.js';
import { EnemyMeshBuilder } from './EnemyMesh.js';
import { EnemyHealthSystem } from './EnemyHealth.js';
import { EnemyAI } from './EnemyAI.js';
import { FloatingText } from './FloatingText.js';

export class Enemy {
    static idCounter = 0;

    constructor(position, levelManager, entityManager, level = 1) {
        this.id = Enemy.idCounter++;
        this.position = position.clone();
        this.position.y = 0.8; // Center of mass
        this.level = level;
        this.isDead = false;
        this.entityType = 'enemy'; // Fix for minified builds

        // Build mesh
        this.mesh = EnemyMeshBuilder.build(level);
        this.mesh.position.x = this.position.x;
        this.mesh.position.z = this.position.z;
        this.mesh.position.y = this.position.y - 0.8; // Feet on ground
        this.mesh.userData.entity = this;
        EnemyMeshBuilder.storeOriginalColors(this.mesh);

        // Initialize systems
        this.healthSystem = new EnemyHealthSystem(this, this.mesh, level);
        this.ai = new EnemyAI(this, levelManager, entityManager, level);

        this.radius = 0.8; // Increased hitbox (was 0.3)
    }

    get health() {
        return this.healthSystem.health;
    }

    takeDamage(amount, isCritical = false) {
        const died = this.healthSystem.takeDamage(amount);

        // Floating Text
        if (this.ai.entityManager) {
            const color = isCritical ? '#ff00ff' : '#ffffff';
            const size = isCritical ? 3.0 : 2.0;
            const text = amount.toFixed(1) + (isCritical ? '!' : '');

            // Spawn slightly above enemy
            const pos = this.position.clone();
            pos.y += 1.5;

            const floatingText = new FloatingText(pos, text, color, size);
            this.ai.entityManager.add(floatingText);
        }

        if (died) {
            this.die();
        }
        return died;
    }

    die() {
        this.isDead = true;
        this.mesh.visible = false;

        if (Math.random() < 0.5 && this.ai.entityManager) {
            // 1% Chance for Rare Upgrade Drop
            if (Math.random() < 0.01) {
                const pickup = new Pickup(this.position, 'upgrade', 1);
                this.ai.entityManager.add(pickup);
            } else {
                // Normal Drop
                const type = Math.random() < 0.5 ? 'health' : 'ammo';
                const value = type === 'health' ? 20 : 30;
                const pickup = new Pickup(this.position, type, value);
                this.ai.entityManager.add(pickup);
            }
        }
    }

    update(dt, player) {
        if (this.isDead) return;

        // Look at player
        this.mesh.lookAt(player.position.x, this.position.y, player.position.z);

        // Update AI (returns new position if moved)
        const newPosition = this.ai.update(dt, player, this.position);
        if (newPosition) {
            this.position.copy(newPosition);
        }

        // Always sync mesh position
        this.mesh.position.x = this.position.x;
        this.mesh.position.z = this.position.z;
        this.mesh.position.y = this.position.y - 0.8;

        // Update health bar and mechanics (regen)
        this.healthSystem.update(dt);
        this.healthSystem.updateHealthBar(player.camera || player);
    }
}
