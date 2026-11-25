import { CONSTANTS } from '../../core/Constants.js';
import { SVG_ICONS } from '../SVGIcons.js';
import { num, pct, unit } from '../format.js';

// Pact modifier badge: higher is always better, so > 1 (or > 0) reads as a boon
const multBadge = (m) => (m === 1 ? '' : `<small class="stat__mod stat__mod--${m > 1 ? 'good' : 'bad'}">×${num(m)}</small>`);
const flatBadge = (v, fmt) => (v === 0 ? '' : `<small class="stat__mod stat__mod--${v > 0 ? 'good' : 'bad'}">${v > 0 ? '+' : '−'}${fmt(Math.abs(v))}</small>`);
const rankBadge = (level) => (level > 0 ? `<small class="stat__rank">+${level}</small>` : '');

const row = (category, icon, label, value) =>
    `<div class="stat stat--${category}"><dt>${icon}<span>${label}</span></dt><dd>${value}</dd></div>`;

export class StatsDisplay {
    constructor(container) {
        this.element = document.createElement('div');
        this.element.id = 'stats-display';
        this.element.className = 'ledger ledger--hud';
        container.appendChild(this.element);
    }

    // Player + weapon stats as definition lists, used by the HUD and the upgrade menu
    static render(player) {
        const w = player.weapon;
        const s = w.stats;
        const p = player.stats;

        const body = [
            row('vitality', SVG_ICONS.maxHealth, 'Vie max', Math.round(player.maxHealth) + rankBadge(p.maxHealth) + multBadge(player.pactHpMultiplier)),
            row('vitality', SVG_ICONS.armor, 'Armure', pct(player.armor * 100) + rankBadge(p.armor) + flatBadge(player.pactArmorBonus * 100, pct)),
            row('vitality', SVG_ICONS.regen, 'Régénération', unit(player.regen + player.healthRegen, 'PV/s') + rankBadge(p.regen) + flatBadge(player.healthRegen, num)),
            row('vitality', SVG_ICONS.vampirism, 'Vol de vie', pct(player.vampirism * 100) + rankBadge(p.vampirism) + flatBadge(player.pactVampirism * 100, pct)),
            row('vitality', SVG_ICONS.speed, 'Vitesse', pct((player.speed / CONSTANTS.PLAYER_SPEED) * 100) + rankBadge(p.speed) + multBadge(player.pactSpeedMultiplier))
        ];
        const weapon = [
            row('offense', SVG_ICONS.damage, 'Dégâts', num(w.damage * w.bulletCount) + rankBadge(s.damage) + multBadge(w.pactDamageMultiplier)),
            row('offense', SVG_ICONS.fireRate, 'Cadence', unit(1 / w.fireRate, 'tirs/s') + rankBadge(s.fireRate) + multBadge(w.pactFireRateMultiplier)),
            row('offense', SVG_ICONS.ammo, 'Mana max', w.maxAmmo + rankBadge(s.ammo)),
            row('offense', SVG_ICONS.reload, 'Rechargement', unit(w.reloadTime, 's') + rankBadge(s.reload))
        ];
        const precision = [
            row('offense', SVG_ICONS.critChance, 'Critique', pct(w.critChance * 100) + rankBadge(s.critChance)),
            row('offense', SVG_ICONS.critDamage, 'Dégâts crit.', pct(w.critDamage * 100) + rankBadge(s.critDamage)),
            row('offense', SVG_ICONS.range, 'Portée', num(w.range) + rankBadge(s.range)),
            row('offense', SVG_ICONS.projectileSpeed, 'Vit. projectiles', num(w.projectileSpeed) + rankBadge(s.projectileSpeed) + multBadge(w.pactProjectileSpeedMultiplier))
        ];
        const arcana = [
            row('arcana', SVG_ICONS.bulletCount, 'Projectiles', w.bulletCount + rankBadge(s.bulletCount)),
            row('arcana', SVG_ICONS.piercing, 'Perforation', w.piercing + rankBadge(s.piercing)),
            row('arcana', SVG_ICONS.knockback, 'Recul', num(w.knockback) + rankBadge(s.knockback)),
            row('arcana', SVG_ICONS.explosion, 'Explosion', pct(w.explosion * 100) + rankBadge(s.explosion)),
            row('arcana', SVG_ICONS.ricochet, 'Ricochets', w.ricochet + rankBadge(s.ricochet)),
            row('arcana', SVG_ICONS.magnet, 'Aimant', unit(player.magnetRange, 'm') + rankBadge(p.magnet))
        ];

        return [body, weapon, precision, arcana].map(rows => `<dl class="ledger__col">${rows.join('')}</dl>`).join('');
    }

    update(player) {
        if (!player || !player.weapon) return;
        const html = StatsDisplay.render(player);
        // Called every frame: re-parsing this panel is expensive, so only do it when it changed
        if (html !== this._lastHtml) {
            this._lastHtml = html;
            this.element.innerHTML = html;
        }
    }
}
