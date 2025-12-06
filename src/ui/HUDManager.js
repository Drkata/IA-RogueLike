import { HealthBar } from './components/HealthBar.js';
import { AmmoDisplay } from './components/AmmoDisplay.js';
import { GameInfo } from './components/GameInfo.js';
import { StatsDisplay } from './components/StatsDisplay.js';
import { BuffDisplay } from './components/BuffDisplay.js';

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
        this.buffDisplay = new BuffDisplay(this.container);

        // Crosshair is separate in CSS but we can manage it if needed
        this.createCrosshair();
    }

    createCrosshair() {
        const crosshair = document.createElement('div');
        crosshair.id = 'crosshair';
        this.container.appendChild(crosshair);
    }

    updateHealth(current, max, shield = 0) {
        this.healthBar.update(current, max, shield);
    }

    showMessage(text, duration = 3000) {
        // Create or reuse message element
        let msgEl = document.getElementById('hud-message');
        if (!msgEl) {
            msgEl = document.createElement('div');
            msgEl.id = 'hud-message';
            msgEl.style.position = 'absolute';
            msgEl.style.top = '20%';
            msgEl.style.left = '50%';
            msgEl.style.transform = 'translate(-50%, -50%)';
            msgEl.style.color = '#FFD700';
            msgEl.style.fontSize = '24px';
            msgEl.style.fontWeight = 'bold';
            msgEl.style.textShadow = '0 0 10px black';
            msgEl.style.pointerEvents = 'none';
            msgEl.style.transition = 'opacity 0.5s';
            msgEl.style.zIndex = '100';
            this.container.appendChild(msgEl);
        }

        msgEl.textContent = text;
        msgEl.style.opacity = '1';

        // Clear previous timeout
        if (this.messageTimeout) clearTimeout(this.messageTimeout);

        this.messageTimeout = setTimeout(() => {
            msgEl.style.opacity = '0';
        }, duration);
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

    updateBuffs(buffs) {
        this.buffDisplay.update(buffs);
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
