import * as THREE from 'three';
import { CONSTANTS } from '../core/Constants.js';
import { soundManager } from '../systems/SoundManager.js';

export class MagicAltar {
    constructor(gridX, gridZ, cellSize) {
        this.gridX = gridX;
        this.gridZ = gridZ;
        this.cellSize = cellSize || CONSTANTS.CELL_SIZE;
        this.entityType = 'altar';

        this.position = new THREE.Vector3(
            gridX * this.cellSize + this.cellSize / 2,
            0,
            gridZ * this.cellSize + this.cellSize / 2
        );
        this.isDead = false;
        this.isUsed = false;
        this.radius = 1.5; // Interaction radius

        // Visuals
        this.mesh = new THREE.Group();
        this.mesh.position.copy(this.position);

        // 1. Pedestal (Stone base)
        const baseGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.9, 12);
        const baseMat = new THREE.MeshStandardMaterial({
            color: 0x3e3a35,
            roughness: 0.9,
            metalness: 0.1
        });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 0.45;
        base.castShadow = true;
        base.receiveShadow = true;
        this.mesh.add(base);

        // 2. Crystal (Floating Octahedron)
        const crystalGeo = new THREE.OctahedronGeometry(0.18, 0);
        this.crystalMat = new THREE.MeshStandardMaterial({
            color: 0x9400d3, // Dark Violet
            emissive: 0x9400d3,
            emissiveIntensity: 0.6,
            roughness: 0.1,
            metalness: 0.9,
            transparent: true,
            opacity: 0.9
        });
        this.crystal = new THREE.Mesh(crystalGeo, this.crystalMat);
        this.crystal.position.y = 1.2;
        this.mesh.add(this.crystal);

        // 3. Purple Light
        this.light = new THREE.PointLight(0x9400d3, 1.2, 5);
        this.light.position.y = 1.2;
        this.mesh.add(this.light);

        this.floatOffset = Math.random() * Math.PI * 2;
    }

    update(dt, player) {
        if (this.isDead) return;

        // Floating & rotating animation (only if active)
        const time = performance.now() / 1000;
        if (!this.isUsed) {
            this.crystal.position.y = 1.2 + Math.sin(time * 2 + this.floatOffset) * 0.08;
            this.crystal.rotation.y += dt * 0.8;
            this.crystal.rotation.x += dt * 0.4;
        } else {
            // Sinks down slightly and stops rotating when deactivated
            this.crystal.position.y = THREE.MathUtils.lerp(this.crystal.position.y, 1.0, dt * 2);
            this.crystal.rotation.set(0, 0, 0);
        }

        // Distance Check for player interaction
        const dx = player.position.x - this.position.x;
        const dz = player.position.z - this.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < this.radius && !this.isUsed) {
            // Show prompt
            player.hudManager.showMessage("Pressez [E] pour communier avec l'Autel du Chaos", 100);

            // Check Key Press E
            if (player.input.keys['KeyE']) {
                player.input.keys['KeyE'] = false; // Consume key
                this.interact(player);
            }
        }
    }

    interact(player) {
        if (this.isUsed) return;

        soundManager.playPowerup();

        if (window.game) {
            window.game.showAltarMenu(this);
        }
    }

    deactivate() {
        this.isUsed = true;
        this.light.intensity = 0; // Turn off light

        // Grey out crystal
        this.crystalMat.color.setHex(0x555555);
        this.crystalMat.emissive.setHex(0x000000);
        this.crystalMat.emissiveIntensity = 0;
        this.crystalMat.roughness = 0.9;
        this.crystalMat.metalness = 0.1;
        this.crystalMat.opacity = 0.7;
    }
}
