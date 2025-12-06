import * as THREE from 'three';
import { soundManager } from '../systems/SoundManager.js';

export class LootChest {
    constructor(position, player, onPickup) {
        this.position = position.clone();
        this.player = player;
        this.onPickup = onPickup;
        this.isDead = false;
        this.radius = 1.0; // Interaction radius

        // Visuals
        this.mesh = new THREE.Group();
        this.mesh.position.copy(this.position);

        // Box
        const boxGeo = new THREE.BoxGeometry(0.8, 0.6, 0.5);
        const boxMat = new THREE.MeshStandardMaterial({
            color: 0xFFD700, // Gold
            roughness: 0.3,
            metalness: 0.8
        });
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.y = 0.3;
        this.mesh.add(box);

        // Lid (Separate for potential animation, but static for now)
        const lidGeo = new THREE.BoxGeometry(0.84, 0.1, 0.54);
        const lidMat = new THREE.MeshStandardMaterial({
            color: 0xFFA500, // Orange Gold
            roughness: 0.3,
            metalness: 0.8
        });
        const lid = new THREE.Mesh(lidGeo, lidMat);
        lid.position.y = 0.65;
        this.mesh.add(lid);

        // Light
        const light = new THREE.PointLight(0xFFD700, 1, 5);
        light.position.y = 1.0;
        this.mesh.add(light);

        // Float animation
        this.floatOffset = Math.random() * Math.PI * 2;
    }

    update(dt) {
        // Animation
        const time = performance.now() / 1000;
        this.mesh.position.y = this.position.y + Math.sin(time * 2 + this.floatOffset) * 0.1;
        this.mesh.rotation.y += dt * 0.5;

        // Collision Check
        // Collision Check (Ignore Y axis for easier pickup)
        const dx = this.player.position.x - this.mesh.position.x;
        const dz = this.player.position.z - this.mesh.position.z;
        const distSq = dx * dx + dz * dz;
        const radiusSum = this.radius + this.player.radius;

        if (distSq < radiusSum * radiusSum) {
            // Check Y difference to avoid picking up from too far above/below
            if (Math.abs(this.player.position.y - this.mesh.position.y) < 3.0) {
                this.pickup();
            }
        }
    }

    pickup() {
        if (this.isDead) return;
        this.isDead = true;

        // Effects
        soundManager.playPowerup(); // Need to ensure this exists or use generic sound

        // Logic
        if (this.onPickup) {
            this.onPickup();
        }
    }
}
