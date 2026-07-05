import * as THREE from 'three';
import { Projectile } from './Projectile.js';
import { Pathfinder } from '../systems/Pathfinder.js';
import { CONSTANTS } from '../core/Constants.js';

export class EnemyAI {
    constructor(enemy, levelManager, entityManager, level) {
        this.enemy = enemy;
        this.levelManager = levelManager;
        this.entityManager = entityManager;
        this.level = level;

        this.pathfinder = new Pathfinder(levelManager);
        this.path = [];
        this.lastPathTime = 0;

        // Speed Scaling
        let speed = CONSTANTS.DIFFICULTY.ENEMY_SPEED_BASE + (level * CONSTANTS.DIFFICULTY.ENEMY_SPEED_PER_LEVEL);
        this.speed = Math.min(CONSTANTS.DIFFICULTY.ENEMY_SPEED_CAP, speed);

        // Damage Scaling
        let damage = CONSTANTS.DIFFICULTY.ENEMY_DAMAGE_BASE + (level * CONSTANTS.DIFFICULTY.ENEMY_DAMAGE_PER_LEVEL);
        if (level > 10) {
            const extraLevels = level - 10;
            const multiplier = 1.0 + (extraLevels * CONSTANTS.DIFFICULTY.ENEMY_DAMAGE_MULTIPLIER_POST_10);
            damage *= multiplier;
        }
        this.damage = damage;

        // High projectile speed for better accuracy
        this.projectileSpeed = 10.0 * (1 + level * 0.15);
        this.attackCooldown = Math.max(0.5, 4.0 - (level * 0.10)); // Lower floor to 0.5
        this.attackRange = 12.5;
        this.lastAttackTime = 0;

        this.radius = 0.3;
    }

    update(dt, player, position) {
        const dist = position.distanceTo(player.position);
        let nextPosition = null;
        const now = performance.now() / 1000;

        // Movement Logic
        // Simple Chase Behavior:
        // - If far (> 10m): Move towards player
        // - If close (<= 10m): Stop and shoot
        const stopDistance = 10;

        if (dist > stopDistance) {
            // Recalculate path periodically
            if (now - this.lastPathTime > 0.5) {
                this.lastPathTime = now;
                this.path = this.pathfinder.findPath(position, player.position);
            }

            if (this.path && this.path.length > 1) {
                // Move towards next waypoint
                const nextWaypoint = new THREE.Vector3(this.path[1].x, 0.8, this.path[1].z);
                const moveDir = new THREE.Vector3().subVectors(nextWaypoint, position);
                moveDir.y = 0;
                moveDir.normalize();

                // Separation Force (Avoid crowding)
                if (this.entityManager) {
                    const separation = new THREE.Vector3();
                    let count = 0;
                    const entities = this.entityManager.entities;

                    for (const other of entities) {
                        if (other !== this.enemy && other.entityType === 'enemy' && !other.isDead) {
                            const dist = position.distanceTo(other.position);
                            if (dist < 1.5 && dist > 0.01) { // Check neighbors within 1.5m
                                const push = new THREE.Vector3().subVectors(position, other.position);
                                push.y = 0;
                                push.normalize().divideScalar(dist); // Weight by distance
                                separation.add(push);
                                count++;
                            } else if (dist <= 0.01) {
                                // Add random small separation force to avoid overlapping stuck enemies
                                const push = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                                separation.add(push);
                                count++;
                            }
                        }
                    }

                    if (count > 0) {
                        separation.divideScalar(count);
                        if (separation.lengthSq() > 0) {
                            separation.normalize();
                        }
                        const finalDir = moveDir.clone().add(separation.multiplyScalar(0.8));
                        if (finalDir.lengthSq() > 0) {
                            moveDir.copy(finalDir).normalize();
                        }
                    }
                }

                // Calculate next position
                const moveDist = this.speed * dt;
                const nextPos = position.clone().add(moveDir.clone().multiplyScalar(moveDist));
                nextPos.y = 0.8;

                // Try to move directly
                if (this.canMoveTo(nextPos)) {
                    nextPosition = nextPos;
                } else {
                    // Wall Sliding: Try X only
                    const nextPosX = position.clone();
                    nextPosX.x += moveDir.x * moveDist;
                    if (this.canMoveTo(nextPosX)) {
                        nextPosition = nextPosX;
                    } else {
                        // Wall Sliding: Try Z only
                        const nextPosZ = position.clone();
                        nextPosZ.z += moveDir.z * moveDist;
                        if (this.canMoveTo(nextPosZ)) {
                            nextPosition = nextPosZ;
                        }
                    }
                }
            }
        }

        // Attack Logic
        // Runs even if moving, allowing "Run and Gun" behavior
        if (dist < this.attackRange) {
            // Force LOS if very close (< 5 units) or check raycast with 0 radius (center-line)
            const hasLOS = dist < 5.0 || this.pathfinder.hasLineOfSight(position, player.position, 0);

            if (hasLOS) {
                // Constant cooldown, no distance scaling for consistent threat
                if (now - this.lastAttackTime > this.attackCooldown) {
                    this.lastAttackTime = now;
                    this.shoot(player, position);
                }
            }
        }

        return nextPosition;
    }

    shoot(player, position) {
        if (!this.entityManager) return;

        const dir = new THREE.Vector3().subVectors(player.position, position);
        if (dir.lengthSq() > 0) {
            dir.normalize();
        } else {
            dir.set(0, 0, -1);
        }

        // Spawn projectile slightly in front of enemy to avoid clipping
        const spawnPos = position.clone().add(dir.clone().multiplyScalar(0.5));

        const projectile = new Projectile(
            spawnPos,
            dir,
            this.projectileSpeed,
            this.damage,
            this.levelManager,
            0, false, 0, 0, 0, 1.0,
            "Minion", this.enemy.id,
            100 // Default Range
        );
        this.entityManager.add(projectile);
    }

    canMoveTo(pos) {
        // Wall Collision
        const checkRadius = 0.6;
        const checks = [
            { x: pos.x + checkRadius, z: pos.z },
            { x: pos.x - checkRadius, z: pos.z },
            { x: pos.x, z: pos.z + checkRadius },
            { x: pos.x, z: pos.z - checkRadius }
        ];

        for (const p of checks) {
            if (this.levelManager.isWall(p.x, p.z)) return false;
        }

        if (this.levelManager.isDecoration(pos.x, pos.z)) return false;

        // Entity Collision
        if (this.entityManager) {
            const entities = this.entityManager.entities;
            for (const other of entities) {
                if (other !== this.enemy && other.entityType === 'enemy' && !other.isDead) {
                    const distToOther = pos.distanceTo(other.position);
                    if (distToOther < this.radius + other.radius) {
                        return false;
                    }
                }
            }
        }

        return true;
    }
}
