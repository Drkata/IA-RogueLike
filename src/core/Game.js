import * as THREE from 'three';
import { Input } from './Input.js';
import { CONSTANTS } from './Constants.js';
import { Player } from '../entities/Player.js';
import { LevelManager } from '../systems/LevelManager.js';
import { mapSizeForLevel } from '../systems/MapGenerator.js';
import { EntityManager } from '../systems/EntityManager.js';
import { Enemy } from '../entities/Enemy.js';
import { EnemyAI } from '../entities/EnemyAI.js';
import { EnemyHealthSystem } from '../entities/EnemyHealth.js';
import { BossSentinel } from '../entities/BossSentinel.js';
import { Minimap } from '../systems/Minimap.js';
import { HUDManager } from '../ui/HUDManager.js';
import { StatsDisplay } from '../ui/components/StatsDisplay.js';
import { LootChest } from '../entities/LootChest.js';
import { SpikeTrap } from '../entities/SpikeTrap.js';
import { MagicalSentinel } from '../entities/MagicalSentinel.js';
import { MagicAltar } from '../entities/MagicAltar.js';
import { HealingFountain } from '../entities/HealingFountain.js';
import { MagicalShop } from '../entities/MagicalShop.js';
import { SVG_ICONS } from '../ui/SVGIcons.js';
import { DEVICE } from './Device.js';
import { soundManager } from '../systems/SoundManager.js';
import { num, pct, unit, esc } from '../ui/format.js';

const H = CONSTANTS.WALL_HEIGHT;
const REEL_LENGTH = 20; // Random items spun before the real upgrade shows up
const REEL_SPIN = 800; // ms, matches the .reel-strip transition in hud.css
const LEVEL_CLEAR_DELAY = 2; // s between the last kill and the upgrade menu
const MAX_DT = 0.05; // s: a longer frame (hitch, tab switch) is simulated as this one, so nothing jumps
const RELOCK_DELAY = 1000; // ms: Chrome refuses to lock the pointer again for about a second after Escape

// `for`: what an upgrade or a pact works on, written on its card so the player knows (WEAPON_TAGS)
export const WEAPON_TAGS = { staff: 'Bâton', sword: 'Épée', both: 'Bâton + Épée', general: 'Général' };

// `source`: who holds the level (Weapon is the staff)
export const UPGRADES = [
    { id: 'damage', source: 'weapon', for: 'staff', label: 'Dégâts du bâton' },
    { id: 'fireRate', source: 'weapon', for: 'staff', label: 'Cadence de tir' },
    { id: 'reload', source: 'weapon', for: 'staff', label: 'Rechargement' },
    { id: 'ammo', source: 'weapon', for: 'staff', label: 'Mana max' },
    { id: 'range', source: 'weapon', for: 'staff', label: 'Portée des tirs' },
    { id: 'projectileSpeed', source: 'weapon', for: 'staff', label: 'Vitesse des projectiles' },
    { id: 'bulletCount', source: 'weapon', for: 'staff', label: 'Tir multiple' },
    { id: 'piercing', source: 'weapon', for: 'staff', label: 'Perforation' },
    { id: 'critChance', source: 'weapon', for: 'both', label: 'Chance de critique' },
    { id: 'critDamage', source: 'weapon', for: 'both', label: 'Dégâts critiques' },
    { id: 'maxHealth', source: 'player', for: 'general', label: 'Vie max' },
    { id: 'armor', source: 'player', for: 'general', label: 'Armure' },
    { id: 'vampirism', source: 'player', for: 'both', label: 'Vol de vie' },
    { id: 'regen', source: 'player', for: 'general', label: 'Régénération' },
    { id: 'speed', source: 'player', for: 'general', label: 'Vitesse' },
    { id: 'knockback', source: 'weapon', for: 'staff', label: 'Recul' },
    { id: 'explosion', source: 'weapon', for: 'staff', label: 'Explosion' },
    { id: 'ricochet', source: 'weapon', for: 'staff', label: 'Ricochet' },
    { id: 'homing', source: 'weapon', for: 'staff', label: 'Tête chercheuse' },
    { id: 'meleeDamage', source: 'sword', for: 'sword', label: "Dégâts de l'épée" },
    { id: 'attackSpeed', source: 'sword', for: 'sword', label: "Vitesse d'attaque" },
    { id: 'reach', source: 'sword', for: 'sword', label: 'Allonge' },
    { id: 'immolation', source: 'player', for: 'general', label: "Aura d'immolation" },
    { id: 'magnet', source: 'player', for: 'general', label: 'Aimant à butin' }
];

const VITALITY_STATS = new Set(['maxHealth', 'armor', 'vampirism', 'regen', 'speed']);
const ARCANA_STATS = new Set(['bulletCount', 'piercing', 'knockback', 'explosion', 'ricochet', 'homing', 'immolation', 'magnet']);
const PERCENT_STATS = new Set(['armor', 'vampirism', 'critChance', 'critDamage', 'speed', 'explosion']);

const upgradeCategory = (id) => (VITALITY_STATS.has(id) ? 'vitality' : ARCANA_STATS.has(id) ? 'arcana' : 'offense');

// Display of an upgrade value as returned by getStatValue()
const formatUpgradeValue = (stat, n) => {
    if (stat === 'fireRate') return unit(1 / n, 'tirs/s');
    if (stat === 'reload') return unit(n, 's');
    if (PERCENT_STATS.has(stat)) return pct(n);
    if (stat === 'homing') return `rang ${n}`;
    if (stat === 'immolation') return unit(n, 'dégâts/s');
    if (stat === 'magnet') return unit(n, 'm');
    if (stat === 'regen') return unit(n, 'PV/s');
    if (stat === 'attackSpeed') return unit(n, 'coups/s');
    if (stat === 'reach') return unit(n, 'm');
    return num(n);
};

// Altar pacts: a lasting boon for a lasting price, each worth about what it costs so the choice is
// about the build. An altar offers 2 at random; sealing one again stacks it. `for`: the weapon it works on
// (WEAPON_TAGS), on its card. `apply(player, staff, sword)`.
export const PACTS = [
    // Staff
    { id: 'blood', for: 'staff', icon: 'blood', title: 'Pacte de sang', gain: '+40 % de dégâts du bâton', cost: '−25 % de vie max',
        apply: (p, w) => { p.pactHpMultiplier *= 0.75; w.pactDamageMultiplier *= 1.4; } },
    { id: 'wizard', for: 'staff', icon: 'wizard', title: 'Pacte du magicien', gain: '+50 % de cadence de tir', cost: '−20 % de dégâts du bâton',
        apply: (p, w) => { w.pactDamageMultiplier *= 0.8; w.pactFireRateMultiplier *= 1.5; } },
    { id: 'precision', for: 'staff', icon: 'precision', title: 'Pacte de précision', gain: '+50 % de vitesse des projectiles', cost: "−20 % d'armure",
        apply: (p, w) => { w.pactProjectileSpeedMultiplier *= 1.5; p.pactArmorBonus -= 0.20; } },
    { id: 'hunter', for: 'staff', icon: 'hunter', title: 'Pacte du chasseur', gain: '+25 % de chance et +50 % de dégâts critiques aux tirs', cost: '−15 % de cadence de tir',
        apply: (p, w) => { w.pactCritChance += 0.25; w.pactCritDamage += 0.5; w.pactFireRateMultiplier *= 0.85; } },
    { id: 'storm', for: 'staff', icon: 'storm', title: "Pacte de l'orage", gain: "Vos tirs sautent d'un ennemi touché sur 2 autres ennemis proches", cost: '−25 % de dégâts du bâton',
        apply: (p, w) => { w.pactChain += 2; w.pactDamageMultiplier *= 0.75; } },
    { id: 'pyre', for: 'staff', icon: 'pyre', title: 'Pacte du bûcher', gain: 'Aura de feu : +10 dégâts par seconde aux ennemis à moins de 9 m', cost: '−25 % de vitesse des projectiles',
        apply: (p, w) => { p.pactImmolation += 10; w.pactProjectileSpeedMultiplier *= 0.75; } },
    { id: 'pyromancy', for: 'staff', icon: 'pyromancy', title: 'Pacte de pyromancie', gain: '+25 % de chance que vos tirs explosent', cost: 'Rechargement deux fois plus long',
        apply: (p, w) => { w.pactExplosion += 0.25; w.pactReloadMultiplier *= 2; } },
    { id: 'colossus', for: 'staff', icon: 'colossus', title: 'Pacte du colosse', gain: '+50 % de vie max', cost: '−25 % de dégâts du bâton',
        apply: (p, w) => { p.pactHpMultiplier *= 1.5; w.pactDamageMultiplier *= 0.75; } },
    { id: 'resilience', for: 'staff', icon: 'resilience', title: 'Pacte de résilience', gain: 'Régénère 2 PV par seconde', cost: '−20 % de dégâts du bâton',
        apply: (p, w) => { w.pactDamageMultiplier *= 0.8; p.healthRegen += 2; } },
    { id: 'wings', for: 'staff', icon: 'wings', title: 'Pacte des ailes', gain: "Sauts 50 % plus hauts : assez pour monter sur un mur d'un étage", cost: '−25 % de mana max',
        apply: (p, w) => { p.pactJumpMultiplier *= Math.sqrt(1.5); w.pactAmmoMultiplier *= 0.75; } }, // Jump height grows with the square of the impulse
    // Sword
    { id: 'berserker', for: 'sword', icon: 'berserker', title: 'Pacte du berserker', gain: "+40 % de dégâts de l'épée", cost: '−25 % de vie max',
        apply: (p, w, s) => { s.pactDamageMultiplier *= 1.4; p.pactHpMultiplier *= 0.75; } },
    { id: 'duelist', for: 'sword', icon: 'duelist', title: 'Pacte du duelliste', gain: "+50 % de vitesse d'attaque", cost: "−20 % de dégâts de l'épée",
        apply: (p, w, s) => { s.pactSpeedMultiplier *= 1.5; s.pactDamageMultiplier *= 0.8; } },
    { id: 'reach', for: 'sword', icon: 'reach_pact', title: "Pacte de l'allonge", gain: "+50 % de portée de l'épée", cost: "−20 % d'armure",
        apply: (p, w, s) => { s.pactReachMultiplier *= 1.5; p.pactArmorBonus -= 0.20; } },
    { id: 'executioner', for: 'sword', icon: 'executioner', title: 'Pacte du bourreau', gain: "+25 % de chance et +50 % de dégâts critiques à l'épée", cost: "−15 % de vitesse d'attaque",
        apply: (p, w, s) => { s.pactCritChance += 0.25; s.pactCritDamage += 0.5; s.pactSpeedMultiplier *= 0.85; } },
    { id: 'whirlwind', for: 'sword', icon: 'whirlwind', title: 'Pacte du tourbillon', gain: "L'épée frappe tout autour de vous (360°)", cost: "−25 % de dégâts de l'épée",
        apply: (p, w, s) => { s.whirlwind = true; s.pactDamageMultiplier *= 0.75; } },
    { id: 'riposte', for: 'sword', icon: 'riposte', title: 'Pacte de la riposte', gain: "Après une parade parfaite, votre coup d'épée suivant fait triple dégâts", cost: '−15 % de vie max',
        apply: (p, w, s) => { s.riposte = true; p.pactHpMultiplier *= 0.85; } },
    { id: 'mirror', for: 'sword', icon: 'mirror', title: 'Pacte du miroir', gain: 'Les projectiles parés repartent avec deux fois leurs dégâts', cost: "−20 % de dégâts de l'épée",
        apply: (p, w, s) => { s.mirror *= 2; s.pactDamageMultiplier *= 0.8; } },
    { id: 'greedyBlade', for: 'sword', icon: 'greedy_blade', title: 'Pacte de la lame avide', gain: "Chaque ennemi touché à l'épée rend 5 mana au bâton", cost: '−25 % de mana max',
        apply: (p, w, s) => { s.manaOnHit += 5; w.pactAmmoMultiplier *= 0.75; } },
    { id: 'leech', for: 'sword', icon: 'leech', title: 'Pacte de la sangsue', gain: "Vos coups d'épée volent 15 % de vie", cost: 'Perd 1 PV par seconde',
        apply: (p, w, s) => { s.lifeSteal += 0.15; p.healthRegen -= 1; } },
    { id: 'wave', for: 'sword', icon: 'wave', title: "Pacte de la lame d'onde", gain: "Chaque coup d'épée lance une onde tranchante jusqu'à 8 m", cost: "−30 % de vitesse d'attaque",
        apply: (p, w, s) => { s.waves += 1; s.pactSpeedMultiplier *= 0.7; } },
    // General
    { id: 'cataclysm', for: 'general', icon: 'cataclysm', title: 'Pacte du cataclysme', gain: 'Tous les 8 ennemis tués, une onde de choc part de vous', cost: '−20 % de vie max',
        apply: (p) => { p.pactShockwaveKills = 8; p.nextShockwaveAt = p.sessionStats.kills + 8; p.pactHpMultiplier *= 0.8; } },
    { id: 'aegis', for: 'general', icon: 'aegis', title: "Pacte de l'égide", gain: 'Un bouclier de 40 points se recharge après 4 s sans dégâts', cost: "−50 % d'or ramassé",
        apply: (p) => { p.pactShieldCap = Math.max(p.pactShieldCap, 40); p.pactGoldMultiplier *= 0.5; } },
    { id: 'armor', for: 'general', icon: 'armor_pact', title: "Pacte d'armure", gain: "+20 % d'armure", cost: '−15 % de vitesse',
        apply: (p) => { p.pactSpeedMultiplier *= 0.85; p.pactArmorBonus += 0.20; } },
    { id: 'vampire', for: 'general', icon: 'vampire', title: 'Pacte de vampirisme', gain: '+20 % de vol de vie (bâton et épée)', cost: 'Perd 1 PV par seconde',
        apply: (p) => { p.pactVampirism += 0.20; p.healthRegen -= 1; } },
    { id: 'speed', for: 'general', icon: 'speed_pact', title: 'Pacte de vitesse', gain: '+30 % de vitesse', cost: '−20 % de vie max',
        apply: (p) => { p.pactSpeedMultiplier *= 1.30; p.pactHpMultiplier *= 0.80; } },
    { id: 'greed', for: 'general', icon: 'greed', title: 'Pacte de cupidité', gain: "Double l'or ramassé", cost: 'Les potions au sol soignent moitié moins',
        apply: (p) => { p.pactGoldMultiplier *= 2; p.pactPotionMultiplier *= 0.5; } }
];

// Shop prices. Bulk and "fill up" offers cost exactly the unit rate (no discount).
const POTION = { heal: 50, price: 20 };
const MANA = { amount: 150, price: 15 };
const WARD = { shield: 30, price: 25 };
const UPGRADE_PRICE = 250; // Each of the shop's SHOP_UPGRADES upgrades, once
const SHOP_UPGRADES = 3; // Drawn at random from the upgrades not maxed out, on each visit
const SHIELD_FULL = 100; // The shield bar is drawn on 100 points
const BULK = 10;

// Each ware lists its offers (buttons); prices come from Game._shopOffers()
const SHOP_ITEMS = [
    { icon: 'potion', name: 'Élixir de vie', desc: `Rend ${POTION.heal} points de vie, ou toute votre vie.`, offers: ['potion', 'potionFull'] },
    { icon: 'mana_reserve', name: 'Réserve de mana', desc: `+${MANA.amount} mana en réserve.`, offers: ['ammo', 'ammo10'] },
    { icon: 'ward', name: 'Sceau de protection', desc: `Un bouclier qui absorbe ${WARD.shield} dégâts, ou le bouclier plein (${SHIELD_FULL}).`, offers: ['shield', 'shieldFull'] }
]; // Then the visit's upgrades (Game.shopUpgrades)

const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Game {
    // Regular enemies spawned at a level (special-room guardians and bosses come on top)
    static getEnemyCount(level) {
        const D = CONSTANTS.DIFFICULTY;
        return D.ENEMY_COUNT_BASE + level * D.ENEMY_COUNT_PER_LEVEL + Math.max(0, level - 10) * D.ENEMY_COUNT_SCALING_POST_10;
    }

    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(CONSTANTS.FOV, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.scene.add(this.camera);
        this.renderer = new THREE.WebGLRenderer({ antialias: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        // Phones are fill-rate bound: render fewer pixels
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, DEVICE.phone ? 1.5 : 2));
        // Keeps base colours as painted and only rolls off the brightest glows (lava, runes, flashes)
        this.renderer.toneMapping = THREE.NeutralToneMapping;
        document.getElementById('app').appendChild(this.renderer.domElement);

        window.game = this; // Expose for UI callbacks

        this.input = new Input(DEVICE);
        // A phone held upright shows a "rotate" hint; the game waits meanwhile
        this.portrait = DEVICE.phone ? window.matchMedia('(orientation: portrait)') : null;
        this.clock = new THREE.Clock();

        // Game State
        this.isRunning = false;
        this.isPaused = false;
        this.menuShown = false;
        this.isMidLevelUpgrade = false;
        this.currentLevel = 1;
        this.upgradePoints = 0;

        // Theme light rig: sky/ground fill + one directional key light (moon or sun), no shadows
        this.fillLight = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
        this.scene.add(this.fillLight, this.sunLight, this.sunLight.target);

        this.levelManager = new LevelManager(this.scene);
        this.entityManager = new EntityManager(this.scene);
        this.hudManager = new HUDManager();

        this._bindMenuEvents();
        window.addEventListener('resize', () => this.onResize());
        this.init();
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.needsRender = true; // Resizing clears the canvas, even while paused
    }

    init() {
        this.startNewLevel();
        this.start();
        this.isRunning = true;

        window.addEventListener('keydown', (e) => {
            const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
            if (digit && this._isOverlayOpen('upgrade-menu')) {
                // Keyboard choice: the first press reveals the cards, the next ones pick
                const card = document.querySelectorAll('#upgrade-menu .upgrade-card')[digit[1] - 1];
                if (card && !card.disabled) card.click();
            } else if (e.code === 'KeyP') {
                // Dev cheat: skip to the boss with every upgrade on offer
                this.currentLevel = 9; // Becomes 10 when the menu opens
                this.showUpgradeMenu(27, false, true);
            } else if (e.code === 'KeyU') {
                this.showUpgradeMenu(1); // Dev cheat: test the upgrade menu
            } else if (e.code === 'Escape') {
                if (this._isOverlayOpen('shop-menu')) this.closeShopMenu();
                else if (this._isOverlayOpen('altar-menu')) this.closeAltarMenu();
            }
        });
    }

    // ─── Overlays ────────────────────────────────────────────────────────────

    _bindMenuEvents() {
        const on = (id, handler) => document.getElementById(id).addEventListener('click', handler);
        on('altar-grid-container', (e) => {
            const button = e.target.closest('[data-pact]');
            if (button) this.selectAltarPact(button.dataset.pact);
        });
        on('close-altar-btn', () => {
            soundManager.play('uiClick');
            this.closeAltarMenu();
        });
        on('shop-wares', (e) => {
            const button = e.target.closest('[data-item]');
            if (button) this.buyShopItem(button.dataset.item);
        });
        on('close-shop-btn', () => {
            soundManager.play('uiClick');
            this.closeShopMenu();
        });
        on('game-over-screen', (e) => {
            if (!e.target.closest('#restart-btn')) return;
            soundManager.play('uiClick');
            this._setOverlay('game-over-screen', false);
            this.resetGame();
        });
        on('resume-btn', () => {
            soundManager.play('uiClick');
            this._resume(); // The pause screen stays up until the pointer is locked
        });
        // Pause screen volumes (remembered on this device by soundManager)
        for (const slider of document.querySelectorAll('[data-volume]')) {
            const kind = slider.dataset.volume;
            const show = () => { slider.nextElementSibling.value = `${slider.value} %`; };
            slider.value = Math.round(soundManager[`${kind}Volume`] * 100);
            show();
            slider.addEventListener('input', () => {
                const volume = slider.value / 100;
                soundManager.setVolume(kind, volume);
                if (kind === 'music' && volume > 0 && soundManager.isMuted) {
                    soundManager.toggleMute(); // Raising the music means wanting to hear it
                    this.hudManager.renderAudioToggle();
                }
                show();
            });
            if (kind === 'sfx') slider.addEventListener('change', () => soundManager.play('uiClick')); // Hear the new level
        }

        document.addEventListener('pointerlockchange', () => {
            if (!document.pointerLockElement) this.pause(); // Escape or focus lost during play (ignored under a menu)
            else if (this.resumePending) this._play();
            else if (this.isPaused) this.input.exitPointerLock(); // Locked late, under a menu: give the cursor back
        });
        // Refused (menu closed with Escape, or too soon after Escape): the pause screen asks for a click
        document.addEventListener('pointerlockerror', () => {
            if (!this.resumePending) return;
            this.resumePending = false;
            this._showPause();
        });
        document.addEventListener('visibilitychange', () => document.hidden && this.pause());
    }

    // Pause screen, unless a menu already holds the game
    pause() {
        if (this.isPaused || !this.isRunning) return;
        this._showPause();
    }

    _showPause() {
        this._openMenu('pause-screen');
        const button = document.getElementById('resume-btn');
        button.disabled = this.input.canLockPointer; // A click in Chrome's cooldown would fail: the button waits it out
        clearTimeout(this.resumeTimer);
        this.resumeTimer = setTimeout(() => {
            button.disabled = false;
            // Unless the player already went to a volume slider
            if (!document.getElementById('pause-screen').contains(document.activeElement)) button.focus();
        }, button.disabled ? RELOCK_DELAY : 0);
    }

    // Back to play: at once on touch screens, with a mouse once the pointer is locked again (pointerlockchange)
    _resume() {
        if (!this.input.canLockPointer || document.pointerLockElement) return this._play();
        this.resumePending = true;
        this.input.requestPointerLock();
    }

    _play() {
        this.resumePending = false;
        this._setOverlay('pause-screen', false);
        this.isPaused = false;
        this.isRunning = true;
    }

    _setOverlay(id, visible) {
        document.getElementById(id).hidden = !visible;
    }

    _isOverlayOpen(id) {
        return !document.getElementById(id).hidden;
    }

    // Pause the game and free the cursor for a menu
    _openMenu(id) {
        this.isPaused = true;
        this.isRunning = false;
        this.input.releaseAll();
        this.input.exitPointerLock();
        this._setOverlay(id, true);
    }

    _closeMenu(id) {
        this._setOverlay(id, false);
        this._resume();
    }

    // ─── Game flow ───────────────────────────────────────────────────────────

    gameOver(damageLog = []) {
        this.isRunning = false;
        this.isPaused = true;
        this.input.releaseAll();
        this.input.exitPointerLock();

        const stats = this.player.sessionStats;
        const timeSurvived = (Date.now() - stats.startTime) / 1000;
        const accuracy = stats.shotsFired > 0 ? (stats.shotsHit / stats.shotsFired) * 100 : 0;
        const critRate = stats.shotsHit > 0 ? (stats.critCount / stats.shotsHit) * 100 : 0;

        let highScore = 0;
        try {
            highScore = Number(localStorage.getItem('fps_highscore')) || 0;
            if (this.currentLevel > highScore) localStorage.setItem('fps_highscore', this.currentLevel);
        } catch { /* Storage unavailable (private mode): no record keeping */ }
        const isNewRecord = this.currentLevel > highScore;

        // Death recap: damage taken per source, biggest first
        const bySource = new Map();
        let totalDamage = 0;
        for (const entry of damageLog) {
            const src = bySource.get(entry.source) || { hits: 0, damage: 0, attackers: new Set() };
            src.hits++;
            src.damage += entry.damage;
            if (entry.id !== -1) src.attackers.add(entry.id);
            bySource.set(entry.source, src);
            totalDamage += entry.damage;
        }
        const recapRows = [...bySource.entries()]
            .sort((a, b) => b[1].damage - a[1].damage)
            .map(([source, d]) => `
                <tr>
                    <th scope="row">${esc(source)}</th>
                    <td>${d.attackers.size || '–'}</td>
                    <td>${d.hits}</td>
                    <td>${Math.round(d.damage)}</td>
                    <td>${totalDamage > 0 ? pct((d.damage / totalDamage) * 100) : '–'}</td>
                </tr>`).join('');

        const tally = [
            ['Temps de survie', `${Math.floor(timeSurvived / 60)} min ${Math.floor(timeSurvived % 60)} s`],
            ['Ennemis tués', stats.kills],
            ['Dégâts infligés', Math.round(stats.damageDealt).toLocaleString('fr-FR')],
            ['Précision', pct(accuracy)],
            ['Coups critiques', `${stats.critCount} (${pct(critRate)})`],
            ['Plus gros coup', Math.round(stats.maxDamageHit)],
            ['Dégâts subis', Math.round(stats.damageTaken)],
            ['Soins reçus', Math.round(stats.healingDone)]
        ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');

        document.querySelector('#game-over-screen .epitaph').innerHTML = `
            <h1 class="title title--death">Vous avez péri</h1>
            <p class="lede">Tombé au niveau ${this.currentLevel}. ${isNewRecord ? 'Nouveau record !' : `Record : niveau ${highScore}.`}</p>
            <dl class="tally">${tally}</dl>
            ${recapRows ? `
            <h2 class="subtitle">Ce qui vous a tué</h2>
            <table class="recap">
                <thead><tr><th scope="col">Source</th><th scope="col">Assaillants</th><th scope="col">Coups</th><th scope="col">Dégâts</th><th scope="col">Part</th></tr></thead>
                <tbody>${recapRows}</tbody>
                <tfoot><tr><th scope="row">Total</th><td></td><td>${damageLog.length}</td><td>${Math.round(totalDamage)}</td><td></td></tr></tfoot>
            </table>` : ''}
            <button id="restart-btn" class="btn btn--ember" type="button">Recommencer</button>
        `;
        this._setOverlay('game-over-screen', true);
        soundManager.play('gameOver');
        document.getElementById('restart-btn').focus();
    }

    resetGame() {
        this.hudManager.setBossVisible(false);
        this.currentLevel = 1;
        this.upgradePoints = 0;
        this.player.reset();
        this.startNewLevel();
        this._resume();
    }

    startNewLevel() {
        this.levelCompleteTimerStarted = false;
        this.menuShown = false;
        this.hudManager.setBossVisible(false); // Shown again by the boss if one spawns

        this.entityManager.clear();

        const mapSize = mapSizeForLevel(this.currentLevel);
        const startPos = this.levelManager.generateLevel(mapSize, mapSize, this.currentLevel);

        this._applyThemeLighting();
        this._placePlayer(startPos);

        if (this.currentLevel % 10 === 0) {
            this.spawnBoss();
        } else {
            this.spawnEnemies(Game.getEnemyCount(this.currentLevel));
            this._spawnLevelEntities();
        }
    }

    _applyThemeLighting() {
        const theme = this.levelManager.themeManager.getTheme(this.currentLevel);
        const L = theme.lighting;
        this.fillLight.color.setHex(L.sky);
        this.fillLight.groundColor.setHex(L.ground);
        this.fillLight.intensity = L.fill;
        this.sunLight.color.setHex(L.sun);
        this.sunLight.intensity = L.sunIntensity;
        this.sunLight.position.set(...L.sunDirection).multiplyScalar(100); // Shines towards the origin
        this.scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);
        this.renderer.setClearColor(theme.fogColor);
    }

    _placePlayer(startPos) {
        const lm = this.levelManager;
        if (!this.player) {
            this.player = new Player(this.camera, this.input, lm, this.entityManager, this.hudManager);
            this.minimap = new Minimap(lm, this.player);
            this.hudManager.attachMinimap(this.minimap.canvas);
        } else {
            this.player.resetBuffs(); // Temporary buffs don't carry over between levels
        }

        this.player.position.set(lm.gridToWorld(startPos.x), (startPos.y || 0) + 1.6, lm.gridToWorld(startPos.z));
        this.camera.position.copy(this.player.position);
        this.player.weapon.refill(); // Each level starts with a full clip
        this.player.updateHUD();
    }

    // Special rooms' reward (chest, altar, shop, fountain) sealed by its guardian, then the traps
    _spawnLevelEntities() {
        const lm = this.levelManager;
        const ld = lm.levelData;
        const em = this.entityManager;
        const eventClasses = { altar: MagicAltar, fountain: HealingFountain, shop: MagicalShop };

        for (const { kind, floor, spawn } of ld.specials || []) {
            const reward = kind === 'treasure'
                ? new LootChest(lm.floorPositionAt(spawn.x, spawn.z, floor * H), this.player, () => this._openChest())
                : new eventClasses[kind](spawn.x, spawn.z, lm, floor * H);
            reward.guardian = new MagicalSentinel(spawn.x, spawn.z, lm, em, this.currentLevel, floor * H);
            reward.guardian.onDeath = () => {
                this.hudManager.showMessage('Gardien détruit : la récompense est libérée');
                soundManager.play('uiConfirm');
            };
            em.add(reward);
            em.add(reward.guardian);
        }
        for (const pos of ld.spikeTraps || []) em.add(new SpikeTrap(pos.x, pos.z, lm, 0));
        for (const pos of ld.spikeTrapsFloor1 || []) em.add(new SpikeTrap(pos.x, pos.z, lm, H));
    }

    _openChest() {
        const player = this.player;
        const goldBonus = 25 + Math.floor(Math.random() * 16);
        player.addGold(goldBonus);

        // 28% mana, then 18% each: full health, shield, berserk, upgrade
        const r = Math.random();
        let message;
        if (r < 0.28) {
            player.weapon.reserveAmmo += 100;
            player.weapon.refill();
            player.updateHUD();
            message = 'Mana rechargé';
        } else if (r < 0.46) {
            player.heal(player.maxHealth);
            message = 'Vie entièrement restaurée';
        } else if (r < 0.64) {
            player.addShield(50);
            message = 'Bouclier de 50 points';
        } else if (r < 0.82) {
            player.activateBerserk(10);
            message = 'Furie berserk';
        } else {
            this.showChestUpgradeMenu();
            message = 'Amélioration trouvée';
        }
        this.hudManager.showMessage(`${message}, +${goldBonus} or`);
    }

    spawnBoss() {
        const spawnPoint = this.levelManager.levelData.bossSpawn;
        if (!spawnPoint) return;
        const lm = this.levelManager;
        const position = new THREE.Vector3(lm.gridToWorld(spawnPoint.x), 0, lm.gridToWorld(spawnPoint.z));
        this.entityManager.add(new BossSentinel(position, lm, this.entityManager, this.currentLevel));
        this.player.lookAt(position, true); // Face the boss
    }

    spawnEnemies(count) {
        const lm = this.levelManager;
        const minPlayerDist = Math.min(30, lm.width * lm.cellSize * 0.4); // 30 m, less on small maps
        const minPlayerDistSq = minPlayerDist * minPlayerDist;
        const minEnemyDistSq = 2 * 2;
        // Probes around the spawn point that must be free of walls (3m radius)
        const r = 3.0;
        const d = r * 0.7;
        const probes = [[r, 0], [-r, 0], [0, r], [0, -r], [d, d], [-d, d], [d, -d], [-d, -d]];
        const safeRoom = lm.levelData.safeRoom;

        let spawned = 0;
        let attempts = 0;
        const maxAttempts = count * 100;
        while (spawned < count && attempts < maxAttempts) {
            attempts++;
            const cell = lm.getRandomEmptyPosition();
            if (!cell) continue;
            // Keep the safe room (and its walls) clear
            if (safeRoom && cell.x >= safeRoom.x - 1 && cell.x <= safeRoom.x + safeRoom.w + 1 &&
                cell.z >= safeRoom.z - 1 && cell.z <= safeRoom.z + safeRoom.h + 1) continue;

            const position = lm.floorPositionAt(cell.x, cell.z, cell.y);
            const floorY = position.y;
            if (probes.some(([dx, dz]) => lm.isWall(position.x + dx, position.z + dz, floorY))) continue;
            if (lm.isDecoration(position.x, position.z)) continue;

            position.y += 0.8; // Enemy centre of mass
            if (position.distanceToSquared(this.player.position) < minPlayerDistSq) continue;
            if (this.entityManager.entities.some(e => e.entityType === 'enemy' && position.distanceToSquared(e.position) < minEnemyDistSq)) continue;

            this.entityManager.add(new Enemy(position, lm, this.entityManager, this.currentLevel));
            spawned++;
        }

        if (spawned < count) console.warn(`Only spawned ${spawned}/${count} enemies after ${attempts} attempts`);
    }

    start() {
        this.renderer.setAnimationLoop(() => this.update());
    }

    update() {
        if (window.stats) window.stats.update();

        const dt = Math.min(this.clock.getDelta(), MAX_DT);

        // Menus (and a phone held upright) pause the simulation; the canvas keeps showing the last frame
        if (this.isPaused || this.portrait?.matches) {
            if (this.needsRender) this.renderer.render(this.scene, this.camera);
            this.needsRender = false;
            return;
        }

        this.player.update(dt);
        this.entityManager.update(dt, this.player);
        this.minimap.update(this.entityManager.entities);

        const enemyCount = this.entityManager.getEnemyCount();
        this.hudManager.updateEnemies(enemyCount);
        this.hudManager.updateLevel(this.currentLevel);

        if (enemyCount === 0 && this.isRunning && !this.menuShown) this._updateLevelComplete(dt);

        soundManager.updateListener(this.camera);
        this.renderer.render(this.scene, this.camera);
    }

    // Short countdown once the level is cleared, then the upgrade menu
    _updateLevelComplete(dt) {
        if (!this.levelCompleteTimerStarted) {
            this.levelCompleteTimerStarted = true;
            this.levelCompleteTimer = LEVEL_CLEAR_DELAY;
            this.hudManager.showCountdown(LEVEL_CLEAR_DELAY);
            soundManager.play('levelClear');
            for (const entity of this.entityManager.entities) entity.pullToPlayer?.(); // The loot left flies to the player
        }

        this.levelCompleteTimer -= dt;
        const currentSecond = Math.ceil(this.levelCompleteTimer);
        if (currentSecond !== this.lastCountdownSecond) {
            this.lastCountdownSecond = currentSecond;
            if (currentSecond > 0 && currentSecond < LEVEL_CLEAR_DELAY) {
                this.hudManager.updateCountdown(currentSecond);
                soundManager.play('tick');
            }
        }

        if (this.levelCompleteTimer <= 0) {
            this.hudManager.hideCountdown();
            this.levelCompleteTimerStarted = false;
            this.showUpgradeMenu(this.currentLevel % 10 === 0 ? 5 : 2); // Bosses give more points
        }
    }

    _advanceLevel() {
        this.currentLevel++;
        this.startNewLevel();
    }

    // ─── Upgrade menu ────────────────────────────────────────────────────────

    _upgradeSource(item) {
        if (item.source === 'weapon') return this.player.weapon;
        return item.source === 'sword' ? this.player.sword : this.player;
    }

    getAvailableUpgrades() {
        return UPGRADES.filter(item => {
            const source = this._upgradeSource(item);
            return source.stats[item.id] < source.getMaxLevel(item.id);
        });
    }

    showUpgradeMenu(points = 2, isMidLevel = false, showAll = false) {
        const available = this.getAvailableUpgrades();
        if (available.length === 0) {
            if (!isMidLevel) this._advanceLevel(); // Everything is maxed out: skip the menu
            return;
        }
        this.menuShown = true; // Prevent double opening
        this.isPaused = true;
        this.isRunning = false;
        this.input.exitPointerLock();
        // Small delay so the pointer lock is released before the menu shows
        setTimeout(() => this._openUpgradeMenu(showAll ? available : shuffle(available).slice(0, 3), points, isMidLevel), 100);
    }

    // Chest reward: pick 1 of 2 random upgrades, then resume the level
    showChestUpgradeMenu() {
        const available = this.getAvailableUpgrades();
        if (available.length === 0) return;
        this.menuShown = true;
        this._openUpgradeMenu(shuffle(available).slice(0, 2), 1, true);
    }

    _openUpgradeMenu(choices, points, isMidLevel) {
        this.currentUpgradeChoices = choices;
        this.upgradePoints = points;
        this.isMidLevelUpgrade = isMidLevel;
        if (!isMidLevel) {
            // The next level is built behind the menu once it shows: its freeze is hidden there, not in play
            this.currentLevel++;
            this.nextLevelPending = true;
            requestAnimationFrame(() => setTimeout(() => this._buildNextLevel()));
        }
        this._openMenu('upgrade-menu');
        this.renderUpgradeUI(!isMidLevel && !prefersReducedMotion()); // A chest's pick shows its cards at once
    }

    _buildNextLevel() {
        if (!this.nextLevelPending) return;
        this.nextLevelPending = false;
        this.startNewLevel();
        this.renderer.compileAsync(this.scene, this.camera).catch(() => {}); // Shaders ready before play resumes
    }

    _finishUpgradeMenu() {
        this.menuShown = false;
        this.currentUpgradeChoices = null;
        this._buildNextLevel(); // Not built yet if the choice was very quick
        this._closeMenu('upgrade-menu');
    }

    renderUpgradeUI(animate = true) {
        // Between levels, currentLevel is already the next one (built behind the menu)
        const nextLevel = this.isMidLevelUpgrade ? this.currentLevel + 1 : this.currentLevel;
        document.getElementById('upgrade-title').textContent = this.isMidLevelUpgrade
            ? 'Une amélioration vous attend'
            : `Niveau ${nextLevel - 1} franchi`;

        const points = this.upgradePoints;
        document.getElementById('upgrade-points').innerHTML = points > 0
            ? `${'<span class="seal" aria-hidden="true"></span>'.repeat(Math.min(points, 10))}<span>${points} point${points > 1 ? 's' : ''} à dépenser</span>`
            : '<span>Points dépensés</span>';

        document.getElementById('upgrade-ledger-player').innerHTML = StatsDisplay.render(this.player);
        document.getElementById('upgrade-ledger-threat').innerHTML = this._renderThreat(nextLevel);

        this.reveals = []; // Filled by _spinReel: shows a spinning card at once
        const choices = this.currentUpgradeChoices || UPGRADES;
        document.querySelector('#upgrade-menu .upgrade-grid')
            .replaceChildren(...choices.map((item, index) => this._createUpgradeCard(item, index, animate)));
    }

    // What the next level holds: regular enemies or the boss
    _renderThreat(level) {
        const rows = (pairs) => pairs.map(([label, value]) => `<div class="stat"><dt>${label}</dt><dd>${value}</dd></div>`).join('');

        if (level % 10 === 0) {
            return `
                <h3 class="ledger__title ledger__title--boss">Niveau ${level} : la Sentinelle colossale</h3>
                <dl class="ledger__col">${rows([
                    ['Vie', BossSentinel.getHP(level)],
                    ["Vague d'énergie", num(BossSentinel.getNovaDamage(level))],
                    ['Tourbillon', num(BossSentinel.getSpiralDamage(level))],
                    ['Pluie de météores', num(BossSentinel.getMeteorDamage(level))]
                ])}</dl>`;
        }

        const enemy = EnemyAI.getCombatStats(level);
        return `
            <h3 class="ledger__title">Niveau ${level}</h3>
            <dl class="ledger__col">${rows([
                ['Ennemis', `≈ ${Game.getEnemyCount(level)}`],
                ['Vie', num(EnemyHealthSystem.getMaxHealth(level))],
                ['Dégâts par tir', num(enemy.damage)],
                ['Vitesse', num(enemy.speed)],
                ['Vitesse des tirs', num(enemy.projectileSpeed)],
                ['Délai entre tirs', unit(enemy.attackCooldown, 's')],
                ['Portée de tir', num(enemy.attackRange)]
            ])}</dl>`;
    }

    _createUpgradeCard(item, index, animate) {
        const source = this._upgradeSource(item);
        const level = source.stats[item.id];
        const maxLevel = source.getMaxLevel(item.id);
        const isMaxed = level >= maxLevel;
        const usable = this.upgradePoints > 0 && !isMaxed;

        const current = formatUpgradeValue(item.id, source.getStatValue(item.id, level));
        const next = isMaxed ? 'max' : formatUpgradeValue(item.id, source.getStatValue(item.id, level + 1));
        const pips = Array.from({ length: maxLevel }, (_, i) => `<span class="pip${i < level ? ' pip--on' : ''}"></span>`).join('');

        const card = document.createElement('button');
        card.type = 'button';
        card.className = `upgrade-card upgrade-card--${upgradeCategory(item.id)}`;
        card.disabled = !usable;
        card.innerHTML = `
            <span class="upgrade-card__face">
                <span class="weapon-tag weapon-tag--${item.for}">${WEAPON_TAGS[item.for]}</span>
                <span class="upgrade-card__sigil">${SVG_ICONS[item.id] || ''}</span>
                <span class="upgrade-card__name">${item.label}</span>
                <span class="upgrade-card__values"><span>${current}</span><span class="upgrade-card__next">${next}</span></span>
                <span class="upgrade-card__rank"><span class="sr-only">Rang ${level} sur ${maxLevel}</span>${pips}</span>
            </span>`;

        card.addEventListener('click', () => {
            // A click while the cards spin skips the spin instead of picking
            if (card.classList.contains('is-sealed')) return this.reveals.forEach(reveal => reveal());
            if (this.upgradePoints <= 0 || !source.upgrade(item.id)) return;
            soundManager.play('uiConfirm');
            this.upgradePoints--;
            this.renderUpgradeUI(false);
            if (this.upgradePoints === 0 || this.getAvailableUpgrades().length === 0) {
                setTimeout(() => this._finishUpgradeMenu(), 250);
            }
        });

        if (animate) this._spinReel(card, item, index);
        return card;
    }

    // Slot-machine reveal: a reel of random upgrades spins and lands on the real one
    _spinReel(card, item, index) {
        const reelItems = Array.from({ length: REEL_LENGTH }, () => UPGRADES[Math.floor(Math.random() * UPGRADES.length)]);
        reelItems.push(item);

        const reel = document.createElement('span');
        reel.className = 'upgrade-card__reel';
        reel.setAttribute('aria-hidden', 'true');
        const strip = document.createElement('span');
        strip.className = 'reel-strip';
        strip.innerHTML = reelItems.map(r => `
            <span class="reel-item">
                <span class="weapon-tag weapon-tag--${r.for}">${WEAPON_TAGS[r.for]}</span>
                <span class="upgrade-card__sigil">${SVG_ICONS[r.id] || ''}</span>
                <span class="upgrade-card__name">${r.label}</span>
            </span>`).join('');
        reel.appendChild(strip);
        card.prepend(reel);

        card.classList.add('is-sealed'); // Clicking it now skips the spin (see the click handler)

        const landed = `translateY(${-(REEL_LENGTH / (REEL_LENGTH + 1)) * 100}%)`;
        const timers = [];
        const reveal = () => {
            if (!card.classList.contains('is-sealed')) return;
            timers.forEach(clearTimeout);
            card.classList.add('is-dealt');
            strip.style.transform = landed;
            card.classList.replace('is-sealed', 'is-revealed');
            soundManager.play('reelStop');
        };
        this.reveals.push(reveal);

        timers.push(setTimeout(() => {
            card.classList.add('is-dealt');
            soundManager.play('cardDeal');
            timers.push(setTimeout(() => {
                strip.style.transform = landed;
                timers.push(setTimeout(reveal, REEL_SPIN));
            }, 200));
        }, index * 150));
    }

    // ─── Altar ───────────────────────────────────────────────────────────────

    showAltarMenu(altar) {
        this.currentAltar = altar;
        const [p1, p2] = shuffle([...PACTS]);
        document.getElementById('altar-grid-container').innerHTML = [p1, p2].map(pact => `
            <article class="pact">
                <span class="weapon-tag weapon-tag--${pact.for}">${WEAPON_TAGS[pact.for]}</span>
                <span class="pact__sigil">${SVG_ICONS[pact.icon]}</span>
                <h3 class="pact__title">${pact.title}</h3>
                <p class="pact__gain">${pact.gain}</p>
                <p class="pact__cost">${pact.cost}</p>
                <button class="btn btn--hex" type="button" data-pact="${pact.id}">Sceller ce pacte</button>
            </article>`).join('');
        this._openMenu('altar-menu');
    }

    selectAltarPact(pactId) {
        const pact = PACTS.find(p => p.id === pactId);
        if (!this.currentAltar || !pact) return;

        pact.apply(this.player, this.player.weapon, this.player.sword);
        soundManager.play('pact');
        this.player.recalculateStats();
        this.player.weapon.recalculateStats();
        this.player.sword.recalculateStats();
        this.player.updateHUD();
        this.hudManager.showMessage(`${pact.title} (${WEAPON_TAGS[pact.for]}) scellé : ${pact.gain}, ${pact.cost.charAt(0).toLowerCase()}${pact.cost.slice(1)}`);
        this.closeAltarMenu();
    }

    closeAltarMenu() {
        if (this.currentAltar) this.currentAltar.deactivate(); // Refusing also spends the altar
        this.currentAltar = null;
        this._closeMenu('altar-menu');
    }

    // ─── Shop ────────────────────────────────────────────────────────────────

    showShopMenu(shop) {
        this.currentShop = shop;
        this.shopUpgrades = this._drawShopUpgrades();
        this.showShopFeedback('');
        this._renderShop();
        this._openMenu('shop-menu');
    }

    // The visit's upgrades: SHOP_UPGRADES drawn from those not maxed out, with their value now and after
    _drawShopUpgrades() {
        return shuffle(this.getAvailableUpgrades()).slice(0, SHOP_UPGRADES).map(item => {
            const source = this._upgradeSource(item);
            const level = source.stats[item.id];
            const value = (l) => formatUpgradeValue(item.id, source.getStatValue(item.id, l));
            return { item, now: value(level), next: value(level + 1), sold: false };
        });
    }

    // Every offer for the player's current state: { label, price, blocked (reason it can't be bought), buy() → message }
    _shopOffers() {
        const p = this.player;
        const missingHealth = Math.max(0, p.maxHealth - p.health);
        const missingShield = Math.max(0, SHIELD_FULL - p.shield);
        const fullHealth = missingHealth <= 0 && 'Votre vie est déjà au maximum.';
        const addMana = (n) => () => {
            p.weapon.reserveAmmo += MANA.amount * n;
            return `+${MANA.amount * n} mana en réserve.`;
        };
        return {
            potion: { label: 'Acheter', price: POTION.price, blocked: fullHealth, buy: () => { p.heal(POTION.heal); return `+${POTION.heal} points de vie.`; } },
            potionFull: {
                label: 'Vie pleine',
                price: Math.max(1, Math.ceil(missingHealth * POTION.price / POTION.heal)),
                blocked: fullHealth,
                buy: () => { p.heal(missingHealth); return `Vie restaurée (+${Math.ceil(missingHealth)} PV).`; }
            },
            ammo: { label: 'Acheter', price: MANA.price, buy: addMana(1) },
            ammo10: { label: `×${BULK}`, price: MANA.price * BULK, buy: addMana(BULK) },
            shield: { label: 'Acheter', price: WARD.price, buy: () => { p.addShield(WARD.shield); return `Bouclier de ${WARD.shield} points.`; } },
            shieldFull: {
                label: 'Bouclier plein',
                price: Math.max(1, Math.ceil(missingShield * WARD.price / WARD.shield)),
                blocked: missingShield <= 0 && 'Votre bouclier est déjà plein.',
                buy: () => { p.addShield(missingShield); return `Bouclier plein (${SHIELD_FULL} points).`; }
            },
            // The visit's upgrades, one level each, once
            ...Object.fromEntries((this.shopUpgrades || []).map((u, i) => [`upgrade${i}`, {
                label: 'Acheter',
                price: UPGRADE_PRICE,
                sold: u.sold,
                blocked: u.sold && 'Déjà achetée.',
                buy: () => {
                    this._upgradeSource(u.item).upgrade(u.item.id);
                    u.sold = true;
                    return `${u.item.label} (${WEAPON_TAGS[u.item.for]}) : ${u.next}.`;
                }
            }]))
        };
    }

    _renderShop() {
        const gold = this.player.gold;
        const offers = this._shopOffers();
        document.getElementById('shop-gold-value').textContent = gold;
        const button = (id) => {
            const offer = offers[id];
            return `
                    <button class="btn btn--gilt ware__buy" type="button" data-item="${id}" ${offer.blocked || gold < offer.price ? 'aria-disabled="true"' : ''}>
                        ${offer.sold ? 'Achetée' : `${offer.label} <span class="price">${offer.price} ${SVG_ICONS.coin}</span>`}
                    </button>`;
        };
        const ware = (icon, name, desc, ids) => `
            <li class="ware">
                <span class="ware__icon">${icon}</span>
                <span class="ware__text"><span class="ware__name">${name}</span><span class="ware__desc">${desc}</span></span>
                <span class="ware__buys">${ids.filter(id => !offers[id].hidden).map(button).join('')}</span>
            </li>`;
        document.getElementById('shop-wares').innerHTML = [
            ...SHOP_ITEMS.map(item => ware(SVG_ICONS[item.icon], item.name, item.desc, item.offers)),
            ...this.shopUpgrades.map((u, i) => ware(
                SVG_ICONS[u.item.id],
                `${u.item.label} <span class="weapon-tag weapon-tag--${u.item.for}">${WEAPON_TAGS[u.item.for]}</span>`,
                `Amélioration : ${u.now} → ${u.next}`,
                [`upgrade${i}`]
            ))
        ].join('');
    }

    showShopFeedback(message, isError = false) {
        if (message) soundManager.play(isError ? 'uiError' : 'purchase');
        const el = document.getElementById('shop-feedback');
        el.textContent = message;
        el.classList.toggle('feedback--error', isError);
        clearTimeout(this.shopFeedbackTimeout);
        if (message) this.shopFeedbackTimeout = setTimeout(() => { el.textContent = ''; }, 3500);
    }

    buyShopItem(offerId) {
        const offer = this._shopOffers()[offerId];
        if (!this.currentShop || !offer || offer.hidden) return;

        const player = this.player;
        if (offer.blocked) {
            this.showShopFeedback(offer.blocked, true);
            return;
        }
        if (player.gold < offer.price) {
            this.showShopFeedback(`Il vous manque ${offer.price - player.gold} pièces d'or.`, true);
            return;
        }

        const message = offer.buy();
        player.spendGold(offer.price);
        this.showShopFeedback(`Acheté : ${message}`);
        this._renderShop();
    }

    closeShopMenu() {
        this._closeMenu('shop-menu');
        if (this.currentShop) {
            this.currentShop.disable();
            this.currentShop = null;
        }
    }
}
