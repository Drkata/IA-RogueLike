import * as THREE from 'three';
import { Projectile } from './Projectile.js';
import { Enemy } from './Enemy.js';
import { FloatingText } from './FloatingText.js';
import { PALETTE } from '../core/Palette.js';
import { soundManager } from '../systems/SoundManager.js';
import { TextureGenerator } from '../systems/TextureGenerator.js';

/*
 * The colossal Sentinel: a giant stone eye in three spiked rings (see ART_DIRECTION.md « Boss »).
 *
 * It attacks one move at a time, in a fixed cycle a player can learn. Every move is announced:
 * the eye and the rings' runes take the move's colour, a sound starts, and three rising ticks
 * count down to the hit (it lands on the fourth beat). A hint is shown the first time. After its
 * big moves the boss crashes to the ground, stunned: it can then be hit with the staff and
 * takes double damage.
 *
 * A move is a timeline of beats, [seconds from its start, action or null]; the last beat ends it.
 */

const HOVER_Y = 12;
const STUNNED_Y = 4.2; // The eye (radius 4) resting just above the ground: in staff reach
const EYE_RADIUS = 4;
const SHOT_Y = 1.0; // Waves and spiral shots fly waist high: a jump clears them
const STUN_DAMAGE = 2; // Damage multiplier while stunned
const STUNNED_SOLID_RADIUS = 3.4; // Width of the eye at the player's height when it lies on the ground

const CYCLE = ['nova', 'spiral', 'stun', 'nova', 'meteors', 'stun', 'summon', 'nova'];
const COLORS = {
    idle: PALETTE.ember,
    nova: PALETTE.hexBright,
    spiral: PALETTE.emberBright,
    meteors: PALETTE.ember,
    summon: PALETTE.hex,
    stun: PALETTE.vellum
};
const HINTS = {
    nova: "Vague d'énergie : sautez au 4e signal, quand elle arrive sur vous",
    spiral: 'Tourbillon : reculez et sautez par-dessus les tirs',
    meteors: 'Pluie de météores : sortez des cercles avant qu’ils soient pleins',
    summon: 'Le boss appelle des renforts : les portails violets'
};

const _dir = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
const _color = new THREE.Color();
const _target = new THREE.Color();

export class BossSentinel {
    static idCounter = 1000; // Start high to avoid conflict with minions

    static getHP(level) {
        return level * 100; // Level 10 = 1000 HP
    }

    static getNovaDamage(level) {
        return 10 + level;
    }

    static getSpiralDamage(level) {
        return 7 + level;
    }

    static getMeteorDamage(level) {
        return 20 + (level * 1.5);
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

        // Every 10 boss levels: faster shots, shorter warnings and rests, more of everything
        this.tier = Math.max(1, Math.floor(level / 10));
        this.speedMult = 1 + this.tier * 0.05;
        this.tell = Math.max(0.9, 1.5 - 0.15 * (this.tier - 1)); // Warning before a move lands
        this.rest = Math.max(1.0, 2.0 - 0.25 * (this.tier - 1)); // Pause after a move

        this.disposables = [];
        this.mesh = this._buildMesh();
        this.mesh.position.copy(this.position);
        this.mesh.userData.entity = this;

        // Solid only while it lies on the ground (height 0 = not solid)
        this.solid = levelManager.addSolidProp(new THREE.Vector3(position.x, 0, position.z), STUNNED_SOLID_RADIUS, 0);

        this.player = null;
        this.step = 0;
        this.clock = 0;
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
        while (this.beats.length && this.beats[0][0] <= this.clock) {
            const action = this.beats.shift()[1];
            if (action) action();
        }
        if (!this.beats.length) this._nextMove();
        this._updateBody(dt);
    }

    _nextMove() {
        const kind = CYCLE[this.step++ % CYCLE.length];
        this.clock = 0;
        this.charge = null;
        const beats = { nova: this._novaBeats, spiral: this._spiralBeats, meteors: this._meteorBeats, summon: this._summonBeats, stun: this._stunBeats }[kind].call(this);
        this.beats = beats.sort((a, b) => a[0] - b[0]);
    }

    // The eye turns to the move's colour over the warning; the first time, a hint says what to do
    _announce(kind) {
        this.charge = { color: COLORS[kind], start: this.clock, end: this.clock + this.tell };
        if (this.hinted.has(kind) || !this.player.hudManager) return;
        this.hinted.add(kind);
        this.player.hudManager.showMessage(HINTS[kind]);
    }

    // Three rising ticks, the last one 0.3 s before `at`: the hit lands on the fourth beat
    _countdown(beats, at) {
        [0.9, 0.6, 0.3].forEach((before, i) => beats.push([at - before, () => soundManager.play('bossTick', null, 1 + i * 0.22)]));
    }

    _fire(origin, direction, speed, damage, sourceName, options = {}) {
        const proj = new Projectile(origin, direction, speed, damage, this.levelManager, {
            sourceName,
            sourceId: this.id,
            maxDistance: 200,
            ...options
        });
        this.entityManager.add(proj);
        return proj;
    }

    // Energy wave: a full ring of orbs at waist height, one more wave per 10 boss levels (up to 3)
    _novaBeats() {
        const at = this.tell;
        const waves = Math.min(3, this.tier);
        const gap = 1.1;
        const beats = [
            [0, () => this._announce('nova')],
            [Math.max(0, at - 0.62), () => soundManager.play('bossCharge')] // 0.62 s: the charge swells up to the release
        ];
        this._countdown(beats, at);
        for (let w = 0; w < waves; w++) {
            if (w > 0) beats.push([at + w * gap - 0.3, () => soundManager.play('bossTick', null, 1.44)]);
            beats.push([at + w * gap, () => this._fireNova()]);
        }
        beats.push([at + (waves - 1) * gap + this.rest, null]);
        return beats;
    }

    _fireNova() {
        soundManager.play('bossLaser');
        const count = 96; // Gaps narrower than the player: jumping is the answer
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            _dir.set(Math.sin(angle), 0, Math.cos(angle));
            _spawnPos.set(this.position.x, SHOT_Y, this.position.z);
            this._fire(_spawnPos, _dir, 22 * this.speedMult, BossSentinel.getNovaDamage(this.level), "Boss : vague d'énergie", { color: PALETTE.hexBright, radius: 0.5, geometry: Projectile.orbGeometry });
        }
    }

    // Spinning spiral of shots; the spin turns back every 2 s, announced by a tick
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
        for (let t = 2; t < duration; t += 2) {
            beats.push([at + t - 0.3, () => soundManager.play('bossTick', null, 1.2)], [at + t, () => { this.spinDir *= -1; }]);
        }
        return beats;
    }

    _spiralRing() {
        const arms = Math.min(16, 6 + 2 * this.tier); // 8 arms on the first boss
        for (let i = 0; i < arms; i++) {
            const angle = this.spiralAngle + (i / arms) * Math.PI * 2;
            _dir.set(Math.sin(angle), 0, Math.cos(angle));
            _spawnPos.set(this.position.x, SHOT_Y, this.position.z);
            this._fire(_spawnPos, _dir, 13 * this.speedMult, BossSentinel.getSpiralDamage(this.level), 'Boss : tourbillon', { radius: 0.6 }).mesh.scale.setScalar(0.8);
        }
        this.spiralAngle += 0.19 * this.spinDir; // ≈ 1.2 rad/s: the arms curve visibly
    }

    // Meteor rain: each meteor's landing circle fills up until it hits; one in three falls on the player
    _meteorBeats() {
        const at = this.tell;
        const count = Math.min(50, 20 + 10 * this.tier);
        const interval = 0.2;
        const beats = [[0, () => {
            this._announce('meteors');
            soundManager.play('bossRoar');
        }]];
        for (let i = 0; i < count; i++) beats.push([at + i * interval, () => this._launchMeteor(i % 3 === 0)]);
        beats.push([at + count * interval + 2.2 + this.rest, null]);
        return beats;
    }

    _launchMeteor(aimed) {
        const gravity = 20;
        const flightTime = 2.2 / this.speedMult;
        const radius = 3.0;
        const range = 40;
        const target = aimed
            ? new THREE.Vector3(this.player.position.x, 0, this.player.position.z)
            : new THREE.Vector3(this.position.x + (Math.random() - 0.5) * 2 * range, 0, this.position.z + (Math.random() - 0.5) * 2 * range);
        // The circle shows the real reach: hit radius + the player's 0.5 m
        this.entityManager.createTelegraph(target, flightTime, radius + 0.5);

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
                this.player.hudManager?.showMessage('Le boss est à terre : frappez-le au bâton ! Dégâts ×2');
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
