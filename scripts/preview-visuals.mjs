// Texture previews and light calibration, without a browser (see ART_DIRECTION.md).
//   npm i --no-save canvas          (once: node-canvas, a CPU-only 2D canvas)
//   npm run preview:visuals         (writes PNG sheets to previews/, prints the calibration table)
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
let createCanvas;
try {
    ({ createCanvas } = require('canvas'));
} catch {
    console.error('node-canvas is missing: run `npm i --no-save canvas` first.');
    process.exit(1);
}
globalThis.document = { createElement: () => createCanvas(1, 1) };

const { TextureGenerator: T } = await import('../src/systems/TextureGenerator.js');
const { ThemeManager } = await import('../src/systems/themes/ThemeManager.js');

const OUT = process.argv[2] || 'previews';
fs.mkdirSync(OUT, { recursive: true });

// ─── Light calibration (three.js r181 physical shading + Neutral tone mapping) ───
const decode = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const encode = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const luminance = (hex) => 0.2126 * decode(((hex >> 16) & 255) / 255) + 0.7152 * decode(((hex >> 8) & 255) / 255) + 0.0722 * decode((hex & 255) / 255);
const neutral = (x) => (x < 0.76 ? x : 1 - 0.0576 / (x - 0.52)); // Highlights roll off above 0.76
// On-screen brightness (sRGB 0-1) of a surface of average albedo `albedo` (sRGB) facing `normal`
function brightness(L, albedo, normal) {
    const [sx, sy, sz] = L.sunDirection;
    const len = Math.hypot(sx, sy, sz);
    const sun = Math.max(0, (normal[0] * sx + normal[1] * sy + normal[2] * sz) / len);
    const fill = (luminance(L.ground) + (luminance(L.sky) - luminance(L.ground)) * (0.5 * normal[1] + 0.5)) * L.fill;
    const irradiance = fill + sun * luminance(L.sun) * L.sunIntensity;
    return encode(neutral(decode(albedo) / Math.PI * irradiance));
}
const TARGETS = { sunSide: [0.22, 0.6], shadowSide: [0.12, 0.35], floor: [0.2, 0.45] };

// ─── Preview helpers ───
const averageLuma = (canvas) => {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return sum / (d.length / 4) / 255;
};
// Rough lit look: albedo × (fill + key light on the bump normals) + glow
function lit(surface) {
    const size = surface.albedo.width;
    const a = surface.albedo.getContext('2d').getImageData(0, 0, size, size).data;
    const h = surface.height.getContext('2d').getImageData(0, 0, size, size).data;
    const g = surface.glow ? surface.glow.getContext('2d').getImageData(0, 0, size, size).data : null;
    const out = createCanvas(size, size);
    const ctx = out.getContext('2d');
    const img = ctx.createImageData(size, size);
    const height = (x, y) => h[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
    const light = [-0.5, -0.6, 0.62];
    const ll = Math.hypot(...light);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const nx = (height(x - 1, y) - height(x + 1, y)) * 6;
            const ny = (height(x, y - 1) - height(x, y + 1)) * 6;
            const k = 0.45 + 0.75 * Math.max(0, (nx * light[0] + ny * light[1] + light[2]) / (Math.hypot(nx, ny, 1) * ll));
            const o = (y * size + x) * 4;
            for (let c = 0; c < 3; c++) img.data[o + c] = a[o + c] * k + (g ? g[o + c] * 0.9 : 0);
            img.data[o + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return out;
}
const tiled = (canvas) => {
    const s = canvas.width;
    const out = createCanvas(s * 2, s * 2);
    for (const dx of [0, s]) for (const dy of [0, s]) out.getContext('2d').drawImage(canvas, dx, dy);
    return out;
};
const sheet = (file, label, tiles) => {
    const cell = 340;
    const out = createCanvas(cell * 3, Math.ceil(tiles.length / 3) * cell + 24);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.fillStyle = '#ddd';
    ctx.font = '16px sans-serif';
    ctx.fillText(label, 6, 17);
    tiles.forEach((t, i) => ctx.drawImage(t, (i % 3) * cell, 24 + Math.floor(i / 3) * cell, cell, cell));
    fs.writeFileSync(`${OUT}/${file}`, out.toBuffer('image/png'));
};

// ─── Run ───
const rows = [];
let outOfRange = false;
for (const theme of new ThemeManager().themes) {
    const { biome, lighting } = theme;
    const walls = [0, 1, 2].map(v => T.wallSurface(biome, v));
    const floor = T.floorSurface(biome);
    sheet(`${biome}.png`, `${biome} — mur 2×2 | mur éclairé | variante 2×2 | sol 2×2 | sol éclairé | glow ou relief`,
        [tiled(walls[0].albedo), lit(walls[0]), tiled(walls[1].albedo), tiled(floor.albedo), lit(floor), floor.glow || walls[0].glow || walls[0].height]);
    const sky = T.skyCanvas(biome);
    const small = createCanvas(1024, 512);
    small.getContext('2d').drawImage(sky, 0, 0, 1024, 512);
    fs.writeFileSync(`${OUT}/sky-${biome}.png`, small.toBuffer('image/png'));

    const wallAlbedo = walls.reduce((sum, w) => sum + averageLuma(w.albedo), 0) / walls.length;
    const floorAlbedo = averageLuma(floor.albedo);
    const sides = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map(n => brightness(lighting, wallAlbedo, n));
    const values = { sunSide: Math.max(...sides), shadowSide: Math.min(...sides), floor: brightness(lighting, floorAlbedo, [0, 1, 0]) };
    const flag = (key) => {
        const [lo, hi] = TARGETS[key];
        const ok = values[key] >= lo && values[key] <= hi;
        if (!ok) outOfRange = true;
        return values[key].toFixed(2) + (ok ? '  ' : ' ✗');
    };
    rows.push(`${biome.padEnd(7)} albédo mur ${wallAlbedo.toFixed(2)} sol ${floorAlbedo.toFixed(2)} | mur face soleil ${flag('sunSide')} | mur à l'ombre ${flag('shadowSide')} | sol ${flag('floor')}`);
}
const rune = T.runeWallSurface(0);
const vault = T.vaultWallSurface();
sheet('special.png', 'runes | runes éclairé | glow | coffre-fort | coffre-fort éclairé | pentacle',
    [rune.albedo, lit(rune), rune.glow, vault.albedo, lit(vault), T.pentacleCanvas()]);

console.log(`Aperçus écrits dans ${OUT}/`);
console.log(`Luminosité attendue à l'écran (0-1). Cibles : face soleil ${TARGETS.sunSide.join('-')}, ombre ${TARGETS.shadowSide.join('-')}, sol ${TARGETS.floor.join('-')}`);
rows.forEach(r => console.log(r));
if (outOfRange) {
    console.log('✗ Hors cible : ajuster la lumière du thème ou l\'albédo des textures (voir ART_DIRECTION.md, « Lumière »).');
    process.exit(1);
}
