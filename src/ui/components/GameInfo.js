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
                <span>LEVEL</span>
                <span id="level-display" style="color: #00ff00">1</span>
            </div>
            <div class="info-row">
                <span>HOSTILES</span>
                <span id="enemies-display" style="color: #ff3333">0</span>
            </div>
        `;
        this.element.appendChild(this.infoContainer);

        container.appendChild(this.element);

        this.levelEl = this.element.querySelector('#level-display');
        this.enemiesEl = this.element.querySelector('#enemies-display');
    }

    updateLevel(level) {
        this.levelEl.textContent = level;
    }

    updateEnemies(count) {
        this.enemiesEl.textContent = count;
    }

    getMinimapContainer() {
        return this.minimapContainer;
    }
}
