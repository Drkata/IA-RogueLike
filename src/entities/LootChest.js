import * as THREE from 'three';
import { soundManager } from '../systems/SoundManager.js';
import { TextureGenerator } from '../systems/TextureGenerator.js';
import { PALETTE } from '../core/Palette.js';

let shared = null; // Geometries/materials shared by every chest, created on first use

function getShared() {
    if (!shared) {
        const gilt = new THREE.MeshStandardMaterial({
            color: PALETTE.gilt,
            emissive: PALETTE.giltBright,
            emissiveIntensity: 0.15,
            roughness: 0.35,
            metalness: 0.75
        });
        shared = {
            body: { geometry: new THREE.BoxGeometry(0.8, 0.5, 0.5), material: new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 }) },
            lid: { geometry: new THREE.BoxGeometry(0.84, 0.16, 0.54), material: new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.8 }) },
            band: { geometry: new THREE.BoxGeometry(0.07, 0.7, 0.56), material: gilt }, // Metal straps over body and lid
            lock: { geometry: new THREE.BoxGeometry(0.14, 0.16, 0.05), material: gilt },
            // Sprite glow instead of a PointLight: removing a light triggers a shader recompilation freeze
            glowMat: new THREE.SpriteMaterial({
                map: TextureGenerator.getGlowTexture(),
                color: PALETTE.giltBright,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        };
    }
    return shared;
}

export class LootChest {
    constructor(position, player, onPickup) {
        this.position = position.clone();
        this.player = player;
        this.onPickup = onPickup;
        this.isDead = false;
        this.radius = 1.0; // Interaction radius

        const { body, lid, band, lock, glowMat } = getShared();
        this.mesh = new THREE.Group();
        this.mesh.position.copy(this.position);

        const add = ({ geometry, material }, x, y, z) => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            this.mesh.add(mesh);
        };
        add(body, 0, 0.25, 0);
        add(lid, 0, 0.58, 0);
        add(band, -0.25, 0.36, 0);
        add(band, 0.25, 0.36, 0);
        add(lock, 0, 0.45, 0.27);

        const glow = new THREE.Sprite(glowMat);
        glow.scale.set(3, 3, 3);
        glow.position.y = 0.5;
        this.mesh.add(glow);

        this.floatOffset = Math.random() * Math.PI * 2;
    }

    update(dt) {
        const time = performance.now() / 1000;
        this.mesh.position.y = this.position.y + Math.sin(time * 2 + this.floatOffset) * 0.1;
        this.mesh.rotation.y += dt * 0.5;

        // Horizontal overlap, and roughly the same floor
        const dx = this.player.position.x - this.mesh.position.x;
        const dz = this.player.position.z - this.mesh.position.z;
        const radiusSum = this.radius + this.player.radius;
        if (dx * dx + dz * dz < radiusSum * radiusSum && Math.abs(this.player.position.y - this.mesh.position.y) < 3.0) {
            this.pickup();
        }
    }

    pickup() {
        if (this.isDead) return;
        this.isDead = true;
        soundManager.play('chestOpen');
        if (this.onPickup) this.onPickup();
    }
}
