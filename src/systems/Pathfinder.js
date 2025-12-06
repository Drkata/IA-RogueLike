import { CONSTANTS } from '../core/Constants.js';

export class Pathfinder {
    constructor(levelManager) {
        this.levelManager = levelManager;
    }

    findPath(startPos, endPos) {
        // First check if there's a direct line of sight
        if (this.hasLineOfSight(startPos, endPos)) {
            return [
                { x: startPos.x, z: startPos.z },
                { x: endPos.x, z: endPos.z }
            ];
        }

        const startGrid = this.worldToGrid(startPos.x, startPos.z);
        const endGrid = this.worldToGrid(endPos.x, endPos.z);

        if (!this.isWalkable(startGrid.x, startGrid.z) || !this.isWalkable(endGrid.x, endGrid.z)) {
            return null;
        }

        const openSet = [];
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const startKey = `${startGrid.x},${startGrid.z}`;
        const endKey = `${endGrid.x},${endGrid.z}`;

        openSet.push({ x: startGrid.x, z: startGrid.z, key: startKey });
        gScore.set(startKey, 0);
        fScore.set(startKey, this.heuristic(startGrid, endGrid));

        while (openSet.length > 0) {
            openSet.sort((a, b) => fScore.get(a.key) - fScore.get(b.key));
            const current = openSet.shift();

            if (current.key === endKey) {
                const path = this.reconstructPath(cameFrom, current);
                // Apply path smoothing to remove unnecessary waypoints
                return this.smoothPath(path);
            }

            closedSet.add(current.key);

            for (const neighbor of this.getNeighbors(current.x, current.z)) {
                const neighborKey = `${neighbor.x},${neighbor.z}`;

                if (closedSet.has(neighborKey)) continue;

                const tentativeGScore = gScore.get(current.key) + 1;

                if (!openSet.find(n => n.key === neighborKey)) {
                    openSet.push({ x: neighbor.x, z: neighbor.z, key: neighborKey });
                } else if (tentativeGScore >= gScore.get(neighborKey)) {
                    continue;
                }

                cameFrom.set(neighborKey, current);
                gScore.set(neighborKey, tentativeGScore);
                fScore.set(neighborKey, tentativeGScore + this.heuristic(neighbor, endGrid));
            }
        }

        return null;
    }

    hasLineOfSight(start, end, radius = 0.8) { // Increased default radius for safety
        // Raycast to check if there's a clear path with width
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        // If very close, always visible
        if (distance < 1.0) return true;

        const steps = Math.ceil(distance / 0.5); // Check every 0.5 units

        // Skip start (0) and end (steps) to avoid false negatives when touching walls
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const x = start.x + dx * t;
            const z = start.z + dz * t;

            // Check center and perpendicular points for width
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

    smoothPath(path) {
        if (!path || path.length <= 2) return path;

        const smoothed = [path[0]]; // Always keep start
        let currentIndex = 0;

        while (currentIndex < path.length - 1) {
            let farthestVisible = currentIndex + 1;

            // Find the farthest point we can see from current position
            for (let i = currentIndex + 2; i < path.length; i++) {
                const current = path[currentIndex];
                const target = path[i];

                if (this.hasLineOfSight(
                    { x: current.x, z: current.z },
                    { x: target.x, z: target.z },
                    0.8 // Use strict radius for smoothing
                )) {
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

    reconstructPath(cameFrom, current) {
        const path = [];
        let currentKey = current.key;

        while (currentKey) {
            const coords = currentKey.split(',');
            const gridX = parseInt(coords[0]);
            const gridZ = parseInt(coords[1]);
            path.unshift(this.gridToWorld(gridX, gridZ));

            const node = cameFrom.get(currentKey);
            currentKey = node ? node.key : null;
        }

        return path;
    }

    heuristic(a, b) {
        // Octile distance (for 8-directional movement)
        const dx = Math.abs(a.x - b.x);
        const dz = Math.abs(a.z - b.z);
        return (dx + dz) + (Math.sqrt(2) - 2) * Math.min(dx, dz);
    }

    getNeighbors(x, z) {
        const neighbors = [];
        const dirs = [
            { x: 0, z: -1 }, // North
            { x: 1, z: 0 },  // East
            { x: 0, z: 1 },  // South
            { x: -1, z: 0 }, // West
            // Diagonals
            { x: 1, z: -1 }, // NE
            { x: 1, z: 1 },  // SE
            { x: -1, z: 1 }, // SW
            { x: -1, z: -1 } // NW
        ];

        for (const dir of dirs) {
            const nx = x + dir.x;
            const nz = z + dir.z;

            if (this.isWalkable(nx, nz)) {
                // For diagonals, check adjacent cells to prevent corner cutting
                if (dir.x !== 0 && dir.z !== 0) {
                    if (!this.isWalkable(x + dir.x, z) || !this.isWalkable(x, z + dir.z)) {
                        continue; // Blocked by corner
                    }
                }
                neighbors.push({ x: nx, z: nz });
            }
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
