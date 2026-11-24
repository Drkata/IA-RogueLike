import * as THREE from 'three';
import { Input } from './Input.js';
import { CONSTANTS } from './Constants.js';
import { Player } from '../entities/Player.js';
import { LevelManager } from '../systems/LevelManager.js';
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

const UPGRADES = [
    { id: 'damage', source: 'weapon', label: 'Dégâts' },
    { id: 'fireRate', source: 'weapon', label: 'Cadence de tir' },
    { id: 'reload', source: 'weapon', label: 'Rechargement' },
    { id: 'ammo', source: 'weapon', label: 'Mana max' },
    { id: 'range', source: 'weapon', label: 'Portée' },
    { id: 'projectileSpeed', source: 'weapon', label: 'Vitesse des projectiles' },
    { id: 'bulletCount', source: 'weapon', label: 'Tir multiple' },
    { id: 'piercing', source: 'weapon', label: 'Perforation' },
    { id: 'critChance', source: 'weapon', label: 'Chance de critique' },
    { id: 'critDamage', source: 'weapon', label: 'Dégâts critiques' },
    { id: 'maxHealth', source: 'player', label: 'Vie max' },
    { id: 'armor', source: 'player', label: 'Armure' },
    { id: 'vampirism', source: 'player', label: 'Vol de vie' },
    { id: 'regen', source: 'player', label: 'Régénération' },
    { id: 'speed', source: 'player', label: 'Vitesse' },
    { id: 'knockback', source: 'weapon', label: 'Recul' },
    { id: 'explosion', source: 'weapon', label: 'Explosion' },
    { id: 'ricochet', source: 'weapon', label: 'Ricochet' },
    { id: 'homing', source: 'weapon', label: 'Tête chercheuse' },
    { id: 'meleeDamage', source: 'player', label: 'Coup de bâton' },
    { id: 'immolation', source: 'player', label: "Aura d'immolation" },
    { id: 'magnet', source: 'player', label: 'Aimant à butin' }
];

const VITALITY_STATS = new Set(['maxHealth', 'armor', 'vampirism', 'regen', 'speed']);
const ARCANA_STATS = new Set(['bulletCount', 'piercing', 'knockback', 'explosion', 'ricochet', 'homing', 'meleeDamage', 'immolation', 'magnet']);
const PERCENT_STATS = new Set(['armor', 'vampirism', 'critChance', 'critDamage', 'speed', 'explosion']);

const upgradeCategory = (id) => (VITALITY_STATS.has(id) ? 'vitality' : ARCANA_STATS.has(id) ? 'arcana' : 'offense');

// Display of an upgrade value as returned by getStatValue()
const formatUpgradeValue = (stat, n) => {
    if (stat === 'fireRate') return unit(1 / n, 'tirs/s');
    if (stat === 'reload') return unit(n, 's');
    if (PERCENT_STATS.has(stat)) return pct(n);
    if (stat === 'homing') return `rang ${n}`;
    if (stat === 'immolation') return unit(n, 'dégâts/s');
    if (stat === 'magnet') return n > 0 ? unit(n, 'm') : 'aucun';
    if (stat === 'regen') return unit(n, 'PV/s');
    return num(n);
};

const PACTS = [
    { id: 'blood', icon: 'blood', title: 'Pacte de sang', gain: '+40 % de dégâts', cost: '−25 % de vie max',
        apply: (p, w) => { p.pactHpMultiplier *= 0.75; w.pactDamageMultiplier *= 1.4; } },
    { id: 'armor', icon: 'armor_pact', title: "Pacte d'armure", gain: "+40 % d'armure", cost: '−15 % de vitesse',
        apply: (p) => { p.pactSpeedMultiplier *= 0.85; p.pactArmorBonus += 0.40; } },
    { id: 'speed', icon: 'speed_pact', title: 'Pacte de vitesse', gain: '+30 % de vitesse', cost: '−20 % de vie max',
        apply: (p) => { p.pactSpeedMultiplier *= 1.30; p.pactHpMultiplier *= 0.80; } },
    { id: 'vampire', icon: 'vampire', title: 'Pacte de vampirisme', gain: '+20 % de vol de vie', cost: 'Perd 1 PV par seconde',
        apply: (p) => { p.pactVampirism += 0.20; p.healthRegen -= 1; } },
    { id: 'wizard', icon: 'wizard', title: 'Pacte du magicien', gain: '+50 % de cadence de tir', cost: '−30 % de dégâts',
        apply: (p, w) => { w.pactDamageMultiplier *= 0.7; w.pactFireRateMultiplier *= 1.5; } },
    { id: 'greed', icon: 'greed', title: 'Pacte de cupidité', gain: "+150 pièces d'or", cost: '−15 % de vitesse',
        apply: (p) => { p.gold += 150; p.pactSpeedMultiplier *= 0.85; } },
    { id: 'precision', icon: 'precision', title: 'Pacte de précision', gain: '+50 % de vitesse des projectiles', cost: "−20 % d'armure",
        apply: (p, w) => { w.pactProjectileSpeedMultiplier *= 1.5; p.pactArmorBonus -= 0.20; } },
    { id: 'resilience', icon: 'resilience', title: 'Pacte de résilience', gain: 'Régénère 1 PV par seconde', cost: '−50 % de dégâts',
        apply: (p, w) => { w.pactDamageMultiplier *= 0.5; p.healthRegen += 1; } }
];

// Shop prices. Bulk and "fill up" offers cost exactly the unit rate (no discount).
const POTION = { heal: 50, price: 20 };
const MANA = { amount: 150, price: 15 };
const WARD = { shield: 30, price: 25 };
const SHARD_PRICE = 50;
const SHIELD_FULL = 100; // The shield bar is drawn on 100 points
const BULK = 10;

// Each ware lists its offers (buttons); prices come from Game._shopOffers()
const SHOP_ITEMS = [
    { icon: 'potion', name: 'Élixir de vie', desc: `Rend ${POTION.heal} points de vie, ou toute votre vie.`, offers: ['potion', 'potionFull'] },
    { icon: 'mana_reserve', name: 'Réserve de mana', desc: `+${MANA.amount} mana en réserve.`, offers: ['ammo', 'ammo10'] },
    { icon: 'ward', name: 'Sceau de protection', desc: `Un bouclier qui absorbe ${WARD.shield} dégâts, ou le bouclier plein (${SHIELD_FULL}).`, offers: ['shield', 'shieldFull'] },
    { icon: 'soul_shard', name: "Fragment d'âme", desc: 'Une amélioration tirée au hasard.', offers: ['upgrade', 'upgrade10'] }
];

const randomEventType = () => {
    const r = Math.random();
    return r < 0.4 ? 'altar' : (r < 0.8 ? 'shop' : 'fountain');
};

const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Game {
    // Regular enemies spawned at a level (sentinels and bosses come on top)
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
    }

    init() {
        this.startNewLevel();

        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyP') {
                // Dev cheat: skip to the boss with every upgrade on offer
                this.currentLevel = 9; // Becomes 10 after the menu
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
        this.isPaused = false;
        this.isRunning = true;
        this.input.requestPointerLock();
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
        this.isPaused = false;
        this.isRunning = true;
        this.currentLevel = 1;
        this.upgradePoints = 0;
        this.player.reset();
        this.startNewLevel();
    }

    startNewLevel() {
        this.levelCompleteTimerStarted = false;
        this.menuShown = false;
        this.hudManager.setBossVisible(false); // Shown again by the boss if one spawns

        this.entityManager.clear();

        // Map grows with the level: base 55, +1.3 per level, capped at 95
        const mapSize = Math.min(95, 55 + Math.floor(this.currentLevel * 1.3));
        const startPos = this.levelManager.generateLevel(mapSize, mapSize, this.currentLevel);

        this._applyThemeLighting();
        this._placePlayer(startPos);

        if (!this.isRunning) {
            this.start();
            this.isRunning = true;
        }

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

    // Chests, traps, sentinels and the event room (altar / shop / fountain) of every floor
    _spawnLevelEntities() {
        const lm = this.levelManager;
        const ld = lm.levelData;
        const em = this.entityManager;
        const floors = [
            { checkY: 0, chests: lm.chestPositions, traps: ld.spikeTraps, sentinels: ld.sentinels, event: ld.eventSpawn, eventType: ld.eventType },
            { checkY: H, chests: lm.chestPositionsFloor1, traps: ld.spikeTrapsFloor1, sentinels: ld.sentinelsFloor1, event: ld.eventSpawnFloor1, eventType: ld.eventTypeFloor1 },
            { checkY: H * 2, event: ld.eventSpawnFloor2 }
        ];
        const eventClasses = { altar: MagicAltar, fountain: HealingFountain, shop: MagicalShop };

        for (const floor of floors) {
            for (const pos of floor.chests || []) {
                em.add(new LootChest(lm.floorPositionAt(pos.x, pos.z, floor.checkY), this.player, () => this._openChest()));
            }
            for (const pos of floor.traps || []) {
                em.add(new SpikeTrap(pos.x, pos.z, lm, floor.checkY));
            }
            for (const pos of floor.sentinels || []) {
                em.add(new MagicalSentinel(pos.x, pos.z, lm, em, this.currentLevel, floor.checkY));
            }
            if (floor.event) {
                const EventClass = eventClasses[floor.eventType || randomEventType()];
                em.add(new EventClass(floor.event.x, floor.event.z, lm, floor.checkY));
            }
        }
    }

    _openChest() {
        const player = this.player;
        const goldBonus = 25 + Math.floor(Math.random() * 16);
        player.addGold(goldBonus);

        const r = Math.random();
        let message;
        if (r < 0.25) {
            player.weapon.reserveAmmo += 100;
            player.weapon.refill();
            player.updateHUD();
            message = 'Mana rechargé';
        } else if (r < 0.40) {
            player.heal(player.maxHealth);
            message = 'Vie entièrement restaurée';
        } else if (r < 0.55) {
            player.addShield(50);
            message = 'Bouclier de 50 points';
        } else if (r < 0.70) {
            player.activateBerserk(10);
            message = 'Furie berserk';
        } else if (r < 0.85) {
            player.triggerShockwave();
            message = 'Onde de choc';
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
        const minPlayerDistSq = 30 * 30;
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

        const dt = this.clock.getDelta();

        // Menus (and a phone held upright) pause the simulation but keep rendering the frozen scene
        if (this.isPaused || this.portrait?.matches) {
            this.renderer.render(this.scene, this.camera);
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

    // 5 second countdown once the level is cleared, then the upgrade menu
    _updateLevelComplete(dt) {
        if (!this.levelCompleteTimerStarted) {
            this.levelCompleteTimerStarted = true;
            this.levelCompleteTimer = 5.0;
            this.hudManager.showCountdown(5);
            soundManager.play('levelClear');
        }

        this.levelCompleteTimer -= dt;
        const currentSecond = Math.ceil(this.levelCompleteTimer);
        if (currentSecond !== this.lastCountdownSecond) {
            this.lastCountdownSecond = currentSecond;
            if (currentSecond > 0 && currentSecond < 5) {
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
        return item.source === 'weapon' ? this.player.weapon : this.player;
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
        this._openMenu('upgrade-menu');
        this.renderUpgradeUI(!prefersReducedMotion());
    }

    _finishUpgradeMenu() {
        this.menuShown = false;
        this.currentUpgradeChoices = null;
        this._closeMenu('upgrade-menu');
        if (!this.isMidLevelUpgrade) this._advanceLevel();
    }

    renderUpgradeUI(animate = true) {
        document.getElementById('upgrade-title').textContent = this.isMidLevelUpgrade
            ? 'Une amélioration vous attend'
            : `Niveau ${this.currentLevel} franchi`;

        const points = this.upgradePoints;
        document.getElementById('upgrade-points').innerHTML = points > 0
            ? `${'<span class="seal" aria-hidden="true"></span>'.repeat(Math.min(points, 10))}<span>${points} point${points > 1 ? 's' : ''} à dépenser</span>`
            : '<span>Points dépensés</span>';

        document.getElementById('upgrade-ledger-player').innerHTML = StatsDisplay.render(this.player);
        document.getElementById('upgrade-ledger-threat').innerHTML = this._renderThreat(this.currentLevel + 1);

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
                    ['Balayage laser', num(BossSentinel.getLaserDamage(level))],
                    ['Tir en spirale', num(BossSentinel.getSpiralDamage(level))],
                    ['Pluie de météores', num(BossSentinel.getMissileDamage(level))]
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
                <span class="upgrade-card__sigil">${SVG_ICONS[item.id] || ''}</span>
                <span class="upgrade-card__name">${item.label}</span>
                <span class="upgrade-card__values"><span>${current}</span><span class="upgrade-card__next">${next}</span></span>
                <span class="upgrade-card__rank"><span class="sr-only">Rang ${level} sur ${maxLevel}</span>${pips}</span>
            </span>`;

        card.addEventListener('click', () => {
            if (this.upgradePoints <= 0 || !source.upgrade(item.id)) return;
            soundManager.play('uiConfirm');
            this.upgradePoints--;
            this.renderUpgradeUI(false);
            if (this.upgradePoints === 0 || this.getAvailableUpgrades().length === 0) {
                setTimeout(() => this._finishUpgradeMenu(), 500);
            }
        });

        if (animate) this._spinReel(card, item, index, usable);
        return card;
    }

    // Slot-machine reveal: a reel of random upgrades spins and lands on the real one
    _spinReel(card, item, index, usable) {
        const reelItems = Array.from({ length: REEL_LENGTH }, () => UPGRADES[Math.floor(Math.random() * UPGRADES.length)]);
        reelItems.push(item);

        const reel = document.createElement('span');
        reel.className = 'upgrade-card__reel';
        reel.setAttribute('aria-hidden', 'true');
        const strip = document.createElement('span');
        strip.className = 'reel-strip';
        strip.innerHTML = reelItems.map(r => `
            <span class="reel-item">
                <span class="upgrade-card__sigil">${SVG_ICONS[r.id] || ''}</span>
                <span class="upgrade-card__name">${r.label}</span>
            </span>`).join('');
        reel.appendChild(strip);
        card.prepend(reel);

        card.classList.add('is-sealed');
        card.disabled = true; // Not clickable until revealed

        setTimeout(() => {
            card.classList.add('is-dealt');
            soundManager.play('cardDeal');
            setTimeout(() => {
                strip.style.transform = `translateY(${-(REEL_LENGTH / (REEL_LENGTH + 1)) * 100}%)`;
                setTimeout(() => {
                    card.classList.replace('is-sealed', 'is-revealed');
                    soundManager.play('reelStop');
                    card.disabled = !usable;
                }, 2500); // Matches the reel transition in hud.css
            }, 300);
        }, index * 200);
    }

    // ─── Altar ───────────────────────────────────────────────────────────────

    showAltarMenu(altar) {
        this.currentAltar = altar;
        const [p1, p2] = shuffle([...PACTS]);
        document.getElementById('altar-grid-container').innerHTML = [p1, p2].map(pact => `
            <article class="pact">
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

        pact.apply(this.player, this.player.weapon);
        soundManager.play('pact');
        this.player.recalculateStats();
        this.player.weapon.recalculateStats();
        this.player.updateHUD();
        this.hudManager.showMessage(`${pact.title} scellé : ${pact.gain}, ${pact.cost.charAt(0).toLowerCase()}${pact.cost.slice(1)}`);
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
        this.showShopFeedback('');
        this._renderShop();
        this._openMenu('shop-menu');
    }

    // Every offer for the player's current state: { label, price, blocked (reason it can't be bought), buy() → message }
    _shopOffers() {
        const p = this.player;
        const missingHealth = Math.max(0, p.maxHealth - p.health);
        const missingShield = Math.max(0, SHIELD_FULL - p.shield);
        const shards = Math.min(BULK, this._remainingUpgradeLevels());
        const fullHealth = missingHealth <= 0 && 'Votre vie est déjà au maximum.';
        const maxedOut = shards === 0 && 'Toutes vos améliorations sont déjà au maximum.';
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
            upgrade: { label: 'Acheter', price: SHARD_PRICE, blocked: maxedOut, buy: () => this._buyUpgrades(1) },
            // Fewer than 10 upgrade levels left: the bulk offer shrinks to what can still be bought
            upgrade10: { label: `×${Math.max(2, shards)}`, price: SHARD_PRICE * Math.max(2, shards), hidden: shards < 2, blocked: maxedOut, buy: () => this._buyUpgrades(shards) }
        };
    }

    _remainingUpgradeLevels() {
        return UPGRADES.reduce((sum, item) => {
            const source = this._upgradeSource(item);
            return sum + source.getMaxLevel(item.id) - source.stats[item.id];
        }, 0);
    }

    // `count` random upgrades; returns a summary like "Dégâts +2, Portée +1."
    _buyUpgrades(count) {
        const gained = new Map();
        for (let i = 0; i < count; i++) {
            const available = this.getAvailableUpgrades();
            const upgrade = available[Math.floor(Math.random() * available.length)];
            this._upgradeSource(upgrade).upgrade(upgrade.id);
            gained.set(upgrade.label, (gained.get(upgrade.label) || 0) + 1);
        }
        return [...gained].sort((a, b) => b[1] - a[1]).map(([label, n]) => `${label} +${n}`).join(', ') + '.';
    }

    _renderShop() {
        const gold = this.player.gold;
        const offers = this._shopOffers();
        document.getElementById('shop-gold-value').textContent = gold;
        document.getElementById('shop-wares').innerHTML = SHOP_ITEMS.map(item => `
            <li class="ware">
                <span class="ware__icon">${SVG_ICONS[item.icon]}</span>
                <span class="ware__text"><span class="ware__name">${item.name}</span><span class="ware__desc">${item.desc}</span></span>
                <span class="ware__buys">${item.offers.filter(id => !offers[id].hidden).map(id => {
                    const offer = offers[id];
                    return `
                    <button class="btn btn--gilt ware__buy" type="button" data-item="${id}" ${offer.blocked || gold < offer.price ? 'aria-disabled="true"' : ''}>
                        ${offer.label} <span class="price">${offer.price} ${SVG_ICONS.coin}</span>
                    </button>`;
                }).join('')}</span>
            </li>`).join('');
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
