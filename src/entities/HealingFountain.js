import * as THREE from 'three';
import { soundManager } from '../systems/SoundManager.js';
import { PALETTE } from '../core/Palette.js';

export class HealingFountain {
    // `checkY` selects the floor the entity stands on (0, WALL_HEIGHT or 2 * WALL_HEIGHT)
    constructor(gridX, gridZ, levelManager, checkY = 0) {
        this.entityType = 'fountain';
        this.position = levelManager.floorPositionAt(gridX, gridZ, checkY);
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
        this.mesh.add(basin);

        // 2. Glowing Pool Water (flat cylinder inside basin)
        const waterGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.02, 12);
        this.waterMat = new THREE.MeshStandardMaterial({
            color: PALETTE.aether,
            emissive: PALETTE.aetherBright,
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
        this.light = new THREE.PointLight(PALETTE.aetherBright, 8, 6);
        this.light.position.y = 0.6;
        this.mesh.add(this.light);
    }

    update(dt, player) {
        if (this.isDead || this.isUsed) return;

        if (!player.isNear(this.position, this.radius + player.radius)) return;
        if (player.health < player.maxHealth) {
            this.use(player);
        } else {
            player.hudManager.showMessage("Votre vie est déjà au maximum");
        }
    }

    use(player) {
        this.isUsed = true;
        player.heal(this.healAmount);
        soundManager.play('fountain');
        player.hudManager.showMessage("Fontaine de jouvence : +50 PV");

        // Deactivate visuals (water turns murky, light turns off)
        this.light.intensity = 0;
        this.waterMat.color.setHex(0x3e4a3e);
        this.waterMat.emissive.setHex(0x000000);
        this.waterMat.emissiveIntensity = 0;
        this.waterMat.roughness = 0.9;
        this.waterMat.metalness = 0.1;
    }
}
