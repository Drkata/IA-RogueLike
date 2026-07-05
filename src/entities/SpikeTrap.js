import * as THREE from 'three';
import { CONSTANTS } from '../core/Constants.js';
import { soundManager } from '../systems/SoundManager.js';

export class SpikeTrap {
    constructor(gridX, gridZ, cellSize) {
        this.gridX = gridX;
        this.gridZ = gridZ;
        this.cellSize = cellSize || CONSTANTS.CELL_SIZE;
        this.entityType = 'trap';

        this.position = new THREE.Vector3(
            gridX * this.cellSize + this.cellSize / 2,
            0,
            gridZ * this.cellSize + this.cellSize / 2
        );
        this.isDead = false;

        // Trap States: 'retracted', 'extending', 'extended', 'retracting'
        this.state = 'retracted';
        this.timer = Math.random() * 1.5; // Stagger start times
        this.stateDurations = {
            retracted: 2.0,
            extending: 0.2,
            extended: 1.5,
            retracting: 0.2
        };

        this.spikeHeight = 1.2;
        this.damage = 12;
        this.hasDamagedThisCycle = false;
        this.radius = 1.3; // Collision radius

        // Visuals
        this.mesh = new THREE.Group();
        this.mesh.position.copy(this.position);

        // 1. Base Plate (flat metal plate on floor)
        const plateGeo = new THREE.BoxGeometry(this.cellSize * 0.9, 0.05, this.cellSize * 0.9);
        const plateMat = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            roughness: 0.6,
            metalness: 0.7
        });
        const plate = new THREE.Mesh(plateGeo, plateMat);
        plate.position.y = 0.025;
        this.mesh.add(plate);

        // 2. Spikes Group (translates up/down)
        this.spikesMesh = new THREE.Group();
        this.spikesMesh.position.y = -this.spikeHeight; // Start retracted
        this.mesh.add(this.spikesMesh);

        // Populate spikes (grid of cones)
        const spikeGeo = new THREE.ConeGeometry(0.12, this.spikeHeight, 4);
        spikeGeo.translate(0, this.spikeHeight / 2, 0); // Origin at base
        const spikeMat = new THREE.MeshStandardMaterial({
            color: 0x999999,
            roughness: 0.3,
            metalness: 0.9
        });

        // 3x3 grid of spikes on the plate
        const spacing = this.cellSize * 0.25;
        for (let xOffset = -1; xOffset <= 1; xOffset++) {
            for (let zOffset = -1; zOffset <= 1; zOffset++) {
                const spike = new THREE.Mesh(spikeGeo, spikeMat);
                spike.position.set(xOffset * spacing, 0, zOffset * spacing);
                this.spikesMesh.add(spike);
            }
        }
    }

    update(dt, player) {
        if (this.isDead) return;

        this.timer += dt;
        const currentLimit = this.stateDurations[this.state];

        if (this.timer >= currentLimit) {
            this.timer = 0;
            // Transition state
            if (this.state === 'retracted') {
                this.state = 'extending';
                this.hasDamagedThisCycle = false; // Reset damage limit for next active cycle
            } else if (this.state === 'extending') {
                this.state = 'extended';
            } else if (this.state === 'extended') {
                this.state = 'retracting';
            } else if (this.state === 'retracting') {
                this.state = 'retracted';
            }
        }

        // Animate Spike Position based on state
        const progress = this.timer / this.stateDurations[this.state];
        if (this.state === 'retracted') {
            this.spikesMesh.position.y = -this.spikeHeight;
        } else if (this.state === 'extending') {
            this.spikesMesh.position.y = THREE.MathUtils.lerp(-this.spikeHeight, 0.05, progress);
        } else if (this.state === 'extended') {
            this.spikesMesh.position.y = 0.05;
        } else if (this.state === 'retracting') {
            this.spikesMesh.position.y = THREE.MathUtils.lerp(0.05, -this.spikeHeight, progress);
        }

        // Collision logic when extended/extending
        const spikesAreUp = (this.state === 'extended' || this.state === 'extending' || this.state === 'retracting');
        if (spikesAreUp && !this.hasDamagedThisCycle) {
            const dx = player.position.x - this.position.x;
            const dz = player.position.z - this.position.z;
            const distSq = dx * dx + dz * dz;
            const minDist = this.radius + player.radius;

            if (distSq < minDist * minDist) {
                // Damage Player
                player.takeDamage(this.damage);
                player.applySlow(0.4, 2.0); // 40% slow for 2 seconds
                this.hasDamagedThisCycle = true;
                soundManager.playPlayerHit();
            }
        }
    }
}
