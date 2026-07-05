import * as THREE from 'three';
import { CONSTANTS } from '../core/Constants.js';
import { soundManager } from '../systems/SoundManager.js';

export class HealingFountain {
    constructor(gridX, gridZ, cellSize) {
        this.gridX = gridX;
        this.gridZ = gridZ;
        this.cellSize = cellSize || CONSTANTS.CELL_SIZE;
        this.entityType = 'fountain';

        this.position = new THREE.Vector3(
            gridX * this.cellSize + this.cellSize / 2,
            0,
            gridZ * this.cellSize + this.cellSize / 2
        );
        this.isDead = false;
        this.isUsed = false;
        this.radius = 1.0; // Collision/trigger radius
        this.healAmount = 50;

        // Visuals
        this.mesh = new THREE.Group();
        this.mesh.position.copy(this.position);

        // 1. Stone Basin (cylinder container)
        const basinGeo = new THREE.CylinderGeometry(0.4, 0.45, 0.5, 12);
        const basinMat = new THREE.MeshStandardMaterial({
            color: 0x5a554a,
            roughness: 0.9,
            metalness: 0.1
        });
        const basin = new THREE.Mesh(basinGeo, basinMat);
        basin.position.y = 0.25;
        basin.castShadow = true;
        basin.receiveShadow = true;
        this.mesh.add(basin);

        // 2. Glowing Pool Water (flat cylinder inside basin)
        const waterGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.02, 12);
        this.waterMat = new THREE.MeshStandardMaterial({
            color: 0x00ff66,
            emissive: 0x00ff66,
            emissiveIntensity: 0.8,
            roughness: 0.1,
            metalness: 0.8,
            transparent: true,
            opacity: 0.85
        });
        this.water = new THREE.Mesh(waterGeo, this.waterMat);
        this.water.position.y = 0.48; // Near top edge
        this.mesh.add(this.water);

        // 3. Green Light Source
        this.light = new THREE.PointLight(0x00ff66, 1.2, 4);
        this.light.position.y = 0.6;
        this.mesh.add(this.light);
    }

    update(dt, player) {
        if (this.isDead || this.isUsed) return;

        // Collision Check (contact with player)
        const dx = player.position.x - this.position.x;
        const dz = player.position.z - this.position.z;
        const distSq = dx * dx + dz * dz;
        const triggerDist = this.radius + player.radius;

        if (distSq < triggerDist * triggerDist) {
            // Apply healing if player is alive and needs health
            if (player.health < player.maxHealth) {
                this.use(player);
            } else {
                // Show message that player is already full health
                player.hudManager.showMessage("Vie déjà au maximum !", 100);
            }
        }
    }

    use(player) {
        this.isUsed = true;
        player.heal(this.healAmount);
        soundManager.playPowerup();
        player.hudManager.showMessage("Fontaine de Jouvence active : +50 PV !");

        // Deactivate visuals (water turns murky, light turns off)
        this.light.intensity = 0;
        this.waterMat.color.setHex(0x3e4a3e);
        this.waterMat.emissive.setHex(0x000000);
        this.waterMat.emissiveIntensity = 0;
        this.waterMat.roughness = 0.9;
        this.waterMat.metalness = 0.1;
    }
}
