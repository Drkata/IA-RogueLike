import * as THREE from 'three';
import { BLADE_MID_Z, buildSlash, buildSword } from './SwordMesh.js';
import { HandMotion, MOTION } from './HandMotion.js';

// The sword: left click strikes every enemy in an arc before the player, right click holds a guard.
// Its upgrades (damage, attack speed, reach) and pacts live here; Player resolves the hits.
const REST = { x: 0.3, y: -0.29, z: -0.5, tilt: 0.6, turn: 0.2, roll: -0.4 }; // Pose in camera space
const GUARD = { x: 0.2, y: -0.24, z: -0.42, tilt: 0.12, turn: 1.25, roll: 1.4 }; // Blade across the view, flat to the front
const ARC = Math.PI / 2; // Swept by a strike: 45° each side of the view
const SWING_TIME = 0.32; // s: wind-up, strike, recovery (shorter when the strikes come faster)
export const PARRY_WINDOW = 0.3; // s at the start of a guard: a shot from the front is sent back
// s: a new guard opens that window only this long after the last one opened (tapping can't keep it open)
export const PARRY_REARM = 0.6;
const GUARD_FRONT = Math.cos(THREE.MathUtils.degToRad(60)); // Shots within 60° of the view meet the blade
export const GUARD_DAMAGE = 0.3; // Share of a blocked shot's damage that still gets through
export const GUARD_SLOW = 0.5; // Walking speed while guarding
export const RIPOSTE = 3; // Riposte pact: damage of the strike after a parry
const { damp, smoothstep, lerp } = THREE.MathUtils;

const newSwordStats = () => ({ meleeDamage: 0, attackSpeed: 0, reach: 0 });

export class Sword {
    constructor(camera) {
        this.camera = camera;
        this.MAX_LEVEL = 10;
        this.stats = newSwordStats();

        const existing = camera.children.find(c => c.name === 'SwordMesh'); // HMR
        if (existing) camera.remove(existing);
        this.mesh = new THREE.Group();
        this.mesh.name = 'SwordMesh';
        camera.add(this.mesh);
        this.pose = new THREE.Group();
        this.mesh.add(this.pose);
        const { group, glow, rune } = buildSword();
        this.model = group;
        this.glow = glow;
        this.rune = rune;
        this.pose.add(group);
        this.slash = buildSlash();
        this.slash.position.set(0, -0.55, -0.9);
        this.mesh.add(this.slash);
        this.hand = new HandMotion(camera);

        this.resetPacts();
        this.recalculateStats();
        this.resetState();
        this.holster = 1; // The staff is in hand at the start
    }

    resetState() {
        this.clock = 0;
        this.cooldown = 0;
        this.swingTime = -1; // s into the current swing, -1: none
        this.side = 1; // Swing direction: 1 right to left, -1 back
        this.guarding = false;
        this.guardTime = 0;
        this.parryOpen = false;
        this.lastParryOpen = -Infinity;
        this.riposteReady = false;
        this.anim = { guard: 0, flare: 0, jolt: 0 };
    }

    // Permanent modifiers granted by the sword pacts (PACTS in Game.js)
    resetPacts() {
        this.pactDamageMultiplier = 1.0;
        this.pactSpeedMultiplier = 1.0; // Of the strikes per second
        this.pactReachMultiplier = 1.0;
        this.pactCritChance = 0; // Added to the shared crit upgrades
        this.pactCritDamage = 0;
        this.whirlwind = false; // Whirlwind: strikes all around
        this.riposte = false; // Riposte: a parry makes the next strike deal RIPOSTE times the damage
        this.mirror = 1; // Mirror: damage multiplier of parried shots
        this.manaOnHit = 0; // Greedy blade: mana into the staff's clip per enemy struck
        this.lifeSteal = 0; // Leech: on top of the player's life steal
        this.waves = 0; // Wave blade: blade waves launched by each strike
    }

    reset() {
        this.stats = newSwordStats();
        this.resetPacts();
        this.recalculateStats();
        this.resetState();
    }

    getMaxLevel() {
        return this.MAX_LEVEL;
    }

    getTotalLevel() {
        return Object.values(this.stats).reduce((a, b) => a + b, 0);
    }

    upgrade(stat) {
        if (!(this.stats[stat] < this.getMaxLevel(stat))) return false;
        this.stats[stat]++;
        this.recalculateStats();
        return true;
    }

    // Value of a stat at an upgrade level, before pacts (single source of truth for stats and the upgrade UI)
    getStatValue(stat, level) {
        switch (stat) {
            case 'meleeDamage': return 10 + level * 15; // Per enemy struck
            case 'attackSpeed': return 1.25 * (1 + level * 0.1); // Strikes per second
            case 'reach': return 3 * (1 + level * 0.1); // Metres
            default: return 0;
        }
    }

    recalculateStats() {
        const value = (stat) => this.getStatValue(stat, this.stats[stat]);
        this.damage = value('meleeDamage') * this.pactDamageMultiplier;
        this.strikeRate = value('attackSpeed') * this.pactSpeedMultiplier;
        this.reach = value('reach') * this.pactReachMultiplier;
        const arc = this.whirlwind ? Math.PI * 2 : ARC;
        if (arc !== this.arc) {
            this.arc = arc;
            // The crescent shows the sweep, at most 160° of it: a full ring would just frame the view
            const shown = Math.min(arc, THREE.MathUtils.degToRad(160));
            this.slash.geometry.dispose();
            this.slash.geometry = new THREE.RingGeometry(0.66, 0.78, 32, 1, Math.PI / 2 - shown / 2, shown);
        }
    }

    // Left click: starts a strike if the blade is ready. Player then resolves its hits at once.
    swing() {
        if (this.cooldown > 0 || this.guarding || this.holster > 0) return false;
        this.cooldown = 1 / this.strikeRate;
        this.swingTime = 0;
        this.side = -this.side;
        return true;
    }

    // Whether `enemy` is within the strike's reach and arc, from `origin` facing `forward` (horizontal, unit)
    inArc(origin, forward, enemy) {
        const dx = enemy.position.x - origin.x;
        const dz = enemy.position.z - origin.z;
        const dist = Math.hypot(dx, dz);
        if (dist > this.reach + (enemy.radius || 0) || Math.abs(enemy.position.y - origin.y) > this.reach) return false;
        if (this.arc >= Math.PI * 2 || dist < 0.01) return true;
        return (dx * forward.x + dz * forward.z) / dist >= Math.cos(this.arc / 2);
    }

    // Crits: the shared crit upgrades (held by the staff, without the staff's pacts) plus the sword's pacts
    critChance(staff) {
        return staff.getStatValue('critChance', staff.stats.critChance) / 100 + this.pactCritChance;
    }

    critDamage(staff) {
        return staff.getStatValue('critDamage', staff.stats.critDamage) / 100 + this.pactCritDamage;
    }

    // The strike after a parry, under the Riposte pact, hits harder (once)
    takeRiposte() {
        if (!this.riposteReady) return 1;
        this.riposteReady = false;
        return RIPOSTE;
    }

    // Right click held. A guard raised at least PARRY_REARM after the last one opens a parry window.
    setGuard(on) {
        if (on && !this.guarding && this.holster === 0) {
            this.guarding = true;
            this.guardTime = 0;
            this.parryOpen = this.clock - this.lastParryOpen >= PARRY_REARM;
            if (this.parryOpen) this.lastParryOpen = this.clock;
        } else if (!on) {
            this.guarding = false;
        }
    }

    /**
     * A shot flying along `direction` reaches the player looking along `forward` (horizontal, unit):
     * 'parry' when the guard's first PARRY_WINDOW seconds meet it from the front (it goes back),
     * 'block' for a guard meeting it from the front later on (GUARD_DAMAGE gets through), else null.
     */
    meetShot(direction, forward) {
        if (!this.guarding) return null;
        const flat = Math.hypot(direction.x, direction.z) || 1;
        if (-(direction.x * forward.x + direction.z * forward.z) / flat < GUARD_FRONT) return null;
        if (this.parryOpen && this.guardTime < PARRY_WINDOW) {
            this.anim.flare = 1;
            this.anim.jolt = 1;
            if (this.riposte) this.riposteReady = true;
            return 'parry';
        }
        this.anim.jolt = 0.6;
        return 'block';
    }

    // `speed`: the player's walking speed, for the walk bob
    update(dt, speed = 0) {
        this.clock += dt;
        this.cooldown = Math.max(0, this.cooldown - dt);
        if (this.guarding) this.guardTime += dt;
        this.animate(dt, speed);
    }

    animate(dt, speed) {
        const a = this.anim;
        const h = this.hand;
        const p = this.pose;
        h.update(dt, speed);
        a.guard = damp(a.guard, this.guarding ? 1 : 0, 20, dt);
        a.flare = Math.max(0, a.flare - dt * 4);
        a.jolt = Math.max(0, a.jolt - dt * 6);

        // A swing: wound up on one side (e: into the swing pose), the blade sweeps flat across (u: +1 to -1)
        let e = 0;
        let u = 1;
        if (this.swingTime >= 0) {
            const time = Math.min(SWING_TIME, 0.8 / this.strikeRate);
            this.swingTime += dt;
            const k = this.swingTime / time;
            if (k >= 1) this.swingTime = -1;
            else {
                e = smoothstep(k, 0, 0.15) * (1 - smoothstep(k, 0.5, 1));
                u = 1 - 2 * smoothstep(k, 0.15, 0.45);
            }
        }
        const s = this.side;
        const g = a.guard;
        const pose = (key) => lerp(REST[key], GUARD[key], g);
        const shake = a.jolt * 0.01 * MOTION;
        const away = this.holster;
        p.position.set(
            pose('x') + h.x + 0.22 * u * s * e + shake * Math.sin(this.clock * 61),
            pose('y') + h.y + 0.1 * e - 0.5 * away,
            pose('z') - 0.08 * e + 0.05 * a.jolt
        );
        p.rotation.set(
            lerp(pose('tilt'), 0.3, e) - 0.8 * away,
            lerp(pose('turn'), -1.0 * u * s, e) - h.swayX * 1.5,
            lerp(pose('roll'), 0, e) - h.swayX * 2
        );
        this.model.visible = away < 0.99;

        // The crescent of the sweep, turning with it
        const strike = e * (1 - Math.abs(u));
        this.slash.visible = strike > 0.02;
        this.slash.material.opacity = 0.35 * strike;
        this.slash.rotation.z = -0.4 * u * s;
        this.slash.scale.x = s;

        // The rune: brighter mid-strike, flaring on a parry, throbbing while a riposte is ready
        const pulse = 0.5 + 0.5 * Math.sin(this.clock * (this.riposteReady ? 9 : 2.2));
        this.rune.emissiveIntensity = 0.9 + 0.3 * pulse + 1.5 * strike + 3 * a.flare + (this.riposteReady ? 1.2 * pulse : 0);
        this.glow.material.opacity = a.flare + (this.riposteReady ? 0.3 * pulse : 0);
        this.glow.scale.setScalar(0.3 + 0.5 * a.flare);
        this.glow.position.z = BLADE_MID_Z;
    }
}
