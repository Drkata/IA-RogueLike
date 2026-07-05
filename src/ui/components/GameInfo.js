import { SVG_ICONS } from '../SVGIcons.js';

export class GameInfo {
    constructor(container) {
        this.element = document.createElement('div');
        this.element.id = 'top-left-panel';

        // Minimap container will be moved here by HUDManager or Game
        this.minimapContainer = document.createElement('div');
        this.minimapContainer.id = 'minimap-container';
        this.element.appendChild(this.minimapContainer);

        this.infoContainer = document.createElement('div');
        this.infoContainer.innerHTML = `
            <div class="info-row">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span class="icon-wrapper" style="width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center;">${SVG_ICONS.dungeon_gate}</span>
                    <span>LEVEL</span>
                </div>
                <span id="level-display" style="color: #00ff00">1</span>
            </div>
            <div class="info-row">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span class="icon-wrapper" style="width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center;">${SVG_ICONS.hostile}</span>
                    <span>HOSTILES</span>
                </div>
                <span id="enemies-display" style="color: #ff3333">0</span>
            </div>
            <div class="info-row">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span class="icon-wrapper" style="width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center;">${SVG_ICONS.coin}</span>
                    <span>GOLD</span>
                </div>
                <span id="gold-display" style="color: #ffd700">0</span>
            </div>
        `;
        this.element.appendChild(this.infoContainer);

        container.appendChild(this.element);

        this.levelEl = this.element.querySelector('#level-display');
        this.enemiesEl = this.element.querySelector('#enemies-display');
        this.goldEl = this.element.querySelector('#gold-display');
    }

    updateLevel(level) {
        this.levelEl.textContent = level;
    }

    updateEnemies(count) {
        this.enemiesEl.textContent = count;
    }

    updateGold(gold) {
        this.goldEl.textContent = gold;
    }

    getMinimapContainer() {
        return this.minimapContainer;
    }
}
