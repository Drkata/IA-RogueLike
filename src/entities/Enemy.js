import { Pickup } from './Pickup.js';
import { EnemyMeshBuilder } from './EnemyMesh.js';
import { EnemyHealthSystem } from './EnemyHealth.js';
import { EnemyAI } from './EnemyAI.js';
import { FloatingText } from './FloatingText.js';
import { soundManager } from '../systems/SoundManager.js';

export class Enemy {
    static idCounter = 0;

    constructor(position, levelManager, entityManager, level = 1) {
        this.id = Enemy.idCounter++;
        this.level = level;
        this.isDead = false;
        this.entityType = 'enemy'; // Fix for minified builds
        this.radius = 0.8;
        this.entityManager = entityManager;
        this.levelManager = levelManager;

        const spawnFloorY = levelManager.getFloorHeight(position.x, position.z, position.y);
        this.position = position.clone();
        this.position.y = spawnFloorY + 0.8; // Center of mass

        this.mesh = EnemyMeshBuilder.build(level);
        this.mesh.position.set(this.position.x, spawnFloorY, this.position.z); // Feet on ground
        this.mesh.userData.entity = this;

        this.healthSystem = new EnemyHealthSystem(this, this.mesh, level);
        this.ai = new EnemyAI(this, levelManager, entityManager, level);
    }

    get health() {
        return this.healthSystem.health;
    }

    takeDamage(amount, isCritical = false) {
        const died = this.healthSystem.takeDamage(amount);
        FloatingText.spawnDamage(this.entityManager, this.position, 1.5, amount, isCritical, isCritical ? 3.0 : 2.0);
        if (died) this.die();
        return died;
    }

    die() {
        this.isDead = true;
        this.mesh.visible = false;
        soundManager.play('enemyDeath', this.position);

        if (Math.random() < 0.5) {
            if (Math.random() < 0.01) {
                // 1% rare upgrade drop
                this.entityManager.add(new Pickup(this.position, 'upgrade', 1, this.levelManager));
            } else {
                const type = Math.random() < 0.5 ? 'health' : 'ammo';
                this.entityManager.add(new Pickup(this.position, type, type === 'health' ? 20 : 30, this.levelManager));
            }
        }

        // Gold Drop (70% chance)
        if (Math.random() < 0.7) {
            const goldVal = 5 + Math.floor(Math.random() * 6) + Math.floor(this.level * 0.5);
            this.entityManager.add(new Pickup(this.position, 'gold', goldVal, this.levelManager));
        }
    }

    update(dt, player) {
        if (this.isDead) return;

        this.mesh.lookAt(player.position.x, this.position.y, player.position.z);

        const newPosition = this.ai.update(dt, player, this.position);
        if (newPosition) this.position.copy(newPosition);

        this.mesh.position.set(this.position.x, this.position.y - 0.8, this.position.z);

        this.healthSystem.update(dt);
    }

    // Batched parts, in the body's frame: eyes, then shield and health bar
    draw(entityManager, camera) {
        this.mesh.updateMatrix(); // The body is a direct child of the scene: this is its world matrix
        entityManager.batch(EnemyMeshBuilder.eyeGeometry, EnemyMeshBuilder.eyeMaterial(this.level)).add(this.mesh.matrix);
        this.healthSystem.draw(entityManager, camera);
    }
}
