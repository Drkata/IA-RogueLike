import * as THREE from 'three';
import { CONSTANTS } from '../core/Constants.js';
import { soundManager } from '../systems/SoundManager.js';

const SPIKE_HEIGHT = 1.2;
let shared = null; // Geometries/materials shared by every trap, created on first use

function getShared() {
    if (!shared) {
        const spikeGeo = new THREE.ConeGeometry(0.12, SPIKE_HEIGHT, 4);
        spikeGeo.translate(0, SPIKE_HEIGHT / 2, 0); // Origin at base
        shared = {
            plateGeo: new THREE.BoxGeometry(CONSTANTS.CELL_SIZE * 0.9, 0.05, CONSTANTS.CELL_SIZE * 0.9),
            plateMat: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.7 }),
            spikeGeo,
            spikeMat: new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.3, metalness: 0.9 })
        };
    }
    return shared;
}

export class SpikeTrap {
    // `checkY` selects the floor the entity stands on (0, WALL_HEIGHT or 2 * WALL_HEIGHT)
    constructor(gridX, gridZ, levelManager, checkY = 0) {
        this.entityType = 'trap';
        this.position = levelManager.floorPositionAt(gridX, gridZ, checkY);
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

        this.spikeHeight = SPIKE_HEIGHT;
        this.damage = 12;
        this.hasDamagedThisCycle = false;
        this.radius = 1.3; // Collision radius

        // Visuals
        this.mesh = new THREE.Group();
        this.mesh.position.copy(this.position);

        const { plateGeo, plateMat, spikeGeo, spikeMat } = getShared();

        // 1. Base Plate (flat metal plate on floor)
        const plate = new THREE.Mesh(plateGeo, plateMat);
        plate.position.y = 0.025;
        this.mesh.add(plate);

        // 2. Spikes Group (translates up/down)
        this.spikesMesh = new THREE.Group();
        this.spikesMesh.position.y = -this.spikeHeight; // Start retracted
        this.mesh.add(this.spikesMesh);

        // 3x3 grid of spikes on the plate
        const spacing = CONSTANTS.CELL_SIZE * 0.25;
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
                soundManager.play('spikes', this.position);
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

        // Collision logic whenever the spikes are out (cylindrical 3D overlap)
        const spikesAreUp = this.state !== 'retracted';
        if (spikesAreUp && !this.hasDamagedThisCycle) {
            const dx = player.position.x - this.position.x;
            const dz = player.position.z - this.position.z;
            const distSq = dx * dx + dz * dz;
            const minDist = this.radius + player.radius;

            if (distSq < minDist * minDist) {
                // Check vertical Y overlap between player [feetY, headY] and spikes [trapY, trapY + spikeHeight]
                const playerMinY = player.position.y - 1.6;
                const playerMaxY = player.position.y;
                const trapMinY = this.position.y;
                const trapMaxY = this.position.y + this.spikeHeight;

                const verticalOverlap = Math.max(trapMinY, playerMinY) <= Math.min(trapMaxY, playerMaxY);

                if (verticalOverlap) {
                    // Damage Player
                    player.takeDamage(this.damage, 'Spike Trap');
                    player.applySlow(0.4, 2.0); // 40% slow for 2 seconds
                    this.hasDamagedThisCycle = true;
                }
            }
        }
    }
}
