import * as THREE from 'three';
import { PALETTE } from '../core/Palette.js';
import { TextureGenerator } from '../systems/TextureGenerator.js';
import { around, crystal, drawInFront, halo, material, merge, runeRing, taperedTube } from './StaffMesh.js';

// The player's sword, built like the staff (StaffMesh.js): in the pose group's frame, the blade points
// down -z from the crossguard at z = 0, the grip and pommel behind it. A rune runs down the blade.
// One design per tier of the sword's own upgrades (Sword.getTotalLevel); within a tier, each reach level
// lengthens the blade and each damage level broadens it.
const STEEL = 0xc9d0da;
const DARK_STEEL = 0x7d6f91; // Blackened, yet light enough not to vanish in the dark
const FROST = 0x7fb0ff;
const OAK = 0x4a3322;
const LENGTH_PER_REACH = 0.03; // Share of the blade's length added by a reach level
const WIDTH_PER_DAMAGE = 0.03; // Share of its width added by a damage level

// Lowest first; the rune takes the staff's crystal colours, tier for tier (ART_DIRECTION.md, section 8)
export const SWORD_TIERS = [
    { from: 0, rune: PALETTE.aetherBright, steel: STEEL, metal: 'gilt', guard: 'bar' }, // Apprentice
    { from: 3, rune: PALETTE.sage, steel: STEEL, metal: 'gilt', guard: 'roots' }, // Sap: crooked root quillons in leaf
    { from: 7, rune: FROST, steel: STEEL, metal: 'silver', guard: 'bar', frost: true }, // Frost: ice on the guard, shards orbiting the blade
    { from: 12, rune: PALETTE.hex, steel: DARK_STEEL, metal: 'gilt', guard: 'horns', teeth: true }, // Hex: blackened toothed blade, bone horns
    { from: 18, rune: PALETTE.hexBright, steel: DARK_STEEL, metal: 'gilt', guard: 'horns', teeth: true, ring: true }, // Abyss: a rune ring wheels about the blade
    { from: 25, rune: PALETTE.giltBright, steel: STEEL, metal: 'gilt', guard: 'wings', inlay: true, halo: true } // Sun: winged guard, gilt inlay, halo
];

export const swordTier = (level) => SWORD_TIERS.findLastIndex(t => level >= t.from);

// Lay a y-axis primitive along -z (its top forward), its base at `z0`
const alongBlade = (geometry, height, z0) => geometry.rotateX(-Math.PI / 2).translate(0, 0, z0 - height / 2);

// A flat blade part, wide in x, thin in y: a squashed square, its edges at 0.71 × the radius from the axis
const bladePart = (rTop, rBottom, height, z0) =>
    alongBlade(new THREE.CylinderGeometry(rTop, rBottom, height, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.22), height, z0);

/**
 * Builds the sword of a tier, `reach` and `damage` being those upgrade levels. Returns the group, the rune
 * `glow` sprite (flared on a parry), the rune's material (also of the ice, ring and halo) and the parts that
 * turn on their own (`spinners`, rotated about z by `userData.spin` rad/s), for Sword to animate. Every
 * material and geometry is the sword's own: dispose them all when it is replaced.
 */
export function buildSword(tier = 0, reach = 0, damage = 0) {
    const t = SWORD_TIERS[tier];
    const length = 1 + LENGTH_PER_REACH * reach;
    const width = 1 + WIDTH_PER_DAMAGE * damage;
    const body = 0.62 * length; // From the guard to where the point starts
    const mid = -0.02 - 0.33 * length;
    const mats = {
        steel: material(t.steel, 0.3, 0.6, t.steel === STEEL ? 0.06 : 0.2), // A little light of its own: a bare blade vanishes in the dark
        rune: material(t.rune, 0.3, 0, 1.2),
        gilt: material(PALETTE.gilt, 0.35, 0.75),
        silver: material(0xa8b4c4, 0.35, 0.75),
        leather: material(0x2a1c14, 0.95),
        wood: material(OAK, 0.85),
        horn: material(0xb8ab90, 0.6) // Bone, as on the staff
    };
    const metal = mats[t.metal];
    const group = new THREE.Group();
    const spinners = [];
    const parts = new Map(); // material -> static geometries, merged into one mesh each
    const add = (mat, ...geometries) => parts.set(mat, [...(parts.get(mat) || []), ...geometries]);
    const spinner = (geometries, spin, z, tilt = 0) => {
        const mesh = new THREE.Mesh(merge(geometries), mats.rune);
        mesh.userData.spin = spin;
        spinners.push(mesh);
        const holder = new THREE.Group(); // Tilts the spin axis
        holder.rotation.x = tilt;
        holder.position.z = z;
        holder.add(mesh);
        group.add(holder);
    };
    const sides = [-1, 1];

    // Blade and point; the rune through both faces, a crystal in the pommel; bands, ricasso collar, leather grip
    add(mats.steel, bladePart(0.024 * width, 0.03 * width, body, -0.02), bladePart(0, 0.024 * width, 0.12 * length, -0.02 - body));
    add(mats.rune,
        new THREE.BoxGeometry(0.007, 0.016, 0.46 * length).translate(0, 0, -0.02 - 0.3 * length),
        new THREE.IcosahedronGeometry(0.02, 0).scale(1, 1, 1.3).translate(0, 0, 0.16));
    add(metal,
        ...[0.01, 0.13].map(z => alongBlade(new THREE.CylinderGeometry(0.021, 0.021, 0.014, 8), 0.014, z + 0.007)),
        alongBlade(new THREE.CylinderGeometry(0.03, 0.022, 0.03, 6), 0.03, 0));
    add(mats.leather, alongBlade(new THREE.CylinderGeometry(0.017, 0.019, 0.11, 8), 0.11, 0.125));

    if (t.guard === 'bar') {
        add(metal, new THREE.BoxGeometry(0.2, 0.022, 0.03), ...sides.map(s => new THREE.OctahedronGeometry(0.018).translate(s * 0.105, 0, -0.008)));
    } else if (t.guard === 'roots') { // A knot of wood whose roots droop toward the hand, two leaves on each
        add(mats.wood, new THREE.SphereGeometry(0.03, 7, 5).scale(1.2, 0.8, 0.7),
            ...sides.map(s => taperedTube([[s * 0.012, 0, 0], [s * 0.05, 0.008, -0.004], [s * 0.085, -0.006, 0.012], [s * 0.1, 0.004, 0.04], [s * 0.094, 0, 0.06]], 0.012, 0.002)));
        add(mats.rune, ...sides.flatMap(s => [[0.07, -0.016, 0.6], [0.1, 0.028, 1.3]].map(([x, z, turn]) =>
            new THREE.SphereGeometry(1, 6, 4).scale(0.009, 0.0035, 0.018).rotateY(s * turn).translate(s * x, 0, z))));
    } else if (t.guard === 'horns') { // A crescent of bone cradling the blade
        add(metal, new THREE.BoxGeometry(0.07, 0.024, 0.032));
        add(mats.horn, ...sides.map(s => taperedTube([[s * 0.03, 0, 0], [s * 0.075, 0, 0.004], [s * 0.11, 0, -0.02], [s * 0.115, 0, -0.065], [s * 0.095, 0, -0.11]], 0.013, 0.0015, 16, 6)));
    } else if (t.guard === 'wings') { // Three gilt feathers a side, swept toward the point
        add(metal, new THREE.BoxGeometry(0.07, 0.026, 0.034),
            ...sides.flatMap(s => [0, 1, 2].map(k => taperedTube([[s * 0.02, 0, 0], [s * (0.07 + 0.01 * k), 0, 0.004 - 0.012 * k], [s * (0.13 - 0.015 * k), 0, -0.025 - 0.035 * k]], 0.01, 0.0015, 10, 5))));
    }
    if (t.frost) {
        // Ice on the guard's ends and round the collar, three shards orbiting the blade
        add(mats.rune, ...sides.map(s => crystal(0.01, 3).rotateY(s * Math.PI / 2).translate(s * 0.13, 0, -0.008)),
            ...around(4, () => crystal(0.007, 3).rotateY(-0.5).translate(0.026, 0, -0.035), Math.PI / 4));
        spinner(around(3, () => crystal(0.009, 3.4).translate(0.07, 0, 0)), 1.6, mid);
    }
    if (t.teeth) {
        // Barbs along both edges, where the blade narrows toward the point
        add(mats.steel, ...sides.flatMap(s => Array.from({ length: 7 }, (_, i) => {
            const f = 0.15 + 0.11 * i; // Share of the body
            const edge = 0.707 * width * (0.03 - 0.006 * f);
            return new THREE.ConeGeometry(0.009, 0.026, 4).scale(0.35, 1, 1).rotateZ(-s * Math.PI / 2).translate(s * (edge + 0.009), 0, -0.02 - body * f);
        })));
    }
    if (t.ring) spinner(runeRing(0.055), 1.2, mid, 0.35);
    if (t.inlay) add(metal, ...sides.map(s => new THREE.BoxGeometry(0.0025, 0.014, 0.5 * length).translate(s * 0.011 * width, 0, -0.02 - 0.31 * length)));
    if (t.halo) spinner(halo(0.065), 0.5, -0.035);

    for (const [mat, geometries] of parts) group.add(new THREE.Mesh(merge(geometries), mat));

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TextureGenerator.getGlowTexture(),
        color: t.rune,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0
    }));
    glow.position.z = mid;
    glow.scale.setScalar(0.5);
    group.add(glow);

    drawInFront(group);
    return { group, glow, rune: mats.rune, spinners };
}

// The arc a swing sweeps, drawn just ahead of the eyes: a crescent of light, `arc` radians wide
export function buildSlash() {
    const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.66, 0.78, 32, 1, 0, 1),
        new THREE.MeshBasicMaterial({
            color: PALETTE.aetherBright,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    mesh.visible = false;
    drawInFront(mesh);
    return mesh;
}

// Blade wave of the Wave pact: a flat crescent bowed forward, for Projectile (its +z is the travel)
export const WAVE_GEOMETRY = new THREE.TorusGeometry(0.5, 0.04, 4, 16, Math.PI).rotateX(Math.PI / 2).scale(1, 0.6, 1);
