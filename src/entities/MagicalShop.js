import * as THREE from 'three';
import { soundManager } from '../systems/SoundManager.js';
import { PALETTE, SHRINE_COLORS } from '../core/Palette.js';
import { Shrine, isSealed, shared } from './Shrine.js';

const materials = () => shared('shopMaterials', () => ({
    wood: new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.85 }),
    plank: new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x3b2a45, roughness: 0.95 }),
    gilt: new THREE.MeshStandardMaterial({ color: PALETTE.gilt, roughness: 0.35, metalness: 0.75 })
}));

const geometry = () => shared('shop', () => ({
    counter: new THREE.BoxGeometry(1.5, 0.85, 0.6),
    top: new THREE.BoxGeometry(1.65, 0.07, 0.72),
    trim: new THREE.BoxGeometry(1.52, 0.06, 0.62),
    post: new THREE.BoxGeometry(0.08, 2.0, 0.08),
    canopy: new THREE.BoxGeometry(1.85, 0.05, 1.05),
    fringe: new THREE.BoxGeometry(1.85, 0.08, 0.03),
    potion: new THREE.SphereGeometry(0.065, 10, 8),
    coins: new THREE.CylinderGeometry(0.1, 0.1, 0.1, 14),
    coinsLow: new THREE.CylinderGeometry(0.08, 0.08, 0.05, 14),
    chain: new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4),
    cageTop: new THREE.ConeGeometry(0.1, 0.08, 6),
    cageBottom: new THREE.CylinderGeometry(0.09, 0.07, 0.04, 6),
    flame: new THREE.SphereGeometry(0.075, 12, 10)
}));

// Mystic merchant: a wooden stall under a cloth awning, wares on the counter and a gilt lantern
export class MagicalShop {
    // `checkY` selects the floor the entity stands on (0, WALL_HEIGHT or 2 * WALL_HEIGHT)
    constructor(gridX, gridZ, levelManager, checkY = 0) {
        this.entityType = 'shop';
        this.position = levelManager.floorPositionAt(gridX, gridZ, checkY);
        this.isDead = false;
        this.isDisabled = false;
        this.radius = 1.8; // Interaction radius

        const s = this.shrine = new Shrine(this, levelManager, { color: SHRINE_COLORS.shop, lightY: 1.5, solidRadius: 0.9, solidHeight: 2.0 });
        const g = geometry();
        const m = materials();
        s.add(g.counter, m.wood, 0, 0.425, 0);
        s.add(g.top, m.plank, 0, 0.885, 0);
        s.add(g.trim, m.gilt, 0, 0.75, 0);
        // Awning kept under 2.1 m: the room's guardian floats just above it
        for (const side of [-1, 1]) s.add(g.post, m.wood, side * 0.76, 1.0, -0.26);
        s.add(g.canopy, m.cloth, 0, 1.95, 0.12).rotation.x = 0.22; // Front edge lower
        s.add(g.fringe, m.gilt, 0, 1.8, 0.63).rotation.x = 0.22;

        // Wares: three potions in the game's colours and two piles of coins
        [[PALETTE.ember, PALETTE.emberBright, -0.55, 0.08], [PALETTE.aether, PALETTE.aetherBright, -0.38, -0.06], [PALETTE.hex, PALETTE.hexBright, -0.22, 0.1]]
            .forEach(([color, glow, x, z]) => s.add(g.potion, s.glow(color, glow, 0.6), x, 0.985, z));
        s.add(g.coins, m.gilt, 0.4, 0.97, 0);
        s.add(g.coinsLow, m.gilt, 0.56, 0.945, 0.12);

        // Lantern hanging from the front of the awning, swinging
        this.lantern = new THREE.Group();
        this.lantern.position.set(0, 1.81, 0.55);
        s.body.add(this.lantern);
        s.add(g.chain, m.gilt, 0, -0.15, 0, this.lantern);
        s.add(g.cageTop, m.gilt, 0, -0.32, 0, this.lantern);
        s.add(g.flame, s.glow(PALETTE.gilt, PALETTE.giltBright, 1.8), 0, -0.43, 0, this.lantern);
        s.add(g.cageBottom, m.gilt, 0, -0.53, 0, this.lantern);

        this.swingOffset = Math.random() * Math.PI * 2;
    }

    update(dt, player) {
        this.shrine.update(dt);
        const time = performance.now() / 1000;
        this.lantern.rotation.z = Math.sin(time * 1.3 + this.swingOffset) * (this.isDisabled ? 0.03 : 0.08);

        if (!this.isDisabled && !isSealed(this, player, this.radius) && player.isNear(this.position, this.radius)) {
            player.hudManager.showMessage(player.input.prompt('commercer avec le marchand'));
            if (player.input.consumeKey('KeyE')) this.interact();
        }
    }

    interact() {
        soundManager.play('shopOpen');
        window.game.showShopMenu(this);
    }

    // Called when the shop menu closes: one visit per shop
    disable() {
        this.isDisabled = true;
        this.shrine.goOut();
    }

    dispose() {
        this.shrine.dispose();
    }
}
