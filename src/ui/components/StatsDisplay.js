import { CONSTANTS } from '../../core/Constants.js';
import { SVG_ICONS } from '../SVGIcons.js';

export class StatsDisplay {
    constructor(container) {
        this.element = document.createElement('div');
        this.element.id = 'stats-display';
        this.element.className = 'medieval-panel';
        container.appendChild(this.element);
    }

    update(player) {
        if (!player || !player.weapon) return;

        const w = player.weapon;
        const s = w.stats; // Access upgrade levels

        // Helper to format: Total (+Level) [Pact]
        const fmt = (val, level, pactMult = 1.0, suffix = '') => {
            const valStr = Number.isInteger(val) ? val : val.toFixed(1);
            let str = valStr + suffix;
            if (level > 0) {
                str += ` <span style="color: #00ff00; font-size: 0.9em;">(+${level})</span>`;
            }
            if (pactMult !== 1.0) {
                const color = pactMult > 1.0 ? '#ff8888' : '#8888ff';
                str += ` <span style="color: ${color}; font-size: 0.8em;">(x${pactMult.toFixed(2)})</span>`;
            }
            return str;
        };

        // Helper for simple flat pacts
        const fmtFlat = (val, pactFlat = 0, suffix = '') => {
            const valStr = Number.isInteger(val) ? val : val.toFixed(1);
            let str = valStr + suffix;
            if (pactFlat !== 0) {
                const color = pactFlat > 0 ? '#ff8888' : '#8888ff';
                const sign = pactFlat > 0 ? '+' : '';
                str += ` <span style="color: ${color}; font-size: 0.8em;">(${sign}${pactFlat.toFixed(1)})</span>`;
            }
            return str;
        };

        // Safe fallbacks for pact variables
        const pactHpMultiplier = player.pactHpMultiplier !== undefined ? player.pactHpMultiplier : 1.0;
        const pactSpeedMultiplier = player.pactSpeedMultiplier !== undefined ? player.pactSpeedMultiplier : 1.0;
        const pactArmorBonus = player.pactArmorBonus !== undefined ? player.pactArmorBonus : 0.0;
        const healthRegen = player.healthRegen !== undefined ? player.healthRegen : 0.0;
        const pactVampirism = player.pactVampirism !== undefined ? player.pactVampirism : 0.0;

        const pactDamageMultiplier = w.pactDamageMultiplier !== undefined ? w.pactDamageMultiplier : 1.0;
        const pactFireRateMultiplier = w.pactFireRateMultiplier !== undefined ? w.pactFireRateMultiplier : 1.0;
        const pactProjectileSpeedMultiplier = w.pactProjectileSpeedMultiplier !== undefined ? w.pactProjectileSpeedMultiplier : 1.0;

        // Calculations
        const currentDamage = w.bulletCount > 1 ? w.damage * w.bulletCount : w.damage;
        const currentFireRate = 1 / w.fireRate;
        const currentCritChance = w.critChance * 100;
        const currentCritDamage = w.critDamage * 100;

        const totalRegen = player.regen + healthRegen;

        const makeRow = (icon, color, label, valueHtml) => `
            <div style="display: flex; align-items: center; gap: 4px; color: ${color};">
                <span class="icon-wrapper" style="width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center;">${icon}</span>
                <span>${label}</span>
            </div>
            <div style="text-align: right; color: #fff;">${valueHtml}</div>
        `;

        this.element.innerHTML = `
            <div class="panel-header">STATISTIQUES</div>
            <div style="display: flex; gap: 15px; align-items: flex-start;">
                <!-- Column 1: Defense & Mobility -->
                <div style="display: grid; grid-template-columns: auto auto; gap: 4px 8px; align-items: center; min-width: 145px;">
                    ${makeRow(SVG_ICONS.maxHealth, '#88ff88', 'Vie Max:', `${Math.round(player.maxHealth)} <span style="color: ${pactHpMultiplier !== 1.0 ? '#ff8888' : 'transparent'}; font-size: 0.8em;">${pactHpMultiplier !== 1.0 ? '(x' + pactHpMultiplier.toFixed(2) + ')' : ''}</span>`)}
                    ${makeRow(SVG_ICONS.armor, '#88ff88', 'Armure:', `${Math.round(player.armor * 100)}% <span style="color: ${pactArmorBonus !== 0.0 ? '#ff8888' : 'transparent'}; font-size: 0.8em;">${pactArmorBonus !== 0.0 ? '(' + (pactArmorBonus > 0 ? '+' : '') + (pactArmorBonus * 100).toFixed(0) + '%)' : ''}</span>`)}
                    ${makeRow(SVG_ICONS.regen, '#88ff88', 'Régén.:', fmtFlat(totalRegen, healthRegen, '/s'))}
                    ${makeRow(SVG_ICONS.vampirism, '#88ff88', 'Vol de Vie:', fmtFlat(player.vampirism * 100, pactVampirism * 100, '%'))}
                    ${makeRow(SVG_ICONS.speed, '#88ff88', 'Vitesse:', `${Math.round((player.speed / CONSTANTS.PLAYER_SPEED) * 100)}% <span style="color: ${pactSpeedMultiplier !== 1.0 ? '#ff8888' : 'transparent'}; font-size: 0.8em;">${pactSpeedMultiplier !== 1.0 ? '(x' + pactSpeedMultiplier.toFixed(2) + ')' : ''}</span>`)}
                </div>

                <!-- Vertical Separator -->
                <div style="width: 1px; align-self: stretch; background: rgba(212, 175, 55, 0.2);"></div>

                <!-- Column 2: Weapon Core -->
                <div style="display: grid; grid-template-columns: auto auto; gap: 4px 8px; align-items: center; min-width: 145px;">
                    ${makeRow(SVG_ICONS.damage, '#ff8888', 'Dégâts:', fmt(currentDamage, s.damage, pactDamageMultiplier))}
                    ${makeRow(SVG_ICONS.fireRate, '#ff8888', 'Cadence:', fmt(currentFireRate, s.fireRate, pactFireRateMultiplier, '/s'))}
                    ${makeRow(SVG_ICONS.ammo, '#ff8888', 'Max Mana:', fmt(w.maxAmmo, s.ammo))}
                    ${makeRow(SVG_ICONS.reload, '#ff8888', 'Recharge:', fmt(w.reloadTime, s.reload, 1.0, 's'))}
                </div>

                <!-- Vertical Separator -->
                <div style="width: 1px; align-self: stretch; background: rgba(212, 175, 55, 0.2);"></div>

                <!-- Column 3: Criticals & Projectiles -->
                <div style="display: grid; grid-template-columns: auto auto; gap: 4px 8px; align-items: center; min-width: 145px;">
                    ${makeRow(SVG_ICONS.critChance, '#ff8888', 'Crit %:', fmt(currentCritChance, s.critChance, 1.0, '%'))}
                    ${makeRow(SVG_ICONS.critDamage, '#ff8888', 'Crit Dég.:', fmt(currentCritDamage, s.critDamage, 1.0, '%'))}
                    ${makeRow(SVG_ICONS.range, '#ff8888', 'Portée:', fmt(w.range, s.range))}
                    ${makeRow(SVG_ICONS.projectileSpeed, '#ff8888', 'Vit. Proj.:', fmt(w.projectileSpeed, s.projectileSpeed, pactProjectileSpeedMultiplier))}
                </div>

                <!-- Vertical Separator -->
                <div style="width: 1px; align-self: stretch; background: rgba(212, 175, 55, 0.2);"></div>

                <!-- Column 4: Specials & Utilities -->
                <div style="display: grid; grid-template-columns: auto auto; gap: 4px 8px; align-items: center; min-width: 145px;">
                    ${makeRow(SVG_ICONS.arc, '#aaaaff', 'Proj. Nbr:', fmt(w.bulletCount, s.bulletCount))}
                    ${makeRow(SVG_ICONS.piercing, '#aaaaff', 'Perforation:', fmt(w.piercing, s.piercing))}
                    ${makeRow(SVG_ICONS.knockback, '#aaaaff', 'Recul Cible:', fmt(w.knockback, s.knockback))}
                    ${makeRow(SVG_ICONS.explosion, '#aaaaff', 'Explosion:', fmt(w.explosion * 100, s.explosion, 1.0, '%'))}
                    ${makeRow(SVG_ICONS.ricochet, '#aaaaff', 'Rebonds:', fmt(w.ricochet, s.ricochet))}
                </div>
            </div>
        `;
    }
}
