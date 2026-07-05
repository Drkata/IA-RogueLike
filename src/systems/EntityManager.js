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

        // Shockwave Visuals
        this.shockwaveGeo = new THREE.RingGeometry(0.5, 1.0, 32);
        this.shockwaveMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff, // Cyan
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthTest: false
        });
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
                } else if (effect.userData.isShockwave) {
                    // Shockwave: Expand to radius 15
                    const progress = 1 - (effect.userData.life / 0.5);
                    const scale = 1.0 + (progress * 30.0); // 1.0 -> 31.0 (Radius ~15)
                    effect.scale.setScalar(scale);
                    effect.material.opacity = (effect.userData.life / 0.5) * 0.8;
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

                if (dist < separationRadius && dist > 0.01) {
                    const separation = enemy1.position.clone().sub(enemy2.position);
                    separation.y = 0;
                    if (separation.lengthSq() > 0) {
                        separation.normalize();
                    } else {
                        separation.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                    }

                    const pushForce = (separationRadius - dist) * 0.5;

                    const newPos1 = enemy1.position.clone().add(separation.clone().multiplyScalar(pushForce));
                    const newPos2 = enemy2.position.clone().sub(separation.clone().multiplyScalar(pushForce));

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
                } else if (dist <= 0.01) {
                    const separation = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                    const pushForce = separationRadius * 0.5;

                    const newPos1 = enemy1.position.clone().add(separation.clone().multiplyScalar(pushForce));
                    const newPos2 = enemy2.position.clone().sub(separation.clone().multiplyScalar(pushForce));

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
            flash.geometry = this.hitGeo;
        }

        flash.position.copy(position);

        if (isCritical) {
            flash.scale.set(1, 1, 1);
            flash.material.color.setHex(0xff0000);
        } else {
            flash.scale.set(1, 1, 1);
            flash.material.color.setHex(0xffff00);
        }

        flash.material.opacity = 0.8;
        flash.userData.life = 0.2;

        this.scene.add(flash);
        this.hitEffects.push(flash);
    }

    createExplosion(position, damage, player = null) {
        // Find targets first
        const enemies = this.entities.filter(e => e.entityType === 'enemy' && !e.isDead);
        const targets = [];

        for (const enemy of enemies) {
            const dist = enemy.position.distanceTo(position);
            if (dist < 6) {
                targets.push(enemy);
            }
        }

        // Only play visual if we actually hit something
        if (targets.length > 0) {
            const geometry = new THREE.SphereGeometry(1, 16, 16);
            const material = new THREE.MeshBasicMaterial({
                color: 0xff4400,
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

    createShockwave(position) {
        const effect = new THREE.Mesh(this.shockwaveGeo, this.shockwaveMat.clone());
        effect.position.copy(position);
        effect.position.y = 0.5; // Slightly above ground
        effect.rotation.x = -Math.PI / 2; // Flat on ground
        effect.userData = { life: 0.5, isShockwave: true };
        effect.scale.setScalar(1.0);
        this.scene.add(effect);
        this.hitEffects.push(effect);
    }

    createTelegraph(position, duration) {
        const mat = this.telegraphMat.clone();
        const mesh = new THREE.Mesh(this.telegraphGeo, mat);

        mesh.position.copy(position);
        mesh.position.y = 0.1;
        mesh.rotation.x = -Math.PI / 2;

        mesh.userData.life = duration;
        mesh.userData.maxLife = duration;

        this.scene.add(mesh);

        const beaconGeo = new THREE.CylinderGeometry(0.1, 0.1, 20, 8);
        const beaconMat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.rotation.x = Math.PI / 2;
        beacon.position.set(0, 0, 10);

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

        for (const effect of this.hitEffects) {
            this.scene.remove(effect);
        }
        this.hitEffects = [];
        this.hitEffectPool = [];

        for (const tele of this.telegraphs) {
            this.scene.remove(tele);
        }
        this.telegraphs = [];
    }
}
