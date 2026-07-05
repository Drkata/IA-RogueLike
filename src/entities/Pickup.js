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
        this.mesh.position.y = 0.5; // Float above ground
    }

    update(dt, player) {
        // Bobbing animation
        this.bobTimer += dt * 3;
        this.mesh.position.y = 0.5 + Math.sin(this.bobTimer) * 0.2;
        this.mesh.rotation.y += dt;

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
