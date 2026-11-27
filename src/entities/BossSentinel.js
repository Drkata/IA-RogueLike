import * as THREE from 'three';
import { Projectile } from './Projectile.js';
import { Enemy } from './Enemy.js';
import { FloatingText } from './FloatingText.js';
import { PALETTE } from '../core/Palette.js';
import { soundManager } from '../systems/SoundManager.js';
import { TextureGenerator } from '../systems/TextureGenerator.js';
import { CONSTANTS } from '../core/Constants.js';
import { lateDamage } from './EnemyAI.js';
import { EYE_HEIGHT } from './Player.js';

/*
 * The colossal Sentinel: a giant stone eye in three spiked rings (see ART_DIRECTION.md « Boss »).
 *
 * It attacks in a random order (BAG), and from level 30 sometimes starts a second move as the first
 * lands (combo). Every move is announced: the eye and the rings' runes take the move's colour, a
 * sound starts, and three rising ticks count down to the hit (it lands on the fourth beat). A hint
 * is shown the first time. After its big moves the boss crashes to the ground, stunned: it can then
 * be hit with the sword and takes double damage. A player jumping higher than a normal jump is shot
 * at (anti-air), and meteors leave the ground burning.
 *
 * A move is a timeline of beats, [seconds from its start, action or null]; the last beat ends it.
 */

const HOVER_Y = 12;
const STUNNED_Y = 4.2; // The eye (radius 4) resting just above the ground: in staff reach
const EYE_RADIUS = 4;
const SHOT_Y = 1.0; // Waves and spiral shots fly waist high: a jump clears them
const STUN_DAMAGE = 2; // Damage multiplier while stunned
const STUNNED_SOLID_RADIUS = 3.4; // Width of the eye at the player's height when it lies on the ground

// Moves drawn in random order, the bag refilled when empty: three waves for one of each other move.
// The big ones (BIG) leave the boss stunned.
const BAG = ['nova', 'nova', 'nova', 'spiral', 'meteors', 'summon'];
const BIG = new Set(['spiral', 'meteors']);
const NORMAL_JUMP = CONSTANTS.JUMP_FORCE ** 2 / (2 * CONSTANTS.GRAVITY); // 2.4 m: a jump without the Wings pact
// High wave rows: the first over a standing head, the next 2.2 m apart so their reach (0.75 + 0.5 m) overlaps, up to
// 6 rows of 60 orbs: five high waves in flight stay under an instanced batch's 2048 copies
const HIGH_WAVE = { y: 3.2, gap: 2.2, reach: 0.75, rows: 6, orbs: 60 };
const ANTI_AIR = { every: 0.5, speed: 30 }; // s between shots at a player above a normal jump, m/s
const BURN = { time: 3, radius: 3.5, share: 0.25, every: 0.5 }; // Meteor impact: s, m, meteor damage per second, s between hurts
// shortcut: perf cap (two spirals of 20 arms: about 1000 shots in flight); a later boss stops adding arms
const SPIRAL_ARMS_MAX = 20;
const COLORS = {
    idle: PALETTE.ember,
    nova: PALETTE.hexBright,
    novaHigh: PALETTE.ember,
    spiral: PALETTE.emberBright,
    meteors: PALETTE.ember,
    summon: PALETTE.hex,
    stun: PALETTE.vellum
};
const HINTS = {
    nova: "Vague d'énergie : sautez au 4e signal, quand elle arrive sur vous",
    spiral: 'Tourbillon : reculez et sautez par-dessus les tirs',
    novaHigh: 'Vague haute, rouge : restez au sol, ne sautez pas',
    meteors: 'Pluie de météores : sortez des cercles avant qu’ils soient pleins, puis des flammes',
    summon: 'Le boss appelle des renforts : les portails violets',
    combo: 'Le boss lance deux attaques à la fois',
    antiAir: "Trop haut dans les airs : l'œil vous tire dessus"
};

const _dir = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
const _color = new THREE.Color();
const _target = new THREE.Color();
const _aim = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class BossSentinel {
    static idCounter = 1000; // Start high to avoid conflict with minions

    static getHP(level) {
        return level * 200; // Level 10 = 2000 HP
    }

    // Like the enemies' shots: linear up to level 30, then +3 % a level
    static getNovaDamage(level) {
        return lateDamage(level, 10, 1);
    }

    static getSpiralDamage(level) {
        return lateDamage(level, 7, 1);
    }

    static getMeteorDamage(level) {
        return lateDamage(level, 20, 1.5);
    }

    constructor(position, levelManager, entityManager, level) {
        this.id = BossSentinel.idCounter++;
        this.position = position.clone();
        this.position.y = HOVER_Y;
        this.levelManager = levelManager;
        this.entityManager = entityManager;
        this.level = level;
        this.entityType = 'enemy'; // Fix for minified builds

        this.isDead = false;
        this.maxHealth = BossSentinel.getHP(level);
        this.health = this.maxHealth;
        this.radius = EYE_RADIUS + 0.5; // Hitbox for shots and the staff

        // Every 10 boss levels: faster shots, shorter warnings and rests, more of everything. Past level 50
        // the warning and the rest keep shortening, towards 0.5 s and 0.4 s.
        this.tier = Math.max(1, Math.floor(level / 10));
        const late = Math.max(0, this.tier - 5);
        this.speedMult = 1 + this.tier * 0.05;
        this.tell = this.tier <= 5 ? 1.5 - 0.15 * (this.tier - 1) : 0.5 + 0.4 * 0.85 ** late; // Warning before a move lands
        this.rest = this.tier <= 5 ? 2.0 - 0.25 * (this.tier - 1) : 0.4 + 0.6 * 0.85 ** late; // Pause after a move
        // Chance a move comes with a second one: 1 in 3 at level 30, 1 in 2 at 50, every move from 70
        this.comboChance = level < 30 ? 0 : level < 50 ? THREE.MathUtils.lerp(1 / 3, 1 / 2, (level - 30) / 20) : Math.min(1, THREE.MathUtils.lerp(1 / 2, 1, (level - 50) / 20));

        this.disposables = [];
        this.mesh = this._buildMesh();
        this.mesh.position.copy(this.position);
        this.mesh.userData.entity = this;

        // Solid only while it lies on the ground (height 0 = not solid)
        this.solid = levelManager.addSolidProp(new THREE.Vector3(position.x, 0, position.z), STUNNED_SOLID_RADIUS, 0);

        this.player = null;
        this.bag = [];
        this.stunNext = false;
        this.clock = 0; // s into the current move
        this.age = 0; // s since the fight began
        this.burns = []; // { x, z, y, from, until }: burning ground left by the meteors (age times)
        this.burnWait = 0;
        this.antiAirWait = 0;
        // Roar on arrival (first frame of play: the arena is built behind the upgrade menu), then a grace period
        this.beats = [[0, () => soundManager.play('bossRoar')], [3, null]];
        this.charge = null; // { color, start, end }: the eye lights up towards the move's colour
        this.hinted = new Set();
        this.targetY = HOVER_Y;
        this.stunned = false;
        this.spinDir = 1;
        this.spiralAngle = 0;
        this.isSpiraling = false;
        this.flash = 0;

        this.healthContainer = document.getElementById('boss-health-container');
        this.healthBar = document.getElementById('boss-health-bar');
        this.healthText = document.getElementById('boss-health-text');
        if (this.healthContainer) this.healthContainer.hidden = false;
        this.updateHealthBar();
    }

    // ─── Look ────────────────────────────────────────────────────────────────

    _buildMesh() {
        const keep = (thing) => (this.disposables.push(thing), thing);
        const stone = keep(new THREE.MeshStandardMaterial({ color: 0x2e2a2e, roughness: 0.65, metalness: 0.15 }));
        this.irisMat = keep(new THREE.MeshStandardMaterial({ color: PALETTE.ember, emissive: PALETTE.ember, emissiveIntensity: 0.8, roughness: 0.25 }));
        this.runeMat = keep(new THREE.MeshStandardMaterial({ color: 0x120c10, emissive: PALETTE.ember, emissiveIntensity: 1.2 }));
        const pupilMat = keep(new THREE.MeshStandardMaterial({ color: 0x080506, roughness: 0.4 }));
        const mesh = (geometry, material) => new THREE.Mesh(keep(geometry), material);
        const group = new THREE.Group();

        // The eye, turned to the player: stone ball, glowing iris cap and a vertical slit pupil on +z
        this.eye = new THREE.Group();
        this.eye.add(mesh(new THREE.SphereGeometry(EYE_RADIUS, 48, 32), stone));
        this.eye.add(mesh(new THREE.SphereGeometry(EYE_RADIUS + 0.03, 48, 12, 0, Math.PI * 2, 0, 0.55).rotateX(Math.PI / 2), this.irisMat));
        this.pupil = mesh(new THREE.SphereGeometry(EYE_RADIUS + 0.06, 8, 12, Math.PI / 2 - 0.1, 0.2, Math.PI / 2 - 0.45, 0.9), pupilMat);
        this.eye.add(this.pupil);
        group.add(this.eye);

        // Three rings turning like a gyroscope, studded with runes; the outer one bristles with spikes
        const studGeo = keep(new THREE.BoxGeometry(0.6, 0.6, 0.6));
        const spikeGeo = keep(new THREE.ConeGeometry(0.3, 1.6, 6));
        this.rings = [[6.0, 0.35], [7.2, 0.3], [8.4, 0.25]].map(([radius, tube], k) => {
            const ring = mesh(new THREE.TorusGeometry(radius, tube, 10, 96), stone);
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2 + k * 0.4;
                const part = new THREE.Mesh(k === 2 && i % 2 ? spikeGeo : studGeo, k === 2 && i % 2 ? stone : this.runeMat);
                part.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
                part.rotation.z = a - Math.PI / 2; // Spikes point outwards
                if (k === 2 && i % 2) part.position.multiplyScalar(1 + 0.9 / radius);
                ring.add(part);
            }
            ring.rotation.set(k * 1.1, k * 0.7, 0);
            group.add(ring);
            return ring;
        });

        // Rocks in orbit
        this.debris = new THREE.Group();
        const rockGeo = keep(new THREE.DodecahedronGeometry(0.7, 0));
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const rock = new THREE.Mesh(rockGeo, stone);
            rock.position.set(Math.cos(a) * 10.5, Math.sin(i * 1.7) * 2, Math.sin(a) * 10.5);
            rock.scale.setScalar(0.7 + (i % 3) * 0.3);
            this.debris.add(rock);
        }
        group.add(this.debris);

        // Aura in the colour of the coming move (a sprite: no light is added in the middle of a level)
        this.auraMat = keep(new THREE.SpriteMaterial({
            map: TextureGenerator.getGlowTexture(),
            color: PALETTE.ember,
            transparent: true,
            opacity: 0.55,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        }));
        const aura = new THREE.Sprite(this.auraMat);
        aura.scale.setScalar(20);
        group.add(aura);
        return group;
    }

    // Eye colour, pupil, rings and height, every frame
    _updateBody(dt) {
        const time = performance.now() / 1000;
        const c = this.charge;
        const t = c ? Math.min(1, (this.clock - c.start) / Math.max(0.01, c.end - c.start)) : 0;
        _color.setHex(COLORS.idle).lerp(_target.setHex(c ? c.color : COLORS.idle), t);
        let glow = 0.8 + 2.2 * t;
        if (this.stunned) glow = 0.3 + 0.25 * Math.max(0, Math.sin(time * 9)); // Dazed flicker
        if (this.flash > 0) {
            this.flash -= dt;
            _color.setHex(PALETTE.vellum);
            glow = 3;
        }
        this.irisMat.emissive.copy(_color);
        this.irisMat.color.copy(_color);
        this.irisMat.emissiveIntensity = glow;
        this.runeMat.emissive.copy(_color);
        this.runeMat.emissiveIntensity = 0.6 + glow * 0.6;
        this.auraMat.color.copy(_color);
        this.auraMat.opacity = this.stunned ? 0.15 : 0.35 + 0.25 * t;
        this.pupil.scale.x = this.stunned ? 2.2 : 1 - 0.6 * t; // Narrows as it takes aim, wide when dazed

        // Rings and rocks slow down to a crawl when stunned
        const speed = this.stunned ? 0.15 : 1 + 2 * t;
        this.rings[0].rotation.y += dt * 0.5 * speed;
        this.rings[1].rotation.x += dt * 0.4 * speed;
        this.rings[2].rotation.z -= dt * 0.3 * speed;
        this.debris.rotation.y += dt * 0.25 * speed;

        // Height: falls fast, rises slowly
        this.position.y += (this.targetY - this.position.y) * Math.min(1, dt * (this.targetY < this.position.y ? 7 : 2.5));
        this.mesh.position.copy(this.position);
        this.solid.height = this.position.y < HOVER_Y * 0.6 ? 2 * STUNNED_Y : 0;

        if (this.isSpiraling) this.mesh.rotation.set(0, this.spiralAngle, 0);
        else if (this.stunned) this.mesh.rotation.x += (0.5 - this.mesh.rotation.x) * Math.min(1, dt * 3); // Slumps forward
        else if (this.player) this.mesh.lookAt(this.player.position);
    }

    // ─── Damage ──────────────────────────────────────────────────────────────

    takeDamage(amount, isCritical = false) {
        if (this.isDead) return false;
        if (this.stunned) amount *= STUN_DAMAGE;

        this.health -= amount;
        this.updateHealthBar();
        FloatingText.spawnDamage(this.entityManager, this.position, 5.0, amount, isCritical, isCritical ? 5.0 : 4.0);
        this.flash = 0.06;

        if (this.health <= 0) {
            this.die();
            return true;
        }
        return false;
    }

    updateHealthBar() {
        if (this.healthBar) {
            this.healthBar.style.transform = `scaleX(${Math.max(0, this.health / this.maxHealth)})`;
        }
        if (this.healthText) {
            this.healthText.textContent = `${Math.ceil(Math.max(0, this.health))} / ${this.maxHealth}`;
        }
    }

    die() {
        this.isDead = true;
        soundManager.play('bossRoar');
        this.mesh.visible = false;
        this.beats = [];
        this.burns = [];
        this.solid.height = 0;
        if (this.healthContainer) this.healthContainer.hidden = true;
        this.entityManager.createExplosion(this.position, 0); // Visual only
    }

    dispose() {
        this.disposables.forEach(d => d.dispose());
    }

    // ─── Moves ───────────────────────────────────────────────────────────────

    update(dt, player) {
        if (this.isDead) return;
        this.player = player;

        this.clock += dt;
        this.age += dt;
        while (this.beats.length && this.beats[0][0] <= this.clock) {
            const action = this.beats.shift()[1];
            if (action) action();
        }
        if (!this.beats.length) this._nextMove();
        if (!this.stunned) this._antiAir(dt);
        this._burnGround(dt);
        this._updateBody(dt);
    }

    // The next move, drawn from the bag; after a big move, the stun. From level 30 a second move sometimes
    // starts as the first one lands: its own warning, countdown and hit.
    _nextMove() {
        this.clock = 0;
        this.charge = null;
        const beatsOf = (kind) => ({ nova: this._novaBeats, spiral: this._spiralBeats, meteors: this._meteorBeats, summon: this._summonBeats, stun: this._stunBeats }[kind].call(this));
        if (this.stunNext) {
            this.stunNext = false;
            this.beats = beatsOf('stun').sort((a, b) => a[0] - b[0]);
            return;
        }
        const kind = this._draw();
        let beats = beatsOf(kind);
        this.stunNext = BIG.has(kind);
        if (Math.random() < this.comboChance) {
            const second = this._draw(kind);
            beats.push([this.tell, () => this._hint('combo')]);
            beats = beats.concat(beatsOf(second).map(([t, action]) => [t + this.tell, action]));
            this.stunNext ||= BIG.has(second);
        }
        this.beats = beats.sort((a, b) => a[0] - b[0]);
    }

    // A move from the bag, other than `not`; a new shuffled bag when it is empty
    _draw(not) {
        if (!this.bag.length) this.bag = [...BAG].sort(() => 0.5 - Math.random());
        const i = this.bag.findIndex(k => k !== not);
        return i < 0 ? BAG.find(k => k !== not) : this.bag.splice(i, 1)[0];
    }

    // The eye turns to the move's colour over the warning; the first time, a hint says what to do
    _announce(kind, duration = this.tell) {
        this.charge = { color: COLORS[kind], start: this.clock, end: this.clock + duration };
        this._hint(kind);
    }

    _hint(kind) {
        if (this.hinted.has(kind) || !this.player?.hudManager) return;
        this.hinted.add(kind);
        this.player.hudManager.showMessage(HINTS[kind]);
    }

    // Three rising ticks, the last one 0.3 s before `at` (closer together when the warning is shorter
    // than 0.9 s): the hit lands on the fourth beat
    _countdown(beats, at) {
        const step = Math.min(0.3, at / 3);
        [3, 2, 1].forEach((n, i) => beats.push([at - n * step, () => soundManager.play('bossTick', null, 1 + i * 0.22)]));
    }

    // A player higher than a normal jump above the ground under them gets a fast shot aimed where they will be
    _antiAir(dt) {
        const p = this.player;
        const feet = p.position.y - EYE_HEIGHT;
        if (p.onGround || feet - this.levelManager.getFloorHeight(p.position.x, p.position.z, feet) < NORMAL_JUMP + 0.3) {
            this.antiAirWait = 0;
            return;
        }
        this.antiAirWait -= dt;
        if (this.antiAirWait > 0) return;
        this.antiAirWait = ANTI_AIR.every;
        this._hint('antiAir');
        const speed = ANTI_AIR.speed * this.speedMult;
        const t = this.position.distanceTo(p.position) / speed;
        _aim.copy(p.position).addScaledVector(p.velocity, t);
        _aim.y -= 0.5 * CONSTANTS.GRAVITY * t * t;
        this._fire(this.position, _dir.subVectors(_aim, this.position), speed, BossSentinel.getNovaDamage(this.level), 'Boss : tir anti-aérien', { color: PALETTE.emberBright, radius: 0.5 });
    }

    // Burning ground left by the meteors: alight when the meteor lands, hurts whoever stands in it
    _burnGround(dt) {
        if (!this.burns.length) return;
        const p = this.player;
        const feet = p.position.y - EYE_HEIGHT;
        let inside = false;
        this.burns = this.burns.filter(b => {
            if (b.from > this.age) return true;
            if (!b.lit) {
                b.lit = true;
                this.entityManager.createTelegraph(b, b.until - this.age, BURN.radius, PALETTE.ember, true);
            }
            if (Math.hypot(p.position.x - b.x, p.position.z - b.z) < BURN.radius && feet - b.y < 1) inside = true;
            return b.until > this.age;
        });
        this.burnWait = inside ? this.burnWait - dt : 0;
        if (!inside || this.burnWait > 0) return;
        this.burnWait = BURN.every;
        p.takeDamage(BossSentinel.getMeteorDamage(this.level) * BURN.share * BURN.every, 'Boss : sol brûlant', this.id);
    }

    _fire(origin, direction, speed, damage, sourceName, options = {}) {
        const proj = new Projectile(origin, direction, speed, damage, this.levelManager, {
            sourceName,
            sourceId: this.id,
            source: this,
            maxDistance: 200,
            ...options
        });
        this.entityManager.add(proj);
        return proj;
    }

    // Energy waves: full rings of orbs, one more wave per 10 boss levels (up to 6), 0.6 to 1.4 s apart.
    // Low waves (violet) fly waist high: jump them. After the first, half are high (red): rows from over
    // the head up to the top of the player's jump, Wings pacts included, so staying down is the answer.
    // Each wave after the first is called by a tick (lower for a high one) and the eye's colour.
    _novaBeats() {
        const at = this.tell;
        const waves = Math.min(6, this.tier);
        const beats = [
            [0, () => this._announce('nova')],
            [Math.max(0, at - 0.62), () => soundManager.play('bossCharge')] // 0.62 s: the charge swells up to the release
        ];
        this._countdown(beats, at);
        let t = at;
        for (let w = 0; w < waves; w++) {
            const high = w > 0 && Math.random() < 0.5;
            if (w > 0) {
                t += 0.6 + Math.random() * 0.8;
                beats.push([t - 0.3, () => {
                    soundManager.play('bossTick', null, high ? 0.9 : 1.44);
                    this._announce(high ? 'novaHigh' : 'nova', 0.3);
                }]);
            }
            beats.push([t, () => this._fireNova(high)]);
        }
        beats.push([t + this.rest, null]);
        return beats;
    }

    _fireNova(high) {
        soundManager.play('bossLaser');
        if (!high) {
            this._ring(96, SHOT_Y, 0.5, 1, COLORS.nova); // Gaps narrower than the player: jumping is the answer
            return;
        }
        const jump = (CONSTANTS.JUMP_FORCE * (this.player?.pactJumpMultiplier ?? 1)) ** 2 / (2 * CONSTANTS.GRAVITY);
        const top = EYE_HEIGHT + jump - (HIGH_WAVE.reach + 0.5); // Last row's height to reach the eye at the top of the jump
        const rows = Math.min(HIGH_WAVE.rows, 1 + Math.max(0, Math.ceil((top - HIGH_WAVE.y) / HIGH_WAVE.gap)));
        for (let r = 0; r < rows; r++) this._ring(HIGH_WAVE.orbs, HIGH_WAVE.y + r * HIGH_WAVE.gap, HIGH_WAVE.reach, HIGH_WAVE.reach / 0.5, COLORS.novaHigh);
    }

    _ring(count, y, radius, scale, color) {
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            _dir.set(Math.sin(angle), 0, Math.cos(angle));
            _spawnPos.set(this.position.x, y, this.position.z);
            this._fire(_spawnPos, _dir, 22 * this.speedMult, BossSentinel.getNovaDamage(this.level), "Boss : vague d'énergie", { color, radius, scale, geometry: Projectile.orbGeometry });
        }
    }

    // 4 s of spinning spiral; the spin turns back at uneven times (1 to 2.5 s apart), each called by a tick.
    // From level 30 a second spiral turns the other way. Every second, a salvo of 3 shots at the player.
    _spiralBeats() {
        const at = this.tell;
        const duration = 4;
        const interval = 0.16;
        const beats = [
            [0, () => {
                this._announce('spiral');
                soundManager.play('bossSpiral');
            }],
            [at, () => { this.isSpiraling = true; }],
            [at + duration, () => { this.isSpiraling = false; }],
            [at + duration + this.rest, null]
        ];
        this._countdown(beats, at);
        for (let t = 0; t < duration; t += interval) beats.push([at + t, () => this._spiralRing()]);
        for (let t = 1 + Math.random() * 1.5; t < duration; t += 1 + Math.random() * 1.5) {
            beats.push([at + t - 0.3, () => soundManager.play('bossTick', null, 1.2)], [at + t, () => { this.spinDir *= -1; }]);
        }
        for (let t = 1; t < duration; t += 1) beats.push([at + t, () => this._aimedSalvo()]);
        return beats;
    }

    _spiralRing() {
        const arms = Math.min(SPIRAL_ARMS_MAX, 6 + 2 * this.tier); // 8 arms on the first boss
        const speed = 13 * (1 + 0.1 * this.tier); // Faster on each boss
        for (const turn of this.level >= 30 ? [1, -1] : [1]) {
            for (let i = 0; i < arms; i++) {
                const angle = turn * this.spiralAngle + (i / arms) * Math.PI * 2;
                _dir.set(Math.sin(angle), 0, Math.cos(angle));
                _spawnPos.set(this.position.x, SHOT_Y, this.position.z);
                this._fire(_spawnPos, _dir, speed, BossSentinel.getSpiralDamage(this.level), 'Boss : tourbillon', { radius: 0.6, scale: 0.8 });
            }
        }
        this.spiralAngle += 0.19 * this.spinDir; // ≈ 1.2 rad/s: the arms curve visibly
    }

    // Three shots fanned out at the player, from the eye
    _aimedSalvo() {
        if (!this.player) return;
        for (const spread of [-0.1, 0, 0.1]) {
            _dir.subVectors(this.player.position, this.position).applyAxisAngle(_up, spread);
            this._fire(this.position, _dir, 18 * this.speedMult, BossSentinel.getSpiralDamage(this.level), 'Boss : tourbillon', { color: COLORS.spiral, radius: 0.6, scale: 0.8 });
        }
    }

    // Meteor rain, in salvos of 4 every 0.8 s: each one's circle fills up until it lands, sooner on later
    // bosses (2.2 s on the first, down to 1.4 s). A third fall on the player (half from level 30, two
    // thirds from 50; the others of a salvo within 5 m of them), and every impact sets the ground alight.
    _meteorBeats() {
        const at = this.tell;
        const count = Math.min(50, 20 + 10 * this.tier);
        const salvo = 4;
        const interval = 0.8;
        const aimedOfSix = this.level >= 50 ? 4 : this.level >= 30 ? 3 : 2;
        const flight = Math.max(1.4, 2.4 - 0.2 * this.tier);
        const beats = [[0, () => {
            this._announce('meteors');
            soundManager.play('bossRoar');
        }]];
        const salvos = Math.ceil(count / salvo);
        for (let s = 0; s < salvos; s++) {
            beats.push([at + s * interval, () => {
                let aimed = 0;
                for (let i = s * salvo; i < Math.min(count, (s + 1) * salvo); i++) {
                    this._launchMeteor(i % 6 < aimedOfSix ? aimed++ : -1, flight);
                }
            }]);
        }
        beats.push([at + (salvos - 1) * interval + flight + this.rest, null]);
        return beats;
    }

    // `aimed`: -1 anywhere in the arena, 0 on the player, more within 5 m of them
    _launchMeteor(aimed, flightTime) {
        const gravity = 20;
        const radius = 3.0;
        const range = 40;
        const p = this.player.position;
        const target = aimed < 0
            ? new THREE.Vector3(this.position.x + (Math.random() - 0.5) * 2 * range, 0, this.position.z + (Math.random() - 0.5) * 2 * range)
            : new THREE.Vector3(p.x, 0, p.z);
        if (aimed > 0) {
            const a = Math.random() * Math.PI * 2;
            const d = 2 + Math.random() * 3;
            target.x += Math.sin(a) * d;
            target.z += Math.cos(a) * d;
        }
        // The circle shows the real reach: hit radius + the player's 0.5 m
        this.entityManager.createTelegraph(target, flightTime, radius + 0.5);
        this.burns.push({ x: target.x, y: target.y, z: target.z, from: this.age + flightTime, until: this.age + flightTime + BURN.time });

        // Ballistic launch velocity to land on target after flightTime
        _spawnPos.copy(this.position);
        _spawnPos.y += 5;
        const velocity = _dir.subVectors(target, _spawnPos);
        velocity.y = 0;
        const hSpeed = velocity.length() / flightTime;
        velocity.normalize().multiplyScalar(hSpeed);
        velocity.y = (0.5 * gravity * flightTime * flightTime + (target.y - _spawnPos.y)) / flightTime;

        this._fire(_spawnPos, velocity, velocity.length(), BossSentinel.getMeteorDamage(this.level), 'Boss : pluie de météores', {
            gravity,
            radius,
            color: PALETTE.ember,
            scale: radius
        });
    }

    // Reinforcements: violet portals open where the minions will appear
    _summonBeats() {
        const at = this.tell + 0.5;
        let spots = [];
        return [
            [0, () => {
                this._announce('summon');
                soundManager.play('bossSummon');
                spots = this._summonSpots();
                spots.forEach(p => this.entityManager.createTelegraph(p, at, 1.5, PALETTE.hex));
            }],
            [at, () => spots.forEach(p => this.entityManager.add(new Enemy(p, this.levelManager, this.entityManager, this.level)))],
            [at + this.rest + 1, null]
        ];
    }

    _summonSpots() {
        // Count doubles every 10 levels, capped at 30 for performance
        const count = Math.min(30, 10 * Math.pow(2, this.tier - 1));
        const radius = Math.min(25, 10 + count * 0.5); // Wider ring for bigger groups
        const spots = [];
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const p = new THREE.Vector3(this.position.x + Math.sin(angle) * radius, 0, this.position.z + Math.cos(angle) * radius);
            p.y = this.levelManager.getFloorHeight(p.x, p.z, 3.0);
            if (!this.levelManager.isWall(p.x, p.z, p.y)) spots.push(p);
        }
        return spots;
    }

    // Exhausted: crashes to the ground, open to the staff (double damage), then roars and rises
    _stunBeats() {
        const fall = 0.8;
        const stay = Math.max(3.5, 6 - 0.5 * (this.tier - 1));
        const rise = 1.2;
        return [
            [0, () => {
                this.stunned = true;
                this.targetY = STUNNED_Y;
                soundManager.play('shieldBreak');
                this.player.hudManager?.showMessage("Le boss est à terre : frappez-le à l'épée ! Dégâts ×2");
            }],
            [fall * 0.6, () => soundManager.play('bossSlam')],
            [fall + stay - 0.8, () => soundManager.play('bossRoar')], // About to get up
            [fall + stay, () => { this.targetY = HOVER_Y; }],
            [fall + stay + rise, () => {
                this.stunned = false;
                this.mesh.rotation.x = 0;
            }],
            [fall + stay + rise + 0.5, null]
        ];
    }
}
