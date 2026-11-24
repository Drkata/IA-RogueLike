import * as THREE from 'three';
import { TextureGenerator } from '../systems/TextureGenerator.js';
import { PALETTE } from '../core/Palette.js';
import { soundManager } from '../systems/SoundManager.js';

// Module-level scratch vectors — zero-allocation in Projectile.update() hot path
const _tempPos = new THREE.Vector3();
const _tempDir = new THREE.Vector3();
const _tempLookAt = new THREE.Vector3();
const _contact = { normal: new THREE.Vector3(), depth: 0 };
const _segStart = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _wallNormal = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _toEnemy = new THREE.Vector3();

const BOUNCE_DAMAGE_MULT = 1.25;
const MAX_WALL_BOUNCES_PER_STEP = 3; // Into a corner, a fast shot can hit several faces in one frame
// Player ricochets bend towards an enemy in sight within this cone and range (0° disables it)
const RICOCHET_ASSIST_COS = Math.cos(THREE.MathUtils.degToRad(25));
const RICOCHET_ASSIST_RANGE = 15;

// First wall face crossed by the segment start → end, walking the X/Z grid cell by cell
// (exact impact point, no tunnelling through corners, and no wall test while inside one cell).
// Returns the fraction of the segment at the impact and writes the face normal, or returns -1.
function firstWallHit(lm, start, end, normal) {
    const size = lm.cellSize;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    let cx = Math.floor(start.x / size);
    let cz = Math.floor(start.z / size);
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? size / Math.abs(dx) : Infinity;
    const tDeltaZ = dz !== 0 ? size / Math.abs(dz) : Infinity;
    let tMaxX = dx !== 0 ? ((dx > 0 ? cx + 1 : cx) * size - start.x) / dx : Infinity;
    let tMaxZ = dz !== 0 ? ((dz > 0 ? cz + 1 : cz) * size - start.z) / dz : Infinity;

    for (;;) {
        const alongX = tMaxX < tMaxZ;
        const t = alongX ? tMaxX : tMaxZ;
        if (t > 1) return -1;
        if (alongX) {
            cx += stepX;
            tMaxX += tDeltaX;
        } else {
            cz += stepZ;
            tMaxZ += tDeltaZ;
        }
        if (lm.isWall((cx + 0.5) * size, (cz + 0.5) * size, start.y + (end.y - start.y) * t)) {
            normal.set(alongX ? -stepX : 0, 0, alongX ? 0 : -stepZ);
            return t;
        }
    }
}

export class Projectile {
    static geometry = new THREE.IcosahedronGeometry(0.15, 1); // Crystal shape

    // Shared materials, one per color
    static sharedMeshMaterials = {};
    static sharedSpriteMaterials = {};

    static getMaterials(color) {
        if (!Projectile.sharedMeshMaterials[color]) {
            Projectile.sharedMeshMaterials[color] = new THREE.MeshBasicMaterial({ color });
            Projectile.sharedSpriteMaterials[color] = new THREE.SpriteMaterial({
                map: TextureGenerator.getGlowTexture(),
                color,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                opacity: 0.6
            });
        }
        return {
            meshMat: Projectile.sharedMeshMaterials[color],
            spriteMat: Projectile.sharedSpriteMaterials[color]
        };
    }

    /**
     * @param {object} [options]
     * @param {number} [options.piercing=0]      Enemies it can pass through
     * @param {boolean} [options.isCritical=false]
     * @param {number} [options.knockback=0]
     * @param {number} [options.explosion=0]     Chance (0-1) to explode on hit
     * @param {number} [options.gravity=0]       > 0 for arcing shots
     * @param {number} [options.radius=1.0]      Hit radius against the player
     * @param {string} [options.sourceName='Unknown'] Shown in the death recap
     * @param {number|string} [options.sourceId=-1]   -1 = the player
     * @param {number} [options.maxDistance=1000]
     * @param {number} [options.ricochet=0]      Bounces allowed
     * @param {number} [options.homingLevel=0]
     * @param {number} [options.color]           Defaults to the palette: aether (player), hex (crit), ember (enemy)
     */
    constructor(position, direction, speed, damage, levelManager, {
        piercing = 0, isCritical = false, knockback = 0, explosion = 0, gravity = 0, radius = 1.0,
        sourceName = 'Unknown', sourceId = -1, maxDistance = 1000, ricochet = 0, homingLevel = 0, color = null
    } = {}) {
        this.position = position.clone();
        this.direction = direction.clone().normalize();
        this.speed = speed;
        this.damage = damage;
        this.levelManager = levelManager;
        this.piercing = piercing;
        this.isCritical = isCritical;
        this.knockback = knockback;
        this.explosion = explosion;
        this.gravity = gravity;
        this.radius = radius;
        this.sourceName = sourceName;
        this.sourceId = sourceId;
        this.maxDistance = maxDistance;
        this.distanceTraveled = 0;
        this.ricochet = ricochet;
        this.homingLevel = homingLevel;

        this.isPlayerProjectile = sourceId === -1;
        this.firstStep = true; // The first wall test starts half a metre back, at the shooter
        this.hitEntities = this.isPlayerProjectile ? new Set() : null; // Enemies already hit (piercing)
        this.isDead = false;
        this.lifeTime = 10.0; // Safety limit (range controls death)
        this.entityType = 'projectile'; // Fix for minified builds

        if (this.gravity !== 0) {
            this.velocity = this.direction.clone().multiplyScalar(this.speed);
        }

        // Player magic is aether, crits hex, explosive shots and every enemy shot ember
        if (color === null) {
            if (!this.isPlayerProjectile) color = PALETTE.emberBright;
            else if (isCritical) color = PALETTE.hexBright;
            else color = explosion > 0 ? PALETTE.emberBright : PALETTE.aetherBright;
        }
        const materials = Projectile.getMaterials(color);

        this.mesh = new THREE.Mesh(Projectile.geometry, materials.meshMat);
        this.mesh.position.copy(this.position);
        this.mesh.userData.entity = this;

        const sprite = new THREE.Sprite(materials.spriteMat);
        sprite.scale.setScalar(isCritical ? 1.5 : 0.8);
        this.mesh.add(sprite);

        if (isCritical) this.mesh.scale.multiplyScalar(1.5);
        if (this.isPlayerProjectile) this.mesh.scale.multiplyScalar(0.65);
    }

    // Reverse the given velocity axes after a bounce; bounces make the shot hit harder
    _bounce(flipX, flipY, flipZ) {
        this.ricochet--;
        if (flipX) this.direction.x *= -1;
        if (flipY) this.direction.y *= -1;
        if (flipZ) this.direction.z *= -1;
        if (this.velocity) {
            if (flipX) this.velocity.x *= -1;
            if (flipY) this.velocity.y *= -1;
            if (flipZ) this.velocity.z *= -1;
        }
        this.distanceTraveled = 0;
        this.damage *= BOUNCE_DAMAGE_MULT;
    }

    // Mirror the direction (and velocity) on a surface of normal `n`
    _reflect(n) {
        this.ricochet--;
        this.direction.addScaledVector(n, -2 * this.direction.dot(n)).normalize();
        if (this.velocity) this.velocity.addScaledVector(n, -2 * this.velocity.dot(n));
        this.distanceTraveled = 0;
        this.damage *= BOUNCE_DAMAGE_MULT;
    }

    // Every ricochet: bend player shots towards a nearby enemy in sight, and give feedback
    _onRicochet(point) {
        if (!this.isPlayerProjectile || !window.game) return;
        let best = null;
        let bestCos = RICOCHET_ASSIST_COS;
        for (const enemy of window.game.entityManager.entities) {
            if (enemy.entityType !== 'enemy' || enemy.isDead) continue;
            _toEnemy.subVectors(enemy.position, point);
            const dist = _toEnemy.length();
            if (dist > RICOCHET_ASSIST_RANGE || dist < 0.5) continue;
            const cos = _toEnemy.dot(this.direction) / dist;
            if (cos > bestCos) {
                bestCos = cos;
                best = enemy;
            }
        }
        if (best && this.gravity === 0 && this.levelManager.pathfinder.hasLineOfSight(point, best.position, 0)) {
            this.direction.subVectors(best.position, point).normalize();
        }
        soundManager.play('ricochet', point);
        window.game.entityManager.createHitEffect(point, false);
    }

    // Steer towards `target` by `strength * dt`
    _steer(target, strength, dt) {
        this.direction.lerp(target, strength * dt).normalize();
        if (this.gravity !== 0) {
            this.velocity.copy(this.direction).multiplyScalar(this.velocity.length());
        }
    }

    update(dt, player) {
        if (this.isDead) return;

        this.lifeTime -= dt;
        if (this.lifeTime <= 0) {
            this.isDead = true;
            return;
        }

        let moveDist = 0;
        if (this.gravity !== 0) {
            // Arc movement
            this.velocity.y -= this.gravity * dt;
            _tempPos.copy(this.position).addScaledVector(this.velocity, dt);
        } else {
            moveDist = this.speed * dt;
            _tempPos.copy(this.position).addScaledVector(this.direction, moveDist);
        }

        // Sentinel shots slowly track the player (horizontally)
        if (this.sourceName === "Sentinel" && this.distanceTraveled > 1.0) {
            _tempDir.set(player.position.x, this.position.y, player.position.z).sub(this.position).normalize();
            this._steer(_tempDir, 0.6, dt);
        }

        // Homing player shots track the closest enemy within 15m
        if (this.isPlayerProjectile && this.homingLevel > 0 && this.distanceTraveled > 0.5 && window.game) {
            let closestEnemy = null;
            let closestDistSq = 15.0 * 15.0;
            const entities = window.game.entityManager.entities;
            for (let i = 0; i < entities.length; i++) {
                const entity = entities[i];
                if (entity.entityType !== 'enemy' || entity.isDead) continue;
                const distSq = this.position.distanceToSquared(entity.position);
                if (distSq < closestDistSq) {
                    closestDistSq = distSq;
                    closestEnemy = entity;
                }
            }
            if (closestEnemy) {
                _tempDir.subVectors(closestEnemy.position, this.position).normalize();
                this._steer(_tempDir, this.homingLevel * 1.5, dt);
            }
        }

        // Range Check
        this.distanceTraveled += moveDist;
        if (this.distanceTraveled >= this.maxDistance) {
            this.isDead = true;
            return;
        }

        // 1. Floor / ramp / wall-top collision (vertical bounce)
        const floorHeight = this.levelManager.getFloorHeight(_tempPos.x, _tempPos.z, _tempPos.y);
        const projectileRadius = 0.05;
        if (_tempPos.y <= floorHeight + projectileRadius) {
            if (this.ricochet <= 0) {
                if (this.gravity !== 0) soundManager.play('meteor', _tempPos); // Boss meteors crash down
                this.isDead = true;
                return;
            }
            if (Math.abs(this.direction.y) < 0.01 && this.gravity === 0) {
                // Hit a ramp or step horizontally: bounce backwards and slightly up
                this._bounce(true, false, true);
                this.direction.y = 0.5;
                this.direction.normalize();
            } else {
                this._bounce(false, true, false);
            }
            _tempPos.y = floorHeight + projectileRadius + 0.01; // Snap above the floor
            this._onRicochet(_tempPos);
            _tempPos.copy(this.position).addScaledVector(this.direction, moveDist);
            _tempPos.y = Math.max(_tempPos.y, floorHeight + projectileRadius + 0.01);
        }

        // 2. Walls: bounce exactly where the path meets the wall face, then fly the rest of the step
        _segStart.copy(this.position);
        if (this.firstStep) {
            _segStart.addScaledVector(this.direction, -0.5); // Shots spawn 0.5 m ahead: catch a wall in between
            this.firstStep = false;
        }
        for (let bounce = 0; bounce < MAX_WALL_BOUNCES_PER_STEP; bounce++) {
            const t = firstWallHit(this.levelManager, _segStart, _tempPos, _wallNormal);
            if (t < 0) break;
            _hit.lerpVectors(_segStart, _tempPos, t).addScaledVector(_wallNormal, 0.01); // Just off the face
            if (this.ricochet <= 0) {
                if (this.isPlayerProjectile && window.game) window.game.entityManager.createHitEffect(_hit, false);
                this.isDead = true;
                return;
            }
            _seg.subVectors(_tempPos, _hit).reflect(_wallNormal); // Rest of the step, mirrored
            this._reflect(_wallNormal);
            this._onRicochet(_hit);
            if (this.gravity !== 0) _tempPos.copy(_hit).add(_seg);
            else _tempPos.copy(_hit).addScaledVector(this.direction, _seg.length());
            _segStart.copy(_hit);
        }

        // 3. Floating islands and bridges
        const sky = this.levelManager.skyColliders;
        if (sky && sky.probe(_tempPos.x, _tempPos.y, _tempPos.z, 0, _contact)) {
            if (this.ricochet <= 0) {
                if (this.gravity !== 0) soundManager.play('meteor', _tempPos);
                this.isDead = true;
                return;
            }
            this._reflect(_contact.normal);
            this._onRicochet(this.position);
            _tempPos.copy(this.position).addScaledVector(this.direction, moveDist);
        }

        // Obstacles collision
        if (_tempPos.y < 1.2 && this.levelManager.isDecoration(_tempPos.x, _tempPos.z)) {
            this.isDead = true;
            return;
        }

        // Safety catch
        if (this.gravity !== 0 && _tempPos.y <= 0) {
            this.isDead = true;
            return;
        }

        this.position.copy(_tempPos);
        this.mesh.position.copy(this.position);

        // Face the direction of travel
        _tempLookAt.copy(this.position).add(this.gravity !== 0 ? this.velocity : this.direction);
        this.mesh.lookAt(_tempLookAt);

        // Enemy shots hit the player here; player shots are resolved by EntityManager
        if (!this.isPlayerProjectile && this.position.distanceToSquared(player.position) < (this.radius + 0.5) ** 2) {
            player.takeDamage(this.damage, this.sourceName, this.sourceId);
            this.isDead = true;
        }
    }
}
