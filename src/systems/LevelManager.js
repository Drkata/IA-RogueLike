import * as THREE from 'three';
import { CONSTANTS } from '../core/Constants.js';
import { MapGenerator } from './MapGenerator.js';
import { TextureGenerator } from './TextureGenerator.js';
import { ThemeManager } from './themes/ThemeManager.js';

export class LevelManager {
    constructor(scene) {
        this.scene = scene;
        this.width = 0;
        this.height = 0;
        this.data = [];
        this.cellSize = CONSTANTS.CELL_SIZE;
        this.levelData = null;
        this.levelMeshGroup = new THREE.Group();
        this.scene.add(this.levelMeshGroup);
        this.currentTheme = 0;
        this.currentLevelIndex = 1;
        this.decorationPositions = []; // Track decoration positions
        this.skyStructures = []; // Bounding boxes for sky platforms
        this.themeManager = new ThemeManager();
    }



    generateLevel(width, height, levelIndex = 1) {
        this.currentLevelIndex = levelIndex;
        this.currentTheme = (levelIndex - 1) % 3; // Cycle 3 themes
        const generator = new MapGenerator(width, height);

        let levelData;
        if (levelIndex % 10 === 0) {
            levelData = generator.generateArena();
        } else {
            levelData = generator.generate();
        }

        this.loadLevelData(levelData);

        // Generate Chest Positions (using the dedicated treasure spawn room)
        this.chestPositions = [];
        if (levelIndex % 10 !== 0 && levelData.treasureSpawn) {
            this.chestPositions.push(levelData.treasureSpawn);
        }

        return levelData.playerStart;
    }

    loadLevelData(levelData) {
        this.levelData = levelData;
        this.width = levelData.width;
        this.height = levelData.height;
        this.data = levelData.data;
        this.cellSize = levelData.cellSize || CONSTANTS.CELL_SIZE;
        this.buildLevel();
    }

    getThemeMaterials() {
        // Get theme data
        const theme = this.themeManager.getTheme(this.currentLevelIndex);
        const wallColors = theme.wallColors;
        const floorColor = theme.floorColor;
        const wallTextureType = theme.wallTextureType || 'bricks';
        const floorTextureType = theme.floorTextureType || 'grid';

        // Create wall materials with variations
        const wallMaterials = wallColors.map(color => {
            const colorHex = '#' + color.toString(16).padStart(6, '0');
            let tex;

            // Use appropriate texture type
            if (wallTextureType === 'bricks') {
                tex = TextureGenerator.createBricksTexture(colorHex);
            } else if (wallTextureType === 'noise') {
                tex = TextureGenerator.createNoiseTexture(colorHex);
            } else if (wallTextureType === 'panel') {
                const accentColor = '#' + theme.pointLightColor.toString(16).padStart(6, '0');
                tex = TextureGenerator.createPanelTexture(colorHex, accentColor);
            } else if (wallTextureType === 'circuit') {
                const accentColor = '#' + theme.pointLightColor.toString(16).padStart(6, '0');
                tex = TextureGenerator.createCircuitTexture(colorHex, accentColor);
            } else { // grid
                const color2Hex = '#' + (color + 0x222222).toString(16).padStart(6, '0');
                tex = TextureGenerator.createGridTexture(colorHex, color2Hex);
            }

            return new THREE.MeshStandardMaterial({
                map: tex,
                roughness: 0.7,
                metalness: 0.3
            });
        });

        // Create floor material
        const floorColorHex = '#' + floorColor.toString(16).padStart(6, '0');
        let floorTex;

        if (floorTextureType === 'hexagon') {
            const accentColor = '#' + theme.pointLightColor.toString(16).padStart(6, '0');
            floorTex = TextureGenerator.createHexagonTexture(floorColorHex, accentColor);
        } else if (floorTextureType === 'metal_floor') {
            floorTex = TextureGenerator.createMetalFloorTexture(floorColorHex);
        } else if (floorTextureType === 'slime') {
            floorTex = TextureGenerator.createSlimeTexture(floorColorHex, '#33ff33');
        } else if (floorTextureType === 'lava') {
            floorTex = TextureGenerator.createLavaTexture(floorColorHex, '#ff4400');
        } else {
            const floorColor2Hex = '#' + (floorColor + 0x111111).toString(16).padStart(6, '0');
            floorTex = TextureGenerator.createGridTexture(floorColorHex, floorColor2Hex);
        }

        return {
            walls: wallMaterials, // Array of materials for variation
            floor: new THREE.MeshStandardMaterial({
                map: floorTex,
                roughness: 0.8,
                metalness: 0.2
            })
        };
    }

    buildLevel() {
        // Clear previous level
        this.levelMeshGroup.clear();
        this.skyStructures = [];

        const mats = this.getThemeMaterials();
        const wallGeo = new THREE.BoxGeometry(this.cellSize, CONSTANTS.WALL_HEIGHT, this.cellSize);

        // Prepare instance data
        const wallInstances = mats.walls.map(() => []);
        const eventWallMatrices = [];
        const treasureWallMatrices = [];

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const index = y * this.width + x;
                if (this.data[index] === 1) {
                    const posX = x * this.cellSize + this.cellSize / 2;
                    const posY = CONSTANTS.WALL_HEIGHT / 2;
                    const posZ = y * this.cellSize + this.cellSize / 2;

                    const dummy = new THREE.Object3D();
                    dummy.position.set(posX, posY, posZ);
                    dummy.updateMatrix();

                    const roomType = this.getRoomTypeForWall(x, y);
                    if (roomType === 'event') {
                        eventWallMatrices.push(dummy.matrix.clone());
                    } else if (roomType === 'treasure') {
                        treasureWallMatrices.push(dummy.matrix.clone());
                    } else {
                        const matIndex = Math.floor(Math.random() * mats.walls.length);
                        wallInstances[matIndex].push(dummy.matrix.clone());
                    }
                }
            }
        }

        // Create standard InstancedMeshes
        wallInstances.forEach((matrices, i) => {
            if (matrices.length === 0) return;

            const mesh = new THREE.InstancedMesh(wallGeo, mats.walls[i], matrices.length);

            for (let j = 0; j < matrices.length; j++) {
                mesh.setMatrixAt(j, matrices[j]);
            }

            mesh.instanceMatrix.needsUpdate = true;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.levelMeshGroup.add(mesh);
        });

        // Create Event Room InstancedMesh (glowing purple obsidian walls)
        if (eventWallMatrices.length > 0) {
            const eventWallMat = new THREE.MeshStandardMaterial({
                color: 0x180c26, // Very dark purple
                emissive: 0x8a2be2, // Purple glow
                emissiveIntensity: 0.25,
                roughness: 0.3,
                metalness: 0.8
            });
            const eventMesh = new THREE.InstancedMesh(wallGeo, eventWallMat, eventWallMatrices.length);
            for (let j = 0; j < eventWallMatrices.length; j++) {
                eventMesh.setMatrixAt(j, eventWallMatrices[j]);
            }
            eventMesh.instanceMatrix.needsUpdate = true;
            eventMesh.castShadow = true;
            eventMesh.receiveShadow = true;
            this.levelMeshGroup.add(eventMesh);
        }

        // Create Treasure Room InstancedMesh (glimmering golden brass walls)
        if (treasureWallMatrices.length > 0) {
            const treasureWallMat = new THREE.MeshStandardMaterial({
                color: 0x3d290d, // Golden brown
                emissive: 0xd4af37, // Gold glow
                emissiveIntensity: 0.2,
                roughness: 0.2,
                metalness: 0.9
            });
            const treasureMesh = new THREE.InstancedMesh(wallGeo, treasureWallMat, treasureWallMatrices.length);
            for (let j = 0; j < treasureWallMatrices.length; j++) {
                treasureMesh.setMatrixAt(j, treasureWallMatrices[j]);
            }
            treasureMesh.instanceMatrix.needsUpdate = true;
            treasureMesh.castShadow = true;
            treasureMesh.receiveShadow = true;
            this.levelMeshGroup.add(treasureMesh);
        }

        // Floor
        const floorGeo = new THREE.PlaneGeometry(this.width * this.cellSize, this.height * this.cellSize);
        const floor = new THREE.Mesh(floorGeo, mats.floor);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(
            (this.width * this.cellSize) / 2 - this.cellSize / 2,
            0,
            (this.height * this.cellSize) / 2 - this.cellSize / 2
        );
        floor.receiveShadow = true;
        this.levelMeshGroup.add(floor);

        // Skybox
        this.createSkybox();

        // Decorations
        if (this.levelData.rooms) {
            this.addDecorations(this.levelData.rooms, this.levelData.playerStart);
        }

        // Spawn Floating Sky Structures in rooms
        if (this.levelData.rooms) {
            const theme = this.themeManager.getTheme(this.currentLevelIndex);
            const capColor = theme.floorColor;

            const capMat = new THREE.MeshStandardMaterial({
                color: capColor,
                roughness: 0.8,
                metalness: 0.1
            });

            const stoneMat = new THREE.MeshStandardMaterial({
                color: 0x2b2e33, // Slate grey rock
                roughness: 0.9,
                metalness: 0.15
            });

            const vineMat = new THREE.MeshStandardMaterial({
                color: this.currentTheme === 3 ? 0x8b0000 : 0x2e8b57, // Crimson for Demonic, Forest Green for others
                roughness: 0.9,
                metalness: 0.1
            });
            
            const runeMat = new THREE.MeshStandardMaterial({
                color: 0x051a24,
                emissive: this.currentTheme === 1 ? 0x9400d3 : 0x00dfff, // Purple or Cyan glow
                emissiveIntensity: 1.8,
                roughness: 0.2,
                metalness: 0.9
            });

            const mapW = this.width * this.cellSize;
            const mapH = this.height * this.cellSize;

            // Spawn 60 to 90 floating islands across the expanded map surface (including the outer sky)
            const totalIslands = 60 + Math.floor(Math.random() * 30);
            for (let k = 0; k < totalIslands; k++) {
                const blockW = 2.0 + Math.random() * 4.0;
                const blockH = 1.0 + Math.random() * 2.0;
                const blockD = 2.0 + Math.random() * 4.0;

                // Spawns with +100% margin around the map boundaries
                const posX = -mapW / 2 + Math.random() * (mapW * 2);
                const posZ = -mapH / 2 + Math.random() * (mapH * 2);
                const posY = 8.0 + Math.random() * 32.0;

                    // Create group for the entire sky structure
                    const structureGroup = new THREE.Group();
                    structureGroup.position.set(posX, posY, posZ);

                    // 1. Central Platform (The rocky base)
                    const blockGeo = new THREE.BoxGeometry(blockW, blockH, blockD);
                    const mainMesh = new THREE.Mesh(blockGeo, stoneMat);
                    mainMesh.castShadow = true;
                    mainMesh.receiveShadow = true;
                    structureGroup.add(mainMesh);

                    // 2. Top Grass/Cobblestone Cap (Matching the map style)
                    const capGeo = new THREE.BoxGeometry(blockW + 0.1, 0.15, blockD + 0.1);
                    const capMesh = new THREE.Mesh(capGeo, capMat);
                    capMesh.position.y = blockH / 2 + 0.055;
                    capMesh.castShadow = true;
                    capMesh.receiveShadow = true;
                    structureGroup.add(capMesh);

                    // 3. Tapered Rocky Underside (Cone/Pyramid underneath to form the floating island V-shape)
                    const undersideW = blockW * 0.7;
                    const undersideD = blockD * 0.7;
                    const undersideH = blockH * 1.5;
                    
                    const coneGeo = new THREE.ConeGeometry((undersideW + undersideD) / 4, undersideH, 4);
                    const coneMesh = new THREE.Mesh(coneGeo, stoneMat);
                    coneMesh.rotation.x = Math.PI;
                    coneMesh.position.y = -(blockH / 2 + undersideH / 2);
                    coneMesh.castShadow = true;
                    coneMesh.receiveShadow = true;
                    structureGroup.add(coneMesh);

                    // Add 1-2 smaller auxiliary cones underneath for jagged realism
                    const subConesCount = 1 + Math.floor(Math.random() * 2);
                    for (let sc = 0; sc < subConesCount; sc++) {
                        const scR = (blockW + blockD) * 0.15;
                        const scH = undersideH * (0.5 + Math.random() * 0.5);
                        const scGeo = new THREE.ConeGeometry(scR, scH, 4);
                        const scMesh = new THREE.Mesh(scGeo, stoneMat);
                        scMesh.rotation.x = Math.PI;
                        
                        scMesh.position.set(
                            (Math.random() - 0.5) * blockW * 0.4,
                            -(blockH / 2 + scH / 2),
                            (Math.random() - 0.5) * blockD * 0.4
                        );
                        scMesh.castShadow = true;
                        scMesh.receiveShadow = true;
                        structureGroup.add(scMesh);
                    }

                    // 4. Satellite Floating Rocks (small debris orbiting)
                    const shardCount = 1 + Math.floor(Math.random() * 2);
                    for (let s = 0; s < shardCount; s++) {
                        const sw = blockW * (0.25 + Math.random() * 0.2);
                        const sh = blockH * (0.3 + Math.random() * 0.3);
                        const sd = blockD * (0.25 + Math.random() * 0.2);

                        const shardGeo = new THREE.BoxGeometry(sw, sh, sd);
                        const shard = new THREE.Mesh(shardGeo, stoneMat);
                        
                        const shardCapGeo = new THREE.BoxGeometry(sw + 0.05, 0.05, sd + 0.05);
                        const shardCap = new THREE.Mesh(shardCapGeo, capMat);
                        shardCap.position.y = sh / 2 + 0.02;
                        shard.add(shardCap);

                        const angle = Math.random() * Math.PI * 2;
                        const dist = (blockW + blockD) / 4 + 0.5 + Math.random() * 0.5;
                        shard.position.set(
                            Math.sin(angle) * dist,
                            (Math.random() - 0.5) * 0.5,
                            Math.cos(angle) * dist
                        );
                        shard.rotation.set(
                            (Math.random() - 0.5) * 0.5,
                            (Math.random() - 0.5) * 0.5,
                            (Math.random() - 0.5) * 0.5
                        );
                        shard.castShadow = true;
                        shard.receiveShadow = true;
                        structureGroup.add(shard);
                    }

                    // 5. Hanging Vines/Roots from the sides
                    const vineCount = 3 + Math.floor(Math.random() * 4);
                    for (let v = 0; v < vineCount; v++) {
                        const vineH = 0.5 + Math.random() * 1.5;
                        const vineGeo = new THREE.CylinderGeometry(0.03, 0.015, vineH, 4);
                        const vine = new THREE.Mesh(vineGeo, vineMat);
                        
                        const edgeAngle = Math.random() * Math.PI * 2;
                        const edgeX = Math.sin(edgeAngle) * (blockW / 2 + 0.05);
                        const edgeZ = Math.cos(edgeAngle) * (blockD / 2 + 0.05);
                        
                        vine.position.set(edgeX, -vineH / 2, edgeZ);
                        vine.rotation.z = (Math.random() - 0.5) * 0.3;
                        vine.rotation.x = (Math.random() - 0.5) * 0.3;
                        
                        vine.castShadow = true;
                        structureGroup.add(vine);
                    }

                    // 6. Glowing Magical Core (Crystal powering the island)
                    const coreGeo = new THREE.OctahedronGeometry(0.18 + Math.random() * 0.08, 0);
                    const core = new THREE.Mesh(coreGeo, runeMat);
                    core.position.set(0, blockH / 2 + 0.2, 0);
                    core.rotation.y = Math.random() * Math.PI;
                    structureGroup.add(core);

                    // 7. Glowing Runic Engravings
                    const sideRunesCount = 2 + Math.floor(Math.random() * 2);
                    for (let r = 0; r < sideRunesCount; r++) {
                        const runeGeo = new THREE.BoxGeometry(0.04, blockH * 0.5, 0.015);
                        const rune = new THREE.Mesh(runeGeo, runeMat);
                        
                        const face = Math.floor(Math.random() * 4);
                        if (face === 0) {
                            rune.position.set((Math.random() - 0.5) * blockW * 0.6, 0, blockD / 2 + 0.01);
                        } else if (face === 1) {
                            rune.position.set((Math.random() - 0.5) * blockW * 0.6, 0, -blockD / 2 - 0.01);
                        } else if (face === 2) {
                            rune.position.set(blockW / 2 + 0.01, 0, (Math.random() - 0.5) * blockD * 0.6);
                            rune.rotation.y = Math.PI / 2;
                        } else {
                            rune.position.set(-blockW / 2 - 0.01, 0, (Math.random() - 0.5) * blockD * 0.6);
                            rune.rotation.y = Math.PI / 2;
                        }
                        structureGroup.add(rune);
                    }

                    this.levelMeshGroup.add(structureGroup);

                    // Physical Bounding Box
                    const box = new THREE.Box3().setFromObject(structureGroup);
                    this.skyStructures.push(box);
            }
        }
    }

    createSkybox() {
        const skyGeo = new THREE.SphereGeometry(500, 32, 32);

        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        const themeName = this.themeManager.getThemeName(this.currentLevelIndex);
        let topColor, bottomColor;

        if (themeName === 'Enchanted Forest') {
            topColor = '#4a90e2'; // Bright Blue Sky
            bottomColor = '#87ceeb'; // Light Blue Horizon
        } else if (themeName === 'Medieval City') {
            topColor = '#1a2a6c'; // Deep Blue
            bottomColor = '#b21f1f'; // Sunset Red
        } else if (themeName === 'Deep Cave') {
            topColor = '#000000';
            bottomColor = '#050510'; // Very dark fog
        } else { // Demonic Base
            topColor = '#110000';
            bottomColor = '#220505'; // Hellish Red
        }

        // Base gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, 1024);
        gradient.addColorStop(0, topColor);
        gradient.addColorStop(1, bottomColor);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1024, 1024);

        // Theme-specific effects
        if (themeName === 'Enchanted Forest') {
            // Clouds
            for (let i = 0; i < 20; i++) {
                const x = Math.random() * 1024;
                const y = Math.random() * 400; // Upper sky
                const size = 50 + Math.random() * 100;

                const cloudGrad = ctx.createRadialGradient(x, y, 0, x, y, size);
                cloudGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
                cloudGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = cloudGrad;
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }

            // Pollen / Magic motes
            ctx.fillStyle = '#ffffaa';
            for (let i = 0; i < 200; i++) {
                const x = Math.random() * 1024;
                const y = Math.random() * 1024;
                const size = Math.random() * 2;
                ctx.globalAlpha = Math.random() * 0.5 + 0.5;
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }

        } else if (themeName === 'Medieval City') {
            // Sunset / Stars mixing
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < 100; i++) {
                const x = Math.random() * 1024;
                const y = Math.random() * 400; // Top only
                const size = Math.random();
                ctx.globalAlpha = Math.random();
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }

        } else if (themeName === 'Deep Cave') {
            // Stalactites silhouettes? Or just darkness
            // Maybe glowing crystals on ceiling
            for (let i = 0; i < 50; i++) {
                const x = Math.random() * 1024;
                const y = Math.random() * 1024;
                const size = Math.random() * 3;

                // Purple/Blue glow
                const glowColor = Math.random() > 0.5 ? 'rgba(100, 100, 255, 0.5)' : 'rgba(200, 50, 255, 0.5)';
                ctx.fillStyle = glowColor;
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }

        } else { // Demonic Base
            // Red Haze/Ash
            for (let i = 0; i < 40; i++) {
                const x = Math.random() * 1024;
                const y = Math.random() * 1024;
                const size = 80 + Math.random() * 150;

                const ashGrad = ctx.createRadialGradient(x, y, 0, x, y, size);
                ashGrad.addColorStop(0, 'rgba(100, 20, 0, 0.2)');
                ashGrad.addColorStop(1, 'rgba(100, 20, 0, 0)');
                ctx.fillStyle = ashGrad;
                ctx.fillRect(x - size, y - size, size * 2, size * 2);
            }

            // Embers
            ctx.fillStyle = '#ffaa00';
            for (let i = 0; i < 300; i++) {
                const x = Math.random() * 1024;
                const y = Math.random() * 1024;
                const size = Math.random() * 2;
                ctx.globalAlpha = Math.random();
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;

        const skyTexture = new THREE.CanvasTexture(canvas);
        const skyMat = new THREE.MeshBasicMaterial({
            map: skyTexture,
            side: THREE.BackSide,
            fog: false // Sky shouldn't be affected by fog
        });

        const sky = new THREE.Mesh(skyGeo, skyMat);
        sky.position.set(
            (this.width * this.cellSize) / 2,
            0,
            (this.height * this.cellSize) / 2
        );
        this.levelMeshGroup.add(sky);
    }

    addDecorations(rooms, startPos) {
        this.decorationPositions = []; // Reset decoration tracking

        rooms.forEach(room => {
            // Get themed decorations for this room
            const roomDecorations = this.themeManager.generateRoomDecorations(
                room,
                startPos,
                this.currentLevelIndex
            );

            // Spawn each decoration
            // Spawn each decoration - DISABLED per user request
            // (Code removed during cleanup)

            // Add themed point light in center of some rooms
            if (Math.random() < 0.4) {
                const cx = Math.floor(room.x + room.w / 2);
                const cz = Math.floor(room.z + room.h / 2);

                const lightColor = this.themeManager.getPointLightColor(this.currentLevelIndex);
                const light = new THREE.PointLight(lightColor, 1, 10);
                light.position.set(
                    cx * this.cellSize + this.cellSize / 2,
                    2,
                    cz * this.cellSize + this.cellSize / 2
                );
                this.levelMeshGroup.add(light);
            }
        });
    }

    addMeshAt(geo, mat, x, z, y) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
            x * this.cellSize + this.cellSize / 2,
            y,
            z * this.cellSize + this.cellSize / 2
        );
        this.levelMeshGroup.add(mesh);
    }

    isWall(x, z) {
        const gridX = Math.floor(x / this.cellSize);
        const gridZ = Math.floor(z / this.cellSize);

        if (gridX < 0 || gridX >= this.width || gridZ < 0 || gridZ >= this.height) {
            return true; // Out of bounds = wall
        }

        const index = gridZ * this.width + gridX;
        return this.data[index] === 1;
    }

    getRandomEmptyPosition() {
        let attempts = 0;
        while (attempts < 100) {
            attempts++;
            const x = Math.floor(Math.random() * this.width);
            const z = Math.floor(Math.random() * this.height);
            const index = z * this.width + x;

            if (this.data[index] === 0) {
                return { x, z };
            }
        }
        return null;
    }

    isDecoration(x, z) {
        const gridX = Math.floor(x / this.cellSize);
        const gridZ = Math.floor(z / this.cellSize);

        for (const deco of this.decorationPositions) {
            if (deco.x === gridX && deco.z === gridZ) {
                return true;
            }
        }
        return false;
    }

    getRoomTypeForWall(x, z) {
        if (!this.levelData || !this.levelData.rooms) return null;

        // Check 8 neighbors for adjacent floor cells of special rooms
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const nz = z + dz;
                if (nx >= 0 && nx < this.width && nz >= 0 && nz < this.height) {
                    const idx = nz * this.width + nx;
                    if (this.data[idx] === 0) {
                        for (const room of this.levelData.rooms) {
                            if (nx >= room.x && nx < room.x + room.w &&
                                nz >= room.z && nz < room.z + room.h) {
                                if (room.type === 'event' || room.type === 'treasure') {
                                    return room.type;
                                }
                            }
                        }
                    }
                }
            }
        }
        return null;
    }
}
