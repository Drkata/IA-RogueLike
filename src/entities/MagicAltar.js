import * as THREE from 'three';
import { soundManager } from '../systems/SoundManager.js';
import { PALETTE, SHRINE_COLORS } from '../core/Palette.js';
import { Shrine, isSealed, shared, stoneMaterial } from './Shrine.js';

const CRYSTAL_Y = 1.65; // Floating height of the crystal
const CRYSTAL_REST_Y = 1.42; // On the slab, once the altar is spent

const geometry = () => shared('altar', () => ({
    step1: new THREE.CylinderGeometry(1.0, 1.05, 0.12, 8),
    step2: new THREE.CylinderGeometry(0.8, 0.84, 0.12, 8),
    block: new THREE.BoxGeometry(1.0, 0.7, 0.6),
    slab: new THREE.BoxGeometry(1.2, 0.1, 0.75),
    inlay: new THREE.BoxGeometry(0.72, 0.07, 0.62), // Rune band, just proud of the block's faces
    horn: new THREE.ConeGeometry(0.08, 0.6, 6),
    crystal: new THREE.OctahedronGeometry(0.22).scale(1, 1.7, 1),
    shard: new THREE.OctahedronGeometry(0.07).scale(1, 1.6, 1),
    ring: new THREE.TorusGeometry(0.5, 0.015, 6, 48)
}));

// Altar of Chaos: a horned stone altar on two steps, a crystal floating over it in a ring of runes
export class MagicAltar {
    // `checkY` selects the floor the entity stands on (0, WALL_HEIGHT or 2 * WALL_HEIGHT)
    constructor(gridX, gridZ, levelManager, checkY = 0) {
        this.entityType = 'altar';
        this.position = levelManager.floorPositionAt(gridX, gridZ, checkY);
        this.isDead = false;
        this.isUsed = false;
        this.radius = 1.7; // Interaction radius

        const s = this.shrine = new Shrine(this, levelManager, { color: SHRINE_COLORS.altar, lightY: CRYSTAL_Y, solidRadius: 0.95, solidHeight: 1.1 });
        const g = geometry();
        const stone = stoneMaterial();
        s.add(g.step1, stone, 0, 0.06, 0);
        s.add(g.step2, stone, 0, 0.18, 0);
        s.add(g.block, stone, 0, 0.59, 0);
        s.add(g.slab, stone, 0, 0.99, 0);
        s.add(g.inlay, s.glow(PALETTE.hex, PALETTE.hexBright, 1.4), 0, 0.72, 0);
        for (const side of [-1, 1]) s.add(g.horn, stone, side * 0.48, 1.34, -0.22).rotation.z = -side * 0.35;

        this.crystalMat = s.glow(PALETTE.hex, PALETTE.hexBright, 0.9, { metalness: 0.6 });
        this.crystal = s.add(g.crystal, this.crystalMat, 0, CRYSTAL_Y, 0, s.mesh);
        this.shards = new THREE.Group();
        this.shards.position.y = CRYSTAL_Y;
        s.mesh.add(this.shards);
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            s.add(g.shard, this.crystalMat, Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42, this.shards);
        }
        this.ring = s.add(g.ring, s.glow(PALETTE.hex, PALETTE.hexBright, 1.6), 0, CRYSTAL_Y, 0, s.mesh);
        this.ring.rotation.x = 1.25;

        this.floatOffset = Math.random() * Math.PI * 2;
    }

    update(dt, player) {
        if (this.isDead) return;
        this.shrine.update(dt);

        if (!this.isUsed) {
            const time = performance.now() / 1000;
            this.crystal.position.y = CRYSTAL_Y + Math.sin(time * 2 + this.floatOffset) * 0.08;
            this.crystal.rotation.y += dt * 0.8;
            this.shards.rotation.y -= dt * 1.2;
            this.ring.rotation.z += dt * 0.6;
        } else {
            // Spent: the crystal settles on the slab
            this.crystal.position.y = THREE.MathUtils.lerp(this.crystal.position.y, CRYSTAL_REST_Y, dt * 2);
        }

        if (!this.isUsed && !isSealed(this, player, this.radius) && player.isNear(this.position, this.radius)) {
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
        this.shrine.goOut();
    }

    dispose() {
        this.shrine.dispose();
    }
}
