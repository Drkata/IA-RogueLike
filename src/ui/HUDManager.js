import { HealthBar } from './components/HealthBar.js';
import { AmmoDisplay } from './components/AmmoDisplay.js';
import { GameInfo } from './components/GameInfo.js';
import { StatsDisplay } from './components/StatsDisplay.js';
import { BuffDisplay } from './components/BuffDisplay.js';
import { SVG_ICONS } from './SVGIcons.js';

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

        // Audio Mute Toggle
        this.createAudioToggle();
    }

    createAudioToggle() {
        this.audioBtn = document.createElement('div');
        this.audioBtn.id = 'audio-toggle-btn';
        this.audioBtn.innerHTML = SVG_ICONS.audioOn;
        this.audioBtn.style.position = 'absolute';
        this.audioBtn.style.top = '15px';
        this.audioBtn.style.right = '15px';
        this.audioBtn.style.width = '30px';
        this.audioBtn.style.height = '30px';
        this.audioBtn.style.color = '#d4af37'; // Gold color to match theme
        this.audioBtn.style.cursor = 'pointer';
        this.audioBtn.style.pointerEvents = 'auto'; // allow clicking
        this.audioBtn.style.zIndex = '1000';

        import('../systems/SoundManager.js').then(({ soundManager }) => {
            const isMuted = soundManager.isMuted;
            this.audioBtn.innerHTML = isMuted ? SVG_ICONS.audioOff : SVG_ICONS.audioOn;
            this.audioBtn.style.opacity = isMuted ? '0.5' : '1.0';

            this.audioBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering pointer lock
                const isMuted = soundManager.toggleMute();
                this.audioBtn.innerHTML = isMuted ? SVG_ICONS.audioOff : SVG_ICONS.audioOn;
                this.audioBtn.style.opacity = isMuted ? '0.5' : '1.0';
            });
        });

        this.container.appendChild(this.audioBtn);
    }

    createCrosshair() {
        const crosshair = document.createElement('div');
        crosshair.id = 'crosshair';
        this.container.appendChild(crosshair);
    }

    updateHealth(current, max, shield = 0) {
        this.healthBar.update(current, max, shield);
    }

    showMessage(text) {
        // Find or create message container
        let msgContainer = document.getElementById('hud-message');
        if (!msgContainer) {
            msgContainer = document.createElement('div');
            msgContainer.id = 'hud-message';
            msgContainer.style.position = 'absolute';
            msgContainer.style.top = '25%';
            msgContainer.style.left = '50%';
            msgContainer.style.transform = 'translate(-50%, -50%)';
            msgContainer.style.color = '#fff';
            msgContainer.style.fontSize = '24px';
            msgContainer.style.fontWeight = 'bold';
            msgContainer.style.textShadow = '0 0 10px #000, 0 0 20px #000';
            msgContainer.style.pointerEvents = 'none';
            msgContainer.style.opacity = '0';
            msgContainer.style.transition = 'opacity 0.3s ease-in-out';
            msgContainer.style.zIndex = '1000';
            msgContainer.style.textAlign = 'center';
            this.container.appendChild(msgContainer);
        }

        msgContainer.innerHTML = text;
        msgContainer.style.opacity = '1';

        // Clear previous timeout if exists
        if (this.messageTimeout) {
            clearTimeout(this.messageTimeout);
        }

        // Hide after 3 seconds
        this.messageTimeout = setTimeout(() => {
            msgContainer.style.opacity = '0';
        }, 3000);
    }

    showCountdown(seconds) {
        let cdContainer = document.getElementById('hud-countdown');
        if (!cdContainer) {
            cdContainer = document.createElement('div');
            cdContainer.id = 'hud-countdown';
            cdContainer.style.position = 'absolute';
            cdContainer.style.top = '35%';
            cdContainer.style.left = '50%';
            cdContainer.style.transform = 'translate(-50%, -50%)';
            cdContainer.style.color = '#ffeb3b';
            cdContainer.style.fontSize = '32px';
            cdContainer.style.fontWeight = 'bold';
            cdContainer.style.textShadow = '0 0 15px #000, 0 0 25px #000';
            cdContainer.style.pointerEvents = 'none';
            cdContainer.style.zIndex = '1000';
            cdContainer.style.textAlign = 'center';
            this.container.appendChild(cdContainer);
        }
        cdContainer.innerHTML = `Niveau suivant dans : ${seconds}...`;
        cdContainer.style.display = 'block';
    }

    updateCountdown(seconds) {
        const cdContainer = document.getElementById('hud-countdown');
        if (cdContainer) {
            cdContainer.innerHTML = `Niveau suivant dans : ${seconds}...`;
        }
    }

    hideCountdown() {
        const cdContainer = document.getElementById('hud-countdown');
        if (cdContainer) {
            cdContainer.style.display = 'none';
        }
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

    updateGold(gold) {
        this.gameInfo.updateGold(gold);
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
