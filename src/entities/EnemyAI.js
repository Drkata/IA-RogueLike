import * as THREE from 'three';
import { Projectile } from './Projectile.js';
import { CONSTANTS } from '../core/Constants.js';
import { soundManager } from '../systems/SoundManager.js';
import { STEP_HEIGHT, MAX_DROP } from '../systems/Pathfinder.js';

/*
 * Enemy behaviour: come within shooting distance of the player and shoot.
 *   - The way comes from Pathfinder.findPath: walk legs pulled tight, joined by jumps. The enemy
 *     follows it waypoint by waypoint and plans again every ~0.8 s, sooner when the player moves.
 *   - It stops only when it sees the player, at its own distance (7 to 11 m) so a group spreads
 *     into an arc instead of queueing. If it stands in the way of others (on a ramp, a ledge, in
 *     a corridor), it steps closer to make room.
 *   - Around other enemies it steers sideways and never brakes, so the ones behind flow past.
 *   - Walls always win over crowding, and it never steps off a ledge by accident: drops are jumps.
 *   - If it hasn't moved for a second while chasing, it skips a waypoint taken by another enemy,
 *     or plans again around the crowd.
 */

const C = CONSTANTS.CELL_SIZE;
const CENTER_HEIGHT = 0.8; // Enemy position is its centre of mass, 0.8 above the feet
const REPLAN_INTERVAL = 0.8; // s, ±25% so enemies don't all plan on the same frame
const REPLAN_PLAYER_MOVED = 4; // m: the player went this far from the planned target → plan now
const WAYPOINT_REACHED = 0.4; // m
const JUMP_TRIGGER = 2.3; // m from the landing cell's centre (2 m from the neighbour cell's centre)
const LANDING_STUN = 0.3; // s standing still after a jump (still shooting)
const SIGHT_CHECK = 0.2; // s between line-of-sight tests
const STUCK_CHECK = 1.0; // s
const STUCK_MOVE = 0.3; // m: less than this in STUCK_CHECK while chasing = stuck
const CROWD_RADIUS = 1.6; // m: neighbours closer than this are steered around
const MIN_STOP_DISTANCE = 3.5; // m: closest a standing enemy comes when making room
const PERSONAL_SPACE = 2.2; // m: never closer to the player than this, seen or not
const MAKE_ROOM_SPEED = 2; // m of stop distance given up per second while others queue behind

// Module-level scratch vectors (no allocation in the update hot path)
const _dir = new THREE.Vector3();
const _sep = new THREE.Vector3();
const _push = new THREE.Vector3();
const _next = new THREE.Vector3();
const _shootDir = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
// Shared return vector: the caller copies it immediately
const _returnPos = new THREE.Vector3();

export class EnemyAI {
    // Scaling of a regular enemy at a given level (also shown in the level threat panel)
    static getCombatStats(level) {
        const D = CONSTANTS.DIFFICULTY;
        let damage = D.ENEMY_DAMAGE_BASE + level * D.ENEMY_DAMAGE_PER_LEVEL;
        if (level > 10) damage *= 1.0 + (level - 10) * D.ENEMY_DAMAGE_MULTIPLIER_POST_10;
        return {
            speed: Math.min(D.ENEMY_SPEED_CAP, D.ENEMY_SPEED_BASE + level * D.ENEMY_SPEED_PER_LEVEL),
            damage,
            projectileSpeed: 10.0 * (1 + level * 0.15),
            attackCooldown: Math.max(0.5, 4.0 - level * 0.10),
            attackRange: 12.5
        };
    }

    constructor(enemy, levelManager, entityManager, level) {
        this.enemy = enemy;
        this.levelManager = levelManager;
        this.entityManager = entityManager;
        this.level = level;
        this.pathfinder = levelManager.pathfinder;

        Object.assign(this, EnemyAI.getCombatStats(level));
        this.stopDistance = 7 + Math.random() * 4; // Own distance: a group spreads instead of queueing
        this.side = Math.random() < 0.5 ? -1 : 1; // Side taken to pass a neighbour dead ahead
        this.lastAttackTime = 0;

        this.path = null; // Waypoints { x, z, jump }
        this.pathIndex = 1; // Next waypoint
        this.planTimer = Math.random() * REPLAN_INTERVAL;
        this.planTarget = new THREE.Vector3();
        this.sightTimer = Math.random() * SIGHT_CHECK;
        this.inSight = false;
        this.isHolding = false; // Standing still to shoot
        this.stuckTimer = 0;
        this.stuckFrom = new THREE.Vector3();
        this.stuckCount = 0;

        this.jumpState = null;
        this.jumpStunTimer = 0;
    }

    // Returns the enemy's next position, or null to stay put
    update(dt, player, position) {
        const dist = position.distanceTo(player.position);
        const now = performance.now() / 1000;

        if (this.jumpState) {
            this._updateJump(dt);
            this._tryAttack(now, dist, player, position);
            return _returnPos;
        }
        if (this.jumpStunTimer > 0) {
            this.jumpStunTimer -= dt;
            this._tryAttack(now, dist, player, position);
            return null;
        }

        this.sightTimer -= dt;
        if (this.sightTimer <= 0) {
            this.sightTimer = SIGHT_CHECK;
            this.inSight = dist < this.attackRange && this.pathfinder.hasLineOfSight(position, player.position, 0);
        }

        // Stand and shoot once close enough and in sight; otherwise keep coming ("run and gun").
        // Others queueing behind: step closer to let them through.
        this.isHolding = (this.inSight && dist <= this.stopDistance) || dist < PERSONAL_SPACE;
        if (this.isHolding && this.stopDistance > MIN_STOP_DISTANCE && this._blockingOthers(position, dist, player)) {
            this.stopDistance = Math.max(MIN_STOP_DISTANCE, this.stopDistance - MAKE_ROOM_SPEED * dt);
            this.isHolding = dist <= this.stopDistance || dist < PERSONAL_SPACE;
        }
        const next = this.isHolding ? null : this._chase(dt, player, position);
        this._tryAttack(now, dist, player, position);
        return next;
    }

    // ─── Moving ──────────────────────────────────────────────────────────────

    _plan(player, position) {
        this.planTimer = REPLAN_INTERVAL * (0.75 + Math.random() * 0.5);
        this.planTarget.copy(player.position);
        this.path = this.pathfinder.findPath(position, player.position, this.stuckCount > 0 ? this._crowdCells() : null);
        this.pathIndex = 1;
        if (!this.path) this.planTimer = 0.1 + Math.random() * 0.1; // No way for now (often a crowd): try again soon, not every frame
    }

    // Cells held by the other enemies: costlier to cross, so a stuck enemy looks for another way
    _crowdCells() {
        const cells = new Set();
        const w = this.levelManager.width;
        for (const other of this.entityManager.entities) {
            if (other === this.enemy || other.entityType !== 'enemy' || other.isDead || !other.ai) continue;
            cells.add(Math.floor(other.position.z / C) * w + Math.floor(other.position.x / C));
        }
        return cells;
    }

    _chase(dt, player, position) {
        // Without a path (the first one, or none found) the staggered timer still applies: otherwise every
        // enemy searched on a level's first frame, and one that can't reach the player searched every frame
        this.planTimer -= dt;
        if (this.planTimer <= 0 || (this.path && this.planTarget.distanceToSquared(player.position) > REPLAN_PLAYER_MOVED ** 2)) {
            this._plan(player, position);
        }
        if (!this.path) return null;

        const lm = this.levelManager;
        const feetY = position.y - CENTER_HEIGHT;
        const floorY = lm.getFloorHeight(position.x, position.z, feetY);

        // Next waypoint: skip the ones walked past, and jumps that are no longer needed
        let wp = this.path[this.pathIndex];
        while (wp) {
            const d = Math.hypot(wp.x - position.x, wp.z - position.z);
            if (wp.jump) {
                const landing = this.pathfinder.getCellHeight(Math.floor(wp.x / C), Math.floor(wp.z / C));
                if (Math.abs(landing - floorY) >= STEP_HEIGHT) {
                    if (d >= JUMP_TRIGGER) break;
                    this._startJump(position, wp, landing);
                    this.pathIndex++;
                    return null;
                }
            }
            if (d >= WAYPOINT_REACHED) break;
            wp = this.path[++this.pathIndex];
        }
        if (!wp) return null; // At the player's spot

        _dir.set(wp.x - position.x, 0, wp.z - position.z).normalize();
        this._steerAroundCrowd(position);

        const r = this.enemy.radius;
        const checkY = lm.getCollisionCheckY(floorY, feetY);
        _next.copy(position).addScaledVector(_dir, this.speed * dt);
        lm.resolveCircleCollision(_next, r, checkY);
        this._pushOutOfEnemies(_next, position.y);
        lm.resolveCircleCollision(_next, r, checkY); // Walls win over crowding

        // Never walk off a ledge or up a sheer side: those are jumps. Slide along the edge instead.
        const blocked = (x, z) => Math.abs(lm.getFloorHeight(x, z, checkY) - floorY) >= STEP_HEIGHT;
        if (blocked(_next.x, _next.z)) {
            if (!blocked(_next.x, position.z)) _next.z = position.z;
            else if (!blocked(position.x, _next.z)) _next.x = position.x;
            else return this._watchProgress(dt, position, null);
        }

        _next.y = lm.getFloorHeight(_next.x, _next.z, checkY) + CENTER_HEIGHT;
        return this._watchProgress(dt, position, _returnPos.copy(_next));
    }

    // Steer _dir around the enemies close by: sideways only, so the ones behind flow past instead of braking
    _steerAroundCrowd(position) {
        _sep.set(0, 0, 0);
        let near = false;
        for (const other of this.entityManager.entities) {
            if (other === this.enemy || other.entityType !== 'enemy' || other.isDead) continue;
            const op = other.position;
            if (Math.abs(op.y - position.y) >= 1.5) continue;
            const dx = position.x - op.x;
            const dz = position.z - op.z;
            const d2 = dx * dx + dz * dz;
            if (d2 >= CROWD_RADIUS * CROWD_RADIUS) continue;
            near = true;
            if (d2 > 1e-4) {
                _sep.x += dx / d2; // Closer pushes harder
                _sep.z += dz / d2;
            }
        }
        if (!near) return;

        const along = _sep.dot(_dir);
        if (along < 0) _sep.addScaledVector(_dir, -along); // Drop the braking part
        if (_sep.lengthSq() < 1e-6) _sep.set(-_dir.z * this.side, 0, _dir.x * this.side); // Dead ahead: pass on our side
        _dir.addScaledVector(_sep.normalize(), 0.7).normalize();
    }

    // Is a moving enemy right behind us (farther from the player), waiting for us to move?
    _blockingOthers(position, dist, player) {
        for (const other of this.entityManager.entities) {
            if (other === this.enemy || other.entityType !== 'enemy' || other.isDead || !other.ai || other.ai.isHolding) continue;
            const op = other.position;
            if (Math.abs(op.y - position.y) >= 2 || Math.hypot(op.x - position.x, op.z - position.z) > 2.2) continue;
            if (op.distanceTo(player.position) > dist) return true;
        }
        return false;
    }

    // Hard collision: push `nextPos` out of enemies standing on roughly the same floor
    _pushOutOfEnemies(nextPos, currentY) {
        const r = this.enemy.radius;
        for (const other of this.entityManager.entities) {
            if (other === this.enemy || other.entityType !== 'enemy' || other.isDead) continue;
            if (Math.abs(other.position.y - currentY) >= 1.5) continue;
            const dx = nextPos.x - other.position.x;
            const dz = nextPos.z - other.position.z;
            const distSq = dx * dx + dz * dz;
            const minDist = r + other.radius;
            if (distSq < minDist * minDist && distSq > 0.0001) {
                const dist = Math.sqrt(distSq);
                nextPos.x += (dx / dist) * (minDist - dist);
                nextPos.z += (dz / dist) * (minDist - dist);
            }
        }
    }

    // Chasing but not moving for a second: the next waypoint is close but taken (another enemy stands
    // on it) → go for the one after; otherwise plan again, around the crowd. Returns `next` unchanged.
    _watchProgress(dt, position, next) {
        this.stuckTimer += dt;
        if (this.stuckTimer < STUCK_CHECK) return next;
        const moved = Math.hypot(position.x - this.stuckFrom.x, position.z - this.stuckFrom.z);
        this.stuckTimer = 0;
        this.stuckFrom.copy(position);
        if (moved >= STUCK_MOVE) {
            this.stuckCount = 0;
        } else {
            this.stuckCount++;
            const wp = this.path && this.path[this.pathIndex];
            if (wp && !wp.jump && this.pathIndex < this.path.length - 1 && Math.hypot(wp.x - position.x, wp.z - position.z) < 2) this.pathIndex++;
            else this.planTimer = 0; // Plan again now, around the crowd
        }
        return next;
    }

    // ─── Jumping ─────────────────────────────────────────────────────────────

    _startJump(position, wp, landingHeight) {
        const endPos = new THREE.Vector3(wp.x, landingHeight + CENTER_HEIGHT, wp.z);
        this.jumpState = {
            startPos: position.clone(),
            endPos,
            peakHeight: Math.max(position.y, endPos.y) + 1.2,
            duration: 0.35, // Fast parkour hop
            elapsed: 0
        };
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
            this.jumpStunTimer = LANDING_STUN;
            this.stuckFrom.copy(jump.endPos); // A jump is progress
            this.stuckTimer = 0;
        }
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
        this.planTimer = 0; // Somewhere else now: plan again
    }

    // ─── Shooting ────────────────────────────────────────────────────────────

    _tryAttack(now, dist, player, position) {
        if (dist >= this.attackRange || now - this.lastAttackTime <= this.attackCooldown) return;
        if (dist >= 5.0 && !this.inSight) return; // Very close: always in sight
        this.lastAttackTime = now;
        this.shoot(player, position);
    }

    shoot(player, position) {
        _shootDir.subVectors(player.position, position);
        if (_shootDir.lengthSq() > 0) _shootDir.normalize();
        else _shootDir.set(0, 0, -1);

        // Spawn slightly in front of the enemy to avoid clipping
        _spawnPos.copy(position).addScaledVector(_shootDir, 0.5);

        soundManager.play('enemyShoot', _spawnPos);
        this.entityManager.add(new Projectile(_spawnPos, _shootDir, this.projectileSpeed, this.damage, this.levelManager, {
            sourceName: "Minion",
            sourceId: this.enemy.id,
            maxDistance: 100
        }));
    }
}
