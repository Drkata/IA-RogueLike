import { CONSTANTS } from '../core/Constants.js';

const H = CONSTANTS.WALL_HEIGHT;

// The level is a height map: every cell has a single walkable top.
//   data       (Floor 0): 0 floor, 1 wall, 2-9 ramp up to Floor 1
//   dataFloor1 (Floor 1): only meaningful on top of a Floor 0 wall. 0 walkway, 1 wall, 2-9 ramp up to Floor 2
//   dataFloor2 (Floor 2): only meaningful on top of a Floor 1 wall. 0 walkway, 1 wall
// Shared with Pathfinder so AI heights and generator checks always agree.
export function cellTopHeight(type, typeFloor1 = 0, typeFloor2 = 0) {
    if (typeFloor2 === 1) return H * 3;
    if (typeFloor1 === 1) return H * 2;
    if (typeFloor1 >= 2 && typeFloor1 <= 5) return H + H / 4;
    if (typeFloor1 >= 6 && typeFloor1 <= 9) return H + 3 * H / 4;
    if (type === 1) return H;
    if (type >= 2 && type <= 5) return H / 4;
    if (type >= 6 && type <= 9) return 3 * H / 4;
    return 0;
}

// Highest step (between cell tops) the player can take without a precise jump (jump apex is ~2.4m)
const PLAYER_CLIMB = 1.6;

// Ramp slopes. `out` = unit step from the ramp's top exit towards the floor below it,
// `along` = axis of the ramp's width. The low cell holds `type`, the high cell `type + 4`.
const SLOPES = {
    south: { type: 3, out: [0, -1], along: [1, 0], dir: 'H' },
    north: { type: 2, out: [0, 1], along: [1, 0], dir: 'H' },
    east: { type: 5, out: [-1, 0], along: [0, 1], dir: 'V' },
    west: { type: 4, out: [1, 0], along: [0, 1], dir: 'V' }
};
const SLOPE_BY_TYPE = { 2: SLOPES.north, 3: SLOPES.south, 4: SLOPES.west, 5: SLOPES.east };
const SLOPE_ORDER = [SLOPES.south, SLOPES.north, SLOPES.east, SLOPES.west];

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const SENTINEL_OFFSETS_FLOOR0 = [
    { x: 2, z: 2 }, { x: -2, z: -2 }, { x: 2, z: -2 }, { x: -2, z: 2 },
    { x: 3, z: 0 }, { x: -3, z: 0 }, { x: 0, z: 3 }, { x: 0, z: -3 }
];
const SENTINEL_OFFSETS_FLOOR1 = [
    { x: 1, z: 1 }, { x: -1, z: -1 }, { x: 1, z: -1 }, { x: -1, z: 1 },
    { x: 2, z: 0 }, { x: -2, z: 0 }, { x: 0, z: 2 }, { x: 0, z: -2 }
];

const FLOOR2_ROOM_SIZE = 8;
const RAMPS_PER_FLOOR = 9; // Planned ramps up to Floor 1 and up to Floor 2 (rescue ramps come on top)
const RAMP_SPACING = 8; // Minimum distance between two ramp centres, in cells, so they spread over the map
const MIN_FLOOR1_ISLAND = 4; // Smaller wall-top islands get no ramp (nothing spawns there)

const randomEventType = () => {
    const r = Math.random();
    return r < 0.4 ? 'altar' : (r < 0.8 ? 'shop' : 'fountain');
};

const isSpecial = (room) => room.type === 'event' || room.type === 'treasure';

/*
 * Generation runs in three phases, and no phase looks back:
 *   1. Structure: Floor 0 layout, Floor 1 rooms, the Floor 2 room, then up to RAMPS_PER_FLOOR
 *      spread-out ramps per floor around them. Nothing is built over `reserved` cells
 *      (special rooms, ramps).
 *   2. Repair: reconnect Floor 0, drop anything floating, give Floor 1 islands their ramps.
 *   3. Population: player start, chests, events, sentinels and traps are placed on the final
 *      grids, only on cells where they stand on their floor and the player can reach them.
 */
export class MapGenerator {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = [];
        this.corridorCells = []; // Candidate cells for spike traps
    }

    // ─── Grid helpers ────────────────────────────────────────────────────────
    idx(x, z) { return z * this.width + x; }

    inBounds(x, z) { return x >= 0 && x < this.width && z >= 0 && z < this.height; }

    // Index of the ramp cell at width offset `d` and `k` slope steps from the low cell (x, z):
    // k = -2 top exit, -1 high, 0 low, +1 floor below.
    _at(slope, x, z, d, k) {
        return this.idx(x + slope.along[0] * d + slope.out[0] * k, z + slope.along[1] * d + slope.out[1] * k);
    }

    _rampFits(slope, x, z, len, test) {
        for (let d = 0; d < len; d++) {
            if (!test(this._at(slope, x, z, d, -2), this._at(slope, x, z, d, -1), this._at(slope, x, z, d, 0), this._at(slope, x, z, d, 1))) return false;
        }
        return true;
    }

    _applyRamp(grid, seg) {
        const slope = SLOPE_BY_TYPE[seg.type];
        for (let d = 0; d < seg.length; d++) {
            grid[this._at(slope, seg.x, seg.z, d, 0)] = seg.type;
            grid[this._at(slope, seg.x, seg.z, d, -1)] = seg.type + 4;
        }
    }

    _rampExit(seg, d) {
        const slope = SLOPE_BY_TYPE[seg.type];
        return {
            x: seg.x + slope.along[0] * d - 2 * slope.out[0],
            z: seg.z + slope.along[1] * d - 2 * slope.out[1]
        };
    }

    // BFS from `start` over cells accepted by `pass`; returns the visited cells in BFS order.
    _flood(start, pass, dirs, visited) {
        const out = [start];
        visited[start] = 1;
        for (let head = 0; head < out.length; head++) {
            const cur = out[head];
            const cx = cur % this.width;
            const cz = (cur - cx) / this.width;
            for (const [dx, dz] of dirs) {
                const nx = cx + dx;
                const nz = cz + dz;
                if (!this.inBounds(nx, nz)) continue;
                const n = this.idx(nx, nz);
                if (!visited[n] && pass(n, cur)) {
                    visited[n] = 1;
                    out.push(n);
                }
            }
        }
        return out;
    }

    _components(pass, dirs) {
        const visited = new Uint8Array(this.data.length);
        const components = [];
        for (let i = 0; i < this.data.length; i++) {
            if (!visited[i] && pass(i)) components.push(this._flood(i, pass, dirs, visited));
        }
        return components;
    }

    _pickRandom(cells, count) {
        cells.sort(() => 0.5 - Math.random());
        return cells.slice(0, Math.min(count, cells.length));
    }

    // Walkable top of `floor` (0, 1 or 2) at cell i
    _standable(i, floor) {
        if (floor === 0) return this.data[i] === 0;
        if (this.data[i] !== 1) return false;
        if (floor === 1) return this.dataFloor1[i] === 0;
        return this.dataFloor1[i] === 1 && this.dataFloor2[i] === 0;
    }

    // `reserved`: no new solid structure may be built here. `locked`: no carving here either.
    _mark(i, lock) {
        this.reserved[i] = 1;
        if (lock) this.locked[i] = 1;
    }

    _markRect(x0, z0, x1, z1, lock = false) {
        for (let z = Math.max(0, z0); z <= Math.min(this.height - 1, z1); z++) {
            for (let x = Math.max(0, x0); x <= Math.min(this.width - 1, x1); x++) this._mark(this.idx(x, z), lock);
        }
    }

    _markRamp(seg, lock = false) {
        const slope = SLOPE_BY_TYPE[seg.type];
        for (let d = 0; d < seg.length; d++) {
            for (let k = -2; k <= 1; k++) {
                const x = seg.x + slope.along[0] * d + slope.out[0] * k;
                const z = seg.z + slope.along[1] * d + slope.out[1] * k;
                if (this.inBounds(x, z)) this._mark(this.idx(x, z), lock);
            }
        }
    }

    // Centre of a ramp segment, in grid cells
    _rampCenter(seg) {
        const slope = SLOPE_BY_TYPE[seg.type];
        return { x: seg.x + slope.along[0] * (seg.length - 1) / 2, z: seg.z + slope.along[1] * (seg.length - 1) / 2 };
    }

    _farFromRamps(seg, placed) {
        const c = this._rampCenter(seg);
        return placed.every(other => {
            const o = this._rampCenter(other);
            return Math.max(Math.abs(c.x - o.x), Math.abs(c.z - o.z)) >= RAMP_SPACING;
        });
    }

    _rectFree(x0, z0, x1, z1) {
        if (x0 < 0 || z0 < 0 || x1 >= this.width || z1 >= this.height) return false;
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) if (this.reserved[this.idx(x, z)]) return false;
        }
        return true;
    }

    // ─── Generation ──────────────────────────────────────────────────────────
    generate() {
        const MAX_ATTEMPTS = 50;
        let layout = null;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS && !layout; attempt++) {
            const candidate = this._layoutFloor0();
            if (this.isValidMap(candidate.playerStart)) layout = candidate;
        }
        if (!layout) {
            console.warn("Failed to generate fully connected map after", MAX_ATTEMPTS, "attempts. Returning fallback.");
            layout = this._layoutFloor0();
        }

        // 1. Structure
        this.reserved = new Uint8Array(this.data.length);
        this.locked = new Uint8Array(this.data.length);
        for (const room of [layout.safeRoom, layout.eventRoom, layout.treasureRoom]) {
            this._markRect(room.x - 1, room.z - 1, room.x + room.w, room.z + room.h);
        }
        // Rooms first (they hold content), then ramps around them
        this.generateFloor1();
        this.generateFloor2();
        this.generateRamps();
        this.generateFloor2Ramps();

        // 2. Repair
        this.ensureFloor0Connectivity();
        this._settleUpperFloors();
        this._linkFloor1();
        this._settleUpperFloors();
        this._linkFloor1SpecialRooms(layout.safeRoom);

        // 3. Population
        return this._populate(layout);
    }

    // Floor 0 rooms and corridors; the event and treasure rooms are walled in with 1-2 doors
    _layoutFloor0() {
        this.data = new Array(this.width * this.height).fill(1);
        this.corridorCells = [];

        // First room is forced into a corner: the Safe Room
        const rooms = this._placeRooms(15, 6, 13, (w, h, placedCount) => {
            if (placedCount === 0) {
                const corners = [
                    { x: 2, z: 2 },
                    { x: this.width - w - 3, z: 2 },
                    { x: 2, z: this.height - h - 3 },
                    { x: this.width - w - 3, z: this.height - h - 3 }
                ];
                return corners[Math.floor(Math.random() * corners.length)];
            }
            return {
                x: Math.floor(Math.random() * (this.width - w - 2)) + 1,
                z: Math.floor(Math.random() * (this.height - h - 2)) + 1
            };
        });
        this._assignRoomTypes(rooms, 'safe');
        this._connectRooms(rooms, room => this.createRoom(room), this.data, this.corridorCells);

        const eventRoom = rooms.find(r => r.type === 'event') || rooms[rooms.length - 1];
        const treasureRoom = rooms.find(r => r.type === 'treasure') || rooms[Math.floor(rooms.length / 2)];

        // Enclose special rooms after the corridors have opened them up too much
        const doorCells = [];
        this.encloseRoom(eventRoom, { traps: doorCells });
        this.encloseRoom(treasureRoom, { traps: doorCells });

        return {
            rooms,
            safeRoom: rooms[0],
            eventRoom,
            treasureRoom,
            doorCells,
            playerStart: this.getCenter(rooms[0])
        };
    }

    // Floor 0 → 1 ramps cut into thick walls next to the floor
    generateRamps() {
        const segments = [];
        const fits = (exit, high, low, floor) =>
            this.data[low] === 1 && this.data[high] === 1 && this.data[exit] === 1 && this.data[floor] === 0;

        const findSegments = (len) => {
            // Horizontal (North/South slopes require 3 rows along Z: low, high, wall)
            for (let z = 3; z < this.height - 3; z++) {
                for (let x = 2; x < this.width - len - 1; x++) {
                    const slope = [SLOPES.south, SLOPES.north].find(s => this._rampFits(s, x, z, len, fits));
                    if (slope) segments.push({ x, z, length: len, dir: 'H', type: slope.type });
                }
            }
            // Vertical (East/West slopes require 3 columns along X: low, high, wall)
            for (let z = 2; z < this.height - len - 1; z++) {
                for (let x = 3; x < this.width - 3; x++) {
                    const slope = [SLOPES.east, SLOPES.west].find(s => this._rampFits(s, x, z, len, fits));
                    if (slope) segments.push({ x, z, length: len, dir: 'V', type: slope.type });
                }
            }
        };

        // Long ramps first, then short ones, each group in random order
        findSegments(5);
        const long = segments.splice(0).sort(() => Math.random() - 0.5);
        findSegments(3);
        const short = segments.splice(0).sort(() => Math.random() - 0.5);

        // Spread-out ramps that still fit, without cutting into a special room
        this.placedRamps = [];
        for (const seg of [...long, ...short]) {
            if (this.placedRamps.length >= RAMPS_PER_FLOOR) break;
            const slope = SLOPE_BY_TYPE[seg.type];
            let blocked = !this._farFromRamps(seg, this.placedRamps) || !this._rampFits(slope, seg.x, seg.z, seg.length, fits);
            for (let d = 0; d < seg.length && !blocked; d++) {
                blocked = this.reserved[this._at(slope, seg.x, seg.z, d, 0)] || this.reserved[this._at(slope, seg.x, seg.z, d, -1)];
            }
            if (blocked) continue;

            this.placedRamps.push(seg);
            this._applyRamp(this.data, seg);
            this._markRamp(seg);
        }
    }

    // Floor 1: rooms and corridors on top of the Floor 0 walls. Its special rooms are solid blocks
    // down to the ground, so they are moved off reserved cells (or dropped if there is no room).
    generateFloor1() {
        // Start from Floor 0 walls stacked one level higher
        this.dataFloor1 = this.data.map(v => (v === 1 ? 1 : 0));

        const rooms = this._placeRooms(10, 6, 12, (w, h) => ({
            x: Math.floor(Math.random() * (this.width - w - 4)) + 2,
            z: Math.floor(Math.random() * (this.height - h - 4)) + 2
        }));
        this._assignRoomTypes(rooms);

        for (const room of rooms.filter(isSpecial)) {
            this._resizeSpecialRoom(room);
            if (this._moveToFreeSpot(room)) this._markRect(room.x - 1, room.z - 1, room.x + room.w, room.z + room.h, true);
            else room.type = 'normal';
        }

        this.corridorCellsFloor1 = [];
        this._connectRooms(rooms, (room) => {
            for (let z = room.z; z < room.z + room.h; z++) {
                for (let x = room.x; x < room.x + room.w; x++) {
                    this.dataFloor1[this.idx(x, z)] = 0; // Walkable space
                    if (isSpecial(room)) this.data[this.idx(x, z)] = 1; // Supporting block on Floor 0
                }
            }
        }, this.dataFloor1, this.corridorCellsFloor1);

        // Doors of special rooms open onto an actual walkway
        const walkway = i => this._standable(i, 1);
        const eventRoom = rooms.find(r => r.type === 'event') || null;
        const treasureRoom = rooms.find(r => r.type === 'treasure') || null;
        for (const room of [eventRoom, treasureRoom]) {
            if (room) this.encloseRoom(room, { grid: this.dataFloor1, support: this.data, isOpen: walkway });
        }

        this.floor1Rooms = { eventRoom, treasureRoom, count: rooms.length };
    }

    // Move a room (top-left x/z, size w/h) to the nearest spot where it and its walls touch no reserved cell
    _moveToFreeSpot(room) {
        const fits = (x, z) => x >= 2 && z >= 2 && x + room.w <= this.width - 2 && z + room.h <= this.height - 2 &&
            this._rectFree(x - 1, z - 1, x + room.w, z + room.h);
        if (fits(room.x, room.z)) return true;

        let best = null;
        let bestDist = Infinity;
        for (let z = 2; z + room.h <= this.height - 2; z++) {
            for (let x = 2; x + room.w <= this.width - 2; x++) {
                const dist = (x - room.x) ** 2 + (z - room.z) ** 2;
                if (dist < bestDist && fits(x, z)) {
                    best = { x, z };
                    bestDist = dist;
                }
            }
        }
        if (!best) return false;
        room.x = best.x;
        room.z = best.z;
        return true;
    }

    // Floor 2: one walled room on solid columns, entered through a door with a ramp up from Floor 1.
    // Picks the spot that destroys the least walkable space below.
    generateFloor2() {
        this.dataFloor2 = new Array(this.width * this.height).fill(0);
        this.floor2Room = null;
        this.floor2Ramps = [];
        const size = FLOOR2_ROOM_SIZE;

        let best = null;
        for (let z = 2; z + size <= this.height - 2; z++) {
            for (let x = 2; x + size <= this.width - 2; x++) {
                // Sit on existing stacked walls, clear of reserved cells
                if (this.dataFloor1[this.idx(x + size / 2, z + size / 2)] !== 1) continue;
                if (!this._rectFree(x - 1, z - 1, x + size, z + size)) continue;

                let cost = Math.random(); // Random tie-break
                for (let zz = z - 1; zz <= z + size; zz++) {
                    for (let xx = x - 1; xx <= x + size; xx++) {
                        const i = this.idx(xx, zz);
                        if (this.data[i] !== 1 || this.dataFloor1[i] === 0) cost++; // Floor or walkway lost
                    }
                }
                if (best && cost >= best.cost) continue;

                const room = { x, z, w: size, h: size };
                const door = this._rampDoorOptions(room, 2)[0];
                if (door) best = { room, door, cost };
            }
        }
        if (!best) return;

        const { room, door } = best;
        const setColumn = (i, floor2Value) => {
            this.dataFloor2[i] = floor2Value;
            this.dataFloor1[i] = 1;
            this.data[i] = 1;
        };
        for (let z = room.z - 1; z <= room.z + room.h; z++) {
            for (let x = room.x - 1; x <= room.x + room.w; x++) {
                const onWall = x === room.x - 1 || z === room.z - 1 || x === room.x + room.w || z === room.z + room.h;
                setColumn(this.idx(x, z), onWall ? 1 : 0);
            }
        }
        for (let d = 0; d < door.length; d++) {
            const exit = this._rampExit(door, d);
            this.dataFloor2[this.idx(exit.x, exit.z)] = 0;
        }
        this._applyRamp(this.dataFloor1, door);

        this._markRect(room.x - 1, room.z - 1, room.x + room.w, room.z + room.h, true);
        this._markRamp(door, true);
        this.floor2Room = room;
        this.floor2Ramps.push(door);
    }

    // Doors in the wall ring of an upper-floor room, each with a ramp going straight out of it down one floor.
    // Returns ramp segments (their exits are the door cells), 2-wide ones first, shuffled.
    _rampDoorOptions(room, floor) {
        // Floor 2 ramps are cut into stacked walls; Floor 1 ramps can also stand on open ground
        const base = floor === 2
            ? i => this.data[i] === 1 && this.dataFloor1[i] === 1
            : i => this.data[i] === 1 || this.data[i] === 0;
        const fits = (exit, high, low, landing) => base(high) && base(low) && !this.reserved[high] && !this.reserved[low] &&
            this._standable(landing, floor - 1);
        const sides = [
            { slope: SLOPES.south, x: room.x, z: room.z - 1, span: room.w }, // North wall, ramp heads north
            { slope: SLOPES.north, x: room.x, z: room.z + room.h, span: room.w },
            { slope: SLOPES.east, x: room.x - 1, z: room.z, span: room.h },
            { slope: SLOPES.west, x: room.x + room.w, z: room.z, span: room.h }
        ];

        const all = [];
        for (const length of [2, 1]) {
            const options = [];
            for (const { slope, x, z, span } of sides) {
                for (let d = 0; d + length <= span; d++) {
                    const ex = x + slope.along[0] * d;
                    const ez = z + slope.along[1] * d;
                    const farX = ex + slope.along[0] * (length - 1) + slope.out[0] * 3;
                    const farZ = ez + slope.along[1] * (length - 1) + slope.out[1] * 3;
                    if (!this.inBounds(farX, farZ)) continue;
                    const lowX = ex + 2 * slope.out[0];
                    const lowZ = ez + 2 * slope.out[1];
                    if (this._rampFits(slope, lowX, lowZ, length, fits)) {
                        options.push({ x: lowX, z: lowZ, length, dir: slope.dir, type: slope.type });
                    }
                }
            }
            all.push(...options.sort(() => Math.random() - 0.5));
        }
        return all;
    }

    // Extra ramps from Floor 1 walkways onto the top of Floor 1 walls, spread over the map
    generateFloor2Ramps() {
        const solid = i => this.data[i] === 1 && this.dataFloor1[i] === 1 && !this.reserved[i];
        const fits = (exit, high, low, floor) => solid(exit) && solid(high) && solid(low) && this._standable(floor, 1);

        // Every ramp of width L that fits, in random order
        const findCandidates = (L) => {
            const candidates = [];
            const tryAdd = (slope, cx, cz) => {
                const lowX = cx + 2 * slope.out[0];
                const lowZ = cz + 2 * slope.out[1];
                if (this._rampFits(slope, lowX, lowZ, L, fits)) {
                    candidates.push({ x: lowX, z: lowZ, length: L, dir: slope.dir, type: slope.type });
                }
            };
            for (let cz = 3; cz < this.height - 3; cz++) {
                for (let cx = 3; cx < this.width - L - 3; cx++) {
                    tryAdd(SLOPES.south, cx, cz);
                    tryAdd(SLOPES.north, cx, cz);
                }
            }
            for (let cz = 3; cz < this.height - L - 3; cz++) {
                for (let cx = 3; cx < this.width - 3; cx++) {
                    tryAdd(SLOPES.east, cx, cz);
                    tryAdd(SLOPES.west, cx, cz);
                }
            }
            return candidates.sort(() => Math.random() - 0.5);
        };

        // 3-wide ramps first, 2-wide ones where the walls are too thin
        let placed = 0;
        for (const seg of [...findCandidates(3), ...findCandidates(2)]) {
            if (placed >= RAMPS_PER_FLOOR) break;
            const slope = SLOPE_BY_TYPE[seg.type];
            // The room's door ramp counts for the spacing; grids changed since the candidates were listed
            let clear = this._farFromRamps(seg, this.floor2Ramps) && this._rampFits(slope, seg.x, seg.z, seg.length, fits);
            for (let d = 0; d < seg.length && clear; d++) {
                for (let k = -2; k <= 0 && clear; k++) clear = !this.reserved[this._at(slope, seg.x, seg.z, d, k)];
            }
            if (!clear) continue;
            this._applyRamp(this.dataFloor1, seg);
            this._markRamp(seg, true);
            this.floor2Ramps.push(seg);
            placed++;
        }
    }

    // Upper floors only exist on top of solid structure
    _settleUpperFloors() {
        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i] !== 1) this.dataFloor1[i] = 0;
            if (this.dataFloor1[i] !== 1) this.dataFloor2[i] = 0;
        }
    }

    // Upper-floor supports can cut Floor 0 apart: dig the shortest 2-wide tunnel from each
    // isolated area to the main one, around reserved structure whenever possible.
    ensureFloor0Connectivity() {
        for (let guard = 0; guard < 100; guard++) {
            const components = this._components(i => this.data[i] === 0, DIRS4);
            if (components.length <= 1) return;
            components.sort((a, b) => b.length - a.length);

            const main = new Uint8Array(this.data.length);
            for (const i of components[0]) main[i] = 1;
            const path = this._tunnelPath(components[1], main, true) || this._tunnelPath(components[1], main, false);
            if (!path) return;

            for (const i of path) {
                const x = i % this.width;
                const z = (i - x) / this.width;
                for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
                    const bx = x + dx;
                    const bz = z + dz;
                    if (bx < 1 || bz < 1 || bx >= this.width - 1 || bz >= this.height - 1) continue; // Keep the outer wall
                    const b = this.idx(bx, bz);
                    if (this.data[b] === 1 && (dx + dz === 0 || !this.reserved[b])) this.data[b] = 0;
                }
            }
        }
    }

    // Wall cells to dig between `sources` and any `target` cell (BFS), or null
    _tunnelPath(sources, target, avoidReserved) {
        const visited = new Uint8Array(this.data.length);
        const parent = new Int32Array(this.data.length).fill(-1);
        const queue = [...sources];
        for (const s of sources) visited[s] = 1;

        for (let head = 0; head < queue.length; head++) {
            const cur = queue[head];
            const cx = cur % this.width;
            const cz = (cur - cx) / this.width;
            for (const [dx, dz] of DIRS4) {
                const nx = cx + dx;
                const nz = cz + dz;
                if (nx < 1 || nz < 1 || nx >= this.width - 1 || nz >= this.height - 1) continue;
                const n = this.idx(nx, nz);
                if (visited[n]) continue;
                visited[n] = 1;
                if (target[n]) {
                    const path = [];
                    for (let p = cur; this.data[p] === 1; p = parent[p]) path.push(p);
                    return path;
                }
                if (this.data[n] !== 1 || (avoidReserved && this.reserved[n])) continue;
                parent[n] = cur;
                queue.push(n);
            }
        }
        return null;
    }

    // Floor 0 → 1 access: ramp exits join the Floor 1 walkways, and every walkway island gets a ramp
    _linkFloor1() {
        for (const seg of this.placedRamps) {
            for (let d = 0; d < seg.length; d++) {
                const exit = this._rampExit(seg, d);
                if (!this.inBounds(exit.x, exit.z)) continue;
                const i = this.idx(exit.x, exit.z);
                if (this.data[i] !== 1 || this.locked[i]) continue;
                this.dataFloor1[i] = 0;
                this._connectRampExitToFloor1(exit.x, exit.z);
            }
        }
        this._ensureAllFloor1IslandsHaveRamps();
    }

    // A Floor 1 special room the player still can't reach gets its own door and ramp from the ground
    _linkFloor1SpecialRooms(safeRoom) {
        const center = this.getCenter(safeRoom);
        for (const room of [this.floor1Rooms.eventRoom, this.floor1Rooms.treasureRoom]) {
            if (!room) continue;
            const reach = this._reachFrom(center.x, center.z);
            let reachable = false;
            for (let z = room.z; z < room.z + room.h && !reachable; z++) {
                for (let x = room.x; x < room.x + room.w && !reachable; x++) reachable = reach[this.idx(x, z)] === 1;
            }
            if (reachable) continue;

            for (const door of this._rampDoorOptions(room, 1)) {
                const before = this.data.slice();
                this._applyRamp(this.data, door);
                // A ramp standing on open ground must not cut Floor 0 apart
                if (this._components(i => this.data[i] === 0, DIRS4).length > 1) {
                    this.data = before;
                    continue;
                }
                for (let d = 0; d < door.length; d++) {
                    const exit = this._rampExit(door, d);
                    this.dataFloor1[this.idx(exit.x, exit.z)] = 0; // Open the wall ring, the block below stays
                }
                this._markRamp(door);
                this._settleUpperFloors();
                break;
            }
        }
    }

    // Carve a path on Floor 1 from a ramp exit to the nearest walkable wall-top cell
    _connectRampExitToFloor1(startX, startZ) {
        const start = this.idx(startX, startZ);
        const visited = new Uint8Array(this.data.length);
        const parent = new Int32Array(this.data.length).fill(-1);
        const queue = [start];
        visited[start] = 1;
        let found = -1;

        for (let head = 0; head < queue.length; head++) {
            const cur = queue[head];
            if (cur !== start && this._standable(cur, 1)) {
                found = cur;
                break;
            }
            const cx = cur % this.width;
            const cz = (cur - cx) / this.width;
            for (const [dx, dz] of DIRS4) {
                const nx = cx + dx;
                const nz = cz + dz;
                if (!this.inBounds(nx, nz)) continue;
                const n = this.idx(nx, nz);
                // Walk over Floor 0 walls and ramps, never through locked structure
                if (!visited[n] && this.data[n] >= 1 && this.data[n] <= 9 && !this.locked[n]) {
                    visited[n] = 1;
                    parent[n] = cur;
                    queue.push(n);
                }
            }
        }

        // Carve a 3x3 block around each path node to avoid 1-block wide corridors
        for (let cur = found; cur !== -1; cur = parent[cur]) {
            const cx = cur % this.width;
            const cz = (cur - cx) / this.width;
            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (!this.inBounds(cx + dx, cz + dz)) continue;
                    const i = this.idx(cx + dx, cz + dz);
                    if (!this.locked[i] && this.dataFloor1[i] === 1) this.dataFloor1[i] = 0;
                }
            }
        }
    }

    _ensureAllFloor1IslandsHaveRamps() {
        const islands = this._components(i => this._standable(i, 1), DIRS4)
            .filter(island => island.length >= MIN_FLOOR1_ISLAND);

        const placedRampExits = new Set();
        for (const seg of this.placedRamps) {
            for (let d = 0; d < seg.length; d++) {
                const exit = this._rampExit(seg, d);
                if (this.inBounds(exit.x, exit.z)) placedRampExits.add(this.idx(exit.x, exit.z));
            }
        }

        for (const island of islands) {
            if (island.some(cell => placedRampExits.has(cell))) continue; // Already connected

            const islandSet = new Set(island);
            const fits = (exit, high, low, floor) => islandSet.has(exit) &&
                this.data[high] === 1 && this.data[low] === 1 && this.data[floor] === 0 &&
                !this.reserved[high] && !this.reserved[low];

            // Try placing a ramp of length L in descending order: 3, 2, then 1
            placement:
            for (const L of [3, 2, 1]) {
                for (const cell of island) {
                    const cx = cell % this.width;
                    const cz = Math.floor(cell / this.width);
                    for (const slope of SLOPE_ORDER) {
                        // Farthest cell (floor below, last width offset) must be on the map
                        const fx = cx + slope.along[0] * (L - 1) + slope.out[0] * 3;
                        const fz = cz + slope.along[1] * (L - 1) + slope.out[1] * 3;
                        if (!this.inBounds(fx, fz)) continue;

                        const lowX = cx + 2 * slope.out[0];
                        const lowZ = cz + 2 * slope.out[1];
                        if (!this._rampFits(slope, lowX, lowZ, L, fits)) continue;

                        const seg = { x: lowX, z: lowZ, length: L, dir: slope.dir, type: slope.type };
                        this._applyRamp(this.data, seg);
                        this._markRamp(seg);
                        this.placedRamps.push(seg);
                        for (let d = 0; d < L; d++) {
                            const ex = cx + slope.along[0] * d;
                            const ez = cz + slope.along[1] * d;
                            this._connectRampExitToFloor1(ex, ez);
                            placedRampExits.add(this.idx(ex, ez));
                        }
                        break placement;
                    }
                }
            }
        }
    }

    // ─── Population ──────────────────────────────────────────────────────────

    // Cells the player can walk or jump to from (x, z): any drop, climbs of at most PLAYER_CLIMB
    _reachFrom(x, z) {
        const tops = new Float32Array(this.data.length);
        for (let i = 0; i < tops.length; i++) tops[i] = cellTopHeight(this.data[i], this.dataFloor1[i], this.dataFloor2[i]);
        const visited = new Uint8Array(this.data.length);
        this._flood(this.idx(x, z), (n, cur) => tops[n] - tops[cur] <= PLAYER_CLIMB, DIRS4, visited);
        return visited;
    }

    // Nearest cell to (x, z) within `maxR` accepted by `ok`, or null
    _nearestCell(x, z, maxR, ok) {
        let best = null;
        let bestDist = Infinity;
        for (let dz = -maxR; dz <= maxR; dz++) {
            for (let dx = -maxR; dx <= maxR; dx++) {
                const nx = Math.round(x) + dx;
                const nz = Math.round(z) + dz;
                const dist = dx * dx + dz * dz;
                if (dist < bestDist && this.inBounds(nx, nz) && ok(this.idx(nx, nz), nx, nz)) {
                    best = { x: nx, z: nz };
                    bestDist = dist;
                }
            }
        }
        return best;
    }

    // Player start: centre of the safe room, sometimes on a wall top above it (if they can get down)
    _choosePlayerStart(safeRoom) {
        const center = this.getCenter(safeRoom);
        const r = Math.random();
        if (r >= 0.33) {
            const floor = r < 0.66 ? 1 : 2;
            const from = floor === 1 ? center : { x: safeRoom.x - 1, z: safeRoom.z - 1 };
            const cell = this._nearestCell(from.x, from.z, floor === 1 ? 10 : 4, i => this._standable(i, floor));
            if (cell && this._reachFrom(cell.x, cell.z)[this.idx(center.x, center.z)]) {
                return { x: cell.x, z: cell.z, y: floor * H };
            }
        }
        return { x: center.x, z: center.z, y: 0 };
    }

    _populate(layout) {
        const { rooms, safeRoom, eventRoom, treasureRoom, doorCells } = layout;
        const playerStart = this._choosePlayerStart(safeRoom);
        const reach = this._reachFrom(playerStart.x, playerStart.z);
        const occupied = new Uint8Array(this.data.length);

        // Grid cells under a spawn point (x.5 coordinates sit on the corner of 4 cells)
        const cellsUnder = (p) => {
            const cells = [];
            for (const z of new Set([Math.floor(p.z), Math.ceil(p.z)])) {
                for (const x of new Set([Math.floor(p.x), Math.ceil(p.x)])) cells.push({ x, z });
            }
            return cells;
        };
        // A spot is usable if it stands on its floor, the player can reach it and nothing else is there
        const usable = (p, floor) => cellsUnder(p).every(({ x, z }) => {
            if (!this.inBounds(x, z)) return false;
            const i = this.idx(x, z);
            return this._standable(i, floor) && reach[i] && !occupied[i];
        });
        const claim = (p) => {
            for (const { x, z } of cellsUnder(p)) occupied[this.idx(x, z)] = 1;
            return p;
        };
        // `p` if usable, else the nearest usable cell inside `room`
        const spawnIn = (p, floor, room) => {
            if (usable(p, floor)) return claim(p);
            const cell = this._nearestCell(p.x, p.z, Math.max(room.w, room.h), (i, x, z) =>
                x >= room.x && x < room.x + room.w && z >= room.z && z < room.z + room.h && usable({ x, z }, floor));
            return cell ? claim(cell) : null;
        };
        const sentinelsAround = (center, count, offsets, floor, out) => {
            if (!center) return;
            let placed = 0;
            for (let i = 0; i < offsets.length && placed < count; i++) {
                const spot = { x: Math.floor(center.x) + offsets[i].x, z: Math.floor(center.z) + offsets[i].z };
                if (usable(spot, floor)) {
                    out.push(claim(spot));
                    placed++;
                }
            }
        };
        const pickSpots = (cells, count, floor, out) => {
            for (const c of [...cells].sort(() => 0.5 - Math.random())) {
                if (out.length >= count) break;
                if (usable(c, floor)) out.push(claim({ x: c.x, z: c.z }));
            }
        };
        claim(playerStart);

        // Floor 0: event and treasure rooms, their guards, traps on doors and corridors
        const eventSpawn = spawnIn(this.getExactCenter(eventRoom), 0, eventRoom);
        const eventType = randomEventType();
        const treasureSpawn = spawnIn(this.getExactCenter(treasureRoom), 0, treasureRoom);

        const sentinels = [];
        sentinelsAround(treasureSpawn, 4, SENTINEL_OFFSETS_FLOOR0, 0, sentinels);
        sentinelsAround(eventSpawn, 2, SENTINEL_OFFSETS_FLOOR0, 0, sentinels);

        const spikeTraps = [];
        pickSpots(doorCells, doorCells.length, 0, spikeTraps);
        const minTrapDistFromStart = 8;
        const corridorTraps = this.corridorCells.filter(c => Math.hypot(c.x - playerStart.x, c.z - playerStart.z) > minTrapDistFromStart);
        pickSpots(corridorTraps, spikeTraps.length + 4 + Math.floor(rooms.length * 0.7), 0, spikeTraps);

        // Floor 1: a random spot inside each special room
        const randomSpotIn = (room, floor) => {
            if (!room) return null;
            const cells = [];
            for (let z = room.z; z < room.z + room.h; z++) {
                for (let x = room.x; x < room.x + room.w; x++) if (usable({ x, z }, floor)) cells.push({ x, z });
            }
            return cells.length ? claim(cells[Math.floor(Math.random() * cells.length)]) : null;
        };
        const eventSpawnFloor1 = randomSpotIn(this.floor1Rooms.eventRoom, 1);
        const treasureSpawnFloor1 = randomSpotIn(this.floor1Rooms.treasureRoom, 1);
        const eventTypeFloor1 = randomEventType();

        const sentinelsFloor1 = [];
        sentinelsAround(treasureSpawnFloor1, 4, SENTINEL_OFFSETS_FLOOR1, 1, sentinelsFloor1);
        sentinelsAround(eventSpawnFloor1, 2, SENTINEL_OFFSETS_FLOOR1, 1, sentinelsFloor1);

        const spikeTrapsFloor1 = [];
        pickSpots(this.corridorCellsFloor1, 3 + Math.floor(this.floor1Rooms.count * 0.5), 1, spikeTrapsFloor1);

        // Floor 2: the event at the centre of the room
        const room2 = this.floor2Room;
        const eventSpawnFloor2 = room2 ? spawnIn({ x: room2.x + room2.w / 2, z: room2.z + room2.h / 2 }, 2, room2) : null;

        return {
            width: this.width,
            height: this.height,
            data: this.data,
            dataFloor1: this.dataFloor1,
            dataFloor2: this.dataFloor2,
            cellSize: CONSTANTS.CELL_SIZE,
            rooms,
            safeRoom,
            playerStart,
            spikeTraps,
            sentinels,
            eventSpawn,
            eventType,
            treasureSpawn,
            spikeTrapsFloor1,
            sentinelsFloor1,
            eventSpawnFloor1,
            eventTypeFloor1,
            treasureSpawnFloor1,
            eventSpawnFloor2
        };
    }

    // ─── Rooms and corridors ─────────────────────────────────────────────────
    _resizeSpecialRoom(room) {
        if (!isSpecial(room)) return;
        // Force special rooms to be isolated chambers of a fixed size
        const size = room.type === 'event' ? 8 : 11;
        const startX = Math.floor(room.x + (room.w - size) / 2);
        const startZ = Math.floor(room.z + (room.h - size) / 2);
        room.x = Math.max(2, Math.min(this.width - size - 2, startX));
        room.z = Math.max(2, Math.min(this.height - size - 2, startZ));
        room.w = size;
        room.h = size;
    }

    _placeRooms(count, minSize, maxSize, pickPosition) {
        const rooms = [];
        for (let i = 0; i < count; i++) {
            const w = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize;
            const h = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize;
            const room = { ...pickPosition(w, h, rooms.length), w, h };
            if (!rooms.some(other => this.intersects(room, other))) rooms.push(room);
        }
        return rooms;
    }

    _assignRoomTypes(rooms, firstType = null) {
        rooms.forEach((room, i) => {
            if (i === 0 && firstType) room.type = firstType;
            else if (i === rooms.length - 1) room.type = 'event';
            else if (i === Math.floor(rooms.length / 2)) room.type = 'treasure';
            else room.type = 'normal';
        });
    }

    _connectRooms(rooms, carveRoom, grid, cells) {
        rooms.forEach((room, idx) => {
            carveRoom(room);
            if (idx === 0) return;
            const newCenter = this.getCenter(room);
            const prevCenter = this.getCenter(rooms[idx - 1]);
            // Randomly choose horizontal then vertical OR vertical then horizontal
            if (Math.random() > 0.5) {
                this.createHCorridor(prevCenter.x, newCenter.x, prevCenter.z, grid, cells);
                this.createVCorridor(prevCenter.z, newCenter.z, newCenter.x, grid, cells);
            } else {
                this.createVCorridor(prevCenter.z, newCenter.z, prevCenter.x, grid, cells);
                this.createHCorridor(prevCenter.x, newCenter.x, prevCenter.z, grid, cells);
            }
        });
    }

    createRoom(room) {
        this._resizeSpecialRoom(room);

        // Carve floor
        for (let z = room.z; z < room.z + room.h; z++) {
            for (let x = room.x; x < room.x + room.w; x++) {
                this.data[this.idx(x, z)] = 0;
            }
        }

        // Add internal pillars to Normal rooms that are large enough
        if (room.type === 'normal' && room.w >= 7 && room.h >= 7) {
            const cx = Math.floor(room.x + room.w / 2);
            const cz = Math.floor(room.z + room.h / 2);
            const rand = Math.random();

            if (rand < 0.35) {
                // Central 2x2 pillar
                for (let dz = -1; dz <= 0; dz++) {
                    for (let dx = -1; dx <= 0; dx++) {
                        this.data[this.idx(cx + dx, cz + dz)] = 1;
                    }
                }
            } else if (rand < 0.7) {
                // 4 Small corner pillars
                const offset = 1;
                this.data[this.idx(room.x + offset, room.z + offset)] = 1;
                this.data[this.idx(room.x + offset, room.z + room.h - 1 - offset)] = 1;
                this.data[this.idx(room.x + room.w - 1 - offset, room.z + offset)] = 1;
                this.data[this.idx(room.x + room.w - 1 - offset, room.z + room.h - 1 - offset)] = 1;
            }
        }
    }

    // Corridors are 7 cells wide. `grid`/`cells` default to Floor 0.
    createHCorridor(x1, x2, z, grid = this.data, cells = this.corridorCells) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
            grid[z * this.width + x] = 0;
            cells.push({ x, z });
            if (z > 1) grid[(z - 1) * this.width + x] = 0;
            if (z > 2) grid[(z - 2) * this.width + x] = 0;
            if (z > 3) grid[(z - 3) * this.width + x] = 0;
            if (z < this.height - 2) grid[(z + 1) * this.width + x] = 0;
            if (z < this.height - 3) grid[(z + 2) * this.width + x] = 0;
            if (z < this.height - 4) grid[(z + 3) * this.width + x] = 0;
        }
    }

    createVCorridor(z1, z2, x, grid = this.data, cells = this.corridorCells) {
        for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) {
            grid[z * this.width + x] = 0;
            cells.push({ x, z });
            if (x > 1) grid[z * this.width + (x - 1)] = 0;
            if (x > 2) grid[z * this.width + (x - 2)] = 0;
            if (x > 3) grid[z * this.width + (x - 3)] = 0;
            if (x < this.width - 2) grid[z * this.width + (x + 1)] = 0;
            if (x < this.width - 3) grid[z * this.width + (x + 2)] = 0;
            if (x < this.width - 4) grid[z * this.width + (x + 3)] = 0;
        }
    }

    getCenter(room) {
        return {
            x: Math.floor(room.x + room.w / 2),
            z: Math.floor(room.z + room.h / 2)
        };
    }

    getExactCenter(room) {
        return {
            x: room.x + room.w / 2 - 0.5,
            z: room.z + room.h / 2 - 0.5
        };
    }

    intersects(room1, room2) {
        return (
            room1.x <= room2.x + room2.w &&
            room1.x + room1.w >= room2.x &&
            room1.z <= room2.z + room2.h &&
            room1.z + room1.h >= room2.z
        );
    }

    isValidMap(startPos) {
        let totalFloorCount = 0;
        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i] === 0) totalFloorCount++;
        }
        const visited = new Uint8Array(this.data.length);
        const reachable = this._flood(this.idx(startPos.x, startPos.z), i => this.data[i] === 0, DIRS4, visited);
        return reachable.length === totalFloorCount;
    }

    /**
     * Wall a room in on `grid` and open 1-2 doors (2 cells wide) where the outside cell `isOpen`.
     * `support` gets the same walls (solid structure under an upper-floor room); door cells go to `traps`.
     */
    encloseRoom(room, { grid = this.data, support = null, isOpen = i => grid[i] === 0, traps = null } = {}) {
        const px = room.x - 1;
        const pz = room.z - 1;
        const pw = room.w + 2;
        const ph = room.h + 2;
        const setWall = (x, z) => {
            grid[this.idx(x, z)] = 1;
            if (support) support[this.idx(x, z)] = 1;
        };

        for (let x = px; x < px + pw; x++) {
            if (x >= 0 && x < this.width && pz >= 0) setWall(x, pz);
            if (x >= 0 && x < this.width && (pz + ph - 1) < this.height) setWall(x, pz + ph - 1);
        }
        for (let z = pz; z < pz + ph; z++) {
            if (z >= 0 && z < this.height && px >= 0) setWall(px, z);
            if (z >= 0 && z < this.height && (px + pw - 1) < this.width) setWall(px + pw - 1, z);
        }

        // Door candidates: perimeter cells facing an open cell outside
        const doors = [];
        if (pz - 1 >= 0) {
            for (let x = px + 1; x < px + pw - 1; x++) {
                if (isOpen(this.idx(x, pz - 1))) doors.push({ x, z: pz, wall: 'H' });
            }
        }
        if (pz + ph < this.height) {
            for (let x = px + 1; x < px + pw - 1; x++) {
                if (isOpen(this.idx(x, pz + ph))) doors.push({ x, z: pz + ph - 1, wall: 'H' });
            }
        }
        if (px - 1 >= 0) {
            for (let z = pz + 1; z < pz + ph - 1; z++) {
                if (isOpen(this.idx(px - 1, z))) doors.push({ x: px, z, wall: 'V' });
            }
        }
        if (px + pw < this.width) {
            for (let z = pz + 1; z < pz + ph - 1; z++) {
                if (isOpen(this.idx(px + pw, z))) doors.push({ x: px + pw - 1, z, wall: 'V' });
            }
        }

        doors.sort(() => Math.random() - 0.5);

        // Anti-softlock: if no doors found, force one and carve a path outwards
        if (doors.length === 0) {
            const cx = Math.floor(room.x + room.w / 2);
            doors.push({ x: cx, z: pz, wall: 'H' });
            for (let i = 1; i < 6; i++) {
                if (pz - i >= 0) grid[this.idx(cx, pz - i)] = 0;
            }
        }

        const selectedDoors = [];
        const numDoors = Math.max(1, Math.min(doors.length, 1 + Math.floor(Math.random() * 2)));
        for (const door of doors) {
            if (selectedDoors.length >= numDoors) break;
            // Keep doors at least 4 cells apart
            if (!selectedDoors.some(sd => Math.abs(sd.x - door.x) + Math.abs(sd.z - door.z) < 4)) {
                selectedDoors.push(door);
            }
        }
        if (selectedDoors.length === 0 && doors.length > 0) selectedDoors.push(doors[0]);

        for (const door of selectedDoors) {
            const cells = [{ x: door.x, z: door.z }];
            if (door.wall === 'H' && door.x + 1 < this.width) cells.push({ x: door.x + 1, z: door.z });
            if (door.wall === 'V' && door.z + 1 < this.height) cells.push({ x: door.x, z: door.z + 1 });
            for (const c of cells) {
                grid[this.idx(c.x, c.z)] = 0;
                if (traps) traps.push(c);
            }
        }
    }

    generateArena() {
        this.data = new Array(this.width * this.height).fill(1);

        // One massive room
        const margin = 5;
        const room = {
            x: margin,
            z: margin,
            w: this.width - (margin * 2),
            h: this.height - (margin * 2)
        };
        this.createRoom(room);

        const cx = Math.floor(this.width / 2);
        const cz = Math.floor(this.height / 2);
        const offset = 10;

        // No Floor 1 maze in the arena: Floor 1 only mirrors Floor 0 walls
        this.dataFloor1 = this.data.map(v => (v === 1 ? 1 : 0));

        return {
            width: this.width,
            height: this.height,
            data: this.data,
            dataFloor1: this.dataFloor1,
            playerStart: { x: cx, z: cz - offset - 5 }, // Start away from center
            cellSize: CONSTANTS.CELL_SIZE,
            rooms: [room],
            safeRoom: room,
            isArena: true,
            bossSpawn: { x: cx, z: cz }
        };
    }
}
