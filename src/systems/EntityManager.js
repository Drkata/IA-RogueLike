import * as THREE from 'three';
import { soundManager } from './SoundManager.js';

export class EntityManager {
    constructor(scene) {
        this.scene = scene;
        this.entities = [];

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

        // Check player projectile collisions with enemies
        for (let i = 0; i < this.entities.length; i++) {
            const projectile = this.entities[i];
            if (projectile.isDead || projectile.entityType !== 'projectile' || !projectile.isPlayerProjectile) continue;

            for (let j = 0; j < this.entities.length; j++) {
                const enemy = this.entities[j];
                if (enemy.isDead || enemy.entityType !== 'enemy') continue;

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
                        if (died) {
                            player.sessionStats.kills++;
                            if (player.lifeSteal > 0) {
                                player.heal(player.lifeSteal);
                            }
                        }

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

        for (let i = 0; i < this.entities.length; i++) {
            if (this.entities[i].entityType !== 'enemy') continue;
            for (let j = i + 1; j < this.entities.length; j++) {
                if (this.entities[j].entityType !== 'enemy') continue;
                
                const enemy1 = this.entities[i];
                const enemy2 = this.entities[j];

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

    createExplosion(position, damage, player) {
        const radius = 6.0;
        let targetsHit = 0;

        for (let i = 0; i < this.entities.length; i++) {
            const enemy = this.entities[i];
            if (enemy.isDead || enemy.entityType !== 'enemy') continue;

            const dist = position.distanceTo(enemy.position);
            const hitRadius = enemy.radius ? enemy.radius : 0.85;

            if (dist < (radius + hitRadius)) {
                // Falloff damage
                const dmgMult = 1.0 - (dist / (radius + hitRadius));
                const finalDamage = Math.max(1, Math.floor(damage * dmgMult));
                const died = enemy.takeDamage(finalDamage, false);
                if (died && player) {
                    player.sessionStats.kills++;
                    if (player.lifeSteal > 0) {
                        player.heal(player.lifeSteal);
                    }
                }
                this.createHitEffect(enemy.position, false);

                if (player && player.sessionStats) {
                    player.sessionStats.damageDealt += finalDamage;
                    if (died) player.sessionStats.kills++;

                    if (finalDamage > player.sessionStats.maxDamageHit) {
                        player.sessionStats.maxDamageHit = finalDamage;
                    }
                }
                targetsHit++;
            }
        }

        // Only play visual if we actually hit something
        if (targetsHit > 0 || !player) { // If !player, it's a turret death or script explosion, so always play visual
            if (!this.explosionGeo) {
                this.explosionGeo = new THREE.SphereGeometry(1, 16, 16);
            }
            // We must clone the material if we are fading opacity individually over time
            // Wait, does cloning material trigger recompilation?
            // Actually, for MeshBasicMaterial, Three.js shares the shader program. It just uploads new uniforms. So cloning is very fast.
            // But we can also just use a pool!
            // For now, let's just create material ONCE and use a Sprite or just clone material.
            if (!this.explosionMat) {
                this.explosionMat = new THREE.MeshBasicMaterial({
                    color: 0xff4400,
                    transparent: true,
                    opacity: 0.5
                });
            }
            
            const explosion = new THREE.Mesh(this.explosionGeo, this.explosionMat.clone());
            explosion.position.copy(position);
            explosion.userData.life = 0.3;
            explosion.userData.isExplosion = true;

            this.scene.add(explosion);
            this.hitEffects.push(explosion);
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
        let count = 0;
        for (let i = 0; i < this.entities.length; i++) {
            const e = this.entities[i];
            if (!e.isDead && e.entityType === 'enemy') {
                count++;
            }
        }
        return count;
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
