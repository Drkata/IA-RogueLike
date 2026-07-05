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

        // Replaced PointLight with Sprite to avoid recompilation freeze on pickup
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255, 215, 0, 1)');
        grad.addColorStop(0.4, 'rgba(255, 215, 0, 0.5)');
        grad.addColorStop(1, 'rgba(255, 215, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        
        const glowTex = new THREE.CanvasTexture(canvas);
        const glowMat = new THREE.SpriteMaterial({
            map: glowTex,
            color: 0xFFD700,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        const light = new THREE.Sprite(glowMat);
        light.scale.set(4, 4, 4);
        light.position.y = 0.5;
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
