// Builds public/sounds/sfx/*.mp3 from CC0 sound packs (see public/sounds/CREDITS.md).
//   npm run build:sfx      (needs network, ffmpeg and unzip; downloads into .sfx-cache/)
// Each sound: optionally filtered (reversed, muffled…), leading silence removed, cut to `max` seconds with a short fade, mono, loudness
// normalized (RMS -20 dB, peak ≤ -2 dB), MP3 96 kb/s. The mix (relative volumes) lives in SoundManager.
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const PACKS = {
    rpg80: 'https://opengameart.org/sites/default/files/80-CC0-RPG-SFX_0.zip', // rubberduck
    cc100: 'https://opengameart.org/sites/default/files/100-CC0-SFX_0.zip', // rubberduck
    woodmetal: 'https://opengameart.org/sites/default/files/100-CC0-wood-metal-SFX.zip', // rubberduck
    bfh: 'https://opengameart.org/sites/default/files/sfx_breaking_and_falling.zip', // rubberduck
    kenneyRpg: 'https://opengameart.org/sites/default/files/RPGsounds_Kenney.zip', // Kenney
    kenneyUi: 'https://opengameart.org/sites/default/files/kenney_interfaceSounds.zip', // Kenney
    rpgPack: 'https://opengameart.org/sites/default/files/rpg_sound_pack.zip' // artisticdude
};

const R = 'RPG Sound Pack';
const K = 'OGG';
const UI = 'Audio';
// The staff's crystal: the glass with an octave above it (shimmer), and that, echoed in a cloud and played
// backwards (strike muffled first, or every echo clicks), as the mana it draws in while it recharges
const OCTAVE = 'asplit[a][b];[b]asetrate=88200,aresample=44100,volume=0.6[c];[a][c]amix=inputs=2:normalize=0';
const DRAW_IN = 'silenceremove=start_periods=1:start_threshold=-50dB,highpass=f=900,highpass=f=900,afade=t=in:d=0.06,' +
    `${OCTAVE},apad=pad_dur=1,aecho=0.8:0.9:37|71|113|167|229|307|401|509|631|769|919:0.6|0.55|0.5|0.45|0.4|0.34|0.28|0.22|0.16|0.11|0.07,` +
    'areverse,compand=attacks=0.02:decays=0.2:points=-90/-90|-60/-40|-30/-22|0/-10';
// [output name, pack, file inside the pack, max seconds, extra ffmpeg filter]
const SOUNDS = [
    // Player
    ['shoot-1', 'rpg80', 'spell_01.ogg', 0.4],
    ['shoot-2', 'rpg80', 'spell_02.ogg', 0.4],
    ['melee-1', 'rpgPack', `${R}/battle/swing.wav`],
    ['melee-2', 'rpgPack', `${R}/battle/swing2.wav`],
    ['melee-3', 'rpgPack', `${R}/battle/swing3.wav`],
    ['melee-hit-1', 'kenneyRpg', `${K}/knifeSlice.ogg`, 0.45], // The sword's blade cutting in
    ['melee-hit-2', 'kenneyRpg', `${K}/knifeSlice2.ogg`, 0.45],
    ['sword-draw', 'rpgPack', `${R}/battle/sword-unsheathe5.wav`],
    ['staff-draw', 'kenneyRpg', `${K}/cloth3.ogg`],
    ['parry', 'rpgPack', `${R}/inventory/metal-ringing.wav`], // A clear ring: the shot goes back
    ['block', 'woodmetal', 'metal_hit_04.ogg', 0, 'lowpass=f=2500'], // A dull clank: the guard took it
    ['reload', 'cc100', 'glass_04.ogg', 0, DRAW_IN], // ~1.4 s swell
    ['reload-done', 'cc100', 'glass_04.ogg', 0.8, OCTAVE],
    ['empty', 'rpg80', 'spell_02.ogg', 0.22, 'lowpass=f=600,lowpass=f=600'], // The shot's own spell, stifled
    ...Array.from({ length: 10 }, (_, i) => [`footstep-${i + 1}`, 'kenneyRpg', `${K}/footstep0${i}.ogg`]),
    ['jump', 'kenneyRpg', `${K}/cloth1.ogg`, 0.4],
    ['land', 'kenneyRpg', `${K}/dropLeather.ogg`],
    ['player-hurt-1', 'cc100', 'hit_03.ogg'],
    ['player-hurt-2', 'cc100', 'hit_04.ogg'],
    // Combat
    ['hit-1', 'cc100', 'hit_01.ogg'],
    ['hit-2', 'cc100', 'hit_02.ogg'],
    ['crit-1', 'cc100', 'glass_01.ogg'],
    ['crit-2', 'cc100', 'glass_03.ogg'],
    ['explosion', 'cc100', 'explosion.ogg'],
    ['shield-break', 'cc100', 'glass_02.ogg'],
    ['ricochet-1', 'woodmetal', 'metal_hit_01.ogg'],
    ['ricochet-2', 'bfh', 'bfh1_metal_hit_03.ogg', 0.3],
    ['ricochet-3', 'cc100', 'metal_02.ogg'],
    // Enemies
    ['enemy-shoot-1', 'rpg80', 'spell_fire_07.ogg', 0.6],
    ['enemy-shoot-2', 'rpg80', 'spell_fire_01.ogg', 0.6],
    ...[1, 2, 3, 4, 5, 6].map(i => [`enemy-death-${i}`, 'rpgPack', `${R}/NPC/gutteral beast/mnstr${i}.wav`]),
    ['tower-shoot-1', 'rpg80', 'item_gem_01.ogg'],
    ['tower-shoot-2', 'rpg80', 'item_gem_03.ogg'],
    ['tower-death', 'bfh', 'bfh1_rock_breaking_01.ogg'],
    // Boss
    ['boss-roar-1', 'rpg80', 'creature_roar_01.ogg'],
    ['boss-roar-2', 'rpg80', 'creature_roar_02.ogg'],
    ['boss-roar-3', 'rpg80', 'creature_roar_03.ogg'],
    ['boss-laser', 'rpgPack', `${R}/battle/magic1.wav`],
    ['boss-spiral', 'rpgPack', `${R}/battle/spell.wav`, 3.0],
    ['boss-charge', 'rpgPack', `${R}/battle/magic1.wav`, 0, 'areverse'], // The wave's own sound, backwards: it swells
    ['boss-summon', 'rpg80', 'creature_monster_03.ogg'],
    ['boss-slam', 'woodmetal', 'metal_slam_01.ogg'],
    ['meteor-1', 'bfh', 'bfh1_rock_breaking_02.ogg', 0.6],
    ['meteor-2', 'bfh', 'bfh1_rock_breaking_03.ogg'],
    ['meteor-3', 'bfh', 'bfh1_rock_falling_02.ogg'],
    // World and items
    ['gold-1', 'rpg80', 'item_coins_01.ogg'],
    ['gold-2', 'rpg80', 'item_coins_02.ogg'],
    ['gold-3', 'rpg80', 'item_coins_03.ogg'],
    ['health', 'rpgPack', `${R}/inventory/bottle.wav`],
    ['mana', 'rpg80', 'item_gem_02.ogg'],
    ['upgrade', 'cc100', 'bell_02.ogg'],
    ['chest-open', 'cc100', 'wooded_box_open.ogg'],
    ['altar', 'cc100', 'bell_01.ogg'],
    ['pact', 'cc100', 'gong_02.ogg'],
    ['shop-open', 'kenneyRpg', `${K}/handleCoins.ogg`],
    ['purchase', 'rpg80', 'item_coins_04.ogg', 0.8],
    ['fountain', 'cc100', 'splash_01.ogg'],
    ['spikes-1', 'rpgPack', `${R}/battle/sword-unsheathe2.wav`],
    ['spikes-2', 'rpgPack', `${R}/battle/sword-unsheathe4.wav`],
    // Interface
    ['ui-click', 'kenneyUi', `${UI}/click_001.ogg`],
    ['ui-confirm', 'kenneyUi', `${UI}/confirmation_002.ogg`],
    ['ui-error', 'kenneyUi', `${UI}/error_006.ogg`],
    ['card-deal', 'kenneyRpg', `${K}/bookFlip2.ogg`],
    ['reel-stop', 'kenneyUi', `${UI}/glass_002.ogg`],
    ['tick', 'kenneyUi', `${UI}/tick_002.ogg`],
    ['level-clear', 'kenneyUi', `${UI}/confirmation_001.ogg`],
    ['game-over', 'cc100', 'gong_01.ogg']
];

const CACHE = '.sfx-cache';
const OUT = 'public/sounds/sfx';
fs.mkdirSync(OUT, { recursive: true });

function packDir(name) {
    const dir = path.join(CACHE, name);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        const zip = `${dir}.zip`;
        console.log(`Téléchargement ${name}…`);
        execFileSync('curl', ['-sfL', '--max-time', '300', '-o', zip, PACKS[name]]);
        execFileSync('unzip', ['-qo', zip, '-d', dir]);
    }
    return dir;
}

// Finds `file` anywhere in the pack (archives nest their files at different depths)
function locate(dir, file) {
    const hits = execFileSync('find', [dir, '-path', `*/${file}`, '-not', '-path', '*__MACOSX*']).toString().trim().split('\n').filter(Boolean);
    if (!hits.length) throw new Error(`${file} introuvable dans ${dir}`);
    return hits[0];
}

const filters = (max, fx) => [
    'aformat=channel_layouts=mono',
    ...(fx ? [fx] : []),
    'silenceremove=start_periods=1:start_threshold=-50dB',
    ...(max ? [`atrim=0:${max}`, `afade=t=out:st=${Math.max(0, max - 0.06)}:d=0.06`] : [])
].join(',');

for (const [name, pack, file, max, fx] of SOUNDS) {
    const src = locate(packDir(pack), file);
    // Measured in float: some sources go above 0 dBFS, which 16-bit meters clip away
    const probe = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-af',
        `${filters(max, fx)},aformat=sample_fmts=flt,astats=measure_perchannel=none:measure_overall=RMS_level+Peak_level`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const mean = parseFloat(probe.match(/RMS level dB: (-?[\d.]+)/)[1]);
    const peak = parseFloat(probe.match(/Peak level dB: (-?[\d.]+)/)[1]);
    const gain = Math.min(-20 - mean, -2 - peak); // 2 dB headroom: MP3 encoding overshoots peaks
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-af', `${filters(max, fx)},volume=${gain.toFixed(2)}dB`,
        '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', path.join(OUT, `${name}.mp3`)]);
}

const total = fs.readdirSync(OUT).reduce((sum, f) => sum + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`${SOUNDS.length} sons écrits dans ${OUT}/ (${Math.round(total / 1024)} Ko)`);
