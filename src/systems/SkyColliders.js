import * as THREE from 'three';

const CELL = 8; // Metres per grid cell
const MIN_SIZE = 0.2; // Thinner parts (vines, chains) are not solid: they would snag shots
const cellKey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

const _box = new THREE.Box3();
const _inverse = new THREE.Matrix4();

/**
 * Solid shapes of the floating islands and bridges: each box, cylinder and cone keeps its exact
 * size and rotation. A uniform grid over X/Z means a query only tests the few shapes around it,
 * whatever the number of islands.
 */
export class SkyColliders {
    constructor() {
        this.shapes = [];
        this.cells = new Map(); // cell key -> shapes overlapping that cell
    }

    // Adds a mesh's shape (its matrixWorld must be up to date)
    add(mesh) {
        const g = mesh.geometry;
        const p = g.parameters;
        let shape;
        if (g.type === 'BoxGeometry') {
            if (Math.min(p.width, p.height, p.depth) < MIN_SIZE) return;
            shape = { box: true, hx: p.width / 2, hy: p.height / 2, hz: p.depth / 2 };
        } else if (g.type === 'CylinderGeometry' || g.type === 'ConeGeometry') {
            // Inscribed radius: the low-poly sides never show a gap where shots bounce off thin air
            const k = Math.cos(Math.PI / p.radialSegments);
            const rTop = (g.type === 'ConeGeometry' ? 0 : p.radiusTop) * k;
            const rBottom = (g.type === 'ConeGeometry' ? p.radius : p.radiusBottom) * k;
            if (Math.max(rTop, rBottom) * 2 < MIN_SIZE) return;
            shape = { box: false, rTop, rBottom, hy: p.height / 2 };
        } else {
            return; // Crystals and other small details
        }

        shape.world = mesh.matrixWorld.elements.slice(); // Rotation brings local normals back to the world
        shape.inv = _inverse.copy(mesh.matrixWorld).invert().elements.slice();
        if (!g.boundingBox) g.computeBoundingBox();
        _box.copy(g.boundingBox).applyMatrix4(mesh.matrixWorld);
        shape.min = _box.min.toArray();
        shape.max = _box.max.toArray();
        this.shapes.push(shape);

        for (let cx = Math.floor(shape.min[0] / CELL); cx <= Math.floor(shape.max[0] / CELL); cx++) {
            for (let cz = Math.floor(shape.min[2] / CELL); cz <= Math.floor(shape.max[2] / CELL); cz++) {
                const key = cellKey(cx, cz);
                if (!this.cells.has(key)) this.cells.set(key, []);
                this.cells.get(key).push(shape);
            }
        }
    }

    /**
     * Is (x, y, z) inside a shape grown by `inflate` metres? If so, `out.normal` (world, unit) and
     * `out.depth` tell how to push the point out of the deepest one, and the result is true.
     */
    probe(x, y, z, inflate, out) {
        const list = this.cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
        if (!list) return false;

        let best = 0;
        for (const s of list) {
            if (x < s.min[0] - inflate || x > s.max[0] + inflate || y < s.min[1] - inflate ||
                y > s.max[1] + inflate || z < s.min[2] - inflate || z > s.max[2] + inflate) continue;

            const e = s.inv;
            const qx = e[0] * x + e[4] * y + e[8] * z + e[12];
            const qy = e[1] * x + e[5] * y + e[9] * z + e[13];
            const qz = e[2] * x + e[6] * y + e[10] * z + e[14];

            // Local push direction and depth: through the nearest face
            let nx = 0, ny = 0, nz = 0, depth;
            const gy = s.hy + inflate - Math.abs(qy);
            if (gy <= 0) continue;
            if (s.box) {
                const gx = s.hx + inflate - Math.abs(qx);
                const gz = s.hz + inflate - Math.abs(qz);
                if (gx <= 0 || gz <= 0) continue;
                if (gx <= gy && gx <= gz) { nx = qx < 0 ? -1 : 1; depth = gx; }
                else if (gy <= gz) { ny = qy < 0 ? -1 : 1; depth = gy; }
                else { nz = qz < 0 ? -1 : 1; depth = gz; }
            } else {
                const t = Math.min(1, Math.max(0, (qy + s.hy) / (2 * s.hy)));
                const rho = Math.hypot(qx, qz);
                const gr = s.rBottom + (s.rTop - s.rBottom) * t + inflate - rho;
                if (gr <= 0) continue;
                if (gr < gy && rho > 1e-6) { nx = qx / rho; nz = qz / rho; depth = gr; }
                else { ny = qy < 0 ? -1 : 1; depth = gy; }
            }

            if (depth <= best) continue;
            best = depth;
            const w = s.world;
            out.normal.set(w[0] * nx + w[4] * ny + w[8] * nz, w[1] * nx + w[5] * ny + w[9] * nz, w[2] * nx + w[6] * ny + w[10] * nz);
            out.depth = depth;
        }
        return best > 0;
    }
}
