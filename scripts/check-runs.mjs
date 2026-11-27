// Run log, end to end: RunLog records two runs (one with a cheat), the real collector receives them on a
// spare port and writes them to a temporary file, the stats read them back. Also checks the collector refuses
// what is not a run chunk. Usage: npm run check:runs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLog } from '../src/systems/RunLog.js';
import { aggregate, readRuns, report } from './run-stats.mjs';

const bodies = [];
runLog.send = (body) => bodies.push(body);

// A run: level 1 cleared, upgrades, shop, fountain, altar, then death on level 2
runLog.start({ touch: false, phone: false });
runLog.beginLevel(1, { theme: 'Bunker', enemies: 7, rooms: ['shop', 'fountain', 'altar'] });
runLog.add('time', 30);
runLog.add('frames', 1800);
runLog.add('time.staff', 20);
runLog.add('time.sword', 10);
runLog.hit('staff', 50, true);
runLog.hit('sword', 30, false);
runLog.hurt('Ennemi', 12);
runLog.event('shop', { gold: 300, offered: ['armor', 'regen', 'reach'], bought: ['upgrade2', 'potion'], left: 20 });
runLog.event('fountain');
runLog.event('pact', { offered: ['berserker', 'storm'], picked: 'berserker' });
runLog.endLevel('clear', { hp: 88, maxHp: 100, gold: 20 });
runLog.event('upgrades', { from: 'level', points: 2, offered: ['damage', 'fireRate', 'meleeDamage'], picked: ['damage', 'meleeDamage'] });
runLog.beginLevel(2, { theme: 'Bunker', enemies: 9, rooms: [] });
runLog.hurt('Ennemi', 200);
runLog.endLevel('death', { hp: 0, maxHp: 100, gold: 20 });
runLog.event('end', { outcome: 'death', cause: 'Ennemi' });
runLog.flush();
// A run with a dev cheat: left out of the stats
runLog.start({ touch: true, phone: true });
runLog.event('cheat');
runLog.flush();
assert.equal(bodies.length, 4, 'one chunk per level end, one at death, one for the cheat run');
assert.equal(JSON.parse(bodies[3]).events[0].lvl, 0, "a new run does not start at the last run's level");

// The collector, on a spare port, writing to a temporary file
const dir = mkdtempSync(join(tmpdir(), 'runs-'));
const file = join(dir, 'runs.jsonl');
const port = 20000 + Math.floor(Math.random() * 20000);
const server = spawn(process.execPath, ['server/runs-collector.mjs'], { env: { ...process.env, PORT: port, RUNS_FILE: file } });
try {
    await new Promise((resolve, reject) => {
        server.stdout.once('data', resolve);
        server.once('exit', () => reject(new Error('the collector stopped')));
    });
    const post = (body, method = 'POST') => fetch(`http://127.0.0.1:${port}/api/runs`, { method, body }).then(r => r.status);
    for (const body of bodies) assert.equal(await post(body), 204);
    assert.equal(await post('not json'), 400);
    assert.equal(await post(JSON.stringify({ run: '../../etc', seq: 0, events: [{ t: 0, type: 'run' }] })), 400);
    assert.equal(await post(JSON.stringify({ run: 'abcdefgh', seq: 0, events: [] })), 400);
    assert.equal(await post('x'.repeat(70 * 1024)), 413);
    assert.equal(await fetch(`http://127.0.0.1:${port}/api/runs`).then(r => r.status), 404);

    const lines = readFileSync(file, 'utf8').trim().split('\n');
    assert.equal(lines.length, 4, 'only the valid chunks are written');
    const a = aggregate(readRuns(readFileSync(file, 'utf8')));
    assert.equal(a.runs, 1);
    assert.equal(a.cheated, 1);
    assert.deepEqual(a.outcomes, { mort: 1 });
    assert.deepEqual(a.reached, [2]);
    assert.equal(a.levels[1].cleared, 1);
    assert.deepEqual(a.levels[1].time, [30]);
    assert.deepEqual(a.levels[1].hpLeft, [88]);
    assert.equal(a.levels[2].deaths, 1);
    assert.deepEqual(a.causes, { Ennemi: 1 });
    assert.equal(a.hurtBySource.Ennemi, 212);
    assert.deepEqual(a.upgrades.damage, { offered: 1, picked: 1, first: 1, firstLevels: [1] });
    assert.deepEqual(a.upgrades.fireRate, { offered: 1, picked: 0, first: 0, firstLevels: [] });
    assert.equal(a.upgrades.meleeDamage.first, 0);
    assert.deepEqual(a.upgrades.reach.firstLevels, [1], 'a shop purchase counts as the first take');
    assert.deepEqual(a.shopUpgrades.reach, { offered: 1, bought: 1 });
    assert.deepEqual(a.shop.bought, { amélioration: 1, potion: 1 });
    assert.deepEqual(a.pacts.berserker, { offered: 1, picked: 1 });
    assert.deepEqual(a.pacts.storm, { offered: 1, picked: 0 });
    const w = a.weapons['1-10'];
    assert.equal(w['dmg.staff'], 50);
    assert.equal(w['dmg.sword'], 30);
    assert.equal(w['kills.staff'], 1);
    assert.equal(w['time.sword'], 10);
    assert.equal(a.roomsUsed.fountain, 1);
    assert.equal(a.rooms.shop, 1);
    assert.deepEqual(a.fps.PC, [60]);
    assert.match(report(a), /Parties enregistrées : 1 \(\+1 avec triche/);
    console.log('Journal des parties : enregistrement, collecte et statistiques OK');
} finally {
    server.kill();
    rmSync(dir, { recursive: true, force: true });
}
