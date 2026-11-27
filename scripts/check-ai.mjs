// Enemy navigation check, in plain Node (no browser): `npm run check:ai` (or `node scripts/check-ai.mjs 30`).
//   1. Pathfinder rules on random paths: jumps only between orthogonal neighbours, every walk leg
//      walkable straight, and a path exists exactly when the cell can be reached.
//   2. 60 simulated seconds of real enemies (Enemy, EnemyAI, Pathfinder) on generated levels, the
//      player standing at the level's start, then anywhere: how many come to shoot at the player,
//      and how many end up stuck, going round in circles or inside a wall.
import * as THREE from 'three';

// No sound and no canvas in Node
const silent = () => new Proxy(function () {}, { get: () => silent(), apply: () => silent(), construct: () => silent() });
globalThis.window = { AudioContext: silent() };
globalThis.Audio = silent();
globalThis.fetch = () => Promise.reject(new Error('offline'));
globalThis.document = { getElementById: () => null };
console.warn = () => {};
let simTime = 0;
performance.now = () => simTime * 1000; // The AI times itself with performance.now()

const { MapGenerator, mapSizeForLevel } = await import('../src/systems/MapGenerator.js');
const { LevelManager } = await import('../src/systems/LevelManager.js');
const { Pathfinder } = await import('../src/systems/Pathfinder.js');
const { Enemy } = await import('../src/entities/Enemy.js');
const { CONSTANTS } = await import('../src/core/Constants.js');
const { EnemyAI } = await import('../src/entities/EnemyAI.js');

// Shot damage: +1.125 a level up to level 30, then +3 % a level compounded
const shot = (level) => EnemyAI.getCombatStats(level).damage;
if (shot(30) !== 38.75 || shot(20) !== 27.5 || Math.abs(shot(60) - 38.75 * 1.03 ** 30) > 1e-9) throw new Error(`enemy damage curve: ${shot(20)}, ${shot(30)}, ${shot(60)}`);
const C = CONSTANTS.CELL_SIZE;

const LEVELS = Number(process.argv[2]) || 30;
const SECONDS = 60;
const ENEMIES = 15;
const mulberry32 = (a) => () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

function buildLevel(seed) {
    Math.random = mulberry32(seed * 7919);
    const level = [2, 3, 4, 6, 7, 8][seed % 6];
    const size = mapSizeForLevel(level) + (seed % 4) * 8; // The game's size, and larger ones
    const ld = new MapGenerator(size, size).generate(level);
    const lm = Object.assign(Object.create(LevelManager.prototype), {
        width: size, height: size, data: ld.data, dataFloor1: ld.dataFloor1, dataFloor2: ld.dataFloor2,
        cellSize: C, decorationPositions: [], levelData: ld, solidProps: []
    });
    lm.pathfinder = new Pathfinder(lm);
    return { ld, lm, level, size };
}

// Reference reachability: breadth-first over the same walk/jump rules, towards `target`
function distanceField(pf, size, target) {
    const dist = new Float64Array(size * size).fill(Infinity);
    const queue = [target];
    dist[target] = 0;
    for (let head = 0; head < queue.length; head++) {
        const cur = queue[head], cx = cur % size, cz = (cur - cx) / size;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, nz = cz + dz;
            if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
            const n = nz * size + nx;
            if (dist[n] !== Infinity || !pf.canTransition(nx, nz, cx, cz)) continue;
            dist[n] = dist[cur] + 1;
            queue.push(n);
        }
    }
    return dist;
}

const failures = [];
const realStart = Date.now();

// ─── 1. Pathfinder rules ─────────────────────────────────────────────────────
let paths = 0, searchMs = 0;
for (let seed = 1; seed <= Math.min(LEVELS, 10); seed++) {
    const { lm, size } = buildLevel(seed);
    const pf = lm.pathfinder;
    for (let k = 0; k < 100; k++) {
        const a = lm.getRandomEmptyPosition(), b = lm.getRandomEmptyPosition();
        if (!a || !b) continue;
        const from = new THREE.Vector3(lm.gridToWorld(a.x), a.y, lm.gridToWorld(a.z));
        const to = new THREE.Vector3(lm.gridToWorld(b.x), b.y, lm.gridToWorld(b.z));
        const s = process.hrtime.bigint();
        const path = pf.findPath(from, to);
        searchMs += Number(process.hrtime.bigint() - s) / 1e6;
        paths++;
        const reachable = Number.isFinite(distanceField(pf, size, b.z * size + b.x)[a.z * size + a.x]);
        if (!!path !== reachable) failures.push(`chemin ${path ? 'trouvé vers une case inatteignable' : 'introuvable vers une case atteignable'} (graine ${seed})`);
        if (!path) continue;
        for (let i = 1; i < path.length; i++) {
            const p = path[i - 1], q = path[i];
            if (q.jump) {
                const dx = Math.abs(Math.floor(q.x / C) - Math.floor(p.x / C)), dz = Math.abs(Math.floor(q.z / C) - Math.floor(p.z / C));
                if (dx + dz !== 1) failures.push(`saut entre deux cases non voisines (graine ${seed})`);
            } else if (i > 1 && !pf.canWalkStraight(p, q)) {
                failures.push(`tronçon de marche impraticable (graine ${seed})`);
            }
        }
    }
}

// ─── 2. Simulated chase ──────────────────────────────────────────────────────
function simulate(playerAnywhere) {
    const r = { enemies: 0, engaged: 0, stuck: 0, circling: 0, inWall: 0, times: [] };
    for (let seed = 1; seed <= LEVELS; seed++) {
        const { ld, lm, level, size } = buildLevel(seed);
        const pf = lm.pathfinder;
        const start = (playerAnywhere && lm.getRandomEmptyPosition()) || ld.playerStart;
        const player = { position: new THREE.Vector3(lm.gridToWorld(start.x), (start.y || 0) + 1.6, lm.gridToWorld(start.z)), radius: 0.3, takeDamage() {}, camera: null };
        const field = distanceField(pf, size, start.z * size + start.x);
        const entityManager = { entities: [], add() {} };

        // Spawn as Game.spawnEnemies does: ≥ 30 m away, 3 m around free of walls, out of the safe room
        const safe = ld.safeRoom;
        for (let tries = 0; entityManager.entities.length < ENEMIES && tries < 3000; tries++) {
            const cell = lm.getRandomEmptyPosition();
            if (!cell || !Number.isFinite(field[cell.z * size + cell.x])) continue;
            if (cell.x >= safe.x - 1 && cell.x <= safe.x + safe.w + 1 && cell.z >= safe.z - 1 && cell.z <= safe.z + safe.h + 1) continue;
            const p = new THREE.Vector3(lm.gridToWorld(cell.x), cell.y, lm.gridToWorld(cell.z));
            if (p.distanceToSquared(player.position) < 900) continue;
            const d = 2.1;
            if ([[3, 0], [-3, 0], [0, 3], [0, -3], [d, d], [-d, d], [d, -d], [-d, -d]].some(([ox, oz]) => lm.isWall(p.x + ox, p.z + oz, p.y))) continue;
            const enemy = new Enemy(p, lm, entityManager, level);
            enemy.ai.shoot = () => {};
            enemy.healthSystem.updateHealthBar = () => {};
            entityManager.entities.push(enemy);
        }

        const t0 = simTime;
        const tracks = entityManager.entities.map(e => ({ e, engagedAt: null, history: [], inWall: 0 }));
        for (let f = 0; f < SECONDS * 60; f++) {
            simTime += 1 / 60;
            for (const t of tracks) {
                t.e.update(1 / 60, player);
                const p = t.e.position;
                if (!t.e.ai.jumpState && lm.isWall(p.x, p.z, p.y - 0.8)) t.inWall++;
            }
            if (f % 60 !== 0) continue;
            for (const t of tracks) {
                const p = t.e.position;
                t.history.push({ x: p.x, z: p.z, d: field[Math.floor(p.z / C) * size + Math.floor(p.x / C)] });
                if (t.engagedAt === null && p.distanceTo(player.position) < 12.5 && pf.hasLineOfSight(p, player.position, 0)) t.engagedAt = simTime - t0;
            }
        }

        for (const t of tracks) {
            r.enemies++;
            if (t.inWall > 30) r.inWall++;
            if (t.engagedAt !== null) {
                r.engaged++;
                r.times.push(t.engagedAt);
                continue;
            }
            // Over the last 10 s: barely moved (stuck), or moved without getting any closer (circling)
            const h = t.history, last = h[h.length - 1], before = h[h.length - 11];
            const walked = h.slice(-11).reduce((sum, q, i, a) => sum + (i ? Math.hypot(q.x - a[i - 1].x, q.z - a[i - 1].z) : 0), 0);
            const nearPlayer = t.e.position.distanceTo(player.position) <= 11;
            if (!nearPlayer && walked < 2) r.stuck++;
            else if (!nearPlayer && last.d >= before.d) r.circling++;
        }
    }
    return r;
}

const pct = (n, total) => (100 * n / total).toFixed(1) + ' %';
console.log(`Pathfinder : ${paths} chemins vérifiés, ${(searchMs / paths).toFixed(2)} ms par recherche`);
for (const [label, anywhere] of [['joueur au départ', false], ['joueur n\'importe où', true]]) {
    const r = simulate(anywhere);
    const times = r.times.sort((a, b) => a - b);
    console.log(`Poursuite, ${label} : ${r.enemies} ennemis sur ${LEVELS} niveaux, ${SECONDS} s`);
    console.log(`  à portée et en vue du joueur : ${pct(r.engaged, r.enemies)} (médiane ${times.length ? times[times.length >> 1].toFixed(0) : '-'} s)`);
    console.log(`  coincés ${pct(r.stuck, r.enemies)}, en boucle ${pct(r.circling, r.enemies)}, dans un mur ${pct(r.inWall, r.enemies)}`);
    if (r.engaged / r.enemies < 0.95) failures.push(`${label} : moins de 95 % des ennemis atteignent le joueur`);
    if ((r.stuck + r.circling + r.inWall) / r.enemies > 0.01) failures.push(`${label} : plus de 1 % d'ennemis coincés, en boucle ou dans un mur`);
}

const unique = [...new Set(failures)];
if (unique.length) {
    unique.forEach(f => console.log('ÉCHEC ' + f));
    process.exit(1);
}
console.log(`OK (${((Date.now() - realStart) / 1000).toFixed(0)} s)`);
