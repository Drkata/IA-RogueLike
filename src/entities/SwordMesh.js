import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../core/Palette.js';
import { TextureGenerator } from '../systems/TextureGenerator.js';
import { drawInFront } from './StaffMesh.js';

// The player's sword, built like the staff (StaffMesh.js): in the pose group's frame, the blade points
// down -z from the crossguard at z = 0, the grip and pommel behind it. A rune runs down the blade.
export const BLADE_MID_Z = -0.35;

const material = (color, roughness, metalness = 0, glow = 0) => new THREE.MeshStandardMaterial({
    color, roughness, metalness, emissive: glow ? color : 0x000000, emissiveIntensity: glow
});

// Lay a y-axis primitive along -z (its top forward), its base at `z0`
const alongBlade = (geometry, height, z0) => geometry.rotateX(-Math.PI / 2).translate(0, 0, z0 - height / 2);

const merge = (geometries) => mergeGeometries(geometries.map(g => {
    const flat = g.index ? g.toNonIndexed() : g;
    flat.deleteAttribute('uv');
    return flat;
}));

// A flat, diamond-section blade part: 4 sides, wide in x, thin in y
const bladePart = (rTop, rBottom, height, z0) =>
    alongBlade(new THREE.CylinderGeometry(rTop, rBottom, height, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.22), height, z0);

/** Returns the group, the rune `glow` sprite (flared on a parry) and its material, for Sword to animate. */
export function buildSword() {
    const mats = {
        steel: material(0xc9d0da, 0.3, 0.6, 0.06), // A little light of its own: a bare blade vanishes in the dark
        rune: material(PALETTE.aetherBright, 0.3, 0, 1.2),
        gilt: material(PALETTE.gilt, 0.35, 0.75),
        leather: material(0x2a1c14, 0.95)
    };
    const parts = [
        [mats.steel, [bladePart(0.024, 0.03, 0.62, -0.02), bladePart(0, 0.024, 0.12, -0.64)]],
        [mats.rune, [
            new THREE.BoxGeometry(0.007, 0.016, 0.46).translate(0, 0, -0.32), // Through both faces of the blade
            new THREE.IcosahedronGeometry(0.02, 0).scale(1, 1, 1.3).translate(0, 0, 0.16) // Pommel crystal
        ]],
        [mats.gilt, [
            new THREE.BoxGeometry(0.2, 0.022, 0.03),
            ...[-1, 1].map(s => new THREE.OctahedronGeometry(0.018).translate(s * 0.105, 0, -0.008)),
            ...[0.01, 0.13].map(z => alongBlade(new THREE.CylinderGeometry(0.021, 0.021, 0.014, 8), 0.014, z + 0.007).rotateY(0)),
            alongBlade(new THREE.CylinderGeometry(0.03, 0.022, 0.03, 6), 0.03, -0.0) // Ricasso collar
        ]],
        [mats.leather, [alongBlade(new THREE.CylinderGeometry(0.017, 0.019, 0.11, 8), 0.11, 0.125)]]
    ];
    const group = new THREE.Group();
    for (const [mat, geometries] of parts) group.add(new THREE.Mesh(merge(geometries), mat));

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TextureGenerator.getGlowTexture(),
        color: PALETTE.aetherBright,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0
    }));
    glow.position.z = BLADE_MID_Z;
    glow.scale.setScalar(0.5);
    group.add(glow);

    drawInFront(group);
    return { group, glow, rune: mats.rune };
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
