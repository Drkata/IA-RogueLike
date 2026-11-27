import * as THREE from 'three';
import { POTION_DROP_SHARE, Pickup } from './Pickup.js';
import { EnemyMeshBuilder } from './EnemyMesh.js';
import { EnemyHealthSystem } from './EnemyHealth.js';
import { EnemyAI } from './EnemyAI.js';
import { FloatingText } from './FloatingText.js';
import { soundManager } from '../systems/SoundManager.js';

const STRIDE = 3.6; // rad of the walk cycle per metre walked: the feet keep pace with the ground
const WALK_SPEED = 3; // m/s at which the walk is full
const DEATH_TIME = 0.6; // s for a body to fall and sink
const _matrix = new THREE.Matrix4();
const _fall = new THREE.Matrix4();
const _tip = new THREE.Matrix4();
const _size = new THREE.Vector3();
const { damp } = THREE.MathUtils;

// The model's matrix: the body's (place, facing, jump squash) at the enemy's own size
const modelMatrix = (body, look) => _matrix.copy(body).scale(_size.setScalar(look.scale));

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

        // The body's place and facing; its model is drawn in a batch with every enemy of the same look (draw)
        this.look = EnemyMeshBuilder.pick(level);
        this.anim = new THREE.Vector4(Math.random() * Math.PI * 2, 0, 0, 0); // Walk phase, walk amount, cast, hurt
        this.mesh = new THREE.Object3D();
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
        soundManager.play('enemyDeath', this.position);
        this.mesh.updateMatrix();
        this.entityManager.add(new EnemyCorpse(this));

        if (Math.random() < 0.5) {
            if (Math.random() < 0.01) {
                // 1% rare upgrade drop
                this.entityManager.add(new Pickup(this.position, 'upgrade', 1, this.levelManager));
            } else {
                const type = Math.random() < 0.5 ? 'health' : 'ammo';
                if (type === 'ammo' || Math.random() < POTION_DROP_SHARE) this.entityManager.add(new Pickup(this.position, type, type === 'health' ? 20 : 30, this.levelManager));
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

        const { x, z } = this.position;
        const newPosition = this.ai.update(dt, player, this.position);
        if (newPosition) this.position.copy(newPosition);

        this.mesh.position.set(this.position.x, this.position.y - 0.8, this.position.z);
        this.animate(dt, Math.hypot(this.position.x - x, this.position.z - z));

        this.healthSystem.update(dt);
    }

    // `moved`: metres walked this frame. Standing still the phase runs slowly: the breath.
    animate(dt, moved) {
        const a = this.anim;
        if (dt > 0) a.y = damp(a.y, Math.min(1, moved / dt / WALK_SPEED), 8, dt);
        a.x = (a.x + moved * STRIDE + dt * 1.3 * (1 - a.y)) % (Math.PI * 4);
        // The casting arm: up at each shot (EnemyAI.shoot), half up while it holds the player in its sights
        a.z = Math.max(this.ai.isHolding && this.ai.inSight ? 0.6 : 0, a.z - dt * 2.5);
        a.w = Math.max(0, a.w - dt * 5); // Hurt: set to 1 by EnemyHealthSystem.takeDamage
    }

    // Batched: the model, then shield and health bar in the body's frame
    draw(entityManager, camera) {
        this.mesh.updateMatrix(); // The body is a direct child of the scene: this is its world matrix
        const { geometry, material } = EnemyMeshBuilder.model(this.look);
        entityManager.batch(geometry, material, true, true).add(modelMatrix(this.mesh.matrix, this.look), this.look.tint, this.anim);
        this.healthSystem.draw(entityManager, camera);
    }
}

// A slain enemy: its body tips over backwards and sinks into the ground, then is gone
class EnemyCorpse {
    constructor(enemy) {
        this.entityType = 'corpse';
        this.isDead = false;
        this.look = enemy.look;
        this.body = enemy.mesh.matrix.clone();
        this.anim = enemy.anim.clone().setW(1);
        this.anim.y = 0;
        this.anim.z = 0;
        this.time = 0;
    }

    update(dt) {
        this.time += dt;
        this.anim.w = Math.max(0, 1 - this.time / DEATH_TIME);
        if (this.time >= DEATH_TIME) this.isDead = true;
    }

    draw(entityManager) {
        const k = Math.min(1, this.time / DEATH_TIME);
        const fall = _fall.makeTranslation(0, -0.7 * k * k * k, 0).multiply(_tip.makeRotationX(-1.35 * Math.min(1, k * 1.6) ** 2));
        const { geometry, material } = EnemyMeshBuilder.model(this.look);
        entityManager.batch(geometry, material, true, true).add(modelMatrix(this.body, this.look).multiply(fall), this.look.tint, this.anim);
    }
}
