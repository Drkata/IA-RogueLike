import { HealthBar } from './components/HealthBar.js';
import { AmmoDisplay } from './components/AmmoDisplay.js';
import { GameInfo } from './components/GameInfo.js';
import { StatsDisplay } from './components/StatsDisplay.js';

export class HUDManager {
    constructor() {
        this.container = document.getElementById('hud-container');
        if (!this.container) {
            console.error('HUD container not found!');
            return;
        }

        // Clear existing content if any
        this.container.innerHTML = '';

        // Initialize components
        this.healthBar = new HealthBar(this.container);
        this.ammoDisplay = new AmmoDisplay(this.container);
        this.gameInfo = new GameInfo(this.container);
        this.statsDisplay = new StatsDisplay(this.container);

        // Crosshair is separate in CSS but we can manage it if needed
        this.createCrosshair();
    }

    createCrosshair() {
        const crosshair = document.createElement('div');
        crosshair.id = 'crosshair';
        this.container.appendChild(crosshair);
    }

    updateHealth(current, max) {
        this.healthBar.update(current, max);
    }

    onDamage() {
        this.healthBar.triggerDamageEffect();
    }

    updateAmmo(current, reserve) {
        this.ammoDisplay.update(current, reserve);
    }

    updateLevel(level) {
        this.gameInfo.updateLevel(level);
    }

    updateEnemies(count) {
        this.gameInfo.updateEnemies(count);
    }

    updateStats(player) {
        this.statsDisplay.update(player);
    }

    setReloadCallback(callback) {
        this.ammoDisplay.setReloadCallback(callback);
    }

    // Helper to attach minimap canvas
    attachMinimap(canvas) {
        const container = this.gameInfo.getMinimapContainer();
        container.innerHTML = ''; // Clear old minimap
        canvas.id = 'minimap-frame'; // Apply CSS style
        container.appendChild(canvas);
    }
}
