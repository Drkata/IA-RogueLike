import { CONSTANTS } from '../core/Constants.js';
import { cellTopHeight } from './MapGenerator.js';

const C = CONSTANTS.CELL_SIZE;
const H = CONSTANTS.WALL_HEIGHT;

/*
 * Enemy navigation over the level's height map (one walkable top per cell, see cellTopHeight).
 * Between two orthogonal neighbours a move is:
 *   - a walk  when the heights differ by less than STEP_HEIGHT (floors, ramps, wall tops);
 *   - a jump  up to JUMP_UP higher or down to MAX_DROP lower (orthogonal only, never diagonal);
 *   - impossible otherwise.
 * A diagonal move is a walk between four cells all within STEP_HEIGHT of each other, so it never
 * cuts the corner of a wall or of a drop. Jumps cost extra, so ramps are preferred when not much
 * longer. The heuristic (octile) is admissible and consistent with these costs: paths are optimal
 * and stable from one replanning to the next.
 *
 * findPath() returns waypoints { x, z, jump }: walk legs pulled tight (string pulling, checked
 * for a body of BODY_RADIUS), and `jump: true` on a waypoint reached by jumping from the previous one.
 */

export const STEP_HEIGHT = 2.0;
export const JUMP_UP = H + 0.1;
export const MAX_DROP = 2 * H + 0.1;
const JUMP_COST = 3; // Extra cost of a jump up, in cells
const DROP_COST = 1;
const BODY_RADIUS = 0.9; // Enemy radius (0.8) plus a margin, for the walk legs
const AVOID_COST = 4; // Extra cost of a cell held by a standing enemy

const NEIGHBORS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIAGONALS = [[1, -1], [1, 1], [-1, 1], [-1, -1]];

// ─── Min-heap of (cell index, f) pairs, parallel arrays: no allocation per node ──
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
            if (this._f[i] >= this._f[parent]) break;
            this._swap(i, parent);
            i = parent;
        }
    }

    pop() {
        const top = this._idx[0];
        const lastIdx = this._idx.pop();
        const lastF = this._f.pop();
        if (this._idx.length > 0) {
            this._idx[0] = lastIdx;
            this._f[0] = lastF;
            const n = this._idx.length;
            let i = 0;
            for (;;) {
                let smallest = i;
                const l = (i << 1) + 1;
                const r = l + 1;
                if (l < n && this._f[l] < this._f[smallest]) smallest = l;
                if (r < n && this._f[r] < this._f[smallest]) smallest = r;
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
        // Per-cell buffers reused between searches; a stamp per search avoids clearing them
        this._size = 0;
        this._stamp = 0;
    }

    // Rebuild the buffers and the height cache when a new level is loaded
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

    // ─── Cells and moves ─────────────────────────────────────────────────────

    isWalkable(gridX, gridZ) {
        return gridX >= 0 && gridX < this.levelManager.width && gridZ >= 0 && gridZ < this.levelManager.height;
    }

    // Height an enemy stands at on this cell (Infinity out of the map)
    getCellHeight(gridX, gridZ) {
        if (!this.isWalkable(gridX, gridZ)) return Infinity;
        this._sync();
        return this._heights[gridZ * this._width + gridX];
    }

    // Can an enemy get from a cell to an orthogonal neighbour (walking or jumping)?
    canTransition(fromX, fromZ, toX, toZ) {
        const dh = this.getCellHeight(toX, toZ) - this.getCellHeight(fromX, fromZ);
        return Number.isFinite(dh) && dh <= JUMP_UP && dh >= -MAX_DROP;
    }

    // Walked, not jumped (same level, ramp, step)
    _walkable(ha, hb) {
        return Math.abs(ha - hb) < STEP_HEIGHT;
    }

    // ─── Search ──────────────────────────────────────────────────────────────

    /**
     * Path from `startPos` to `endPos` (world positions), or null if there is none.
     * `avoid`: cell indices that cost more to cross (cells held by standing enemies).
     */
    findPath(startPos, endPos, avoid = null) {
        this._sync();
        const w = this._width;
        const sx = Math.floor(startPos.x / C);
        const sz = Math.floor(startPos.z / C);
        const ex = Math.floor(endPos.x / C);
        const ez = Math.floor(endPos.z / C);
        if (!this.isWalkable(sx, sz) || !this.isWalkable(ex, ez)) return null;

        const heights = this._heights;
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

        const relax = (current, n, nx, nz, cost) => {
            if (closed[n] === stamp) return;
            if (avoid && n !== endIdx && avoid.has(n)) cost += AVOID_COST;
            const g = gScore[current] + cost;
            if (open[n] === stamp && g >= gScore[n]) return;
            cameFrom[n] = current;
            gScore[n] = g;
            open[n] = stamp;
            heap.push(n, g + this._heuristic(nx, nz, ex, ez));
        };

        while (heap.size > 0) {
            const current = heap.pop();
            if (current === endIdx) return this._buildWaypoints(this._cellsTo(current), startPos, endPos);
            if (closed[current] === stamp) continue; // Stale duplicate (lazy deletion)
            closed[current] = stamp;

            const cx = current % w;
            const cz = (current - cx) / w;
            const h = heights[current];

            for (const [dx, dz] of NEIGHBORS) {
                const nx = cx + dx;
                const nz = cz + dz;
                if (!this.isWalkable(nx, nz)) continue;
                const n = nz * w + nx;
                const dh = heights[n] - h;
                if (dh >= STEP_HEIGHT) {
                    if (dh <= JUMP_UP) relax(current, n, nx, nz, 1 + JUMP_COST);
                } else if (dh <= -STEP_HEIGHT) {
                    if (dh >= -MAX_DROP) relax(current, n, nx, nz, 1 + DROP_COST);
                } else {
                    relax(current, n, nx, nz, 1);
                }
            }
            for (const [dx, dz] of DIAGONALS) {
                const nx = cx + dx;
                const nz = cz + dz;
                if (!this.isWalkable(nx, nz)) continue;
                const n = nz * w + nx;
                const hx = heights[cz * w + nx];
                const hz = heights[nz * w + cx];
                const hn = heights[n];
                if (this._walkable(h, hx) && this._walkable(h, hz) && this._walkable(hx, hn) && this._walkable(hz, hn) && this._walkable(h, hn)) {
                    relax(current, n, nx, nz, Math.SQRT2);
                }
            }
        }
        return null;
    }

    // Octile distance: exact cost on open ground, never more than the real cost
    _heuristic(ax, az, bx, bz) {
        const dx = Math.abs(ax - bx);
        const dz = Math.abs(az - bz);
        return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
    }

    _cellsTo(endIdx) {
        const cells = [];
        for (let i = endIdx; i !== -1; i = this._cameFrom[i]) cells.push(i);
        return cells.reverse();
    }

    // ─── Waypoints ───────────────────────────────────────────────────────────

    // Splits the cells into walk legs joined by jumps, and pulls each leg tight
    _buildWaypoints(cells, startPos, endPos) {
        const w = this._width;
        const heights = this._heights;
        const centre = (i) => ({ x: (i % w) * C + C / 2, z: Math.floor(i / w) * C + C / 2 });
        const waypoints = [{ x: startPos.x, z: startPos.z, jump: false }];

        let legStart = 0; // Index in `cells` of the first cell of the current walk leg
        let anchor = waypoints[0];
        for (let i = 1; i <= cells.length; i++) {
            const isEnd = i === cells.length;
            if (!isEnd && this._walkable(heights[cells[i - 1]], heights[cells[i]])) continue;

            // Leg from cells[legStart] to cells[i - 1]: ends at the player, or at the cell a jump leaves from
            const legEnd = isEnd ? { x: endPos.x, z: endPos.z } : centre(cells[i - 1]);
            this._pullTight(anchor, cells, legStart, i - 1, legEnd, waypoints);
            if (isEnd) break;

            anchor = { ...centre(cells[i]), jump: true };
            waypoints.push(anchor);
            legStart = i;
        }
        return waypoints;
    }

    // String pulling over cells[from..to]: keeps only the corners the body can't walk straight past
    _pullTight(anchor, cells, from, to, legEnd, out) {
        const w = this._width;
        const centre = (i) => ({ x: (i % w) * C + C / 2, z: Math.floor(i / w) * C + C / 2, jump: false });
        const target = (k) => (k === to ? { ...legEnd, jump: false } : centre(cells[k]));
        let k = from;
        while (k < to) {
            let farthest = k + 1;
            for (let j = k + 2; j <= to && this.canWalkStraight(anchor, target(j)); j++) farthest = j;
            anchor = target(farthest);
            out.push(anchor);
            k = farthest;
        }
        if (from === to && (anchor.x !== legEnd.x || anchor.z !== legEnd.z)) out.push({ ...legEnd, jump: false });
    }

    /**
     * Can a body of BODY_RADIUS walk the straight line from `a` to `b` without climbing a wall,
     * falling off a ledge or brushing either? Every sample's square must cover cells within
     * STEP_HEIGHT of the cell under it, and consecutive cells must be walkable steps.
     */
    canWalkStraight(a, b) {
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.4));
        const r = BODY_RADIUS;
        let prevH = this._heightAt(a.x, a.z);
        for (let s = 0; s <= steps; s++) {
            const x = a.x + (dx * s) / steps;
            const z = a.z + (dz * s) / steps;
            const h = this._heightAt(x, z);
            if (!this._walkable(prevH, h)) return false;
            // The start may hug a wall (where the enemy stands now): only the way ahead must be clear
            if (s > 0 && !this._walkable(h, this._heightAt(x - r, z - r)) || !this._walkable(h, this._heightAt(x + r, z - r)) ||
                !this._walkable(h, this._heightAt(x - r, z + r)) || !this._walkable(h, this._heightAt(x + r, z + r))) return false;
            prevH = h;
        }
        return true;
    }

    _heightAt(x, z) {
        return this.getCellHeight(Math.floor(x / C), Math.floor(z / C));
    }

    // ─── Line of sight (shooting) ────────────────────────────────────────────

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

    gridToWorld(gridX, gridZ) {
        return { x: gridX * C + C / 2, z: gridZ * C + C / 2 };
    }
}
