import { SVG_ICONS } from '../SVGIcons.js';

export class GameInfo {
    constructor(container) {
        this.element = document.createElement('div');
        this.element.id = 'top-left-panel';
        this.element.className = 'compass';
        this.element.innerHTML = `
            <div id="minimap-container" class="scrying"></div>
            <ul class="chronicle">
                <li><span class="chronicle__icon">${SVG_ICONS.dungeon_gate}</span><span class="chronicle__label">Niveau</span><span class="chronicle__value" data-field="level">1</span></li>
                <li><span class="chronicle__icon">${SVG_ICONS.hostile}</span><span class="chronicle__label">Ennemis</span><span class="chronicle__value" data-field="enemies">0</span></li>
                <li><span class="chronicle__icon">${SVG_ICONS.coin}</span><span class="chronicle__label">Or</span><span class="chronicle__value chronicle__value--gold" data-field="gold">0</span></li>
            </ul>
        `;
        container.appendChild(this.element);

        this.minimapContainer = this.element.querySelector('#minimap-container');
        this.levelEl = this.element.querySelector('[data-field="level"]');
        this.enemiesEl = this.element.querySelector('[data-field="enemies"]');
        this.goldEl = this.element.querySelector('[data-field="gold"]');
    }

    // Called every frame: only write to the DOM when the value changed
    _set(el, value) {
        if (el._value === value) return;
        el._value = value;
        el.textContent = value;
    }

    updateLevel(level) {
        this._set(this.levelEl, level);
    }

    updateEnemies(count) {
        this._set(this.enemiesEl, count);
    }

    updateGold(gold) {
        this._set(this.goldEl, gold);
    }

    getMinimapContainer() {
        return this.minimapContainer;
    }
}
