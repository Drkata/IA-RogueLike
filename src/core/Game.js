import * as THREE from 'three';
import { Input } from './Input.js';
import { CONSTANTS } from './Constants.js';
import { Player } from '../entities/Player.js';
import { LevelManager } from '../systems/LevelManager.js';
import { EntityManager } from '../systems/EntityManager.js';
import { Enemy } from '../entities/Enemy.js';
import { BossSentinel } from '../entities/BossSentinel.js';
import { Minimap } from '../systems/Minimap.js';
import { HUDManager } from '../ui/HUDManager.js';
import { LootChest } from '../entities/LootChest.js';
import { SpikeTrap } from '../entities/SpikeTrap.js';
import { MagicalSentinel } from '../entities/MagicalSentinel.js';
import { MagicAltar } from '../entities/MagicAltar.js';
import { HealingFountain } from '../entities/HealingFountain.js';
import { MagicalShop } from '../entities/MagicalShop.js';
import { SVG_ICONS } from '../ui/SVGIcons.js';

export class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(CONSTANTS.FOV, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.scene.add(this.camera);
        this.renderer = new THREE.WebGLRenderer({ antialias: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        document.getElementById('app').appendChild(this.renderer.domElement);

        window.game = this; // Expose for UI callbacks

        this.input = new Input();
        this.clock = new THREE.Clock();

        // Game State
        this.isRunning = false;
        this.isPaused = false;
        this.menuShown = false; // FIX: Initialize to prevent instant level skip
        this.isMidLevelUpgrade = false;

        // Basic lighting
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(this.ambientLight);

        this.levelManager = new LevelManager(this.scene);
        this.entityManager = new EntityManager(this.scene);
        this.hudManager = new HUDManager();

        this.currentLevel = 1;
        this.upgradePoints = 0;
        this.wasTouchVisible = false; // Track touch state for menu

        this.init();

        // Resize handler
        window.addEventListener('resize', () => this.onResize());

        // Define Upgrade List
        this.upgradeList = [
            { id: 'damage', source: 'weapon' },
            { id: 'fireRate', source: 'weapon' },
            // { id: 'arc', source: 'weapon' }, // Merged with Multishot
            { id: 'reload', source: 'weapon' },
            { id: 'ammo', source: 'weapon' },
            { id: 'range', source: 'weapon' },
            { id: 'projectileSpeed', source: 'weapon' },
            { id: 'bulletCount', source: 'weapon' },
            { id: 'piercing', source: 'weapon' },
            { id: 'critChance', source: 'weapon' },
            { id: 'critDamage', source: 'weapon' },
            { id: 'maxHealth', source: 'player' },
            { id: 'armor', source: 'player' },
            { id: 'vampirism', source: 'player' },
            { id: 'regen', source: 'player' },
            { id: 'speed', source: 'player' },
            { id: 'knockback', source: 'weapon' },
            { id: 'explosion', source: 'weapon' },
            { id: 'ricochet', source: 'weapon' },
            { id: 'homing', source: 'weapon' },
            { id: 'meleeDamage', source: 'player' },
            { id: 'immolation', source: 'player' }
        ];
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    async init() {
        this.startNewLevel();

        // Cheat / Dev Tool: Press 'P' to skip to Boss
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyP') {
                console.log("CHEAT: Skipping to Boss Level and showing all upgrades");
                this.currentLevel = 9; // Will become 10 after menu
                // Pass points directly to showUpgradeMenu to avoid overwrite and show all upgrades
                this.showUpgradeMenu(27, false, true);
            }
            if (e.code === 'KeyU') {
                console.log("CHEAT: Testing Upgrade Menu");
                this.upgradePoints = 1;
                this.showUpgradeMenu();
            }
        });
    }
    gameOver(damageLog = []) {
        this.isRunning = false;
        this.isPaused = true;

        // Show Cursor
        document.exitPointerLock();
        document.body.style.cursor = 'default';

        // Calculate Stats
        const stats = this.player.sessionStats;
        const timeSurvived = (Date.now() - stats.startTime) / 1000; // Seconds
        const accuracy = stats.shotsFired > 0 ? (stats.shotsHit / stats.shotsFired) * 100 : 0;

        // Process Death Recap
        const damageSummary = {};
        let totalDamage = 0;

        damageLog.forEach(entry => {
            const key = entry.source;
            if (!damageSummary[key]) {
                damageSummary[key] = {
                    hits: 0,
                    damage: 0,
                    attackers: new Set()
                };
            }
            damageSummary[key].hits++;
            damageSummary[key].damage += entry.damage;
            if (entry.id !== -1) {
                damageSummary[key].attackers.add(entry.id);
            }
            totalDamage += entry.damage;
        });

        // Generate Recap HTML
        let recapHTML = `
            <h3 style="color: #ff4444; margin-top: 20px; border-bottom: 1px solid #444;">DEATH RECAP</h3>
            <table style="width: 100%; text-align: left; border-collapse: collapse; margin-top: 10px; font-size: 0.9em;">
                <tr style="color: #aaa; border-bottom: 1px solid #333;">
                    <th style="padding: 5px;">Source</th>
                    <th style="padding: 5px; text-align: center;">Unique</th>
                    <th style="padding: 5px; text-align: center;">Hits</th>
                    <th style="padding: 5px; text-align: right;">Damage</th>
                    <th style="padding: 5px; text-align: right;">%</th>
                </tr>
        `;

        // Sort by damage desc
        const sortedSources = Object.entries(damageSummary).sort((a, b) => b[1].damage - a[1].damage);

        sortedSources.forEach(([source, data]) => {
            const percent = totalDamage > 0 ? (data.damage / totalDamage) * 100 : 0;
            recapHTML += `
                <tr style="border-bottom: 1px solid #222;">
                    <td style="padding: 5px; color: #fff;">${source}</td>
                    <td style="padding: 5px; text-align: center; color: #aaa;">${data.attackers.size > 0 ? data.attackers.size : '-'}</td>
                    <td style="padding: 5px; text-align: center; color: #aaa;">${data.hits}</td>
                    <td style="padding: 5px; text-align: right; color: #ff8888;">${Math.round(data.damage)}</td>
                    <td style="padding: 5px; text-align: right; color: #888;">${percent.toFixed(1)}%</td>
                </tr>
            `;
        });

        recapHTML += `
                <tr style="border-top: 1px solid #444; font-weight: bold;">
                    <td style="padding: 5px; color: #fff;">TOTAL</td>
                    <td style="padding: 5px;"></td>
                    <td style="padding: 5px; text-align: center; color: #fff;">${damageLog.length}</td>
                    <td style="padding: 5px; text-align: right; color: #ff4444;">${Math.round(totalDamage)}</td>
                    <td style="padding: 5px;"></td>
                </tr>
            </table>
        `;

        // High Score Logic
        const highScore = parseInt(localStorage.getItem('fps_highscore')) || 0;
        const isNewRecord = this.currentLevel > highScore;
        if (isNewRecord) {
            localStorage.setItem('fps_highscore', this.currentLevel);
        }

        // Create UI Overlay
        const overlay = document.createElement('div');
        overlay.id = 'game-over-screen';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.color = 'white';
        overlay.style.zIndex = '2000';
        overlay.style.fontFamily = 'monospace';

        overlay.innerHTML = `
            <h1 style="font-size: 4em; color: red; margin-bottom: 20px; text-shadow: 0 0 20px red;">GAME OVER</h1>
            
            <div style="background: #111; padding: 30px; border: 2px solid #444; border-radius: 10px; min-width: 500px; max-height: 80vh; overflow-y: auto;">
                <h2 style="color: #ffff00; text-align: center; border-bottom: 1px solid #444; padding-bottom: 10px;">SESSION REPORT</h2>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 20px 0; font-size: 1.2em;">
                    <div style="color: #aaa;">Level Reached:</div>
                    <div style="text-align: right; color: #fff;">${this.currentLevel} ${isNewRecord ? '<span style="color: #ffff00; font-size: 0.8em;">(NEW RECORD!)</span>' : ''}</div>
                    
                    <div style="color: #aaa;">Time Survived:</div>
                    <div style="text-align: right; color: #fff;">${Math.floor(timeSurvived / 60)}m ${Math.floor(timeSurvived % 60)}s</div>
                    
                    <div style="color: #aaa;">Enemies Killed:</div>
                    <div style="text-align: right; color: #ff8888;">${stats.kills}</div>
                    
                    <div style="color: #aaa;">Damage Dealt:</div>
                    <div style="text-align: right; color: #ff8888;">${Math.round(stats.damageDealt).toLocaleString()}</div>
                    
                    <div style="color: #aaa;">Accuracy:</div>
                    <div style="text-align: right; color: ${accuracy > 50 ? '#88ff88' : '#ff8888'};">${accuracy.toFixed(1)}%</div>

                    <div style="color: #aaa;">Critical Hits:</div>
                    <div style="text-align: right; color: #ff00ff;">${stats.critCount} <span style="font-size: 0.8em; color: #aaa;">(${stats.shotsHit > 0 ? Math.round((stats.critCount / stats.shotsHit) * 100) : 0}%)</span></div>

                    <div style="color: #aaa;">Max Damage Hit:</div>
                    <div style="text-align: right; color: #ffff00;">${Math.round(stats.maxDamageHit)}</div>

                    <div style="color: #aaa;">Damage Taken:</div>
                    <div style="text-align: right; color: #ff4444;">${Math.round(stats.damageTaken)}</div>

                    <div style="color: #aaa;">Healing Done:</div>
                    <div style="text-align: right; color: #44ff44;">${Math.round(stats.healingDone)}</div>
                </div>

                ${recapHTML}

                <div style="text-align: center; margin-top: 20px; font-size: 0.9em; color: #666;">
                    Best Level: ${Math.max(highScore, this.currentLevel)}
                </div>
            </div>

            <button id="restart-btn" style="
                margin-top: 40px;
                padding: 15px 40px;
                font-size: 1.5em;
                background: #ff0000;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-weight: bold;
                box-shadow: 0 0 15px #ff0000;
                transition: transform 0.1s;
            ">TRY AGAIN</button>
        `;

        document.body.appendChild(overlay);

        document.getElementById('restart-btn').onclick = () => {
            document.body.removeChild(overlay);
            this.resetGame();
        };
    }

    resetGame() {
        console.log("Resetting Game...");

        // Hide Boss Health Bar
        const bossHealth = document.getElementById('boss-health-container');
        if (bossHealth) bossHealth.style.display = 'none';

        // Unpause the game
        this.isPaused = false;
        this.isRunning = true;

        this.currentLevel = 1;
        this.upgradePoints = 0;
        if (this.player) {
            this.player.reset();
        }
        this.startNewLevel();
    }

    startNewLevel() {
        this.levelCompleteTimerStarted = false;
        console.log(`Starting Level ${this.currentLevel} `);

        // Reset menu flag for this level
        this.menuShown = false;

        // Safety: Hide Boss Health Bar (it will be shown by Boss if spawned)
        const bossHealth = document.getElementById('boss-health-container');
        if (bossHealth) bossHealth.style.display = 'none';

        // Clear old entities
        this.entityManager.clear();

        // Dynamic Map Size
        // Base 55 (was 36), +1.3 per level, Cap at 95 (was 72)
        const mapSize = Math.min(95, 55 + Math.floor(this.currentLevel * 1.3));

        // Generate Level with Theme
        const startPos = this.levelManager.generateLevel(mapSize, mapSize, this.currentLevel);

        // Update Ambient Light based on Theme
        const theme = this.levelManager.themeManager.getTheme(this.currentLevel);
        if (theme) {
            if (theme.ambientLight) {
                this.ambientLight.color.setHex(theme.ambientLight);
            }
            // Update Fog
            if (theme.fogColor) {
                this.scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity || 0.02);
                this.renderer.setClearColor(theme.fogColor); // Match background to fog
            } else {
                this.scene.fog = null;
                this.renderer.setClearColor(0x000000);
            }
        }

        // Player Setup
        if (!this.player) {
            this.player = new Player(this.camera, this.input, this.levelManager, this.entityManager, this.hudManager);
        } else {
            // Update references for existing player
            this.player.levelManager = this.levelManager;
            this.player.entityManager = this.entityManager;
            this.player.resetBuffs(); // Clear temporary buffs between levels
        }

        this.player.position.set(
            startPos.x * CONSTANTS.CELL_SIZE + CONSTANTS.CELL_SIZE / 2,
            1.6,
            startPos.z * CONSTANTS.CELL_SIZE + CONSTANTS.CELL_SIZE / 2
        );
        this.camera.position.copy(this.player.position);
        console.log(`DEBUG: Player pos: ${this.player.position.x}, ${this.player.position.y}, ${this.player.position.z}`);
        console.log(`DEBUG: Camera pos: ${this.camera.position.x}, ${this.camera.position.y}, ${this.camera.position.z}`);

        // Minimap
        this.minimap = new Minimap(this.levelManager, this.player);
        this.hudManager.attachMinimap(this.minimap.canvas);

        // Store previous round health before resetting
        this.previousRoundHealth = this.player ? this.player.health : null;

        // Restore health from previous round (or default to full)
        this.player.health = (this.previousRoundHealth !== null && this.previousRoundHealth !== undefined) ? this.previousRoundHealth : 100;
        this.player.updateHUD();

        // Auto-reload weapon instantly if not full ammo
        if (this.player.weapon && this.player.weapon.currentAmmo < this.player.weapon.maxAmmo) {
            this.player.weapon.currentAmmo = this.player.weapon.maxAmmo;
            // Reset reload state
            this.player.weapon.isReloading = false;
            this.player.weapon.reloadTimer = 0;
            let minDist = Infinity;
            let nearestEnemy = null;

            for (const entity of this.entityManager.entities) {
                if (entity.entityType === 'enemy') {
                    const dist = this.player.position.distanceTo(entity.position);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestEnemy = entity;
                    }
                }
            }

            if (nearestEnemy) {
                // Calculate look direction
                const dx = nearestEnemy.position.x - this.player.position.x;
                const dz = nearestEnemy.position.z - this.player.position.z;
                const dy = (nearestEnemy.position.y - 0.5) - this.player.position.y;

                // Update Player's internal rotation state
                // Yaw: Math.atan2(-dx, -dz) aligns with Player.js forward vector (0, 0, -1)
                this.player.yaw = Math.atan2(-dx, -dz);

                // Pitch: Standard calculation
                const dist2D = Math.sqrt(dx * dx + dz * dz);
                this.player.pitch = -Math.atan2(dy, dist2D);

                // Force immediate camera update
                this.player.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ');
            }
        }

        if (!this.isRunning) {
            this.start();
            this.isRunning = true;
        }

        // Spawn Enemies or Boss
        if (this.currentLevel % 10 === 0) {
            this.spawnBoss();
        } else {
            // Normal Level
            // Base Scaling
            let enemyCount = CONSTANTS.DIFFICULTY.ENEMY_COUNT_BASE + (this.currentLevel * CONSTANTS.DIFFICULTY.ENEMY_COUNT_PER_LEVEL);

            // Post-Level 10 Scaling (Steeper)
            if (this.currentLevel > 10) {
                enemyCount += (this.currentLevel - 10) * CONSTANTS.DIFFICULTY.ENEMY_COUNT_SCALING_POST_10;
            }

            console.log(`DEBUG: About to spawn ${enemyCount} enemies (Level ${this.currentLevel})`);
            this.spawnEnemies(enemyCount);
            console.log(`DEBUG: After spawn, EntityManager has ${this.entityManager.entities.length} entities`);
            console.log(`DEBUG: Enemy count = ${this.entityManager.getEnemyCount()} `);

            // Spawn Loot Chests
            if (this.levelManager.chestPositions) {
                this.levelManager.chestPositions.forEach(pos => {
                    const position = new THREE.Vector3(
                        pos.x * CONSTANTS.CELL_SIZE + CONSTANTS.CELL_SIZE / 2,
                        0,
                        pos.z * CONSTANTS.CELL_SIZE + CONSTANTS.CELL_SIZE / 2
                    );

                    const chest = new LootChest(position, this.player, () => {
                        const goldBonus = 25 + Math.floor(Math.random() * 16); // 25-40 Gold
                        this.player.addGold(goldBonus);

                        // Loot Logic
                        const rand = Math.random();
                        let message = "";

                        if (rand < 0.25) {
                            // Ammo (25%)
                            this.player.weapon.reserveAmmo += 100;
                            this.player.weapon.currentAmmo = this.player.weapon.maxAmmo; // Instant Reload
                            this.player.weapon.isReloading = false; // Cancel reload if active
                            this.player.updateHUD();
                            message = "Ammo Refilled & Reloaded";
                        } else if (rand < 0.40) {
                            // Health (15%)
                            this.player.health = this.player.maxHealth; // Full Heal
                            this.player.updateHUD();
                            message = "Health Fully Restored";
                        } else if (rand < 0.55) {
                            // Overshield (15%)
                            this.player.addShield(50);
                            message = "Overshield Acquired";
                        } else if (rand < 0.70) {
                            // Berserk (15%)
                            this.player.activateBerserk(10);
                            message = "BERSERK MODE ACTIVATED";
                        } else if (rand < 0.85) {
                            // Shockwave (15%)
                            this.player.triggerShockwave();
                            message = "Shockwave Triggered";
                        } else {
                            // Upgrade Chest (15%)
                            this.showChestUpgradeMenu();
                            message = "Upgrade Found!";
                        }

                        message += ` (+${goldBonus} Or)`;

                        console.log("Loot Pickup: " + message);
                        // Show message on HUD (Need to implement HUD message)
                        if (this.hudManager) {
                            this.hudManager.showMessage(message);
                        }
                    });

                    this.entityManager.add(chest);
                });
            }

            // Spawn Spike Traps
            if (this.levelManager.levelData.spikeTraps) {
                this.levelManager.levelData.spikeTraps.forEach(pos => {
                    const trap = new SpikeTrap(pos.x, pos.z, CONSTANTS.CELL_SIZE);
                    this.entityManager.add(trap);
                });
            }

            // Spawn Magical Sentinels
            if (this.levelManager.levelData.sentinels) {
                this.levelManager.levelData.sentinels.forEach(pos => {
                    const sentinel = new MagicalSentinel(pos.x, pos.z, this.levelManager, this.entityManager, this.currentLevel);
                    this.entityManager.add(sentinel);
                });
            }

            // Spawn Event Altar, Shop or Fountain
            if (this.levelManager.levelData.eventSpawn) {
                const pos = this.levelManager.levelData.eventSpawn;
                const type = this.levelManager.levelData.eventType;
                if (type === 'altar') {
                    const altar = new MagicAltar(pos.x, pos.z, CONSTANTS.CELL_SIZE);
                    this.entityManager.add(altar);
                } else if (type === 'fountain') {
                    const fountain = new HealingFountain(pos.x, pos.z, CONSTANTS.CELL_SIZE);
                    this.entityManager.add(fountain);
                } else if (type === 'shop') {
                    const shop = new MagicalShop(pos.x, pos.z, CONSTANTS.CELL_SIZE);
                    this.entityManager.add(shop);
                }
            }
        }
    }

    spawnBoss() {
        const spawnPoint = this.levelManager.levelData.bossSpawn;
        if (spawnPoint) {
            const position = new THREE.Vector3(
                spawnPoint.x * CONSTANTS.CELL_SIZE + CONSTANTS.CELL_SIZE / 2,
                0,
                spawnPoint.z * CONSTANTS.CELL_SIZE + CONSTANTS.CELL_SIZE / 2
            );

            const boss = new BossSentinel(position, this.levelManager, this.entityManager, this.currentLevel);
            this.entityManager.add(boss);
            console.log("BOSS SPAWNED");

            // Face the Boss
            if (this.player) {
                const dx = position.x - this.player.position.x;
                const dz = position.z - this.player.position.z;

                // Calculate Yaw to look at boss
                this.player.yaw = Math.atan2(-dx, -dz);
                this.player.pitch = 0; // Look straight ahead (not up/down)

                // Apply rotation immediately
                this.player.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ');
            }
        }
    }

    spawnEnemies(count) {
        const minDistance = 30;
        const minEnemyDistance = 2;
        const safeWallDistance = 3.0;

        let spawned = 0;
        let totalAttempts = 0;
        const maxTotalAttempts = count * 100; // Safety limit

        while (spawned < count && totalAttempts < maxTotalAttempts) {
            totalAttempts++;

            // Get random empty position from the entire map
            const gridPos = this.levelManager.getRandomEmptyPosition();
            if (!gridPos) {
                continue;
            }

            const position = new THREE.Vector3(
                gridPos.x * CONSTANTS.CELL_SIZE + CONSTANTS.CELL_SIZE / 2,
                0,
                gridPos.z * CONSTANTS.CELL_SIZE + CONSTANTS.CELL_SIZE / 2
            );

            let valid = true;

            // Check 8 points around enemy for wall proximity
            const checkRadius = safeWallDistance;
            const checkPoints = [
                { x: position.x + checkRadius, z: position.z },
                { x: position.x - checkRadius, z: position.z },
                { x: position.x, z: position.z + checkRadius },
                { x: position.x, z: position.z - checkRadius },
                { x: position.x + checkRadius * 0.7, z: position.z + checkRadius * 0.7 },
                { x: position.x - checkRadius * 0.7, z: position.z + checkRadius * 0.7 },
                { x: position.x + checkRadius * 0.7, z: position.z - checkRadius * 0.7 },
                { x: position.x - checkRadius * 0.7, z: position.z - checkRadius * 0.7 }
            ];

            for (const point of checkPoints) {
                if (this.levelManager.isWall(point.x, point.z)) {
                    valid = false;
                    break;
                }
            }

            if (!valid) continue;

            // Check distance from player
            if (position.distanceTo(this.player.position) < minDistance) {
                continue;
            }

            // Check if position overlaps with decorations
            const gridX = Math.floor(position.x / CONSTANTS.CELL_SIZE);
            const gridZ = Math.floor(position.z / CONSTANTS.CELL_SIZE);

            let onDecoration = false;
            if (this.levelManager.decorationPositions) {
                for (const deco of this.levelManager.decorationPositions) {
                    if (deco.x === gridX && deco.z === gridZ) {
                        onDecoration = true;
                        break;
                    }
                }
            }

            if (onDecoration) continue;

            // Check Safe Room
            if (this.levelManager.levelData && this.levelManager.levelData.safeRoom) {
                const sr = this.levelManager.levelData.safeRoom;
                const cellSize = CONSTANTS.CELL_SIZE;

                const gridX = Math.floor(position.x / cellSize);
                const gridZ = Math.floor(position.z / cellSize);

                if (gridX >= sr.x - 1 && gridX <= sr.x + sr.w + 1 &&
                    gridZ >= sr.z - 1 && gridZ <= sr.z + sr.h + 1) {
                    continue;
                }
            }

            // Check distance from other enemies
            let tooClose = false;
            for (const entity of this.entityManager.entities) {
                if (entity.entityType === 'enemy') {
                    if (position.distanceTo(entity.position) < minEnemyDistance) {
                        tooClose = true;
                        break;
                    }
                }
            }

            if (tooClose) continue;

            // Valid position found, spawn enemy
            const enemy = new Enemy(position, this.levelManager, this.entityManager, this.currentLevel);
            this.entityManager.add(enemy);
            spawned++;
        }

        if (spawned < count) {
            console.warn(`Only spawned ${spawned}/${count} enemies after ${totalAttempts} attempts`);
        }
    }

    start() {
        this.renderer.setAnimationLoop(() => this.update());
    }

    update() {
        if (window.stats) window.stats.update();

        const dt = this.clock.getDelta();

        // Don't update game if paused (upgrade menu open)
        if (this.isPaused) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        if (this.player) this.player.update(dt);
        this.entityManager.update(dt, this.player);

        if (this.minimap) {
            // Pass raw entities array — Minimap filters internally (no .filter() allocation)
            this.minimap.update(this.entityManager.entities);
        }

        // HUD dirty flags — only update DOM when values actually change
        const enemyCount = this.entityManager.getEnemyCount();
        if (enemyCount !== this._lastEnemyCount) {
            this._lastEnemyCount = enemyCount;
            this.hudManager.updateEnemies(enemyCount);
        }
        this.hudManager.updateLevel(this.currentLevel);
        if (this.player && this.player.weapon) {
            const curAmmo = this.player.weapon.currentAmmo;
            const resAmmo = this.player.weapon.reserveAmmo;
            if (curAmmo !== this._lastCurAmmo || resAmmo !== this._lastResAmmo) {
                this._lastCurAmmo = curAmmo;
                this._lastResAmmo = resAmmo;
                this.hudManager.updateAmmo(curAmmo, resAmmo);
            }
        }

        // Check Level Complete
        if (enemyCount === 0 && this.isRunning && !this.menuShown) {
            if (!this.levelCompleteTimerStarted) {
                this.levelCompleteTimerStarted = true;
                this.levelCompleteTimer = 5.0; // 5 seconds
                this.hudManager.showCountdown(5);
            }
            
            this.levelCompleteTimer -= dt;
            const currentSecond = Math.ceil(this.levelCompleteTimer);
            if (currentSecond !== this.lastCountdownSecond) {
                this.lastCountdownSecond = currentSecond;
                if (currentSecond > 0) {
                    this.hudManager.updateCountdown(currentSecond);
                }
            }

            if (this.levelCompleteTimer <= 0) {
                this.hudManager.hideCountdown();
                this.menuShown = true;
                this.levelCompleteTimerStarted = false; // Reset for next level
                
                if (this.currentLevel % 10 === 0) {
                    this.showUpgradeMenu(5);
                } else {
                    this.showUpgradeMenu();
                }
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    showUpgradeMenu(points = 2, isMidLevel = false, showAll = false) {
        // 1. Filter upgrades that are not maxed out
        const available = this.upgradeList.filter(item => {
            const sourceObj = item.source === 'weapon' ? this.player.weapon : this.player;
            const maxLvl = sourceObj.getMaxLevel ? sourceObj.getMaxLevel(item.id) : sourceObj.MAX_LEVEL;
            return sourceObj.stats[item.id] < maxLvl;
        });

        const choiceCount = 3;

        // Show ALL available upgrades for level-up menu
        if (available.length === 0) {
            console.log("All upgrades maxed! Skipping menu.");
            if (!isMidLevel) {
                this.currentLevel++;
                this.startNewLevel();
            }
            return;
        }

        if (showAll) {
            // Keep all available upgrades
            this.currentUpgradeChoices = available;
        } else {
            // 2. Randomly select up to 'choiceCount' unique upgrades
            // Fisher-Yates Shuffle
            for (let i = available.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [available[i], available[j]] = [available[j], available[i]];
            }

            // Take top 'choiceCount'
            this.currentUpgradeChoices = available.slice(0, choiceCount);
        }

        this.isRunning = false;
        this.isPaused = true; // Pause game updates
        this.menuShown = true; // Prevent double opening
        this.isMidLevelUpgrade = isMidLevel;

        // Exit pointer lock to show cursor
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        // Force cursor to be visible
        document.body.style.cursor = 'default';

        // Small delay to ensure pointer lock is released
        setTimeout(() => {
            const menu = document.getElementById('upgrade-menu');
            menu.style.display = 'flex';

            this.upgradePoints = points;
            this.renderUpgradeUI();
        }, 100);
    }

    renderUpgradeUI(animate = true) {
        const grid = document.querySelector('.upgrade-grid');
        grid.innerHTML = '';

        // --- NEW: Stats Panels ---
        let statsContainer = document.getElementById('stats-container');
        if (!statsContainer) {
            statsContainer = document.createElement('div');
            statsContainer.id = 'stats-container';
            statsContainer.style.display = 'flex';
            statsContainer.style.flexDirection = 'column'; // Stack header and panels
            statsContainer.style.marginBottom = '20px';
            statsContainer.style.gap = '10px';

            // Sticky Positioning
            statsContainer.style.position = 'sticky';
            statsContainer.style.top = '0';
            statsContainer.style.zIndex = '10';
            statsContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.95)'; // Opaque background
            statsContainer.style.paddingBottom = '10px'; // Spacing
            statsContainer.style.borderBottom = '1px solid #444'; // Separator

            // Match Grid Width
            statsContainer.style.width = '90%';
            statsContainer.style.maxWidth = '1000px';

            // Insert before grid
            grid.parentNode.insertBefore(statsContainer, grid);
        }
        statsContainer.innerHTML = ''; // Clear previous

        // 1. Header Row (Level Complete + Points)
        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.justifyContent = 'space-between';
        headerRow.style.alignItems = 'center';
        headerRow.style.padding = '10px';
        headerRow.style.background = '#111';
        headerRow.style.border = '1px solid #444';

        const title = document.createElement('h2');
        title.innerText = `LEVEL ${this.currentLevel} COMPLETE`;
        title.style.margin = '0';
        title.style.color = '#fff';
        headerRow.appendChild(title);

        const pointsContainer = document.createElement('div');
        pointsContainer.style.fontSize = '1.5em';
        pointsContainer.style.fontWeight = 'bold';
        pointsContainer.style.color = '#ffff00';
        pointsContainer.style.textShadow = '0 0 10px #ffaa00';
        pointsContainer.innerHTML = `POINTS: <span id="upgrade-points">${this.upgradePoints}</span>`;
        headerRow.appendChild(pointsContainer);

        statsContainer.appendChild(headerRow);

        // 2. Panels Row
        const panelsRow = document.createElement('div');
        panelsRow.style.display = 'flex';
        panelsRow.style.justifyContent = 'space-around';
        panelsRow.style.gap = '10px';
        statsContainer.appendChild(panelsRow);

        // 3. Player Stats Panel
        const playerPanel = document.createElement('div');
        playerPanel.className = 'stats-panel player';
        playerPanel.innerHTML = `
            <h3>PLAYER STATS</h3>
            <div class="stats-grid">
                <div class="stats-label good">Max HP:</div><div class="stats-value">${Math.round(this.player.maxHealth)}</div>
                <div class="stats-label good">Armor:</div><div class="stats-value">${Math.round(this.player.armor * 100)}%</div>
                
                <div class="stats-label good">Regen:</div><div class="stats-value">${this.player.regen.toFixed(1)}/s</div>
                <div class="stats-label good">Life Steal:</div><div class="stats-value">${Math.round(this.player.vampirism * 100)}%</div>
                
                <div class="stats-label good">Speed:</div><div class="stats-value">${Math.round((this.player.speed / CONSTANTS.PLAYER_SPEED) * 100)}%</div>
                <div class="stats-label bad">Damage:</div><div class="stats-value">${this.player.weapon.bulletCount > 1 ? (this.player.weapon.damage * this.player.weapon.bulletCount).toFixed(1) + ' / ' + this.player.weapon.bulletCount : this.player.weapon.damage.toFixed(1)}</div>
                
                <div class="stats-label bad">Fire Rate:</div><div class="stats-value">${(1 / this.player.weapon.fireRate).toFixed(1)}/s</div>
                <div class="stats-label bad">Crit Chance:</div><div class="stats-value">${Math.round(this.player.weapon.critChance * 100)}%</div>
                
                <div class="stats-label bad">Crit Dmg:</div><div class="stats-value">${Math.round(this.player.weapon.critDamage * 100)}%</div>
                <div class="stats-label bad">Ammo:</div><div class="stats-value">${this.player.weapon.maxAmmo}</div>
                
                <div class="stats-label bad">Reload:</div><div class="stats-value">${this.player.weapon.reloadTime.toFixed(1)}s</div>
                <div class="stats-label bad">Spread Arc:</div><div class="stats-value">${this.player.weapon.arc}°</div>
                
                <div class="stats-label bad">Range:</div><div class="stats-value">${this.player.weapon.range.toFixed(1)}</div>
                <div class="stats-label bad">Proj Spd:</div><div class="stats-value">${this.player.weapon.projectileSpeed.toFixed(1)}</div>
                
                <div class="stats-label neutral">Multishot:</div><div class="stats-value">${this.player.weapon.bulletCount}</div>
                <div class="stats-label neutral">Piercing:</div><div class="stats-value">${this.player.weapon.piercing}</div>
                
                <div class="stats-label neutral">Knockback:</div><div class="stats-value">${this.player.weapon.knockback.toFixed(1)}</div>
                <div class="stats-label neutral">Explosion:</div><div class="stats-value">${Math.round(this.player.weapon.explosion * 100)}%</div>
            </div>
        `;
        panelsRow.appendChild(playerPanel);

        // 4. Enemy Stats Panel (Next Round)
        const nextLevel = this.currentLevel + 1;
        const isBoss = nextLevel % 10 === 0;

        const enemyPanel = document.createElement('div');
        enemyPanel.className = 'stats-panel enemy';

        let enemyHtml = '';
        if (isBoss) {
            const bossHP = BossSentinel.getHP(nextLevel);
            const laserDmg = BossSentinel.getLaserDamage(nextLevel);
            const spiralDmg = BossSentinel.getSpiralDamage(nextLevel);
            const missileDmg = BossSentinel.getMissileDamage(nextLevel);

            enemyHtml = `
                <h3>⚠️ BOSS LEVEL ${nextLevel} ⚠️</h3>
                
                <div style="margin-bottom: 8px; font-size: 1.1em; font-weight: bold; border-bottom: 1px solid #440000; padding-bottom: 4px;">
                    <span style="color: #ff8888;">Health:</span> <span style="color: #fff; float: right;">${bossHP}</span>
                </div>

                <div style="margin-bottom: 5px; font-weight: bold; color: #ffaaaa; font-size: 0.9em; text-transform: uppercase;">Ability Damage:</div>
                <div class="stats-grid enemy">
                    <div style="color: #aa00ff;">Laser Sweep:</div><div class="stats-value">${laserDmg.toFixed(1)}</div>
                    <div style="color: #00ffff;">Spiral Shot:</div><div class="stats-value">${spiralDmg.toFixed(1)}</div>
                    <div style="color: #ff0000;">Meteor Rain:</div><div class="stats-value">${missileDmg.toFixed(1)}</div>
                </div>
             `;
        } else {
            const enemyHP = (10 + (nextLevel * 5)) / 2;
            const enemyDmg = 10 + (nextLevel * 2.25);
            const enemySpeed = Math.min(8.0, 4.0 + (nextLevel * 0.2));
            const enemyCount = Math.floor(7 + nextLevel * 2.1);

            // New Scaling Stats
            const projSpeed = 10.0 * (1 + nextLevel * 0.15);
            const atkCooldown = Math.max(1.0, 4.0 - (nextLevel * 0.10));

            enemyHtml = `
                <h3>NEXT ROUND: LEVEL ${nextLevel}</h3>
                <div class="stats-grid enemy">
                    <div class="stats-label">Enemy HP:</div><div class="stats-value">${enemyHP.toFixed(1)}</div>
                    <div class="stats-label">Damage:</div><div class="stats-value">${enemyDmg.toFixed(1)}</div>
                    <div class="stats-label">Speed:</div><div class="stats-value">${enemySpeed.toFixed(1)}</div>
                    <div class="stats-label">Count:</div><div class="stats-value">~${enemyCount}</div>
                    
                    <div class="stats-label bad">Proj Spd:</div><div class="stats-value">${projSpeed.toFixed(1)}</div>
                    <div class="stats-label bad">Atk CD:</div><div class="stats-value">${atkCooldown.toFixed(1)}s</div>
                    
                    <div class="stats-label neutral">Atk Range:</div><div class="stats-value">12.5</div>
                    <div class="stats-label neutral">Stop Dist:</div><div class="stats-value">10.0</div>
                </div>
            `;
        }
        enemyPanel.innerHTML = enemyHtml;
        panelsRow.appendChild(enemyPanel);


        // document.getElementById('upgrade-points').innerText = this.upgradePoints; // Removed as it's now in the header

        const labels = {
            damage: 'Damage',
            fireRate: 'Fire Rate',
            arc: 'Spread Arc', // Replaces Accuracy
            reload: 'Reload Speed',
            ammo: 'Max Ammo',
            range: 'Range',
            projectileSpeed: 'Projectile Speed (Kinetic)',
            // New Stats
            maxHealth: 'Max Health',
            armor: 'Armor',
            vampirism: 'Life Steal',
            regen: 'Regeneration',
            bulletCount: 'Multishot',
            piercing: 'Piercing',
            critChance: 'Crit Chance',
            critDamage: 'Crit Damage',
            speed: 'Speed',
            knockback: 'Knockback',
            explosion: 'Explosion',
            ricochet: 'Ricochet',
            homing: 'Tête Chercheuse',
            meleeDamage: 'Dégâts de Bâton',
            immolation: "Aura d'Immolation"
        };

        // Hide Next Level button (auto-advance instead)
        const nextLevelBtn = document.getElementById('next-level-btn');
        if (nextLevelBtn) {
            nextLevelBtn.style.display = 'none';
        }

        // Use random choices if available, otherwise fallback to full list
        const choices = this.currentUpgradeChoices && this.currentUpgradeChoices.length > 0
            ? this.currentUpgradeChoices
            : this.upgradeList;

        choices.forEach((item, index) => {
            const stat = item.id;
            const sourceObj = item.source === 'weapon' ? this.player.weapon : this.player;

            const level = sourceObj.stats[stat];
            const currentVal = sourceObj.getStatValue(stat, level);
            const nextVal = sourceObj.getStatValue(stat, level + 1);
            const maxLevel = sourceObj.getMaxLevel ? sourceObj.getMaxLevel(stat) : sourceObj.MAX_LEVEL;

            const card = document.createElement('div');

            if (animate) {
                card.className = 'upgrade-card'; // Start with opacity: 0 from CSS (no hidden class)

                // --- Slot Machine Reel ---
                const slotContainer = document.createElement('div');
                slotContainer.className = 'slot-container';
                // Add transition for smooth fade out
                slotContainer.style.transition = 'opacity 0.3s ease';

                const slotStrip = document.createElement('div');
                slotStrip.className = 'slot-strip spinning';

                // Generate random items for the reel
                const reelLength = 20;
                const reelItems = [];
                for (let i = 0; i < reelLength; i++) {
                    const randomItem = this.upgradeList[Math.floor(Math.random() * this.upgradeList.length)];
                    reelItems.push(randomItem);
                }
                // Add the ACTUAL item at the end
                reelItems.push(item);

                reelItems.forEach(reelItem => {
                    const div = document.createElement('div');
                    div.className = 'slot-item';
                    div.innerHTML = `
                        <div class="icon">${this.getIconForStat(reelItem.id)}</div>
                        <h3>${labels[reelItem.id] || reelItem.id}</h3>
                    `;
                    slotStrip.appendChild(div);
                });

                slotContainer.appendChild(slotStrip);
                card.appendChild(slotContainer);

                // Container for the final details (hidden initially)
                const detailsContainer = document.createElement('div');
                detailsContainer.className = 'card-details';

                // --- Populate Details ---
                // NEW: Add Icon to details to match the slot item
                const iconDiv = document.createElement('div');
                iconDiv.className = 'icon';
                iconDiv.innerHTML = this.getIconForStat(stat);
                detailsContainer.appendChild(iconDiv);

                // Title (Final)
                const title = document.createElement('h3');
                title.innerText = labels[stat] || stat;
                title.style.margin = '0 0 10px 0';
                detailsContainer.appendChild(title);

                // Values
                const values = document.createElement('div');
                const fmt = (n) => {
                    if (stat === 'fireRate') return (1 / n).toFixed(1) + '/s';
                    if (stat === 'arc') return n + '°'; // Degrees
                    if (stat === 'reload') return n.toFixed(1);
                    if (stat === 'armor' || stat === 'vampirism' || stat === 'critChance' || stat === 'critDamage' || stat === 'speed' || stat === 'explosion') return Math.round(n) + '%';
                    if (stat === 'homing') return 'Niv. ' + n;
                    if (stat === 'immolation') return n + ' dmg/s';
                    return n.toFixed(1);
                };
                values.innerText = `${fmt(currentVal)} -> ${fmt(nextVal)} `;
                values.style.marginBottom = '10px';
                detailsContainer.appendChild(values);

                // Progress Bar
                const progress = document.createElement('div');
                progress.className = 'progress-bar';
                for (let i = 0; i < maxLevel; i++) {
                    const seg = document.createElement('div');
                    seg.className = 'segment' + (i < level ? ' filled' : '');
                    progress.appendChild(seg);
                }
                detailsContainer.appendChild(progress);

                // Button
                const btn = document.createElement('button');
                btn.innerText = '+';
                btn.style.marginTop = '10px';
                btn.style.width = '100%';
                if (this.upgradePoints <= 0 || level >= maxLevel) {
                    btn.disabled = true;
                }

                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.upgradePoints > 0 && sourceObj.upgrade(stat)) {
                        this.upgradePoints--;
                        this.renderUpgradeUI(false); // Don't re-animate on update

                        // Ensure cursor stays visible after click
                        document.body.style.cursor = 'default';

                        // Auto-advance to next level when all upgrades are used OR no upgrades available
                        let availableUpgrades = false;
                        for (const item of this.upgradeList) {
                            const sObj = item.source === 'weapon' ? this.player.weapon : this.player;
                            const maxLvl = sObj.getMaxLevel ? sObj.getMaxLevel(item.id) : sObj.MAX_LEVEL;
                            if (sObj.stats[item.id] < maxLvl) {
                                availableUpgrades = true;
                                break;
                            }
                        }

                        if (this.upgradePoints === 0 || !availableUpgrades) {
                            setTimeout(() => {
                                if (this.onUpgradeMenuComplete) {
                                    this.onUpgradeMenuComplete();
                                } else {
                                    this.menuShown = false;
                                    this.isPaused = false;
                                    this.isRunning = true;
                                    document.getElementById('upgrade-menu').style.display = 'none';
                                    document.body.requestPointerLock();

                                    if (this.input && this.input.touchControls) {
                                        this.input.touchControls.container.style.display = 'flex';
                                    }

                                    if (!this.isMidLevelUpgrade) {
                                        this.currentLevel++;
                                        this.startNewLevel();
                                    }
                                }
                            }, 500);
                        }
                    }
                };
                detailsContainer.appendChild(btn);

                card.appendChild(detailsContainer);
                grid.appendChild(card);

                // Trigger Reveal Animation
                setTimeout(() => {
                    // Force reflow
                    void card.offsetWidth;
                    card.classList.add('revealing');

                    // Trigger Slot Spin
                    // Height of one item is 160px (matches CSS). Total items = reelLength + 1.
                    // We want to slide to the LAST item.
                    // TranslateY should be -1 * reelLength * 160px
                    const targetY = -(reelLength * 160);

                    // Add a slight delay for the spin to start after card reveal
                    setTimeout(() => {
                        slotStrip.style.transition = 'transform 2.5s cubic-bezier(0.1, 0.9, 0.2, 1.0)'; // Slower, smoother spin
                        slotStrip.style.transform = `translateY(${targetY}px)`;

                        // After spin finishes
                        setTimeout(() => {
                            slotStrip.classList.remove('spinning');

                            // Fade out slot container
                            slotContainer.style.opacity = '0';

                            // Show details (fade in handled by CSS transition)
                            detailsContainer.classList.add('visible');

                            // Remove slot container from layout after fade
                            setTimeout(() => {
                                slotContainer.style.display = 'none';
                            }, 300);

                        }, 2500); // Match transition duration
                    }, 300); // Start spin shortly after card reveal
                }, index * 200); // Stagger cards slightly more

            } else {
                // NO ANIMATION - Show Details Immediately
                card.className = 'upgrade-card visible';

                // Icon
                const iconDiv = document.createElement('div');
                iconDiv.className = 'icon';
                iconDiv.innerHTML = this.getIconForStat(stat);
                card.appendChild(iconDiv);

                // Title
                const title = document.createElement('h3');
                title.innerText = labels[stat] || stat;
                title.style.margin = '0 0 10px 0';
                card.appendChild(title);

                // Values
                const values = document.createElement('div');
                const fmt = (n) => {
                    if (stat === 'fireRate') return (1 / n).toFixed(1) + '/s';
                    if (stat === 'arc') return n + '°'; // Degrees
                    if (stat === 'reload') return n.toFixed(1);
                    if (stat === 'armor' || stat === 'vampirism' || stat === 'critChance' || stat === 'critDamage' || stat === 'speed' || stat === 'explosion') return Math.round(n) + '%';
                    return n.toFixed(1);
                };
                values.innerText = `${fmt(currentVal)} -> ${fmt(nextVal)} `;
                values.style.marginBottom = '10px';
                card.appendChild(values);

                // Progress Bar
                const progress = document.createElement('div');
                progress.className = 'progress-bar';
                for (let i = 0; i < maxLevel; i++) {
                    const seg = document.createElement('div');
                    seg.className = 'segment' + (i < level ? ' filled' : '');
                    progress.appendChild(seg);
                }
                card.appendChild(progress);

                // Button
                const btn = document.createElement('button');
                btn.innerText = '+';
                btn.style.marginTop = '10px';
                btn.style.width = '100%';

                if (this.upgradePoints <= 0 || level >= maxLevel) {
                    btn.disabled = true;
                }

                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (this.upgradePoints > 0 && sourceObj.upgrade(stat)) {
                        this.upgradePoints--;
                        this.renderUpgradeUI(false); // Don't re-animate on update

                        // Ensure cursor stays visible after click
                        document.body.style.cursor = 'default';

                        // Auto-advance to next level when all upgrades are used OR no upgrades available
                        let availableUpgrades = false;
                        for (const item of this.upgradeList) {
                            const sObj = item.source === 'weapon' ? this.player.weapon : this.player;
                            if (sObj.stats[item.id] < sObj.MAX_LEVEL) {
                                availableUpgrades = true;
                                break;
                            }
                        }

                        if (this.upgradePoints === 0 || !availableUpgrades) {
                            setTimeout(() => {
                                if (this.onUpgradeMenuComplete) {
                                    this.onUpgradeMenuComplete();
                                } else {
                                    this.menuShown = false;
                                    this.isPaused = false;
                                    this.isRunning = true;
                                    document.getElementById('upgrade-menu').style.display = 'none';
                                    document.body.requestPointerLock();

                                    if (this.input && this.input.touchControls) {
                                        this.input.touchControls.container.style.display = 'flex';
                                    }

                                    if (!this.isMidLevelUpgrade) {
                                        this.currentLevel++;
                                        this.startNewLevel();
                                    }
                                }
                            }, 500);
                        }
                    }
                };
                card.appendChild(btn);
                grid.appendChild(card);
            }
        });

        // End of renderUpgradeUI
    }

    showChestUpgradeMenu() {
        this.isRunning = false;
        this.isPaused = true;
        this.menuShown = true;
        this.isMidLevelUpgrade = true; // Treat as mid-level to avoid level increment
        this.upgradePoints = 1;

        // Select 2 random unique upgrades
        const available = this.upgradeList.filter(item => {
            const sObj = item.source === 'weapon' ? this.player.weapon : this.player;
            return sObj.stats[item.id] < sObj.MAX_LEVEL;
        });

        const options = [];
        while (options.length < 2 && available.length > 0) {
            const idx = Math.floor(Math.random() * available.length);
            options.push(available[idx]);
            available.splice(idx, 1);
        }

        this.currentUpgradeChoices = options; // Use specific list for this menu

        // Custom callback for chest upgrade
        this.onUpgradeMenuComplete = () => {
            this.menuShown = false;
            this.isPaused = false;
            this.isRunning = true;
            document.getElementById('upgrade-menu').style.display = 'none';
            document.body.requestPointerLock();
            this.currentUpgradeChoices = null; // Reset
            this.onUpgradeMenuComplete = null;
        };

        this.renderUpgradeUI(true);
        document.exitPointerLock();
        document.body.style.cursor = 'default';
        document.getElementById('upgrade-menu').style.display = 'flex';
    }

    getIconForStat(stat) {
        return SVG_ICONS[stat] || '❓';
    }

    showAltarMenu(altar) {
        this.currentAltar = altar;
        this.isPaused = true;
        this.isRunning = false;
        document.exitPointerLock();
        document.body.style.cursor = 'default';

        // Pact Definitions (Icons are now SVGs)
        const ALL_PACTS = [
            { id: 'blood', icon: SVG_ICONS.blood, title: 'Pacte de Sang', desc: 'Sacrifiez 25% de vos PV max pour augmenter de 40% vos dégâts.' },
            { id: 'armor', icon: SVG_ICONS.armor_pact, title: 'Pacte d\'Armure', desc: 'Réduisez votre vitesse de 15% pour obtenir +40 Armure.' },
            { id: 'speed', icon: SVG_ICONS.speed_pact, title: 'Pacte de Vitesse', desc: '+30% Vitesse de déplacement, mais -20% PV max.' },
            { id: 'vampire', icon: SVG_ICONS.vampire, title: 'Pacte de Vampirisme', desc: 'Vampirisme +20%, mais vous perdez 1 PV par seconde.' },
            { id: 'wizard', icon: SVG_ICONS.wizard, title: 'Pacte du Magicien', desc: '+50% Cadence de tir, mais -30% Dégâts.' },
            { id: 'greed', icon: SVG_ICONS.greed, title: 'Pacte de Cupidité', desc: '+150 Or immédiat, mais -15% Vitesse.' },
            { id: 'precision', icon: SVG_ICONS.precision, title: 'Pacte de Précision', desc: '+50% Vitesse/Portée des projectiles, mais -20 Armure.' },
            { id: 'resilience', icon: SVG_ICONS.resilience, title: 'Pacte de Résilience', desc: 'Régénération +1 PV / sec, mais -50% Dégâts.' }
        ];

        // Randomly pick 2 distinct pacts
        let p1 = ALL_PACTS[Math.floor(Math.random() * ALL_PACTS.length)];
        let p2;
        do {
            p2 = ALL_PACTS[Math.floor(Math.random() * ALL_PACTS.length)];
        } while (p1.id === p2.id);

        const gridContainer = document.getElementById('altar-grid-container');
        if (gridContainer) {
            gridContainer.innerHTML = '';
            [p1, p2].forEach(pact => {
                gridContainer.innerHTML += `
                    <div class="altar-card" id="altar-card-${pact.id}">
                        <div class="altar-card-icon">${pact.icon}</div>
                        <h3>${pact.title}</h3>
                        <p class="desc">${pact.desc}</p>
                        <button onclick="window.game.selectAltarPact('${pact.id}')">Accepter le Pacte</button>
                    </div>
                `;
            });
        }

        document.getElementById('altar-menu').style.display = 'flex';
    }

    selectAltarPact(pact) {
        if (!this.currentAltar) return;

        if (pact === 'blood') {
            this.player.pactHpMultiplier = (this.player.pactHpMultiplier || 1.0) * 0.75;
            this.player.weapon.pactDamageMultiplier = (this.player.weapon.pactDamageMultiplier || 1.0) * 1.4;
            this.hudManager.showMessage("Pacte de Sang scellé : +40% dégâts, -25% PV max !");
        } else if (pact === 'armor') {
            this.player.pactSpeedMultiplier = (this.player.pactSpeedMultiplier || 1.0) * 0.85;
            this.player.pactArmorBonus = (this.player.pactArmorBonus || 0) + 0.40;
            this.hudManager.showMessage("Pacte d'Armure scellé : +40 Armure, -15% vitesse !");
        } else if (pact === 'speed') {
            this.player.pactSpeedMultiplier = (this.player.pactSpeedMultiplier || 1.0) * 1.30;
            this.player.pactHpMultiplier = (this.player.pactHpMultiplier || 1.0) * 0.80;
            this.hudManager.showMessage("Pacte de Vitesse scellé : +30% vitesse, -20% PV max !");
        } else if (pact === 'vampire') {
            this.player.pactVampirism = (this.player.pactVampirism || 0) + 0.20;
            this.player.healthRegen = (this.player.healthRegen || 0) - 1; // Drain 1 HP per second
            this.hudManager.showMessage("Pacte de Vampirisme scellé : Vampirisme +20%, Perte de 1 PV/s !");
        } else if (pact === 'wizard') {
            this.player.weapon.pactDamageMultiplier = (this.player.weapon.pactDamageMultiplier || 1.0) * 0.7;
            this.player.weapon.pactFireRateMultiplier = (this.player.weapon.pactFireRateMultiplier || 1.0) * 1.5; // +50% fire rate
            this.hudManager.showMessage("Pacte du Magicien scellé : +50% cadence, -30% dégâts !");
        } else if (pact === 'greed') {
            this.player.gold += 150;
            this.player.pactSpeedMultiplier = (this.player.pactSpeedMultiplier || 1.0) * 0.85;
            this.hudManager.showMessage("Pacte de Cupidité scellé : +150 Or, -15% vitesse !");
        } else if (pact === 'precision') {
            this.player.weapon.pactProjectileSpeedMultiplier = (this.player.weapon.pactProjectileSpeedMultiplier || 1.0) * 1.5;
            this.player.pactArmorBonus = (this.player.pactArmorBonus || 0) - 0.20; // armor is 0..1 scale, -0.20 is -20% reduction
            this.hudManager.showMessage("Pacte de Précision scellé : Projectiles rapides, -20 Armure !");
        } else if (pact === 'resilience') {
            this.player.weapon.pactDamageMultiplier = (this.player.weapon.pactDamageMultiplier || 1.0) * 0.5;
            this.player.healthRegen = (this.player.healthRegen || 0) + 1; // 1 HP per second
            this.hudManager.showMessage("Pacte de Résilience scellé : Régénération de vie, -50% dégâts !");
        }

        this.player.recalculateStats();
        if (this.player.weapon) this.player.weapon.recalculateStats();
        
        this.player.updateHUD();
        this.closeAltarMenu();
    }

    closeAltarMenu() {
        if (this.currentAltar) {
            this.currentAltar.deactivate();
        }
        this.isPaused = false;
        this.isRunning = true;
        document.getElementById('altar-menu').style.display = 'none';
        document.body.requestPointerLock();
        this.currentAltar = null;
    }

    showShopFeedback(message, isError = false) {
        const el = document.getElementById('shop-feedback');
        if (el) {
            el.textContent = message;
            el.style.color = isError ? '#ff3333' : '#00ff00';
            el.style.textShadow = isError ? '0 0 8px rgba(255, 51, 51, 0.5)' : '0 0 8px rgba(0, 255, 0, 0.5)';
            el.style.opacity = '1';
            
            if (this.shopFeedbackTimeout) {
                clearTimeout(this.shopFeedbackTimeout);
            }
            
            this.shopFeedbackTimeout = setTimeout(() => {
                el.style.opacity = '0';
            }, 3500);
        }
    }

    showShopMenu(shop) {
        console.log("DEBUG: showShopMenu called!");
        this.currentShop = shop;
        this.isPaused = true;
        this.isRunning = false;
        document.exitPointerLock();
        document.body.style.cursor = 'default';
        
        const shopGoldDisplay = document.getElementById('shop-gold-value');
        if (shopGoldDisplay) {
            shopGoldDisplay.textContent = this.player.gold || 0;
        }

        const feedbackEl = document.getElementById('shop-feedback');
        if (feedbackEl) {
            feedbackEl.textContent = '';
            feedbackEl.style.opacity = '0';
        }

        document.getElementById('shop-menu').style.display = 'flex';
        console.log("DEBUG: shop-menu element style.display set to flex!");
    }

    buyShopItem(itemType) {
        console.log("DEBUG: buyShopItem called with type:", itemType);
        if (!this.player) {
            console.error("DEBUG: Player is not defined!");
            return;
        }
        if (!this.currentShop || this.currentShop.isDead) {
            return; // Shop is already used or invalid
        }

        const prices = {
            potion: 20,
            ammo: 15,
            shield: 25,
            upgrade: 50
        };

        const cost = prices[itemType];
        console.log("DEBUG: Player gold:", this.player.gold, "Cost:", cost);

        if (this.player.gold < cost) {
            this.showShopFeedback("Pas assez d'or pour cet achat !", true);
            return;
        }

        let success = false;

        if (itemType === 'potion') {
            if (this.player.health >= this.player.maxHealth) {
                this.showShopFeedback("Vie déjà au maximum !", true);
                return;
            }
            this.player.spendGold(cost);
            this.player.heal(50);
            this.showShopFeedback("Achat réussi : +50 PV !");
            success = true;
        } else if (itemType === 'ammo') {
            this.player.spendGold(cost);
            this.player.weapon.reserveAmmo = Math.min(400, this.player.weapon.reserveAmmo + 150);
            this.player.updateHUD();
            this.showShopFeedback("Achat réussi : +150 Munitions !");
            success = true;
        } else if (itemType === 'shield') {
            this.player.spendGold(cost);
            this.player.addShield(30);
            this.showShopFeedback("Achat réussi : +30 Bouclier !");
            success = true;
        } else if (itemType === 'upgrade') {
            const available = this.upgradeList.filter(item => {
                const sObj = item.source === 'weapon' ? this.player.weapon : this.player;
                return sObj.stats[item.id] < sObj.MAX_LEVEL;
            });

            if (available.length === 0) {
                this.showShopFeedback("Toutes les améliorations sont déjà au maximum !", true);
                return;
            }

            const randomUpgrade = available[Math.floor(Math.random() * available.length)];
            const sObj = randomUpgrade.source === 'weapon' ? this.player.weapon : this.player;
            
            if (sObj.upgrade(randomUpgrade.id)) {
                this.player.spendGold(cost);
                
                const labels = {
                    damage: 'Dégâts', fireRate: 'Cadence de tir', arc: 'Dispersion des tirs',
                    reload: 'Vitesse de rechargement', ammo: 'Munitions max', range: 'Portée',
                    projectileSpeed: 'Vitesse des projectiles', maxHealth: 'Points de vie max',
                    armor: 'Armure', vampirism: 'Vol de vie', regen: 'Régénération de vie',
                    bulletCount: 'Tir multiple', piercing: 'Transpercement', critChance: 'Chances de critique',
                    critDamage: 'Dégâts des critiques', speed: 'Vitesse', knockback: 'Recul', explosion: 'Explosions'
                };
                const upgradeName = labels[randomUpgrade.id] || randomUpgrade.id;
                this.showShopFeedback(`Achat réussi : Amélioration obtenue ➔ +1 ${upgradeName} !`);
                success = true;
            } else {
                this.showShopFeedback("Erreur lors de l'application de l'amélioration.", true);
            }
        }

        // Always update gold display inside shop UI
        const shopGoldDisplay = document.getElementById('shop-gold-value');
        if (shopGoldDisplay) {
            shopGoldDisplay.textContent = this.player.gold || 0;
        }
    }

    closeShopMenu() {
        console.log("DEBUG: closeShopMenu called!");
        this.isPaused = false;
        this.isRunning = true;
        document.getElementById('shop-menu').style.display = 'none';
        document.body.requestPointerLock();
        
        if (this.currentShop) {
            this.currentShop.disable();
            this.currentShop = null;
        }
    }
}
