import { CONSTANTS } from '../../core/Constants.js';
import { SVG_ICONS } from '../SVGIcons.js';
import { num, pct, unit, armorText, explosionText } from '../format.js';
import { armorDamageFactor } from '../../entities/Player.js';

// Pact modifier badge: higher is always better, so > 1 (or > 0) reads as a boon
const multBadge = (m) => (m === 1 ? '' : `<small class="stat__mod stat__mod--${m > 1 ? 'good' : 'bad'}">×${num(m)}</small>`);
const flatBadge = (v, fmt) => (v === 0 ? '' : `<small class="stat__mod stat__mod--${v > 0 ? 'good' : 'bad'}">${v > 0 ? '+' : '−'}${fmt(Math.abs(v))}</small>`);
const rankBadge = (level) => (level > 0 ? `<small class="stat__rank">+${level}</small>` : '');

// A row, or nothing while `shown` is false: a stat still at a starting value that does nothing yet stays out of the way
const row = (category, icon, label, value, shown = true) =>
    shown ? `<div class="stat stat--${category}"><dt>${icon}<span>${label}</span></dt><dd>${value}</dd></div>` : '';
const crits = (chance, damage) => `${pct(chance * 100)} · ×${num(damage)}`;

// The player's sheet, shown while Tab is held (and in the pause and upgrade menus, through render)
export class StatsDisplay {
    constructor(container) {
        this.element = document.createElement('section');
        this.element.className = 'ledger ledger--sheet';
        this.element.setAttribute('aria-label', 'Votre arcaniste');
        this.element.hidden = true;
        this.element.innerHTML = '<h3 class="ledger__title">Votre arcaniste</h3><div class="ledger__cols"></div>';
        this.cols = this.element.querySelector('.ledger__cols');
        container.appendChild(this.element);
    }

    // What the player has, in four groups (survival, staff, sword, powers), as the HUD sheet and the menus show it
    static render(player) {
        const w = player.weapon;
        const s = w.stats;
        const p = player.stats;
        const sword = player.sword;
        const ss = sword.stats;
        const regen = player.regen + player.healthRegen;
        const speed = player.speed / CONSTANTS.PLAYER_SPEED;

        const groups = {
            Survie: [
                row('vitality', SVG_ICONS.maxHealth, 'Vie max', unit(Math.round(player.maxHealth), 'PV') + rankBadge(p.maxHealth) + multBadge(player.pactHpMultiplier)),
                row('vitality', SVG_ICONS.armor, 'Armure', armorText(player.armor, armorDamageFactor(player.armor)) + rankBadge(p.armor) + flatBadge(player.pactArmorBonus, num), player.armor !== 0),
                row('vitality', SVG_ICONS.regen, 'Régénération', unit(regen, 'PV/s') + rankBadge(p.regen) + flatBadge(player.healthRegen, num), regen !== 0),
                row('vitality', SVG_ICONS.vampirism, 'Vol de vie', pct(player.vampirism * 100) + rankBadge(p.vampirism) + flatBadge(player.pactVampirism * 100, pct), player.vampirism > 0),
                row('vitality', SVG_ICONS.speed, 'Vitesse', pct(speed * 100) + rankBadge(p.speed) + multBadge(player.pactSpeedMultiplier), speed !== 1)
            ],
            Sceptre: [
                row('offense', SVG_ICONS.damage, 'Dégâts', num(w.damage * w.bulletCount) + rankBadge(s.damage) + multBadge(w.pactDamageMultiplier)), // A whole volley, as the upgrade cards say: multishot splits it
                row('offense', SVG_ICONS.fireRate, 'Cadence', unit(1 / w.fireRate, 'tirs/s') + rankBadge(s.fireRate) + multBadge(w.pactFireRateMultiplier)),
                row('offense', SVG_ICONS.ammo, 'Orbe', unit(w.maxAmmo, 'charges') + rankBadge(s.ammo)),
                row('offense', SVG_ICONS.reload, 'Recharge', unit(w.reloadTime, 's') + rankBadge(s.reload)),
                row('offense', SVG_ICONS.critChance, 'Critiques', crits(w.critChance, w.critDamage) + rankBadge(s.critChance + s.critDamage)),
                row('offense', SVG_ICONS.range, 'Portée', unit(w.range, 'm') + rankBadge(s.range)),
                row('offense', SVG_ICONS.projectileSpeed, 'Vitesse des tirs', unit(w.projectileSpeed, 'm/s') + rankBadge(s.projectileSpeed) + multBadge(w.pactProjectileSpeedMultiplier))
            ],
            Épée: [
                row('offense', SVG_ICONS.meleeDamage, 'Dégâts', num(sword.damage) + rankBadge(ss.meleeDamage) + multBadge(sword.pactDamageMultiplier)),
                row('offense', SVG_ICONS.attackSpeed, 'Cadence', unit(sword.strikeRate, 'coups/s') + rankBadge(ss.attackSpeed) + multBadge(sword.pactSpeedMultiplier)),
                row('offense', SVG_ICONS.reach, 'Allonge', unit(sword.reach, 'm') + rankBadge(ss.reach) + multBadge(sword.pactReachMultiplier)),
                row('offense', SVG_ICONS.critChance, 'Critiques', crits(sword.critChance(w), sword.critDamage(w)) + rankBadge(s.critChance + s.critDamage))
            ],
            Pouvoirs: [
                row('arcana', SVG_ICONS.bulletCount, 'Projectiles', w.bulletCount + rankBadge(s.bulletCount), w.bulletCount > 1),
                row('arcana', SVG_ICONS.piercing, 'Perforation', w.piercing + rankBadge(s.piercing), w.piercing > 0),
                row('arcana', SVG_ICONS.knockback, 'Recul', num(w.knockback) + rankBadge(s.knockback), s.knockback > 0),
                row('arcana', SVG_ICONS.explosion, 'Explosion', explosionText(w.explosion * 100) + rankBadge(s.explosion), w.explosion > 0),
                row('arcana', SVG_ICONS.ricochet, 'Ricochets', w.ricochet + rankBadge(s.ricochet), w.ricochet > 0),
                row('arcana', SVG_ICONS.magnet, 'Aimant', unit(player.magnetRange, 'm') + rankBadge(p.magnet), p.magnet > 0)
            ]
        };

        return Object.entries(groups).map(([title, rows]) => {
            const body = rows.join('');
            return body && `<section class="ledger__col"><h4 class="ledger__group">${title}</h4><dl class="ledger__rows">${body}</dl></section>`;
        }).join('');
    }

    // `open`: Tab held. The sheet is rebuilt only while open, and only when it changed (re-parsing it is costly)
    update(player, open) {
        if (this.element.hidden === open) this.element.hidden = !open;
        if (!open || !player?.weapon) return;
        const html = StatsDisplay.render(player);
        if (html !== this._lastHtml) {
            this._lastHtml = html;
            this.cols.innerHTML = html;
        }
    }
}
