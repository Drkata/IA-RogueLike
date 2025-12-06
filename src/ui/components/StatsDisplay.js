import { CONSTANTS } from '../../core/Constants.js';

export class StatsDisplay {
    constructor(container) {
        this.element = document.createElement('div');
        this.element.id = 'stats-display';
        this.element.style.position = 'absolute';
        this.element.style.top = '10px';
        this.element.style.right = '10px';
        this.element.style.padding = '10px';
        this.element.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        this.element.style.border = '1px solid #444';
        this.element.style.borderRadius = '5px';
        this.element.style.fontFamily = 'monospace';
        this.element.style.fontSize = '11px'; // Slightly smaller
        this.element.style.color = 'white';
        this.element.style.pointerEvents = 'none';
        this.element.style.display = 'block';
        this.element.style.textAlign = 'left';
        this.element.style.minWidth = '150px';

        // Append to body directly to avoid HUD container relative positioning issues if any,
        // OR just ensure it breaks out of flow if container is top-left.
        // Actually, HUDManager passes 'container' which is #hud-container (top-left).
        // If we want top-right, we should probably append to document.body OR use fixed positioning.
        // Fixed positioning is safest relative to viewport.
        this.element.style.position = 'fixed';

        document.body.appendChild(this.element); // Attach to body instead of container
    }

    update(player) {
        if (!player || !player.weapon) return;

        const w = player.weapon;
        const s = w.stats; // Access upgrade levels

        // Helper to format: Total (+Level)
        const fmt = (val, level, suffix = '') => {
            const valStr = Number.isInteger(val) ? val : val.toFixed(1);
            if (level > 0) {
                return `${valStr}${suffix} <span style="color: #00ff00; font-size: 0.9em;">(+${level})</span>`;
            }
            return `${valStr}${suffix}`;
        };

        // Calculations
        const currentDamage = w.bulletCount > 1 ? w.damage * w.bulletCount : w.damage;
        const currentFireRate = 1 / w.fireRate;
        const currentCritChance = w.critChance * 100;
        const currentCritDamage = w.critDamage * 100;
        const currentArc = w.arc;

        this.element.innerHTML = `
            <div style="margin-bottom: 5px; color: #00ff00; font-weight: bold; border-bottom: 1px solid #444; text-align: center;">STATS</div>
            <div style="display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center;">
                <div style="color: #88ff88;">Max Health:</div><div style="text-align: right;">${Math.round(player.maxHealth)}</div>
                <div style="color: #88ff88;">Armor:</div><div style="text-align: right;">${Math.round(player.armor * 100)}%</div>
                <div style="color: #88ff88;">Regeneration:</div><div style="text-align: right;">${player.regen.toFixed(1)}/s</div>
                <div style="color: #88ff88;">Life Steal:</div><div style="text-align: right;">${Math.round(player.vampirism * 100)}%</div>
                <div style="color: #88ff88;">Speed:</div><div style="text-align: right;">${Math.round((player.speed / CONSTANTS.PLAYER_SPEED) * 100)}%</div>
                
                <div style="height: 4px;"></div><div style="height: 4px;"></div>

                <div style="color: #ff8888;">Damage:</div><div style="text-align: right;">${fmt(currentDamage, s.damage)}</div>
                <div style="color: #ff8888;">Fire Rate:</div><div style="text-align: right;">${fmt(currentFireRate, s.fireRate, '/s')}</div>
                <div style="color: #ff8888;">Crit Chance:</div><div style="text-align: right;">${fmt(currentCritChance, s.critChance, '%')}</div>
                <div style="color: #ff8888;">Crit Damage:</div><div style="text-align: right;">${fmt(currentCritDamage, s.critDamage, '%')}</div>
                <div style="color: #ff8888;">Max Ammo:</div><div style="text-align: right;">${fmt(w.maxAmmo, s.ammo)}</div>
                <div style="color: #ff8888;">Reload Speed:</div><div style="text-align: right;">${fmt(w.reloadTime, s.reload, 's')}</div>
                <div style="color: #ff8888;">Range:</div><div style="text-align: right;">${fmt(w.range, s.range)}</div>
                <div style="color: #ff8888;">Projectile Speed:</div><div style="text-align: right;">${fmt(w.projectileSpeed, s.projectileSpeed)}</div>

                <div style="height: 4px;"></div><div style="height: 4px;"></div>
                
                <div style="color: #aaaaff;">Multishot:</div><div style="text-align: right;">${fmt(w.bulletCount, s.bulletCount)}</div>
                <div style="color: #aaaaff;">Piercing:</div><div style="text-align: right;">${fmt(w.piercing, s.piercing)}</div>
                <div style="color: #aaaaff;">Knockback:</div><div style="text-align: right;">${fmt(w.knockback, s.knockback)}</div>
                <div style="color: #aaaaff;">Explosion:</div><div style="text-align: right;">${fmt(w.explosion * 100, s.explosion, '%')}</div>
                <div style="color: #aaaaff;">Ricochet:</div><div style="text-align: right;">${fmt(w.ricochet, s.ricochet)}</div>
            </div>
        `;
    }
}
