import * as THREE from 'three';
import { soundManager } from '../systems/SoundManager.js';
import { PALETTE } from '../core/Palette.js';

const SHOP_LIGHT = 8;
const _lit = new THREE.Color(PALETTE.giltBright);
const _spent = new THREE.Color(0x646464);

export class MagicalShop {
    // `checkY` selects the floor the entity stands on (0, WALL_HEIGHT or 2 * WALL_HEIGHT)
    constructor(gridX, gridZ, levelManager, checkY = 0) {
        this.entityType = 'shop';
        this.position = levelManager.floorPositionAt(gridX, gridZ, checkY);
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
        this.mesh.add(table);

        // 2. Magic Floating Crystal (Shop sign)
        const crystalGeo = new THREE.IcosahedronGeometry(0.12, 1);
        this.crystalMat = new THREE.MeshStandardMaterial({
            color: PALETTE.gilt,
            emissive: PALETTE.giltBright,
            emissiveIntensity: 0.7,
            roughness: 0.1,
            metalness: 0.9
        });
        this.crystal = new THREE.Mesh(crystalGeo, this.crystalMat);
        this.crystal.position.y = 1.1;
        this.mesh.add(this.crystal);

        // 3. Blue Light Source
        this.light = new THREE.PointLight(PALETTE.giltBright, SHOP_LIGHT, 6);
        this.light.position.y = 1.1;
        this.mesh.add(this.light);

        this.floatOffset = Math.random() * Math.PI * 2;
    }

    update(dt, player) {
        if (this.isDying) {
            this.deathProgress += dt;
            const t = Math.min(1, this.deathProgress / 1.5); // 1.5 seconds transition
            
            // Dim light from 1.2 to 0.2 (so it remains faintly visible)
            this.light.intensity = SHOP_LIGHT * (1 - t * 0.85);
            
            // Dim emissive intensity
            this.crystalMat.emissiveIntensity = 0.7 * (1 - t) + 0.2 * t;
            
            // Interpolate color from DeepSkyBlue (0, 191, 255) to Grey (100, 100, 100)
            // Fades from gold to grey once the shop is used
            this.crystalMat.color.lerpColors(_lit, _spent, t);
            this.crystalMat.emissive.copy(this.crystalMat.color);
            this.light.color.copy(this.crystalMat.color);
            
            // It stays floating, but drops just slightly and spins slower
            const time = performance.now() / 1000;
            this.crystal.position.y = (1.1 - 0.1 * t) + Math.sin(time * 2 + this.floatOffset) * 0.06;
            this.crystal.rotation.y += (dt * 0.6) * (1 - t * 0.5); // Slows down to half speed

            if (t >= 1) {
                this.isDying = false;
                this.isDisabled = true; // DO NOT use isDead or EntityManager will delete the mesh!
            }
        } else if (!this.isDisabled) {
            // Visual rotation/floating
            const time = performance.now() / 1000;
            this.crystal.position.y = 1.1 + Math.sin(time * 2 + this.floatOffset) * 0.06;
            this.crystal.rotation.y += dt * 0.6;
        } else {
            // Disabled state: still floats and spins very slowly, but grey
            const time = performance.now() / 1000;
            this.crystal.position.y = 1.0 + Math.sin(time * 2 + this.floatOffset) * 0.06;
            this.crystal.rotation.y += dt * 0.3;
        }

        if (this.isDisabled || this.isDying) return;

        if (player.isNear(this.position, this.radius)) {
            player.hudManager.showMessage(player.input.prompt('commercer avec le marchand'));
            if (player.input.consumeKey('KeyE')) this.interact();
        }
    }

    interact() {
        soundManager.play('shopOpen');
        window.game.showShopMenu(this);
    }

    disable() {
        if (this.isDisabled || this.isDying) return;
        this.isDying = true;
        this.deathProgress = 0;
    }
}
