// Anonymous record of each run, for balancing: no IP, no account, no device id, only a random id per run.
// Events go to server/runs-collector.mjs (POST /api/runs, production build only) in chunks: at each level's
// end, at death, and when the page is hidden. `npm run stats` reads them. Event types: LLM_GUIDE.md.
const ENDPOINT = '/api/runs';
const VERSION = import.meta.env?.VITE_VERSION || 'dev'; // Commit deployed (`npm run deploy` sets it)
const tenth = (x) => Math.round(x * 10) / 10;

class RunLog {
    constructor() {
        this.id = null;
        this.level = 0;
        this.events = [];
        this.tally = null;
        // Replaced by the checks; the dev server sends nothing
        this.send = import.meta.env?.PROD ? (body) => navigator.sendBeacon(ENDPOINT, body) : () => {};
        globalThis.document?.addEventListener?.('visibilitychange', () => {
            if (document.visibilityState !== 'hidden') return;
            if (this.tally) this.event('hidden', { time: tenth(this.tally.time) }); // Left mid-level (maybe for good)
            this.flush();
        });
    }

    // A new run: `info` describes the device ({ touch, phone })
    start(info) {
        this.flush(); // What is left of the previous run
        this.id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        this.t0 = performance.now();
        this.seq = 0;
        this.level = 0; // Not the previous run's last level
        this.tally = null;
        this.event('run', { v: VERSION, ...info });
    }

    // Something that happened, `t` seconds into the run, during level `lvl`
    event(type, data = {}) {
        if (this.id) this.events.push({ t: tenth((performance.now() - this.t0) / 1000), lvl: this.level, type, ...data });
    }

    // The level's counters, sent with its `level` event; `info`: what the level holds
    beginLevel(level, info) {
        this.level = level;
        this.info = info;
        this.tally = { time: 0, hurt: {} };
    }

    add(key, amount = 1) {
        if (this.tally) this.tally[key] = (this.tally[key] || 0) + amount;
    }

    // Damage dealt by `weapon` ('staff', 'sword'), and whether it killed
    hit(weapon, damage, died) {
        this.add(`dmg.${weapon}`, damage);
        if (died) this.add(`kills.${weapon}`);
    }

    // Damage taken from `source` (the death recap's names)
    hurt(source, damage) {
        if (!this.tally) return;
        this.tally.hurt[source] = (this.tally.hurt[source] || 0) + damage;
        this.add('taken', damage);
    }

    // The level is over: 'clear' or 'death'. `extra`: the player's state then.
    endLevel(outcome, extra) {
        if (!this.tally) return;
        const { hurt, ...counts } = this.tally;
        const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, tenth(v)]));
        this.event('level', { ...this.info, outcome, ...round(counts), hurt: round(hurt), ...extra });
        this.tally = null;
        this.flush();
    }

    flush() {
        if (!this.id || this.events.length === 0) return;
        this.send(JSON.stringify({ run: this.id, seq: this.seq++, events: this.events }));
        this.events = [];
    }
}

export const runLog = new RunLog();
