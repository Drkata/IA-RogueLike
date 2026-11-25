import * as THREE from 'three';

/*
 * Procedural textures. Every surface is painted per pixel from seeded, tileable noise and comes
 * as three canvases: albedo (sRGB colour), height (bump map) and an optional glow (emissive map).
 * Canvases are built through `document.createElement('canvas')` only, so this module also runs
 * in Node with a canvas shim (used to preview the textures without a browser).
 *
 * Biomes: 'forest', 'city', 'cave', 'hell'. Albedo stays in the 0.25-0.55 range on average so the
 * lighting rig in the theme files keeps the same exposure everywhere.
 */

// ─── Building blocks ─────────────────────────────────────────────────────────

export function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (e0, e1, v) => {
    const t = clamp((v - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
};
const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

// Writes a + (b - a) * t into `out`
const mixInto = (out, a, b, t) => {
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
};
const copyInto = (out, a) => {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    return out;
};
const scaleInto = (out, k) => {
    out[0] *= k;
    out[1] *= k;
    out[2] *= k;
    return out;
};
// 3-colour ramp: t in [0, 1] goes a → b → c
const rampInto = (out, a, b, c, t) => (t < 0.5 ? mixInto(out, a, b, t * 2) : mixInto(out, b, c, t * 2 - 1));

// Integer hash → [0, 1)
const hash = (n) => {
    let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
};

function createCanvas(width, height = width) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function normalize(field) {
    let min = Infinity;
    let max = -Infinity;
    for (const v of field) {
        if (v < min) min = v;
        if (v > max) max = v;
    }
    const range = max - min || 1;
    for (let i = 0; i < field.length; i++) field[i] = (field[i] - min) / range;
    return field;
}

// Tileable fractal value noise over a size×size texture, normalized to [0, 1].
// `cells` = lattice cells across the texture for the first octave.
function fbm(size, rng, cells, octaves = 4, gain = 0.5) {
    const out = new Float32Array(size * size);
    let amp = 1;
    for (let o = 0; o < octaves; o++) {
        const n = cells << o;
        const lattice = new Float32Array(n * n);
        for (let i = 0; i < lattice.length; i++) lattice[i] = rng();
        const scale = n / size;
        for (let y = 0; y < size; y++) {
            const fy = y * scale;
            const y0 = Math.floor(fy);
            let ty = fy - y0;
            ty = ty * ty * (3 - 2 * ty);
            const r0 = (y0 % n) * n;
            const r1 = ((y0 + 1) % n) * n;
            for (let x = 0; x < size; x++) {
                const fx = x * scale;
                const x0 = Math.floor(fx);
                let tx = fx - x0;
                tx = tx * tx * (3 - 2 * tx);
                const c0 = x0 % n;
                const c1 = (x0 + 1) % n;
                const a = lattice[r0 + c0];
                const b = lattice[r0 + c1];
                const c = lattice[r1 + c0];
                const d = lattice[r1 + c1];
                out[y * size + x] += amp * (a + (b - a) * tx + (c - a + (a - b - c + d) * tx) * ty);
            }
        }
        amp *= gain;
    }
    return normalize(out);
}

// Ridges of a noise field: 1 on the field's mid-value lines, 0 far from them (cracks, veins)
function ridged(field) {
    const out = new Float32Array(field.length);
    for (let i = 0; i < field.length; i++) out[i] = 1 - Math.abs(field[i] * 2 - 1);
    return out;
}

// Tileable Voronoi: distance to the nearest (f1) and second nearest (f2) feature point, in cell
// units, and the id of the nearest cell. f2 - f1 is small along the borders between cells.
function voronoi(size, rng, cells, jitter = 0.85) {
    const n = cells;
    const points = new Float32Array(n * n * 2);
    for (let i = 0; i < n * n; i++) {
        points[i * 2] = (i % n) + 0.5 + (rng() - 0.5) * jitter;
        points[i * 2 + 1] = Math.floor(i / n) + 0.5 + (rng() - 0.5) * jitter;
    }
    const f1 = new Float32Array(size * size);
    const f2 = new Float32Array(size * size);
    const id = new Int32Array(size * size);
    const scale = n / size;
    for (let y = 0; y < size; y++) {
        const fy = (y + 0.5) * scale;
        const cy = Math.floor(fy);
        for (let x = 0; x < size; x++) {
            const fx = (x + 0.5) * scale;
            const cx = Math.floor(fx);
            let best = Infinity;
            let second = Infinity;
            let bestId = 0;
            for (let dy = -1; dy <= 1; dy++) {
                const gy = cy + dy;
                const wy = (gy + n) % n;
                for (let dx = -1; dx <= 1; dx++) {
                    const gx = cx + dx;
                    const wx = (gx + n) % n;
                    const k = wy * n + wx;
                    const px = points[k * 2] + (gx - wx) - fx;
                    const py = points[k * 2 + 1] + (gy - wy) - fy;
                    const d = px * px + py * py;
                    if (d < best) {
                        second = best;
                        best = d;
                        bestId = k;
                    } else if (d < second) {
                        second = d;
                    }
                }
            }
            const i = y * size + x;
            f1[i] = Math.sqrt(best);
            f2[i] = Math.sqrt(second);
            id[i] = bestId;
        }
    }
    return { f1, f2, id };
}

// Tileable stone courses: `rows` rows of blocks of random widths (fractions of the row height).
// Per pixel: distance in pixels to the block border and the block id.
function masonry(size, rng, rows, minW, maxW) {
    const edge = new Float32Array(size * size);
    const block = new Int32Array(size * size);
    const blockRand = [];

    // Row heights vary by ±20%, then are rescaled to fill the texture exactly
    const heights = Array.from({ length: rows }, () => 0.8 + rng() * 0.4);
    const heightSum = heights.reduce((a, b) => a + b, 0);
    let top = 0;
    for (let r = 0; r < rows; r++) {
        const rowTop = Math.round(top);
        top += heights[r] / heightSum * size;
        const rowBottom = r === rows - 1 ? size : Math.round(top);
        const rowH = rowBottom - rowTop;

        // Block widths wrap around horizontally, rescaled to close the loop exactly
        const widths = [];
        let sum = 0;
        while (sum < size) {
            const w = rowH * (minW + rng() * (maxW - minW));
            widths.push(w);
            sum += w;
        }
        const k = size / sum;
        const offset = rng() * size;
        const starts = [];
        let acc = 0;
        for (const w of widths) {
            starts.push(acc);
            acc += w * k;
        }
        const first = blockRand.length;
        for (let b = 0; b < widths.length; b++) blockRand.push(rng());

        for (let y = rowTop; y < rowBottom; y++) {
            const dyEdge = Math.min(y - rowTop + 0.5, rowBottom - y - 0.5);
            let b = 0;
            for (let x = 0; x < size; x++) {
                const lx = (x - offset + size * 2) % size;
                while (b > 0 && lx < starts[b]) b--;
                while (b < starts.length - 1 && lx >= starts[b + 1]) b++;
                const left = starts[b];
                const right = b < starts.length - 1 ? starts[b + 1] : size;
                const i = y * size + x;
                edge[i] = Math.min(dyEdge, lx - left + 0.5, right - lx - 0.5);
                block[i] = first + b;
            }
        }
    }
    return { edge, block, blockRand };
}

// Runs `shade(x, y, i, px)` for every pixel. The shader sets px.color (0-255 RGB), px.height
// (0-1) and, when `withGlow`, px.glow (0-255 RGB).
function paintSurface(size, withGlow, shade) {
    const albedo = createCanvas(size);
    const height = createCanvas(size);
    const glow = withGlow ? createCanvas(size) : null;
    const a = albedo.getContext('2d').createImageData(size, size);
    const h = height.getContext('2d').createImageData(size, size);
    const g = glow ? glow.getContext('2d').createImageData(size, size) : null;
    const px = { color: [0, 0, 0], height: 0.5, glow: [0, 0, 0] };

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = y * size + x;
            px.height = 0.5;
            px.glow[0] = px.glow[1] = px.glow[2] = 0;
            shade(x, y, i, px);
            const o = i * 4;
            a.data[o] = px.color[0];
            a.data[o + 1] = px.color[1];
            a.data[o + 2] = px.color[2];
            a.data[o + 3] = 255;
            const hv = clamp(px.height) * 255;
            h.data[o] = h.data[o + 1] = h.data[o + 2] = hv;
            h.data[o + 3] = 255;
            if (g) {
                g.data[o] = px.glow[0];
                g.data[o + 1] = px.glow[1];
                g.data[o + 2] = px.glow[2];
                g.data[o + 3] = 255;
            }
        }
    }
    albedo.getContext('2d').putImageData(a, 0, 0);
    height.getContext('2d').putImageData(h, 0, 0);
    if (g) glow.getContext('2d').putImageData(g, 0, 0);
    return { albedo, height, glow };
}

// Draws `fn(ctx, dx, dy)` at the 9 tile offsets so shapes crossing an edge wrap around
function drawWrapped(ctx, size, fn) {
    for (const dy of [-size, 0, size]) {
        for (const dx of [-size, 0, size]) fn(ctx, dx, dy);
    }
}

// ─── Walls ───────────────────────────────────────────────────────────────────

const WALL_SIZE = 512; // One texture per 2 m wall face

const WALLS = {
    // Ruined stone blocks overgrown with moss, mostly in the joints and near the ground
    forest(rng) {
        const size = WALL_SIZE;
        const m = masonry(size, rng, 5, 0.5, 1.1);
        const grain = fbm(size, rng, 32, 3);
        const blotch = fbm(size, rng, 4, 4);
        const mossNoise = fbm(size, rng, 6, 5);
        const stones = [rgb(0x5f655d), rgb(0x757a6e), rgb(0x8a8a78)];
        const mortar = rgb(0x262920);
        const mossDark = rgb(0x2f4a20);
        const mossLight = rgb(0x6f9a3a);
        const stone = [0, 0, 0];
        const moss = [0, 0, 0];
        return paintSurface(size, false, (x, y, i, px) => {
            const e = m.edge[i];
            const bevel = smoothstep(1.5, 8, e);
            rampInto(stone, stones[0], stones[1], stones[2], m.blockRand[m.block[i]]);
            scaleInto(stone, (0.72 + 0.28 * bevel) * (0.8 + 0.3 * grain[i] + 0.25 * (blotch[i] - 0.5)));
            const joint = e < 2.5;
            if (joint) mixInto(stone, mortar, stone, 0.15 * grain[i]);

            const bias = (y / size) * 0.3 + (e < 5 ? 0.12 : 0);
            const mossAmt = smoothstep(0.62, 0.78, mossNoise[i] * 0.85 + bias);
            mixInto(px.color, stone, mixInto(moss, mossDark, mossLight, grain[i]), mossAmt);
            px.height = (joint ? 0.12 : 0.45 + 0.35 * bevel + 0.15 * grain[i]) + mossAmt * 0.1;
        });
    },

    // Weathered limestone ashlar with dark mortar and soot stains
    city(rng) {
        const size = WALL_SIZE;
        const m = masonry(size, rng, 4, 0.9, 1.6);
        const grain = fbm(size, rng, 32, 3);
        const blotch = fbm(size, rng, 4, 5);
        const pits = fbm(size, rng, 64, 2);
        const stones = [rgb(0x7f7567), rgb(0x968b79), rgb(0xa99d87)];
        const mortar = rgb(0x3a342c);
        const stone = [0, 0, 0];
        return paintSurface(size, false, (x, y, i, px) => {
            const e = m.edge[i];
            const bevel = smoothstep(1.5, 6, e);
            rampInto(stone, stones[0], stones[1], stones[2], m.blockRand[m.block[i]]);
            const soot = smoothstep(0.55, 0.85, blotch[i]) * 0.3;
            const pit = pits[i] < 0.18 ? 0.82 : 1;
            scaleInto(stone, (0.78 + 0.22 * bevel) * (0.86 + 0.22 * grain[i]) * (1 - soot) * pit);
            if (e < 2.5) mixInto(px.color, mortar, stone, 0.1);
            else copyInto(px.color, stone);
            px.height = e < 2.5 ? 0.15 : 0.5 + 0.3 * bevel + 0.12 * grain[i] - (pit < 1 ? 0.1 : 0);
        });
    },

    // Layered dark rock with cracks and glowing crystal veins
    cave(rng) {
        const size = WALL_SIZE;
        const big = fbm(size, rng, 3, 5);
        const mid = fbm(size, rng, 10, 4);
        const crack = ridged(fbm(size, rng, 4, 5, 0.55));
        const vein = ridged(fbm(size, rng, 3, 5));
        const rockA = rgb(0x2e2e3a);
        const rockB = rgb(0x6c6b82);
        const crystalA = rgb(0x5fc8ff);
        const crystalB = rgb(0xb08cff);
        const rock = [0, 0, 0];
        const crystal = [0, 0, 0];
        return paintSurface(size, true, (x, y, i, px) => {
            const strata = Math.sin((y / size) * Math.PI * 2 * 6 + big[i] * 5) * 0.5 + 0.5;
            mixInto(rock, rockA, rockB, smoothstep(0.15, 0.85, strata) * 0.7 + mid[i] * 0.3);
            scaleInto(rock, 0.8 + 0.35 * big[i]);
            const cracked = smoothstep(0.965, 0.99, crack[i]) * smoothstep(0.35, 0.55, big[i]);
            scaleInto(rock, 1 - cracked * 0.55);
            const veinAmt = smoothstep(0.955, 0.985, vein[i]) * smoothstep(0.45, 0.6, mid[i]);
            mixInto(crystal, crystalA, crystalB, big[i]);
            mixInto(px.color, rock, crystal, veinAmt * 0.85);
            px.glow[0] = crystal[0] * veinAmt;
            px.glow[1] = crystal[1] * veinAmt;
            px.glow[2] = crystal[2] * veinAmt;
            px.height = 0.3 + 0.25 * strata + 0.3 * mid[i] - cracked * 0.3 + veinAmt * 0.15;
        });
    },

    // Black basalt blocks split by cracks of molten lava
    hell(rng) {
        const size = WALL_SIZE;
        const m = masonry(size, rng, 3, 0.8, 1.7);
        const grain = fbm(size, rng, 32, 3);
        const heat = fbm(size, rng, 4, 4);
        const crack = ridged(fbm(size, rng, 6, 4));
        const stones = [rgb(0x33261f), rgb(0x4a372d), rgb(0x5e4639)];
        const lavaDeep = rgb(0xb02400);
        const lavaHot = rgb(0xffa040);
        const stone = [0, 0, 0];
        const lava = [0, 0, 0];
        return paintSurface(size, true, (x, y, i, px) => {
            const e = m.edge[i];
            const bevel = smoothstep(1.5, 9, e);
            rampInto(stone, stones[0], stones[1], stones[2], m.blockRand[m.block[i]]);
            scaleInto(stone, (0.7 + 0.3 * bevel) * (0.8 + 0.35 * grain[i]));
            const seam = e < 3 ? smoothstep(0.45, 0.7, heat[i]) : 0;
            const fissure = smoothstep(0.94, 0.985, crack[i]) * smoothstep(0.4, 0.65, heat[i]);
            const lavaAmt = Math.max(seam, fissure);
            mixInto(lava, lavaDeep, lavaHot, lavaAmt * heat[i]);
            mixInto(px.color, stone, lava, lavaAmt);
            px.glow[0] = lava[0] * lavaAmt;
            px.glow[1] = lava[1] * lavaAmt;
            px.glow[2] = lava[2] * lavaAmt;
            px.height = (e < 3 ? 0.1 : 0.45 + 0.4 * bevel + 0.12 * grain[i]) - fissure * 0.3;
        });
    }
};

// ─── Floors (one tile covers 4 m × 4 m and repeats) ──────────────────────────

const FLOOR_SIZE = 512;

const FLOORS = {
    // Packed earth under moss carpets and fallen leaves
    forest(rng) {
        const size = FLOOR_SIZE;
        const big = fbm(size, rng, 4, 5);
        const grain = fbm(size, rng, 48, 3);
        const earthA = rgb(0x3a2c1f);
        const earthB = rgb(0x5a4530);
        const mossDark = rgb(0x2c4520);
        const mossLight = rgb(0x5f8a33);
        const earth = [0, 0, 0];
        const moss = [0, 0, 0];
        const surface = paintSurface(size, false, (x, y, i, px) => {
            mixInto(earth, earthA, earthB, grain[i] * 0.6 + big[i] * 0.4);
            const mossAmt = smoothstep(0.45, 0.6, big[i]);
            mixInto(moss, mossDark, mossLight, grain[i]);
            mixInto(px.color, earth, moss, mossAmt);
            px.height = 0.35 + 0.25 * grain[i] + mossAmt * 0.2;
        });

        // Fallen leaves on top (wrapped so the tile stays seamless)
        const leafColors = ['#7a3e1c', '#9a6a28', '#5e3a1c', '#8c5220'];
        const albedo = surface.albedo.getContext('2d');
        const height = surface.height.getContext('2d');
        for (let n = 0; n < 140; n++) {
            const x = rng() * size;
            const y = rng() * size;
            const r = 4 + rng() * 5;
            const angle = rng() * Math.PI;
            const color = leafColors[Math.floor(rng() * leafColors.length)];
            drawWrapped(albedo, size, (ctx, dx, dy) => {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.ellipse(x + dx, y + dy, r, r * 0.45, angle, 0, Math.PI * 2);
                ctx.fill();
            });
            drawWrapped(height, size, (ctx, dx, dy) => {
                ctx.fillStyle = '#b0b0b0';
                ctx.beginPath();
                ctx.ellipse(x + dx, y + dy, r, r * 0.45, angle, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        return surface;
    },

    // Rounded cobblestones bedded in dark earth
    city(rng) {
        const size = FLOOR_SIZE;
        const v = voronoi(size, rng, 9, 0.8);
        const grain = fbm(size, rng, 48, 3);
        const dirt = fbm(size, rng, 6, 4);
        const stones = [rgb(0x5d5850), rgb(0x77706a), rgb(0x8e8578)];
        const mortar = rgb(0x2a2520);
        const stone = [0, 0, 0];
        return paintSurface(size, false, (x, y, i, px) => {
            const border = v.f2[i] - v.f1[i];
            const dome = smoothstep(0.02, 0.35, border);
            rampInto(stone, stones[0], stones[1], stones[2], hash(v.id[i] + 7));
            scaleInto(stone, (0.7 + 0.3 * dome) * (0.85 + 0.25 * grain[i]) * (1 - 0.25 * smoothstep(0.55, 0.85, dirt[i])));
            mixInto(px.color, mortar, stone, smoothstep(0.03, 0.08, border));
            px.height = border < 0.05 ? 0.1 : 0.3 + 0.55 * dome + 0.1 * grain[i];
        });
    },

    // Rough rock with gravel and the odd glowing crystal shard
    cave(rng) {
        const size = FLOOR_SIZE;
        const big = fbm(size, rng, 4, 5);
        const grain = fbm(size, rng, 48, 3);
        const gravel = voronoi(size, rng, 28, 0.9);
        const rockA = rgb(0x32323d);
        const rockB = rgb(0x5c5b6c);
        const crystal = rgb(0x7fd0ff);
        const rock = [0, 0, 0];
        return paintSurface(size, true, (x, y, i, px) => {
            mixInto(rock, rockA, rockB, big[i] * 0.6 + grain[i] * 0.4);
            const pebble = smoothstep(0.05, 0.2, gravel.f2[i] - gravel.f1[i]) * (hash(gravel.id[i]) < 0.45 ? 1 : 0);
            scaleInto(rock, 1 + pebble * 0.25);
            const shard = hash(gravel.id[i] + 99) < 0.025 ? smoothstep(0.35, 0.1, gravel.f1[i]) : 0;
            mixInto(px.color, rock, crystal, shard * 0.8);
            px.glow[0] = crystal[0] * shard;
            px.glow[1] = crystal[1] * shard;
            px.glow[2] = crystal[2] * shard;
            px.height = 0.3 + 0.35 * big[i] + 0.15 * grain[i] + pebble * 0.2 + shard * 0.2;
        });
    },

    // Scorched basalt plates parted by veins of lava
    hell(rng) {
        const size = FLOOR_SIZE;
        const v = voronoi(size, rng, 6, 0.9);
        const grain = fbm(size, rng, 48, 3);
        const heat = fbm(size, rng, 5, 4);
        const stones = [rgb(0x33251f), rgb(0x46342b), rgb(0x5a4436)];
        const lavaDeep = rgb(0xa82000);
        const lavaHot = rgb(0xffb050);
        const stone = [0, 0, 0];
        const lava = [0, 0, 0];
        return paintSurface(size, true, (x, y, i, px) => {
            const border = v.f2[i] - v.f1[i];
            rampInto(stone, stones[0], stones[1], stones[2], hash(v.id[i] + 3));
            const ash = grain[i] > 0.8 ? 1.35 : 1;
            scaleInto(stone, (0.75 + 0.3 * smoothstep(0.02, 0.3, border)) * (0.8 + 0.3 * grain[i]) * ash);
            const vein = smoothstep(0.06, 0.015, border) * smoothstep(0.3, 0.55, heat[i]);
            mixInto(lava, lavaDeep, lavaHot, vein * heat[i]);
            mixInto(px.color, stone, lava, vein);
            px.glow[0] = lava[0] * vein;
            px.glow[1] = lava[1] * vein;
            px.glow[2] = lava[2] * vein;
            px.height = border < 0.06 ? 0.15 : 0.45 + 0.3 * smoothstep(0.02, 0.3, border) + 0.15 * grain[i];
        });
    }
};

// ─── Special rooms ───────────────────────────────────────────────────────────

// Magic circle, used for the floor sigils of special rooms
function drawRuneCircle(ctx, rng, size) {
    const cx = size / 2;
    const cy = size / 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const polygon = (sides, radius, rotation) => {
        ctx.beginPath();
        for (let i = 0; i <= sides; i++) {
            const angle = (i / sides) * Math.PI * 2 + rotation;
            const px = cx + Math.cos(angle) * radius;
            const py = cy + Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
    };
    const circle = (x, y, r, fill = false) => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (fill) ctx.fill();
        else ctx.stroke();
    };

    // Outer rings with optional beads
    const ringCount = 1 + Math.floor(rng() * 3);
    let outer = 150;
    for (let i = 0; i < ringCount; i++) {
        ctx.lineWidth = i === 0 ? 5 : 2.5;
        const radius = 150 - i * 15 - rng() * 10;
        if (i === 0) outer = radius;
        circle(cx, cy, radius);
        if (rng() > 0.5) {
            const beads = 8 + Math.floor(rng() * 8);
            for (let j = 0; j < beads; j++) {
                const a = (j / beads) * Math.PI * 2;
                circle(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, 4, true);
            }
        }
    }

    // Inner polygon, sometimes doubled into a star
    const sides = 3 + Math.floor(rng() * 6);
    const rotation = rng() * Math.PI;
    const polyRadius = 90 + rng() * 30;
    ctx.lineWidth = 3;
    polygon(sides, polyRadius, rotation);
    if (rng() > 0.5) polygon(sides, polyRadius, rotation + Math.PI / sides);

    // Centre emblem and spokes
    const centerRadius = 15 + rng() * 20;
    circle(cx, cy, centerRadius);
    circle(cx, cy, centerRadius * 0.4, true);
    if (rng() > 0.3) {
        ctx.lineWidth = 2;
        for (let i = 0; i < sides; i++) {
            const a = (i / sides) * Math.PI * 2 + rotation;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * centerRadius, cy + Math.sin(a) * centerRadius);
            ctx.lineTo(cx + Math.cos(a) * polyRadius, cy + Math.sin(a) * polyRadius);
            ctx.stroke();
        }
    }

    // Small orbiting glyphs
    const glyphs = 4 + Math.floor(rng() * 6);
    const orbit = 200 + rng() * 30;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < glyphs; i++) {
        const a = (i / glyphs) * Math.PI * 2 + rng() * 0.5;
        const gx = cx + Math.cos(a) * orbit;
        const gy = cy + Math.sin(a) * orbit;
        const r = 10 + rng() * 10;
        const kind = Math.floor(rng() * 3);
        ctx.beginPath();
        if (kind === 0) {
            const n = 3 + Math.floor(rng() * 2);
            for (let j = 0; j <= n; j++) {
                const b = (j / n) * Math.PI * 2;
                if (j === 0) ctx.moveTo(gx + Math.cos(b) * r, gy + Math.sin(b) * r);
                else ctx.lineTo(gx + Math.cos(b) * r, gy + Math.sin(b) * r);
            }
            ctx.stroke();
        } else if (kind === 1) {
            circle(gx, gy, r);
            circle(gx, gy, 2.5, true);
        } else {
            ctx.moveTo(gx - r, gy);
            ctx.lineTo(gx + r, gy);
            ctx.moveTo(gx, gy - r);
            ctx.lineTo(gx, gy + r);
            ctx.stroke();
        }
        if (rng() > 0.3) {
            ctx.globalAlpha = 0.45;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
            ctx.lineTo(gx, gy);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export class TextureGenerator {
    static BIOMES = Object.keys(WALLS);

    // White radial glow shared by every glow sprite (tint it with the sprite material color)
    static getGlowTexture() {
        if (!this._glowTexture) {
            const canvas = createCanvas(64);
            const ctx = canvas.getContext('2d');
            const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
            grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
            grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 64, 64);
            this._glowTexture = this.toTexture(canvas);
        }
        return this._glowTexture;
    }

    // Canvas → texture. Colour canvases are sRGB; data canvases (bump, shadow) are linear.
    static toTexture(canvas, { color = true, repeat = true } = {}) {
        const texture = new THREE.CanvasTexture(canvas);
        if (color) texture.colorSpace = THREE.SRGBColorSpace;
        if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = 8;
        return texture;
    }

    // Surface canvases → { map, bumpMap, emissiveMap }
    static toTextures(surface) {
        return {
            map: this.toTexture(surface.albedo),
            bumpMap: this.toTexture(surface.height, { color: false }),
            emissiveMap: surface.glow ? this.toTexture(surface.glow) : null
        };
    }

    static wallSurface(biome, variant = 0) {
        return (WALLS[biome] || WALLS.city)(seededRandom(1000 + variant * 7919 + biome.length * 31));
    }

    static floorSurface(biome) {
        return (FLOORS[biome] || FLOORS.city)(seededRandom(2000 + biome.length * 31));
    }

    // Special room walls: the biome's stone with a carved frieze of runes, 2.1 to 2.5 m high. The glow
    // map is white: the material's emissive colour gives the frieze the colour of the room's content.
    static sanctumWallSurface(biome) {
        const size = WALL_SIZE;
        const surface = TextureGenerator.wallSurface(biome, 0);
        surface.glow = createCanvas(size);
        const [top, bottom] = [78, 150]; // Frieze band, in pixels from the top of the 3 m face
        const ledge = 8;
        const layers = {
            albedo: surface.albedo.getContext('2d'),
            height: surface.height.getContext('2d'),
            glow: surface.glow.getContext('2d')
        };
        layers.glow.fillStyle = '#000';
        layers.glow.fillRect(0, 0, size, size);

        // Recessed band between two raised ledges
        layers.albedo.fillStyle = 'rgba(0, 0, 0, 0.55)';
        layers.albedo.fillRect(0, top, size, bottom - top);
        layers.albedo.fillStyle = 'rgba(255, 255, 255, 0.14)';
        layers.albedo.fillRect(0, top - ledge, size, ledge);
        layers.albedo.fillRect(0, bottom, size, ledge);
        layers.height.fillStyle = '#2a2a2a';
        layers.height.fillRect(0, top, size, bottom - top);
        layers.height.fillStyle = '#d8d8d8';
        layers.height.fillRect(0, top - ledge, size, ledge);
        layers.height.fillRect(0, bottom, size, ledge);

        // 8 runes per face (a stem and seeded branches), so the frieze runs on across walls
        const rng = seededRandom(5000);
        const runes = Array.from({ length: 8 }, () => Array.from({ length: 1 + Math.floor(rng() * 3) }, () =>
            [rng() < 0.5 ? -1 : 1, 0.15 + rng() * 0.55, rng() < 0.5 ? -1 : 1, rng() < 0.25]));
        const [y0, y1] = [top + 14, bottom - 14];
        const draw = (ctx, color, blur, width) => {
            ctx.strokeStyle = ctx.fillStyle = ctx.shadowColor = color;
            ctx.shadowBlur = blur;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            runes.forEach((branches, k) => {
                const x = 32 + k * 64;
                ctx.beginPath();
                ctx.moveTo(x, y0);
                ctx.lineTo(x, y1);
                for (const [side, at, slope, dot] of branches) {
                    const y = y0 + (y1 - y0) * at;
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + side * 14, y + slope * 12);
                    if (dot) {
                        ctx.moveTo(x - side * 9 + 2.5, y1 - 6);
                        ctx.arc(x - side * 9, y1 - 6, 2.5, 0, Math.PI * 2);
                    }
                }
                ctx.stroke();
            });
            ctx.shadowBlur = 0;
        };
        draw(layers.albedo, '#cfc6b4', 0, 4);
        draw(layers.height, '#101010', 0, 5); // Engraved
        draw(layers.glow, '#ffffff', 8, 4);
        return surface;
    }

    // Floor sigil of a special room: a white magic circle on transparent black, tinted by its material
    static sigilCanvas(seed) {
        const size = 512;
        const canvas = createCanvas(size);
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = ctx.fillStyle = ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
        drawRuneCircle(ctx, seededRandom(seed), size);
        return canvas;
    }

    // Soft contact shadows on the floor around walls, 8 px per grid cell (used as aoMap)
    static floorShadowCanvas(levelData) {
        const res = 8;
        const w = levelData.width * res;
        const h = levelData.height * res;
        let field = new Float32Array(w * h);
        for (let z = 0; z < levelData.height; z++) {
            for (let x = 0; x < levelData.width; x++) {
                if (levelData.data[z * levelData.width + x] !== 1) continue;
                for (let py = z * res; py < (z + 1) * res; py++) field.fill(1, py * w + x * res, py * w + (x + 1) * res);
            }
        }
        // Two separable box blurs ≈ a gaussian of ~5 px
        const radius = 5;
        const tmp = new Float32Array(w * h);
        const blur = (src, dst, horizontal) => {
            const len = horizontal ? w : h;
            const lines = horizontal ? h : w;
            for (let l = 0; l < lines; l++) {
                let sum = 0;
                const at = (k) => (horizontal ? l * w + k : k * w + l);
                for (let k = -radius; k <= radius; k++) sum += src[at(clamp(k, 0, len - 1))];
                for (let k = 0; k < len; k++) {
                    dst[at(k)] = sum / (radius * 2 + 1);
                    sum += src[at(Math.min(len - 1, k + radius + 1))] - src[at(Math.max(0, k - radius))];
                }
            }
        };
        for (let pass = 0; pass < 2; pass++) {
            blur(field, tmp, true);
            blur(tmp, field, false);
        }

        const canvas = createCanvas(w, h);
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(w, h);
        for (let i = 0; i < field.length; i++) {
            const v = 255 * (1 - 0.6 * clamp(field[i] * 1.8));
            img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
            img.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        return canvas;
    }

    // Equirectangular sky (2:1). The horizon is the middle row; the top row is straight up.
    static skyCanvas(biome) {
        const w = 2048;
        const h = 1024;
        const horizon = h / 2;
        const canvas = createCanvas(w, h);
        const ctx = canvas.getContext('2d');
        const rng = seededRandom(5000 + biome.length * 31);
        const sky = SKIES[biome] || SKIES.city;

        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        sky.gradient.forEach(([at, color]) => gradient.addColorStop(at, color));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);

        const disc = (x, y, r) => {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        };
        const glow = (x, y, r, stops) => {
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            stops.forEach(([at, color]) => grad.addColorStop(at, color));
            ctx.fillStyle = grad;
            disc(x, y, r);
        };

        // Stars: denser and brighter towards the zenith
        for (let i = 0; i < sky.stars; i++) {
            const y = Math.pow(rng(), 1.6) * horizon * 0.95;
            ctx.fillStyle = `rgba(255, 250, 235, ${(0.3 + rng() * 0.7) * (1 - y / horizon * 0.7)})`;
            disc(rng() * w, y, 0.4 + rng() * 1.2);
        }
        for (const [x, y, r, color] of sky.nebulae ? sky.nebulae(rng, w, horizon) : []) glow(x, y, r, [[0, color], [1, 'rgba(0,0,0,0)']]);
        if (sky.body) {
            const { x, y, r, color, halo, maria } = sky.body;
            glow(x * w, y * h, r * 4, [[0, halo], [1, 'rgba(0,0,0,0)']]);
            ctx.fillStyle = color;
            disc(x * w, y * h, r);
            if (maria) {
                // Faint dark seas on a moon
                ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
                for (let i = 0; i < 6; i++) disc(x * w + (rng() - 0.5) * r, y * h + (rng() - 0.5) * r, r * (0.12 + rng() * 0.15));
            }
        }
        if (sky.particles) {
            for (let i = 0; i < sky.particles.count; i++) {
                ctx.fillStyle = sky.particles.colors[Math.floor(rng() * sky.particles.colors.length)];
                disc(rng() * w, rng() * horizon * 1.05, 0.6 + rng() * 1.6);
            }
        }

        // Silhouette band on the horizon (wraps around)
        if (sky.silhouette) {
            const { color, rim, shape } = sky.silhouette;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(0, horizon + 40);
            for (let x = 0; x <= w; x += 4) ctx.lineTo(x, horizon - shape(x / w, rng));
            ctx.lineTo(w, horizon + 40);
            ctx.closePath();
            if (rim) {
                ctx.shadowColor = rim;
                ctx.shadowBlur = 12;
            }
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillRect(0, horizon + 39, w, h - horizon);
        }
        return canvas;
    }
}

// Horizon silhouettes, as a height in pixels above the horizon for x in [0, 1) (periodic)
const wave = (x, freqs) => freqs.reduce((sum, [f, a, p]) => sum + a * Math.sin((x * f + p) * Math.PI * 2), 0);

const SKIES = {
    forest: {
        gradient: [[0, '#04060f'], [0.35, '#0d1530'], [0.5, '#1f3045'], [0.52, '#0a0f12'], [1, '#05070a']],
        stars: 2200,
        nebulae: (rng, w, horizon) => Array.from({ length: 10 }, () => [
            rng() * w, rng() * horizon * 0.8, 120 + rng() * 220,
            rng() > 0.5 ? 'rgba(90, 200, 190, 0.10)' : 'rgba(150, 100, 230, 0.10)'
        ]),
        body: { x: 0.68, y: 0.22, r: 46, color: '#e8f0ff', halo: 'rgba(170, 210, 255, 0.35)', maria: true },
        particles: { count: 260, colors: ['rgba(200, 255, 190, 0.7)', 'rgba(150, 240, 255, 0.6)'] },
        // Pine treeline
        silhouette: {
            color: '#04080a',
            shape: (x, rng) => 18 + wave(x, [[3, 8, 0.1], [7, 5, 0.6]]) + (rng() < 0.5 ? rng() * 26 : 0)
        }
    },
    city: {
        gradient: [[0, '#141a40'], [0.28, '#3b3a6b'], [0.42, '#a0566a'], [0.5, '#f29a58'], [0.53, '#2a1a1c'], [1, '#140c0e']],
        stars: 500,
        nebulae: (rng, w, horizon) => Array.from({ length: 16 }, () => [
            rng() * w, horizon * (0.55 + rng() * 0.35), 160 + rng() * 260, 'rgba(255, 150, 90, 0.10)'
        ]),
        body: { x: 0.3, y: 0.47, r: 54, color: '#fff0c8', halo: 'rgba(255, 170, 80, 0.55)' },
        // Distant towers and spires
        silhouette: {
            color: '#1c1216',
            shape: (x, rng) => {
                const block = Math.floor(x * 140);
                const tall = hash(block) < 0.12 ? 30 + hash(block + 1) * 40 : 0;
                return 10 + wave(x, [[2, 6, 0.3]]) + hash(block + 2) * 14 + tall;
            }
        }
    },
    cave: {
        gradient: [[0, '#030305'], [0.45, '#08080f'], [0.5, '#0d0d18'], [0.55, '#06060b'], [1, '#020203']],
        stars: 0,
        particles: { count: 420, colors: ['rgba(110, 190, 255, 0.55)', 'rgba(170, 130, 255, 0.5)', 'rgba(220, 240, 255, 0.35)'] },
        silhouette: {
            color: '#020203',
            shape: (x) => 40 + wave(x, [[2, 20, 0.2], [5, 12, 0.7], [13, 6, 0.1]])
        }
    },
    hell: {
        gradient: [[0, '#0e0305'], [0.3, '#2a0708'], [0.47, '#6e160a'], [0.5, '#b8380e'], [0.53, '#200606'], [1, '#0a0202']],
        stars: 0,
        nebulae: (rng, w, horizon) => Array.from({ length: 14 }, () => [
            rng() * w, horizon * (0.3 + rng() * 0.6), 140 + rng() * 240, 'rgba(40, 0, 0, 0.35)'
        ]),
        body: { x: 0.52, y: 0.25, r: 64, color: '#ff5a2a', halo: 'rgba(255, 60, 20, 0.45)', maria: true },
        particles: { count: 700, colors: ['rgba(255, 140, 40, 0.8)', 'rgba(255, 90, 20, 0.7)', 'rgba(60, 50, 50, 0.6)'] },
        // Volcanic ridge with a glowing rim
        silhouette: {
            color: '#120404',
            rim: '#ff4a10',
            shape: (x) => 34 + wave(x, [[2, 26, 0.4], [6, 10, 0.1], [11, 5, 0.8]])
        }
    }
};
