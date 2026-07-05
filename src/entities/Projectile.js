import * as THREE from 'three';
import { CONSTANTS } from '../core/Constants.js';
import { soundManager } from '../systems/SoundManager.js';

// Module-level scratch vectors — zero-allocation in Projectile.update() hot path
const _tempPos    = new THREE.Vector3();
const _tempDir    = new THREE.Vector3();
const _tempLookAt = new THREE.Vector3(); // For mesh.lookAt() — avoids position.clone()
const _tempCenter = new THREE.Vector3(); // For sky-island AABB center
const _tempSize   = new THREE.Vector3(); // For sky-island AABB size

export class Projectile {
    static geometry = new THREE.IcosahedronGeometry(0.15, 1); // Crystal shape
    static glowTexture = null;
    
    // Shared Materials Cache
    static sharedMeshMaterials = {};
    static sharedSpriteMaterials = {};

    static getMaterials(color) {
        if (!Projectile.sharedMeshMaterials[color]) {
            Projectile.sharedMeshMaterials[color] = new THREE.MeshBasicMaterial({ color: color });
        }
        
        if (!Projectile.glowTexture) {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
            grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
            grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 64, 64);
            Projectile.glowTexture = new THREE.CanvasTexture(canvas);
        }

        if (!Projectile.sharedSpriteMaterials[color]) {
            Projectile.sharedSpriteMaterials[color] = new THREE.SpriteMaterial({
                map: Projectile.glowTexture,
                color: color,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                opacity: 0.6 // Reduced opacity
            });
        }
        
        return {
            meshMat: Projectile.sharedMeshMaterials[color],
            spriteMat: Projectile.sharedSpriteMaterials[color]
        };
    }

    constructor(position, direction, speed, damage, levelManager, piercing = 0, isCritical = false, knockback = 0, explosion = 0, gravity = 0, radius = 1.0, sourceName = 'Unknown', sourceId = -1, maxDistance = 1000, ricochet = 0) {
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
        this.radius = radius; // Collision radius
        this.sourceName = sourceName;
        this.sourceId = sourceId;
        this.maxDistance = maxDistance;
        this.distanceTraveled = 0;
        this.ricochet = ricochet; // Number of bounces allowed
        this.homingLevel = 0;

        this.hitEntities = new Set(); // Track unique entities hit
        this.isDead = false;
        this.lifeTime = 10.0; // Increased safety limit (range controls death now)
        this.isPlayerProjectile = false; // Set by creator
        this.entityType = 'projectile'; // Fix for minified builds

        // Physics velocity (if gravity is used)
        if (this.gravity !== 0) {
            this.velocity = this.direction.clone().multiplyScalar(this.speed);
        }

        // Visual
        let color = 0x00ffff; // Default Cyan
        if (isCritical) color = 0xff00ff; // Purple/Magenta for crit
        else if (explosion > 0) color = 0xffaa00; // Orange for explosive

        const materials = Projectile.getMaterials(color);

        this.mesh = new THREE.Mesh(Projectile.geometry, materials.meshMat);
        this.mesh.position.copy(this.position);
        this.mesh.userData.entity = this; // For collision detection

        const sprite = new THREE.Sprite(materials.spriteMat);
        sprite.scale.set(0.8, 0.8, 0.8); // Reduced scale (was 1.5)
        this.mesh.add(sprite);

        if (isCritical) {
            this.mesh.scale.multiplyScalar(1.5); // Bigger projectile for crits
            sprite.scale.set(1.5, 1.5, 1.5); // Reduced crit scale (was 2.5)
        }

        // Reduce player projectile visual size
        if (this.sourceId === -1) {
            this.mesh.scale.multiplyScalar(0.65);
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
            // Arc Movement (Grenades, arrows)
            this.velocity.y -= this.gravity * dt;
            _tempDir.copy(this.velocity).multiplyScalar(dt);
            _tempPos.copy(this.position).add(_tempDir);
            
            // Align sprite to velocity
            _tempDir.copy(_tempPos).add(this.velocity);
            this.mesh.lookAt(_tempDir);
        } else {
            // Linear Movement
            moveDist = this.speed * dt;
            _tempDir.copy(this.direction).multiplyScalar(moveDist);
            _tempPos.copy(this.position).add(_tempDir);
        }

        // Auto-aiming / Homing effect for Sentinels
        if (this.sourceName === "Sentinel" && this.distanceTraveled > 1.0) {
            if (window.game && window.game.player) {
                const targetPos = window.game.player.position;
                _tempDir.copy(targetPos);
                _tempDir.y = this.position.y; // Keep same height to avoid aiming into floor
                
                _tempDir.subVectors(_tempDir, this.position).normalize();
                this.direction.lerp(_tempDir, 0.6 * dt).normalize();
                
                if (this.gravity !== 0) {
                    const currentSpeed = this.velocity.length();
                    this.velocity.copy(this.direction).multiplyScalar(currentSpeed);
                }
            }
        }

        // Homing effect for Player projectiles — for loop avoids forEach closure allocation
        if (this.sourceId === -1 && this.homingLevel > 0 && this.distanceTraveled > 0.5) {
            let closestEnemy = null;
            let closestDist = Infinity;

            if (window.game && window.game.entityManager && window.game.entityManager.entities) {
                const entities = window.game.entityManager.entities;
                for (let _i = 0; _i < entities.length; _i++) {
                    const entity = entities[_i];
                    if (entity.entityType === 'enemy' && !entity.isDead) {
                        const dist = this.position.distanceTo(entity.position);
                        if (dist < closestDist && dist < 15.0) {
                            closestDist = dist;
                            closestEnemy = entity;
                        }
                    }
                }
            }

            if (closestEnemy) {
                _tempDir.subVectors(closestEnemy.position, this.position);
                // Allow vertical tracking to hit floating enemies / Boss
                _tempDir.normalize();
                
                // Homing strength: Level 1: 1.5, Level 2: 3.0, Level 3: 4.5
                const strength = this.homingLevel * 1.5;
                this.direction.lerp(_tempDir, strength * dt).normalize();
                
                if (this.gravity !== 0) {
                    const currentSpeed = this.velocity.length();
                    this.velocity.copy(this.direction).multiplyScalar(currentSpeed);
                }
            }
        }

        // Range Check
        this.distanceTraveled += moveDist;
        if (this.distanceTraveled >= this.maxDistance) {
            this.isDead = true;
            return;
        }

        // Wall Collision (only if projectile is low enough to hit the wall)
        if (this.levelManager && this.levelManager.isWall(_tempPos.x, _tempPos.z)) {
            // Only collide if projectile is below wall height
            if (_tempPos.y < 2.5) {
                if (this.ricochet > 0) {
                    this.ricochet--;

                    // Step back to previous valid position
                    _tempDir.copy(this.direction).multiplyScalar(-moveDist);
                    _tempPos.copy(this.position).add(_tempDir);

                    // Refined AABB-based reflection for accurate angles
                    const canMoveX = !this.levelManager.isWall(this.position.x + this.direction.x * 0.5, this.position.z);
                    const canMoveZ = !this.levelManager.isWall(this.position.x, this.position.z + this.direction.z * 0.5);

                    if (!canMoveX && canMoveZ) {
                        this.direction.x *= -1;
                        if (this.velocity) this.velocity.x *= -1;
                    } else if (canMoveX && !canMoveZ) {
                        this.direction.z *= -1;
                        if (this.velocity) this.velocity.z *= -1;
                    } else {
                        // Corner or direct hit
                        this.direction.x *= -1;
                        this.direction.z *= -1;
                        if (this.velocity) {
                            this.velocity.x *= -1;
                            this.velocity.z *= -1;
                        }
                    }
                    
                    // Move in new direction — zero-allocation: addScaledVector avoids direction.clone()
                    _tempPos.copy(this.position).addScaledVector(this.direction, moveDist);
                    this.distanceTraveled = 0;
                    this.damage *= 1.25;
                } else {
                    this.isDead = true;
                    return;
                }
            }
        }

        // Floor Collision & Ricochet
        const floorHeight = 0.05;

        if (_tempPos.y <= floorHeight) {
            if (this.ricochet > 0) {
                this.ricochet--;
                
                // Reflect vertical direction and velocity
                this.direction.y *= -1;
                if (this.velocity) this.velocity.y *= -1;
                
                // Snap to floor so it doesn't get stuck
                _tempPos.y = floorHeight + 0.01;
                
                this.distanceTraveled = 0;
                this.damage *= 1.25;
            } else {
                this.isDead = true;
                return;
            }
        }

        // SkyStructures collision (Islands/Bridges/Buildings)
        if (this.levelManager && this.levelManager.skyStructures) {
            for (const mesh of this.levelManager.skyStructures) {
                if (!mesh.geometry.boundingBox) {
                    mesh.geometry.computeBoundingBox();
                }
                const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);

                if (box.containsPoint(_tempPos)) {
                    if (this.ricochet > 0) {
                        this.ricochet--;

                        // Determine reflection axis — zero-allocation: reuse _tempCenter/_tempSize
                        box.getCenter(_tempCenter);
                        box.getSize(_tempSize);

                        const dx = (_tempPos.x - _tempCenter.x) / _tempSize.x;
                        const dy = (_tempPos.y - _tempCenter.y) / _tempSize.y;
                        const dz = (_tempPos.z - _tempCenter.z) / _tempSize.z;

                        const absX = Math.abs(dx);
                        const absY = Math.abs(dy);
                        const absZ = Math.abs(dz);

                        if (absX > absY && absX > absZ) {
                            this.direction.x *= -1;
                            if (this.velocity) this.velocity.x *= -1;
                        } else if (absY > absX && absY > absZ) {
                            this.direction.y *= -1;
                            if (this.velocity) this.velocity.y *= -1;
                        } else {
                            this.direction.z *= -1;
                            if (this.velocity) this.velocity.z *= -1;
                        }

                        _tempPos.copy(this.position).addScaledVector(this.direction, moveDist);
                        this.distanceTraveled = 0;
                        this.damage *= 1.25;
                    } else {
                        this.isDead = true;
                        return;
                    }
                }
            }
        }

        // Obstacles collision
        if (this.levelManager && this.levelManager.isDecoration(_tempPos.x, _tempPos.z)) {
            if (_tempPos.y < 1.2) {
                this.isDead = true;
                return;
            }
        }

        // Safety catch
        if (this.gravity !== 0 && _tempPos.y <= 0) {
            this.isDead = true;
            return;
        }

        this.position.copy(_tempPos);
        this.mesh.position.copy(this.position);

        // Rotate mesh to face direction — zero-allocation: _tempLookAt avoids position.clone()
        _tempLookAt.copy(this.position).add(this.direction);
        this.mesh.lookAt(_tempLookAt);

        // NOTE: lifeTime is already decremented at L111 — no second decrement here.

        // Collision detection
        if (this.isPlayerProjectile) {
            // Player projectile collisions handled by EntityManager
        } else {
            // Enemy projectile - check collision with player
            const dist = this.position.distanceTo(player.position);
            // Use custom radius + player radius (approx 0.5)
            if (dist < (this.radius + 0.5)) {
                player.takeDamage(this.damage, this.sourceName, this.sourceId);
                this.isDead = true;
            }
        }
    }
}
