import * as THREE from 'three';
import { TextureGenerator } from '../systems/TextureGenerator.js';

/*
 * Build kit of the special-room centrepieces (altar, merchant stall, fountain, chest), see
 * ART_DIRECTION.md « Salles spéciales »: dark stone furniture, magic in the room's colour and a
 * column of light seen from afar over the walls. Once spent, the magic fades to grey and the
 * column sinks into the ground.
 */

const SHRINE_LIGHT = 8; // cd
const BEACON_HEIGHT = 22; // m
const FADE_TIME = 1.2; // s
const SPENT = new THREE.Color(0x55525a);

const cache = new Map();
// Geometry, material or texture shared by every shrine, built on first use (never disposed)
export const shared = (key, make) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
};

export const stoneMaterial = () => shared('stone', () => new THREE.MeshStandardMaterial({ color: 0x3a3640, roughness: 0.85 }));

// Vertical fade, bright at the foot of the column
function beaconTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 128); // Top of the column → foot
    gradient.addColorStop(0, '#000');
    gradient.addColorStop(0.55, '#707070');
    gradient.addColorStop(0.97, '#fff');
    gradient.addColorStop(1, '#999');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 4, 128);
    return TextureGenerator.toTexture(canvas, { repeat: false });
}

// Light column: a bright core in a wider faint sheath, both open cylinders flaring upwards
export function createBeacon(color) {
    const beacon = new THREE.Group();
    const map = shared('beaconMap', beaconTexture);
    // Both faces of each cylinder add up: about the room colour at the foot, fading out upwards
    for (const [radius, strength] of [[0.3, 0.35], [0.8, 0.12]]) {
        const geometry = shared(`beacon-${radius}`, () =>
            new THREE.CylinderGeometry(radius * 1.4, radius, BEACON_HEIGHT, 16, 1, true).translate(0, BEACON_HEIGHT / 2, 0));
        const material = shared(`beacon-${radius}-${color}`, () => new THREE.MeshBasicMaterial({
            map,
            color: new THREE.Color(color).multiplyScalar(strength),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: false // A beacon: same strength at any distance
        }));
        beacon.add(new THREE.Mesh(geometry, material));
    }
    return beacon;
}

// A special room's reward stays sealed while its guardian (the eye floating above it) lives.
// Within `radius` of a sealed reward, the player is told why.
export function isSealed(reward, player, radius) {
    if (!reward.guardian || reward.guardian.isDead) return false;
    if (player.isNear(reward.position, radius)) player.hudManager.showMessage('Détruisez le gardien pour libérer la récompense');
    return true;
}

export class Shrine {
    /**
     * Builds `owner.mesh` at `owner.position`: `body` (the furniture, turned a random quarter turn),
     * beacon and light in `color`, and a solid round footprint so nobody walks through it.
     */
    constructor(owner, levelManager, { color, lightY, solidRadius, solidHeight }) {
        this.color = color;
        this.mesh = owner.mesh = new THREE.Group();
        this.mesh.position.copy(owner.position);
        this.body = new THREE.Group();
        this.body.rotation.y = Math.floor(Math.random() * 4) * Math.PI / 2;
        this.mesh.add(this.body);
        this.beacon = createBeacon(color);
        this.mesh.add(this.beacon);
        const p = owner.position;
        this.light = levelManager.takeLight(color, SHRINE_LIGHT, 6, p.x, p.y + lightY, p.z); // null if the pool is used up
        this.glows = [];
        this.fade = -1; // -1 lit, then 0 → 1 while going out
        levelManager.addSolidProp(owner.position, solidRadius, solidHeight);
    }

    add(geometry, material, x = 0, y = 0, z = 0, parent = this.body) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        parent.add(mesh);
        return mesh;
    }

    // A glowing material (base `color`, glowing `emissive`), greyed out by goOut()
    glow(color, emissive = this.color, intensity = 1.2, options = {}) {
        const material = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.25, ...options });
        material.userData.lit = { color: material.color.clone(), emissive: material.emissive.clone(), intensity };
        this.glows.push(material);
        return material;
    }

    goOut() {
        if (this.fade < 0) this.fade = 0;
    }

    update(dt) {
        if (this.fade < 0 || this.fade >= 1) return;
        this.fade = Math.min(1, this.fade + dt / FADE_TIME);
        const t = this.fade;
        if (this.light) this.light.intensity = SHRINE_LIGHT * (1 - t); // Never removed: that would recompile every shader
        this.beacon.scale.y = 1 - t;
        this.beacon.visible = t < 1;
        for (const m of this.glows) {
            const lit = m.userData.lit;
            m.color.lerpColors(lit.color, SPENT, t);
            m.emissive.lerpColors(lit.emissive, SPENT, t);
            m.emissiveIntensity = lit.intensity * (1 - t);
        }
    }

    dispose() {
        this.glows.forEach(m => m.dispose());
        if (this.light) this.light.intensity = 0; // The pooled light stays in the scene, off
    }
}
