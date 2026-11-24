// Generates many seeded levels and checks the structural invariants the game relies on.
// Runs in plain Node, no browser needed: `npm run check:levels` (or `node scripts/check-levels.mjs 1000`).
//   - every spawn (start, chests, events, sentinels, traps) stands on its floor, not inside a wall
//   - the player can walk or jump to every spawn from the start
//   - no upper-floor structure floats over an empty cell
//   - Floor 0 is one connected area
import { MapGenerator } from '../src/systems/MapGenerator.js';
import { LevelManager } from '../src/systems/LevelManager.js';
import { Pathfinder } from '../src/systems/Pathfinder.js';
import { CONSTANTS } from '../src/core/Constants.js';

const SEEDS = Number(process.argv[2]) || 300;
const H = CONSTANTS.WALL_HEIGHT;
const PLAYER_CLIMB = 1.6; // Same model as MapGenerator: any drop, climbs of at most 1.6m
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Deterministic Math.random so a failing seed can be replayed
const mulberry32 = (a) => () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

const flood = (width, height, start, pass) => {
    const seen = new Uint8Array(width * height);
    const queue = [start];
    seen[start] = 1;
    for (let head = 0; head < queue.length; head++) {
        const cur = queue[head];
        const cx = cur % width;
        const cz = (cur - cx) / width;
        for (const [dx, dz] of DIRS) {
            const nx = cx + dx;
            const nz = cz + dz;
            if (nx < 0 || nz < 0 || nx >= width || nz >= height) continue;
            const n = nz * width + nx;
            if (!seen[n] && pass(n, cur)) {
                seen[n] = 1;
                queue.push(n);
            }
        }
    }
    return seen;
};

const failures = new Map(); // invariant -> failing seeds
const fail = (what, seed) => {
    if (!failures.has(what)) failures.set(what, []);
    failures.get(what).push(seed);
};

console.warn = () => {};
const t0 = performance.now();
for (let seed = 1; seed <= SEEDS; seed++) {
    Math.random = mulberry32(seed);
    const size = Math.min(95, 55 + Math.floor((seed % 30) * 1.3)); // Same range as Game.startNewLevel
    const ld = new MapGenerator(size, size).generate();
    const { width, height } = ld;

    // Query the level the way the game does, without building any mesh
    const lm = Object.assign(Object.create(LevelManager.prototype), {
        width, height, data: ld.data, dataFloor1: ld.dataFloor1, dataFloor2: ld.dataFloor2,
        cellSize: CONSTANTS.CELL_SIZE, decorationPositions: [], levelData: ld
    });
    const pathfinder = new Pathfinder(lm);
    const top = (i) => pathfinder.getCellHeight(i % width, Math.floor(i / width));

    const start = ld.playerStart;
    const reach = flood(width, height, start.z * width + start.x, (n, cur) => top(n) - top(cur) <= PLAYER_CLIMB);

    const checkSpawn = (label, floor, p) => {
        if (!p) return;
        const pos = lm.floorPositionAt(p.x, p.z, floor * H);
        if (lm.isWall(pos.x, pos.z, pos.y)) fail(`${label} (étage ${floor}) dans un mur`, seed);
        const cell = Math.floor(pos.z / CONSTANTS.CELL_SIZE) * width + Math.floor(pos.x / CONSTANTS.CELL_SIZE);
        if (!reach[cell]) fail(`${label} (étage ${floor}) inatteignable`, seed);
    };
    checkSpawn('départ du joueur', (start.y || 0) / H, start);
    checkSpawn('coffre', 0, ld.treasureSpawn);
    checkSpawn('coffre', 1, ld.treasureSpawnFloor1);
    checkSpawn('événement', 0, ld.eventSpawn);
    checkSpawn('événement', 1, ld.eventSpawnFloor1);
    checkSpawn('événement', 2, ld.eventSpawnFloor2);
    ld.sentinels.forEach(p => checkSpawn('tourelle', 0, p));
    ld.sentinelsFloor1.forEach(p => checkSpawn('tourelle', 1, p));
    ld.spikeTraps.forEach(p => checkSpawn('piège', 0, p));
    ld.spikeTrapsFloor1.forEach(p => checkSpawn('piège', 1, p));

    for (let i = 0; i < width * height; i++) {
        if ((ld.dataFloor1[i] !== 0 && ld.data[i] !== 1) || (ld.dataFloor2[i] !== 0 && ld.dataFloor1[i] !== 1)) {
            fail('structure flottante', seed);
            break;
        }
    }

    const firstFloor = ld.data.indexOf(0);
    const floor0 = flood(width, height, firstFloor, n => ld.data[n] === 0);
    if (ld.data.some((v, i) => v === 0 && !floor0[i])) fail('rez-de-chaussée coupé en plusieurs zones', seed);
}

const ms = (performance.now() - t0) / SEEDS;
if (failures.size === 0) {
    console.log(`OK: ${SEEDS} niveaux, tous les invariants tiennent (${ms.toFixed(1)} ms par niveau).`);
} else {
    for (const [what, seeds] of failures) {
        const unique = [...new Set(seeds)];
        console.log(`ÉCHEC ${what} : ${seeds.length} cas sur ${unique.length} niveau(x), graines ${unique.slice(0, 8).join(', ')}${unique.length > 8 ? '…' : ''}`);
    }
    process.exit(1);
}
