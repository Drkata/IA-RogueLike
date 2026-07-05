import * as THREE from 'three';
import { Projectile } from './Projectile.js';
import { Pathfinder } from '../systems/Pathfinder.js';
import { CONSTANTS } from '../core/Constants.js';
import { soundManager } from '../systems/SoundManager.js';
import { FloatingText } from './FloatingText.js';
import { Pickup } from './Pickup.js';

export class MagicalSentinel {
    static idCounter = 0;

    constructor(gridX, gridZ, levelManager, entityManager, level = 1) {
        this.id = 'sentinel_' + MagicalSentinel.idCounter++;
        this.entityType = 'enemy'; // So EntityManager processes it as targetable
        this.levelManager = levelManager;
        this.entityManager = entityManager;
        this.level = level;
        this.cellSize = CONSTANTS.CELL_SIZE;
        this.isDead = false;

        this.position = new THREE.Vector3(
            gridX * this.cellSize + this.cellSize / 2,
            0.8, // Center of mass
            gridZ * this.cellSize + this.cellSize / 2
        );

        this.health = 25 + (level * 5);
        this.radius = 0.8; // Hitbox radius

        // Attack config
        this.projectileSpeed = 12.0;
        this.damage = 10 + (level * 2);
        this.attackCooldown = Math.max(1.0, 3.5 - (level * 0.15));
        this.lastAttackTime = Math.random() * 1.5; // Stagger attack starts
        this.attackRange = 15.0;

        this.pathfinder = new Pathfinder(this.levelManager);

        // Visuals
        this.mesh = new THREE.Group();
        this.mesh.position.x = this.position.x;
        this.mesh.position.z = this.position.z;
        this.mesh.position.y = 0; // Base on floor
        this.mesh.userData.entity = this;

        // 1. Stone Pedestal
        const pedestalGeo = new THREE.CylinderGeometry(0.2, 0.25, 1.4, 8);
        const pedestalMat = new THREE.MeshStandardMaterial({
            color: 0x4a4a4a,
            roughness: 0.8,
            metalness: 0.2
        });
        const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
        pedestal.position.y = 0.7; // Pivot in middle
        pedestal.castShadow = true;
        pedestal.receiveShadow = true;
        this.mesh.add(pedestal);

        // 2. Torus Head (holds the eye/orb)
        const headGeo = new THREE.TorusGeometry(0.2, 0.05, 8, 16);
        const headMat = new THREE.MeshStandardMaterial({
            color: 0x7a6a5a,
            roughness: 0.5,
            metalness: 0.4
        });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.4;
        head.rotation.x = Math.PI / 2; // Lie flat
        this.mesh.add(head);

        // 3. Glowing Eye Orb
        const eyeGeo = new THREE.IcosahedronGeometry(0.12, 1);
        const eyeMat = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.8,
            roughness: 0.1,
            metalness: 0.9
        });
        this.eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
        this.eyeMesh.position.y = 1.4;
        this.mesh.add(this.eyeMesh);

        // 4. Point Light (Red glow)
        this.light = new THREE.PointLight(0xff0000, 1.0, 4);
        this.light.position.y = 1.4;
        this.mesh.add(this.light);
    }

    takeDamage(amount, isCritical = false) {
        if (this.isDead) return false;

        this.health -= amount;

        // Floating Text
        if (this.entityManager) {
            const color = isCritical ? '#ff00ff' : '#ff4444'; // Reddish for mechanical/constructs
            const size = isCritical ? 2.5 : 1.8;
            const text = amount.toFixed(1) + (isCritical ? '!' : '');

            const pos = this.position.clone();
            pos.y += 1.0;

            const floatingText = new FloatingText(pos, text, color, size);
            this.entityManager.add(floatingText);
        }

        soundManager.playHit(); // Play hit sound

        if (this.health <= 0) {
            this.die();
            return true; // Died
        }
        return false;
    }

    die() {
        this.isDead = true;
        this.mesh.visible = false;

        // Spawn hit effect explosion
        if (this.entityManager) {
            this.entityManager.createExplosion(this.position, this.damage * 0.5);
            soundManager.playExplosion();

            // Chance to drop pickup
            if (Math.random() < 0.4) {
                const type = Math.random() < 0.5 ? 'health' : 'ammo';
                const value = type === 'health' ? 15 : 25;
                const pickup = new Pickup(this.position, type, value);
                this.entityManager.add(pickup);
            }

            // Gold Drop (80% chance)
            if (Math.random() < 0.8) {
                const goldVal = 8 + Math.floor(Math.random() * 8) + Math.floor(this.level * 0.6);
                const goldPickup = new Pickup(this.position, 'gold', goldVal);
                this.entityManager.add(goldPickup);
            }
        }
    }

    update(dt, player) {
        if (this.isDead) return;

        // Orb floating bobbing animation
        const time = performance.now() / 1000;
        this.eyeMesh.position.y = 1.4 + Math.sin(time * 4) * 0.05;

        // Look at player (only rotate yaw/Y so pedestal stays upright)
        // Pedestal is static but we can rotate the head or just look at player
        const dx = player.position.x - this.position.x;
        const dz = player.position.z - this.position.z;
        const angle = Math.atan2(dx, dz);
        this.mesh.rotation.y = angle;

        // Attack Logic
        const dist = this.position.distanceTo(player.position);
        if (dist < this.attackRange) {
            // Line of Sight Check (Sentinel is tall, check from height 1.4)
            const sentinelHeightEye = this.position.clone();
            sentinelHeightEye.y = 1.4;

            const hasLOS = dist < 4.0 || this.pathfinder.hasLineOfSight(sentinelHeightEye, player.position, 0);

            if (hasLOS) {
                this.lastAttackTime += dt;
                if (this.lastAttackTime >= this.attackCooldown) {
                    this.lastAttackTime = 0;
                    this.shoot(player);
                }
            }
        }
    }

    shoot(player) {
        if (!this.entityManager) return;

        // Target player's center of mass
        const targetPos = player.position.clone();
        const startPos = this.position.clone();
        startPos.y = 1.4; // Shoot from head level

        const dir = new THREE.Vector3().subVectors(targetPos, startPos).normalize();
        const spawnPos = startPos.clone().add(dir.clone().multiplyScalar(0.4));

        // Create slow magic orb
        const projectile = new Projectile(
            spawnPos,
            dir,
            this.projectileSpeed,
            this.damage,
            this.levelManager,
            0, false, 0, 0, 0, 0.8,
            "Sentinel", this.id,
            80 // Range
        );
        this.entityManager.add(projectile);
        soundManager.playShoot();
    }
}
