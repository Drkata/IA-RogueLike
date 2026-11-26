import { HealthBar } from './components/HealthBar.js';
import { AmmoDisplay } from './components/AmmoDisplay.js';
import { GameInfo } from './components/GameInfo.js';
import { StatsDisplay } from './components/StatsDisplay.js';
import { BuffDisplay } from './components/BuffDisplay.js';
import { SVG_ICONS } from './SVGIcons.js';
import { soundManager } from '../systems/SoundManager.js';

export class HUDManager {
    constructor() {
        this.container = document.getElementById('hud-container');
        this.container.innerHTML = '';

        this.healthBar = new HealthBar(this.container);
        this.ammoDisplay = new AmmoDisplay(this.container);
        this.gameInfo = new GameInfo(this.container);
        this.statsDisplay = new StatsDisplay(this.container);
        this.buffDisplay = new BuffDisplay(this.container);

        this.container.insertAdjacentHTML('beforeend', `
            <div class="weapons" role="status" aria-label="Arme en main">
                <span class="weapons__slot" data-weapon="staff" title="Sceptre">${SVG_ICONS.weaponStaff}<kbd>1</kbd></span>
                <span class="weapons__slot" data-weapon="sword" title="Épée">${SVG_ICONS.weaponSword}<kbd>2</kbd></span>
            </div>
            <div id="crosshair" aria-hidden="true"></div>
            <p class="herald" role="status"></p>
            <p class="countdown" hidden></p>
            <button class="audio-toggle" type="button"></button>
        `);
        this.message = this.container.querySelector('.herald');
        this.countdown = this.container.querySelector('.countdown');
        this.bossBar = document.getElementById('boss-health-container');
        this._setupAudioToggle(this.container.querySelector('.audio-toggle'));
    }

    _setupAudioToggle(button) {
        this.audioToggle = button;
        button.addEventListener('click', (e) => {
            e.stopPropagation(); // Don't grab the pointer lock
            soundManager.toggleMute();
            this.renderAudioToggle();
        });
        this.renderAudioToggle();
    }

    // Music on/off icon (also called when the pause screen's music slider turns the music on)
    renderAudioToggle() {
        const button = this.audioToggle;
        const muted = soundManager.isMuted;
        button.innerHTML = muted ? SVG_ICONS.audioOff : SVG_ICONS.audioOn;
        button.setAttribute('aria-label', muted ? 'Activer la musique' : 'Couper la musique');
        button.classList.toggle('is-muted', muted);
    }

    updateHealth(current, max, shield = 0) {
        this.healthBar.update(current, max, shield);
    }

    showMessage(text) {
        clearTimeout(this.messageTimeout);
        this.messageTimeout = setTimeout(() => {
            this.message.classList.remove('is-visible');
            this._lastMessage = null;
        }, 3000);
        // Prompts are re-sent every frame while in range: only touch the DOM when the text changes
        if (text === this._lastMessage) return;
        this._lastMessage = text;
        this.message.textContent = text;
        this.message.classList.add('is-visible');
    }

    showCountdown(seconds) {
        this.countdown.hidden = false;
        this.updateCountdown(seconds);
    }

    updateCountdown(seconds) {
        this.countdown.innerHTML = `Niveau suivant dans <span class="countdown__n">${seconds}</span>`;
    }

    hideCountdown() {
        this.countdown.hidden = true;
    }

    setBossVisible(visible) {
        this.bossBar.hidden = !visible;
    }

    onDamage() {
        this.healthBar.triggerDamageEffect();
    }

    updateAmmo(current, reserve) {
        this.ammoDisplay.update(current, reserve);
    }

    // `weapon`: 'staff' or 'sword'. The body class swaps the touch buttons' icons.
    updateWeapon(weapon) {
        if (weapon === this._weapon) return; // Called every frame
        this._weapon = weapon;
        for (const slot of this.container.querySelectorAll('.weapons__slot')) {
            slot.classList.toggle('is-active', slot.dataset.weapon === weapon);
        }
        this.container.querySelector('.weapons').setAttribute('aria-label', `Arme en main : ${weapon === 'sword' ? 'épée' : 'sceptre'}`);
        document.body.classList.toggle('weapon-sword', weapon === 'sword');
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

    updateBerserk(active, time, max) {
        this.buffDisplay.updateBerserk(active, time, max);
    }

    attachMinimap(canvas) {
        const container = this.gameInfo.getMinimapContainer();
        canvas.id = 'minimap-frame';
        container.replaceChildren(canvas);
    }
}
