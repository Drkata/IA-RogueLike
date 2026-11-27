import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { soundManager } from '../systems/SoundManager.js';
import { TextureGenerator } from '../systems/TextureGenerator.js';
import { PALETTE } from '../core/Palette.js';
import { EYE_HEIGHT, PICKUP_RANGE as COLLECT_DISTANCE } from './Player.js';

const HOVER_HEIGHT = 0.5;
// Magnet upgrade: pickups fly to the player, faster and faster (m/s, m/s²)
const MAGNET_START_SPEED = 3;
const MAGNET_ACCEL = 30;
const MAGNET_MAX_SPEED = 22;
const _target = new THREE.Vector3();
const _feet = new THREE.Vector3(); // Where an item lying at the player's feet floats: distances are measured from there
const PICKUP_SOUNDS = { health: 'health', ammo: 'mana', gold: 'gold', upgrade: 'upgrade' };
// Share of the health potions rolled by a dying enemy or turret that actually drop: healing came too easily
export const POTION_DROP_SHARE = 0.1;

const merge = (geometries) => {
    const merged = mergeGeometries(geometries.map(g => (g.index ? g.toNonIndexed() : g)));
    geometries.forEach(g => g.dispose());
    return merged;
};

// One shape and one palette colour per resource (see ART_DIRECTION.md)
const KINDS = {
    health: { // Ember potion
        color: PALETTE.ember, glow: PALETTE.emberBright,
        geometry: () => merge([
            new THREE.SphereGeometry(0.2, 14, 10).translate(0, -0.05, 0),
            new THREE.CylinderGeometry(0.07, 0.07, 0.16, 10).translate(0, 0.17, 0),
            new THREE.CylinderGeometry(0.085, 0.085, 0.06, 10).translate(0, 0.27, 0)
        ])
    },
    ammo: { // Aether mana crystal
        color: PALETTE.aether, glow: PALETTE.aetherBright,
        geometry: () => new THREE.OctahedronGeometry(0.2).scale(1, 1.7, 1)
    },
    gold: { // Standing coin
        color: PALETTE.gilt, glow: PALETTE.giltBright, metalness: 0.75,
        geometry: () => new THREE.CylinderGeometry(0.2, 0.2, 0.05, 18).rotateX(Math.PI / 2)
    },
    upgrade: { // Hex rune stone
        color: PALETTE.hex, glow: PALETTE.hexBright,
        geometry: () => new THREE.IcosahedronGeometry(0.22, 0)
    }
};

// Geometry, material and glow sprite material per kind, built on first use and shared
const shared = {};
function getKind(type) {
    if (!shared[type]) {
        const kind = KINDS[type];
        shared[type] = {
            geometry: kind.geometry(),
            material: new THREE.MeshStandardMaterial({
                color: kind.color,
                emissive: kind.glow,
                emissiveIntensity: 0.6,
                roughness: 0.35,
                metalness: kind.metalness || 0.1
            }),
            glow: new THREE.SpriteMaterial({
                map: TextureGenerator.getGlowTexture(),
                color: kind.glow,
                transparent: true,
                opacity: 0.7,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        };
    }
    return shared[type];
}

export class Pickup {
    // `position` is the dropping entity's centre; the pickup lands on the floor below it
    constructor(position, type, value, levelManager) {
        this.type = type; // 'health' | 'ammo' | 'upgrade' | 'gold'
        this.value = value;
        this.levelManager = levelManager;
        this.isDead = false;
        this.bobTimer = 0;

        const kind = getKind(type);
        this.mesh = new THREE.Mesh(kind.geometry, kind.material);
        const glow = new THREE.Sprite(kind.glow);
        glow.scale.setScalar(1.1);
        this.mesh.add(glow);
        this.groundY = levelManager.getFloorHeight(position.x, position.z, position.y - 0.8);
        this.mesh.position.set(position.x, this.groundY + HOVER_HEIGHT, position.z);

        // Pop out in a random direction
        const angle = Math.random() * Math.PI * 2;
        const horizontalForce = 2 + Math.random() * 4;
        this.vx = Math.cos(angle) * horizontalForce;
        this.vz = Math.sin(angle) * horizontalForce;
        this.vy = 5 + Math.random() * 5;
        this.isSettled = false;
    }

    // Wanted right now: a potion is left on the ground while health is full
    _wanted(player) {
        return this.type !== 'health' || player.health < player.maxHealth;
    }

    // Level cleared: flies to the player from anywhere (update() still drops an unwanted potion)
    pullToPlayer() {
        if (this.attracted) return;
        this.attracted = true;
        this.magnetSpeed = MAGNET_START_SPEED;
    }

    // Within the magnet range, wanted, and in sight (no pulling through walls)
    _shouldAttract(player) {
        const range = player.magnetRange;
        if (range <= COLLECT_DISTANCE || !this._wanted(player)) return false;
        const pos = this.mesh.position;
        if (pos.distanceToSquared(_feet) > range * range) return false;
        return this.levelManager.pathfinder.hasLineOfSight(pos, player.position, 0);
    }

    update(dt, player) {
        const pos = this.mesh.position;
        _feet.set(player.position.x, player.position.y - EYE_HEIGHT + HOVER_HEIGHT, player.position.z);
        if (!this.attracted && this._shouldAttract(player)) {
            this.attracted = true;
            this.magnetSpeed = MAGNET_START_SPEED;
        }

        if (this.attracted && !this._wanted(player)) {
            // Health filled up on the way: drop onto the floor below
            this.attracted = false;
            this.isSettled = false;
            this.vx = this.vy = this.vz = 0;
            this.groundY = this.levelManager.getFloorHeight(pos.x, pos.z, pos.y - HOVER_HEIGHT);
        }

        if (this.attracted) {
            // Fly to the player's chest, spinning
            this.magnetSpeed = Math.min(MAGNET_MAX_SPEED, this.magnetSpeed + MAGNET_ACCEL * dt);
            _target.set(player.position.x, player.position.y - 0.6, player.position.z);
            const dist = pos.distanceTo(_target);
            if (dist > 1e-6) pos.lerp(_target, Math.min(1, (this.magnetSpeed * dt) / dist));
            this.mesh.rotation.y += dt * 12;
        } else if (!this.isSettled) {
            this.vy -= 20 * dt; // Gravity

            // Bounce off walls on each axis separately
            const radius = 0.3;
            let nextX = pos.x + this.vx * dt;
            let nextZ = pos.z + this.vz * dt;
            if (this.levelManager.isWall(nextX + Math.sign(this.vx) * radius, pos.z, this.groundY)) {
                this.vx *= -0.5;
                nextX = pos.x;
            }
            if (this.levelManager.isWall(pos.x, nextZ + Math.sign(this.vz) * radius, this.groundY)) {
                this.vz *= -0.5;
                nextZ = pos.z;
            }
            pos.x = nextX;
            pos.z = nextZ;
            // The floor follows it: off a ledge it falls, along a ramp it rises, it never floats
            this.groundY = this.levelManager.getFloorHeight(pos.x, pos.z, this.groundY);
            pos.y += this.vy * dt;

            // Chaotic rotation while in air
            this.mesh.rotation.x += dt * 8;
            this.mesh.rotation.y += dt * 5;

            // Bounce on ground, settle when slow
            if (pos.y <= this.groundY + HOVER_HEIGHT) {
                pos.y = this.groundY + HOVER_HEIGHT;
                if (this.vy < -3) {
                    this.vy *= -0.5;
                    this.vx *= 0.6; // Ground friction
                    this.vz *= 0.6;
                } else {
                    this.isSettled = true;
                    this.mesh.rotation.x = 0;
                    this.bobTimer = 0;
                }
            }
        } else {
            this.bobTimer += dt * 3;
            pos.y = this.groundY + HOVER_HEIGHT + Math.sin(this.bobTimer) * 0.2;
            this.mesh.rotation.y += dt;
        }

        if (pos.distanceToSquared(_feet) < COLLECT_DISTANCE * COLLECT_DISTANCE) this.collect(player);
    }

    collect(player) {
        if (this.type === 'health') {
            if (player.health >= player.maxHealth) return; // Leave it for later
            player.heal(this.value * player.pactPotionMultiplier);
        } else if (this.type === 'ammo') {
            player.weapon.addAmmo(this.value);
        } else if (this.type === 'upgrade') {
            window.game.showUpgradeMenu(1, true); // 1 point, mid-level
        } else if (this.type === 'gold') {
            player.addGold(Math.round(this.value * player.pactGoldMultiplier));
        }
        this.isDead = true;
        soundManager.play(PICKUP_SOUNDS[this.type]);
    }
}
