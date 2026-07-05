import * as THREE from 'three';
import { CONSTANTS } from '../core/Constants.js';
import { soundManager } from '../systems/SoundManager.js';

export class MagicalShop {
    constructor(gridX, gridZ, cellSize) {
        this.gridX = gridX;
        this.gridZ = gridZ;
        this.cellSize = cellSize || CONSTANTS.CELL_SIZE;
        this.entityType = 'shop';

        this.position = new THREE.Vector3(
            gridX * this.cellSize + this.cellSize / 2,
            0,
            gridZ * this.cellSize + this.cellSize / 2
        );
        this.isDead = false;
        this.radius = 1.8; // Interaction radius

        // Visuals
        this.mesh = new THREE.Group();
        this.mesh.position.copy(this.position);

        // 1. Counter (Wood pedestal/table)
        const tableGeo = new THREE.BoxGeometry(0.8, 0.7, 0.8);
        const tableMat = new THREE.MeshStandardMaterial({
            color: 0x4d3319, // Brown wood
            roughness: 0.9,
            metalness: 0.1
        });
        const table = new THREE.Mesh(tableGeo, tableMat);
        table.position.y = 0.35;
        table.castShadow = true;
        table.receiveShadow = true;
        this.mesh.add(table);

        // 2. Magic Floating Crystal (Shop sign)
        const crystalGeo = new THREE.IcosahedronGeometry(0.12, 1);
        this.crystalMat = new THREE.MeshStandardMaterial({
            color: 0x00bfff, // Deep Sky Blue
            emissive: 0x00bfff,
            emissiveIntensity: 0.7,
            roughness: 0.1,
            metalness: 0.9
        });
        this.crystal = new THREE.Mesh(crystalGeo, this.crystalMat);
        this.crystal.position.y = 1.1;
        this.mesh.add(this.crystal);

        // 3. Blue Light Source
        this.light = new THREE.PointLight(0x00bfff, 1.2, 5);
        this.light.position.y = 1.1;
        this.mesh.add(this.light);

        this.floatOffset = Math.random() * Math.PI * 2;
    }

    update(dt, player) {
        if (this.isDead) return;

        // Visual rotation/floating
        const time = performance.now() / 1000;
        this.crystal.position.y = 1.1 + Math.sin(time * 2 + this.floatOffset) * 0.06;
        this.crystal.rotation.y += dt * 0.6;

        // Interaction check
        const dx = player.position.x - this.position.x;
        const dz = player.position.z - this.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < this.radius) {
            player.hudManager.showMessage("Pressez [E] pour commercer avec le Marchand Magique", 100);

            if (player.input.keys['KeyE']) {
                player.input.keys['KeyE'] = false; // Consume key
                this.interact(player);
            }
        }
    }

    interact(player) {
        soundManager.playPowerup();
        if (window.game) {
            window.game.showShopMenu(this);
        }
    }
}
