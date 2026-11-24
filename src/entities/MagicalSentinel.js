import * as THREE from 'three';
import { Projectile } from './Projectile.js';
import { soundManager } from '../systems/SoundManager.js';
import { TextureGenerator } from '../systems/TextureGenerator.js';
import { FloatingText } from './FloatingText.js';
import { Pickup } from './Pickup.js';
import { PALETTE, css } from '../core/Palette.js';

const EYE_HEIGHT = 0.6; // Eye orb height above the centre of mass
const _eyePos = new THREE.Vector3();
const _dir = new THREE.Vector3();

let shared = null; // Geometries/materials shared by every sentinel, created on first use

function getShared() {
    if (!shared) {
        shared = {
            pedestalGeo: new THREE.CylinderGeometry(0.2, 0.25, 1.4, 8),
            pedestalMat: new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.8, metalness: 0.2 }),
            headGeo: new THREE.TorusGeometry(0.2, 0.05, 8, 16),
            headMat: new THREE.MeshStandardMaterial({ color: 0x7a6a5a, roughness: 0.5, metalness: 0.4 }),
            eyeGeo: new THREE.IcosahedronGeometry(0.12, 1),
            eyeMat: new THREE.MeshStandardMaterial({ color: PALETTE.hex, emissive: PALETTE.hexBright, emissiveIntensity: 1.5, roughness: 0.1, metalness: 0.5 }),
            // Glow sprite instead of a PointLight: removing a light triggers a shader recompilation freeze
            glowMat: new THREE.SpriteMaterial({
                map: TextureGenerator.getGlowTexture(),
                color: PALETTE.hex,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        };
    }
    return shared;
}

export class MagicalSentinel {
    static idCounter = 0;

    // `checkY` selects the floor the sentinel stands on
    constructor(gridX, gridZ, levelManager, entityManager, level = 1, checkY = 0) {
        this.id = 'sentinel_' + MagicalSentinel.idCounter++;
        this.entityType = 'enemy'; // So EntityManager processes it as targetable
        this.levelManager = levelManager;
        this.entityManager = entityManager;
        this.level = level;
        this.isDead = false;

        this.position = levelManager.floorPositionAt(gridX, gridZ, checkY);
        const spawnFloorY = this.position.y;
        this.position.y += 0.8; // Center of mass

        this.health = (25 + (level * 5)) / 2;
        this.radius = 0.8; // Hitbox radius

        // Attack config
        this.projectileSpeed = 12.0;
        this.damage = (10 + level * 2) / 2;
        this.attackCooldown = Math.max(1.0, 3.5 - (level * 0.15)) / 5.0;
        this.lastAttackTime = Math.random() * 1.5; // Stagger attack starts
        this.attackRange = 15.0;

        this.pathfinder = levelManager.pathfinder;

        // Visuals
        const { pedestalGeo, pedestalMat, headGeo, headMat, eyeGeo, eyeMat, glowMat } = getShared();
        this.mesh = new THREE.Group();
        this.mesh.position.set(this.position.x, spawnFloorY, this.position.z); // Base on floor
        this.mesh.userData.entity = this;

        // 1. Stone Pedestal
        const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
        pedestal.position.y = 0.7; // Pivot in middle
        this.mesh.add(pedestal);

        // 2. Torus Head (holds the eye/orb)
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.4;
        head.rotation.x = Math.PI / 2; // Lie flat
        this.mesh.add(head);

        // 3. Glowing Eye Orb
        this.eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
        this.eyeMesh.position.y = 1.4;
        this.mesh.add(this.eyeMesh);

        // 4. Red glow
        this.light = new THREE.Sprite(glowMat);
        this.light.scale.set(4, 4, 4);
        this.light.position.y = 1.4;
        this.mesh.add(this.light);
    }

    takeDamage(amount, isCritical = false) {
        if (this.isDead) return false;

        this.health -= amount;
        // Reddish numbers for mechanical constructs
        FloatingText.spawnDamage(this.entityManager, this.position, 1.0, amount, isCritical, isCritical ? 2.5 : 1.8, css(PALETTE.emberBright));

        if (this.health <= 0) {
            this.die();
            return true; // Died
        }
        return false;
    }

    die() {
        this.isDead = true;
        this.mesh.visible = false;

        this.entityManager.createExplosion(this.position, this.damage * 2); // Death blast kept at its former strength
        soundManager.play('towerDeath', this.position);

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

        // Orb floating bobbing animation
        const time = performance.now() / 1000;
        this.eyeMesh.position.y = 1.4 + Math.sin(time * 4) * 0.05;

        // Turn towards the player (yaw only, pedestal stays upright)
        this.mesh.rotation.y = Math.atan2(player.position.x - this.position.x, player.position.z - this.position.z);

        // Attack while the player is in range and visible from the eye
        const dist = this.position.distanceTo(player.position);
        if (dist >= this.attackRange) return;
        _eyePos.copy(this.position);
        _eyePos.y += EYE_HEIGHT;
        if (dist >= 4.0 && !this.pathfinder.hasLineOfSight(_eyePos, player.position, 0)) return;

        this.lastAttackTime += dt;
        if (this.lastAttackTime >= this.attackCooldown) {
            this.lastAttackTime = 0;
            this.shoot(player);
        }
    }

    // Slow magic orb fired from the eye
    shoot(player) {
        _eyePos.copy(this.position);
        _eyePos.y += EYE_HEIGHT;
        _dir.subVectors(player.position, _eyePos).normalize();
        _eyePos.addScaledVector(_dir, 0.4);

        this.entityManager.add(new Projectile(_eyePos, _dir, this.projectileSpeed, this.damage, this.levelManager, {
            radius: 0.8,
            sourceName: "Sentinel",
            sourceId: this.id,
            maxDistance: 80,
            color: PALETTE.hexBright // Arcane homing orb, distinct from minion shots
        }));
        soundManager.play('towerShoot', _eyePos);
    }
}
