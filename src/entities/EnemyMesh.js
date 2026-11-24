import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../core/Palette.js';

// Muted cloth, stone and rust tones: enemies read by silhouette and glowing eyes (see ART_DIRECTION.md)
const BODY_COLORS = [0x6b6170, 0x5d6a4a, 0x7a4a36, 0x4e5a6a, 0x8a8070, 0x5e4a6a, 0x8a6a3a, 0x4a6a68];

const BODY_W = 0.5;
const BODY_H = 0.9;
const HEAD = 0.25;
const LEG = 0.75;
const HEAD_Y = LEG + BODY_H + HEAD * 0.6;

// Brightness of each part (vertex colour × body colour): lighter head, darker limbs and armour
const SHADE = { head: 1.0, body: 0.9, arm: 0.78, leg: 0.68, spike: 0.6, horn: 0.55, armor: 0.42 };

const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();

export class EnemyMeshBuilder {
    // A little self-light keeps dark enemies readable in dark biomes
    static materials = BODY_COLORS.map(color =>
        new THREE.MeshLambertMaterial({ color, vertexColors: true, emissive: color, emissiveIntensity: 0.12 }));
    static eyeMaterials = {
        normal: new THREE.MeshBasicMaterial({ color: PALETTE.emberBright }),
        elite: new THREE.MeshBasicMaterial({ color: PALETTE.hexBright }) // Level 7+
    };
    static eyeGeometry = EnemyMeshBuilder._eyes();
    static shapes = new Map(); // Body geometries by variant, shared by every enemy

    static build(level) {
        const variant = {
            head: Math.floor(Math.random() * 4),
            body: Math.floor(Math.random() * 3),
            arms: Math.random() > 0.7 ? 4 : 2,
            spikes: Math.random() > 0.8,
            horns: Math.random() > 0.7,
            armor: level >= 4
        };
        const key = Object.values(variant).join('|');
        if (!this.shapes.has(key)) this.shapes.set(key, this._shape(variant));

        const group = new THREE.Group();
        const material = this.materials[Math.floor(Math.random() * this.materials.length)];
        group.add(new THREE.Mesh(this.shapes.get(key), material));
        group.add(new THREE.Mesh(this.eyeGeometry, level >= 7 ? this.eyeMaterials.elite : this.eyeMaterials.normal));
        return group;
    }

    // All body parts merged into one geometry with a grey vertex colour per part
    static _shape({ head, body, arms, spikes, horns, armor }) {
        const parts = [];
        const part = (geometry, shade, [sx, sy, sz], [x, y, z], rotZ = 0) => {
            _matrix.compose(_pos.set(x, y, z), _quat.setFromEuler(_euler.set(0, 0, rotZ)), _scale.set(sx, sy, sz));
            const g = (geometry.index ? geometry.toNonIndexed() : geometry).applyMatrix4(_matrix);
            const colors = new Float32Array(g.attributes.position.count * 3).fill(shade);
            g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            g.deleteAttribute('uv');
            parts.push(g);
        };
        const box = () => new THREE.BoxGeometry(1, 1, 1);
        const sphere = () => new THREE.SphereGeometry(0.5, 10, 8);
        const cylinder = () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
        const cone = () => new THREE.ConeGeometry(0.5, 1, 6);

        // Head
        if (head === 0) part(box(), SHADE.head, [HEAD, HEAD, HEAD], [0, HEAD_Y, 0]);
        else if (head === 1) part(sphere(), SHADE.head, [HEAD * 1.2, HEAD * 1.2, HEAD * 1.2], [0, HEAD_Y, 0]);
        else if (head === 2) part(cone(), SHADE.head, [HEAD, HEAD * 1.2, HEAD], [0, HEAD_Y, 0]);
        else part(new THREE.OctahedronGeometry(0.5), SHADE.head, [HEAD * 1.2, HEAD * 1.2, HEAD * 1.2], [0, HEAD_Y, 0]);

        // Body
        const bodyY = LEG + BODY_H * 0.5;
        if (body === 0) part(box(), SHADE.body, [BODY_W, BODY_H, BODY_W * 0.6], [0, bodyY, 0]);
        else if (body === 1) part(cylinder(), SHADE.body, [BODY_W * 0.8, BODY_H, BODY_W * 0.8], [0, bodyY, 0]);
        else part(sphere(), SHADE.body, [BODY_W * 1.2, BODY_H, BODY_W * 1.2], [0, bodyY, 0]);

        // Arms (2 or 4) and legs
        const armOffsets = arms === 2 ? [0] : [BODY_H * 0.3, -BODY_H * 0.1];
        for (const dy of armOffsets) {
            for (const side of [-1, 1]) part(box(), SHADE.arm, [0.12, 0.6, 0.12], [side * BODY_W * 0.6, bodyY + dy, 0]);
        }
        for (const side of [-1, 1]) part(box(), SHADE.leg, [0.15, LEG, 0.15], [side * BODY_W * 0.25, LEG * 0.5, 0]);

        if (spikes) {
            for (const [x, y, z, r] of [[-0.15, 0.25, 0.1, 0.4], [0.12, 0.5, -0.08, 2.2], [0, 0.75, 0.12, 4.1]]) {
                part(cone(), SHADE.spike, [0.1, 0.2, 0.1], [x * BODY_W * 2, LEG + y * BODY_H, z], r);
            }
        }
        if (horns) {
            for (const side of [-1, 1]) part(cone(), SHADE.horn, [0.16, 0.3, 0.16], [side * HEAD * 0.4, LEG + BODY_H + HEAD, 0], -side * 0.3);
        }
        if (armor) part(box(), SHADE.armor, [BODY_W * 0.8, 0.15, BODY_W * 0.5], [0, LEG + BODY_H * 0.7, 0]);

        const geometry = mergeGeometries(parts);
        parts.forEach(g => g.dispose());
        return geometry;
    }

    // Two glowing eyes on the front of the head
    static _eyes() {
        const eyes = [-1, 1].map(side => {
            const g = new THREE.SphereGeometry(0.05, 6, 4);
            g.translate(side * HEAD * 0.3, LEG + BODY_H + HEAD * 0.5, HEAD * 0.45);
            return g;
        });
        const geometry = mergeGeometries(eyes);
        eyes.forEach(g => g.dispose());
        return geometry;
    }
}
