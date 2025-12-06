import * as THREE from 'three';
import { soundManager } from './SoundManager.js';

export class EntityManager {
    constructor(scene) {
        this.scene = scene;
        this.entities = [];

        // Hit Effect Pooling
        this.hitEffects = [];
        this.hitEffectPool = [];
        // Hit Effect Pooling
        this.hitEffects = [];
        this.hitEffectPool = [];
        this.hitGeo = new THREE.SphereGeometry(0.15, 8, 8); // Reduced from 0.3

        // We reuse geometry but create materials for opacity fading
        this.hitBaseMat = new THREE.MeshBasicMaterial({
            color: 0xffff00, // Yellow
            transparent: true,
            opacity: 0.8,
            depthTest: false
        });

        // Telegraph Visuals
        this.telegraphGeo = new THREE.RingGeometry(0.1, 2.5, 32); // Ring
        this.telegraphMat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        this.telegraphs = []; // Active telegraphs
    }

    add(entity) {
        this.entities.push(entity);
        if (entity.mesh) {
            this.scene.add(entity.mesh);
        }
    }

    update(dt, player) {
        // Update and remove dead entities in place
        let i = 0;
        while (i < this.entities.length) {
            const entity = this.entities[i];

            if (entity.isDead) {
                if (entity.mesh) {
                    this.scene.remove(entity.mesh);
                }
                // Swap with last element and pop (fast removal)
                const lastIndex = this.entities.length - 1;
                if (i < lastIndex) {
                    this.entities[i] = this.entities[lastIndex];
                }
                this.entities.pop();
                continue; // Don't increment i, check the swapped entity
            }

            entity.update(dt, player);
            i++;
        }

        // Update Hit Effects
        for (let j = this.hitEffects.length - 1; j >= 0; j--) {
            const effect = this.hitEffects[j];
            effect.userData.life -= dt;

            if (effect.userData.life > 0) {
                if (effect.userData.isExplosion) {
                    // Explosion: Linear expansion to radius 6
                    const progress = 1 - (effect.userData.life / 0.3);
                    const scale = 0.5 + (progress * 5.5); // 0.5 -> 6.0
                    effect.scale.setScalar(scale);
                    effect.material.opacity = effect.userData.life / 0.3;
                } else {
                    // Hit Flash: Rapid expansion
                    effect.scale.multiplyScalar(1.0 + (dt * 10));
                    effect.material.opacity = effect.userData.life / 0.2;
                }
            } else {
                // Remove
                this.scene.remove(effect);

                // Swap remove
                this.hitEffects[j] = this.hitEffects[this.hitEffects.length - 1];
                this.hitEffects.pop();

                this.hitEffectPool.push(effect);
            }
        }

        // Update Telegraphs
        for (let j = this.telegraphs.length - 1; j >= 0; j--) {
            const tele = this.telegraphs[j];
            tele.userData.life -= dt;

            if (tele.userData.life > 0) {
                // Pulse effect
                const scale = 1.0 + Math.sin(tele.userData.life * 10) * 0.1;
                tele.scale.set(scale, scale, scale);
                tele.material.opacity = (tele.userData.life / tele.userData.maxLife) * 0.5;
            } else {
                this.scene.remove(tele);
                this.telegraphs[j] = this.telegraphs[this.telegraphs.length - 1];
                this.telegraphs.pop();
            }
        }

        // Get enemies list (including Boss)
        const enemies = this.entities.filter(e => e.entityType === 'enemy' && !e.isDead);

        // Check player projectile collisions with enemies
        const playerProjectiles = this.entities.filter(e => e.entityType === 'projectile' && e.isPlayerProjectile);

        for (const projectile of playerProjectiles) {
            if (projectile.isDead) continue;

            for (const enemy of enemies) {
                // Skip if already hit this enemy (for piercing)
                if (projectile.hitEntities && projectile.hitEntities.has(enemy.id)) continue;

                const dist = projectile.position.distanceTo(enemy.position);
                const hitRadius = enemy.radius ? enemy.radius : 0.85;

                if (dist < hitRadius) {
                    const died = enemy.takeDamage(projectile.damage, projectile.isCritical);

                    // Stats
                    if (player && player.sessionStats) {
                        player.sessionStats.shotsHit++;
                        player.sessionStats.damageDealt += projectile.damage;
                        if (died) player.sessionStats.kills++;

                        if (projectile.isCritical) player.sessionStats.critCount++;
                        if (projectile.damage > player.sessionStats.maxDamageHit) {
                            player.sessionStats.maxDamageHit = projectile.damage;
                        }
                    }

                    // Vampirism (Life Steal)
                    if (player && player.vampirism > 0) {
                        const healAmount = projectile.damage * player.vampirism;
                        player.heal(healAmount);
                    }

                    // Knockback
                    if (projectile.knockback > 0) {
                        const pushDir = projectile.direction.clone();
                        pushDir.y = 0;
                        pushDir.normalize();

                        const pushDist = projectile.knockback * 0.2;
                        const newPos = enemy.position.clone().add(pushDir.multiplyScalar(pushDist));

                        // Only apply knockback if not hitting a wall
                        if (enemy.ai && enemy.ai.canMoveTo(newPos)) {
                            enemy.position.copy(newPos);
                            enemy.mesh.position.copy(enemy.position);
                            enemy.mesh.position.y -= 0.85; // Maintain ground offset
                        }
                    }

                    // Explosion
                    if (projectile.explosion > 0) {
                        if (Math.random() < projectile.explosion) {
                            this.createExplosion(projectile.position, projectile.damage, player);
                        }
                    }

                    // Handle Piercing
                    if (projectile.hitEntities && !projectile.hitEntities.has(enemy.id)) {
                        projectile.hitEntities.add(enemy.id);

                        if (projectile.piercing > 0) {
                            projectile.piercing--;
                            // Continue flight (don't kill projectile)
                        } else {
                            projectile.isDead = true;
                        }
                    } else if (!projectile.hitEntities) {
                        // Legacy support or fallback
                        projectile.isDead = true;
                    }

                    // Visual and sound feedback
                    if (projectile.isCritical) {
                        this.createHitEffect(projectile.position, true); // True for crit
                        soundManager.playCritHit();
                    } else {
                        this.createHitEffect(projectile.position, false);
                        soundManager.playHit();
                    }

                    if (projectile.isDead) break; // Stop checking other enemies for this projectile
                }
            }
        }

        // Enemy-to-enemy separation (AFTER all updates and collisions)
        const separationRadius = 0.8;

        for (let i = 0; i < enemies.length; i++) {
            for (let j = i + 1; j < enemies.length; j++) {
                const enemy1 = enemies[i];
                const enemy2 = enemies[j];

                const dist = enemy1.position.distanceTo(enemy2.position);

                if (dist < separationRadius && dist > 0) {
                    const separation = enemy1.position.clone().sub(enemy2.position);
                    separation.y = 0;
                    separation.normalize();

                    const pushForce = (separationRadius - dist) * 0.5;

                    const newPos1 = enemy1.position.clone().add(separation.clone().multiplyScalar(pushForce));
                    const newPos2 = enemy2.position.clone().sub(separation.clone().multiplyScalar(pushForce));

                    // Only push if valid (check walls)
                    if (enemy1.ai && enemy1.ai.canMoveTo(newPos1)) {
                        enemy1.position.copy(newPos1);
                        enemy1.mesh.position.copy(enemy1.position);
                        enemy1.mesh.position.y -= 0.85;
                    }

                    if (enemy2.ai && enemy2.ai.canMoveTo(newPos2)) {
                        enemy2.position.copy(newPos2);
                        enemy2.mesh.position.copy(enemy2.position);
                        enemy2.mesh.position.y -= 0.85;
                    }
                }
            }
        }
    }

    createHitEffect(position, isCritical = false) {
        let flash = this.hitEffectPool.pop();

        if (!flash) {
            const mat = this.hitBaseMat.clone();
            flash = new THREE.Mesh(this.hitGeo, mat);
        } else {
            // Ensure geometry is correct (in case a large explosion mesh leaked into pool)
            flash.geometry = this.hitGeo;
        }

        flash.position.copy(position);

        if (isCritical) {
            flash.scale.set(1, 1, 1); // Standard size (was 2)
            flash.material.color.setHex(0xff0000); // Red
        } else {
            flash.scale.set(1, 1, 1);
            flash.material.color.setHex(0xffff00); // Yellow
        }

        flash.material.opacity = 0.8;
        flash.userData.life = 0.2; // 0.2 seconds life

        this.scene.add(flash);
        this.hitEffects.push(flash);
    }

    createExplosion(position, damage, player = null) {
        // Find targets first
        const enemies = this.entities.filter(e => e.entityType === 'enemy' && !e.isDead);
        const targets = [];

        for (const enemy of enemies) {
            // Check distance (Boss has larger radius, so check distance to surface roughly)
            const dist = enemy.position.distanceTo(position);
            const hitDist = enemy.radius ? 6 + enemy.radius : 6; // Explosion radius 6 + enemy radius

            if (dist < 6) { // Doubled radius check
                targets.push(enemy);
            }
        }

        // Only play visual if we actually hit something
        if (targets.length > 0) {
            // Visual - Solid Sphere for clear AOE range
            const geometry = new THREE.SphereGeometry(1, 16, 16); // Base radius 1
            const material = new THREE.MeshBasicMaterial({
                color: 0xff4400, // Orange/Red
                transparent: true,
                opacity: 0.5
            });
            const explosion = new THREE.Mesh(geometry, material);
            explosion.position.copy(position);
            explosion.userData.life = 0.3;
            explosion.userData.isExplosion = true;

            this.scene.add(explosion);
            this.hitEffects.push(explosion);

            // Apply Damage
            for (const enemy of targets) {
                const died = enemy.takeDamage(damage, player ? player.weapon.critChance > Math.random() : false);
                this.createHitEffect(enemy.position, false);

                if (player && player.sessionStats) {
                    player.sessionStats.damageDealt += damage;
                    if (died) player.sessionStats.kills++;

                    if (damage > player.sessionStats.maxDamageHit) {
                        player.sessionStats.maxDamageHit = damage;
                    }
                }
            }
        }
    }

    createTelegraph(position, duration) {
        const mat = this.telegraphMat.clone();
        const mesh = new THREE.Mesh(this.telegraphGeo, mat);

        mesh.position.copy(position);
        mesh.position.y = 0.1; // Slightly above ground
        mesh.rotation.x = -Math.PI / 2; // Flat on ground

        mesh.userData.life = duration;
        mesh.userData.maxLife = duration;

        this.scene.add(mesh);

        // --- VISUAL IMPROVEMENT: Vertical Beacon ---
        // Add a tall cylinder to make the zone visible even when looking up
        const beaconGeo = new THREE.CylinderGeometry(0.1, 0.1, 20, 8);
        const beaconMat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.set(0, 10, 0); // Center at height 10 (total height 20)
        beacon.rotation.x = Math.PI / 2; // Rotate to match parent's rotation (since parent is rotated -90 deg X)
        // Wait, parent is rotated -PI/2. So parent's Y is World Z. Parent's Z is World Y.
        // Actually, let's just add it to the scene separately or attach it carefully.
        // Easier: Attach to the mesh.
        // Mesh rotation is -PI/2 on X.
        // Local Y axis points along World Z.
        // Local Z axis points along World Y (Up).
        // So we want the cylinder to align with Local Z.
        beacon.rotation.x = Math.PI / 2; // Cylinder default is Y-up. Rotate 90 deg X to align with Z?

        // Let's simplify: Don't rely on parent rotation.
        // Just create a group or handle it separately?
        // No, let's just add it to the mesh and adjust rotation.
        // Mesh is flat on ground (Rot X -90).
        // We want beacon to go UP (World Y).
        // In Local space of Mesh, UP is +Z.
        // Cylinder is Y-aligned by default.
        // So rotate Cylinder X +90 to align with +Z.

        beacon.rotation.x = Math.PI / 2;
        beacon.position.set(0, 0, 10); // Move "Up" in local Z (which is World Y) by 10 units

        mesh.add(beacon);

        this.telegraphs.push(mesh);
    }

    getEnemyCount() {
        return this.entities.filter(e => e.entityType === 'enemy' && !e.isDead).length;
    }

    clear() {
        for (const entity of this.entities) {
            if (entity.mesh) {
                this.scene.remove(entity.mesh);
            }
        }
        this.entities = [];

        // Clear hit effects
        for (const effect of this.hitEffects) {
            this.scene.remove(effect);
        }
        this.hitEffects = [];
        this.hitEffectPool = []; // Clear pool to remove any corrupted meshes

        // Clear telegraphs
        for (const tele of this.telegraphs) {
            this.scene.remove(tele);
        }
        this.telegraphs = [];
    }
}
