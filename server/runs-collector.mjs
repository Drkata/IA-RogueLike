// Receives the anonymous run records the game sends (src/systems/RunLog.js) and appends each chunk, one JSON
// line, to RUNS_FILE. Caddy forwards POST /api/runs here (README.md, « Statistiques des parties »). Nothing about the sender is
// written: the address only counts requests in memory, for a minute. Read the file with `npm run stats`.
import { createServer } from 'node:http';
import { appendFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 5190;
const FILE = process.env.RUNS_FILE || fileURLToPath(new URL('../data/runs.jsonl', import.meta.url));
const MAX_BODY = 64 * 1024; // sendBeacon's own limit
const MAX_FILE = 1024 ** 3; // 1 GB: stop writing rather than fill the disk
const PER_MINUTE = 60; // Chunks a sender may send per minute (a run sends one per level)

let minute = 0;
const counts = new Map(); // Sender address → chunks this minute

function allowed(address) {
    const now = Math.floor(Date.now() / 60000);
    if (now !== minute) {
        minute = now;
        counts.clear();
    }
    const n = (counts.get(address) || 0) + 1;
    counts.set(address, n);
    return n <= PER_MINUTE;
}

// The chunk as the game sends it ({ run, seq, events }), or null. Players can send anything: only the shape
// is checked here, `npm run stats` treats the values as untrusted.
function parseChunk(text) {
    let chunk;
    try {
        chunk = JSON.parse(text);
    } catch {
        return null;
    }
    const { run, seq, events } = chunk ?? {};
    if (typeof run !== 'string' || !/^[\w-]{8,64}$/.test(run)) return null;
    if (!Number.isInteger(seq) || seq < 0 || seq > 100000) return null;
    if (!Array.isArray(events) || events.length === 0 || events.length > 2000) return null;
    const valid = (e) => e && typeof e === 'object' && typeof e.type === 'string' && e.type.length <= 32 && Number.isFinite(e.t);
    return events.every(valid) ? { run, seq, events } : null;
}

const server = createServer((req, res) => {
    const reply = (code) => res.writeHead(code).end();
    if (req.method !== 'POST' || req.url !== '/api/runs') return reply(404);
    // Behind Caddy (on 127.0.0.1 only), the sender is the first X-Forwarded-For address
    const address = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();
    if (!allowed(address)) return reply(429);

    const parts = [];
    let size = 0;
    req.on('data', (part) => {
        size += part.length;
        if (size > MAX_BODY) {
            reply(413);
            req.destroy();
        } else parts.push(part);
    });
    req.on('end', async () => {
        if (size > MAX_BODY) return;
        const chunk = parseChunk(Buffer.concat(parts).toString('utf8'));
        if (!chunk) return reply(400);
        try {
            const written = await stat(FILE).then(s => s.size, () => 0);
            if (written > MAX_FILE) return reply(507);
            await appendFile(FILE, `${JSON.stringify({ at: new Date().toISOString(), ...chunk })}\n`);
            reply(204);
        } catch (error) {
            console.error('Could not write the run:', error.message);
            reply(500);
        }
    });
});

await mkdir(dirname(FILE), { recursive: true });
server.listen(PORT, '127.0.0.1', () => console.log(`Runs collector on 127.0.0.1:${PORT}, writing to ${FILE}`));
