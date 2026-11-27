import * as THREE from 'three';
import { buildSlash, buildSword, swordTier } from './SwordMesh.js';
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
export const RIPOSTE = 3; // Riposte pact: damage of the strikes after a parry
const WHIRLWIND_REACH = 0.25; // Whirlwind pact: reach added by each take after the first
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
        this.rebuildModel();
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
        this.riposteStrikes = 0; // Riposte pact: strikes left that deal RIPOSTE times the damage
        this.swingLength = SWING_TIME;
        this.furyMultiplier = 1.0; // Berserk fury (Player): of the strikes per second
        this.furyLifeSteal = 0; // Berserk fury: life stolen by strikes, on top of the rest
        this.anim = { guard: 0, flare: 0, jolt: 0 };
    }

    // Permanent modifiers granted by the sword pacts (PACTS in Game.js)
    resetPacts() {
        this.pactDamageMultiplier = 1.0;
        this.pactSpeedMultiplier = 1.0; // Of the strikes per second
        this.pactReachMultiplier = 1.0;
        this.pactCritChance = 0; // Added to the shared crit upgrades
        this.pactCritDamage = 0;
        this.whirlwind = 0; // Whirlwind: times taken. Strikes all around, each take after the first adds reach
        this.riposte = 0; // Riposte: times taken = strikes after a parry that deal RIPOSTE times the damage
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
        this.rebuildModel();
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
        this.rebuildModel();
        return true;
    }

    // Swaps in the model of the sword's upgrades (SwordMesh.js): the tier of their total, the blade as long as
    // the reach level and as broad as the damage level make it
    rebuildModel() {
        const { meleeDamage, reach } = this.stats;
        const tier = swordTier(this.getTotalLevel());
        const key = `${tier}/${reach}/${meleeDamage}`;
        if (key === this.modelKey) return;
        this.modelKey = key;
        const shown = this.model ? this.model.visible : false; // Kept until animate runs: the upgrade menu pauses it
        if (this.model) {
            this.model.traverse(obj => {
                obj.geometry?.dispose();
                obj.material?.dispose();
            });
            this.pose.remove(this.model);
        }
        this.tier = tier;
        const { group, glow, rune, spinners } = buildSword(tier, reach, meleeDamage);
        group.visible = shown;
        Object.assign(this, { model: group, glow, rune, spinners });
        this.pose.add(group);
    }

    // Value of a stat at an upgrade level, before pacts (effectiveValue adds them)
    getStatValue(stat, level) {
        switch (stat) {
            case 'meleeDamage': return 7 + level * 7.65; // Per enemy struck (a level gave 9 before the 15 % cut)
            case 'attackSpeed': return 1.25 * (1 + level * 0.1); // Strikes per second
            case 'reach': return 3 * (1 + level * 0.1); // Metres
            default: return 0;
        }
    }

    // A stat at an upgrade level with the sword pacts applied: what the stats use and the upgrade cards show
    effectiveValue(stat, level) {
        const v = this.getStatValue(stat, level);
        switch (stat) {
            case 'meleeDamage': return v * this.pactDamageMultiplier;
            case 'attackSpeed': return v * this.pactSpeedMultiplier;
            case 'reach': return v * this.pactReachMultiplier * (1 + WHIRLWIND_REACH * Math.max(0, this.whirlwind - 1));
            default: return v;
        }
    }

    recalculateStats() {
        const value = (stat) => this.effectiveValue(stat, this.stats[stat]);
        this.damage = value('meleeDamage');
        this.strikeRate = value('attackSpeed');
        this.reach = value('reach');
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
        const rate = this.strikeRate * this.furyMultiplier;
        this.cooldown = 1 / rate;
        this.swingLength = Math.min(SWING_TIME, 0.8 / rate); // Faster strikes, a quicker swing
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

    // Crits: the shared crit upgrades (held by the staff, without the staff's pacts) plus the sword's pacts.
    // `level`: of the crit upgrade, for the upgrade cards.
    critChance(staff, level = staff.stats.critChance) {
        return staff.getStatValue('critChance', level) / 100 + this.pactCritChance;
    }

    critDamage(staff, level = staff.stats.critDamage) {
        return staff.getStatValue('critDamage', level) / 100 + this.pactCritDamage;
    }

    // The strikes after a parry, under the Riposte pact (one per take), hit harder
    takeRiposte() {
        if (this.riposteStrikes <= 0) return 1;
        this.riposteStrikes--;
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
            this.riposteStrikes = this.riposte;
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
            this.swingTime += dt;
            const k = this.swingTime / this.swingLength;
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
        const ready = this.riposteStrikes > 0;
        const pulse = 0.5 + 0.5 * Math.sin(this.clock * (ready ? 9 : 2.2));
        this.rune.emissiveIntensity = 0.9 + 0.3 * pulse + 1.5 * strike + 3 * a.flare + (ready ? 1.2 * pulse : 0);
        this.glow.material.opacity = a.flare + (ready ? 0.3 * pulse : 0);
        this.glow.scale.setScalar(0.3 + 0.5 * a.flare);
        for (const s of this.spinners) s.rotation.z += s.userData.spin * (1 + 2 * strike + 4 * a.flare) * dt; // Whirled by a strike or a parry
    }
}
