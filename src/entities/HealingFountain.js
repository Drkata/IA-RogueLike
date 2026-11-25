import * as THREE from 'three';
import { soundManager } from '../systems/SoundManager.js';
import { TextureGenerator, seededRandom } from '../systems/TextureGenerator.js';
import { PALETTE, SHRINE_COLORS } from '../core/Palette.js';
import { Shrine, isSealed, shared, stoneMaterial } from './Shrine.js';

const ORB_Y = 1.62;

const geometry = () => shared('fountain', () => ({
    basin: new THREE.CylinderGeometry(1.0, 1.08, 0.5, 8),
    rim: new THREE.TorusGeometry(0.97, 0.07, 6, 8).rotateX(Math.PI / 2),
    pool: new THREE.CylinderGeometry(0.9, 0.9, 0.03, 8),
    column: new THREE.CylinderGeometry(0.12, 0.16, 0.8, 8),
    bowl: new THREE.CylinderGeometry(0.42, 0.18, 0.2, 8),
    bowlPool: new THREE.CylinderGeometry(0.38, 0.38, 0.02, 8),
    orb: new THREE.SphereGeometry(0.1, 16, 12),
    curtain: new THREE.CylinderGeometry(0.4, 0.8, 0.9, 16, 1, true) // Water falling from the bowl into the pool
}));

// Falling water: thin white streaks, scrolled down the curtain
function streaksTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 64, 64);
    const rng = seededRandom(7000);
    for (let i = 0; i < 40; i++) {
        const x = rng() * 64;
        const y = rng() * 64;
        const length = 10 + rng() * 30;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + rng() * 0.6})`;
        ctx.lineWidth = 1 + rng();
        for (const dy of [0, -64]) { // Wraps vertically
            ctx.beginPath();
            ctx.moveTo(x, y + dy);
            ctx.lineTo(x, y + dy + length);
            ctx.stroke();
        }
    }
    const texture = TextureGenerator.toTexture(canvas);
    texture.repeat.set(3, 1);
    return texture;
}

const curtainMaterial = () => shared('fountainCurtain', () => new THREE.MeshBasicMaterial({
    map: shared('streaks', streaksTexture),
    color: new THREE.Color(SHRINE_COLORS.fountain).multiplyScalar(0.5),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
}));

// Fountain of youth: an octagonal stone basin and a raised bowl pouring glowing water, an orb above
export class HealingFountain {
    // `checkY` selects the floor the entity stands on (0, WALL_HEIGHT or 2 * WALL_HEIGHT)
    constructor(gridX, gridZ, levelManager, checkY = 0) {
        this.entityType = 'fountain';
        this.position = levelManager.floorPositionAt(gridX, gridZ, checkY);
        this.isDead = false;
        this.isUsed = false;
        this.radius = 1.5; // Drinking radius: touching the basin is enough
        this.healAmount = 50;

        const s = this.shrine = new Shrine(this, levelManager, { color: SHRINE_COLORS.fountain, lightY: 0.9, solidRadius: 1.1, solidHeight: 1.7 });
        const g = geometry();
        const stone = stoneMaterial();
        const water = s.glow(PALETTE.aether, PALETTE.aetherBright, 0.8, { metalness: 0.6, roughness: 0.1 });
        s.add(g.basin, stone, 0, 0.25, 0);
        s.add(g.rim, stone, 0, 0.5, 0);
        s.add(g.pool, water, 0, 0.515, 0);
        s.add(g.column, stone, 0, 0.9, 0);
        s.add(g.bowl, stone, 0, 1.3, 0);
        s.add(g.bowlPool, water, 0, 1.405, 0);
        this.curtain = s.add(g.curtain, curtainMaterial(), 0, 0.95, 0);
        this.orb = s.add(g.orb, s.glow(PALETTE.aether, PALETTE.aetherBright, 1.6), 0, ORB_Y, 0, s.mesh);
    }

    update(dt, player) {
        if (this.isDead) return;
        this.shrine.update(dt);
        if (this.isUsed) return;

        const time = performance.now() / 1000;
        this.orb.position.y = ORB_Y + Math.sin(time * 1.7) * 0.06;
        this.curtain.material.map.offset.y = (time * 0.9) % 1; // Shared by every fountain: set, not added

        if (isSealed(this, player, this.radius + player.radius)) return;
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
        this.curtain.visible = false; // The water stops, the pools go murky
        this.shrine.goOut();
    }

    dispose() {
        this.shrine.dispose();
    }
}
