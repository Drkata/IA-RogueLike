import * as THREE from 'three';
import { Projectile } from './Projectile.js';
import { Pathfinder } from '../systems/Pathfinder.js';
import { CONSTANTS } from '../core/Constants.js';

// Module-level scratch vectors (zero-allocation in update() hot path)
const _tempNextWaypoint = new THREE.Vector3();
const _tempMoveDir      = new THREE.Vector3();
const _tempSeparation   = new THREE.Vector3();
const _tempPush         = new THREE.Vector3();
const _tempNextPos      = new THREE.Vector3();
const _tempNextPosX     = new THREE.Vector3();
const _tempNextPosZ     = new THREE.Vector3();
const _tempShootDir     = new THREE.Vector3();
const _tempSpawnPos     = new THREE.Vector3();
// Shared return vector — caller copies immediately so no aliasing risk
const _returnPos        = new THREE.Vector3();

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
                _tempNextWaypoint.set(this.path[1].x, 0.8, this.path[1].z);
                _tempMoveDir.subVectors(_tempNextWaypoint, position);
                _tempMoveDir.y = 0;
                _tempMoveDir.normalize();

                // Separation Force (Avoid crowding)
                if (this.entityManager) {
                    _tempSeparation.set(0, 0, 0);
                    let count = 0;
                    const entities = this.entityManager.entities;

                    for (let i = 0; i < entities.length; i++) {
                        const other = entities[i];
                        if (other !== this.enemy && other.entityType === 'enemy' && !other.isDead) {
                            const distToOther = position.distanceTo(other.position);
                            if (distToOther < 1.5 && distToOther > 0.01) { // Check neighbors within 1.5m
                                _tempPush.subVectors(position, other.position);
                                _tempPush.y = 0;
                                _tempPush.normalize().divideScalar(distToOther); // Weight by distance
                                _tempSeparation.add(_tempPush);
                                count++;
                            } else if (distToOther <= 0.01) {
                                // Add random small separation force to avoid overlapping stuck enemies
                                _tempPush.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                                _tempSeparation.add(_tempPush);
                                count++;
                            }
                        }
                    }

                    if (count > 0) {
                        _tempSeparation.divideScalar(count);
                        if (_tempSeparation.lengthSq() > 0) {
                            _tempSeparation.normalize();
                        }
                        _tempMoveDir.add(_tempSeparation.multiplyScalar(0.8));
                        if (_tempMoveDir.lengthSq() > 0) {
                            _tempMoveDir.normalize();
                        }
                    }
                }

                // Calculate next position
                const moveDist = this.speed * dt;
                _tempPush.copy(_tempMoveDir).multiplyScalar(moveDist);
                _tempNextPos.copy(position).add(_tempPush);
                _tempNextPos.y = 0.8;

                // Try to move directly — reuse _returnPos to avoid new Vector3 on each move
                if (this.canMoveTo(_tempNextPos)) {
                    nextPosition = _returnPos.copy(_tempNextPos);
                } else {
                    // Wall Sliding: Try X only
                    _tempNextPosX.copy(position);
                    _tempNextPosX.x += _tempMoveDir.x * moveDist;
                    if (this.canMoveTo(_tempNextPosX)) {
                        nextPosition = _returnPos.copy(_tempNextPosX);
                    } else {
                        // Wall Sliding: Try Z only
                        _tempNextPosZ.copy(position);
                        _tempNextPosZ.z += _tempMoveDir.z * moveDist;
                        if (this.canMoveTo(_tempNextPosZ)) {
                            nextPosition = _returnPos.copy(_tempNextPosZ);
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

        _tempShootDir.subVectors(player.position, position);
        if (_tempShootDir.lengthSq() > 0) {
            _tempShootDir.normalize();
        } else {
            _tempShootDir.set(0, 0, -1);
        }

        // Spawn projectile slightly in front of enemy to avoid clipping
        _tempPush.copy(_tempShootDir).multiplyScalar(0.5);
        _tempSpawnPos.copy(position).add(_tempPush);

        const projectile = new Projectile(
            _tempSpawnPos,
            _tempShootDir,
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
