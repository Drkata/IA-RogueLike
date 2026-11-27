import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../core/Palette.js';
import { TextureGenerator, ENEMY_CELLS } from '../systems/TextureGenerator.js';
import { ThemeManager } from '../systems/themes/ThemeManager.js';
import { taperedTube } from './StaffMesh.js';

// Enemies: one faction per biome, same behaviour, their own body (ART_DIRECTION.md, section 8). Every model is one
// geometry whose vertices each belong to a body part; the vertex shader swings the parts about their joints from
// four numbers per enemy (Enemy.anim: walk phase, walk amount, cast, hurt), so every enemy of a model is drawn in
// a single instanced call (EntityManager.batch). Feet at y = 0, facing +z; the right arm (-x) casts.
export const PART = { TORSO: 0, HEAD: 1, ARM_L: 2, ARM_R: 3, LEG_L: 4, LEG_R: 5, CAPE: 6 };
const EYE_GLOW = 3; // Eyes shine brightest: an enemy is read by its gaze first (ART_DIRECTION.md, rule 5)
const EYES = [PALETTE.emberBright, PALETTE.emberBright, PALETTE.hexBright]; // By tier: the elites' eyes are hex
const themes = new ThemeManager();

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// Primitives (y up, centred): parts are placed with Rig.add
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (top, bottom, h, sides = 8) => new THREE.CylinderGeometry(top, bottom, h, sides);
const ball = (r, w = 10, h = 7) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, sides = 6) => new THREE.ConeGeometry(r, h, sides);
const gem = (r, length) => new THREE.OctahedronGeometry(r).scale(1, length, 1);
const rock = (r, detail = 0) => new THREE.IcosahedronGeometry(r, detail);
const tube = (points, r0, r1, segments = 10, sides = 5) => taperedTube(points, r0, r1, segments, sides);

// One model's parts, merged by build(). Each part belongs to a body part (PART) that turns about its joint, takes
// the cell of the biome's atlas named `cell`, and shines with `glow` (a colour) if given.
class Rig {
    constructor(biome, joints) {
        this.cells = Object.keys(ENEMY_CELLS[biome]);
        this.joints = joints;
        this.parts = [];
    }

    add(geometry, part, cell, { at = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], glow = null, strength = 1 } = {}) {
        const g = geometry.index ? geometry.toNonIndexed() : geometry;
        if (g !== geometry) geometry.dispose();
        g.applyMatrix4(_m.compose(_v.set(...at), _q.setFromEuler(_e.set(...rot)), _s.set(...scale)));

        // The part's UVs squeezed into its cell, 2 px in from the edges (the canvas's top row is v = 1)
        const n = this.cells.indexOf(cell);
        if (n < 0) throw new Error(`no atlas cell ${cell}`);
        const col = n % 4;
        const row = Math.floor(n / 4);
        const inset = 2 / 128;
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) {
            const u = THREE.MathUtils.clamp(uv.getX(i), 0, 1);
            const v = THREE.MathUtils.clamp(uv.getY(i), 0, 1);
            uv.setXY(i, (col + inset + u * (1 - 2 * inset)) / 4, (3 - row + inset + v * (1 - 2 * inset)) / 4);
        }

        const count = g.attributes.position.count;
        const fill = (size, values) => {
            const array = new Float32Array(count * size);
            for (let i = 0; i < count; i++) array.set(values, i * size);
            return new THREE.BufferAttribute(array, size);
        };
        _c.set(glow ?? 0x000000).multiplyScalar(glow === null ? 0 : strength);
        g.setAttribute('aPart', fill(1, [part]));
        g.setAttribute('aPivot', fill(3, this.joints[part]));
        g.setAttribute('aGlow', fill(3, [_c.r, _c.g, _c.b]));
        this.parts.push(g);
    }

    // Two glowing eyes on the head, `x` from the middle
    eyes(x, y, z, color, size = 0.06) {
        for (const s of [-1, 1]) this.add(box(size, size * 0.55, 0.03), PART.HEAD, 'dark', { at: [s * x, y, z], glow: color, strength: EYE_GLOW });
    }

    build() {
        const geometry = mergeGeometries(this.parts);
        this.parts.forEach(g => g.dispose());
        geometry.computeBoundingSphere();
        return geometry;
    }
}

// Joints of a skeleton: hips at `hip`, shoulders `shoulder` = [x, y] apart, legs `leg` from the middle
const joints = ({ hip, neck, shoulder: [sx, sy], leg }) => ({
    [PART.TORSO]: [0, hip, 0],
    [PART.HEAD]: [0, neck, 0],
    [PART.ARM_L]: [sx, sy, 0],
    [PART.ARM_R]: [-sx, sy, 0],
    [PART.LEG_L]: [leg, hip, 0],
    [PART.LEG_R]: [-leg, hip, 0],
    [PART.CAPE]: [0, sy, -0.18]
});
const SIDES = [[PART.ARM_L, PART.LEG_L, 1], [PART.ARM_R, PART.LEG_R, -1]];

// Each faction: its skeleton, and build(rig, tier, variant). Tier 0 the first time through the biome, 1 armoured
// (second time), 2 elite (third time and on); variant 0 or 1 changes a detail of the silhouette.
const FACTIONS = {
    // Forest: a sylvan of bark and moss, antlered, a staff tipped with an ember
    forest: {
        skeleton: { hip: 0.9, neck: 1.58, shoulder: [0.3, 1.5], leg: 0.12 },
        build(r, tier, variant, eye) {
            for (const [arm, leg, s] of SIDES) {
                r.add(cyl(0.075, 0.055, 0.82, 7), leg, 'bark', { at: [s * 0.12, 0.47, 0] });
                r.add(cone(0.07, 0.24, 5), leg, 'bark', { at: [s * 0.13, 0.06, 0.09], rot: [Math.PI / 2 + 0.25, 0, 0] });
                r.add(cyl(0.065, 0.045, 0.72, 6), arm, 'bark', { at: [s * 0.3, 1.14, 0] });
                for (let f = -1; f <= 1; f++) r.add(cone(0.018, 0.13, 4), arm, 'bark', { at: [s * 0.3 + f * 0.025, 0.72, 0.01], rot: [Math.PI, 0, 0] });
            }
            // Trunk widening to the shoulders, a mossy mantle, a skirt of leaves
            r.add(cyl(0.24, 0.16, 0.66, 7), PART.TORSO, 'bark', { at: [0, 1.2, 0] });
            r.add(ball(0.3, 9, 6), PART.TORSO, 'moss', { at: [0, 1.49, -0.02], scale: [1.15, variant ? 0.55 : 0.42, 0.85] });
            r.add(cyl(0.17, 0.3, 0.42, 8), PART.TORSO, 'leaves', { at: [0, 0.86, 0] });
            // Long bark mask, dark sockets, antlers
            r.add(cyl(0.1, 0.12, 0.3, 6), PART.HEAD, 'bark', { at: [0, 1.74, 0.01] });
            r.add(box(0.17, 0.06, 0.04), PART.HEAD, 'dark', { at: [0, 1.78, 0.1] });
            r.eyes(0.045, 1.78, 0.125, eye);
            // Antlers, a quarter larger on the elites; variant 1 spreads them wide
            const reach = tier >= 2 ? 1.25 : 1;
            const antler = (points, r0, r1, ...rest) => r.add(tube(points.map(([x, y, z]) => [x * reach, 1.86 + (y - 1.86) * reach, z]), r0, r1, ...rest), PART.HEAD, 'antler');
            for (const s of [-1, 1]) {
                antler([[s * 0.06, 1.86, 0], [s * 0.15, 1.97, 0.02], [s * 0.21, 2.08, -0.02], variant ? [s * 0.3, 2.06, -0.06] : [s * 0.23, 2.24, 0]], 0.028, 0.008);
                antler([[s * 0.16, 1.99, 0.02], [s * 0.11, 2.1, 0.07]], 0.016, 0.006, 6, 4);
                if (tier >= 2) antler([[s * 0.2, 2.06, -0.02], [s * 0.3, 2.14, 0.04]], 0.014, 0.005, 6, 4);
            }
            // The staff runs along the right arm and past the hand: raised, it points at the player
            r.add(cyl(0.022, 0.026, 0.95, 6), PART.ARM_R, 'wood', { at: [-0.3, 0.88, 0.05] });
            r.add(ball(0.05, 8, 6), PART.ARM_R, 'dark', { at: [-0.3, 0.4, 0.05], glow: PALETTE.ember, strength: 1.8 });
            if (tier >= 1) { // Armour: bark pauldrons, a slab of stone on the chest
                for (const s of [-1, 1]) r.add(ball(0.13, 8, 5), PART.TORSO, 'bark', { at: [s * 0.29, 1.53, 0], scale: [1.15, 0.65, 1] });
                r.add(box(0.3, 0.3, 0.08), PART.TORSO, 'stone', { at: [0, 1.27, 0.17], rot: [0.08, 0, 0] });
            }
            if (tier >= 2) { // Elite: a mossy cloak and a glowing rune
                r.add(box(0.5, 1.05, 0.04), PART.CAPE, 'moss', { at: [0, 0.98, -0.2] });
                r.add(ball(0.05, 6, 4), PART.TORSO, 'dark', { at: [0, 1.28, 0.22], scale: [1, 1, 0.3], glow: PALETTE.hexBright, strength: 1.6 });
            }
        }
    },

    // City: a cultist in a robe and hood, a pale mask, a wand
    city: {
        skeleton: { hip: 0.9, neck: 1.56, shoulder: [0.26, 1.47], leg: 0.1 },
        build(r, tier, variant, eye) {
            const robe = variant ? 'slate' : 'robe';
            const trim = variant ? 'robe' : 'slate';
            for (const [arm, leg, s] of SIDES) {
                r.add(cyl(0.06, 0.055, 0.85, 6), leg, 'leather', { at: [s * 0.1, 0.46, 0] });
                r.add(box(0.1, 0.08, 0.2), leg, 'leather', { at: [s * 0.1, 0.04, 0.04] });
                r.add(cyl(0.05, 0.09, 0.6, 8), arm, robe, { at: [s * 0.26, 1.17, 0] });
                r.add(ball(0.045, 6, 5), arm, 'mask', { at: [s * 0.26, 0.82, 0] });
            }
            // Robe flaring to the shins, a gilt belt, a stole
            r.add(cyl(0.2, 0.18, 0.62, 10), PART.TORSO, robe, { at: [0, 1.18, 0] });
            r.add(cyl(0.2, 0.36, 0.7, 10), PART.TORSO, robe, { at: [0, 0.6, 0] });
            r.add(cyl(0.205, 0.205, 0.06, 10), PART.TORSO, 'gilt', { at: [0, 0.93, 0] });
            for (const s of [-1, 1]) r.add(box(0.06, 0.5, 0.02), PART.TORSO, trim, { at: [s * 0.07, 1.2, 0.195] });
            // Deep hood, a pale mask
            if (tier < 2) r.add(cone(0.19, variant ? 0.34 : 0.46, 8), PART.HEAD, robe, { at: [0, 1.82, -0.04], rot: [-0.18, 0, 0] });
            r.add(ball(0.17, 9, 7), PART.HEAD, robe, { at: [0, 1.68, -0.02], scale: [1, 1.1, 1] });
            r.add(ball(0.13, 8, 6), PART.HEAD, 'dark', { at: [0, 1.67, 0.05], scale: [1, 1.15, 0.6] });
            r.add(box(0.13, 0.17, 0.035), PART.HEAD, 'mask', { at: [0, 1.66, 0.13] });
            r.eyes(0.035, 1.69, 0.15, eye, 0.045);
            // Wand in the right hand, a burning gem at its tip
            r.add(cyl(0.015, 0.02, 0.45, 5), PART.ARM_R, 'wood', { at: [-0.26, 0.66, 0.02] });
            r.add(gem(0.035, 1.6), PART.ARM_R, 'gilt', { at: [-0.26, 0.42, 0.02], glow: PALETTE.ember, strength: 1.8 });
            if (tier >= 1) { // Armour: plate pauldrons, a gorget, a breastplate
                for (const s of [-1, 1]) r.add(box(0.2, 0.08, 0.24), PART.TORSO, 'metal', { at: [s * 0.25, 1.5, 0], rot: [0, 0, s * -0.35] });
                r.add(cyl(0.13, 0.17, 0.08, 10), PART.TORSO, 'metal', { at: [0, 1.53, 0] });
                r.add(box(0.3, 0.32, 0.06), PART.TORSO, 'metal', { at: [0, 1.25, 0.18] });
            }
            if (tier >= 2) { // Elite: a mitre, a long cape, a glowing sigil
                r.add(cyl(0.07, 0.14, 0.34, 4), PART.HEAD, 'gilt', { at: [0, 1.92, -0.02], rot: [0, Math.PI / 4, 0] });
                r.add(box(0.48, 1.25, 0.04), PART.CAPE, trim, { at: [0, 0.86, -0.2] });
                r.add(gem(0.05, 1), PART.TORSO, 'dark', { at: [0, 1.25, 0.22], glow: PALETTE.hexBright, strength: 1.6 });
            }
        }
    },

    // Cave: a hunched gangue of rock, crystals growing from its back, one clutched in its fist
    cave: {
        skeleton: { hip: 0.8, neck: 1.45, shoulder: [0.4, 1.42], leg: 0.16 },
        build(r, tier, variant, eye) {
            const shard = tier >= 2 ? 'amethyst' : 'crystal';
            for (const [arm, leg, s] of SIDES) {
                r.add(cyl(0.11, 0.09, 0.75, 7), leg, 'rock', { at: [s * 0.16, 0.42, 0] });
                r.add(ball(0.13, 7, 5), leg, 'rock', { at: [s * 0.16, 0.07, 0.05], scale: [1, 0.6, 1.3] });
                r.add(cyl(0.1, 0.09, 0.45, 7), arm, 'rock', { at: [s * 0.4, 1.2, 0] });
                r.add(cyl(0.11, 0.14, 0.4, 7), arm, 'deep', { at: [s * 0.4, 0.8, 0.02] });
                r.add(rock(0.13), arm, 'rock', { at: [s * 0.4, 0.54, 0.03] });
            }
            // Boulder of a body, hunched forward, crystals on the back and shoulders
            r.add(rock(0.42, 1), PART.TORSO, 'rock', { at: [0, 1.2, -0.02], rot: [0.3, 0, 0], scale: [1.05, 0.95, 0.8] });
            r.add(ball(0.28, 8, 6), PART.TORSO, 'deep', { at: [0, 0.92, 0.02], scale: [1, 0.8, 0.9] });
            const crystals = variant
                ? [[0.18, 1.55, -0.18, -0.5, 0.4], [-0.15, 1.6, -0.22, -0.6, -0.3], [0, 1.5, -0.32, -1, 0], [0.32, 1.48, -0.05, 0, 0.7]]
                : [[0.12, 1.58, -0.2, -0.4, 0.2], [-0.2, 1.52, -0.18, -0.5, -0.5], [0.3, 1.45, -0.1, -0.2, 0.8], [-0.34, 1.42, -0.06, -0.1, -0.8], [0.02, 1.4, -0.34, -1.1, 0]];
            for (const [x, y, z, rx, rz] of crystals) r.add(gem(0.07, 3.2), PART.TORSO, shard, { at: [x, y, z], rot: [rx, 0, rz] });
            // Small head sunk between the shoulders
            r.add(rock(0.15), PART.HEAD, 'rock', { at: [0, 1.5, 0.2] });
            r.add(box(0.2, 0.07, 0.12), PART.HEAD, 'deep', { at: [0, 1.4, 0.24] });
            r.eyes(0.05, 1.52, 0.33, eye, 0.045);
            // The crystal in the right fist is what it casts from
            r.add(gem(0.06, 2.2), PART.ARM_R, shard, { at: [-0.4, 0.38, 0.05] });
            if (tier >= 1) { // Armour: crystal plates on the chest, iron shackles
                for (const [x, y, rz] of [[0.14, 1.3, 0.4], [-0.14, 1.32, -0.4], [0, 1.1, 0]]) r.add(gem(0.08, 1.6), PART.TORSO, shard, { at: [x, y, 0.3], rot: [1.3, 0, rz] });
                for (const [arm, , s] of SIDES) r.add(cyl(0.13, 0.13, 0.1, 8), arm, 'metal', { at: [s * 0.4, 0.68, 0.02] });
            }
            if (tier >= 2) { // Elite: a crown of amethyst
                for (const [x, rz] of [[-0.08, 0.4], [0, 0], [0.08, -0.4]]) r.add(gem(0.04, 3), PART.HEAD, 'amethyst', { at: [x, 1.68, 0.18], rot: [-0.3, 0, rz] });
            }
        }
    },

    // Hell: a charred demon cracked with lava, horned, tailed, a ball of fire in its hand
    hell: {
        skeleton: { hip: 0.95, neck: 1.6, shoulder: [0.3, 1.52], leg: 0.13 },
        build(r, tier, variant, eye) {
            for (const [arm, leg, s] of SIDES) {
                r.add(cyl(0.085, 0.07, 0.45, 7), leg, 'hide', { at: [s * 0.13, 0.75, 0.07], rot: [0.4, 0, 0] });
                r.add(cyl(0.06, 0.05, 0.5, 6), leg, 'hide', { at: [s * 0.13, 0.3, 0.02], rot: [-0.35, 0, 0] });
                r.add(cyl(0.06, 0.07, 0.08, 6), leg, 'horn', { at: [s * 0.13, 0.04, 0.08] });
                r.add(cyl(0.075, 0.065, 0.4, 7), arm, 'hide', { at: [s * 0.3, 1.32, 0] });
                r.add(cyl(0.065, 0.055, 0.38, 7), arm, 'hide', { at: [s * 0.3, 0.94, 0.02] });
                for (let f = -1; f <= 1; f++) r.add(cone(0.016, 0.1, 4), arm, 'horn', { at: [s * 0.3 + f * 0.025, 0.7, 0.03], rot: [Math.PI, 0, 0] });
            }
            // Broad chest, narrow waist, loincloth, a tail
            r.add(ball(0.27, 10, 8), PART.TORSO, 'hide', { at: [0, 1.36, 0.02], scale: [1.15, 1, 0.75] });
            r.add(cyl(0.15, 0.13, 0.35, 8), PART.TORSO, 'hide', { at: [0, 1.05, 0] });
            r.add(box(0.2, 0.3, 0.03), PART.TORSO, 'leather', { at: [0, 0.82, 0.13] });
            r.add(tube([[0, 0.95, -0.12], [0, 0.75, -0.35], [0, 0.45, -0.5], [0, 0.32, -0.72]], 0.05, 0.015), PART.CAPE, 'hide');
            r.add(cone(0.05, 0.12, 4), PART.CAPE, 'horn', { at: [0, 0.3, -0.78], rot: [-1.9, 0, 0], scale: [1, 1, 0.4] });
            // Head, jaw, horns curling back
            r.add(ball(0.14, 9, 7), PART.HEAD, 'hide', { at: [0, 1.74, 0.02], scale: [0.9, 1.05, 1.1] });
            r.add(box(0.14, 0.06, 0.12), PART.HEAD, 'hide', { at: [0, 1.64, 0.08] });
            r.eyes(0.05, 1.76, 0.135, eye);
            const curl = variant ? 0.06 : -0.12;
            const big = tier >= 2 ? 1.3 : 1;
            for (const s of [-1, 1]) {
                r.add(tube([[s * 0.08, 1.82, 0], [s * 0.16 * big, 1.92, -0.04], [s * 0.2 * big, 1.82 + 0.24 * big, curl], [s * 0.17 * big, 1.82 + 0.34 * big, curl - 0.1]], 0.04, 0.01), PART.HEAD, 'horn');
                if (tier >= 2) r.add(tube([[s * 0.1, 1.76, 0.06], [s * 0.2, 1.74, 0.14], [s * 0.24, 1.8, 0.24]], 0.025, 0.006, 8, 4), PART.HEAD, 'horn');
            }
            // A ball of fire in the right hand
            r.add(ball(0.08, 8, 6), PART.ARM_R, 'dark', { at: [-0.3, 0.62, 0.06], glow: PALETTE.emberBright, strength: 2 });
            if (tier >= 1) { // Armour: spiked iron pauldrons, a breastplate
                for (const s of [-1, 1]) {
                    r.add(ball(0.14, 8, 5), PART.TORSO, 'iron', { at: [s * 0.3, 1.55, 0], scale: [1.1, 0.7, 1] });
                    r.add(cone(0.035, 0.14, 4), PART.TORSO, 'iron', { at: [s * 0.36, 1.66, 0], rot: [0, 0, s * -0.5] });
                }
                r.add(box(0.36, 0.28, 0.06), PART.TORSO, 'iron', { at: [0, 1.36, 0.2] });
            }
            if (tier >= 2) { // Elite: wing stubs and a glowing brand
                for (const s of [-1, 1]) r.add(cone(0.12, 0.6, 4), PART.TORSO, 'horn', { at: [s * 0.22, 1.62, -0.25], rot: [-0.6, 0, s * -0.9], scale: [1, 1, 0.25] });
                r.add(ball(0.05, 6, 4), PART.TORSO, 'dark', { at: [0, 1.46, 0.23], scale: [1, 1, 0.3], glow: PALETTE.hexBright, strength: 1.6 });
            }
        }
    }
};

// ─── Shader: the parts' motion ───────────────────────────────────────────────

const VERTEX_PARS = /* glsl */`
attribute float aPart;
attribute vec3 aPivot;
attribute vec3 aGlow;
attribute vec4 instanceAnim; // Walk phase (rad), walk amount, cast, hurt (0 to 1)
uniform float enemyHip;
varying vec3 vEnemyGlow;
varying float vEnemyHurt;
mat3 enemyRotX( float a ) { float c = cos( a ), s = sin( a ); return mat3( 1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c ); }
mat3 enemyRotZ( float a ) { float c = cos( a ), s = sin( a ); return mat3( c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0 ); }
`;

// Limbs swing about their joints; then everything above the hips leans, sways, bobs and flinches about the hips
const VERTEX_MOTION = /* glsl */`
float enemyPhase = instanceAnim.x;
float enemyWalk = instanceAnim.y;
float enemyCast = instanceAnim.z;
float enemyHurt = instanceAnim.w;
float enemyStride = sin( enemyPhase ) * enemyWalk;
mat3 enemyLimb = mat3( 1.0 );
if ( aPart > 3.5 && aPart < 4.5 ) enemyLimb = enemyRotX( 0.65 * enemyStride );
else if ( aPart > 4.5 && aPart < 5.5 ) enemyLimb = enemyRotX( -0.65 * enemyStride );
else if ( aPart > 1.5 && aPart < 2.5 ) enemyLimb = enemyRotX( -0.5 * enemyStride - 0.3 * enemyHurt ) * enemyRotZ( 0.06 );
else if ( aPart > 2.5 && aPart < 3.5 ) enemyLimb = enemyRotX( mix( 0.5 * enemyStride, -1.45, enemyCast ) - 0.3 * enemyHurt ) * enemyRotZ( -0.06 * ( 1.0 - enemyCast ) );
else if ( aPart > 5.5 ) enemyLimb = enemyRotX( 0.35 * enemyWalk + 0.12 * sin( enemyPhase * 2.0 + 1.0 ) + 0.06 * sin( enemyPhase * 0.7 ) );
bool enemyUpper = aPart < 3.5 || aPart > 5.5;
mat3 enemyBody = enemyRotX( 0.14 * enemyWalk + 0.1 * enemyCast * ( 1.0 - enemyWalk ) - 0.32 * enemyHurt ) * enemyRotZ( 0.05 * enemyStride );
vec3 enemyHipPivot = vec3( 0.0, enemyHip, 0.0 );
vec3 objectNormal = enemyLimb * normal;
vec3 enemyPos = enemyLimb * ( position - aPivot ) + aPivot;
if ( enemyUpper ) {
	objectNormal = enemyBody * objectNormal;
	enemyPos = enemyBody * ( enemyPos - enemyHipPivot ) + enemyHipPivot;
	enemyPos.y += ( abs( cos( enemyPhase ) ) * 0.06 - 0.03 ) * enemyWalk + sin( enemyPhase * 0.5 ) * 0.012 * ( 1.0 - enemyWalk );
}
vEnemyGlow = aGlow;
vEnemyHurt = enemyHurt;
`;

const FRAGMENT_PARS = /* glsl */`
varying vec3 vEnemyGlow;
varying float vEnemyHurt;
`;

// The biome's material: its atlas, the motion, a flash when hurt, eyes and embers that glow, and a little light
// of its own so a dark body still reads in a dark biome
function factionMaterial(biome) {
    const atlas = TextureGenerator.toTextures(TextureGenerator.enemyAtlas(biome));
    for (const t of Object.values(atlas)) if (t) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    const material = new THREE.MeshStandardMaterial({
        map: atlas.map,
        bumpMap: atlas.bumpMap,
        bumpScale: 0.6,
        emissiveMap: atlas.emissiveMap,
        emissive: atlas.emissiveMap ? 0xffffff : 0x000000,
        emissiveIntensity: 1.3,
        roughness: 0.8,
        metalness: 0
    });
    const hip = FACTIONS[biome].skeleton.hip;
    material.onBeforeCompile = (shader) => {
        shader.uniforms.enemyHip = { value: hip };
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
            .replace('#include <beginnormal_vertex>', VERTEX_MOTION)
            .replace('#include <begin_vertex>', 'vec3 transformed = enemyPos;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
            .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0, 0.8, 0.72 ), 0.4 * vEnemyHurt );')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEnemyGlow + diffuseColor.rgb * 0.08;');
    };
    material.customProgramCacheKey = () => 'enemy';
    return material;
}

export class EnemyMeshBuilder {
    static materials = new Map(); // By biome, made on first use (painting the atlas needs a canvas)
    static models = new Map(); // { geometry, material } by biome, tier and variant

    /**
     * What an enemy of `level` looks like: its biome's faction, a tier (0 the first time through the biome, 1 the
     * second, 2 from the third on, the next tier showing up more and more over each pass), a variant, a tint and a
     * size of its own. Pure data: the model is built when first drawn (model()).
     */
    static pick(level) {
        const biome = themes.getTheme(level).biome;
        const pass = Math.floor((level - 1) / 20);
        const tier = Math.min(2, pass + (Math.random() < ((level - 1) % 20) / 40 ? 1 : 0));
        const channel = () => Math.round(255 * (0.84 + Math.random() * 0.16)); // Each at most 255: no spill into the next
        const tint = (channel() << 16) | (channel() << 8) | channel();
        return { biome: FACTIONS[biome] ? biome : 'city', tier, variant: Math.random() < 0.5 ? 0 : 1, tint, scale: 0.92 + Math.random() * 0.16 };
    }

    static model({ biome, tier, variant }) {
        const key = `${biome}|${tier}|${variant}`;
        let model = this.models.get(key);
        if (!model) {
            if (!this.materials.has(biome)) this.materials.set(biome, factionMaterial(biome));
            const faction = FACTIONS[biome];
            const rig = new Rig(biome, joints(faction.skeleton));
            faction.build(rig, tier, variant, EYES[tier]);
            model = { geometry: rig.build(), material: this.materials.get(biome) };
            this.models.set(key, model);
        }
        return model;
    }
}
