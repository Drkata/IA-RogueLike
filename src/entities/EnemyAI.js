import * as THREE from 'three';
import { Projectile } from './Projectile.js';
import { CONSTANTS } from '../core/Constants.js';
import { soundManager } from '../systems/SoundManager.js';

// Module-level scratch vectors (zero-allocation in update() hot path)
const _tempMoveDir = new THREE.Vector3();
const _tempSeparation = new THREE.Vector3();
const _tempPush = new THREE.Vector3();
const _tempNextPos = new THREE.Vector3();
const _tempShootDir = new THREE.Vector3();
const _tempSpawnPos = new THREE.Vector3();
// Shared return vector — caller copies immediately so no aliasing risk
const _returnPos = new THREE.Vector3();

const STOP_DISTANCE = 10; // Stop chasing and just shoot when closer than this
const CENTER_HEIGHT = 0.8; // Enemy position is its centre of mass, 0.8 above the feet
const MAX_DROP = CONSTANTS.WALL_HEIGHT * 2 + 0.1; // Enemies can fall up to 2 floors

export class EnemyAI {
    // Scaling of a regular enemy at a given level (also shown in the upgrade menu)
    static getCombatStats(level) {
        const D = CONSTANTS.DIFFICULTY;
        let damage = D.ENEMY_DAMAGE_BASE + level * D.ENEMY_DAMAGE_PER_LEVEL;
        if (level > 10) damage *= 1.0 + (level - 10) * D.ENEMY_DAMAGE_MULTIPLIER_POST_10;
        return {
            speed: Math.min(D.ENEMY_SPEED_CAP, D.ENEMY_SPEED_BASE + level * D.ENEMY_SPEED_PER_LEVEL),
            damage,
            projectileSpeed: 10.0 * (1 + level * 0.15),
            attackCooldown: Math.max(0.5, 4.0 - level * 0.10),
            attackRange: 12.5,
            stopDistance: STOP_DISTANCE
        };
    }

    constructor(enemy, levelManager, entityManager, level) {
        this.enemy = enemy;
        this.levelManager = levelManager;
        this.entityManager = entityManager;
        this.level = level;

        this.pathfinder = levelManager.pathfinder;
        this.path = [];
        this.lastPathTime = 0;

        Object.assign(this, EnemyAI.getCombatStats(level));
        this.lastAttackTime = 0;

        this.jumpState = null;
        this.jumpStunTimer = 0;
    }

    update(dt, player, position) {
        const dist = position.distanceTo(player.position);
        const now = performance.now() / 1000;

        if (this.jumpState) {
            this._updateJump(dt);
            this._tryAttack(now, dist, player, position);
            return _returnPos;
        }

        // Short recovery after landing: stand still but keep shooting
        if (this.jumpStunTimer > 0) {
            this.jumpStunTimer -= dt;
            this._tryAttack(now, dist, player, position);
            return _returnPos.copy(position);
        }

        let nextPosition = null;
        if (dist > STOP_DISTANCE) {
            nextPosition = this._chase(dt, now, player, position);
            if (this.jumpState) return this.update(dt, player, position); // Jump starts this frame
        }

        // "Run and Gun": attacks even while moving
        this._tryAttack(now, dist, player, position);
        return nextPosition;
    }

    _updateJump(dt) {
        const jump = this.jumpState;
        jump.elapsed += dt;
        const t = Math.min(1.0, jump.elapsed / jump.duration);

        const linearY = jump.startPos.y + (jump.endPos.y - jump.startPos.y) * t;
        const hOffset = Math.max(1.0, jump.peakHeight - linearY);
        _returnPos.lerpVectors(jump.startPos, jump.endPos, t);
        _returnPos.y = linearY + 4 * hOffset * t * (1 - t);

        // Stretch & squash of the visual mesh
        const mesh = this.enemy.mesh;
        if (t < 0.25) {
            const factor = t / 0.25; // Take off stretch
            mesh.scale.set(1.0 - factor * 0.2, 1.0 + factor * 0.3, 1.0 - factor * 0.2);
        } else if (t < 0.75) {
            mesh.scale.set(0.8, 1.3, 0.8); // Mid-air stretch
        } else {
            const factor = (1.0 - t) / 0.25; // Landing squash, 1 down to 0
            mesh.scale.set(1.2 - factor * 0.2, 0.8 + factor * 0.3, 1.2 - factor * 0.2);
        }

        if (t >= 1.0) {
            mesh.scale.set(1.0, 1.0, 1.0);
            this.jumpState = null;
            this.jumpStunTimer = 0.5;
            this.path = []; // Force path recalculation on landing
        }
    }

    // Follow the A* path towards the player. Returns the next position, or null to stay put.
    _chase(dt, now, player, position) {
        if (now - this.lastPathTime > 0.5) {
            this.lastPathTime = now;
            this.path = this.pathfinder.findPath(position, player.position);
        }
        if (!this.path || this.path.length <= 1) return null;

        const lm = this.levelManager;
        const nextWP = this.path[1];
        const hTo = this.pathfinder.getCellHeight(Math.floor(nextWP.x / CONSTANTS.CELL_SIZE), Math.floor(nextWP.z / CONSTANTS.CELL_SIZE));
        const currentFeetY = position.y - CENTER_HEIGHT;
        const currentFloorY = lm.getFloorHeight(position.x, position.z, currentFeetY);

        let isPreparingJump = false;
        if (Math.abs(hTo - currentFloorY) >= 2.0) {
            const hDist = Math.hypot(nextWP.x - position.x, nextWP.z - position.z);
            // Jump once close to the edge (max distance to a cell centre from a corner is ~2.4m)
            if (hDist < 2.5) {
                const endPos = new THREE.Vector3(nextWP.x, hTo + CENTER_HEIGHT, nextWP.z);
                this.jumpState = {
                    startPos: position.clone(),
                    endPos,
                    peakHeight: Math.max(position.y, endPos.y) + 1.2,
                    duration: 0.35, // Fast parkour hop
                    elapsed: 0
                };
                return null;
            }
            isPreparingJump = true; // Walk towards the edge normally
        }

        // Move towards next waypoint, pushed away from crowding neighbours
        _tempMoveDir.set(nextWP.x - position.x, 0, nextWP.z - position.z).normalize();
        this._applySeparation(position);

        _tempNextPos.copy(position).addScaledVector(_tempMoveDir, this.speed * dt);

        const checkY = lm.getCollisionCheckY(currentFloorY, currentFeetY);
        const climb = lm.getFloorHeight(_tempNextPos.x, _tempNextPos.z, currentFeetY) - currentFloorY;
        const isJumpingUp = climb > 0.5 && climb <= CONSTANTS.WALL_HEIGHT + 0.1;
        if (!isJumpingUp) lm.resolveCircleCollision(_tempNextPos, this.enemy.radius, checkY); // Don't push out of walls we climb onto

        this._pushOutOfEnemies(_tempNextPos, position.y);

        const finalTargetFloorY = lm.getFloorHeight(_tempNextPos.x, _tempNextPos.z, checkY);
        if (currentFloorY - finalTargetFloorY > MAX_DROP) return null; // Cliff too high
        // Wait at the edge until close enough to trigger the jump animation (no instant teleport down)
        if (isPreparingJump && Math.abs(currentFloorY - finalTargetFloorY) >= 2.0) return null;

        _tempNextPos.y = finalTargetFloorY + CENTER_HEIGHT;
        return _returnPos.copy(_tempNextPos);
    }

    // Flocking: steer _tempMoveDir away from enemies closer than 1.5m
    _applySeparation(position) {
        _tempSeparation.set(0, 0, 0);
        let count = 0;
        const entities = this.entityManager.entities;
        for (let i = 0; i < entities.length; i++) {
            const other = entities[i];
            if (other === this.enemy || other.entityType !== 'enemy' || other.isDead) continue;
            const distToOther = position.distanceTo(other.position);
            if (distToOther < 1.5 && distToOther > 0.01) {
                _tempPush.subVectors(position, other.position);
                _tempPush.y = 0;
                _tempSeparation.add(_tempPush.normalize().divideScalar(distToOther)); // Weight by distance
                count++;
            } else if (distToOther <= 0.01) {
                // Random nudge so perfectly overlapping enemies don't stay stuck
                _tempSeparation.add(_tempPush.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize());
                count++;
            }
        }

        if (count > 0) {
            _tempSeparation.divideScalar(count);
            if (_tempSeparation.lengthSq() > 0) _tempSeparation.normalize();
            _tempMoveDir.add(_tempSeparation.multiplyScalar(0.8));
            if (_tempMoveDir.lengthSq() > 0) _tempMoveDir.normalize();
        }
    }

    // Hard collision: push `nextPos` out of enemies standing on roughly the same floor
    _pushOutOfEnemies(nextPos, currentY) {
        const r = this.enemy.radius;
        const entities = this.entityManager.entities;
        for (let i = 0; i < entities.length; i++) {
            const other = entities[i];
            if (other === this.enemy || other.entityType !== 'enemy' || other.isDead) continue;
            if (Math.abs(other.position.y - currentY) >= 1.5) continue;
            const dx = nextPos.x - other.position.x;
            const dz = nextPos.z - other.position.z;
            const distSq = dx * dx + dz * dz;
            const minDist = r + other.radius;
            if (distSq < minDist * minDist && distSq > 0.0001) {
                const dist = Math.sqrt(distSq);
                const overlap = minDist - dist;
                nextPos.x += (dx / dist) * overlap;
                nextPos.z += (dz / dist) * overlap;
            }
        }
    }

    _tryAttack(now, dist, player, position) {
        if (dist >= this.attackRange || now - this.lastAttackTime <= this.attackCooldown) return;
        // Very close: always in sight; otherwise raycast along the centre line
        if (dist >= 5.0 && !this.pathfinder.hasLineOfSight(position, player.position, 0)) return;
        this.lastAttackTime = now;
        this.shoot(player, position);
    }

    // Knock the enemy back horizontally unless a wall or a drop of more than 2 floors is in the way
    knockback(dirX, dirZ, dist) {
        const len = Math.hypot(dirX, dirZ);
        if (len < 1e-6 || this.jumpState) return;
        const pos = this.enemy.position;
        const feetY = pos.y - CENTER_HEIGHT;
        const nx = pos.x + (dirX / len) * dist;
        const nz = pos.z + (dirZ / len) * dist;
        if (this.levelManager.isWall(nx, nz, feetY)) return;

        const targetFloorY = this.levelManager.getFloorHeight(nx, nz, feetY);
        if (this.levelManager.getFloorHeight(pos.x, pos.z, feetY) - targetFloorY > MAX_DROP) return;
        pos.set(nx, targetFloorY + CENTER_HEIGHT, nz);
    }

    shoot(player, position) {
        _tempShootDir.subVectors(player.position, position);
        if (_tempShootDir.lengthSq() > 0) _tempShootDir.normalize();
        else _tempShootDir.set(0, 0, -1);

        // Spawn slightly in front of the enemy to avoid clipping
        _tempSpawnPos.copy(position).addScaledVector(_tempShootDir, 0.5);

        soundManager.play('enemyShoot', _tempSpawnPos);
        this.entityManager.add(new Projectile(_tempSpawnPos, _tempShootDir, this.projectileSpeed, this.damage, this.levelManager, {
            sourceName: "Minion",
            sourceId: this.enemy.id,
            maxDistance: 100
        }));
    }
}
