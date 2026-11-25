import * as THREE from 'three';
import { soundManager } from './SoundManager.js';
import { PALETTE } from '../core/Palette.js';

const SHOCKWAVE_RANGE = 19.5; // m
const SHOCKWAVE_DAMAGE = 50;

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
            color: PALETTE.giltBright,
            transparent: true,
            opacity: 0.8,
            depthTest: false
        });

        // Telegraphs: a ground circle (unit radius, scaled) that fills up until the hit lands
        this.telegraphRingGeo = new THREE.RingGeometry(0.92, 1.0, 48).rotateX(-Math.PI / 2);
        this.telegraphFillGeo = new THREE.CircleGeometry(1.0, 48).rotateX(-Math.PI / 2);
        this.telegraphBeaconGeo = new THREE.CylinderGeometry(0.1, 0.1, 20, 8).translate(0, 10, 0);
        this.telegraphs = []; // Active telegraphs
        this._telegraphPool = []; // Reusable telegraph groups

        // Explosion Pool (avoids material.clone() on every explosion)
        this._explosionPool = [];
        this._explosionGeo  = new THREE.SphereGeometry(1, 16, 16);
        // Pre-allocate 4 explosion meshes
        for (let i = 0; i < 4; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: PALETTE.emberBright, transparent: true, opacity: 0.5 });
            this._explosionPool.push(new THREE.Mesh(this._explosionGeo, mat));
        }

        // Shockwave Visuals
        this.shockwaveGeo = new THREE.RingGeometry(0.5, 1.0, 32);
        this.shockwaveMat = new THREE.MeshBasicMaterial({
            color: PALETTE.aetherBright,
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

    _remove(entity) {
        if (entity.mesh) this.scene.remove(entity.mesh);
        if (entity.dispose) entity.dispose(); // Per-instance GPU resources (e.g. FloatingText material)
    }

    // Expired effects go back to the pool they came from
    _recycleEffect(effect) {
        this.scene.remove(effect);
        if (effect.userData.isExplosion) this._explosionPool.push(effect);
        else if (!effect.userData.isShockwave) this.hitEffectPool.push(effect);
    }

    update(dt, player) {
        // Update and remove dead entities in place
        let i = 0;
        while (i < this.entities.length) {
            const entity = this.entities[i];

            if (entity.isDead) {
                this._remove(entity);
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
                    // Shockwave: the ring's outer edge reaches SHOCKWAVE_RANGE as it fades
                    const progress = 1 - (effect.userData.life / 0.5);
                    effect.scale.setScalar(1.0 + progress * (SHOCKWAVE_RANGE - 1));
                    effect.material.opacity = (effect.userData.life / 0.5) * 0.8;
                } else {
                    // Hit Flash: Rapid expansion
                    effect.scale.multiplyScalar(1.0 + (dt * 10));
                    effect.material.opacity = effect.userData.life / 0.2;
                }
            } else {
                // Swap remove
                this.hitEffects[j] = this.hitEffects[this.hitEffects.length - 1];
                this.hitEffects.pop();
                this._recycleEffect(effect);
            }
        }

        // Update Telegraphs: the disc grows to the full circle when the hit lands
        for (let j = this.telegraphs.length - 1; j >= 0; j--) {
            const tele = this.telegraphs[j];
            const data = tele.userData;
            data.life -= dt;

            if (data.life > 0) {
                const progress = 1 - data.life / data.maxLife;
                data.fill.scale.setScalar(Math.max(0.01, data.radius * progress));
                data.fill.material.opacity = 0.15 + 0.35 * progress;
                data.ring.material.opacity = 0.6 + 0.3 * Math.sin(data.life * 12);
            } else {
                this.scene.remove(tele);
                this._telegraphPool.push(tele); // Return to pool
                this.telegraphs[j] = this.telegraphs[this.telegraphs.length - 1];
                this.telegraphs.pop();
            }
        }

        this._resolvePlayerShots(player);
    }

    // Player projectiles vs enemies (enemy projectiles test the player themselves)
    _resolvePlayerShots(player) {
        const stats = player.sessionStats;
        for (let i = 0; i < this.entities.length; i++) {
            const projectile = this.entities[i];
            if (projectile.isDead || projectile.entityType !== 'projectile' || !projectile.isPlayerProjectile) continue;

            for (let j = 0; j < this.entities.length; j++) {
                const enemy = this.entities[j];
                if (enemy.isDead || enemy.entityType !== 'enemy') continue;
                if (projectile.hitEntities.has(enemy.id)) continue; // Already pierced through it
                if (projectile.position.distanceToSquared(enemy.position) >= enemy.radius * enemy.radius) continue;

                const died = enemy.takeDamage(projectile.damage, projectile.isCritical);

                stats.shotsHit++;
                stats.damageDealt += projectile.damage;
                if (died) stats.kills++;
                if (projectile.isCritical) stats.critCount++;
                stats.maxDamageHit = Math.max(stats.maxDamageHit, projectile.damage);

                if (player.vampirism > 0) player.heal(projectile.damage * player.vampirism);

                if (projectile.knockback > 0 && enemy.ai) {
                    enemy.ai.knockback(projectile.direction.x, projectile.direction.z, projectile.knockback * 0.2);
                }

                if (projectile.explosion > 0 && Math.random() < projectile.explosion) {
                    this.createExplosion(projectile.position, projectile.damage, player);
                }

                // Piercing: keep flying through up to `piercing` enemies
                projectile.hitEntities.add(enemy.id);
                if (projectile.piercing > 0) projectile.piercing--;
                else projectile.isDead = true;

                this.createHitEffect(projectile.position, projectile.isCritical);
                soundManager.play(projectile.isCritical ? 'crit' : 'hit', projectile.position);

                if (projectile.isDead) break; // Stop checking other enemies for this projectile
            }
        }
    }

    createHitEffect(position, isCritical = false) {
        const flash = this.hitEffectPool.pop() || new THREE.Mesh(this.hitGeo, this.hitBaseMat.clone());

        flash.position.copy(position);
        flash.scale.set(1, 1, 1);
        flash.material.color.setHex(isCritical ? PALETTE.hexBright : PALETTE.giltBright);
        flash.material.opacity = 0.8;
        flash.userData.life = 0.2;

        this.scene.add(flash);
        this.hitEffects.push(flash);
    }

    createExplosion(position, damage, player) {
        soundManager.play('explosion', position);
        const radius = 6.0;
        let targetsHit = 0;

        for (let i = 0; i < this.entities.length; i++) {
            const enemy = this.entities[i];
            if (enemy.isDead || enemy.entityType !== 'enemy') continue;

            const dist = position.distanceTo(enemy.position);
            const reach = radius + enemy.radius;
            if (dist >= reach) continue;

            // Linear damage falloff
            const finalDamage = Math.max(1, Math.floor(damage * (1.0 - dist / reach)));
            const died = enemy.takeDamage(finalDamage, false);
            this.createHitEffect(enemy.position, false);

            if (player) {
                const stats = player.sessionStats;
                stats.damageDealt += finalDamage;
                if (died) stats.kills++;
                stats.maxDamageHit = Math.max(stats.maxDamageHit, finalDamage);
            }
            targetsHit++;
        }

        // Spawn visual — use explosion pool to avoid material cloning & shader recompilation
        if (targetsHit > 0 || !player) {
            const explosion = this._getExplosionFromPool();
            explosion.position.copy(position);
            explosion.scale.setScalar(0.5);
            explosion.material.opacity = 0.5;
            explosion.userData.life = 0.3;
            explosion.userData.isExplosion = true;
            this.scene.add(explosion);
            this.hitEffects.push(explosion);
        }
    }

    // Shockwave from `position` (on the ground): every enemy within SHOCKWAVE_RANGE takes
    // SHOCKWAVE_DAMAGE and is pushed away. Set off by a destroyed turret.
    shockwave(position) {
        soundManager.play('shockwave');
        for (const entity of this.entities) {
            if (entity.entityType !== 'enemy' || entity.isDead) continue;
            if (position.distanceTo(entity.position) >= SHOCKWAVE_RANGE) continue;
            entity.takeDamage(SHOCKWAVE_DAMAGE);
            if (entity.ai) entity.ai.knockback(entity.position.x - position.x, entity.position.z - position.z, 5);
        }

        // Shared material: two shockwaves at once are rare
        const effect = new THREE.Mesh(this.shockwaveGeo, this.shockwaveMat);
        effect.position.copy(position);
        effect.position.y += 0.5;
        effect.rotation.x = -Math.PI / 2;
        effect.userData = { life: 0.5, isShockwave: true };
        effect.scale.setScalar(1.0);
        this.scene.add(effect);
        this.hitEffects.push(effect);
    }

    // Danger zone on the ground: a circle of `radius` m (the real reach of the hit) whose disc fills
    // up over `duration` seconds, with a thin beam to spot it from afar
    createTelegraph(position, duration, radius = 2.5, color = PALETTE.ember) {
        let tele = this._telegraphPool.pop(); // Pooled: no new material per meteor
        if (!tele) {
            const material = (opacity) => new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
            const ring = new THREE.Mesh(this.telegraphRingGeo, material(0.8));
            const fill = new THREE.Mesh(this.telegraphFillGeo, material(0.2));
            const beacon = new THREE.Mesh(this.telegraphBeaconGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
            tele = new THREE.Group();
            tele.add(ring, fill, beacon);
            Object.assign(tele.userData, { ring, fill, beacon });
        }
        const data = tele.userData;
        for (const part of [data.ring, data.fill, data.beacon]) part.material.color.setHex(color);
        data.ring.scale.setScalar(radius);
        data.fill.scale.setScalar(0.01);
        data.radius = radius;
        data.life = data.maxLife = duration;
        tele.position.set(position.x, position.y + 0.06, position.z);

        this.scene.add(tele);
        this.telegraphs.push(tele);
    }

    _getExplosionFromPool() {
        if (this._explosionPool.length > 0) {
            return this._explosionPool.pop();
        }
        // Pool empty (rare): create a new one
        const mat = new THREE.MeshBasicMaterial({ color: PALETTE.emberBright, transparent: true, opacity: 0.5 });
        return new THREE.Mesh(this._explosionGeo, mat);
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
        for (const entity of this.entities) this._remove(entity);
        this.entities = [];

        for (const effect of this.hitEffects) this._recycleEffect(effect);
        this.hitEffects = [];

        for (const tele of this.telegraphs) {
            this.scene.remove(tele);
            this._telegraphPool.push(tele);
        }
        this.telegraphs = [];
    }
}
