import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Projectile } from './Projectile.js';
import { soundManager } from '../systems/SoundManager.js';
import { TextureGenerator } from '../systems/TextureGenerator.js';
import { FloatingText } from './FloatingText.js';
import { Pickup } from './Pickup.js';
import { PALETTE, css } from '../core/Palette.js';
import { EnemyHealthSystem } from './EnemyHealth.js';

// Drawn twice the size of its parts below (3.5 m across with its rings), so it reads as an enemy from afar
const SIZE = 2;
// Centre of the eye above the room's floor: its lowest ring (1.08 m below, 1.21 m in the hit punch)
// clears the tallest reward (the stall's awning, 2.1 m)
const HOVER_HEIGHT = 3.4;
// It sees from here, under the wall tops (2.9 m), so walls keep blocking its line of sight
const SIGHT_HEIGHT = 2.8;
const TETHER_BOTTOM = 0.6; // The thread of light ends on the reward
const BAR_HEIGHT = 1.35; // Health bar above the rings
const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _sight = new THREE.Vector3();

let shared = null; // Geometries/materials shared by every guardian, created on first use

function getShared() {
    if (!shared) {
        const tetherLength = HOVER_HEIGHT - TETHER_BOTTOM;
        shared = {
            // A dark stone eyeball, its glowing ember iris and slit pupil on +z (turned to the player)
            ballGeo: new THREE.SphereGeometry(0.34, 20, 14),
            irisGeo: new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20).rotateX(Math.PI / 2).translate(0, 0, 0.31),
            pupilGeo: new THREE.BoxGeometry(0.06, 0.28, 0.03).translate(0, 0, 0.335),
            irisMat: new THREE.MeshStandardMaterial({ color: PALETTE.ember, emissive: PALETTE.emberBright, emissiveIntensity: 2, roughness: 0.2 }),
            pupilMat: new THREE.MeshStandardMaterial({ color: 0x0a0608, roughness: 0.4 }),
            // Two stone rings turning like a gyroscope; the outer one bristles with 6 spikes, merged into it (one draw call)
            innerRingGeo: new THREE.TorusGeometry(0.48, 0.06, 8, 32),
            outerRingGeo: mergeGeometries([new THREE.TorusGeometry(0.6, 0.05, 8, 32), ...Array.from({ length: 6 }, (_, i) => {
                const a = (i / 6) * Math.PI * 2;
                return new THREE.ConeGeometry(0.07, 0.3, 6).rotateZ(a - Math.PI / 2).translate(Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0); // Points outwards
            })]),
            stoneMat: new THREE.MeshStandardMaterial({ color: 0x3a3538, roughness: 0.7, metalness: 0.2 }),
            tetherGeo: new THREE.CylinderGeometry(0.03, 0.06, tetherLength, 6, 1, true).translate(0, -tetherLength / 2, 0),
            tetherMat: new THREE.MeshBasicMaterial({ color: PALETTE.emberBright, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
            // Glow sprite instead of a PointLight: removing a light triggers a shader recompilation freeze
            glowMat: new THREE.SpriteMaterial({
                map: TextureGenerator.getGlowTexture(),
                color: PALETTE.ember,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        };
    }
    return shared;
}

/**
 * Guardian of a special room: one big floating eye above the room's reward, tied to it by a thread
 * of light, with an enemy's ember gaze and a health bar. The reward stays sealed until it is
 * destroyed (`reward.guardian`, see Shrine.isSealed).
 */
export class MagicalSentinel {
    static idCounter = 0;

    // `checkY` selects the floor of the room
    constructor(gridX, gridZ, levelManager, entityManager, level = 1, checkY = 0) {
        this.id = 'sentinel_' + MagicalSentinel.idCounter++;
        this.entityType = 'enemy'; // So EntityManager processes it as targetable
        this.levelManager = levelManager;
        this.entityManager = entityManager;
        this.level = level;
        this.isDead = false;
        this.onDeath = null; // Set by Game: announces the unsealed reward

        this.position = levelManager.floorPositionAt(gridX, gridZ, checkY);
        this.position.y += HOVER_HEIGHT;

        this.maxHealth = this.health = 40 + level * 8;
        this.radius = 0.8 * SIZE; // Hitbox radius: what the player sees
        this.hitTimer = 0; // Scale punch when hit

        // One orb at a time, faster with the levels
        this.projectileSpeed = 12.0;
        this.damage = (10 + level * 2) / 2;
        this.attackCooldown = Math.max(0.5, 1.0 - level * 0.025);
        this.lastAttackTime = 0;
        this.attackRange = 16.0;

        this.pathfinder = levelManager.pathfinder;

        // Visuals
        const g = getShared();
        this.mesh = new THREE.Group();
        this.mesh.position.copy(this.position);
        this.mesh.userData.entity = this;

        this.eye = new THREE.Group();
        this.eye.add(new THREE.Mesh(g.ballGeo, g.stoneMat), new THREE.Mesh(g.irisGeo, g.irisMat), new THREE.Mesh(g.pupilGeo, g.pupilMat));
        this.mesh.add(this.eye);
        this.innerRing = new THREE.Mesh(g.innerRingGeo, g.stoneMat);
        this.outerRing = new THREE.Mesh(g.outerRingGeo, g.stoneMat);
        this.outerRing.rotation.x = Math.PI / 2;
        for (const part of [this.eye, this.innerRing, this.outerRing]) part.scale.setScalar(SIZE);
        this.mesh.add(this.innerRing, this.outerRing, new THREE.Mesh(g.tetherGeo, g.tetherMat)); // Tether and bar keep their size

        const glow = new THREE.Sprite(g.glowMat);
        glow.scale.setScalar(5 * SIZE);
        this.mesh.add(glow);

        // Health bar, always shown: this is an enemy, not part of the reward
        this.bar = new THREE.Group();
        this.bar.position.y = BAR_HEIGHT;
        this.barFill = new THREE.Mesh(EnemyHealthSystem.fillGeo, EnemyHealthSystem.matGreen);
        this.barFill.position.z = 0.01;
        this.bar.add(new THREE.Mesh(EnemyHealthSystem.bgGeo, EnemyHealthSystem.bgMat), this.barFill);
        this.mesh.add(this.bar);
    }

    takeDamage(amount, isCritical = false) {
        if (this.isDead) return false;

        this.health -= amount;
        this.hitTimer = 0.08;
        // Reddish numbers for mechanical constructs
        FloatingText.spawnDamage(this.entityManager, this.position, 0.7 * SIZE, amount, isCritical, isCritical ? 2.5 : 1.8, css(PALETTE.emberBright));

        if (this.health <= 0) {
            this.die();
            return true; // Died
        }
        return false;
    }

    die() {
        this.isDead = true;
        this.mesh.visible = false;

        // Its shockwave, from the floor below the eye, hurts and pushes back the enemies around.
        // A new vector: the wave may destroy another turret, whose own wave runs meanwhile.
        this.entityManager.shockwave(this.position.clone().setY(this.position.y - HOVER_HEIGHT));
        soundManager.play('towerDeath', this.position);
        if (this.onDeath) this.onDeath();

        // Chance to drop pickup
        if (Math.random() < 0.4) {
            const type = Math.random() < 0.5 ? 'health' : 'ammo';
            this.entityManager.add(new Pickup(this.position, type, type === 'health' ? 15 : 25, this.levelManager));
        }

        // Gold Drop (80% chance)
        if (Math.random() < 0.8) {
            const goldVal = 8 + Math.floor(Math.random() * 8) + Math.floor(this.level * 0.6);
            this.entityManager.add(new Pickup(this.position, 'gold', goldVal, this.levelManager));
        }
    }

    update(dt, player) {
        if (this.isDead) return;

        const time = performance.now() / 1000;
        this.mesh.position.y = this.position.y + Math.sin(time * 2) * 0.05;
        this.innerRing.rotation.y += dt * 1.6;
        this.outerRing.rotation.z += dt * 1.1;
        this.eye.lookAt(player.position); // Glares at the player
        this.hitTimer = Math.max(0, this.hitTimer - dt);
        this.mesh.scale.setScalar(this.hitTimer > 0 ? 1.12 : 1);

        // Health bar (same colours as the enemies'), facing the camera
        const ratio = Math.max(0, this.health / this.maxHealth);
        this.barFill.scale.x = ratio;
        this.barFill.position.x = -(1.2 * (1 - ratio)) / 2;
        this.barFill.material = ratio > 0.6 ? EnemyHealthSystem.matGreen : ratio > 0.3 ? EnemyHealthSystem.matYellow : EnemyHealthSystem.matRed;
        if (player.camera) this.bar.lookAt(player.camera.position);

        // Attack while the player is in range and visible from the eye
        const dist = this.position.distanceTo(player.position);
        if (dist >= this.attackRange) return;
        _sight.copy(this.position).setY(this.position.y - HOVER_HEIGHT + SIGHT_HEIGHT);
        if (dist >= 4.0 && !this.pathfinder.hasLineOfSight(_sight, player.position, 0)) return;

        this.lastAttackTime += dt;
        if (this.lastAttackTime >= this.attackCooldown) {
            this.lastAttackTime = 0;
            this.shoot(player);
        }
    }

    // Slow magic orb fired from the eye
    shoot(player) {
        _dir.subVectors(player.position, this.position).normalize();
        _from.copy(this.position).addScaledVector(_dir, 0.5 * SIZE); // Out of the front of the eye

        this.entityManager.add(new Projectile(_from, _dir, this.projectileSpeed, this.damage, this.levelManager, {
            radius: 0.8,
            sourceName: "Sentinel",
            sourceId: this.id,
            maxDistance: 80,
            color: PALETTE.hexBright // Arcane orb, distinct from minion shots
        }));
        soundManager.play('towerShoot', _from);
    }
}
