import * as THREE from 'three';
import { soundManager } from '../systems/SoundManager.js';
import { PALETTE } from '../core/Palette.js';

export class MagicAltar {
    // `checkY` selects the floor the entity stands on (0, WALL_HEIGHT or 2 * WALL_HEIGHT)
    constructor(gridX, gridZ, levelManager, checkY = 0) {
        this.entityType = 'altar';
        this.position = levelManager.floorPositionAt(gridX, gridZ, checkY);
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
        this.mesh.add(base);

        // 2. Crystal (Floating Octahedron)
        const crystalGeo = new THREE.OctahedronGeometry(0.18, 0);
        this.crystalMat = new THREE.MeshStandardMaterial({
            color: PALETTE.hex,
            emissive: PALETTE.hexBright,
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
        this.light = new THREE.PointLight(PALETTE.hexBright, 8, 6);
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

        if (!this.isUsed && player.isNear(this.position, this.radius)) {
            player.hudManager.showMessage(player.input.prompt("communier avec l'autel du Chaos"));
            if (player.input.consumeKey('KeyE')) this.interact();
        }
    }

    interact() {
        if (this.isUsed) return;
        soundManager.play('altar');
        window.game.showAltarMenu(this);
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
