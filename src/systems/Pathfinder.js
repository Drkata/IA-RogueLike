import { CONSTANTS } from '../core/Constants.js';
import { cellTopHeight } from './MapGenerator.js';

const SOLID_HEIGHT = 999; // Out-of-map cells

// Neighbour order matters (tie-breaking): N, E, S, W, then diagonals.
const NEIGHBOR_DIRS = [
    [0, -1], [1, 0], [0, 1], [-1, 0],
    [1, -1], [1, 1], [-1, 1], [-1, -1]
];

// ─── Min-Heap of (cell index, f) pairs ───────────────────────────────────────
// Parallel number arrays: no per-node object allocation.
class MinHeap {
    constructor() {
        this._idx = [];
        this._f = [];
    }

    get size() { return this._idx.length; }

    clear() {
        this._idx.length = 0;
        this._f.length = 0;
    }

    push(idx, f) {
        this._idx.push(idx);
        this._f.push(f);
        let i = this._idx.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this._f[i] - this._f[parent] >= 0) break;
            this._swap(i, parent);
            i = parent;
        }
    }

    // Returns the index of the node with the smallest f
    pop() {
        const top = this._idx[0];
        const lastIdx = this._idx.pop();
        const lastF = this._f.pop();
        if (this._idx.length > 0) {
            this._idx[0] = lastIdx;
            this._f[0] = lastF;
            const n = this._idx.length;
            let i = 0;
            while (true) {
                let smallest = i;
                const l = (i << 1) + 1;
                const r = l + 1;
                if (l < n && this._f[l] - this._f[smallest] < 0) smallest = l;
                if (r < n && this._f[r] - this._f[smallest] < 0) smallest = r;
                if (smallest === i) break;
                this._swap(i, smallest);
                i = smallest;
            }
        }
        return top;
    }

    _swap(a, b) {
        const ti = this._idx[a]; this._idx[a] = this._idx[b]; this._idx[b] = ti;
        const tf = this._f[a]; this._f[a] = this._f[b]; this._f[b] = tf;
    }
}

export class Pathfinder {
    constructor(levelManager) {
        this.levelManager = levelManager;
        this._heap = new MinHeap();
        // Per-cell buffers reused between calls; a stamp per search avoids clearing them.
        this._size = 0;
        this._stamp = 0;
    }

    // Rebuild buffers and the cell height cache when a new level is loaded
    _sync() {
        const lm = this.levelManager;
        if (this._data === lm.data && this._dataFloor1 === lm.dataFloor1 && this._dataFloor2 === lm.dataFloor2) return;
        this._data = lm.data;
        this._dataFloor1 = lm.dataFloor1;
        this._dataFloor2 = lm.dataFloor2;
        this._width = lm.width;
        this._height = lm.height;

        const n = lm.width * lm.height;
        if (n !== this._size) {
            this._size = n;
            this._closed = new Uint32Array(n);
            this._open = new Uint32Array(n);
            this._gScore = new Float64Array(n);
            this._cameFrom = new Int32Array(n);
            this._stamp = 0;
        }
        this._heights = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            this._heights[i] = cellTopHeight(this._data[i], this._dataFloor1 ? this._dataFloor1[i] : 0, this._dataFloor2 ? this._dataFloor2[i] : 0);
        }
    }

    findPath(startPos, endPos) {
        this._sync();
        const sx = Math.floor(startPos.x / CONSTANTS.CELL_SIZE);
        const sz = Math.floor(startPos.z / CONSTANTS.CELL_SIZE);
        const ex = Math.floor(endPos.x / CONSTANTS.CELL_SIZE);
        const ez = Math.floor(endPos.z / CONSTANTS.CELL_SIZE);

        // Fast path: direct line of sight → only if start and end are at the same height level
        if (this.getCellHeight(sx, sz) === this.getCellHeight(ex, ez) && this.hasLineOfSight(startPos, endPos)) {
            return [
                { x: startPos.x, z: startPos.z },
                { x: endPos.x, z: endPos.z }
            ];
        }

        if (!this.isWalkable(sx, sz) || !this.isWalkable(ex, ez)) return null;

        const w = this._width;
        const stamp = ++this._stamp;
        const closed = this._closed, open = this._open;
        const gScore = this._gScore, cameFrom = this._cameFrom;
        const heap = this._heap;
        heap.clear();

        const startIdx = sz * w + sx;
        const endIdx = ez * w + ex;
        heap.push(startIdx, this._heuristic(sx, sz, ex, ez));
        gScore[startIdx] = 0;
        open[startIdx] = stamp;
        cameFrom[startIdx] = -1;

        while (heap.size > 0) {
            const current = heap.pop();
            open[current] = 0;

            if (current === endIdx) return this._smoothPath(this._reconstructPath(current));

            // Skip stale duplicate entries (lazy deletion)
            if (closed[current] === stamp) continue;
            closed[current] = stamp;

            const cx = current % w;
            const cz = (current - cx) / w;
            const tentativeG = gScore[current] + 1;

            for (const [dx, dz] of NEIGHBOR_DIRS) {
                const nx = cx + dx;
                const nz = cz + dz;
                if (!this._canStep(cx, cz, dx, dz)) continue;

                const n = nz * w + nx;
                if (closed[n] === stamp) continue;
                if (open[n] === stamp && tentativeG >= gScore[n]) continue;

                cameFrom[n] = current;
                gScore[n] = tentativeG;
                heap.push(n, tentativeG + this._heuristic(nx, nz, ex, ez));
                open[n] = stamp;
            }
        }

        return null;
    }

    hasLineOfSight(start, end, radius = 0.8, checkCliffs = false) {
        const lm = this.levelManager;
        const startY = start.y !== undefined ? start.y : lm.getFloorHeight(start.x, start.z, 3.0);
        const endY = end.y !== undefined ? end.y : lm.getFloorHeight(end.x, end.z, 3.0);

        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const dy = endY - startY;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < 1.0) return true;

        const blocked = (x, z, y) => lm.isWall(x, z, y) || (checkCliffs && y - lm.getFloorHeight(x, z, y) >= 1.5);

        const steps = Math.ceil(distance / 0.5);
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const x = start.x + dx * t;
            const z = start.z + dz * t;
            const y = startY + dy * t;

            if (blocked(x, z, y)) return false;
            if (radius > 0 && (blocked(x + radius, z, y) || blocked(x - radius, z, y) ||
                blocked(x, z + radius, y) || blocked(x, z - radius, y))) return false;
        }
        return true;
    }

    _smoothPath(path) {
        if (path.length <= 2) return path;

        const smoothed = [path[0]];
        let currentIndex = 0;

        while (currentIndex < path.length - 1) {
            let farthestVisible = currentIndex + 1;
            const cur = path[currentIndex];
            const curHeight = this._heightAtWorld(cur.x, cur.z);

            for (let i = currentIndex + 2; i < path.length; i++) {
                const tgt = path[i];
                // Do not smooth path segments that transition between different heights
                if (curHeight !== this._heightAtWorld(tgt.x, tgt.z)) break;
                if (!this.hasLineOfSight(cur, tgt, 0.8, true)) break;
                farthestVisible = i;
            }

            currentIndex = farthestVisible;
            smoothed.push(path[currentIndex]);
        }

        return smoothed;
    }

    _reconstructPath(endIdx) {
        const path = [];
        for (let i = endIdx; i !== -1; i = this._cameFrom[i]) {
            const x = i % this._width;
            path.push(this.gridToWorld(x, (i - x) / this._width));
        }
        return path.reverse();
    }

    // Octile distance (8-directional movement)
    _heuristic(ax, az, bx, bz) {
        const dx = Math.abs(ax - bx);
        const dz = Math.abs(az - bz);
        return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    }

    _heightAtWorld(x, z) {
        return this.getCellHeight(Math.floor(x / CONSTANTS.CELL_SIZE), Math.floor(z / CONSTANTS.CELL_SIZE));
    }

    // Height an enemy stands at when on this cell (top of the highest solid structure)
    getCellHeight(gridX, gridZ) {
        if (!this.isWalkable(gridX, gridZ)) return SOLID_HEIGHT;
        this._sync();
        return this._heights[gridZ * this._width + gridX];
    }

    // Walk on ramps, jump up 1 floor, or drop down up to 2 floors
    canTransition(fromX, fromZ, toX, toZ) {
        const hFrom = this.getCellHeight(fromX, fromZ);
        const hTo = this.getCellHeight(toX, toZ);
        if (hFrom > 100 || hTo > 100) return false;
        if (hTo > hFrom) return (hTo - hFrom) <= CONSTANTS.WALL_HEIGHT + 0.1;
        return (hFrom - hTo) <= CONSTANTS.WALL_HEIGHT * 2 + 0.1;
    }

    _canStep(x, z, dx, dz) {
        const nx = x + dx;
        const nz = z + dz;
        if (!this.isWalkable(nx, nz) || !this.canTransition(x, z, nx, nz)) return false;
        if (dx === 0 || dz === 0) return true;
        // Prevent diagonal corner-cutting
        return this.canTransition(x, z, nx, z) &&
            this.canTransition(x, z, x, nz) &&
            this.canTransition(nx, z, nx, nz) &&
            this.canTransition(x, nz, nx, nz);
    }

    isWalkable(gridX, gridZ) {
        return gridX >= 0 && gridX < this.levelManager.width && gridZ >= 0 && gridZ < this.levelManager.height;
    }

    gridToWorld(gridX, gridZ) {
        return {
            x: gridX * CONSTANTS.CELL_SIZE + CONSTANTS.CELL_SIZE / 2,
            z: gridZ * CONSTANTS.CELL_SIZE + CONSTANTS.CELL_SIZE / 2
        };
    }
}
