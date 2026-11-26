// Sound effects: CC0 recordings in public/sounds/sfx (built by scripts/build-sfx.mjs, credits in
// public/sounds/CREDITS.md), played through Web Audio with 3D positioning. Music: HTML <audio> playlist.
// See ART_DIRECTION.md, section « Son ».

// name: [variant files, volume, pitch spread (±), max simultaneous voices, base playback rate]
export const SFX = {
    // Player
    shoot: [['shoot-1', 'shoot-2'], 0.35, 0.08, 3],
    melee: [['melee-1', 'melee-2', 'melee-3'], 0.6, 0.06, 2],
    meleeHit: [['melee-hit-1', 'melee-hit-2'], 0.7, 0.08, 3], // The sword strikes an enemy
    swordDraw: [['sword-draw'], 0.45, 0.04, 1],
    staffDraw: [['staff-draw'], 0.4, 0.05, 1],
    parry: [['parry'], 0.8, 0.04, 2], // A shot sent back by the guard
    block: [['block'], 0.7, 0.06, 2], // A shot softened by the guard
    staffCharge: [['reload'], 0.6, 0, 1, 0.8], // The reload's swell, deeper, timed to the charged shot
    chargeShot: [['shoot-1', 'shoot-2'], 0.8, 0.03, 1, 0.5], // The shot an octave down
    reload: [['reload'], 0.55, 0.02, 1], // The crystal draws mana in: swells up to the end of the reload
    reloadDone: [['reload-done'], 0.45, 0.02, 1], // …then rings: the same crystal, played forwards
    empty: [['empty'], 0.5, 0.08, 1, 0.85], // Out of mana: a stifled spell
    footstep: [['footstep-1', 'footstep-2', 'footstep-3', 'footstep-4', 'footstep-5', 'footstep-6', 'footstep-7', 'footstep-8', 'footstep-9', 'footstep-10'], 0.22, 0.06, 2],
    jump: [['jump'], 0.3, 0.05, 1],
    land: [['land'], 0.45, 0.06, 1],
    playerHurt: [['player-hurt-1', 'player-hurt-2'], 0.75, 0.05, 2],
    // Combat
    hit: [['hit-1', 'hit-2'], 0.45, 0.1, 4],
    crit: [['crit-1', 'crit-2'], 0.55, 0.06, 3],
    explosion: [['explosion'], 0.85, 0.1, 3],
    shockwave: [['explosion'], 1.0, 0.03, 1, 0.6],
    shieldBreak: [['shield-break'], 0.6, 0.05, 2],
    ricochet: [['ricochet-1', 'ricochet-2', 'ricochet-3'], 0.45, 0.12, 3],
    // Enemies
    enemyShoot: [['enemy-shoot-1', 'enemy-shoot-2'], 0.6, 0.1, 4],
    enemyDeath: [['enemy-death-1', 'enemy-death-2', 'enemy-death-3', 'enemy-death-4', 'enemy-death-5', 'enemy-death-6'], 0.7, 0.08, 3],
    towerShoot: [['tower-shoot-1', 'tower-shoot-2'], 0.55, 0.05, 3, 0.75],
    towerDeath: [['tower-death'], 1.0, 0.05, 2],
    // Boss
    // Boss: every move is announced (BossSentinel), so these play at the listener, never faded by distance
    bossRoar: [['boss-roar-1', 'boss-roar-2', 'boss-roar-3'], 1.0, 0.04, 1],
    bossLaser: [['boss-laser'], 0.8, 0.04, 1],
    bossSpiral: [['boss-spiral'], 0.75, 0, 1],
    bossCharge: [['boss-charge'], 0.9, 0, 1], // Swells up to the release of the energy wave
    bossTick: [['tick'], 1.0, 0, 2], // Countdown, pitched up beat after beat
    bossSummon: [['boss-summon'], 1.0, 0.03, 1, 0.85],
    bossSlam: [['boss-slam'], 1.0, 0.03, 1, 0.7], // Crashing to the ground, stunned
    meteor: [['meteor-1', 'meteor-2', 'meteor-3'], 0.8, 0.1, 4],
    // World and items
    gold: [['gold-1', 'gold-2', 'gold-3'], 0.5, 0.05, 2],
    health: [['health'], 0.6, 0.05, 1],
    mana: [['mana'], 0.5, 0.05, 1],
    upgrade: [['upgrade'], 0.7, 0, 1],
    chestOpen: [['chest-open'], 0.8, 0.03, 1],
    altar: [['altar'], 0.8, 0, 1],
    pact: [['pact'], 0.85, 0, 1],
    shopOpen: [['shop-open'], 0.9, 0, 1],
    purchase: [['purchase'], 0.6, 0.04, 1],
    fountain: [['fountain'], 0.8, 0, 1],
    spikes: [['spikes-1', 'spikes-2'], 0.5, 0.08, 3],
    // Interface
    uiClick: [['ui-click'], 0.45, 0.03, 2],
    uiConfirm: [['ui-confirm'], 0.5, 0, 1],
    uiError: [['ui-error'], 0.5, 0, 1],
    cardDeal: [['card-deal'], 0.45, 0.1, 3],
    reelStop: [['reel-stop'], 0.5, 0.05, 3],
    tick: [['tick'], 0.45, 0, 1],
    levelClear: [['level-clear'], 0.7, 0, 1],
    gameOver: [['game-over'], 0.9, 0, 1]
};

// Threat warnings keep the precise HRTF panning (front/back, height). The others, far more frequent,
// use equal-power panning: still left/right and distance, at a fraction of the CPU cost.
const PRECISE_PANNING = new Set(['enemyShoot', 'towerShoot', 'meteor']);

const SFX_VOLUME = 0.8;
const MUSIC_VOLUME = 0.3;
const VOLUME_KEY = 'arcaniste-volume'; // localStorage: { sfx, music }, each in [0, 1]

// Volumes the player set on this device (pause screen), or the defaults
function savedVolumes() {
    try {
        return JSON.parse(localStorage.getItem(VOLUME_KEY)) || {};
    } catch {
        return {}; // Storage unavailable (private mode): defaults
    }
}
const MIN_GAP = 0.03; // Seconds: the same sound restarted faster than this just stacks into noise

export class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        const saved = savedVolumes();
        const valid = (v, fallback) => (Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback);
        this.sfxVolume = valid(saved.sfx, SFX_VOLUME);
        this.musicVolume = valid(saved.music, MUSIC_VOLUME);
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = this.sfxVolume;
        this.sfxBus.connect(this.ctx.destination);

        this.buffers = new Map(); // file name -> AudioBuffer (missing until loaded)
        this.voices = new Map(); // sound name -> playing voices { source, gain }, oldest first
        this.lastStart = new Map(); // sound name -> ctx time
        this._loadAll();

        // Background Music
        this.isMuted = true;
        this.playlist = [
            'sounds/bgm1.mp3',
            'sounds/bgm2.mp3',
            'sounds/bgm3.mp3'
        ];
        this.currentTrackIndex = Math.floor(Math.random() * this.playlist.length);
        this.bgmAudio = new Audio();
        // Through Web Audio as well, for its volume: iPhone Safari ignores <audio>.volume
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = this.musicVolume;
        this.ctx.createMediaElementSource(this.bgmAudio).connect(this.musicBus).connect(this.ctx.destination);
        this.hasStartedBGM = false;
        this.bgmAudio.addEventListener('ended', () => this.playNextTrack());
    }

    _loadAll() {
        const files = new Set(Object.values(SFX).flatMap(([variants]) => variants));
        for (const file of files) {
            fetch(`sounds/sfx/${file}.mp3`)
                .then(response => response.arrayBuffer())
                .then(data => this.ctx.decodeAudioData(data))
                .then(buffer => this.buffers.set(file, buffer))
                .catch(() => console.warn(`Son introuvable : ${file}`));
        }
    }

    /**
     * Plays a sound effect. With a `position` (THREE.Vector3) it comes from that point in the world;
     * without, it plays at the listener (player, interface). `rate` > 1 plays it higher. `endIn` > 0
     * times it to end that many seconds from now (a swell peaking on its event): it starts later, or
     * part-way in. Returns nothing; silently skipped while the file is loading. With too many copies already playing,
     * the oldest one fades out: the newest event is the one to hear (a fast staff never goes mute).
     */
    play(name, position = null, rate = 1, endIn = 0) {
        const [variants, volume, pitch, maxVoices, baseRate = 1] = SFX[name];
        const now = this.ctx.currentTime;
        if (now - (this.lastStart.get(name) ?? -1) < MIN_GAP) return;
        const buffer = this.buffers.get(variants[Math.floor(Math.random() * variants.length)]);
        if (!buffer || this.ctx.state !== 'running') return;

        let voices = this.voices.get(name);
        if (!voices) this.voices.set(name, (voices = []));
        if (voices.length >= maxVoices) {
            const oldest = voices.shift();
            oldest.gain.gain.setTargetAtTime(0, now, 0.01); // ~50 ms fade: no click
            oldest.source.stop(now + 0.05);
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = baseRate * rate * (1 + (Math.random() * 2 - 1) * pitch);
        const gain = this.ctx.createGain();
        gain.gain.value = volume;
        source.connect(gain);

        if (position) {
            const panner = this.ctx.createPanner();
            panner.panningModel = PRECISE_PANNING.has(name) ? 'HRTF' : 'equalpower';
            panner.distanceModel = 'inverse';
            panner.refDistance = 4; // Full volume within 4 m, half at 8 m
            panner.maxDistance = 80;
            panner.positionX.value = position.x;
            panner.positionY.value = position.y;
            panner.positionZ.value = position.z;
            gain.connect(panner).connect(this.sfxBus);
        } else {
            gain.connect(this.sfxBus);
        }

        const voice = { source, gain };
        voices.push(voice);
        this.lastStart.set(name, now);
        source.onended = () => {
            const i = voices.indexOf(voice);
            if (i >= 0) voices.splice(i, 1);
        };
        const speed = source.playbackRate.value;
        const length = buffer.duration / speed; // Seconds as played
        if (endIn > 0) source.start(now + Math.max(0, endIn - length), Math.max(0, length - endIn) * speed);
        else source.start();
    }

    // Fades out every copy of a sound still playing or waiting to start (a swell whose event was called off)
    stop(name) {
        const voices = this.voices.get(name);
        if (!voices) return;
        const now = this.ctx.currentTime;
        for (const { source, gain } of voices.splice(0)) {
            gain.gain.setTargetAtTime(0, now, 0.01);
            source.stop(now + 0.05);
        }
    }

    // The ears follow the camera (called every frame)
    updateListener(camera) {
        const l = this.ctx.listener;
        const p = camera.position;
        const e = camera.matrixWorld.elements; // Columns: x axis, y axis (up), z axis (camera looks down -z)
        if (l.positionX) {
            l.positionX.value = p.x;
            l.positionY.value = p.y;
            l.positionZ.value = p.z;
            l.forwardX.value = -e[8];
            l.forwardY.value = -e[9];
            l.forwardZ.value = -e[10];
            l.upX.value = e[4];
            l.upY.value = e[5];
            l.upZ.value = e[6];
        } else {
            // Firefox: older listener API
            l.setPosition(p.x, p.y, p.z);
            l.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
        }
    }

    // `kind`: 'sfx' or 'music'; `volume` in [0, 1]. Remembered on this device.
    setVolume(kind, volume) {
        this[`${kind}Volume`] = volume;
        (kind === 'sfx' ? this.sfxBus : this.musicBus).gain.value = volume;
        try {
            localStorage.setItem(VOLUME_KEY, JSON.stringify({ sfx: this.sfxVolume, music: this.musicVolume }));
        } catch { /* Storage unavailable: kept for this session only */ }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.isMuted) {
            this.bgmAudio.pause();
        } else if (this.hasStartedBGM) {
            this.bgmAudio.play().catch(e => console.warn('Autoplay blocked:', e));
        } else {
            this.startBGM();
        }
        return this.isMuted;
    }

    startBGM() {
        if (this.isMuted || this.hasStartedBGM) return;
        this.hasStartedBGM = true;
        this.bgmAudio.src = this.playlist[this.currentTrackIndex];
        this.bgmAudio.play().catch(e => {
            console.warn('Autoplay blocked:', e);
            this.hasStartedBGM = false;
        });
    }

    playNextTrack() {
        if (this.isMuted) return;
        let nextIndex;
        do {
            nextIndex = Math.floor(Math.random() * this.playlist.length);
        } while (nextIndex === this.currentTrackIndex && this.playlist.length > 1);

        this.currentTrackIndex = nextIndex;
        this.bgmAudio.src = this.playlist[this.currentTrackIndex];
        this.bgmAudio.play().catch(e => console.warn('Autoplay blocked:', e));
    }

    ensureContext() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (!this.hasStartedBGM && !this.isMuted) this.startBGM();
    }
}

export const soundManager = new SoundManager();
