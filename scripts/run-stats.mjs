// Balancing report from the runs the game recorded (src/systems/RunLog.js → server/runs-collector.mjs).
//   npm run stats [-- file.jsonl] [--json]
// --json prints the aggregates (for a dashboard) instead of the tables. Runs with a dev cheat are left out.
// The file holds what players' browsers sent: every value is untrusted, strings are cleaned before printing.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_FILE = fileURLToPath(new URL('../data/runs.jsonl', import.meta.url));
const BRACKETS = [[1, 10], [11, 20], [21, 30], [31, Infinity]];
const bracketOf = (lvl) => BRACKETS.find(([a, b]) => lvl >= a && lvl <= b) ?? BRACKETS[0];
const bracketName = ([a, b]) => (b === Infinity ? `${a}+` : `${a}-${b}`);

const num = (x) => (Number.isFinite(x) ? x : 0);
const text = (s) => String(s ?? '?').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 60);
const median = (xs) => {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by);

// Lines of the collector's file → runs ({ id, events }), chunks in order, each chunk once
export function readRuns(fileText) {
    const chunks = new Map();
    for (const line of fileText.split('\n')) {
        let c;
        try {
            c = JSON.parse(line);
        } catch {
            continue;
        }
        if (typeof c?.run !== 'string' || !Array.isArray(c.events)) continue;
        if (!chunks.has(c.run)) chunks.set(c.run, new Map());
        if (!chunks.get(c.run).has(c.seq)) chunks.get(c.run).set(c.seq, c.events);
    }
    return [...chunks].map(([id, bySeq]) => ({
        id,
        events: [...bySeq].sort((a, b) => a[0] - b[0]).flatMap(([, events]) => events).filter(e => e && typeof e === 'object')
    }));
}

export function aggregate(runs) {
    const kept = runs.filter(r => !r.events.some(e => e.type === 'cheat'));
    const out = {
        runs: kept.length,
        cheated: runs.length - kept.length,
        devices: {}, versions: {}, outcomes: {},
        reached: [], // Level reached per run
        levels: {}, // Per level number: cleared, deaths, times, hp left (%), damage taken, fps
        causes: {}, causesByBracket: {}, hurtBySource: {},
        upgrades: {}, // id → { offered, picked, first, firstLevels[] }
        shopUpgrades: {}, // id → { offered, bought }
        weapons: {}, // bracket → { time, dmg, kills } per weapon, plus moves
        pacts: {}, pactRefusals: 0,
        shop: { visits: 0, goldIn: [], spent: [], bought: {} },
        chests: {}, rooms: {}, roomsUsed: { fountain: 0, shop: 0, altar: 0, treasure: 0 },
        fps: {}
    };
    const add = (obj, key, by = 1) => { obj[key] = (obj[key] || 0) + by; };

    for (const { events } of kept) {
        const head = events.find(e => e.type === 'run') ?? {};
        const device = head.phone ? 'téléphone' : head.touch ? 'tactile' : 'PC';
        add(out.devices, device);
        add(out.versions, text(head.v));
        const end = events.find(e => e.type === 'end');
        add(out.outcomes, end ? 'mort' : 'abandon');
        out.reached.push(Math.max(1, ...events.map(e => num(e.lvl))));
        if (end) {
            const lvl = num(end.lvl);
            add(out.causes, text(end.cause));
            out.causesByBracket[bracketName(bracketOf(lvl))] ??= {};
            add(out.causesByBracket[bracketName(bracketOf(lvl))], text(end.cause));
        }

        const taken = new Set(); // Upgrades this run already took, for the level of the first take
        for (const e of events) {
            if (e.type === 'level') {
                const L = (out.levels[num(e.lvl)] ??= { cleared: 0, deaths: 0, time: [], hpLeft: [], taken: [] });
                if (e.outcome === 'death') L.deaths++;
                else {
                    L.cleared++;
                    L.time.push(num(e.time));
                    if (num(e.maxHp) > 0) L.hpLeft.push(100 * num(e.hp) / num(e.maxHp));
                }
                L.taken.push(num(e.taken));
                for (const [source, dmg] of Object.entries(e.hurt ?? {})) add(out.hurtBySource, text(source), num(dmg));
                for (const kind of Array.isArray(e.rooms) ? e.rooms : []) add(out.rooms, text(kind));
                if (num(e.time) > 5) (out.fps[device] ??= []).push(num(e.frames) / num(e.time));
                const W = (out.weapons[bracketName(bracketOf(num(e.lvl)))] ??= {});
                for (const key of ['time.staff', 'time.sword', 'dmg.staff', 'dmg.sword', 'kills.staff', 'kills.sword',
                    'shots', 'charged', 'swings', 'parries', 'blocks', 'switches', 'time']) add(W, key, num(e[key]));
                add(W, 'levels');
            } else if (e.type === 'upgrades' && Array.isArray(e.offered) && Array.isArray(e.picked)) {
                for (const id of e.offered) (out.upgrades[text(id)] ??= { offered: 0, picked: 0, first: 0, firstLevels: [] }).offered++;
                e.picked.forEach((raw, i) => {
                    const id = text(raw);
                    const U = (out.upgrades[id] ??= { offered: 0, picked: 0, first: 0, firstLevels: [] });
                    U.picked++;
                    if (i === 0) U.first++;
                    if (!taken.has(id)) {
                        taken.add(id);
                        U.firstLevels.push(num(e.lvl));
                    }
                });
            } else if (e.type === 'pact' && Array.isArray(e.offered)) {
                for (const id of e.offered) (out.pacts[text(id)] ??= { offered: 0, picked: 0 }).offered++;
                if (e.picked) (out.pacts[text(e.picked)] ??= { offered: 0, picked: 0 }).picked++;
                else out.pactRefusals++;
                out.roomsUsed.altar++;
            } else if (e.type === 'shop' && Array.isArray(e.bought) && Array.isArray(e.offered)) {
                out.shop.visits++;
                out.roomsUsed.shop++;
                out.shop.goldIn.push(num(e.gold));
                out.shop.spent.push(num(e.gold) - num(e.left));
                for (const id of e.offered) (out.shopUpgrades[text(id)] ??= { offered: 0, bought: 0 }).offered++;
                for (const item of e.bought) {
                    const slot = /^upgrade(\d)$/.exec(item);
                    if (slot) {
                        const id = text(e.offered[slot[1]]);
                        (out.shopUpgrades[id] ??= { offered: 0, bought: 0 }).bought++;
                        if (!taken.has(id)) {
                            taken.add(id);
                            (out.upgrades[id] ??= { offered: 0, picked: 0, first: 0, firstLevels: [] }).firstLevels.push(num(e.lvl));
                        }
                        add(out.shop.bought, 'amélioration');
                    } else add(out.shop.bought, text(item));
                }
            } else if (e.type === 'chest') {
                add(out.chests, text(e.reward));
                out.roomsUsed.treasure++;
            } else if (e.type === 'fountain') {
                out.roomsUsed.fountain++;
            }
        }
    }
    return out;
}

const pc = (a, b) => (b > 0 ? `${Math.round(100 * a / b)} %` : '–');
const fmt = (x, digits = 0) => (x === null || x === undefined ? '–' : Number(x).toFixed(digits));

function table(title, head, rows) {
    if (rows.length === 0) return `\n## ${title}\n(aucune donnée)\n`;
    const cells = [head, ...rows].map(r => r.map(c => String(c)));
    const widths = head.map((_, i) => Math.max(...cells.map(r => r[i].length)));
    const line = (r) => r.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
    return `\n## ${title}\n${line(cells[0])}\n${widths.map(w => '─'.repeat(w)).join('  ')}\n${cells.slice(1).map(line).join('\n')}\n`;
}

const byCount = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);

export function report(a) {
    let s = `# Parties enregistrées : ${a.runs}${a.cheated ? ` (+${a.cheated} avec triche, écartées)` : ''}\n`;
    s += `Fin : ${byCount(a.outcomes).map(([k, n]) => `${k} ${n}`).join(', ') || '–'}\n`;
    s += `Appareils : ${byCount(a.devices).map(([k, n]) => `${k} ${n}`).join(', ') || '–'}\n`;
    s += `Versions : ${byCount(a.versions).map(([k, n]) => `${k} ${n}`).join(', ') || '–'}\n`;
    s += `Niveau atteint : médiane ${fmt(median(a.reached))}, max ${a.reached.length ? Math.max(...a.reached) : '–'}\n`;

    const reach = [5, 10, 15, 20, 25, 30, 40, 50].filter(n => a.reached.some(r => r >= n - 5));
    s += table('Survie : part des parties qui atteignent le niveau', ['Niveau', 'Parties'],
        reach.map(n => [n, pc(a.reached.filter(r => r >= n).length, a.reached.length)]));

    s += table('Par niveau (temps et vie restante sur les niveaux franchis ; le temps compte les 2 s de fin)',
        ['Niveau', 'Franchi', 'Morts', 'Temps médian', 'Vie restante', 'Dégâts subis'],
        Object.entries(a.levels).sort((x, y) => x[0] - y[0]).map(([lvl, L]) => [
            lvl, L.cleared, L.deaths, L.time.length ? `${fmt(median(L.time))} s` : '–',
            L.hpLeft.length ? `${fmt(median(L.hpLeft))} %` : '–', fmt(median(L.taken))
        ]));

    const deaths = Object.values(a.causes).reduce((x, y) => x + y, 0);
    s += table('Causes de mort', ['Cause', 'Morts', 'Part'], byCount(a.causes).map(([k, n]) => [k, n, pc(n, deaths)]));
    for (const [b, causes] of Object.entries(a.causesByBracket).sort((x, y) => parseInt(x[0]) - parseInt(y[0]))) {
        s += `  niveaux ${b} : ${byCount(causes).slice(0, 4).map(([k, n]) => `${k} ${n}`).join(', ')}\n`;
    }
    const hurt = sum(Object.values(a.hurtBySource));
    s += table('Dégâts subis par source (toutes manches)', ['Source', 'Dégâts', 'Part'],
        byCount(a.hurtBySource).slice(0, 12).map(([k, n]) => [k, Math.round(n), pc(n, hurt)]));

    s += table('Améliorations (menus de fin de niveau, coffres, gemmes) : taux = choisie / proposée (plusieurs points sur une carte : peut dépasser 100 %)',
        ['Amélioration', 'Proposée', 'Choisie', 'Taux', 'Choisie en 1er', '1re prise (niv. médian)'],
        Object.entries(a.upgrades).sort((x, y) => y[1].picked / (y[1].offered || 1) - x[1].picked / (x[1].offered || 1))
            .map(([id, u]) => [id, u.offered, u.picked, pc(u.picked, u.offered), pc(u.first, u.offered), fmt(median(u.firstLevels))]));

    s += table('Armes par tranche de niveaux', ['Niveaux', 'Temps bâton', 'Dégâts bâton', 'Kills bâton', 'Tirs chargés/niv', 'Parades/niv', 'Changements/niv'],
        Object.entries(a.weapons).sort((x, y) => parseInt(x[0]) - parseInt(y[0])).map(([b, W]) => {
            const t = W['time.staff'] + W['time.sword'];
            const d = W['dmg.staff'] + W['dmg.sword'];
            const k = W['kills.staff'] + W['kills.sword'];
            return [b, pc(W['time.staff'], t), pc(W['dmg.staff'], d), pc(W['kills.staff'], k),
                fmt(W.charged / W.levels, 1), fmt(W.parries / W.levels, 1), fmt(W.switches / W.levels, 1)];
        }));
    s += '  (épée = le reste ; les kills des explosions et de l\'immolation ne sont pas comptés par arme)\n';

    s += table(`Pactes (${a.pactRefusals} refus)`, ['Pacte', 'Proposé', 'Choisi', 'Taux'],
        Object.entries(a.pacts).sort((x, y) => y[1].picked / (y[1].offered || 1) - x[1].picked / (x[1].offered || 1))
            .map(([id, p]) => [id, p.offered, p.picked, pc(p.picked, p.offered)]));

    const shop = a.shop;
    s += `\n## Boutique : ${shop.visits} visites, or à l'entrée médian ${fmt(median(shop.goldIn))}, dépensé médian ${fmt(median(shop.spent))}\n`;
    s += `Achats : ${byCount(shop.bought).map(([k, n]) => `${k} ${n}`).join(', ') || '–'}\n`;
    s += table('Améliorations de la boutique', ['Amélioration', 'Proposée', 'Achetée', 'Taux'],
        Object.entries(a.shopUpgrades).sort((x, y) => y[1].bought - x[1].bought).map(([id, u]) => [id, u.offered, u.bought, pc(u.bought, u.offered)]));

    s += table('Salles spéciales', ['Salle', 'Générées', 'Utilisées', 'Taux'],
        Object.entries({ treasure: 'coffre', fountain: 'fontaine', shop: 'boutique', altar: 'autel' })
            .map(([k, name]) => [name, a.rooms[k] || 0, a.roomsUsed[k], pc(a.roomsUsed[k], a.rooms[k] || 0)]));
    s += `Coffres : ${byCount(a.chests).map(([k, n]) => `${k} ${n}`).join(', ') || '–'}\n`;
    s += `Images/s médianes : ${Object.entries(a.fps).map(([d, xs]) => `${d} ${fmt(median(xs))}`).join(', ') || '–'}\n`;
    return s;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const file = args.find(a => !a.startsWith('--')) || DEFAULT_FILE;
    let content;
    try {
        content = readFileSync(file, 'utf8');
    } catch {
        console.log(`Aucune partie enregistrée pour l'instant (${file} introuvable).`);
        process.exit(0);
    }
    const agg = aggregate(readRuns(content));
    console.log(args.includes('--json') ? JSON.stringify(agg) : report(agg));
}
