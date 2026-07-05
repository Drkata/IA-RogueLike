import { CONSTANTS } from '../core/Constants.js';

// ─── Min-Heap ────────────────────────────────────────────────────────────────
// Replaces array.sort()+shift() O(N log N) with push/pop O(log N).
class MinHeap {
    constructor(compareFn) {
        this._data = [];
        this._cmp  = compareFn;
    }

    get size() { return this._data.length; }

    push(item) {
        this._data.push(item);
        this._bubbleUp(this._data.length - 1);
    }

    pop() {
        const top  = this._data[0];
        const last = this._data.pop();
        if (this._data.length > 0) {
            this._data[0] = last;
            this._sinkDown(0);
        }
        return top;
    }

    clear() { this._data.length = 0; }

    _bubbleUp(i) {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this._cmp(this._data[i], this._data[parent]) < 0) {
                const tmp          = this._data[i];
                this._data[i]      = this._data[parent];
                this._data[parent] = tmp;
                i = parent;
            } else break;
        }
    }

    _sinkDown(i) {
        const n = this._data.length;
        while (true) {
            let smallest = i;
            const l = (i << 1) + 1;
            const r = l + 1;
            if (l < n && this._cmp(this._data[l], this._data[smallest]) < 0) smallest = l;
            if (r < n && this._cmp(this._data[r], this._data[smallest]) < 0) smallest = r;
            if (smallest === i) break;
            const tmp             = this._data[i];
            this._data[i]         = this._data[smallest];
            this._data[smallest]  = tmp;
            i = smallest;
        }
    }
}

export class Pathfinder {
    constructor(levelManager) {
        this.levelManager = levelManager;

        // Reuse collections between calls — avoids new Map/Set/Array every 0.5s per enemy
        this._openSet   = new MinHeap((a, b) => a.f - b.f);
        this._closedSet = new Set();
        this._cameFrom  = new Map();
        this._gScore    = new Map();
        this._inOpenSet = new Set(); // O(1) membership test, replaces openSet.find() O(N)
    }

    findPath(startPos, endPos) {
        // Fast path: direct line of sight → no grid search needed
        if (this.hasLineOfSight(startPos, endPos)) {
            return [
                { x: startPos.x, z: startPos.z },
                { x: endPos.x,   z: endPos.z   }
            ];
        }

        const startGrid = this.worldToGrid(startPos.x, startPos.z);
        const endGrid   = this.worldToGrid(endPos.x,   endPos.z);

        if (!this.isWalkable(startGrid.x, startGrid.z) || !this.isWalkable(endGrid.x, endGrid.z)) {
            return null;
        }

        // Clear & reuse (zero allocations)
        this._openSet.clear();
        this._closedSet.clear();
        this._cameFrom.clear();
        this._gScore.clear();
        this._inOpenSet.clear();

        const startKey = `${startGrid.x},${startGrid.z}`;
        const endKey   = `${endGrid.x},${endGrid.z}`;

        const h0 = this.heuristic(startGrid, endGrid);
        this._openSet.push({ x: startGrid.x, z: startGrid.z, key: startKey, f: h0 });
        this._gScore.set(startKey, 0);
        this._inOpenSet.add(startKey);

        while (this._openSet.size > 0) {
            const current = this._openSet.pop();
            this._inOpenSet.delete(current.key);

            if (current.key === endKey) {
                const path = this._reconstructPath(current);
                return this._smoothPath(path);
            }

            // Skip stale duplicate entries (lazy deletion)
            if (this._closedSet.has(current.key)) continue;
            this._closedSet.add(current.key);

            const currentG = this._gScore.get(current.key);

            for (const neighbor of this._getNeighbors(current.x, current.z)) {
                const neighborKey = `${neighbor.x},${neighbor.z}`;
                if (this._closedSet.has(neighborKey)) continue;

                const tentativeG = currentG + 1;

                if (this._inOpenSet.has(neighborKey) && tentativeG >= this._gScore.get(neighborKey)) {
                    continue;
                }

                this._cameFrom.set(neighborKey, current);
                this._gScore.set(neighborKey, tentativeG);

                const f = tentativeG + this.heuristic(neighbor, endGrid);
                this._openSet.push({ x: neighbor.x, z: neighbor.z, key: neighborKey, f });
                this._inOpenSet.add(neighborKey);
            }
        }

        return null;
    }

    hasLineOfSight(start, end, radius = 0.8) {
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < 1.0) return true;

        const steps = Math.ceil(distance / 0.5);

        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const x = start.x + dx * t;
            const z = start.z + dz * t;

            if (this.levelManager.isWall(x, z)) return false;
            if (radius > 0) {
                if (this.levelManager.isWall(x + radius, z)) return false;
                if (this.levelManager.isWall(x - radius, z)) return false;
                if (this.levelManager.isWall(x, z + radius)) return false;
                if (this.levelManager.isWall(x, z - radius)) return false;
            }
        }

        return true;
    }

    _smoothPath(path) {
        if (!path || path.length <= 2) return path;

        const smoothed = [path[0]];
        let currentIndex = 0;

        while (currentIndex < path.length - 1) {
            let farthestVisible = currentIndex + 1;

            for (let i = currentIndex + 2; i < path.length; i++) {
                const cur = path[currentIndex];
                const tgt = path[i];
                if (this.hasLineOfSight({ x: cur.x, z: cur.z }, { x: tgt.x, z: tgt.z }, 0.8)) {
                    farthestVisible = i;
                } else {
                    break;
                }
            }

            currentIndex = farthestVisible;
            if (currentIndex < path.length) {
                smoothed.push(path[currentIndex]);
            }
        }

        return smoothed;
    }

    _reconstructPath(current) {
        const path = [];
        let currentKey = current.key;

        while (currentKey) {
            const commaIdx = currentKey.indexOf(',');
            const gridX    = parseInt(currentKey.substring(0, commaIdx));
            const gridZ    = parseInt(currentKey.substring(commaIdx + 1));
            path.unshift(this.gridToWorld(gridX, gridZ));

            const node = this._cameFrom.get(currentKey);
            currentKey = node ? node.key : null;
        }

        return path;
    }

    heuristic(a, b) {
        // Octile distance (8-directional movement)
        const dx = Math.abs(a.x - b.x);
        const dz = Math.abs(a.z - b.z);
        return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    }

    _getNeighbors(x, z) {
        const neighbors = [];
        const dirs = [
            { x:  0, z: -1 }, { x: 1, z:  0 },
            { x:  0, z:  1 }, { x:-1, z:  0 },
            { x:  1, z: -1 }, { x: 1, z:  1 },
            { x: -1, z:  1 }, { x:-1, z: -1 }
        ];

        for (const dir of dirs) {
            const nx = x + dir.x;
            const nz = z + dir.z;

            if (!this.isWalkable(nx, nz)) continue;

            // Prevent diagonal corner-cutting
            if (dir.x !== 0 && dir.z !== 0) {
                if (!this.isWalkable(x + dir.x, z) || !this.isWalkable(x, z + dir.z)) continue;
            }

            neighbors.push({ x: nx, z: nz });
        }

        return neighbors;
    }

    isWalkable(gridX, gridZ) {
        const world = this.gridToWorld(gridX, gridZ);
        return !this.levelManager.isWall(world.x, world.z);
    }

    worldToGrid(x, z) {
        return {
            x: Math.floor(x / CONSTANTS.CELL_SIZE),
            z: Math.floor(z / CONSTANTS.CELL_SIZE)
        };
    }

    gridToWorld(gridX, gridZ) {
        return {
            x: gridX * CONSTANTS.CELL_SIZE + CONSTANTS.CELL_SIZE / 2,
            z: gridZ * CONSTANTS.CELL_SIZE + CONSTANTS.CELL_SIZE / 2
        };
    }
}
