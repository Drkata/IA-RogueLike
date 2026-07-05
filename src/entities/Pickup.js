import * as THREE from 'three';
import { soundManager } from '../systems/SoundManager.js';

export class Pickup {
    static geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    // Materials map for reuse
    static materials = {
        health: new THREE.MeshLambertMaterial({ color: 0xff0000, emissive: 0xaa0000, emissiveIntensity: 1.0 }),
        ammo: new THREE.MeshLambertMaterial({ color: 0x00ff00, emissive: 0x00aa00, emissiveIntensity: 1.0 }),
        upgrade: new THREE.MeshLambertMaterial({ color: 0x9933ff, emissive: 0x6600cc, emissiveIntensity: 1.0 }), // Purple
        gold: new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0x886600, emissiveIntensity: 1.0 }) // Gold
    };

    constructor(position, type, value) {
        this.type = type; // 'ammo', 'health', 'upgrade'
        this.value = value;
        this.isDead = false;
        this.bobTimer = 0;

        // Reuse geometry and material
        this.mesh = new THREE.Mesh(Pickup.geometry, Pickup.materials[type]);
        this.mesh.position.copy(position);
        this.mesh.position.y = 0.5; // Start height

        // Fortnite-style drop physics
        const angle = Math.random() * Math.PI * 2;
        const horizontalForce = 2 + Math.random() * 4;
        this.vx = Math.cos(angle) * horizontalForce;
        this.vz = Math.sin(angle) * horizontalForce;
        this.vy = 5 + Math.random() * 5; // Upward pop
        this.isSettled = false;
    }

    update(dt, player) {
        if (!this.isSettled) {
            // Physics phase
            this.vy -= 20 * dt; // Gravity
            
            let nextX = this.mesh.position.x + this.vx * dt;
            let nextZ = this.mesh.position.z + this.vz * dt;
            
            if (window.game && window.game.levelManager) {
                const radius = 0.3; // Small collision radius for pickup
                if (window.game.levelManager.isWall(nextX + (this.vx > 0 ? radius : -radius), this.mesh.position.z)) {
                    this.vx *= -0.5; // Bounce on X
                    nextX = this.mesh.position.x;
                }
                if (window.game.levelManager.isWall(this.mesh.position.x, nextZ + (this.vz > 0 ? radius : -radius))) {
                    this.vz *= -0.5; // Bounce on Z
                    nextZ = this.mesh.position.z;
                }
            }
            
            this.mesh.position.x = nextX;
            this.mesh.position.z = nextZ;
            this.mesh.position.y += this.vy * dt;

            // Chaotic rotation while in air
            this.mesh.rotation.x += dt * 8;
            this.mesh.rotation.y += dt * 5;

            // Bounce on ground
            if (this.mesh.position.y <= 0.5) {
                this.mesh.position.y = 0.5;
                if (this.vy < -3) {
                    this.vy *= -0.5; // Bounce up
                    this.vx *= 0.6; // Ground friction
                    this.vz *= 0.6;
                } else {
                    this.isSettled = true;
                    this.mesh.rotation.x = 0; // Settle upright
                    this.bobTimer = 0; // Sync bobbing
                }
            }
        } else {
            // Idle bobbing animation
            this.bobTimer += dt * 3;
            this.mesh.position.y = 0.5 + Math.sin(this.bobTimer) * 0.2;
            this.mesh.rotation.y += dt;
        }

        // Collision detection with player
        const dist = this.mesh.position.distanceTo(player.position);
        if (dist < 1.5) {
            this.collect(player);
        }
    }

    collect(player) {
        if (this.type === 'health') {
            if (player.health < player.maxHealth) {
                player.heal(this.value);
                this.isDead = true;
                soundManager.playPickup();
                console.log("Picked up Health");
            }
        } else if (this.type === 'ammo') {
            player.weapon.addAmmo(this.value);
            this.isDead = true;
            soundManager.playPickup();
            console.log("Picked up Ammo");
        } else if (this.type === 'upgrade') {
            this.isDead = true;
            soundManager.playPickup(); // Or a special sound if available
            console.log("Picked up Upgrade");
            if (window.game) {
                window.game.showUpgradeMenu(1, true); // 1 point, mid-level
            }
        } else if (this.type === 'gold') {
            player.addGold(this.value);
            this.isDead = true;
            soundManager.playPickup();
            console.log("Picked up Gold: " + this.value);
        }
    }
}
