import * as THREE from 'three';
import { CONSTANTS } from '../core/Constants.js';
import { soundManager } from '../systems/SoundManager.js';

export class Projectile {
    static geometry = new THREE.IcosahedronGeometry(0.15, 1); // Crystal shape
    static material = new THREE.MeshBasicMaterial({ color: 0x00ffff }); // Default Cyan
    static glowTexture = null;

    constructor(position, direction, speed, damage, levelManager, piercing = 0, isCritical = false, knockback = 0, explosion = 0, gravity = 0, radius = 1.0, sourceName = 'Unknown', sourceId = -1, maxDistance = 1000, ricochet = 0) {
        this.position = position.clone();
        this.direction = direction.normalize();
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

        this.mesh = new THREE.Mesh(Projectile.geometry, new THREE.MeshBasicMaterial({ color: color }));
        this.mesh.position.copy(this.position);
        this.mesh.userData.entity = this; // For collision detection

        // Add Glow Sprite (Fake Light)
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

        const spriteMat = new THREE.SpriteMaterial({
            map: Projectile.glowTexture,
            color: color,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.6 // Reduced opacity
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(0.8, 0.8, 0.8); // Reduced scale (was 1.5)
        this.mesh.add(sprite);

        if (isCritical) {
            this.mesh.scale.multiplyScalar(1.5); // Bigger projectile for crits
            sprite.scale.set(1.5, 1.5, 1.5); // Reduced crit scale (was 2.5)
        }
    }

    update(dt, player) {
        if (this.isDead) return;

        let nextPos;
        let moveDist = 0;

        if (this.gravity !== 0) {
            // Physics Movement
            this.velocity.y -= this.gravity * dt;
            const moveStep = this.velocity.clone().multiplyScalar(dt);
            nextPos = this.position.clone().add(moveStep);
            moveDist = moveStep.length();

            // Update direction for visual rotation (optional)
            this.direction.copy(this.velocity).normalize();
        } else {
            // Linear Movement
            moveDist = this.speed * dt;
            nextPos = this.position.clone().add(this.direction.clone().multiplyScalar(moveDist));
        }

        // Range Check
        this.distanceTraveled += moveDist;
        if (this.distanceTraveled >= this.maxDistance) {
            this.isDead = true;
            return;
        }

        // Wall Collision (only if projectile is low enough to hit the wall)
        // Walls are 3 units tall, projectiles flying above 2.5 units can pass over low obstacles
        if (this.levelManager && this.levelManager.isWall(nextPos.x, nextPos.z)) {
            // Only collide if projectile is below wall height
            if (nextPos.y < 2.5) {
                if (this.ricochet > 0) {
                    this.ricochet--;

                    // Simple reflection: Invert X or Z based on which boundary was crossed
                    // This is a simplified grid-based reflection
                    const currentGridX = Math.floor(this.position.x / this.levelManager.cellSize);
                    const currentGridZ = Math.floor(this.position.z / this.levelManager.cellSize);
                    const nextGridX = Math.floor(nextPos.x / this.levelManager.cellSize);
                    const nextGridZ = Math.floor(nextPos.z / this.levelManager.cellSize);

                    if (currentGridX !== nextGridX) {
                        this.direction.x *= -1;
                        if (this.velocity) this.velocity.x *= -1;
                    }
                    if (currentGridZ !== nextGridZ) {
                        this.direction.z *= -1;
                        if (this.velocity) this.velocity.z *= -1;
                    }

                    // Move back to previous safe position to prevent getting stuck
                    nextPos = this.position.clone();

                    // Reset range on ricochet
                    this.distanceTraveled = 0;

                    // Bonus Damage on Ricochet (+25%)
                    this.damage *= 1.25;

                    // Play bounce sound (optional)
                    // soundManager.playBounce();
                } else {
                    this.isDead = true;
                    return;
                }
            }
        }

        // Floor Collision & Ricochet
        const floorHeight = 0.05;

        if (nextPos.y <= floorHeight) {
            if (this.ricochet > 0) {
                this.ricochet--;
                
                // Reflect vertical direction and velocity
                this.direction.y *= -1;
                if (this.velocity) this.velocity.y *= -1;

                // Move back to safe boundary
                nextPos.y = floorHeight + 0.01;

                this.distanceTraveled = 0;
                this.damage *= 1.25;
            } else {
                this.isDead = true;
                return;
            }
        }

        // Bounding Box (AABB) Sky Structures Collision & Ricochet
        if (this.levelManager && this.levelManager.skyStructures) {
            for (const box of this.levelManager.skyStructures) {
                if (box.containsPoint(nextPos)) {
                    if (this.ricochet > 0) {
                        this.ricochet--;

                        const currentInX = this.position.x >= box.min.x && this.position.x <= box.max.x;
                        const currentInY = this.position.y >= box.min.y && this.position.y <= box.max.y;
                        const currentInZ = this.position.z >= box.min.z && this.position.z <= box.max.z;

                        if (!currentInX) {
                            this.direction.x *= -1;
                            if (this.velocity) this.velocity.x *= -1;
                        }
                        if (!currentInY) {
                            this.direction.y *= -1;
                            if (this.velocity) this.velocity.y *= -1;
                        }
                        if (!currentInZ) {
                            this.direction.z *= -1;
                            if (this.velocity) this.velocity.z *= -1;
                        }

                        nextPos.copy(this.position);
                        this.distanceTraveled = 0;
                        this.damage *= 1.25;
                        break;
                    } else {
                        this.isDead = true;
                        return;
                    }
                }
            }
        }

        // Decoration Collision (most decorations are 0.5-1m tall)
        // Projectiles below 1.2m will hit decorations
        if (this.levelManager && this.levelManager.isDecoration(nextPos.x, nextPos.z)) {
            if (nextPos.y < 1.2) {
                this.isDead = true;
                return;
            }
        }

        // Ground Collision (for gravity projectiles)
        if (this.gravity !== 0 && nextPos.y <= 0) {
            this.isDead = true;
            // Optional: Create explosion here
            return;
        }

        this.position.copy(nextPos);
        this.mesh.position.copy(this.position);

        // Rotate mesh to face direction
        this.mesh.lookAt(this.position.clone().add(this.direction));

        // Life check (Safety fallback)
        this.lifeTime -= dt;
        if (this.lifeTime <= 0) {
            this.isDead = true;
            return;
        }

        // Collision detection
        if (this.isPlayerProjectile) {
            // Player projectile - check collision with enemies
            // This is handled by EntityManager checking against enemy meshes
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
