import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../core/Palette.js';
import { TextureGenerator } from '../systems/TextureGenerator.js';

// The player's staff: one design per tier of its own upgrades (Weapon.modelLevel). Built in the
// pose group's frame: the staff points down -z, from the grip (z ≈ 0) to the crystal at HEAD_Z.
export const HEAD_Z = -0.6;
const COLLAR_Z = -0.5;
const BUTT_Z = 0.95; // Behind the camera, never seen
const OAK = 0x4a3322;
const EBONY = 0x352838;
const FROST = 0x7fb0ff;
const VIEW_DEPTH = 0.02; // Share of the depth range the staff is drawn in (see inFront)
const MOTES = 28;

// Lowest first; the orb colours are the ones ART_DIRECTION.md (section 8) gives the staff
export const STAFF_TIERS = [
    { from: 0, orb: PALETTE.aetherBright, wood: OAK, claws: [3, 'gilt'] }, // Apprentice: gilt claws
    { from: 6, orb: PALETTE.sage, wood: OAK, claws: [3, 'root'], vine: true }, // Sap: wooden roots, leafy vine
    { from: 11, orb: FROST, wood: OAK, claws: [4, 'silver'], frost: true }, // Frost: ice cluster, orbiting shards
    { from: 16, orb: PALETTE.hex, wood: EBONY, horns: true, rings: 1 }, // Hex: horned crescent, rune ring
    { from: 21, orb: PALETTE.hexBright, wood: EBONY, horns: true, rings: 2 }, // Abyss: two rings in gyroscope
    { from: 26, orb: PALETTE.giltBright, wood: EBONY, claws: [6, 'gilt'], inlay: true, halo: true } // Sun: gilt crown and halo
];

export const staffTier = (totalLevel) => STAFF_TIERS.findLastIndex(t => totalLevel >= t.from);

// The staff floats ~1 m ahead of the eyes but the player keeps only 0.3 m from walls: drawn in the
// nearest sliver of the depth range, it stays in front of the world instead of sinking into walls.
function inFront(renderer) {
    renderer.getContext().depthRange(0, VIEW_DEPTH);
}
function restoreDepth(renderer) {
    renderer.getContext().depthRange(0, 1);
}
// Every part of a first-person model (staff, sword) is drawn that way
export function drawInFront(root) {
    root.traverse(obj => {
        if (obj.isMesh || obj.isSprite || obj.isPoints) {
            obj.onBeforeRender = inFront;
            obj.onAfterRender = restoreDepth;
        }
    });
}

class Helix extends THREE.Curve {
    constructor(radius, z0, z1, turns) {
        super();
        Object.assign(this, { radius, z0, z1, turns });
    }

    getPoint(u, target = new THREE.Vector3()) {
        const a = u * this.turns * Math.PI * 2;
        return target.set(Math.cos(a) * this.radius, Math.sin(a) * this.radius, this.z0 + (this.z1 - this.z0) * u);
    }
}

// Tube through `points` ([x, y, z]) whose radius shrinks from r0 to r1: claws, horns
export function taperedTube(points, r0, r1, segments = 12, sides = 5) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(curve, segments, 1, sides, false);
    const pos = g.attributes.position;
    const c = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i <= segments; i++) { // TubeGeometry lays its vertices out ring by ring
        curve.getPointAt(i / segments, c);
        const r = r0 + (r1 - r0) * (i / segments);
        for (let j = 0; j <= sides; j++) {
            const k = i * (sides + 1) + j;
            v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
            pos.setXYZ(k, v.x, v.y, v.z);
        }
    }
    return g;
}

// A primitive built along +y, laid along the staff (+y → -z) and centred at z
const alongStaff = (g, z) => g.rotateX(-Math.PI / 2).translate(0, 0, z);
// `count` copies of a part, spread evenly around the staff axis
export const around = (count, make, offset = 0) => Array.from({ length: count }, (_, i) => make().rotateZ(offset + i * Math.PI * 2 / count));

function shaft() {
    const g = new THREE.CylinderGeometry(0.02, 0.016, BUTT_Z - COLLAR_Z, 7, 18, true);
    // Knotty wood: the radius swells and shrinks along the shaft
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const a = Math.atan2(p.getZ(i), p.getX(i));
        const k = 1 + 0.09 * Math.sin(y * 37 + a * 2) + 0.05 * Math.sin(y * 13 - a * 3);
        p.setX(i, p.getX(i) * k);
        p.setZ(i, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    return alongStaff(g, (BUTT_Z + COLLAR_Z) / 2);
}

const band = (z, radius = 0.022) => new THREE.TorusGeometry(radius, 0.0035, 5, 16).translate(0, 0, z);

function claw(kind) {
    if (kind === 'root') { // Thicker and crooked
        return taperedTube([[0.019, 0, -0.49], [0.055, 0.012, -0.53], [0.074, -0.008, -0.59], [0.056, 0.01, -0.65], [0.024, 0, -0.685]], 0.011, 0.002);
    }
    return taperedTube([[0.019, 0, -0.49], [0.06, 0, -0.535], [0.07, 0, -0.6], [0.05, 0, -0.66], [0.022, 0, -0.685]], 0.007, 0.0015);
}

// One horn of the crescent: from the collar's side (s = ±1) round the crystal, the tip rising above it
const horn = (s) => taperedTube([[s * 0.02, 0, -0.49], [s * 0.07, 0.005, -0.53], [s * 0.1, 0.035, -0.6], [s * 0.092, 0.08, -0.65], [s * 0.08, 0.115, -0.67], [s * 0.088, 0.15, -0.68]], 0.014, 0.0015, 16, 6);

export const crystal = (size, length) => new THREE.OctahedronGeometry(size).scale(1, 1, length);

// Ring of runes: a thin torus studded with small cubes
export function runeRing(radius) {
    const studs = around(8, () => new THREE.BoxGeometry(0.009, 0.009, 0.009).translate(radius, 0, 0));
    return [new THREE.TorusGeometry(radius, 0.0035, 5, 48), ...studs];
}

// Sun halo: a ring with rays of alternating length
export function halo(radius) {
    const rays = Array.from({ length: 12 }, (_, i) => {
        const length = i % 2 ? 0.018 : 0.032;
        return new THREE.ConeGeometry(0.006, length, 4).translate(0, radius + length / 2, 0).rotateZ(i * Math.PI / 6);
    });
    return [new THREE.TorusGeometry(radius, 0.0035, 5, 56), ...rays];
}

export function merge(geometries) {
    const parts = geometries.map(g => {
        const flat = g.index ? g.toNonIndexed() : g;
        flat.deleteAttribute('uv');
        return flat;
    });
    const merged = mergeGeometries(parts);
    geometries.forEach(g => g.dispose());
    parts.forEach(g => g.dispose());
    return merged;
}

export const material = (color, roughness, metalness = 0, glow = 0) => new THREE.MeshStandardMaterial({
    color, roughness, metalness, emissive: glow ? color : 0x000000, emissiveIntensity: glow
});

/**
 * Builds the staff of a tier. Returns the group, the crystal (`orb`, whose material Weapon brightens
 * with the mana left and each shot), its halo sprite (`glow`), the mana `motes` (Points), and the parts that turn on their own
 * (`spinners`, rotated about z by `userData.spin` rad/s). Every material and geometry is the
 * staff's own: dispose them all when it is replaced.
 */
export function buildStaff(tier) {
    const t = STAFF_TIERS[tier];
    const group = new THREE.Group();
    const spinners = [];
    const mats = {
        wood: material(t.wood, 0.85),
        leather: material(0x2a1c14, 0.95),
        gilt: material(PALETTE.gilt, 0.35, 0.75),
        silver: material(0xa8b4c4, 0.35, 0.75),
        horn: material(0xb8ab90, 0.6), // Bone: a dark horn vanishes against the night
        vine: material(0x3d5a35, 0.9),
        leaf: material(PALETTE.sage, 0.7, 0, 0.25),
        magic: material(t.orb, 0.3, 0, 0.9) // Ice, runes, halo: the crystal's colour
    };
    mats.root = mats.wood;
    const parts = new Map(); // material -> static geometries, merged into one mesh each
    const add = (mat, ...geometries) => parts.set(mat, [...(parts.get(mat) || []), ...geometries]);
    const spinner = (mat, geometries, spin, tilt = null) => {
        const mesh = new THREE.Mesh(merge(geometries), mat);
        mesh.userData.spin = spin;
        spinners.push(mesh);
        const holder = new THREE.Group(); // Tilts the spin axis
        if (tilt) holder.rotation.set(tilt[0], tilt[1], 0);
        holder.position.z = HEAD_Z;
        holder.add(mesh);
        group.add(holder);
    };

    // Shaft, leather grip between two bands, gilt collar under the head
    add(mats.wood, shaft());
    add(mats.leather, alongStaff(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8, 1, true), 0.08));
    add(mats.gilt, band(-0.02, 0.026), band(0.18, 0.026), alongStaff(new THREE.CylinderGeometry(0.027, 0.021, 0.05, 10), COLLAR_Z), band(-0.47, 0.025));
    if (t.wood === EBONY) add(mats.gilt, band(-0.25), band(-0.38));

    if (t.claws) {
        const [count, kind] = t.claws;
        add(mats[kind], ...around(count, () => claw(kind), Math.PI / 2));
    }
    if (t.vine) {
        const vine = new Helix(0.026, 0.02, -0.49, 3.5);
        add(mats.vine, new THREE.TubeGeometry(vine, 80, 0.0045, 4));
        add(mats.leaf, ...Array.from({ length: 7 }, (_, i) => {
            const u = (i + 0.5) / 7;
            const p = vine.getPoint(u);
            return new THREE.SphereGeometry(1, 6, 4).scale(0.0035, 0.009, 0.018).rotateY(-0.5).translate(0.034, 0, 0)
                .rotateZ(Math.atan2(p.y, p.x)).translate(0, 0, p.z);
        }));
    }
    if (t.frost) {
        // Ice cluster on the collar, three shards orbiting the crystal
        add(mats.magic, ...around(5, () => crystal(0.008, 3).rotateY(-0.6).translate(0.024, 0, COLLAR_Z), 0.3));
        spinner(mats.magic, around(3, () => crystal(0.011, 3.4).translate(0.1, 0, 0)), 1.6);
    }
    if (t.horns) {
        add(mats.horn, horn(1), horn(-1));
        const tilts = [[1.1, 0], [0, 1.1]];
        for (let i = 0; i < t.rings; i++) spinner(mats.magic, runeRing(0.08 - i * 0.012), i ? -1.3 : 0.9, tilts[i]);
    }
    if (t.inlay) add(mats.gilt, new THREE.TubeGeometry(new Helix(0.021, 0.0, -0.48, 5), 120, 0.0028, 4));
    if (t.halo) {
        spinner(mats.magic, halo(0.105).map(g => g.translate(0, 0, -0.02)), 0.4);
        spinner(mats.magic, around(4, () => crystal(0.007, 1.6).translate(0.14, 0, 0)), -1.2);
    }

    for (const [mat, geometries] of parts) group.add(new THREE.Mesh(merge(geometries), mat));

    // The crystal, its facets catching the light as it turns
    const orbMat = material(t.orb, 0.25, 0.1, 1.4);
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.046, 0).scale(1, 1, 1.25), orbMat);
    orb.position.z = HEAD_Z;
    group.add(orb);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TextureGenerator.getGlowTexture(),
        color: t.orb,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false
    }));
    glow.position.z = HEAD_Z;
    glow.scale.setScalar(0.2);
    group.add(glow);
    // Mana motes, hidden at rest: Weapon draws them in to the crystal while it recharges, then bursts them
    // out. Their vertex colour is their brightness (additive: black adds nothing).
    const dynamic = () => new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const motes = new THREE.Points(
        new THREE.BufferGeometry().setAttribute('position', dynamic()).setAttribute('color', dynamic()),
        new THREE.PointsMaterial({
            map: TextureGenerator.getGlowTexture(),
            color: t.orb,
            size: 0.024,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        })
    );
    motes.visible = false;
    motes.frustumCulled = false; // Moved every frame: its bounding sphere would be stale
    group.add(motes);

    drawInFront(group);
    return { group, orb, glow, motes, spinners };
}
